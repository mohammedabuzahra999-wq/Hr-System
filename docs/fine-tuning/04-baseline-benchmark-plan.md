# Existing tests and proposed frozen baseline evaluation

Date: 2026-10-22. This is a plan and inventory, not a new benchmark or dataset. Existing tests/fixtures/expected plans were not modified. No suites, model/API calls or audio inference were run in this documentation phase.

## Existing check and fixture inventory

Source discovery identified **29 check/E2E entrypoint files and 2 fixture modules** below, plus the existing benchmark runner self-test mode. This is a file count, not a total number of executable assertions: loops, generated conversation rows, mocked HTTP cases and actual audio clips have different denominators. There is no single repository-wide test-run count that can honestly combine them.

| Existing file (relative to repository) | Coverage / important limit |
|---|---|
| `server/src/copilot/gate.check.ts` | All roles against closed intent/action registries; no model/DB |
| `server/src/permissions.check.ts` | Capability/route registry consistency; static role-gate checks, not full record-scope E2E |
| `server/src/copilot/validatePlan.check.ts` | Same Zod/semantic boundary across deterministic/phrasebook/training/model candidates; malformed/rewritten plans, actor permissions, employee/payroll/manager scopes and action boundaries using mocked records |
| `server/src/copilot/localReads.check.ts` | Self leave and generic Arabic/English employee-details regression |
| `server/src/copilot/readRules.check.ts` | New bilingual/mixed deterministic reads, periods, generic names, abstention, no real provider calls |
| `server/src/copilot/phase3b.check.ts` | Team-presence and maintained help expansion/abstention |
| `server/src/copilot/routingOutcome.check.ts` | Pure terminal results and context-sensitive abstention; writes an existing coverage artifact |
| `server/src/copilot/phase3d.check.ts` | Mocked actual HTTP route: all eight terminal cases skip models/embeddings/executors; auth/request validation/rate-limit/audit/pending/context protection; writes existing artifact |
| `server/src/copilot/routingOutcome.fixtures.ts` | Fixture module, not test runner: eight terminal expectations plus negative HR/document/context examples |
| `server/src/copilot/training.check.ts` | Legacy training loading/mapping, local and supplemental language/action/report routing, role restrictions |
| `server/src/copilot/conversationTraining.check.ts` | 443 existing question/continuation examples, period/entity carryover and role restrictions; not 443 real model/HTTP conversations |
| `server/src/copilot/corpus.check.ts` | Registry/permission/coverage validity of 122 handwritten corpus rows; does not call the resolver to measure accuracy |
| `server/src/copilot/resolveQuestion.ollama.check.ts` | Live historical seven-input Ollama classification smoke; not safe to execute as a purely offline audit |
| `server/src/copilot/benchmark/coverage.check.ts` | Historical 26-slice local coverage via provider-capture stub; writes Phase 2 report, not the HTTP terminal partition |
| `server/src/copilot/benchmark/openrouter.check.ts` | Mocked OpenRouter transport/structured-output/error behavior; no cloud requests |
| `server/src/ai/structuredProvider.check.ts` | Explicit provider selection/request shape, no cross-provider fallback; stubbed transport |
| `server/src/ai/ollama.check.ts` | Live small structured schema smoke; not Copilot workload |
| `server/src/ai/scorecard.check.ts` | Deterministic recruitment scoring/criteria behavior |
| `server/src/payroll/calculate.check.ts` | Payroll calculation/domain checks; different task from language classification |
| `server/src/payroll/auditRules.check.ts` | Deterministic payroll audit rule cases |
| `server/src/guide/tour.check.ts` | Role-specific guide/tour/navigation consistency |
| `server/src/voice/session.check.ts` | Owned session, expiry, duplicate turns, explicit reviewed confirmation, ordinal choices |
| `server/src/voice/local.check.ts` | Mocked local audio config, ownership, WAV validation, protected turns, local/OpenAI separation and navigation/context checks |
| `server/scripts/checkLocalVoiceBrowser.mjs` | Real audio-helper/VAD code with mock browser primitives; silence/noise/segmentation/resampling/lifecycle/watchdogs |
| `server/scripts/checkLocalVoiceTurn.mjs` | Actual hook through mocked media/transports: automatic turns, progress, TTS/playback recovery, exact confirmation, cancellation/busy handling |
| `server/scripts/checkLocalVoiceQueue.mjs` | FIFO admission, concurrency cap, overflow/deadlines, no automatic inference retries |
| `server/local-voice/stt_runtime_check.py` | Native resident-model process lifecycle/request/recovery isolation using test doubles |
| `server/local-voice/worker_check.py` | Worker HTTP busy metadata, semaphore release and incomplete-upload behavior using test doubles |
| `server/src/voice/local.e2e.ts` | Real authenticated synthetic speech -> STT -> turn -> TTS; logs limited results/timings, can write a report. It uses application sessions and must not be run under a no-DB/no-provider audit assumption |
| `server/src/voice/evaluation.fixtures.ts` | Fixture module: six final-transcript navigation/context/choice cases; not recorded human audio |
| `hr-app/src/features/i18n/wording.check.mjs` | Translation-key consistency; does not measure Arabic semantic or speech quality |

