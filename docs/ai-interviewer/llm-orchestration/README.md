# Asynchronous interview LLM orchestration

Implementation is enabled explicitly and tested with synthetic responses only. It does not activate production START, real evaluation, a local model or a live voice interview. Accepted evidence is read-only. Final results are in `runs/final-20261105/REPORT.md` and the corresponding machine-readable summary.

## Authority and integration

The registered `InterviewLlmProvider.generate(input, signal)` is asynchronous and returns untrusted data. Provider I/O runs outside PostgreSQL transactions and outside the interview timer loop. `InterviewService` alone validates and applies its result in a locked transaction.

There are two contracts:

1. PLAN rewrites the draft base/follow-up/clarification text before READY. The exact existing question/prompt IDs and sets must survive. A successful response becomes a quarantined PROPOSED job, never candidate-visible text. A recruitment-authorized staff member separately approves it at the expected version. The engine's CREATED-only `REVISE_QUESTION_TEXT` changes text without changing order, criteria, caps or timing. Normal READY then freezes the plan.
2. DECISION runs after durable answer commit. Its entire authority is selecting one of the server-supplied NEXT_QUESTION, FOLLOW_UP or CLARIFICATION choices. Follow-up/clarification choices reference IDs from the frozen HR-approved catalog; arbitrary new live wording is not accepted. The existing engine applies PROCESS_ANSWER and enforces progression, turn caps and timers. Existing mock evaluation remains unchanged.

The staff draft generation/review workflow is currently API-only; the existing manual plan UI and mock flows remain available. These APIs do not let a caller select credentials/provider/model or submit a model completion:

| Operation | Route/body |
|---|---|
| Request draft proposal | POST `/api/recruitment/applications/:applicationId/ai-interviews/:interviewId/generation`, `{commandId, expectedVersion}` |
| Read proposal/job | GET the same route; staff authorization and application binding required |
| Approve proposal | POST same route + `/approve`, `{jobId, commandId, expectedVersion}` |
| Bounded retry/cancel | POST same route + `/control`, `{jobId, commandId, expectedVersion, operation: "RETRY" or "CANCEL"}` |
| Candidate status | GET `/api/ai-interview/orchestration/status?interviewId=...`; only IDLE/PROCESSING/RETRYING/RECOVERY_REQUIRED |

Command/job IDs are UUIDs, not authorization. Existing staff RBAC, HttpOnly candidate cookies, service-level candidate/session/application checks, Origin policy, private no-store responses and DTO allowlists remain independently enforced. Plan requests are limited to 12/minute per staff identity and controls to 20/minute, plus existing limits. These limits are process-local abuse protection. Candidates cannot invoke staff generation or a provider completion endpoint.

READY stores the nonsecret provider/model profile in the existing durable `model:mode` receipt. Legacy interviews without it keep their existing mock processing. Model-mode interviews do not silently use mock PROCESS_ANSWER when configuration is disabled or the profile changes: they show recovery required until the intended configuration is restored. Changing the key alone does not change the profile. Configuration/registration is not provider health.

## Durability, bounds and recovery

Existing SQL events (`MODEL_JOB_STATUS`) and command receipts store stable job/logical-turn identity, input hash, expected version, runtime owner, candidate-session version, provider/model profile, attempt number/token, deadline, retry time and safe status. PLAN proposals are stored quarantined for review. No duplicate raw candidate answer/context, secret, raw provider exception or new audio is persisted by this layer. Existing answer records remain the authoritative durable answers.

States: QUEUED, RUNNING, PROPOSED, COMMITTED, APPLIED, FAILED, STALE. PLAN requests use a stable command UUID; decisions use one logical `decision:<turn>` identity. Each physical attempt gets a fresh token. Claim/result application checks owner, input, profile, session, phase, version, turn, token and deadline. Answer processing, decision events, evaluation scheduling, successful logical process receipt and model-result receipt commit atomically. SQL rollback cannot leave a successful partial decision. Duplicate completions reconcile the receipt; conflicting reuse fails.

Two physical calls maximum, including claims and timed-out operations that ignore cancellation. A keyset scan examines up to 64 interviews per dispatcher pass; the independent 1s dispatcher never awaits model I/O. Logical timeout is 1–15,000ms. Attempts are bounded to 1–3, default 2. Transient failures retry after `1000 * attempt` milliseconds when admissible; malformed results require explicit HR retry, still within the same durable budget. The SDK adds no hidden retries. Exhaustion/cancel is visible as recovery required, never a successful fabricated decision. An already committed answer remains committed.

Pause/interruption, session rotation/revocation, restart, profile change, changed input/version and shutdown fence stale results. Shutdown closes admission and aborts pending calls. After restart, existing domain recovery pauses the interview; explicit resume can reclaim eligible work with a new runtime owner/attempt token and the remaining budget. Old owners cannot publish. Completed receipts remain deterministic. Refresh/reconnect polls authenticated status and does not create a second answer/model job. The UI distinguishes durable answer commit from next-question processing/retry/recovery.

Single-process/one-runtime-owner scope remains. Bounds/rate limits are process-local. Synchronous CPU work cannot be preempted. A permanently hung provider can retain a physical slot until restart. SQL/runtime availability and global shutdown grace still constrain recovery; no distributed lease or multi-instance claim is made.

