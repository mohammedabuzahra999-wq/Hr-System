# Trusted candidate audio transport — PASS

**Implementation and synthetic verification: PASS for the supported local single-process scope. Overall release readiness and Live Voice E2E: BLOCKED.**

Recorded 2026-11-05T08:14:06.719Z; run final-20261105. No real API credential was supplied; real provider/model/external calls: **zero**. No local model/Ollama, dependency, database migration, WebRTC, streaming service, LLM orchestration or evaluation integration was added.

## Delivered behavior

The candidate explicitly permits microphone use and consents to each recording. Supported native MediaRecorder containers are locally decoded/resampled into canonical PCM16 mono 16kHz WAV. The existing HttpOnly candidate session authenticates a complete binary HTTP upload to the HR API. The server validates MIME/container/sample duration/size and rechecks candidate, session, runtime owner, turn, question, generation, state, version and deadlines. Only the server-registered STT provider can produce the finalized answer transcript; browser transcripts/provider receipts/evaluation fields are rejected.

Capture reservations and attempt/status records use existing PostgreSQL events and command receipts. STT runs outside SQL locking; transcript, speech finish, final answer, commit receipt and interview snapshot commit in one transaction. Stable identity plus pinned server-computed audio fingerprint prevents conflicting reuse and duplicate durable effects. Response loss/retry/restart recovery checks actual durable answer evidence before returning COMMITTED. Pending old-owner work, stale attempts, cancellation, pause and replaced generations cannot commit a late result.

The UI distinguishes local-only recording, permission/recording, upload, processing, durable commitment, retry and closure. It persists a minimal scoped envelope and temporary WAV in IndexedDB before sending. Refresh restores completed recordings without reopening the microphone; unfinished recording is explicitly interrupted. Disconnect and ambiguous responses retain/reconcile the same logical submission rather than claiming success. Existing mock behavior is unchanged with capture default off.

Enabling AI_INTERVIEW_AUDIO_UPLOAD_ENABLED requires valid server STT configuration; missing selection/key/model fails closed. No credential reaches frontend DTOs/storage. The complete real interview delivery gate remains closed until live START/TTS/downlink/playback/STOP and worker composition are implemented and validated. This task delivers the uplink for already active/listening turns; a key alone does not create a working real interview.

See [before-state](../../before-state.md) and [API, recovery, storage and configuration contract](../../README.md) for exact endpoint/state/security details.

## New synthetic verification

- **37/37 transport/security/PostgreSQL checks PASS**: valid upload, reservation/commit replay, conflicting fingerprints, simultaneous same/different identities, wrong candidate/session/turn/version/generation, revoked/expired sessions, invalid Origin, forged transcript, malformed/oversized/short/long audio, interrupted/slow upload, physical admission limits, STT failure/malformed response/timeout, late retry settlement, pause/replaced-generation fences, audio-v2 authority, cancellation and pre-reservation cancellation, SQL rollback, new-owner recovery, flood controls, private DTOs and production configuration.
- **29/29 UI checks PASS**: WAV encoding/validation, storage/privacy scope, quota/unavailable store, local-only state, stable retry/double click, authenticated commit reconciliation, expiry, auth failure, missing receipt, cleanup error, disabled behavior and late permission cleanup.
- **28/28 native Chrome checks PASS**: 14 existing authenticated HR/invite/setup assertions and 14 native virtual-microphone capture/recovery/privacy assertions. Actual MediaRecorder/AudioContext/WAV/IndexedDB/HTTP paths are exercised. Permission denial, pre-request interruption, post-commit response loss, STT failure, real 15s timeout, refresh during processing and recording, old result release and re-recording are covered. Three answers finalize exactly once in the browser flow. No hardware microphone or cloud STT is used.
- Existing speech contracts remain **58/58 PASS**, using **31 synthetic SDK requests**, zero real calls.

Exact assertions are retained in audio-transport.log, audio-ui.log and browser/audio-browser/ai-interviewer-phase3/browser-results.json. The durable matrix records real row version, phase, answer count, finalized DOMAIN-event count and successful audio-commit receipt count:

