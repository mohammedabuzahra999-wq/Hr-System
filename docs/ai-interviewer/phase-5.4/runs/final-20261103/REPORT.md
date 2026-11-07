# Phase 5.4 Provider Gate — PASS

**Provider Gate: PASS for synthetic adapters in the supported local single-process scope.**
**Live Interview Voice E2E: BLOCKED. Release readiness: BLOCKED.**

Phase 5.1 remains BLOCKED only by the known environment/release validations. Phase 5.2 and Phase 5.3 remain accepted PASS in their supported scopes. All three evidence packages are unchanged.

Recorded 2026-11-03T11:33:07.010Z, display zone Asia/Riyadh. Node v24.15.0, npm 11.12.1, PostgreSQL 18.6, Chrome 156.0.8078.80.

## Architecture implemented and trust boundaries

The before-state inspection was completed before application edits: [before-state](../../before-state.md). [Design](../../design.md) documents exact contracts, policies and boundaries.

Server-registered adapter -> closed normalized observation -> InterviewService authorization/row lock -> unchanged InterviewEngine -> durable events/receipt/snapshot/effects -> server adapter -> correlated playback acknowledgement. Adapters receive no database, service, principal or engine. Provider responses are input only. START/RESUME remain separate server-orchestrated candidate intents; provider observation schema cannot request lifecycle/evaluation/tool operations.

Audio-v2 binding requires consent, frozen input, valid candidate cookie and READY/PAUSED lifecycle. The persisted generation/session/owner and ordered cursor fence old work. Existing command receipts/fingerprints provide idempotency. No second receipt system, SQL migration, dependency, provider SDK, WebRTC, retention or distributed runtime was added. Existing mock-v1 flow stays available for development regressions. Real candidate audio UI/transport is not activated.

## STT result

Synthetic STT **PASS**: success, speech-end before final, duplicate receipt, conflicting identity, new-ID repeated final, malformed response/audio, unavailable, timeout, stale version/turn/session, revocation during execution and late output after timeout/restart/close all tested. Transcript plus speech-end commits exactly once through the unchanged engine. An observed partial/final alone is not a UI commitment guarantee. No browser-supplied transcript can enter the audio-v2 trusted path.

Per-operation asynchronous bound: **15,000 ms**, with a two-physical-call cap shared across gate objects for the database. Uncancellable work retains capacity until settlement; late output has no authoritative effect. Reduced native test budgets prove timeout/cancellation. Canonical PCM16 mono16k WAV is validated, input <=8,000,000 bytes. Real STT worker integration remains **BLOCKED/unconfigured**.

## TTS and PLAY result

Synthetic TTS/playback **PASS**: timeout, unavailable, malformed output, playback failure, duplicate/wrong/late acknowledgement, finish-before-start, ambiguous dispatch and changed-generation TTS all fail safely. PLAY is application-owned; reserve it durably before I/O, use a stable provider idempotency key and revalidate after synthesis before play. TTS accepted is only DISPATCHED; actual start/finish still require correlated trusted observations. Acknowledgement without a recorded dispatch is refused. TTS output is canonical WAV <=2,000,000 bytes. Synthesis and play each have a 15s bound, up to 30s combined plus finite DB/scheduling latency.

Real TTS/audio delivery remains **BLOCKED/unconfigured**. No actual candidate audio player, worker HTTP bridge or background production dispatcher is claimed.

## Interruption and reconnect results

Synthetic interruption **PASS**: speech during an allowed AI question atomically starts the interrupted listening turn and preserves STOP intent. Both speech-first and finish-first races remain one turn. Duplicate speech-start/STOP acknowledgement is idempotent by receipt; stale new-ID acknowledgement is rejected. Lost STOP acknowledgement leaves durable intent until bounded retry.

Synthetic reconnect **PASS** for playback, speaking, interruption, pending PLAY, before/after answer commitment, refresh, stale connection and provider restart. DISCONNECTED pauses; CONNECTED does not resume. Explicit resume preserves duration and creates a new playback identity where replay is needed. Gate close fences local callbacks, aborts bounded waits and records durable CLOSED generation when DB is available. Former-owner/generation responses cannot change the new state. Browser polling failure is never trusted disconnect proof.

**Real trusted connection/disconnect/reconnect validation remains BLOCKED.** Synthetic connection events exercise enforcement; they do not prove a real worker/sideband can attest connection health. Restart is a new service owner over durable PostgreSQL, not OS kill/distributed failover.