## Prompt/data boundary

Fixed server instructions and a separate JSON user-data message are sent without tools. Context contains approved questions, criterion IDs, allowed decisions, language, current prompt and the current answer/uncertainty only. No session credential, staff identity, candidate PII record, private rubric or authorization evidence is supplied.

Strict schemas reject extra properties, invented decision types, prompt IDs, plan changes and evaluation outputs. PLAN additionally rejects control characters, markup/URL patterns and a conservative set of unsafe/sensitive instructions. That text filter does not establish semantic safety across languages or prove model obedience. Mandatory HR review and the structural server authority boundary remain necessary. Candidate/model text never controls authorization, tools, timers or state directly. Free-form live adaptive question generation is deliberately outside this approved-catalog contract.

Provider input JSON is bounded to 96,000 bytes, output to 128,000 bytes and 4,096 completion tokens. Individual prompt/answer bounds are also enforced. Oversized context fails explicitly without truncating or losing the committed answer; automatic context summarization/chunking is not implemented.

## Exact server configuration

| Setting | Default / accepted values |
|---|---|
| `AI_INTERVIEW_LLM_ENABLED` | `false`; explicit `true` to dispatch |
| `AI_INTERVIEW_LLM_PROVIDER` | `disabled`; `synthetic` or `openai` |
| `AI_INTERVIEW_LLM_MODEL` | No default; explicit account-supported model required for `openai`; 1–100 letters/digits/`.`/`_`/`:`/`-`, starting alphanumeric |
| `AI_INTERVIEW_LLM_API_KEY` | Dedicated server-only key required for `openai`; 16–512 non-whitespace ASCII characters; no generic/speech-key fallback |
| `AI_INTERVIEW_LLM_BASE_URL` | Only `https://api.openai.com/v1`; custom origins/paths rejected |
| `AI_INTERVIEW_LLM_TIMEOUT_MS` | `15000`; integer 1–15000 |
| `AI_INTERVIEW_LLM_MAX_ATTEMPTS` | `2`; integer 1–3 |

Enabled+disabled-provider, missing real credentials/model, malformed configuration and synthetic-provider selection in production fail closed with a safe error that does not print values. Runtime registration performs no network call. A key-reading closure keeps the key out of serialized configuration. No VITE/browser setting carries credentials.

Keyless synthetic development: set NODE_ENV=development, AI_INTERVIEW_LLM_ENABLED=true and AI_INTERVIEW_LLM_PROVIDER=synthetic. This selects deterministic plan echo/approved decision responses, not a network provider. Keep real activation disabled during ordinary development. No credential is needed for the tests.

The cloud adapter reuses the installed OpenAI SDK, pinned Chat Completions POST, `store:false`, strict JSON-schema response format, `max_completion_tokens:4096`, logging off, no tools, redirect rejection and SDK retries zero. Refusal/tool calls/non-stop finishes/malformed bodies fail safely. The wire contract follows the [official Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create); real account/model support is not established by synthetic tests.

## Future API activation checklist

1. Obtain an approved server-side account/key and explicit model supporting Chat Completions, strict JSON-schema output and the configured token parameter. Verify privacy/consent, account controls, languages and interviewing policy before sending candidate content. Never put the key in frontend config, URLs, evidence or logs.
2. Supply the exact dedicated settings above in the server secret/configuration service. Validate fail-closed startup and the intended immutable profile before making new interviews READY. Do not repurpose an in-progress interview with another model/profile.
3. Independently verify provider health, strict schema/refusal/truncation/error behavior, response sizes, latency and actual cancellation. Presence of a key is not readiness. Test transient retries, exhausted budget, hung calls, delayed completions and shutdown/restart with real service behavior.
4. Have authorized HR request, inspect and approve proposed wording. Validate semantic relevance and fairness in each supported language; synthetic fixtures and lexical filters do not establish that quality.
5. Repeat answer-before-model persistence, duplicate/concurrent attempts, pause/STOP, refresh, restart, changed sessions/profiles, malicious input, candidate/staff isolation, timer independence and report integrity tests against an isolated non-production environment. Preserve all failure evidence.
6. Separately finish the production trusted voice START/resume/worker/playback/STOP composition and real device/provider E2E validation. An LLM key does not provide STT/TTS transport or trusted audibility. Real evaluation remains a separate integration task. Keep overall release and Live Voice gates blocked until validated.

## Reproduce evidence

Use a new run ID; never overwrite an accepted run. `run.mjs RUN init`, `run.mjs RUN all` execute the recorded 46-command inventory with sanitized dedicated environments and network guards. PostgreSQL on loopback 55442 and native Chrome are needed for database/browser tests. The existing full-chain probe intentionally reports BLOCKED while pgvector is absent. All outputs, including redirected historical suites, stay inside this new evidence package. Exact executable/arguments, times, exit codes, raw assertions and network records are retained.

After completed tests, `run.mjs RUN integrity`, scoped `cleanup.mjs RUN`, `evidence.mjs RUN` and read-only `verify.mjs RUN` freeze/check source, test completion, prior evidence, new artifact inventory, privacy and cleanup. Scripts never activate a real provider. Tests use injected SDK HTTP functions and deterministic providers; no inference endpoint is contacted. Native Chrome background traffic is not independently packet-captured; app-page and instrumented Node external requests are guarded.
