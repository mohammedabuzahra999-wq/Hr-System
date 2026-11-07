# STT/TTS provider-layer implementation — PASS

**Implementation/contract verification: PASS. API integration readiness remains PARTIAL. Overall release readiness and Live Voice E2E remain BLOCKED.**

Recorded 2026-11-05T07:05:57.207Z; run final-verified-20261105. This work implements only the server STT/TTS provider layer. Candidate transport, LLM orchestration and evaluation integration are excluded. No production-readiness claim is made.

## Implemented contracts and runtime wiring

Independent SpeechToTextProvider/TextToSpeechProvider contracts and one server-owned registry now exist. OpenAI is the first registered cloud adapter using the already-installed SDK; explicit per-role selectors default disabled and can be selected independently. env.ts validates dedicated server configuration; speechRuntime.ts registers the pair without network I/O. index.ts closes/aborts it during shutdown. Existing mock providers and combined delivery gate behavior remain unchanged.

STT accepts canonical PCM16 mono 16kHz WAV <=8,000,000 bytes and optional en/ar hint. Mixed-language input omits the hint. JSON is bounded to 128,000 bytes before SDK parsing; output is final text <=16,000 characters. Text-only output is conservatively uncertain=true until a calibrated uncertainty policy is validated.

TTS accepts 1–4,096 trimmed characters, requests raw PCM24k/S16LE, bounds provider PCM to 2,999,934 bytes, and converts to canonical metadata-free PCM16 mono 16kHz WAV <=2,000,000 bytes. Tests verify headers, signed extrema, duration/sample mapping and exact size bounds. Live acoustic quality remains unvalidated.

Each request has a finite 1–15,000ms total logical timeout (default 15,000ms), AbortSignal propagation and one of two shared physical slots. Unsettled work keeps its slot after timeout; late results cannot become successful. Shutdown closes admission and fences late completion. SDK/per-request automatic retries are zero; safe retryability hints do not trigger a retry.

Credential/model/voice configuration is explicit and server-only. Generic AI/Realtime keys never authenticate or activate speech. The API origin/path is pinned, redirects rejected and SDK logging forced off even with ambient debug/base URL settings. HTTP rejection/auth/rate, network/timeout/cancel/capacity and malformed data become fixed safe errors without raw body/header/credential/cause propagation. Configuration presence never means health: readiness distinguishes configured/last-call-succeeded/unhealthy/closed and always reports liveValidated=false, transportReady=false.

The pair returns data only: no session binding, trusted event ingress, answer commit, PLAY/STOP, candidate route or state advancement is introduced. The full delivery-provider flag still fails closed without its missing trusted transport. See [configuration and contract details](../../README.md) and [before-state](../../before-state.md).

## Exact application files changed

**5 created, 3 modified, zero deleted; no unexpected paths. No dependency, migration or local model added.**

| Change | File | Purpose |
|---|---|---|
| CREATED | `services/hr-api/src/aiInterviewer/speechConfiguration.ts` | Explicit server-only provider/model/voice/credential configuration; fail-closed parsing. |
| CREATED | `services/hr-api/src/aiInterviewer/speechContracts.ts` | Independent typed STT/TTS result/error/readiness contracts and hard limits. |
| CREATED | `services/hr-api/src/aiInterviewer/speechProviders.check.ts` | 58 offline provider/configuration/SDK/protocol/bounds/security tests. |
| CREATED | `services/hr-api/src/aiInterviewer/speechProviders.ts` | OpenAI SDK speech adapters, pinned destination, bounded bodies/time/capacity, safe errors, cancellation and PCM conversion. |
| CREATED | `services/hr-api/src/aiInterviewer/speechRuntime.ts` | One server-owned pair registered without I/O; no transport authority. |
| MODIFIED | `services/hr-api/package.json` | Add speech contract test command; no dependency changes. |
| MODIFIED | `services/hr-api/src/env.ts` | Validate new independent speech configuration at startup without printing values. |
| MODIFIED | `services/hr-api/src/index.ts` | Register speech providers at server startup and close/abort them during shutdown. |

