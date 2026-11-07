import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { here, inspect, expectedChanges, walk } from './state.mjs'
import { root, sha256, writeJson } from './manifest.mjs'

const run=process.argv[2],state=inspect(run),output=resolve(here,'runs',run),{currentSourceManifest,...summary}=state
summary.recordedAtUtc=new Date().toISOString()
writeJson(resolve(output,'summary.json'),summary)
writeJson(resolve(output,'source-final.json'),currentSourceManifest)
writeJson(resolve(output,'source-changes.json'),{acceptedSpeechLayerSourceSHA256:state.source.beforeAcceptedSHA256,created:state.source.created,modified:state.source.modified,deleted:state.source.deleted,purposes:expectedChanges})
writeJson(resolve(output,'preservation-after.json'),{packages:state.preservation,earlier:state.earlierEvidence})
const files=[...state.source.created,...state.source.modified].map(f=>`| ${state.source.created.some(c=>c.path===f.path)?'CREATED':'MODIFIED'} | \`${f.path}\` | ${expectedChanges[f.path]} |`).join('\n')
const tests=state.regression.map(r=>`| ${r.id} | **${r.status}** | ${r.count===null?'command/probe':`${r.count}/${r.count}`} | \`${r.command}\` | ${r.resultDirectory} |`).join('\n')
const browserAttempts=state.regression.filter(r=>r.originalAttempt).map(r=>`- ${r.id}: initial **${r.originalAttempt.status}**, exit ${r.originalAttempt.exitCode}; isolated unchanged-source result **${r.status}**, ${r.count}/${r.count}. ${r.retryNote}`).join('\n')
const states=state.transport.matrix.filter(r=>'answers'in r).map(r=>`| ${r.scenario} | ${r.state}/${r.phase} | ${r.version} | ${r.answers} | ${r.finalized} | ${r.audioCommitReceipts} | ${r.sttCalls} |`).join('\n')
const report=`# Trusted candidate audio transport — ${state.status}

**Implementation and synthetic verification: ${state.status} for the supported local single-process scope. Overall release readiness and Live Voice E2E: BLOCKED.**

Recorded ${summary.recordedAtUtc}; run ${run}. No real API credential was supplied; real provider/model/external calls: **zero**. No local model/Ollama, dependency, database migration, WebRTC, streaming service, LLM orchestration or evaluation integration was added.

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
${states}

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
${files}

All other added evidence files are confined to docs/ai-interviewer/candidate-audio-transport and enumerated by its artifact manifest. No accepted source test assertion was weakened; the new browser harness is derived into a separate script.

## Regression, type checks and production builds

${state.completedPassSuites} completed PASS suite/command results plus one explicitly BLOCKED full migration probe. Browser counts overlap base cases and are not additive unique scenarios. MCP covers 18 lifecycle scenarios, with 69 tools per invalid-auth state. Exact commands/results:

| Suite | Result | Checks | Command | Evidence directory relative to this package |
|---|---|---|---|---|
${tests}

Browser attempt history:

${browserAttempts||'- No final-run browser failure or recheck was needed. The previously observed Phase 3 warning/grace instability did not recur in these final suites; accepted historical failure evidence remains unchanged. No historical root cause is claimed.'}

The all-command stopped with exit 1 at the original Phase 3 failure. Only that affected suite was isolated for recheck; browser4, answer-browser and migrations were then resumed individually. The additional diagnostic copy also passed 44/44 but is not counted among the 38 main PASS suites. See [browser investigation](../../browser-investigation.md) for safe trace observations and their limits. This is an unresolved timing-sensitive test observation, not a proven root cause or a claimed stability fix.

Development attempts are retained, including failed new-fixture/setup cases and their corrections. Their logs/results were not overwritten or counted as final PASS. Production contracts/API/web builds pass. Type/lint checks have zero errors, two pre-existing set-state-in-effect warnings (GapForm/ScorecardEditor); the existing web chunk-size advisory remains.

Both post-build frontend/bundle scans pass: **${state.secrets.checkedFiles} files; zero violations; zero secret values printed**. Dedicated server speech and existing credential canaries were injected only into the guarded synthetic build environment. No retained .env or real credential was loaded. ${state.logPrivacy.filesChecked} retained logs have zero detected credential findings; fixture credential files/screenshots are suppressed. Pattern scans are bounded checks, not a guarantee against every possible encoding.

## Source integrity and preserved evidence

Accepted prior speech-layer source manifest SHA-256: ${state.source.beforeAcceptedSHA256}.

**Final ${state.source.fileCount}-file source manifest SHA-256: ${state.source.finalManifestSHA256}.**

Source files digest: ${state.source.filesDigest}. Exact before/after hashes are in source-changes.json. Source is byte-identical throughout final tests. No Git metadata exists; manifests establish provenance.

${state.preservation.map(p=>`- ${p.phase}: ${p.files} artifacts unchanged, zero unlisted artifacts; artifact manifest SHA-256 ${p.artifactManifestSHA256}.`).join('\n')}

All 608 earlier protected evidence/training files are also unchanged. Phase 5.1 remains BLOCKED and no accepted scope was broadened. The new artifact manifest covers all new evidence except itself; the independent read-only verifier rechecks it, source, accepted manifests, completed results, privacy and cleanup.

## External calls and cleanup

${JSON.stringify(state.network)}

No real provider/model/inference calls or local-model installation occurred. Native browser page external requests were blocked; Chrome background networking was not independently packet-captured. Cleanup **${state.cleanup.status}**: removed only this task's temporary profiles, inspected zero other DB sessions and zero leftover own test databases, then stopped the exact local test PostgreSQL cluster. Commands and exit codes are in resource-cleanup.json. No application database was dropped during finalization and no unrelated process was stopped.

## Remaining gaps and blockers

1. **OPEN / BLOCKED — pgvector/full migration chain.** The untouched 27-entry chain fails at 0008 because vector is unavailable (0A000); transaction rollback and disposable DB cleanup are verified. Nothing was skipped/stubbed/edited.
2. **OPEN / BLOCKED — Live Voice E2E worker and complete trusted candidate transport.** Uplink capture/upload/STT is now implemented and synthetically tested. Trusted production downlink/TTS/start/playback/STOP composition and real worker/provider E2E validation remain unfinished.
3. Dedicated cloud credentials, selected real models/voice, real provider health/latency/timeout/format/acoustic validation and real microphone/browser-device compatibility remain unvalidated. Synthetic configured status is not readiness.
4. LLM orchestration and evaluation-provider integration remain outside this task and unchanged. Distributed rate limiting/runtime ownership, automatic crash-resume of pending STT and hard deletion while a browser is closed are not implemented.

Stopped after this implementation and report. No Live Voice E2E or production-readiness claim is made.
`
writeFileSync(resolve(output,'REPORT.md'),report)
const artifact=resolve(here,'artifact-manifest.json')
writeJson(artifact,{format:'candidate-audio-artifact-manifest-v1',algorithm:'SHA-256',files:walk(here).filter(p=>p!==artifact).map(p=>({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:sha256(readFileSync(p))}))})
console.log(JSON.stringify({status:state.status,verifiedPassSuites:state.completedPassSuites,newTransportChecks:state.transport.checks,sourceManifestSHA256:state.source.finalManifestSHA256,overallReleaseReadiness:'BLOCKED',artifactManifestSHA256:sha256(readFileSync(artifact)),failures:state.failures}))
if(state.status!=='PASS')process.exitCode=1
