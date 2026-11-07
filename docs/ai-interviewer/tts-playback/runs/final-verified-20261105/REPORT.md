# TTS audio delivery and playback — PASS

**Implementation/synthetic acceptance: PASS for supported local single-process scope. Overall release readiness and Live Voice E2E: BLOCKED.**

Recorded 2026-11-05T09:15:34.859Z; run final-verified-20261105. Real provider/model/API calls: **zero**. No real credential was available/used. No local model/Ollama, WebRTC, dependency, migration, LLM orchestration or evaluation integration was added.

## Implemented

The default-off server TTS downlink is composed from the existing registered TextToSpeechProvider. A candidate's current server-owned playback text is reserved durably, synthesized outside the SQL transaction, validated as bounded canonical WAV, then delivered privately through authenticated JSON POST. No public media URL, browser credential, client transcript or provider receipt is involved.

Native browser playback has explicit IDLE/GENERATING/READY/PLAYING/STOPPED/COMPLETED/ERROR states and Prepare, Play, STOP and retry controls. Preparing/downloading never starts answer timers or implies the candidate heard audio. Native autoplay rejection, playback error, start stall (5s bound), missing end (duration+10s watchdog), response loss and disconnect have safe recovery. STOP immediately releases media locally and confirms durable server invalidation/pause; an unconfirmed stop is not described as confirmed. Existing mock autoplay remains unchanged when the new feature is off; it is disabled in TTS-enabled rooms so native playback owns delivery.

Existing events/receipts provide stable prepare identity/fingerprints, generation/owner/session/question/turn/version fences, exclusive document leases, cancellation-before-reservation tombstones and atomic transitions. The server validates known audio duration before completion and never accepts a claimed duration/hash/audio URL/evaluation/receipt. Duplicate start/end cannot replay or advance twice. STOP pauses; existing resume creates a fresh playback ID. Browser ended is an untrusted observation, not an independent trusted-provider event or proof of audibility. Audio-v2's existing provider generation is checked; independent trusted STOP effects are not waived/cleared by browser claims.

## Contracts, limits and configuration

AI_INTERVIEW_TTS_PLAYBACK_ENABLED defaults false and requires valid dedicated server TTS provider/model/voice/credential configuration. Invalid/missing configuration fails closed without values printed. Registration/configuration is not health. Full production real-delivery START remains disabled; supplying a key alone does not activate a live interview.

POST operations under /api/ai-interview/playback: prepare, status, audio, start, pulse, end, stop and cancel. Existing HttpOnly cookie, exact Origin, service authorization, candidate/staff/provider separation, private no-store cache and security headers remain enforced. Wrong candidate/session/question/turn/generation and stale state fail independently of rate limits. The audio endpoint returns only audio/wav, no credential or private provider metadata.

Text is frozen server playback text, 1–4096 characters. WAV is exact RIFF PCM16 mono 16kHz, no embedded metadata, <=2,000,000 bytes (<=62,498.625ms). Provider logical timeout <=15s; two physical calls, eight reserved/cache slots; late/uncancellable calls keep slots until settlement/process exit. Explicit retries use new generations after errors, never hidden provider retries. Candidate-session minute limits: prepare 12, status/pulse 90 each, other operations 30 each, plus the general limiter. These are process-local abuse bounds, never authorization.

Raw TTS audio is temporary bounded server memory and browser Blob/object URL only. It is not written to application DB, server disk, browser storage, logs or evidence. Cache expires within 120s/session expiry; URLs/media release on stop/end/error/navigation. Durable metadata stores necessary scope/generation/hash/lease state, not audio/text/credentials. No retention/deletion feature was introduced.

See [protocol/storage/recovery details](../../README.md) and [before-state](../../before-state.md).

## New verification