All remaining new files are confined to docs/ai-interviewer/stt-tts-provider-layer and listed by the new artifact manifest. No accepted Phase 1–5.6 evidence was modified.

## New provider contract results

**58/58 PASS; 31 injected synthetic SDK requests; zero real provider calls.** The suite exercises actual installed SDK serialization/response parsing against fake HTTP, not a mock that bypasses adapter code. Cases cover disabled defaults, independent registration, dedicated credentials, JSON/credential exclusion, required models/voice, invalid providers/endpoints/timeouts, production startup failures, body/input bounds, PCM conversion, multilingual hints, caller input copying, 400/401/403/429/500 without retries, raw exception sanitization, redirects/debug environment, cancellation, physical-capacity quarantine, late settlement, body stalls and shutdown.

## Regression and security

35 verified PASS suite results, plus the explicitly BLOCKED migration probe. All original assertions are unchanged. Results and exact commands:

| Suite | Result | Count | Command | Evidence directory relative to this package |
|---|---|---|---|---|
| speech-contract | **PASS** | 58 | `npm.cmd run check:ai-interviewer:speech -w @hr/server` | runs/final-verified-20261105 |
| synthetic-e2e | **PASS** | 27 | `node --conditions=development --import tsx docs/ai-interviewer/phase-5.6/synthetic.check.ts` | runs/final-verified-20261105 |
| secret-canary | **PASS** | 1 | `node docs/ai-interviewer/stt-tts-provider-layer/secret-check.mjs` | runs/final-verified-20261105 |
| operations | **PASS** | 41 | `node --conditions=development --import tsx src/aiInterviewer/operations.check.ts` | runs/final-verified-20261105 |
| operations-db | **PASS** | 26 | `node --conditions=development --import tsx src/aiInterviewer/operations.persistence.check.ts` | runs/final-verified-20261105 |
| provider-gate | **PASS** | 51 | `node --conditions=development --import tsx src/aiInterviewer/delivery.check.ts` | runs/final-verified-20261105 |
| execution-bounds | **PASS** | 14 | `node --conditions=development --import tsx src/aiInterviewer/execution.check.ts` | runs/final-verified-20261105 |
| runtime-jobs | **PASS** | 30 | `node --conditions=development --import tsx src/aiInterviewer/runtime.check.ts` | runs/final-verified-20261105 |
| answer-ui | **PASS** | 26 | `node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs` | runs/final-verified-20261105 |
| answer-db | **PASS** | 27 | `node --conditions=development --import tsx src/aiInterviewer/answer.check.ts` | runs/final-verified-20261105 |
| engine | **PASS** | 37 | `npm.cmd run check:ai-interviewer -w @hr/server` | runs/final-verified-20261105 |
| scenario | **PASS** | command/probe | `npm.cmd run demo:ai-interviewer -w @hr/server` | runs/final-verified-20261105 |
| persistence | **PASS** | 65 | `npm.cmd run check:ai-interviewer:persistence -w @hr/server` | runs/final-verified-20261105 |
| report | **PASS** | 76 | `npm.cmd run check:ai-interviewer:report -w @hr/server` | runs/final-verified-20261105 |
| ui | **PASS** | 24 | `npm.cmd run check:ai-interviewer:ui -w @hr/server` | runs/final-verified-20261105 |
| mcp | **PASS** | 18 | `node --conditions=development --import tsx src/mcp/authorization.security.check.ts` | runs/final-verified-20261105 |
| permissions | **PASS** | 107 | `npm.cmd run check:permissions -w @hr/server` | runs/final-verified-20261105 |
| gate | **PASS** | 194 | `npm.cmd run check:gate -w @hr/server` | runs/final-verified-20261105 |
| plans | **PASS** | 95 | `npm.cmd run check:plans -w @hr/server` | runs/final-verified-20261105 |
| report-security | **PASS** | 44 | `node --conditions=development --import tsx src/reports/build.security.check.ts` | runs/final-verified-20261105 |
| voice | **PASS** | 17 | `npm.cmd run check:voice -w @hr/server` | runs/final-verified-20261105 |
| local-voice-api | **PASS** | 3 | `npm.cmd run check:voice:local -w @hr/server [component 1/4]` | runs/final-verified-20261105 |
| local-voice-audio | **PASS** | 4 | `npm.cmd run check:voice:local -w @hr/server [component 2/4]` | runs/final-verified-20261105 |
| local-voice-turn | **PASS** | 8 | `npm.cmd run check:voice:local -w @hr/server [component 3/4]` | runs/final-verified-20261105 |
| local-voice-queue | **PASS** | 6 | `npm.cmd run check:voice:local -w @hr/server [component 4/4]` | runs/final-verified-20261105 |
| scorecard | **PASS** | 27 | `npm.cmd run check:scorecard -w @hr/server` | runs/final-verified-20261105 |
| structured-provider | **PASS** | 4 | `node --conditions=development --import tsx src/ai/structuredProvider.check.ts` | runs/final-verified-20261105 |
| typechecks | **PASS** | command/probe | `npm.cmd run check` | runs/final-verified-20261105 |
| contracts-build | **PASS** | command/probe | `npm.cmd run build -w @hr/shared` | runs/final-verified-20261105 |
| api-build | **PASS** | command/probe | `npm.cmd run build -w @hr/server` | runs/final-verified-20261105 |
| web-build | **PASS** | command/probe | `npm.cmd run build -w hr-app` | runs/final-verified-20261105 |
| secret-scan | **PASS** | 1 | `node scripts/checkInterviewSecrets.mjs` | runs/final-verified-20261105 |
| browser3 | **PASS** | 44 | `npm.cmd run check:ai-interviewer:browser -w @hr/server` | runs/browser-recheck-20261105 |
| browser4 | **PASS** | 58 | `npm.cmd run check:ai-interviewer:report:browser -w @hr/server` | runs/final-verified-20261105 |
| answer-browser | **PASS** | 56 | `node scripts/checkAiInterviewAnswerBrowser.mjs` | runs/final-verified-20261105 |
| migrations | **BLOCKED** | command/probe | `node docs/ai-interviewer/stt-tts-provider-layer/migrations.mjs` | runs/final-verified-20261105 |