## Failure, interruption, reconnect and security matrix

Raw [provider-matrix.json](provider-matrix.json) contains the durable states below. Each row compares snapshot answers with finalized domain records. Provider receipt counts include valid control/transport commands. Version changes for legitimate pauses/connection metadata do not mean answer advancement. The raw providerReady field describes the synthetic fixture gate; production rejection is asserted against separate production gates and the disabled HTTP endpoint.

| Scenario | Durable lifecycle/phase | Version | Answers/finalized | Questions selected | Provider receipts | Pending PLAY/STOP |
|---|---|---|---|---|---|---|
| production configuration closed | READY/— | 5 | 0/0 | 0 | 0 | 0/0 |
| trusted start | ACTIVE/INTRO | 7 | 0/0 | 0 | 2 | 1/0 |
| durable PLAY dispatch | ACTIVE/INTRO | 8 | 0/0 | 0 | 3 | 1/0 |
| duplicate playback ACK | ACTIVE/AI_SPEAKING | 9 | 0/0 | 0 | 4 | 1/0 |
| trusted STT answer | ACTIVE/PROCESSING | 16 | 1/1 | 1 | 11 | 0/0 |
| speech-end before STT | ACTIVE/PROCESSING | 16 | 1/1 | 1 | 11 | 0/0 |
| duplicate transcript | ACTIVE/PROCESSING | 16 | 1/1 | 1 | 11 | 0/0 |
| STT timeout | PAUSED/LISTENING | 15 | 0/0 | 1 | 10 | 0/0 |
| STT unavailable | PAUSED/LISTENING | 15 | 0/0 | 1 | 10 | 0/0 |
| STT malformed | PAUSED/LISTENING | 15 | 0/0 | 1 | 10 | 0/0 |
| late STT fenced after recovery | ACTIVE/PROCESSING | 21 | 1/1 | 1 | 15 | 0/0 |
| late STT after deadline | ACTIVE/PROCESSING | 15 | 1/1 | 1 | 9 | 0/0 |
| TTS timeout | PAUSED/INTRO | 9 | 0/0 | 0 | 4 | 1/1 |
| TTS unavailable | PAUSED/INTRO | 9 | 0/0 | 0 | 4 | 1/1 |
| TTS malformed | PAUSED/INTRO | 9 | 0/0 | 0 | 4 | 1/1 |
| TTS playback-failure | PAUSED/INTRO | 9 | 0/0 | 0 | 4 | 1/1 |
| barge-in | ACTIVE/PROCESSING | 16 | 1/1 | 1 | 11 | 0/0 |
| late playback after interruption | ACTIVE/LISTENING | 13 | 0/0 | 1 | 8 | 0/1 |
| race speech-first | ACTIVE/LISTENING | 13 | 0/0 | 1 | 8 | 0/1 |
| race complete-first | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |
| lost STOP ACK retry | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |
| reconnect playback | ACTIVE/NEXT_QUESTION | 15 | 0/0 | 1 | 10 | 1/1 |
| reconnect speaking | ACTIVE/LISTENING | 17 | 0/0 | 1 | 12 | 0/0 |
| reconnect interruption | ACTIVE/LISTENING | 16 | 0/0 | 1 | 11 | 0/1 |
| reconnect pending PLAY | ACTIVE/INTRO | 10 | 0/0 | 0 | 5 | 1/1 |
| refresh after commit | ACTIVE/PROCESSING | 20 | 1/1 | 1 | 14 | 0/0 |
| refresh before commit | ACTIVE/PROCESSING | 21 | 1/1 | 1 | 15 | 0/0 |
| provider restart | ACTIVE/INTRO | 11 | 0/0 | 0 | 5 | 1/1 |
| reordered/stale version | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |
| concurrent provider events | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |
| browser forgery rejected | ACTIVE/LISTENING | 13 | 0/0 | 1 | 8 | 0/0 |
| security expired | ACTIVE/LISTENING | 13 | 0/0 | 1 | 8 | 0/0 |
| security revoked | PAUSED/LISTENING | 14 | 0/0 | 1 | 8 | 0/0 |
| security stale-session | ACTIVE/LISTENING | 13 | 0/0 | 1 | 8 | 0/0 |
| synthetic completed delivery | COMPLETED/CLOSING | 34 | 3/3 | 3 | 26 | 0/0 |
| invalid input audio | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |
| late TTS fenced before play | PAUSED/INTRO | 11 | 0/0 | 0 | 5 | 1/1 |
| closed generation | PAUSED/LISTENING | 15 | 0/0 | 1 | 10 | 0/0 |
| same-identity simultaneous events | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |
| duplicate STOP ACK | ACTIVE/LISTENING | 14 | 0/0 | 1 | 9 | 0/0 |

