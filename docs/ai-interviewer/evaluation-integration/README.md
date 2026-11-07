# LLM report evaluation integration

This layer integrates asynchronous cloud-compatible evaluation with the existing Phase 4 report worker. Verification uses synthetic providers only. Real inference is default-off. No production START, Live Voice E2E, local model, Ollama, automatic hiring decision or distributed deployment is activated.

## Data and authority

Only an authorized HR/staff request can create a versioned report input. `InterviewReportService.frozenInput` reads the committed domain final-answer/question events up to the frozen completion boundary and the server-approved rubric/criteria/weights. Partial transcripts are stripped. Candidates cannot supply the input, inputHash, provider selection, report, citations or completion. Their only input is their committed answer text, which remains untrusted data for prompting.

The new evaluator version is `llm-report-v1`. Its input adds `provider` with format `llm-report-provider-v1`, provider/model/profile/timeout/attempt cap. These nonsecret settings are included in the canonical inputHash. Existing mock input bytes and hashes do not change. The original frozen `phase2-mock-v1`/`mock-v1` fields describe the preserved source interview configuration; they are not relabelled as real evaluation. The report carries its separate evaluator version, mode and modelAssessment provenance.

Report modes:

- MOCK: unchanged original adapter and versions.
- LLM_SYNTHETIC: the new integration using deterministic fixture selections, no real model.
- LLM: reserved for actual cloud adapter execution with valid dedicated server configuration. No real execution was tested here.

The existing `phase4-report-v1` SQL envelope remains, with a backwards-compatible extended schema and an explicitly distinct evaluator/response/provenance version. There is no new table or migration.

## Model output and evidence verification

The closed `evidence-rubric-selection-v1` contract allows exactly one entry per frozen criterion:

- `criterionKey`;
- `anchor`: null, or `{dimension, score: integer 0..4, text: exact frozen rubric anchor}`;
- `citations`: exact `{eventSequence, startOffset, endOffset, quote}` spans.

Null anchor requires empty citations and produces NOT_ASSESSED with null score. A proposed score requires eligible evidence for the same criterion and chosen rubric dimension. Evidence must belong to the exact committed question/turn, be final/certain with completed question delivery, contain non-whitespace text, and match the unnormalized UTF-16 substring at valid boundaries. Invented sequences/quotes/IDs, blank spans, duplicate spans, split surrogate pairs, wrong dimensions/anchors, out-of-range/unanchored scores and extra authority/prose fields fail closed. Missing, partial, uncertain, interrupted or unsupported fixture evidence never automatically becomes zero. The synthetic adapter abstains when its fixture support crosses dimensions rather than inventing an aggregate anchor.

Question/turn/evidence IDs, criterion labels, rationale, coverage, limitations, identity, inputHash and report metadata are assembled by the server. Arbitrary model summaries, strengths, concerns, hiring outcomes and aggregate scores are not accepted. Strengths/concerns are empty; each criterion's narrative names the proposed frozen anchor and verified source evidence. One dimension is proposed per criterion; uncited questions produce partial coverage. No numeric overall score or hiring/rejection decision exists.

`verifyInterviewReport` independently reconstructs the complete provider report from its stored selection and the original frozen input, then retains all existing source/identity/coverage checks. A provider cannot mutate a final report score/narrative/provenance and keep a valid report. It receives a cloned input with no repository/service/principal capability. Tests compare committed answers, original frozen inputs and all domain-event rows before/after evaluation.

Exact citation matching verifies provenance, not whether a model's subjective anchor choice is semantically correct. Proposed scores remain explicit model judgments requiring HR review. A valid quote does not prove an allegation or competence rating. Semantic accuracy, relevance, multilingual fairness/calibration and adversarial real-model behavior need independent real-world validation. The implementation deliberately accepts no free-form factual conclusions that a quote checker cannot establish.

## Registration, execution and recovery

The server entry point registers one evaluator and passes the same report service to authenticated routes, maintenance and shutdown. Registration makes no request. Mock-version jobs always use the original mock adapter, including when provider evaluation is configured. New provider evaluation is explicitly requested as `evaluatorVersion: "llm-report-v1"`; the HR UI chooses this available registered capability when running a new report. `availableEvaluatorVersion` means configured capability, not verified provider health.

Existing endpoints stay under `/api/recruitment/applications/:applicationId/ai-interviews/:interviewId/evaluation`:

- GET reads authorized report versions and source trace.
- POST RUN/RETRY/REEVALUATE uses a stable commandId and expectedVersion. Include llm-report-v1 for an explicit provider RUN. A new report version preserves all prior reports/reviews.
- POST `/:reportVersion/review` records human review independently of recruitment decisions.

Provider I/O stays outside row locks and timer maintenance. Existing execution infrastructure supplies two physical evaluator slots, cancellation, logical timeout, durable owner/execution UUID/deadline/inputHash and stale-result fencing. An uncancellable timeout keeps its physical slot until settlement/restart. No hidden SDK retry occurs. Provider retries are explicit HR RETRY commands, reuse the same frozen input/version and are capped at 1–3 total attempts, default 2. Restart recovery consumes the remaining budget with a new owner/token. Exhaustion requires an intentional new report version or operator action; it cannot reset the budget through a new retry command ID.