- **30/30 server/PostgreSQL/security checks PASS**; exact case matrix below.
- **6/6 additional closing/regression checks PASS**: server TTS intro/question/closing, authoritative listening timer, existing atomic answer/mock decision, one PENDING evaluation job, independently verified existing mock report and candidate report denial; 3 TTS generations, 1 durable answers. This is regression verification of existing evaluation behavior, not a new evaluation integration.
- **19/19 playback UI/controller checks PASS**: explicit Play, no autoplay, immediate stop, unknown-response tombstone, late download, question/session epoch changes, durable end reconciliation, response loss, injected NotAllowedError, native media errors, auth expiry, duplicate clicks, unmount, WAV validation, real 5s hung-play bound, generation polling, and retry after local media loss without falsely labelling a lease as native playback.
- **28/28 native Chrome browser checks PASS**: 13 unchanged authenticated HR/invite/session/setup assertions plus 15 dedicated TTS cases. Native HTMLAudio decodes/plays synthetic canonical WAV. Coverage includes READY refresh/no regeneration, intro/question transition, STOP during generation and playback, stale audio, explicit retry, injected autoplay denial, real 15s TTS timeout, refresh while playing, disconnect/lease expiry, reconnect/new audio, server listening timer, unauthenticated access and privacy. Autoplay denial is injected at the native play boundary; a real-device/browser-policy matrix remains unvalidated.
- Existing STT/TTS contracts remain **58/58 PASS** with **31 synthetic SDK requests**, zero real calls.

| Server scenario | Result |
|---|---|
| canonical TTS generated from frozen server text and delivered only by authenticated POST | PASS |
| same identity and competing identities coalesce before another provider call | PASS |
| browser cannot complete before server audio duration or supply trusted receipts | PASS |
| server duration completion advances exactly once, duplicate start/end never replay | PASS |
| STOP pauses engine, fences old audio, and resume uses a fresh playback ID | PASS |
| STOP during generation aborts logical request and late TTS cannot become READY | PASS |
| cancel-before-reservation tombstone fences delayed request | PASS |
| wrong candidate, missing cookie, staff credential and invalid Origin are independently denied | PASS |
| wrong session/question/turn/generation fails before provider use or media delivery | PASS |
| expired and revoked sessions cannot fetch cached speech | PASS |
| generation rejects invalid WAV, MIME and size without raw provider errors | PASS |
| failure is retryable explicitly, stable failed request does not synthesize twice | PASS |
| timeout retains physical slot, retry fences old late settlement | PASS |
| refresh/new document cannot blindly replay active audio | PASS |
| lease expiry pauses without fabricated playback completion | PASS |
| only one document may start an active generation | PASS |
| stale expected version and replaced interview state fence generation completion | PASS |
| restart closes old pending/ready generations and cannot replay cache | PASS |
| shutdown cancels pending generation and late provider cannot publish | PASS |
| no audio, credentials or provider receipts escape candidate metadata or audit content | PASS |
| audio-v2 generation binding permits registered TTS without browser provider receipts | PASS |
| replacement trusted generation fences late TTS | PASS |
| failed SQL playback completion rolls back state and successful receipt | PASS |
| physical admission remains bounded under simultaneous held generations | PASS |
| production configuration: default disabled | PASS |
| production configuration: enabled missing TTS | PASS |
| production configuration: selected TTS missing key | PASS |
| production configuration: synthetic provider cannot become production | PASS |
| real provider/model calls remain zero | PASS |
| immediately due clarification warning is atomic and maintenance preserves next speech-start version | PASS |

SQL completion rollback is tested using a real PostgreSQL trigger failure: playback state remains identical, no successful completion transaction survives, then retry succeeds. Atomic answer/recovery and evaluation integrity remain covered by their unchanged existing suites. PostgreSQL fixtures use exact 0026 on synthetic legacy parents; the full-chain probe stays separate and BLOCKED.

## Refresh, reconnect, STOP and restart matrix

| Scenario | Result |
|---|---|
| READY refresh | Recover same server generation, no automatic Play or second TTS |
| GENERATING refresh | Authorized status polling resolves READY/error without automatic playback |
| Unknown prepare response / cancel before reserve | Stable request tombstone fences delayed generation |
| STOP during generation | Durable STOPPED/pause; pending provider abort; late result cannot publish |
| STOP during native playback | Local pause/release immediately; server revokes generation and pauses |
| PLAYING refresh / second document | Stop uncertain lease; pause and require fresh resume/playback ID |
| Disconnect / failed pulse | Release local audio, report error; server expires lease without invented completion |
| Completion response lost | Reconcile durable receipt; no native replay or duplicate advancement |
| Old question/session/turn/generation | Server rejects bytes/start/end; browser epochs discard late work |
| Provider malformed/fail/timeout | Safe ERROR, no timer/finish; explicit bounded retry |
| Restart | Existing domain recovery pauses; old pending/READY generation/cache cannot replay |
| Shutdown | Close admission, abort provider, invalidate cache/generation; late result cannot publish |

