# Phase 5.3 — PASS

Release readiness remains **BLOCKED**. Phase 5.1 remains **BLOCKED — environment validation blockers only, with clean executable regression**. Phase 5.2 remains accepted **PASS for its implemented local scope**. Both release blockers remain explicitly OPEN.

Recorded 2026-11-03T10:25:36.582Z (display zone Asia/Riyadh). Node v24.15.0, npm 11.12.1, PostgreSQL 18.6, Chrome 156.0.8078.80. Synthetic disposable data and offline mocks only.

## Runtime architecture: before and after

Before: one serial one-second loop awaited every evaluation before processing active interview timers. An unresolved evaluator left its running flag set and blocked future timer passes. RUNNING recovery used a five-minute lease and attempt-count fencing; stop only cleared the interval.

After: interview timer work and job discovery have independent one-second intervals/reentrancy guards. Evaluator waits stay outside the timer path and outside SQL transactions. Discovery scans at most 64 envelopes and dispatches two logical jobs; the shared coordinator admits two physical calls across service objects for the same database. Shutdown cancels bounded waits, drains logical work, then closes the DB. Domain timer/warning/grace/silence rules remain unchanged. See [before-state](../../before-state.md) and [design](../../design.md).

## Evaluator timeout and cleanup

Production asynchronous wait is **30,000 ms**. Trusted constructor tests may lower it to 1..30,000 ms; HTTP/config cannot disable or raise it. Claim durably records owner, unique execution token, deadline and inputHash before invocation. Timeout aborts the optional signal and commits **FAILED / EVALUATOR_TIMEOUT**, finished attempt and **no report**. Result observed at/after its persisted deadline is refused even if the timer callback had not fired. Rejection/unavailable uses MOCK_EVALUATOR_FAILED; malformed/invalid evidence uses EVIDENCE_VALIDATION_FAILED. No fabricated report is emitted.

Uncancellable work retains its physical slot until settlement; late fulfillment/rejection is consumed and emits only a safe fenced diagnostic. Two permanently hung calls require restart. Further eligible attempts fail EVALUATOR_CAPACITY_EXHAUSTED without invoking an evaluator. Shutdown produces EVALUATOR_CANCELLED and drains logical promises without waiting for uncancellable physical work.

This bounds asynchronous/cooperative waits. It cannot preempt synchronous CPU loops, a stalled Node event loop or an unavailable database. Trusted evaluator code must return/yield promptly. No process/worker isolation is added or claimed.

## Maintenance fairness

- **deterministic fairness:** observed in 10 ms, server-clock deadline delay 0 ms, hanging job RUNNING, other job COMPLETED, active answer count 1.
- **native fairness:** observed in 846 ms, server-clock deadline delay 0 ms, hanging job RUNNING, other job COMPLETED, active answer count 1.

Supported tolerance is one 1,000 ms interval plus finite active-row scan/DB/event-loop latency. Native local fixture acceptance is less than 2,000 ms wall time after injection; its service clock is controlled at the exact due timestamp. The zero server-clock delay is an assertion under that controlled clock, not a measured zero wall-clock latency. No deadline is extended. There is no hard real-time guarantee under arbitrary load/outage. A healthy one-hang/one-normal pair leaves the second slot usable. Finite queues drain at two jobs per scan subject to the execution bound and SQL completion; exhausted physical capacity becomes explicit failure.

## Restart and failure-injection matrix

These are real disposable PostgreSQL states, not in-memory persistence substitutes. Restart uses new runtime/service ownership over the same durable rows, rather than OS process kill. Attempt status is derived from persisted finishedAt/failureCode. Detailed rows include correlation IDs, full hashes, owner/deadline, audit actions, interview version and retry eligibility in [runtime-matrix.json](runtime-matrix.json). Invalid/corrupted input is deliberately not retryable; the deliberately replaced hash is expected to show false in the preservation column.