| Scenario | Durable interview | Version | Answers | Finalized events | Commit receipts | STT calls |
|---|---|---|---|---|---|---|
| valid upload | ACTIVE/PROCESSING | 13 | 1 | 1 | 1 | 1 |
| response-loss duplicate | ACTIVE/PROCESSING | 13 | 1 | 1 | 1 | 1 |
| simultaneous duplicate | ACTIVE/PROCESSING | 13 | 1 | 1 | 1 | 1 |
| interrupted body retry | ACTIVE/PROCESSING | 13 | 1 | 1 | 1 | 1 |
| STT error safe | ACTIVE/LISTENING | 12 | 0 | 0 | 0 | 1 |
| STT error safe | ACTIVE/LISTENING | 12 | 0 | 0 | 0 | 1 |
| timeout retry late fence | ACTIVE/PROCESSING | 15 | 1 | 1 | 1 | 2 |
| stale paused STT | PAUSED/LISTENING | 13 | 0 | 0 | 0 | 1 |
| audio-v2 commit | PAUSED/PROCESSING | 18 | 1 | 1 | 1 | 1 |
| rollback then retry | ACTIVE/PROCESSING | 15 | 1 | 1 | 1 | 2 |
| privacy | ACTIVE/PROCESSING | 13 | 1 | 1 | 1 | 1 |

Failure-before-commit is proven using an injected SQL trigger failure at answer-event insertion: zero answer, zero final text, zero finalization/evaluation event and zero successful audio commit receipt survive. Retry after removal succeeds. This test uses real disposable PostgreSQL and exact migration 0026 on synthetic parent tables; it does not substitute for full-chain validation.

## Recovery/failure/security matrix

| Scenario | Browser behavior | Durable outcome / authority |
|---|---|---|
| Permission denied | Safe denial; retry remains explicit | No audio reservation/answer |
| READY refresh | Same WAV and stable identity restored; explicitly local, not submitted | Reservation only, no committed answer |
| Recording refresh | Unflushed samples unavailable; interrupted state, explicit re-record | No success or invented answer |
| Disconnect before/during upload | Retry required; retain completed WAV within deadline | No partial upload can become an answer |
| Commit response lost | Reconcile authenticated status | One answer/commit receipt; no second STT on exact replay |
| STT failure/timeout | Retry required, no success | Attempt marked recoverable; late settlement fenced |
| Refresh while processing | Restore envelope and poll authorized status | Only current attempt may commit |
| Conflicting bytes / competing identity | Safe conflict/recovery state | Fingerprint/turn lock denies second answer |
| New runtime owner | Reconcile committed receipt; old pending generation closed | Durable commit survives, pending work not fabricated |
| Wrong interview/session/turn or forged generation | Safe authorization/conflict error | Cookie/service/SQL checks reject independently of rate limits |
| Expired/revoked candidate | Clear recovery attempt; session error | No upload/commit permitted |
| Oversized/malformed WAV or body stall | Safe bounded failure | No STT or durable answer before accepted input |
| SQL finalization fails | No successful UI acknowledgement | All answer/final transcript/commit effects roll back |
| Candidate report access | Existing authorization error | Candidate cannot gain staff report authority |

## Limits, privacy and shutdown

Canonical WAV is 250–120,000ms, <=3,840,044 bytes; duration derives from exact PCM sample count. Body upload has a 15s total deadline and two process-local readers. STT has <=15s logical timeout and two physical slots; uncancellable work retains a slot until settlement/process exit. Per candidate-session minute: six uploads, twenty begin/cancel operations, sixty status operations, plus the existing general limiter. Authorization remains independent.

IndexedDB stores only the scoped recovery identifiers/consent/version/generation/expiry fields and temporary WAV Blob. A random nonsecret sessionStorage tab identifier selects a recovery slot. No invite/session/API secret, transcript, evaluation or provider receipt is persisted there. WAV expires at the earlier capture/turn/session deadline, <=120s; metadata lasts at most the existing candidate session expiry. Success/cancel/auth failure attempts deletion. Active observation/next database open removes expired data; physical deletion cannot run while the browser is closed. Storage eviction, profile loss and shared-profile/XSS access remain limitations. The UI reports cleanup failure without denying a real durable commit. Server raw audio stays transient in memory, absent from DB/disk/logs; existing finalized transcript persistence remains.

One-process/one-runtime-owner assumptions remain. Timers continue during recording/STT and may close a turn. The existing 10s global shutdown grace may force exit before a 15s operation finishes; it cannot fabricate success. Committed answers reconcile durably, old pending owner/generations close after restart. No distributed limits, CPU preemption or uninterrupted pending-STT restart guarantee is claimed. Existing shutdown/restart/evaluator/provider fencing regressions pass.

## Exact application changes

**10 created, 11 modified, zero deleted; no unexpected source paths.**