Definitions: [server/package.json](../../server/package.json), [frontend package](../../hr-app/package.json); sources in [Copilot](../../server/src/copilot), [Voice](../../server/src/voice), [scripts](../../server/scripts), [local worker](../../server/local-voice).

Existing runner [benchmark/run.ts](../../server/src/copilot/benchmark/run.ts) has `--self-test` for provider capture, exclusions, scoring, malformed output/deadlines/targets. `npm.cmd run check` performs workspace TypeScript/static checks and frontend lint; it is not a command that automatically runs all Copilot regression scripts. Several checks have no named npm alias and are invoked directly with the project's TypeScript runner.

## Existing benchmark evidence and comparability

[cases.ts](../../server/src/copilot/benchmark/cases.ts) contains **33 fixtures**, historically partitioned into 26 model-routed inputs and 7 excluded local controls/paths. It is not a fresh test of all 32 intents, all roles or all 48 actions. The current capture mechanism replaces the provider **in memory** and lets real resolver local rules run first. That measures classification-stage residual workload, not the full HTTP preflight or domain execution. OpenRouter's live runner retains a guard expecting 26 included cases and should stop if that assumption no longer holds; do not weaken it silently.

The saved [Phase 3D artifact](../../server/hybrid-phase3d-coverage.json) records 18 resolved, 2 unsupported, 3 clarification and 3 out-of-scope outcomes for the historical 26 inputs, 0 unresolved and 0 incorrect local plans. Its [mocked HTTP companion](../../server/hybrid-phase3d-http.json) records zero AI/embedding/executor calls for the eight terminals and passing auth/validation/rate-limit/context checks. These are **saved results**, not tests rerun in this audit. They are conditional on fixture roles/neutral context; production traffic frequency cannot be inferred from them.

Historical model evidence, not directly a current-resolver before/after baseline:

| Model / source | Intent | Complete plan | Completed-response average | Limit |
|---|---:|---:|---:|---|
| qwen2.5:1.5b, [saved report](../../server/ollama-qwen2.5-1.5b-benchmark.md) | 46.2% | 7.7% | 19.80 s | CPU-only, old residual workload; interrupted latency samples need the report's validity distinction |
| qwen2.5:3b, [saved report](../../server/ollama-qwen2.5-3b-benchmark.md) | 69.2% | 34.6% | 32.31 s | One timeout; old residual workload |
| qwen3:4b | Historical failure | Historical failure | No comparable fresh number asserted | Do not manufacture missing comparable measurements |

Saved OpenRouter results span baseline/experimental/shared-prompt attempts and provider errors; a successful experiment reported in prior work is not a substitute for a version-matched frozen baseline. No OpenRouter benchmark was rerun. Old plans for period-specific payslips or filtered request lists are classification goldens, while current terminal expectations deliberately represent unsupported execution. Preserve both and label what each measures rather than silently “fixing” expected results.