## Security and evaluation integrity

Foreign interview/generation/question/turn/playback, expired/revoked/stale sessions, browser forgery and conflicting identity reuse fail without unauthorized writes. Candidate/staff separation, HttpOnly protections, Origin, DTO allowlists, HR scope and employee Voice/Copilot/MCP authority remain intact. No provider credential is loaded, logged, returned or stored in browser data. Metadata fields are closed and contain no transcript, raw exception or credential.

No LLM integration is introduced. Synthetic follow-up/clarification proposals use the existing deterministic frozen plan; engine limits remain authoritative. Real LLM/provider validation is separately BLOCKED/unconfigured. Evaluation remains completed durable interview -> frozen input/inputHash -> versioned job -> evidence verification/NOT_ASSESSED -> HR report. Existing 76 evaluation/evidence checks PASS; no evaluator, verifier, runtime or report source file changed.

## Readiness configuration and Live Voice E2E

The explicit server configuration has disabled/synthetic/real modes, a production flag, registered adapter, trusted STT/connection/idempotent-play capabilities and a strict health result. Configured/ready/unhealthy/unavailable are distinguishable. Synthetic registration in production and missing/invalid requirements fail closed. Current HTTP composition is **disabled**, so production START remains 503 with no mock fallback. GET /api/ai-interview/delivery/readiness exposes only status/mode/liveValidated=false.

Local model assets exist; the bounded local readiness probe found no worker listener on 8766. There is no isolated candidate real-engine transport/connection source. Real audio-v2 browser disclosure, gesture/media handling and authenticated worker transport remain unvalidated. The old local.e2e.ts is an employee Copilot workflow that reads employee demo credentials; it is not run as substitute proof of candidate voice delivery. No provider/model is started or downloaded.

**Live Interview Voice E2E: BLOCKED**, not executed. Synthetic full lifecycle (secure candidate session, question delivery, trusted-fixture STT, follow-up/clarification and completion) is tested separately and cannot resolve this blocker.

## Complete regression and exact commands

| Suite | Command | Result | Count |
|---|---|---|---|
| provider-gate | `node --conditions=development --import tsx src/aiInterviewer/delivery.check.ts` | **PASS** | 51 checks/scenarios |
| execution-bounds | `node --conditions=development --import tsx src/aiInterviewer/execution.check.ts` | **PASS** | 14 checks/scenarios |
| runtime-jobs | `node --conditions=development --import tsx src/aiInterviewer/runtime.check.ts` | **PASS** | 30 checks/scenarios |
| answer-ui | `node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs` | **PASS** | 26 checks/scenarios |
| answer-db | `node --conditions=development --import tsx src/aiInterviewer/answer.check.ts` | **PASS** | 27 checks/scenarios |
| engine | `npm.cmd run check:ai-interviewer -w @hr/server` | **PASS** | 37 checks/scenarios |
| scenario | `npm.cmd run demo:ai-interviewer -w @hr/server` | **PASS** | — synthetic scenario |
| persistence | `npm.cmd run check:ai-interviewer:persistence -w @hr/server` | **PASS** | 65 checks/scenarios |
| report | `npm.cmd run check:ai-interviewer:report -w @hr/server` | **PASS** | 76 checks/scenarios |
| ui | `npm.cmd run check:ai-interviewer:ui -w @hr/server` | **PASS** | 24 checks/scenarios |
| mcp | `node --conditions=development --import tsx src/mcp/authorization.security.check.ts` | **PASS** | 18 checks/scenarios |
| permissions | `npm.cmd run check:permissions -w @hr/server` | **PASS** | 107 reported assertions/groups |
| gate | `npm.cmd run check:gate -w @hr/server` | **PASS** | 194 reported assertions/groups |
| plans | `npm.cmd run check:plans -w @hr/server` | **PASS** | 95 checks/scenarios |
| report-security | `node --conditions=development --import tsx src/reports/build.security.check.ts` | **PASS** | 44 checks/scenarios |
| voice | `npm.cmd run check:voice -w @hr/server` | **PASS** | 17 reported assertions/groups |
| local-voice-api | `npm.cmd run check:voice:local -w @hr/server [component 1/4]` | **PASS** | 3 reported assertions/groups |
| local-voice-audio | `npm.cmd run check:voice:local -w @hr/server [component 2/4]` | **PASS** | 4 reported assertions/groups |
| local-voice-turn | `npm.cmd run check:voice:local -w @hr/server [component 3/4]` | **PASS** | 8 reported assertions/groups |
| local-voice-queue | `npm.cmd run check:voice:local -w @hr/server [component 4/4]` | **PASS** | 6 reported assertions/groups |
| scorecard | `npm.cmd run check:scorecard -w @hr/server` | **PASS** | 27 reported assertions/groups |
| structured-provider | `node --conditions=development --import tsx src/ai/structuredProvider.check.ts` | **PASS** | 4 reported assertions/groups |
| typechecks | `npm.cmd run check` | **PASS** | — 3 workspace checks |
| contracts-build | `npm.cmd run build -w @hr/shared` | **PASS** | — production build |
| api-build | `npm.cmd run build -w @hr/server` | **PASS** | — production build |
| web-build | `npm.cmd run build -w hr-app` | **PASS** | — production build |
| browser3 | `npm.cmd run check:ai-interviewer:browser -w @hr/server` | **PASS** | 44 browser checks |
| browser4 | `npm.cmd run check:ai-interviewer:report:browser -w @hr/server` | **PASS** | 58 browser checks |
| answer-browser | `node scripts/checkAiInterviewAnswerBrowser.mjs` | **PASS** | 56 browser checks |
| migrations | `node docs/ai-interviewer/phase-5.4/migrations.mjs` | **BLOCKED** | — full-chain probe |
| live interview voice E2E | no isolated candidate worker/transport configuration | **BLOCKED** | not executed |