Leases last 5s, browser pulses every 1.5s, server expiry sweep every 1s. Stop across a different tab/server event is detected by polling/lease expiry; instantaneous distributed cancellation and proof of audible output are not claimed. A new document intentionally stops another document's active playback. A stalled/closed browser cannot renew a lease forever. In-flight provider work cannot be physically preempted if the provider ignores cancellation.

## Phase 3 warning/grace investigation

Two pre-fix expanded browser attempts failed at 20/21; both are retained under source SHA-256 ab72e7acb5a92064feb8180032747320d3d87838c8aaef38992fa7b145d1cd88. The traced retry confirms this ordering: reconciled version **23**, next unmodified speech-start expected **23** returned **409**, then state **24/speaking=false** and the **ANSWER_WARNING** event. The first deliberately tampered request is distinct from that second request. This confirms the mechanism for this traced failure; older untraced failures are not individually proven.

The warning was clamped to the same **30s** as the clarification duration and therefore immediately due. The minimal engine fix emits that warning atomically with listening, before returning the client version. It changes no answer deadline, grace period, permission or expected-version check. The new PostgreSQL check proves exactly one warning at the listening version, maintenance version **21 → 21** unchanged, and the next speech-start accepted. No blind retry or assertion/wait relaxation was added. See [investigation](../../browser-investigation.md).

Final browser attempt history:

- tts-browser: initial **FAIL**, exit 1, 0 passed before stopping. Selected isolated result **PASS**, 28/28. The corrected-source run timed out during the first unchanged HR setup assertion (0/1), before TTS cases. Original log/raw result retained. Isolated original native suite passed 28/28 on byte-identical source with safe request metadata. No assertion or wait changed; exact setup-timeout cause remains unproven. Only unfinished suites were resumed.

The first all-command stopped at the pre-fix expanded-browser failure; the traced isolated retry also failed and was retained. After the engine correction, a NEW complete frozen-source run executes every relevant suite, including the original unchanged 44/58/56 browser assertions. Earlier failed attempts are not substituted for current PASS or removed from evidence.

New development failures and corrections are retained separately; see [development notes](../../development-notes.md). Development totals are not substituted for final acceptance.

## Regression and production checks

**42 completed PASS suite/command results**, plus one explicitly BLOCKED migration probe. Counts overlap base cases and are not additive unique scenarios. Exact commands, outcomes and evidence directories:

| Suite | Result | Checks | Command | Evidence directory relative to this package |
|---|---|---|---|---|
| tts-closing | **PASS** | 6/6 | `node --conditions=development --import tsx docs/ai-interviewer/tts-playback/closing.check.ts` | runs/final-verified-20261105 |
| tts-browser | **PASS** | 28/28 | `node scripts/checkTtsPlaybackBrowser.mjs` | runs/browser-native-recheck-20261105 |
| tts-ui | **PASS** | 19/19 | `node --conditions=development --import tsx scripts/checkTtsPlaybackUi.mjs` | runs/final-verified-20261105 |
| tts-transport | **PASS** | 30/30 | `npm.cmd run check:ai-interviewer:tts -w @hr/server` | runs/final-verified-20261105 |
| audio-ui | **PASS** | 29/29 | `npm.cmd run check:ai-interviewer:audio:ui -w @hr/server` | runs/final-verified-20261105 |
| audio-browser | **PASS** | 28/28 | `node scripts/checkCandidateAudioBrowser.mjs` | runs/final-verified-20261105 |
| audio-transport | **PASS** | 37/37 | `npm.cmd run check:ai-interviewer:audio -w @hr/server` | runs/final-verified-20261105 |
| speech-contract | **PASS** | 58/58 | `npm.cmd run check:ai-interviewer:speech -w @hr/server` | runs/final-verified-20261105 |
| synthetic-e2e | **PASS** | 27/27 | `node --conditions=development --import tsx docs/ai-interviewer/phase-5.6/synthetic.check.ts` | runs/final-verified-20261105 |
| operations | **PASS** | 41/41 | `node --conditions=development --import tsx src/aiInterviewer/operations.check.ts` | runs/final-verified-20261105 |
| operations-db | **PASS** | 26/26 | `node --conditions=development --import tsx src/aiInterviewer/operations.persistence.check.ts` | runs/final-verified-20261105 |
| provider-gate | **PASS** | 51/51 | `node --conditions=development --import tsx src/aiInterviewer/delivery.check.ts` | runs/final-verified-20261105 |
| execution-bounds | **PASS** | 14/14 | `node --conditions=development --import tsx src/aiInterviewer/execution.check.ts` | runs/final-verified-20261105 |
| runtime-jobs | **PASS** | 30/30 | `node --conditions=development --import tsx src/aiInterviewer/runtime.check.ts` | runs/final-verified-20261105 |
| answer-ui | **PASS** | 26/26 | `node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs` | runs/final-verified-20261105 |
| answer-db | **PASS** | 27/27 | `node --conditions=development --import tsx src/aiInterviewer/answer.check.ts` | runs/final-verified-20261105 |
| engine | **PASS** | 37/37 | `npm.cmd run check:ai-interviewer -w @hr/server` | runs/final-verified-20261105 |
| scenario | **PASS** | command/probe | `npm.cmd run demo:ai-interviewer -w @hr/server` | runs/final-verified-20261105 |
| persistence | **PASS** | 65/65 | `npm.cmd run check:ai-interviewer:persistence -w @hr/server` | runs/final-verified-20261105 |
| report | **PASS** | 76/76 | `npm.cmd run check:ai-interviewer:report -w @hr/server` | runs/final-verified-20261105 |
| ui | **PASS** | 24/24 | `npm.cmd run check:ai-interviewer:ui -w @hr/server` | runs/final-verified-20261105 |
| mcp | **PASS** | 18/18 | `node --conditions=development --import tsx src/mcp/authorization.security.check.ts` | runs/final-verified-20261105 |
| permissions | **PASS** | 107/107 | `npm.cmd run check:permissions -w @hr/server` | runs/final-verified-20261105 |
| gate | **PASS** | 194/194 | `npm.cmd run check:gate -w @hr/server` | runs/final-verified-20261105 |
| plans | **PASS** | 95/95 | `npm.cmd run check:plans -w @hr/server` | runs/final-verified-20261105 |
| report-security | **PASS** | 44/44 | `node --conditions=development --import tsx src/reports/build.security.check.ts` | runs/final-verified-20261105 |
| voice | **PASS** | 17/17 | `npm.cmd run check:voice -w @hr/server` | runs/final-verified-20261105 |
| local-voice-api | **PASS** | 3/3 | `npm.cmd run check:voice:local -w @hr/server [component 1/4]` | runs/final-verified-20261105 |
| local-voice-audio | **PASS** | 4/4 | `npm.cmd run check:voice:local -w @hr/server [component 2/4]` | runs/final-verified-20261105 |
| local-voice-turn | **PASS** | 8/8 | `npm.cmd run check:voice:local -w @hr/server [component 3/4]` | runs/final-verified-20261105 |
| local-voice-queue | **PASS** | 6/6 | `npm.cmd run check:voice:local -w @hr/server [component 4/4]` | runs/final-verified-20261105 |
| scorecard | **PASS** | 27/27 | `npm.cmd run check:scorecard -w @hr/server` | runs/final-verified-20261105 |
| structured-provider | **PASS** | 4/4 | `node --conditions=development --import tsx src/ai/structuredProvider.check.ts` | runs/final-verified-20261105 |
| typechecks | **PASS** | command/probe | `npm.cmd run check` | runs/final-verified-20261105 |
| contracts-build | **PASS** | command/probe | `npm.cmd run build -w @hr/shared` | runs/final-verified-20261105 |
| api-build | **PASS** | command/probe | `npm.cmd run build -w @hr/server` | runs/final-verified-20261105 |
| web-build | **PASS** | command/probe | `npm.cmd run build -w hr-app` | runs/final-verified-20261105 |
| secret-scan | **PASS** | 1/1 | `node scripts/checkInterviewSecrets.mjs` | runs/final-verified-20261105 |
| secret-canary | **PASS** | 1/1 | `node docs/ai-interviewer/stt-tts-provider-layer/secret-check.mjs` | runs/final-verified-20261105 |
| browser3 | **PASS** | 44/44 | `npm.cmd run check:ai-interviewer:browser -w @hr/server` | runs/final-verified-20261105 |
| browser4 | **PASS** | 58/58 | `npm.cmd run check:ai-interviewer:report:browser -w @hr/server` | runs/final-verified-20261105 |
| answer-browser | **PASS** | 56/56 | `node scripts/checkAiInterviewAnswerBrowser.mjs` | runs/final-verified-20261105 |
| migrations | **BLOCKED** | command/probe | `node docs/ai-interviewer/tts-playback/migrations.mjs` | runs/final-verified-20261105 |