## Missing coverage before a meaningful fine-tuning claim

* Full 32-intent and 48-action parameter coverage, rather than intent-only labels and small synthetic residual slices.
* An independently authored frozen set not already in phrasebook, training examples, conversation templates or the historical fixtures; grouped duplicate/translation leakage checks.
* Real entity spans/slot goldens. All 10k existing JSONL `parameters` are empty. Complete-plan correctness cannot be derived from that file alone.
* Report subtype versus role/self/team scope, especially employee `myReport` or manager `generateReport` with recruitment/department subtypes. Existing intent gate checks do not prove those queries are scoped.
* MCP typed-read semantic validation, special-intent parity, ignored stage filter, and role/session revocation during long-lived sign-in.
* Current executor fidelity: payslip periods, request status subsets, latest-audit period assumptions, future team leave, department scope in generic reports and recruitment filters. Correct language classification is not correct execution of an unsupported filter.
* Fresh MSA/Jordanian/mixed paraphrases, negation/compounds, names with varied structures and punctuation, transliteration/identity ambiguity, unavailable periods and clarification follow-ups.
* Paired human-reviewed audio/transcripts across speakers/noise/microphones and language switching. Synthetic Piper-to-Whisper success and browser mocks do not establish real microphone/dialect accuracy.
* Privacy regression checks for every provider egress under sharing flags, PII redaction/export, log failure paths, source retention and candidate-interview data. No ready-made safe training export exists.
* Current provider capability/error/latency parity; separate cloud quota failures from semantic errors, and validate configured model availability separately from its saved name.

These are proposed future checks, not additions in this phase.

## Proposed frozen baseline design

### Freeze scope and assets first

Use the current real intent/plan schema, trusted role, actual supported executor behavior and an independently reviewed outcome label. Do not introduce new intent names simply for training. Proposed first collection size: about 400 independent text scenarios, 60 multi-turn episodes, and 80 paired synthetic/consented audio clips. Exact counts should follow a reviewed coverage matrix, not a template multiplication target. **No cases or data files were created here.**

Keep four distinct evaluation tracks:

1. **Language component:** same frozen messages/schema/role context before and after fine-tuning; intentionally exercise the provider interface with no real records/actions. All examples are sanitized/synthetic. Report whether the production local router would have resolved each request, but do not count bypassed cases as model successes.
2. **Real hybrid pipeline:** authenticated application flow with deterministic, phrasebook, training, terminal and model sources observed separately. Use controlled synthetic accounts/records and isolated storage; no production DB writes. Measure expected terminal outcome as well as plans, no concealed provider injection/prompt guidance.
3. **Authorization/action safety:** intentionally valid and adversarial plans, all roles, self/direct-report/unrelated/ambiguous targets, wrong report subtype, forged context, absent review, duplicate/stale confirmations. Assert zero forbidden records and zero unconfirmed protected writes regardless of classifier accuracy.
4. **Speech:** pair reference text with exact frozen audio. Score STT first, then run both human reference and recognized transcript through the same frozen intent pipeline. TTS/playback and microphone capture tests have separate results.

Coverage strata: English, MSA Arabic, Jordanian Arabic and genuine mixed Arabic/English; all intents; reads/actions/help/knowledge; self/team/company/named-person scope; allowed/denied roles; current/calendar periods; ambiguity/missing fields; unsupported capabilities; clear external requests plus legitimate HR usage of scientific/weather terms. Mark each episode's previous plan/UI page/pending field and expected clarification explicitly. Never infer scope from employee names.

Split by semantic template/paraphrase/translation family, entity set, conversation episode and audio speaker; keep paired transcript/audio together. Existing corpus/phrasebook/conversation/training examples belong in the known/development bucket unless their entire family is excluded from training and runtime examples for a separately declared component experiment. Do not relabel familiar fixture success as unseen generalization.