All executable baseline suites PASS. New provider gate is **51/51**; Phase 5.2 remains **26/26 UI, 27/27 DB, 56/56 expanded browser**. Phase 5.3 remains **14/14 execution and 30/30 runtime**. Browser counts overlap with original 44/58 coverage. MCP is 18 scenarios with 69 tools per invalid-auth state, not 19 from counting its summary line. Two existing web lint warnings and large-chunk build advisory remain. No original test assertion changed or weakened. Early new-test failures and their correction are retained in [iterations](../../iterations.md).

Phase 5.3 fairness rerun: deterministic fairness 10 ms with A=RUNNING, B=COMPLETED; native fairness 532 ms with A=RUNNING, B=COMPLETED. Native fixture tolerance remains <2,000ms; production scheduling is one second plus finite DB/scan/scheduling latency.

Exact actual Node arguments/cwd/allowlisted ports are in inventory.json. Per-suite UTC timestamps, exit codes, logs, network counters and browser/database matrices are beside this report. See [README](../../README.md) for reproducible commands. Child environment is allowlisted, .env/provider credentials excluded, older browser evidence redirected, fixture credentials/screenshots suppressed and temporary profiles removed. Node processes instrumented: 44; guarded external attempts **0**; real provider/model calls **0**. Local PostgreSQL/HTTP/CDP/Vite traffic is expected. Native Chrome background traffic is not independently packet-captured.

## Exact source changes and hashes

| Change | Application/test/config file | Purpose |
|---|---|---|
| CREATED | `services/hr-api/src/aiInterviewer/delivery.check.ts` | 51 additive synthetic provider checks over disposable PostgreSQL. |
| CREATED | `services/hr-api/src/aiInterviewer/delivery.ts` | Server-only registration/readiness, bounded STT/TTS/play/STOP, cancellation and pre-play fencing. |
| CREATED | `services/hr-api/src/aiInterviewer/deliveryContracts.ts` | Closed normalized observation/correlation contract and audio consent identifier. |
| MODIFIED | `packages/contracts/src/aiInterviewPersistence.ts` | Backward-compatible audio-v2 consent and mock/real candidate projection. |
| MODIFIED | `services/hr-api/package.json` | Add the isolated delivery check command; no dependencies. |
| MODIFIED | `services/hr-api/src/aiInterviewer/routes.ts` | Safe disabled readiness endpoint and fail-closed non-mock browser media/submission guards. |
| MODIFIED | `services/hr-api/src/aiInterviewer/service.ts` | Scoped generations, ordered/receipt-based trusted ingress, audio-v2 provenance rules and durable PLAY/STOP/close handling. |

