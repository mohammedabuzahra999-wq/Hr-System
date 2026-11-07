import { readFileSync,statSync,writeFileSync } from 'node:fs'
import { relative,resolve } from 'node:path'
import { here,inspect,expectedChanges,walk } from './state.mjs'
import { root,sha256,writeJson } from './manifest.mjs'
const run=process.argv[2],state=inspect(run),output=resolve(here,'runs',run),{currentSourceManifest,...summary}=state
summary.recordedAtUtc=new Date().toISOString()
writeJson(resolve(output,'summary.json'),summary);writeJson(resolve(output,'source-final.json'),currentSourceManifest)
writeJson(resolve(output,'source-changes.json'),{acceptedSourceSHA256:state.source.beforeAcceptedSHA256,created:state.source.created,modified:state.source.modified,deleted:state.source.deleted,purposes:expectedChanges})
writeJson(resolve(output,'preservation-after.json'),{packages:state.preservation,earlier:state.earlierEvidence})
const files=[...state.source.created,...state.source.modified].map(f=>`| ${state.source.created.some(c=>c.path===f.path)?'CREATED':'MODIFIED'} | \`${f.path}\` | ${expectedChanges[f.path]} |`).join('\n')
const tests=state.regression.map(r=>`| ${r.id} | **${r.status}** | ${r.count===null?'command/probe':`${r.count}/${r.count}`} | \`${r.command}\` | ${r.resultDirectory} |`).join('\n')
const history=state.regression.filter(r=>r.originalAttempt).map(r=>`- ${r.id}: initial **${r.originalAttempt.status}**, exit ${r.originalAttempt.exitCode}, ${r.originalAttempt.passLines} passed before stopping. Selected isolated result **${r.status}**, ${r.count}/${r.count}. ${r.retryNote}`).join('\n')
const cases=state.transport.matrix.filter(r=>r.result==='PASS').map(r=>`| ${r.scenario} | PASS |`).join('\n')
const warning=state.transport.matrix.find(r=>r.scenario==='warning-version-window')
const report=`# TTS audio delivery and playback — ${state.status}

**Implementation/synthetic acceptance: ${state.status} for supported local single-process scope. Overall release readiness and Live Voice E2E: BLOCKED.**

Recorded ${summary.recordedAtUtc}; run ${run}. Real provider/model/API calls: **zero**. No real credential was available/used. No local model/Ollama, WebRTC, dependency, migration, LLM orchestration or evaluation integration was added.

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
- **6/6 additional closing/regression checks PASS**: server TTS intro/question/closing, authoritative listening timer, existing atomic answer/mock decision, one PENDING evaluation job, independently verified existing mock report and candidate report denial; ${state.closing.generations} TTS generations, ${state.closing.answers} durable answers. This is regression verification of existing evaluation behavior, not a new evaluation integration.
- **19/19 playback UI/controller checks PASS**: explicit Play, no autoplay, immediate stop, unknown-response tombstone, late download, question/session epoch changes, durable end reconciliation, response loss, injected NotAllowedError, native media errors, auth expiry, duplicate clicks, unmount, WAV validation, real 5s hung-play bound, generation polling, and retry after local media loss without falsely labelling a lease as native playback.
- **28/28 native Chrome browser checks PASS**: 13 unchanged authenticated HR/invite/session/setup assertions plus 15 dedicated TTS cases. Native HTMLAudio decodes/plays synthetic canonical WAV. Coverage includes READY refresh/no regeneration, intro/question transition, STOP during generation and playback, stale audio, explicit retry, injected autoplay denial, real 15s TTS timeout, refresh while playing, disconnect/lease expiry, reconnect/new audio, server listening timer, unauthenticated access and privacy. Autoplay denial is injected at the native play boundary; a real-device/browser-policy matrix remains unvalidated.
- Existing STT/TTS contracts remain **58/58 PASS** with **31 synthetic SDK requests**, zero real calls.

| Server scenario | Result |
|---|---|
${cases}

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

Two pre-fix expanded browser attempts failed at 20/21; both are retained under source SHA-256 ${state.rootHistory.sourceManifestSHA256}. The traced retry confirms this ordering: reconciled version **23**, next unmodified speech-start expected **23** returned **409**, then state **24/speaking=false** and the **ANSWER_WARNING** event. The first deliberately tampered request is distinct from that second request. This confirms the mechanism for this traced failure; older untraced failures are not individually proven.

The warning was clamped to the same **${warning?.clarificationSeconds}s** as the clarification duration and therefore immediately due. The minimal engine fix emits that warning atomically with listening, before returning the client version. It changes no answer deadline, grace period, permission or expected-version check. The new PostgreSQL check proves exactly one warning at the listening version, maintenance version **${warning?.beforeVersion} → ${warning?.afterWarningVersion}** unchanged, and the next speech-start accepted. No blind retry or assertion/wait relaxation was added. See [investigation](../../browser-investigation.md).

Final browser attempt history:

${history||'- All original final browser suites passed on their first attempts. Historical instability is retained and is not declared fixed.'}

The first all-command stopped at the pre-fix expanded-browser failure; the traced isolated retry also failed and was retained. After the engine correction, a NEW complete frozen-source run executes every relevant suite, including the original unchanged 44/58/56 browser assertions. Earlier failed attempts are not substituted for current PASS or removed from evidence.

New development failures and corrections are retained separately; see [development notes](../../development-notes.md). Development totals are not substituted for final acceptance.

## Regression and production checks

**${state.completedPassSuites} completed PASS suite/command results**, plus one explicitly BLOCKED migration probe. Counts overlap base cases and are not additive unique scenarios. Exact commands, outcomes and evidence directories:

| Suite | Result | Checks | Command | Evidence directory relative to this package |
|---|---|---|---|---|
${tests}

Type checks and production contracts/API/web builds pass. Two pre-existing unrelated set-state-in-effect warnings and the existing bundle-size advisory remain. MCP covers 18 lifecycle scenarios and 69 tools per invalid-auth state. Relevant answer preservation, evaluator timeout/fairness/restart, provider fencing/provenance, invite security, RBAC, report verification, permission and voice/provider mock assertions are unchanged.

Post-build scans: **${state.secrets.checkedFiles} frontend/build files, zero violations, zero values printed**. Existing/dedicated speech synthetic canaries are absent from the actual generated bundle. ${state.logPrivacy.filesChecked} retained logs have zero detected credential findings; fixture credential files/screenshots are suppressed. These bounded scans do not claim recognition of every possible secret encoding.

## Exact files and source integrity

**9 created, 12 modified, zero deleted; no unexpected source paths.**

| Change | File | Purpose |
|---|---|---|
${files}

Accepted prior source manifest SHA-256: ${state.source.beforeAcceptedSHA256}.

**Final ${state.source.fileCount}-file source manifest SHA-256: ${state.source.finalManifestSHA256}.**

Files digest: ${state.source.filesDigest}. Source remains byte-identical throughout final tests/rechecks. source-changes.json records exact before/after hashes. No Git metadata is available; manifests establish provenance. Other new evidence stays only in docs/ai-interviewer/tts-playback; its artifact manifest covers every file except itself.

${state.preservation.map(p=>`- ${p.phase}: ${p.files} artifacts unchanged, zero unlisted files; artifact manifest SHA-256 ${p.artifactManifestSHA256}.`).join('\n')}

All 608 earlier protected evidence/training files are unchanged. Accepted Phase 5.1 remains BLOCKED. No previous evidence was regenerated.

## External calls and cleanup

${JSON.stringify(state.network)}

Zero real provider/model/API calls, local model installations or Ollama calls. Guards cover instrumented Node sockets/fetch and browser page requests; Chrome background networking was not independently packet-captured. Legacy HR font requests are blocked by the browser harness.

Cleanup **${state.cleanup.status}**: own temporary browser profiles removed, zero other DB sessions and zero leftover current-task databases, exact local test PostgreSQL stopped. Historical pre-existing database(s) remain untouched. Commands, scoped paths and exit codes are in resource-cleanup.json. No database was dropped during finalization and no unrelated application process was stopped.

## Remaining gaps and blockers

1. **OPEN / BLOCKED — pgvector/full migration chain:** unchanged 27-entry chain fails at 0008 (missing vector, 0A000), verified rollback/disposable DB cleanup; no skip/stub/edit.
2. **OPEN / BLOCKED — Live Voice E2E:** STT uplink and TTS downlink/native playback now exist and are synthetic-tested. Complete production START/resume/worker composition and independently trusted playback/STOP acknowledgement/actual audibility remain unvalidated. Browser observations are not a substitute for that trust.
3. Real cloud credential/account/model/voice, provider health/format/error/latency and real browser/device acoustic validation remain absent. Synthetic configuration is not readiness.
4. Single process/runtime owner, process-local cache/rates/admission, non-preemptible CPU and hung-provider restart limitations remain. Restart closes uncertain playback rather than replaying an assumed offset. The global shutdown grace can terminate unfinished I/O without fabricated success.
5. LLM orchestration/evaluation-provider integration remain outside scope. No retention/deletion or distributed deployment feature was implemented.

Stopped after this TTS downlink/playback implementation and report. **No Live Voice E2E or production-readiness claim.**
`
writeFileSync(resolve(output,'REPORT.md'),report)
const artifact=resolve(here,'artifact-manifest.json');writeJson(artifact,{format:'tts-playback-artifact-manifest-v1',algorithm:'SHA-256',files:walk(here).filter(p=>p!==artifact).map(p=>({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:sha256(readFileSync(p))}))})
console.log(JSON.stringify({status:state.status,verifiedPassSuites:state.completedPassSuites,sourceManifestSHA256:state.source.finalManifestSHA256,artifactManifestSHA256:sha256(readFileSync(artifact)),overallReleaseReadiness:'BLOCKED',failures:state.failures}))
if(state.status!=='PASS')process.exitCode=1