Freeze hashes for source/resolver, system prompt for each role/context/example selection, JSON Schema, local rules, fixtures, expected plans/outcomes, scoring, model/tag/quantization/runtime, hardware/threads and audio settings. Temperature zero is configuration, not proof of determinism. Leave the provider/rules/prompts fixed across before/after; a routing change or new model size requires a new comparison stratum.

### Metrics and denominators

| Metric | Proposed definition |
|---|---|
| Intent accuracy | Correct intent / all attempted eligible semantic classifications; also valid-response-only view, confusion matrix and per-intent macro average |
| Entity extraction | Per-slot exact match plus precision/recall/F1 for typed spans; distinguish wrong value, missing value and hallucinated value; dates compared as current supported period/month/year, not invented calendar ranges |
| Complete-plan accuracy | Deep equality after existing schema parsing, including irrelevant fields staying null and correct person/period/reportType/payrollTopic; no tolerance that hides unsupported fields |
| Language accuracy | Intent and complete/entity scores for English, MSA, Jordanian and mixed groups, with counts; do not infer dialect from script alone |
| Voice-transcript intent accuracy | Correct plan/intent on recognized transcript; paired with reference-text accuracy and STT word/character error rates, entity/name/period transcription errors |
| Clarification accuracy | Correct needs-clarification decision and needed slot/scope; report missed ambiguity and unnecessary clarification separately |
| Unsupported/refusal accuracy | Correct unsupported/out-of-scope decision, plus false refusal of legitimate HR/document questions; not an executable-plan success |
| False action rate | Read/refusal/clarification turns incorrectly proposed as actions / all such turns; separately count **actual unconfirmed/unauthorized executions**, which must be zero |
| Authorization/RBAC safety | Denied-role/target test pass rate, scope preservation and zero forbidden rows/amounts; classifier intent accuracy cannot substitute for these assertions |
| Model fallback rate | Hybrid requests that invoke question provider / all hybrid requests; also report other model calls (continuation/action/RAG/prose) so local classification does not imply zero AI use |
| Local resolution rate | Correct local executable plans / all hybrid requests, separated into deterministic/phrasebook/training; terminal rate reported separately |
| Zod / semantic validation | Successful valid output / successful model responses; and valid output / all attempts. Report semantic invalidity separately |
| Reliability | Timeouts, HTTP/API/quota/connection errors and invalid JSON/schema output, with all attempts retained; no hidden retries |
| Latency | End-to-end and stage mean/median/P95/max using `performance.now()` or `hrtime`; completed-response and attempt-wide values, cold/warm model status, tokens and timeout deadline |

For Voice, report recording duration, VAD end delay, queue wait, STT, intent/provider, service, TTS and first audible response separately. HTTP first-byte time with non-streaming JSON is not the first spoken response. Reject interrupted/suspended multi-hour timing artifacts; retain a labeled timeout/error rather than silently dropping failures. No actual employee contents should appear in metrics artifacts.

### Acceptance and comparison policy

Retain historical classification targets as minimums: intent >=90%, complete plan >=85%, successful-response Zod 100%, zero timeouts, completed-response average <=10 seconds. Also require no security regressions, zero forbidden scopes/unconfirmed protected writes, no lost terminal protections, and reviewed per-language/clarification/entity results. Define per-slot and per-language floors before data collection; do not select them after seeing results. Provider errors remain visible even if semantic targets pass.

Produce separate tables for (a) model-only eligible workload, (b) entire hybrid outcome accuracy/coverage, (c) role/scope/action safety and (d) paired speech performance. Report baseline and fine-tuned result on exactly the frozen same inputs, prompts, schemas and scoring, with paired error counts. Improvements caused by changing a prompt, a local rule, a dataset split or hardware are separate experiments.

## Next experiment gate (proposal)

Before collecting/uploading training data: review the report-scope finding and privacy-egress inconsistencies, agree on actual label/slot ontology and supported-capability goldens, approve anonymization/provenance, and authorize the independent frozen test collection. Only then measure a new versioned baseline. This document does not authorize data export, fine-tuning, model replacement or production integration.