Type checks and production contracts/API/web builds pass. Two pre-existing unrelated set-state-in-effect warnings and the existing bundle-size advisory remain. MCP covers 18 lifecycle scenarios and 69 tools per invalid-auth state. Relevant answer preservation, evaluator timeout/fairness/restart, provider fencing/provenance, invite security, RBAC, report verification, permission and voice/provider mock assertions are unchanged.

Post-build scans: **148 frontend/build files, zero violations, zero values printed**. Existing/dedicated speech synthetic canaries are absent from the actual generated bundle. 99 retained logs have zero detected credential findings; fixture credential files/screenshots are suppressed. These bounded scans do not claim recognition of every possible secret encoding.

## Exact files and source integrity

**9 created, 12 modified, zero deleted; no unexpected source paths.**

| Change | File | Purpose |
|---|---|---|
| CREATED | `apps/hr-web/src/features/aiInterviewer/PlaybackPanel.tsx` | Accessible READY/PLAYING/STOPPED/COMPLETED/ERROR controls and messages. |
| CREATED | `apps/hr-web/src/features/aiInterviewer/playback.ts` | Explicit native playback controller, timed leases, epochs and recovery. |
| CREATED | `packages/contracts/src/aiInterviewPlayback.ts` | Strict public playback scope/action/result and canonical WAV validation. |
| CREATED | `services/hr-api/scripts/checkTtsPlaybackBrowser.mjs` | Derived unchanged HR/candidate setup plus native HTMLAudio cases. |
| CREATED | `services/hr-api/scripts/checkTtsPlaybackBrowserCases.mjs` | Synthetic TTS/native playback/STOP/refresh/disconnect/privacy assertions. |
| CREATED | `services/hr-api/scripts/checkTtsPlaybackUi.mjs` | 19 recovery/autoplay/timeout/cancellation/stale-result browser-controller checks. |
| CREATED | `services/hr-api/src/aiInterviewer/playbackContracts.ts` | Server-only generation/lease/status metadata schema. |
| CREATED | `services/hr-api/src/aiInterviewer/playbackTransport.check.ts` | 30 synthetic PostgreSQL/HTTP/security/provenance/configuration/clock checks. |
| CREATED | `services/hr-api/src/aiInterviewer/playbackTransport.ts` | Registered TTS orchestration, bounded WAV cache, admission, timeout, STOP and shutdown. |
| MODIFIED | `apps/hr-web/src/features/aiInterviewer/client.ts` | Bounded private WAV and strict playback JSON clients. |
| MODIFIED | `apps/hr-web/src/features/aiInterviewer/session.ts` | Own authenticated playback controller and safe expiry. |
| MODIFIED | `apps/hr-web/src/features/aiInterviewer/useInterviewSession.ts` | Release playback on lifecycle cleanup. |
| MODIFIED | `apps/hr-web/src/pages/AiInterviewPage.tsx` | Mount opt-in panel; disable mock autoplay only for TTS-enabled rooms. |
| MODIFIED | `packages/contracts/src/index.ts` | Export playback contracts. |
| MODIFIED | `services/hr-api/package.json` | Three new verification commands; no dependency change. |
| MODIFIED | `services/hr-api/src/aiInterviewer/engine.ts` | Persist an immediately due warning atomically with listening; eliminate the confirmed Phase 3 maintenance-version race without relaxing expected versions. |
| MODIFIED | `services/hr-api/src/aiInterviewer/routes.ts` | Authenticated Origin-protected rate-limited playback endpoints; private binary audio. |
| MODIFIED | `services/hr-api/src/aiInterviewer/service.ts` | Durable reservation/lease/STOP/completion transactions using existing receipts and events. |
| MODIFIED | `services/hr-api/src/aiInterviewer/ui.fixture.ts` | Opt-in test-only synthetic TTS scenarios and sanitized IPC counts. |
| MODIFIED | `services/hr-api/src/env.ts` | Default-off TTS delivery flag with required server TTS configuration. |
| MODIFIED | `services/hr-api/src/index.ts` | Register/close transport using existing server speech registry. |