A disabled or changed frozen provider configuration fails safely with no mock fallback or provider invocation. Key rotation alone does not change the nonsecret snapshot. Successful request receipts survive response loss; concurrent workers cannot run one report twice. Attempt completion checks hash/token/owner/deadline again. Failure/cancellation/timeout does not publish a report or alter answers/history; result transactions and audit updates are atomic. Shutdown closes admission and cancels active work; pending durable jobs can be recovered by a new owner.

The scope remains one process and runtime owner. Physical admission/rates are process-local; CPU work cannot be preempted; indefinitely hung I/O may require restart. No distributed runtime guarantee is introduced.

## Exact dedicated server configuration

| Variable | Default / validation |
|---|---|
| AI_INTERVIEW_EVALUATION_ENABLED | false; explicit true required |
| AI_INTERVIEW_EVALUATION_PROVIDER | disabled; synthetic or openai |
| AI_INTERVIEW_EVALUATION_MODEL | No default; explicit account-compatible model required for openai; 1–100 alphanumeric/`.`/`_`/`:`/`-` characters, starting alphanumeric |
| AI_INTERVIEW_EVALUATION_API_KEY | Required for openai; dedicated server key, 16–512 non-whitespace ASCII characters |
| AI_INTERVIEW_EVALUATION_BASE_URL | Only https://api.openai.com/v1; arbitrary endpoints rejected |
| AI_INTERVIEW_EVALUATION_TIMEOUT_MS | 15000; integer 1–15000 |
| AI_INTERVIEW_EVALUATION_MAX_ATTEMPTS | 2; integer 1–3 |

No fallback to OPENAI_API_KEY, interview LLM keys or speech keys. Invalid/missing real configuration, enabled+disabled selection and synthetic selection in production fail closed without values printed. The key lives in a server-only closure and is omitted from serializable configuration, frozen input, reports, logs and browser bundles. Do not set a VITE credential.

Keyless development uses NODE_ENV=development/test, ENABLED=true and PROVIDER=synthetic under the dedicated prefix. Synthetic output uses explicit existing multilingual mock anchors; arbitrary unknown answers remain NOT_ASSESSED. This preserves deterministic fixtures without pretending to validate a real model.

The installed OpenAI SDK uses pinned POST `/v1/chat/completions`, separate fixed system instructions and JSON data, strict JSON-schema response, no tools, store:false, logging off, redirects rejected, SDK maxRetries:0 and max_completion_tokens:8192. Eligible server-final answers/questions and approved rubric/criterion labels are the only model data; interview/staff/candidate identity records, session credentials and report execution identity are not sent. Input JSON <=192,000 bytes and response body <=256,000 bytes; refusal, tools, non-stop finish, malformed JSON/MIME, oversized output and invalid evidence fail safely. No silent truncation/summarization is implemented.

The wire contract follows the [official Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Actual model/account support and behavior are not established by injected SDK tests.

## Future activation and remaining gaps

Obtain approved account/key/model and deploy only dedicated server settings through the secret service. Confirm model support for the endpoint, strict schema and token parameter. Review consent/privacy and approved use of candidate text/rubrics before enabling calls. Validate authenticated real provider health, refusals, quotas, cancellation, byte limits, latency and retry/restart behavior in an isolated nonproduction environment. Configuration presence and UI availability are not health/readiness.

Validate rating relevance, insufficient-evidence abstention, languages, fairness, prompt injection and human review with real model responses. Repeat quote/UTF-16/rubric tampering, duplicate/retry/restart, stale owner/hash/configuration, SQL rollback, candidate/staff isolation, report RBAC and answer/history invariance checks. No factual/semantic truth oracle or automatic hiring decision is supplied.

Keep pgvector/full untouched migration-chain validation and Live Voice E2E open. The full trusted production START/resume/worker/playback/STOP composition, real STT/TTS/model acoustic behavior and complete microphone-to-report acceptance remain unvalidated. No production readiness is inferred from these synthetic results.

## Reproduce

Use a new evidence run ID with `run.mjs RUN init` then `run.mjs RUN all`. The 49-command inventory records exact executables/arguments, sanitized isolated environment, timings, exit codes, raw browser assertions and network counters. Disposable loopback PostgreSQL 55442 and native Chrome are required. The exact migration probe remains separately BLOCKED while pgvector is absent. Existing suite outputs are redirected only into this new package.

After completed tests: `run.mjs RUN integrity`, `cleanup.mjs RUN`, `evidence.mjs RUN` then read-only `verify.mjs RUN`. Never overwrite accepted runs or run the scaffold generators during a frozen-source run. Node socket/fetch and application browser-page requests are guarded; native Chrome background traffic is not independently packet-captured. Public documentation reads are not inference calls.