All evidence-only files are confined to docs/ai-interviewer/phase-5.4 and listed with SHA-256 in its artifact manifest. [source-changes.json](source-changes.json) contains exact before/after hashes for each source/config difference. Source comparison against accepted Phase 5.3: 3 created, 4 modified, 0 deleted; 0 unexpected paths. Original regression test files and frozen training/model artifacts are unchanged.

Accepted Phase 5.2 source SHA-256: `f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f`.
Accepted Phase 5.3 source SHA-256: `b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8`.
New Phase 5.4 source manifest SHA-256: `9c7c675970cbc16c1b5d42715ce2183b7c01b1f50cd50ea39f15dfb61fa3923c`.
New 428-file source digest: `74d0782e087e5ee8109a86fd6fd42e0990b07898ae6015b126be2b1713022e5a`.
Final source stable throughout verification: **true**; matches tested source: **true**.

- phase-5.1-baseline: 96 files unchanged; artifact manifest SHA-256 `3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67`.
- phase-5.2: 394 files unchanged; artifact manifest SHA-256 `c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342`.
- phase-5.3: 162 files unchanged; artifact manifest SHA-256 `8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900`.
- Earlier protected evidence/training: 608 files unchanged.

## Acceptance criteria

| Criterion | Supported-scope evidence |
|---|---|
| Provider cannot mutate authority | Adapter methods receive request data only; closed observations pass through InterviewService/engine under SQL locks. |
| Trusted/untrusted provenance | Mock-v1 and audio-v2 paths are separate; generation/session/owner checked on every trusted observation. |
| Browser cannot forge STT | Service rejects audio-v2 browser transcript/typed/mock events; no provider callback HTTP endpoint; production browser media disabled. |
| Bounded execution | 15s per async operation, two physical calls, cancellation and late settlement consumption; no synchronous CPU preemption claimed. |
| Duplicate/stale/reordered safety | Existing fingerprinted receipts plus ordered cursor/version/correlation; identical and competing simultaneous events tested. |
| Application-owned PLAY | Durable reservation and idempotency key; no started/finished transition from TTS accepted response; issued-play ACK required. |
| Interruption consistency | Both finish/speech race orders, duplicate starts, late finish, lost/duplicate STOP ACK and interruption reconnect tested. |
| Production fail-closed | Absent/invalid/synthetic production registration unavailable; production route composition disabled and START 503. |
| Server-only credentials | No provider credential configured or returned; safe readiness allowlist; candidate cookie remains HttpOnly. |
| Phase 5.2 preserved | 26 UI, 27 DB and 56 expanded browser checks; protected evidence unchanged. |
| Phase 5.3 preserved | 14 bounds and 30 runtime checks, fairness/restart matrices; protected evidence unchanged. |
| Evaluation separate | No evaluator/report source edits; 76 evidence checks; synthetic completion only creates PENDING frozen evaluation. |
| Existing regressions | Every executable baseline suite/typecheck/build PASS; environment migration and live voice blockers remain separate. |
| Reproducible evidence | Frozen source, exact entrypoints/arguments, raw logs, guarded network counters, protected package hashes. |

## Remaining production blockers and separate limitations

1. **OPEN / BLOCKED: pgvector/full migration chain.** Exact unchanged migration 0008 still fails with missing vector, rolls back and drops only its generated test DB. Fixture-based 0026 checks do not waive it.
2. **OPEN / BLOCKED: Live Voice E2E worker/configuration.** Requires a running STT/TTS worker plus isolated candidate real-engine/transport/connection configuration and actual synthetic-data live validation.

Separate scope limits: one application process/owner; no distributed coordination; asynchronous/cooperative bounds do not preempt CPU loops or DB/event-loop outages; two permanent physical hangs require restart; graceful durable close depends on DB; no active real candidate media/transport/dispatcher or validated real provider connection; bounded utterance envelopes require future segmentation; no real LLM generation. Provider-ready abstractions and synthetic proof do not establish a production interview delivery guarantee.

## Phase 5.5 readiness

Safe only for separately approved, scoped follow-on work. Live/production activation is not ready: real adapter/connection/audio UI/worker E2E and full-chain validation remain open. **Phase 5.5 has NOT STARTED.** Stopped after Phase 5.4; the next phase requires separate authorization/specification.
