# Phase 5.2 — PASS

Release readiness remains **BLOCKED**. Phase 5.1 remains **BLOCKED — environment validation blockers only, with clean executable regression**. Neither accepted blocker is waived.

Recorded 2026-11-03T09:21:41.293Z; display zone Asia/Riyadh. Node v24.15.0, npm 11.12.1, PostgreSQL 18.6, Chrome 156.0.8078.80. Synthetic data and offline mocks only.

## Result

Typed answer submission now has one durable transactional boundary using the existing PostgreSQL row lock, expected version, engine commands, receipt and fingerprint. Refresh-safe per-tab recovery distinguishes local draft, submitting, server-confirmed committed and recovery-required states. Identical retries never create another answer; conflicting reuse and old-turn replacement fail explicitly. A matching answer committed by another tab can be acknowledged through a read-only check without another successful receipt.

No engine rewrite, migration, dependency, real provider/voice/WebRTC, distributed runtime, retention or Phase 5.3 work was added. Evaluation/report behavior and inputHash/evidence verification are unchanged.

## Immutable evidence

Phase 5.1 source manifest SHA-256: `06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163` (matches the accepted value). Its 96 package files and artifact-manifest.json are unchanged. All 608 earlier evidence/training files are unchanged. Final source state stayed byte-identical throughout the final regression run. Final source manifest SHA-256: `f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f`.

## Full test matrix

The runner invokes unchanged original entrypoints, with a test-only network/evidence preload. Four local-voice component rows are the components of the existing combined npm script. Counts marked groups are reported groups, not invented counts of every assert. Phase 4 includes Phase 3 lifecycle coverage; the additional answer browser run includes the same 44 original Phase 3 checks plus 12 new cases. Counts overlap.

| Suite | Command | Result | Count | Node external attempts blocked |
|---|---|---|---|---|
| answer-ui | `node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs` | **PASS** | 26 checks | 0 |
| answer-db | `node --conditions=development --import tsx src/aiInterviewer/answer.check.ts` | **PASS** | 27 checks | 0 |
| engine | `npm.cmd run check:ai-interviewer -w @hr/server` | **PASS** | 37 checks | 0 |
| scenario | `npm.cmd run demo:ai-interviewer -w @hr/server` | **PASS** | — 1 synthetic scenario | 0 |
| persistence | `npm.cmd run check:ai-interviewer:persistence -w @hr/server` | **PASS** | 65 checks | 0 |
| report | `npm.cmd run check:ai-interviewer:report -w @hr/server` | **PASS** | 76 checks | 0 |
| ui | `npm.cmd run check:ai-interviewer:ui -w @hr/server` | **PASS** | 24 checks | 0 |
| mcp | `node --conditions=development --import tsx src/mcp/authorization.security.check.ts` | **PASS** | 18 checks | 0 |
| permissions | `npm.cmd run check:permissions -w @hr/server` | **PASS** | 107 reported assertion/groups | 0 |
| gate | `npm.cmd run check:gate -w @hr/server` | **PASS** | 194 reported assertion/groups | 0 |
| plans | `npm.cmd run check:plans -w @hr/server` | **PASS** | 95 checks | 0 |
| report-security | `node --conditions=development --import tsx src/reports/build.security.check.ts` | **PASS** | 44 checks | 0 |
| voice | `npm.cmd run check:voice -w @hr/server` | **PASS** | 17 reported assertion/groups | 0 |
| local-voice-api | `npm.cmd run check:voice:local -w @hr/server [component 1/4]` | **PASS** | 3 reported assertion/groups | 0 |
| local-voice-audio | `npm.cmd run check:voice:local -w @hr/server [component 2/4]` | **PASS** | 4 reported assertion/groups | 0 |
| local-voice-turn | `npm.cmd run check:voice:local -w @hr/server [component 3/4]` | **PASS** | 8 reported assertion/groups | 0 |
| local-voice-queue | `npm.cmd run check:voice:local -w @hr/server [component 4/4]` | **PASS** | 6 reported assertion/groups | 0 |
| scorecard | `npm.cmd run check:scorecard -w @hr/server` | **PASS** | 27 reported assertion/groups | 0 |
| structured-provider | `node --conditions=development --import tsx src/ai/structuredProvider.check.ts` | **PASS** | 4 reported assertion/groups | 0 |
| typechecks | `npm.cmd run check` | **PASS** | — 3 workspace checks | 0 |
| web-build | `npm.cmd run build -w hr-app` | **PASS** | — 1 production build | 0 |
| browser3 | `npm.cmd run check:ai-interviewer:browser -w @hr/server` | **PASS** | 44 browser checks | 0 |
| browser4 | `npm.cmd run check:ai-interviewer:report:browser -w @hr/server` | **PASS** | 58 browser checks | 0 |
| answer-browser | `node scripts/checkAiInterviewAnswerBrowser.mjs` | **PASS** | 56 browser checks | 0 |
| migrations | `node docs/ai-interviewer/phase-5.2/migrations.mjs` | **BLOCKED** | — full-chain probe | 0 |
| api-build | `npm.cmd run build -w @hr/server` | **PASS** | — 1 production build | 0 |
| contracts-build | `npm.cmd run build -w @hr/shared` | **PASS** | — 1 production build | 0 |
| live-local-voice-e2e | `npm.cmd run check:voice:local:e2e -w @hr/server` | **BLOCKED** | 0, not executed | — |