Browser attempt history is retained and must not be silently described as a clean first run:

- browser3: original exit 1, 20/21 checks before stop; verified unchanged-source recheck 44/44, exit 0. Initial browser attempt stopped at warning/grace speaking observation (20/21). Original failure retained; unchanged isolated recheck used. Timing/version cause remains an inference, not a proven root cause.

The first main all-command stopped with exit 1 at that browser assertion. Only the affected browser suite was rechecked; unfinished browser4/answer-browser/migration checks were resumed individually. No other completed main suite was rerun and no test expectation/timer was loosened. The original failure is an open timing-sensitive test observation, not proof of a provider-layer regression or proof of a root cause.

The unchanged-source combined synthetic flow remains 27/27 PASS: four durable answers, follow-up/clarification/interruption, receipt replay, one independently verified MOCK report and staff-only access. Candidate isolation, Origin, invite/session expiry/revocation, staff RBAC, provider provenance/fencing, answer preservation, evaluator fairness/restart/inputHash/evidence, production fail-closed policy and MCP/permissions all remain covered. MCP has 18 scenarios and 69 tools per invalid-auth state; browser counts overlap base scenarios and are not unique-case totals.

Type checks and contracts/API/web production builds pass; two existing web lint warnings and the existing chunk-size advisory remain. Logs/metadata include UTC timing, exit code, cwd, exact Node arguments and guard scope.

## Secret scan ordering and results

The early main credential-canary scan happened before the new build and is retained as preliminary evidence. A separate completed post-build scan is authoritative for the new dedicated speech credential: **143 frontend/build files; zero violations; zero values printed**. Scan evidence: runs/post-build-verified-20261105; started 2026-11-05T06:56:12.990Z, after web build finished 2026-11-05T06:55:36.674Z. The runner was reordered for future reproductions so this scan follows the build. The original scanner also passes 143 files/zero violations.