| Change | File | Purpose |
|---|---|---|
| CREATED | `apps/hr-web/src/features/aiInterviewer/AudioAnswerPanel.tsx` | Explicit consent, recording/local-only/upload/processing/commit/retry/closed UX. |
| CREATED | `apps/hr-web/src/features/aiInterviewer/audioRecovery.ts` | Session-scoped per-tab IndexedDB WAV envelope, identity preservation, authenticated reconciliation and expiry. |
| CREATED | `apps/hr-web/src/features/aiInterviewer/microphone.ts` | Native microphone permission/capture, bounded cleanup and local PCM WAV encoding. |
| CREATED | `packages/contracts/src/aiInterviewAudio.ts` | Strict public audio request/result contracts and canonical bounds. |
| CREATED | `services/hr-api/scripts/checkCandidateAudioBrowser.mjs` | Reproducibly derived existing HR/candidate harness plus native virtual-microphone tests. |
| CREATED | `services/hr-api/scripts/checkCandidateAudioBrowserCases.mjs` | Permission/record/refresh/retry/STT/fencing/privacy browser assertions. |
| CREATED | `services/hr-api/scripts/checkCandidateAudioUi.mjs` | 29 synthetic encoding/storage/recovery/uncertainty/privacy UI checks. |
| CREATED | `services/hr-api/src/aiInterviewer/audioContracts.ts` | Server-only durable ticket, attempt and transcript schemas. |
| CREATED | `services/hr-api/src/aiInterviewer/audioTransport.check.ts` | 37 PostgreSQL/HTTP/STT/security/rollback/restart/configuration checks. |
| CREATED | `services/hr-api/src/aiInterviewer/audioTransport.ts` | Bounded authenticated WAV reader, registered STT invocation, safe failures and cancellation. |
| MODIFIED | `apps/hr-web/src/features/aiInterviewer/client.ts` | Cookie-authenticated bounded JSON/binary audio API calls. |
| MODIFIED | `apps/hr-web/src/features/aiInterviewer/session.ts` | Own audio recovery controller only when capture is server-enabled. |
| MODIFIED | `apps/hr-web/src/features/aiInterviewer/useInterviewSession.ts` | Observe/reconcile audio state; stop tracks and warn on pending navigation. |
| MODIFIED | `apps/hr-web/src/pages/AiInterviewPage.tsx` | Mount audio panel and accurate consent/completion text; preserve disabled mock behavior. |
| MODIFIED | `packages/contracts/src/index.ts` | Export shared audio schemas. |
| MODIFIED | `services/hr-api/package.json` | Add three synthetic audio verification commands; no dependency changes. |
| MODIFIED | `services/hr-api/src/aiInterviewer/routes.ts` | Authenticated Origin-protected begin/upload/status/cancel with bounded per-session rates. |
| MODIFIED | `services/hr-api/src/aiInterviewer/service.ts` | Existing PostgreSQL receipts/events for capture reservation, atomic answer finalization and stale fences. |
| MODIFIED | `services/hr-api/src/aiInterviewer/ui.fixture.ts` | Opt-in test-only synthetic STT control/inspection for native browser suite. |
| MODIFIED | `services/hr-api/src/env.ts` | Default-off audio capture flag; require valid server STT registration when enabled. |
| MODIFIED | `services/hr-api/src/index.ts` | Register transport from existing server STT registry and close admission on shutdown. |

All other added evidence files are confined to docs/ai-interviewer/candidate-audio-transport and enumerated by its artifact manifest. No accepted source test assertion was weakened; the new browser harness is derived into a separate script.

## Regression, type checks and production builds

38 completed PASS suite/command results plus one explicitly BLOCKED full migration probe. Browser counts overlap base cases and are not additive unique scenarios. MCP covers 18 lifecycle scenarios, with 69 tools per invalid-auth state. Exact commands/results:

| Suite | Result | Checks | Command | Evidence directory relative to this package |
|---|---|---|---|---|
| audio-ui | **PASS** | 29/29 | `npm.cmd run check:ai-interviewer:audio:ui -w @hr/server` | runs/final-20261105 |
| audio-browser | **PASS** | 28/28 | `node scripts/checkCandidateAudioBrowser.mjs` | runs/final-20261105 |
| audio-transport | **PASS** | 37/37 | `npm.cmd run check:ai-interviewer:audio -w @hr/server` | runs/final-20261105 |
| speech-contract | **PASS** | 58/58 | `npm.cmd run check:ai-interviewer:speech -w @hr/server` | runs/final-20261105 |
| synthetic-e2e | **PASS** | 27/27 | `node --conditions=development --import tsx docs/ai-interviewer/phase-5.6/synthetic.check.ts` | runs/final-20261105 |
| operations | **PASS** | 41/41 | `node --conditions=development --import tsx src/aiInterviewer/operations.check.ts` | runs/final-20261105 |
| operations-db | **PASS** | 26/26 | `node --conditions=development --import tsx src/aiInterviewer/operations.persistence.check.ts` | runs/final-20261105 |
| provider-gate | **PASS** | 51/51 | `node --conditions=development --import tsx src/aiInterviewer/delivery.check.ts` | runs/final-20261105 |
| execution-bounds | **PASS** | 14/14 | `node --conditions=development --import tsx src/aiInterviewer/execution.check.ts` | runs/final-20261105 |
| runtime-jobs | **PASS** | 30/30 | `node --conditions=development --import tsx src/aiInterviewer/runtime.check.ts` | runs/final-20261105 |
| answer-ui | **PASS** | 26/26 | `node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs` | runs/final-20261105 |
| answer-db | **PASS** | 27/27 | `node --conditions=development --import tsx src/aiInterviewer/answer.check.ts` | runs/final-20261105 |
| engine | **PASS** | 37/37 | `npm.cmd run check:ai-interviewer -w @hr/server` | runs/final-20261105 |
| scenario | **PASS** | command/probe | `npm.cmd run demo:ai-interviewer -w @hr/server` | runs/final-20261105 |
| persistence | **PASS** | 65/65 | `npm.cmd run check:ai-interviewer:persistence -w @hr/server` | runs/final-20261105 |
| report | **PASS** | 76/76 | `npm.cmd run check:ai-interviewer:report -w @hr/server` | runs/final-20261105 |
| ui | **PASS** | 24/24 | `npm.cmd run check:ai-interviewer:ui -w @hr/server` | runs/final-20261105 |
| mcp | **PASS** | 18/18 | `node --conditions=development --import tsx src/mcp/authorization.security.check.ts` | runs/final-20261105 |
| permissions | **PASS** | 107/107 | `npm.cmd run check:permissions -w @hr/server` | runs/final-20261105 |
| gate | **PASS** | 194/194 | `npm.cmd run check:gate -w @hr/server` | runs/final-20261105 |
| plans | **PASS** | 95/95 | `npm.cmd run check:plans -w @hr/server` | runs/final-20261105 |
| report-security | **PASS** | 44/44 | `node --conditions=development --import tsx src/reports/build.security.check.ts` | runs/final-20261105 |
| voice | **PASS** | 17/17 | `npm.cmd run check:voice -w @hr/server` | runs/final-20261105 |
| local-voice-api | **PASS** | 3/3 | `npm.cmd run check:voice:local -w @hr/server [component 1/4]` | runs/final-20261105 |
| local-voice-audio | **PASS** | 4/4 | `npm.cmd run check:voice:local -w @hr/server [component 2/4]` | runs/final-20261105 |
| local-voice-turn | **PASS** | 8/8 | `npm.cmd run check:voice:local -w @hr/server [component 3/4]` | runs/final-20261105 |
| local-voice-queue | **PASS** | 6/6 | `npm.cmd run check:voice:local -w @hr/server [component 4/4]` | runs/final-20261105 |
| scorecard | **PASS** | 27/27 | `npm.cmd run check:scorecard -w @hr/server` | runs/final-20261105 |
| structured-provider | **PASS** | 4/4 | `node --conditions=development --import tsx src/ai/structuredProvider.check.ts` | runs/final-20261105 |
| typechecks | **PASS** | command/probe | `npm.cmd run check` | runs/final-20261105 |
| contracts-build | **PASS** | command/probe | `npm.cmd run build -w @hr/shared` | runs/final-20261105 |
| api-build | **PASS** | command/probe | `npm.cmd run build -w @hr/server` | runs/final-20261105 |
| web-build | **PASS** | command/probe | `npm.cmd run build -w hr-app` | runs/final-20261105 |
| secret-scan | **PASS** | 1/1 | `node scripts/checkInterviewSecrets.mjs` | runs/final-20261105 |
| secret-canary | **PASS** | 1/1 | `node docs/ai-interviewer/stt-tts-provider-layer/secret-check.mjs` | runs/final-20261105 |
| browser3 | **PASS** | 44/44 | `npm.cmd run check:ai-interviewer:browser -w @hr/server` | runs/browser-recheck-20261105 |
| browser4 | **PASS** | 58/58 | `npm.cmd run check:ai-interviewer:report:browser -w @hr/server` | runs/final-20261105 |
| answer-browser | **PASS** | 56/56 | `node scripts/checkAiInterviewAnswerBrowser.mjs` | runs/final-20261105 |
| migrations | **BLOCKED** | command/probe | `node docs/ai-interviewer/candidate-audio-transport/migrations.mjs` | runs/final-20261105 |

Browser attempt history:

- browser3: initial **FAIL**, exit 1; isolated unchanged-source result **PASS**, 44/44. Initial 20/21 warning/grace speaking observation failed (one command, version 24, LISTENING, speaking=false). Original logs/raw result retained. Separate metadata-only diagnostic copy passed 44/44, followed by original unchanged isolated suite 44/44. No assertion/timer was loosened; exact root cause remains unproven. See browser-investigation.md and safe metadata trace.

The all-command stopped with exit 1 at the original Phase 3 failure. Only that affected suite was isolated for recheck; browser4, answer-browser and migrations were then resumed individually. The additional diagnostic copy also passed 44/44 but is not counted among the 38 main PASS suites. See [browser investigation](../../browser-investigation.md) for safe trace observations and their limits. This is an unresolved timing-sensitive test observation, not a proven root cause or a claimed stability fix.

Development attempts are retained, including failed new-fixture/setup cases and their corrections. Their logs/results were not overwritten or counted as final PASS. Production contracts/API/web builds pass. Type/lint checks have zero errors, two pre-existing set-state-in-effect warnings (GapForm/ScorecardEditor); the existing web chunk-size advisory remains.

Both post-build frontend/bundle scans pass: **146 files; zero violations; zero secret values printed**. Dedicated server speech and existing credential canaries were injected only into the guarded synthetic build environment. No retained .env or real credential was loaded. 59 retained logs have zero detected credential findings; fixture credential files/screenshots are suppressed. Pattern scans are bounded checks, not a guarantee against every possible encoding.

## Source integrity and preserved evidence

Accepted prior speech-layer source manifest SHA-256: 9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627.

**Final 453-file source manifest SHA-256: fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17.**

Source files digest: 5439b40c403be66d300d34690cc0f8f6ccfef87e28b70b70073bc4bdc75baeb2. Exact before/after hashes are in source-changes.json. Source is byte-identical throughout final tests. No Git metadata exists; manifests establish provenance.

- phase-5.1-baseline: 96 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67.
- phase-5.2: 394 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342.
- phase-5.3: 162 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900.
- phase-5.4: 170 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 c43408d736327197d296ff3b17cc97a0f15539a3c0b9f7e3ce0e2bca530c62e3.
- phase-5.5: 254 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 2d507d2e555e9fb0dc55a63f46c6b43b2d06d7ee25d7b6ec4027ca9e60b0261d.
- phase-5.6: 182 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c.
- stt-tts-provider-layer: 236 artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 e9f1a26ef155286ee7f7992eef8855bfe7efd2153d81401f6fe7dba5bcb4738c.

All 608 earlier protected evidence/training files are also unchanged. Phase 5.1 remains BLOCKED and no accepted scope was broadened. The new artifact manifest covers all new evidence except itself; the independent read-only verifier rechecks it, source, accepted manifests, completed results, privacy and cleanup.

## External calls and cleanup

{"instrumentedNodeProcesses":89,"guardedExternalAttempts":0,"realProviderCalls":0,"realModelCalls":0,"localModelsInstalled":0,"ollamaServiceCalls":0,"syntheticSpeechSdkRequests":31,"scope":"Instrumented Node socket/fetch plus Chrome page guards; native Chrome background traffic not independently packet-captured."}

No real provider/model/inference calls or local-model installation occurred. Native browser page external requests were blocked; Chrome background networking was not independently packet-captured. Cleanup **PASS**: removed only this task's temporary profiles, inspected zero other DB sessions and zero leftover own test databases, then stopped the exact local test PostgreSQL cluster. Commands and exit codes are in resource-cleanup.json. No application database was dropped during finalization and no unrelated process was stopped.

## Remaining gaps and blockers

1. **OPEN / BLOCKED — pgvector/full migration chain.** The untouched 27-entry chain fails at 0008 because vector is unavailable (0A000); transaction rollback and disposable DB cleanup are verified. Nothing was skipped/stubbed/edited.
2. **OPEN / BLOCKED — Live Voice E2E worker and complete trusted candidate transport.** Uplink capture/upload/STT is now implemented and synthetically tested. Trusted production downlink/TTS/start/playback/STOP composition and real worker/provider E2E validation remain unfinished.
3. Dedicated cloud credentials, selected real models/voice, real provider health/latency/timeout/format/acoustic validation and real microphone/browser-device compatibility remain unvalidated. Synthetic configured status is not readiness.
4. LLM orchestration and evaluation-provider integration remain outside this task and unchanged. Distributed rate limiting/runtime ownership, automatic crash-resume of pending STT and hard deletion while a browser is closed are not implemented.

Stopped after this implementation and report. No Live Voice E2E or production-readiness claim is made.