| Scenario | Job | Attempts | Retry eligible | Report/evidence | Original hash preserved | Report version/count | Answers preserved |
|---|---|---|---|---|---|---|---|
| pending | PENDING | none | false | none | true | 1/1 | true |
| success | COMPLETED | 1:COMPLETED | false | VALID | true | 1/1 | true |
| exception | FAILED | 1:FAILED/MOCK_EVALUATOR_FAILED | true | none | true | 1/1 | true |
| unavailable | FAILED | 1:FAILED/MOCK_EVALUATOR_FAILED | true | none | true | 1/1 | true |
| malformed | FAILED | 1:FAILED/EVIDENCE_VALIDATION_FAILED | true | none | true | 1/1 | true |
| invalid-evidence | FAILED | 1:FAILED/EVIDENCE_VALIDATION_FAILED | true | none | true | 1/1 | true |
| timeout | FAILED | 1:FAILED/EVALUATOR_TIMEOUT | true | none | true | 1/1 | true |
| late A after authoritative B | COMPLETED | 1:FAILED/EVALUATOR_TIMEOUT, 2:COMPLETED | false | VALID | true | 1/1 | true |
| legacy lease reclaim | COMPLETED | 1:FAILED/WORKER_LEASE_EXPIRED, 2:COMPLETED | false | VALID | true | 1/1 | true |
| restart PENDING | COMPLETED | 1:COMPLETED | false | VALID | true | 1/1 | true |
| restart RUNNING | COMPLETED | 1:FAILED/WORKER_RESTARTED, 2:COMPLETED | false | VALID | true | 1/1 | true |
| restart after durable commit | COMPLETED | 1:COMPLETED | false | VALID | true | 1/1 | true |
| restart timeout FAILED | COMPLETED | 1:FAILED/EVALUATOR_TIMEOUT, 2:COMPLETED | false | VALID | true | 1/1 | true |
| restart timeout RETRY_PENDING | COMPLETED | 1:FAILED/EVALUATOR_TIMEOUT, 2:COMPLETED | false | VALID | true | 1/1 | true |
| legacy RUNNING after lease | COMPLETED | 1:FAILED/WORKER_LEASE_EXPIRED, 2:COMPLETED | false | VALID | true | 1/1 | true |
| failure failure retry success | COMPLETED | 1:FAILED/MOCK_EVALUATOR_FAILED, 2:FAILED/EVIDENCE_VALIDATION_FAILED, 3:COMPLETED | false | VALID | true | 1/1 | true |
| result at deadline | FAILED | 1:FAILED/EVALUATOR_TIMEOUT | true | none | true | 1/1 | true |
| shutdown while RUNNING | FAILED | 1:FAILED/EVALUATOR_CANCELLED | true | none | true | 1/1 | true |
| physical capacity exhausted | FAILED | 1:FAILED/EVALUATOR_CAPACITY_EXHAUSTED | true | none | true | 1/1 | true |
| input corruption before claim | FAILED | 1:FAILED/EVALUATION_INPUT_CHANGED | false | none | true | 1/1 | true |
| source and hash replaced during claim | FAILED | 1:FAILED/EVALUATION_INPUT_CHANGED | false | none | false | 1/1 | true |
| invalid durable envelope | FAILED | none | false | none | true | 1/1 | true |

Additional measured states:

- **explicit stale A result:** `{"scenario":"explicit stale A result","lateAttemptReturned":true,"authoritativeAttempt":2,"reportUnchanged":true,"inputHashUnchanged":true,"reportVersion":1}`
- **restart interview ACTIVE:** `{"scenario":"restart interview ACTIVE","interviewStatus":"PAUSED","remainingMs":75000,"version":12,"answerCount":0}`
- **restart interview PAUSED:** `{"scenario":"restart interview PAUSED","interviewStatus":"PAUSED","remainingMs":75000,"version":11,"answerCount":0}`
- **deterministic fairness:** `{"scenario":"deterministic fairness","maintenanceIntervalMs":1000,"fixtureToleranceMs":2000,"observedWallMs":10,"serverDeadlineDelayMs":0,"activeAnswerCount":1,"hangingJobStatus":"RUNNING","otherJobStatus":"COMPLETED","physicalCalls":1}`
- **native fairness:** `{"scenario":"native fairness","maintenanceIntervalMs":1000,"fixtureToleranceMs":2000,"observedWallMs":846,"serverDeadlineDelayMs":0,"activeAnswerCount":1,"hangingJobStatus":"RUNNING","otherJobStatus":"COMPLETED","physicalCalls":1}`