Accepted prior source manifest SHA-256: fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17.

**Final 462-file source manifest SHA-256: 55f7d754e37e38b185095b6b5410c0d59bf82fc576567cb3c48203aabfeacf14.**

Files digest: 4b23118eed64dbd2292857ddbcc6244664db7864efb95504d710e85d53f12fd6. Source remains byte-identical throughout final tests/rechecks. source-changes.json records exact before/after hashes. No Git metadata is available; manifests establish provenance. Other new evidence stays only in docs/ai-interviewer/tts-playback; its artifact manifest covers every file except itself.

- phase-5.1-baseline: 96 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67.
- phase-5.2: 394 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342.
- phase-5.3: 162 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900.
- phase-5.4: 170 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 c43408d736327197d296ff3b17cc97a0f15539a3c0b9f7e3ce0e2bca530c62e3.
- phase-5.5: 254 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 2d507d2e555e9fb0dc55a63f46c6b43b2d06d7ee25d7b6ec4027ca9e60b0261d.
- phase-5.6: 182 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c.
- stt-tts-provider-layer: 236 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 e9f1a26ef155286ee7f7992eef8855bfe7efd2153d81401f6fe7dba5bcb4738c.
- candidate-audio-transport: 346 artifacts unchanged, zero unlisted files; artifact manifest SHA-256 877d54b54fc970bedc05a76b0712c13f3b5ecfa7fb18b96f1e83a95522f70efd.

All 608 earlier protected evidence/training files are unchanged. Accepted Phase 5.1 remains BLOCKED. No previous evidence was regenerated.

## External calls and cleanup

{"instrumentedNodeProcesses":217,"guardedExternalAttempts":0,"realProviderCalls":0,"realModelCalls":0,"localModelsInstalled":0,"ollamaServiceCalls":0,"syntheticSpeechSdkRequests":62,"finalRunSyntheticSpeechSdkRequests":31,"scope":"All guarded task attempts; Node socket/fetch plus Chrome page guards; native Chrome background traffic not independently packet-captured."}

Zero real provider/model/API calls, local model installations or Ollama calls. Guards cover instrumented Node sockets/fetch and browser page requests; Chrome background networking was not independently packet-captured. Legacy HR font requests are blocked by the browser harness.

Cleanup **PASS**: own temporary browser profiles removed, zero other DB sessions and zero leftover current-task databases, exact local test PostgreSQL stopped. Historical pre-existing database(s) remain untouched. Commands, scoped paths and exit codes are in resource-cleanup.json. No database was dropped during finalization and no unrelated application process was stopped.

## Remaining gaps and blockers

1. **OPEN / BLOCKED — pgvector/full migration chain:** unchanged 27-entry chain fails at 0008 (missing vector, 0A000), verified rollback/disposable DB cleanup; no skip/stub/edit.
2. **OPEN / BLOCKED — Live Voice E2E:** STT uplink and TTS downlink/native playback now exist and are synthetic-tested. Complete production START/resume/worker composition and independently trusted playback/STOP acknowledgement/actual audibility remain unvalidated. Browser observations are not a substitute for that trust.
3. Real cloud credential/account/model/voice, provider health/format/error/latency and real browser/device acoustic validation remain absent. Synthetic configuration is not readiness.
4. Single process/runtime owner, process-local cache/rates/admission, non-preemptible CPU and hung-provider restart limitations remain. Restart closes uncertain playback rather than replaying an assumed offset. The global shutdown grace can terminate unfinished I/O without fabricated success.
5. LLM orchestration/evaluation-provider integration remain outside scope. No retention/deletion or distributed deployment feature was implemented.

Stopped after this TTS downlink/playback implementation and report. **No Live Voice E2E or production-readiness claim.**