All executable regression checks passed. The two existing web lint warnings and large-chunk build advisory remain. MCP checks continue to validate live identity/RBAC independently of model classification. No original assertion was removed, relaxed or changed to hide a regression. The existing browser harness/fixture only gained opt-in additive Phase 5.2 cases and private test-process IPC for synthetic DB inspection/fault injection.

## Browser, recovery and durable database matrix

No plaintext answers, UUIDs, cookies or receipt fingerprints are needed in these diagnostic rows. The receipt column counts the particular submission identity; matching text from a different tab may correctly show COMMITTED with zero receipts for the losing identity.

| Scenario | Browser/recovery | Durable state | Version | Answers | Own receipt | Effects |
|---|---|---|---|---|---|---|
| refresh before submit | DRAFT | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| disconnect before request | RECOVERY_REQUIRED | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| reconnect refresh and identical retry | COMMITTED | ACTIVE/PROCESSING | 12 | 1 | 1 | 0 |
| in-flight before commit | SUBMITTING | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| refresh in-flight before commit | RECOVERY_REQUIRED | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| same in-flight identity committed on retry | COMMITTED | ACTIVE/PROCESSING | 12 | 1 | 1 | 0 |
| disconnect during request | RECOVERY_REQUIRED | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| reconnect after in-flight disconnect | COMMITTED | ACTIVE/PROCESSING | 12 | 1 | 1 | 0 |
| server committed, original ACK held | SUBMITTING | ACTIVE/PROCESSING | 12 | 1 | 1 | 0 |
| refresh after commit before original ACK | COMMITTED | ACTIVE/NEXT_QUESTION | 13 | 1 | 1 | 1 |
| database rollback before commit | RECOVERY_REQUIRED | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| same-identity retry after database rollback | COMMITTED | ACTIVE/PROCESSING | 12 | 1 | 1 | 0 |
| two-tab same answer different identity | COMMITTED | ACTIVE/NEXT_QUESTION | 13 | 1 | 1 | 1 |
| two-tab same answer different identity | COMMITTED | ACTIVE/NEXT_QUESTION | 13 | 1 | 0 | 1 |
| two-tab conflicting submission | COMMITTED | ACTIVE/PROCESSING | 12 | 1 | 1 | 0 |
| two-tab conflicting submission | RECOVERY_REQUIRED | ACTIVE/PROCESSING | 12 | 1 | 0 | 0 |
| storage unavailable: no submission sent | DRAFT | ACTIVE/LISTENING | 9 | 0 | 0 | 0 |
| completion with unsubmitted local copy | RECOVERY_REQUIRED | COMPLETED/CLOSING | 13 | 1 | 0 | 0 |

The database matrix additionally records failures at finalized-event insertion, receipt insertion and snapshot update; concurrent same-identity and different-identity races; duplicate processing; deadline closure; new runtime ownership after commit and before commit; and modified resource/session identities. See answer-database-matrix.json. Candidate UX and envelope state transitions, including a simulated renderer crash after receiving ACK but before local transition, are independently asserted in the 26 recovery checks.

Commit-before-ack browser injection holds the original UI request, sends the identical frozen envelope through the same candidate cookie to obtain a real durable commit, then refreshes before the original UI acknowledgement. This tests the transaction/ack boundary without adding a production fault endpoint. Real rollback injection exists only in the local disposable fixture's stdin control path.

## Security and local storage

