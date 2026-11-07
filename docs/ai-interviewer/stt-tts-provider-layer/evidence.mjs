import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { here, inspect, expectedChanges, walk } from './state.mjs'
import { root, sha256, writeJson } from './manifest.mjs'

const run = process.argv[2], state = inspect(run), output = resolve(here, 'runs', run), {currentSourceManifest, ...summary} = state
summary.recordedAtUtc = new Date().toISOString()
writeJson(resolve(output, 'summary.json'), summary)
writeJson(resolve(output, 'source-final.json'), currentSourceManifest)
writeJson(resolve(output, 'source-changes.json'), {acceptedPhase56SourceSHA256: state.source.beforeAcceptedSHA256, created: state.source.created, modified: state.source.modified, deleted: state.source.deleted, purposes: expectedChanges})
writeJson(resolve(output, 'preservation-after.json'), {packages: state.preservation, earlier: state.earlierEvidence})
const fileRows = [...state.source.created, ...state.source.modified].map(f => `| ${state.source.created.some(c => c.path === f.path) ? 'CREATED' : 'MODIFIED'} | \`${f.path}\` | ${expectedChanges[f.path]} |`).join('\n')
const tests = state.regression.map(r => `| ${r.id} | **${r.status}** | ${r.count ?? 'command/probe'} | \`${r.command}\` | ${r.resultDirectory} |`).join('\n')
const rechecks = state.regression.filter(r => r.originalAttempt).map(r => `- ${r.id}: original exit ${r.originalAttempt.exitCode}, ${r.originalAttempt.passLines}/21 checks before stop; verified unchanged-source recheck ${r.count}/${r.count}, exit ${r.exitCode}. ${r.retryNote}`).join('\n')
const report = `# STT/TTS provider-layer implementation — ${state.status}

**Implementation/contract verification: ${state.status}. API integration readiness remains PARTIAL. Overall release readiness and Live Voice E2E remain BLOCKED.**

Recorded ${summary.recordedAtUtc}; run ${run}. This work implements only the server STT/TTS provider layer. Candidate transport, LLM orchestration and evaluation integration are excluded. No production-readiness claim is made.

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
${fileRows}

All remaining new files are confined to docs/ai-interviewer/stt-tts-provider-layer and listed by the new artifact manifest. No accepted Phase 1–5.6 evidence was modified.

## New provider contract results

**58/58 PASS; 31 injected synthetic SDK requests; zero real provider calls.** The suite exercises actual installed SDK serialization/response parsing against fake HTTP, not a mock that bypasses adapter code. Cases cover disabled defaults, independent registration, dedicated credentials, JSON/credential exclusion, required models/voice, invalid providers/endpoints/timeouts, production startup failures, body/input bounds, PCM conversion, multilingual hints, caller input copying, 400/401/403/429/500 without retries, raw exception sanitization, redirects/debug environment, cancellation, physical-capacity quarantine, late settlement, body stalls and shutdown.

## Regression and security

${state.completedPassSuites} verified PASS suite results, plus the explicitly BLOCKED migration probe. All original assertions are unchanged. Results and exact commands:

| Suite | Result | Count | Command | Evidence directory relative to this package |
|---|---|---|---|---|
${tests}

Browser attempt history is retained and must not be silently described as a clean first run:

${rechecks || '- No browser recheck was needed.'}

The first main all-command stopped with exit 1 at that browser assertion. Only the affected browser suite was rechecked; unfinished browser4/answer-browser/migration checks were resumed individually. No other completed main suite was rerun and no test expectation/timer was loosened. The original failure is an open timing-sensitive test observation, not proof of a provider-layer regression or proof of a root cause.

The unchanged-source combined synthetic flow remains 27/27 PASS: four durable answers, follow-up/clarification/interruption, receipt replay, one independently verified MOCK report and staff-only access. Candidate isolation, Origin, invite/session expiry/revocation, staff RBAC, provider provenance/fencing, answer preservation, evaluator fairness/restart/inputHash/evidence, production fail-closed policy and MCP/permissions all remain covered. MCP has 18 scenarios and 69 tools per invalid-auth state; browser counts overlap base scenarios and are not unique-case totals.

Type checks and contracts/API/web production builds pass; two existing web lint warnings and the existing chunk-size advisory remain. Logs/metadata include UTC timing, exit code, cwd, exact Node arguments and guard scope.

## Secret scan ordering and results

The early main credential-canary scan happened before the new build and is retained as preliminary evidence. A separate completed post-build scan is authoritative for the new dedicated speech credential: **143 frontend/build files; zero violations; zero values printed**. Scan evidence: ${state.postBuildSecretVerification.run}; started ${state.postBuildSecretVerification.process.startedAt}, after web build finished ${state.regression.find(r => r.id === 'web-build').finishedAt}. The runner was reordered for future reproductions so this scan follows the build. The original scanner also passes 143 files/zero violations.

The production web build receives only synthetic existing-key and dedicated-speech canaries. No real key or retained .env is loaded. ${state.logPrivacy.filesChecked} retained logs have zero detected credential findings; fixture credentials/screenshots are suppressed. Closed schemas and pattern scans are practical checks, not a claim to recognize every arbitrary secret encoding.

## Source integrity and evidence preservation

Accepted Phase 5.6 source SHA-256: ${state.source.beforeAcceptedSHA256}.

**Final ${state.source.fileCount}-file source manifest SHA-256: ${state.source.finalManifestSHA256}.**

Source files digest: ${state.source.filesDigest}. Source remained byte-identical throughout final tests/rechecks. source-changes.json records exact before/after hashes and scope. The artifact manifest covers every new evidence file and excludes itself; the read-only verifier checks it after generation.

${state.preservation.map(p => `- ${p.phase}: ${p.files} files unchanged; zero unlisted artifacts; artifact manifest SHA-256 ${p.artifactManifestSHA256}.`).join('\n')}

All 608 earlier protected evidence/training files are unchanged. Phase 5.1 remains BLOCKED and accepted supported-scope statuses are not broadened. No Git metadata is available; manifests provide exact provenance.

## External calls, cleanup and limitations

Network accounting: ${JSON.stringify(state.network)}.

No inference/provider API was called, no credential was provisioned, and no local model/Ollama service was installed/used. Official public documentation was read separately to verify protocol; [OpenAI transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) and [speech PCM](https://developers.openai.com/api/docs/guides/text-to-speech) plus installed SDK 7.20.0 types informed this implementation. All runtime SDK requests were injected synthetic responses.

Cleanup ${state.cleanup.status}: own temporary run profiles removed; zero other DB sessions and zero leftover own probe databases; exact local test cluster stopped. resource-cleanup.json records all resolved-scope commands and exit codes. No unrelated application was stopped or application database dropped.

Capacity is process-local and assumes one server registry/runtime owner. Synchronous CPU cannot be preempted; permanently uncancellable operations retain slots until settlement/process exit. Acoustic quality, real account/model/voice support, provider latency/error behavior and uncertainty calibration still need live validation. No continuous provider-health guarantee or distributed enforcement is claimed.

## Remaining integration gaps and blockers

- Candidate capture/upload/playback/STOP transport, independent trusted transport provenance, and its server delivery composition remain unimplemented.
- Future dedicated server credential, selected account-valid models/voice and actual cloud health/format/latency/acoustic validation remain unavailable. Supplying a key alone does not enable a candidate interview.
- LLM question/decision orchestration and real evaluation/provenance integration remain outside scope and unchanged.
- **OPEN / BLOCKED: pgvector/full migration chain.** Exact unchanged migration 0008 still fails for missing vector (0A000), rolls back and cleans up. No migration skipped/stubbed/edited.
- **OPEN / BLOCKED: Live Voice E2E worker and trusted candidate transport.** No live test is claimed or substituted by synthetic acceptance.

Stopped after this STT/TTS-layer implementation and report. No candidate transport, LLM/evaluation integration, retention or distributed runtime work was begun.
`
writeFileSync(resolve(output, 'REPORT.md'), report)
const artifact = resolve(here, 'artifact-manifest.json')
writeJson(artifact, {format: 'speech-layer-artifact-manifest-v1', algorithm: 'SHA-256', files: walk(here).filter(p => p !== artifact).map(p => ({path: relative(root, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: sha256(readFileSync(p))}))})
console.log(JSON.stringify({status: state.status, newContractChecks: state.contract.checks, syntheticSdkRequests: state.contract.syntheticSdkRequests, verifiedPassSuites: state.completedPassSuites,
  sourceManifestSHA256: state.source.finalManifestSHA256, acceptedEvidenceUnchanged: state.preservation.every(p => !p.mismatches.length && !p.unlisted), overallReleaseReadiness: 'BLOCKED', artifactManifestSHA256: sha256(readFileSync(artifact)), failures: state.failures}))
if (state.status !== 'PASS') process.exitCode = 1