ACTIVE restart pauses at durable lastObservedAt; PAUSED restart preserves its frozen duration. Both assert 75,000 ms and exact resume deadline. PENDING runs the same frozen job. New-format RUNNING changes owner immediately, finishes former attempt WORKER_RESTARTED and uses the same job/version. Legacy ownerless/deadlineless RUNNING retains the five-minute lease. COMPLETED after lost acknowledgement is a no-op. FAILED stays failed until explicit RETRY; committed RETRY/PENDING survives restart and completes version 1. No duplicate authoritative reports appear.

## Stale completion and retry integrity

Attempt A and B intentionally return different valid summaries. A times out, HR retries the same frozen job, B becomes authoritative, then A returns. The exact durable evaluation row, report, inputHash, reportVersion and interview aggregate version/sequence remain unchanged. A former-owner/lease worker is likewise fenced. Terminal write requires RUNNING, matching attempt count, execution token and owner, plus current hash matching both the original claim and independently recomputed frozen input.

Two failures followed by successful retries preserve version 1, frozen input and inputHash. Explicit REEVALUATE separately produces version 2 and leaves the prior report intact. A first-available-attempt hash anchor also supports legacy histories. Replacing input and its current hash together during execution is refused and cannot silently rebase RETRY. Existing request fingerprints/receipts and transactional authorization remain authoritative.

## Complete test results and exact commands

| Suite | Command | Result | Count |
|---|---|---|---|
| execution-bounds | `node --conditions=development --import tsx src/aiInterviewer/execution.check.ts` | **PASS** | 14 checks/scenarios |
| runtime-jobs | `node --conditions=development --import tsx src/aiInterviewer/runtime.check.ts` | **PASS** | 30 checks/scenarios |
| answer-ui | `node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs` | **PASS** | 26 checks/scenarios |
| answer-db | `node --conditions=development --import tsx src/aiInterviewer/answer.check.ts` | **PASS** | 27 checks/scenarios |
| engine | `npm.cmd run check:ai-interviewer -w @hr/server` | **PASS** | 37 checks/scenarios |
| scenario | `npm.cmd run demo:ai-interviewer -w @hr/server` | **PASS** | — 1 synthetic scenario |
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
| contracts-build | `npm.cmd run build -w @hr/shared` | **PASS** | — 1 production build |
| api-build | `npm.cmd run build -w @hr/server` | **PASS** | — 1 production build |
| web-build | `npm.cmd run build -w hr-app` | **PASS** | — 1 production build |
| browser3 | `npm.cmd run check:ai-interviewer:browser -w @hr/server` | **PASS** | 44 browser checks |
| browser4 | `npm.cmd run check:ai-interviewer:report:browser -w @hr/server` | **PASS** | 58 browser checks |
| answer-browser | `node scripts/checkAiInterviewAnswerBrowser.mjs` | **PASS** | 56 browser checks |
| migrations | `node docs/ai-interviewer/phase-5.3/migrations.mjs` | **BLOCKED** | — full-chain probe |
| live-local-voice-e2e | `npm.cmd run check:voice:local:e2e -w @hr/server` | **BLOCKED** | not executed |

New checks are 14 execution-bound checks plus 30 PostgreSQL runtime/job checks. All original relevant executable suites are rerun. Counts overlap: Phase 4 includes Phase 3, and expanded answer browser includes its original 44 plus 12 Phase 5.2 cases. Reported groups are not invented counts of every assert. MCP is 18 scenarios with 69 tools per invalid-auth state; the log's summary line is not another scenario. Original assertions were not weakened. The fixture change only awaits shutdown. Two existing web lint warnings and the large-chunk build advisory remain.