Every submit/status operation independently authenticates the HttpOnly candidate cookie and interview binding inside the lock, checks the non-secret session generation, and preserves Origin, body/rate limits and candidate DTO allowlists. The envelope is never authority. Other interviews/candidates, stale/expired/revoked sessions, changed question/turn/version, changed content under a reused identity and fresh replay after completion fail safely. The original receipt can confirm historical commit after completion without a new mutation.

sessionStorage contains only bounded answer text, interview/question/turn/session-generation identifiers, expiry and frozen submission id/version. It contains no credentials. Display waits for authenticated matching scope. Commit, security rejection, scope change, expiry and explicit discard clear the local record; storage removal is best effort if the browser blocks storage access, with scope/expiry revalidation before any later display. A changed scope never displays the previous candidate's copy. The record lives at most two hours and within the server-reported session lifetime. Same-origin scripts/device owners can access browser plaintext; it is not cross-device backup. See ../../design.md for exact states, lifetime and cleanup semantics.

## Open release blockers and limitations

1. **OPEN / BLOCKED:** pgvector is unavailable locally. The unaltered full-chain probe again stops at 0008, rolls back and drops only its generated database. Realistic-order validation of 0026 remains unproven; fixture-based PostgreSQL tests are separate evidence.
2. **OPEN / BLOCKED:** live local voice E2E still lacks the STT/TTS worker and isolated synthetic real-engine configuration. No real audio/model inference was attempted.

One process/runtime owner remains required. Restart proof uses a fresh service owner over durable PostgreSQL, not distributed failover or an OS process-kill test. An uncommitted active attempt can recover PAUSED and requires explicit resume/review; local drafts do not extend deadlines. Closing/clearing browser storage, expiry or revocation can remove an uncommitted local copy, and storage failure is explicitly surfaced before any new submit POST. Future evaluator timeout/maintenance, distributed rate limiting, real provider delivery, retention and broader observability risks remain outside Phase 5.2.

## Changes and reproduction

- CREATED `apps/hr-web/src/features/aiInterviewer/AnswerRecoveryNotice.tsx`
- CREATED `apps/hr-web/src/features/aiInterviewer/answerRecovery.ts`
- CREATED `packages/contracts/src/aiInterviewAnswer.ts`
- CREATED `services/hr-api/scripts/checkAiInterviewAnswerBrowser.mjs`
- CREATED `services/hr-api/scripts/checkAiInterviewAnswerBrowserCases.mjs`
- CREATED `services/hr-api/scripts/checkAiInterviewAnswerRecovery.mjs`
- CREATED `services/hr-api/src/aiInterviewer/answer.check.ts`
- MODIFIED `apps/hr-web/src/features/aiInterviewer/MockControls.tsx`
- MODIFIED `apps/hr-web/src/features/aiInterviewer/client.ts`
- MODIFIED `apps/hr-web/src/features/aiInterviewer/session.ts`
- MODIFIED `apps/hr-web/src/features/aiInterviewer/useInterviewSession.ts`
- MODIFIED `apps/hr-web/src/pages/AiInterviewPage.tsx`
- MODIFIED `packages/contracts/src/aiInterviewUi.ts`
- MODIFIED `packages/contracts/src/index.ts`
- MODIFIED `services/hr-api/package.json`
- MODIFIED `services/hr-api/scripts/checkAiInterviewBrowser.mjs`
- MODIFIED `services/hr-api/src/aiInterviewer/routes.ts`
- MODIFIED `services/hr-api/src/aiInterviewer/service.ts`
- MODIFIED `services/hr-api/src/aiInterviewer/ui.fixture.ts`

Only new files under docs/ai-interviewer/phase-5.2 contain this phase's evidence/tooling. source-changes.json records before/after SHA-256 for every changed source/config file; artifact-manifest.json at the package root lists every exact new evidence/tooling filename and its hash. No previous evidence was overwritten.

Use ../../README.md for exact init/all/integrity/cleanup/evidence commands and prerequisite setup. The runner allowlists child configuration, avoids retained .env files, denies external Node socket/fetch traffic, redirects older browser output paths, suppresses credential-bearing fixture writes/screenshots and confines browser profiles to the run's temporary directory. 41 Node processes emitted counters; blocked external attempts=0; real model calls=0. Local PostgreSQL/HTTP/CDP/Vite traffic is expected. Native Chrome background traffic was not independently packet-captured.

Stopped after Phase 5.2. Phase 5.3 requires separate approval.