The production web build receives only synthetic existing-key and dedicated-speech canaries. No real key or retained .env is loaded. 40 retained logs have zero detected credential findings; fixture credentials/screenshots are suppressed. Closed schemas and pattern scans are practical checks, not a claim to recognize every arbitrary secret encoding.

## Source integrity and evidence preservation

Accepted Phase 5.6 source SHA-256: e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0.

**Final 443-file source manifest SHA-256: 9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627.**

Source files digest: 8fd610b8776f709368793158293bdbfafb36810d9a2305dcf154dd8159cba890. Source remained byte-identical throughout final tests/rechecks. source-changes.json records exact before/after hashes and scope. The artifact manifest covers every new evidence file and excludes itself; the read-only verifier checks it after generation.

- phase-5.1-baseline: 96 files unchanged; zero unlisted artifacts; artifact manifest SHA-256 3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67.
- phase-5.2: 394 files unchanged; zero unlisted artifacts; artifact manifest SHA-256 c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342.
- phase-5.3: 162 files unchanged; zero unlisted artifacts; artifact manifest SHA-256 8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900.
- phase-5.4: 170 files unchanged; zero unlisted artifacts; artifact manifest SHA-256 c43408d736327197d296ff3b17cc97a0f15539a3c0b9f7e3ce0e2bca530c62e3.
- phase-5.5: 254 files unchanged; zero unlisted artifacts; artifact manifest SHA-256 2d507d2e555e9fb0dc55a63f46c6b43b2d06d7ee25d7b6ec4027ca9e60b0261d.
- phase-5.6: 182 files unchanged; zero unlisted artifacts; artifact manifest SHA-256 b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c.

All 608 earlier protected evidence/training files are unchanged. Phase 5.1 remains BLOCKED and accepted supported-scope statuses are not broadened. No Git metadata is available; manifests provide exact provenance.

## External calls, cleanup and limitations

Network accounting: {"instrumentedNodeProcesses":79,"guardedExternalAttempts":0,"realProviderCalls":0,"realModelCalls":0,"localModelsInstalled":0,"ollamaServiceCalls":0,"syntheticSpeechSdkRequests":31,"scope":"Node socket/fetch and original browser page guards; native Chrome background traffic not independently packet-captured. Public documentation reads are not inference/provider API calls."}.

No inference/provider API was called, no credential was provisioned, and no local model/Ollama service was installed/used. Official public documentation was read separately to verify protocol; [OpenAI transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) and [speech PCM](https://developers.openai.com/api/docs/guides/text-to-speech) plus installed SDK 7.20.0 types informed this implementation. All runtime SDK requests were injected synthetic responses.

Cleanup PASS: own temporary run profiles removed; zero other DB sessions and zero leftover own probe databases; exact local test cluster stopped. resource-cleanup.json records all resolved-scope commands and exit codes. No unrelated application was stopped or application database dropped.

Capacity is process-local and assumes one server registry/runtime owner. Synchronous CPU cannot be preempted; permanently uncancellable operations retain slots until settlement/process exit. Acoustic quality, real account/model/voice support, provider latency/error behavior and uncertainty calibration still need live validation. No continuous provider-health guarantee or distributed enforcement is claimed.

## Remaining integration gaps and blockers

- Candidate capture/upload/playback/STOP transport, independent trusted transport provenance, and its server delivery composition remain unimplemented.
- Future dedicated server credential, selected account-valid models/voice and actual cloud health/format/latency/acoustic validation remain unavailable. Supplying a key alone does not enable a candidate interview.
- LLM question/decision orchestration and real evaluation/provenance integration remain outside scope and unchanged.
- **OPEN / BLOCKED: pgvector/full migration chain.** Exact unchanged migration 0008 still fails for missing vector (0A000), rolls back and cleans up. No migration skipped/stubbed/edited.
- **OPEN / BLOCKED: Live Voice E2E worker and trusted candidate transport.** No live test is claimed or substituted by synthetic acceptance.

Stopped after this STT/TTS-layer implementation and report. No candidate transport, LLM/evaluation integration, retention or distributed runtime work was begun.