Raw per-suite logs, exit codes, UTC timestamps, actual Node arguments and loopback port allowlists are beside this report. inventory.json records the human npm command and actual direct entrypoint; its superficial entryExists check can be false for npm build arguments even though the recorded production build ran successfully. See [README](../../README.md) for reproducible init/all/integrity/cleanup/evidence commands.

## Security, evidence verification and diagnostics

HR/resource/staff checks, candidate isolation, HttpOnly sessions, Origin policy, DTO allowlists, expected versions, command receipts and answer atomicity remain intact. Candidate recovery/security regressions all PASS. Evaluator output never controls authorization; malformed output with authorization-shaped fields fails evidence/schema verification. No real provider was added. Application hiring status is unchanged by evaluation execution.

Operational diagnostics allow only event, interview/evaluation IDs, reportVersion, attempt and safe code. They omit raw exceptions, SQL, prompts, answers, report content, personal names and credentials. Sink failure cannot change authority. Attempt timeout and recovery audits are transactional; start/completed recovery audits disappear on rollback. System actors use system source. Raw runtime evidence contains only synthetic correlation metadata/hashes and audit action names, with a closed-key/privacy assertion.

Instrumented Node processes: 43; guarded external network attempts: **0**; real model calls: **0**. Only allowed local PostgreSQL/HTTP/CDP/Vite traffic is used. Native Chrome background traffic is not independently packet-captured. Old fixture credentials/screenshots are suppressed and browser profiles removed by the bounded cleanup command.

## Source changes and immutable evidence

Compared with accepted Phase 5.2 source: 4 created, 9 modified, 0 deleted. Unexpected paths: 0; expected-but-unchanged paths: 0. No migrations/dependencies added. Existing Phase 5.1/5.2 tooling is unchanged; all new evidence/tooling is under Phase 5.3.

| Change | Exact file | Purpose |
|---|---|---|
| CREATED | `services/hr-api/src/aiInterviewer/execution.check.ts` | 14 offline execution-bound checks. |
| CREATED | `services/hr-api/src/aiInterviewer/execution.ts` | 30-second asynchronous bound, cancellation, two physical slots, late-settlement consumption. |
| CREATED | `services/hr-api/src/aiInterviewer/runtime.check.ts` | 30 real disposable-PostgreSQL fairness/restart/failure/integrity checks. |
| CREATED | `services/hr-api/src/aiInterviewer/runtimeTestSupport.ts` | Deterministic scheduler/deferred test helpers. |
| MODIFIED | `packages/contracts/src/aiInterviewReport.ts` | Optional backward-compatible persisted attempt owner/token/deadline/hash fields. |
| MODIFIED | `services/hr-api/package.json` | Two additive local check commands; no dependency changes. |
| MODIFIED | `services/hr-api/src/aiInterviewer/audit.ts` | Safe attempt/timeout/recovery audit metadata and system source. |
| MODIFIED | `services/hr-api/src/aiInterviewer/report.ts` | Optional AbortSignal context for the existing evaluator interface. |
| MODIFIED | `services/hr-api/src/aiInterviewer/reportService.ts` | Bounded attempts, durable owner/token/deadline fencing, claim-hash and retry anchors. |
| MODIFIED | `services/hr-api/src/aiInterviewer/runtime.ts` | Independent timer/job passes, bounded dispatch and graceful drain. |
| MODIFIED | `services/hr-api/src/aiInterviewer/service.ts` | Transactional start/completed audit around existing restart recovery. |
| MODIFIED | `services/hr-api/src/aiInterviewer/ui.fixture.ts` | Await asynchronous maintenance shutdown before closing the test database; assertions unchanged. |
| MODIFIED | `services/hr-api/src/index.ts` | Await maintenance drain before database shutdown. |

[source-changes.json](source-changes.json) contains exact before/after SHA-256 values. Final source has 425 files; stable throughout the authoritative run: **true**; final manifest matches tested source: **true**.

- Phase 5.1 accepted source SHA-256: `06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163`.
- Phase 5.1 artifact manifest SHA-256: `3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67`; 96 listed files unchanged.
- Phase 5.2 accepted source SHA-256: `f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f`.
- Phase 5.2 artifact manifest SHA-256: `c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342`; 394 listed files unchanged.
- Earlier evidence/training: 608 files unchanged.
- New final source manifest SHA-256: `b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8`.
- New source files digest: `e311bf81582b3f0e8474b2c74981ea51b28245afe68bf3c42e29c9e884433f36`.

## Acceptance criteria

| Criterion | Evidence |
|---|---|
| Bounded evaluator wait | execution-bounds 14/14; runtime timeout, at-deadline commit refusal and two physical-call admission checks. |
| Timer independence | Independent timer pass; deterministic/native fairness while A remains RUNNING and B completes. |
| Timeout cannot succeed | FAILED/EVALUATOR_TIMEOUT, finished attempt, null report; at-deadline output also refused. |
| Stale completion cannot overwrite | Distinct A/B valid summaries; raw job/report/hash and aggregate version/sequence unchanged after late A. |
| Frozen retry input/hash | Repeated failure/retry uses the same input/hash; corruption and consistent replacement are refused. |
| Retry preserves reportVersion | Two retries finish version 1; only explicit REEVALUATE creates version 2. |
| RUNNING restart | Fresh owner immediately fences old attempt; legacy attempt recovers after bounded five-minute lease. |
| ACTIVE/PAUSED restart | Both recover PAUSED with 75,000 ms; resume derives its deadline from that exact duration. |
| Mandatory evidence verification | Success is VALID; malformed/invalid-evidence output fails without report; report regression 76/76. |
| Phase 5.2 recovery | 26/26 UI, 27/27 PostgreSQL and expanded 56/56 browser checks. |
| Phase 1–4 regression | All executable original suites/builds PASS; counts and raw logs below. |
| No real external/model calls | Guarded external attempts 0, real model calls 0; synthetic/offline adapters only. |
| Reproducible evidence | Allowlisted runner, raw results, exact commands, stable final source and unchanged accepted packages. |
| Single-process assumptions | New owner means restart; no distributed leadership or CPU worker isolation claimed. |

## Remaining blockers and separate local limitations

1. **OPEN / BLOCKED — pgvector / full migration chain.** The unchanged full-chain probe still stops at 0008; its transaction rolls back and only its generated DB is dropped. Synthetic-parent 0026 persistence tests do not establish full-chain validity.
2. **OPEN / BLOCKED — live local voice E2E.** STT/TTS worker and isolated synthetic real-engine configuration remain unavailable. No real audio/model inference was attempted.

Separate supported-scope limitations:

- One application process/runtime owner and one database coordinator; no distributed ownership or multi-instance failover.
- The 30-second bound covers asynchronous/cooperative evaluator waits. In-process JS cannot preempt synchronous CPU-blocking code; evaluator code must return/yield promptly.
- No hard real-time guarantee during event-loop stalls, database outages or arbitrary workload. Timer tolerance is one second plus finite scan/DB/scheduling latency.
- Uncancellable calls retain physical slots. Two permanently stuck calls exhaust capacity and require restart; new attempts fail explicitly without a report.
- Legacy RUNNING attempts lacking owner/deadline use the existing five-minute recovery lease.
- Restart proof uses fresh runtime/service ownership over real durable PostgreSQL, not an OS process-kill test.
- Graceful logical drain still depends on database availability; interrupted RUNNING state is reconciled by the next owner.
- Production evaluator timeout is verified as a constant/config bound; native timing uses a reduced trusted test timeout and deterministic PostgreSQL cases use a manual clock.
- Native Chrome background traffic is not independently packet-captured. Instrumented application network/model attempts remain zero.

## Phase 5.4 readiness

Ready for separately approved isolated implementation of the delivery gate. Production activation remains blocked by the two existing release blockers and the documented execution limits. Phase 5.4 — Real Interview Delivery Gate has **not started**. No real STT/TTS/LLM/provider/WebRTC, distributed ownership, retention or unrelated refactor was implemented. STOP after Phase 5.3; separate approval is required for Phase 5.4.
