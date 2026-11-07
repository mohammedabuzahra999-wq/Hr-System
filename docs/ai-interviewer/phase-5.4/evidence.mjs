import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256, writeJson } from './manifest.mjs'

const here = dirname(fileURLToPath(import.meta.url)), run = process.argv[2]
if (!run || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error('Usage: node evidence.mjs RUN_ID')
const output = resolve(here, 'runs', run), read = p => JSON.parse(readFileSync(p, 'utf8')), get = name => read(resolve(output, name))
const changesIn = files => files.filter(f => !existsSync(resolve(root, f.path)) || sha256(readFileSync(resolve(root, f.path))) !== f.sha256).map(f => f.path)
const packageSpecs = [
  ['phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67', 'runs/20261103T074721Z/source-before.json', '06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163'],
  ['phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342', 'runs/final-20261103-verified-2/source-final.json', 'f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f'],
  ['phase-5.3', '8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900', 'runs/final-20261103/source-final.json', 'b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8'],
]
const preservation = packageSpecs.map(([name, expected, sourceFile, expectedSource]) => {
  const folder = resolve(root, 'docs/ai-interviewer', name), bytes = readFileSync(resolve(folder, 'artifact-manifest.json')), prior = JSON.parse(bytes)
  const sourceHash = sha256(readFileSync(resolve(folder, sourceFile)))
  return {name, artifactManifestSHA256: sha256(bytes), artifactHashMatchesAccepted: sha256(bytes) === expected,
    sourceManifestSHA256: sourceHash, sourceHashMatchesAccepted: sourceHash === expectedSource, files: prior.files.length, changes: changesIn(prior.files)}
})
const earlier = read(resolve(root, 'docs/ai-interviewer/phase-5.1-baseline/runs/20261103T074721Z/protected-before.json'))
const earlierPreservation = {files: earlier.fileCount, changes: changesIn(earlier.files)}
writeJson(resolve(output, 'preservation-after.json'), {packages: preservation, earlierEvidence: earlierPreservation})
const beforeBytes = readFileSync(resolve(here, 'source-before.json')), before = JSON.parse(beforeBytes), after = manifest()
writeJson(resolve(output, 'source-final.json'), after)
const old = new Map(before.files.map(f => [f.path, f])), current = new Map(after.files.map(f => [f.path, f]))
const sourceChanges = {created: after.files.filter(f => !old.has(f.path)), modified: after.files.filter(f => old.has(f.path) && old.get(f.path).sha256 !== f.sha256).map(f => ({...f, beforeSHA256: old.get(f.path).sha256})), deleted: before.files.filter(f => !current.has(f.path))}
const purposes = {
  'packages/contracts/src/aiInterviewPersistence.ts': 'Backward-compatible audio-v2 consent and mock/real candidate projection.',
  'services/hr-api/package.json': 'Add the isolated delivery check command; no dependencies.',
  'services/hr-api/src/aiInterviewer/delivery.ts': 'Server-only registration/readiness, bounded STT/TTS/play/STOP, cancellation and pre-play fencing.',
  'services/hr-api/src/aiInterviewer/deliveryContracts.ts': 'Closed normalized observation/correlation contract and audio consent identifier.',
  'services/hr-api/src/aiInterviewer/delivery.check.ts': '51 additive synthetic provider checks over disposable PostgreSQL.',
  'services/hr-api/src/aiInterviewer/routes.ts': 'Safe disabled readiness endpoint and fail-closed non-mock browser media/submission guards.',
  'services/hr-api/src/aiInterviewer/service.ts': 'Scoped generations, ordered/receipt-based trusted ingress, audio-v2 provenance rules and durable PLAY/STOP/close handling.',
}
const paths = [...sourceChanges.created, ...sourceChanges.modified, ...sourceChanges.deleted].map(f => f.path)
const unexpected = paths.filter(p => !purposes[p]), missing = Object.keys(purposes).filter(p => !paths.includes(p))
writeJson(resolve(output, 'source-changes.json'), {...sourceChanges, purposes, unexpected, expectedButUnchanged: missing})
const patterns = {'provider-gate': /(\d+)\/\d+ Phase 5\.4 provider-gate checks passed/, 'execution-bounds': /(\d+)\/\d+ Phase 5\.3 execution-bound checks passed/,
  'runtime-jobs': /(\d+)\/\d+ Phase 5\.3 runtime\/job checks passed/, 'answer-ui': /(\d+)\/\d+ Phase 5\.2 recovery checks passed/,
  'answer-db': /(\d+)\/\d+ Phase 5\.2 PostgreSQL answer checks passed/, engine: /(\d+)\/\d+ Phase 1 checks passed/,
  persistence: /(\d+)\/\d+ Phase 2 PostgreSQL\/security checks passed/, report: /(\d+)\/\d+ Phase 4 report checks passed/,
  ui: /(\d+)\/\d+ Phase 3 UI logic checks passed/, mcp: /PASS: (\d+) MCP authorization lifecycle scenarios/, plans: /PASS: (\d+) shared-plan/,
  'report-security': /PASS: (\d+) report authorization\/scope checks/}
const expectedCounts = {'provider-gate': 51, 'execution-bounds': 14, 'runtime-jobs': 30, 'answer-ui': 26, 'answer-db': 27, engine: 37, persistence: 65, report: 76, ui: 24,
  mcp: 18, permissions: 107, gate: 194, plans: 95, 'report-security': 44, voice: 17, 'local-voice-api': 3, 'local-voice-audio': 4, 'local-voice-turn': 8, 'local-voice-queue': 6,
  scorecard: 27, 'structured-provider': 4, browser3: 44, browser4: 58, 'answer-browser': 56}
const regression = get('inventory.json').map(item => {
  const path = resolve(output, item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')
  if (!existsSync(path)) return {...item, status: 'BLOCKED', count: null, reason: 'Suite did not execute'}
  const result = read(path), log = readFileSync(resolve(output, item.id + '.log'), 'utf8')
  let count = Number(patterns[item.id]?.exec(log)?.[1] ?? result.passLines), unit = patterns[item.id] ? 'checks/scenarios' : 'reported assertions/groups'
  if (['scenario', 'typechecks', 'contracts-build', 'api-build', 'web-build', 'migrations'].includes(item.id)) {count = null; unit = item.id === 'typechecks' ? '3 workspace checks' : item.id.endsWith('build') ? 'production build' : item.id === 'scenario' ? 'synthetic scenario' : 'full-chain probe'}
  if (['browser3', 'browser4', 'answer-browser'].includes(item.id)) {count = get(`browser/${item.id}/${item.id === 'browser4' ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3'}/browser-results.json`).passed; unit = 'browser checks'}
  return {...item, ...result, count, unit, countMatchesBaseline: expectedCounts[item.id] === undefined || count === expectedCounts[item.id]}
})
const integrity = get('integrity.json'), provider = get('provider-matrix.json'), runtime = get('runtime-matrix.json'), migration = get('migrations.json'), environment = get('environment.json')
const live = read(resolve(here, 'live-readiness.json'))
const counters = readdirSync(resolve(output, 'network')).map(file => get('network/' + file))
const network = {instrumentedNodeProcesses: counters.length, guardedExternalAttempts: counters.reduce((n, r) => n + r.blockedExternalAttempts, 0), realModelCalls: 0, realProviderCalls: 0,
  allowedLocalSockets: counters.reduce((n, r) => n + r.socketConnectionsAllowed, 0), allowedLocalFetch: counters.reduce((n, r) => n + r.fetchCallsAllowed, 0),
  scope: 'Guarded Node fetch/socket and original Chrome page interception; native Chrome background traffic not independently packet-captured.'}
const source = {beforeManifestSHA256: sha256(beforeBytes), finalManifestSHA256: sha256(readFileSync(resolve(output, 'source-final.json'))), filesDigest: after.filesDigest,
  fileCount: after.fileCount, stableDuringFinalRun: integrity.source.unchanged, matchesTested: JSON.stringify(after) === JSON.stringify(get('source-after.json')),
  acceptedCopyMatches: sha256(beforeBytes) === packageSpecs[2][3], created: sourceChanges.created.length, modified: sourceChanges.modified.length, deleted: sourceChanges.deleted.length, unexpected, expectedButUnchanged: missing}
const preserved = preservation.every(p => p.artifactHashMatchesAccepted && p.sourceHashMatchesAccepted && !p.changes.length) && !earlierPreservation.changes.length
const migrationExpected = migration.cleanup === true && (migration.status === 'PASS' || (migration.status === 'BLOCKED' && migration.vectorAvailable === false && migration.sqlState === '0A000' && migration.transactionRolledBack === true))
const required = regression.filter(r => r.id !== 'migrations')
const fail = !preserved || !source.acceptedCopyMatches || !source.stableDuringFinalRun || !source.matchesTested || !integrity.protected.unchanged || unexpected.length || missing.length || source.deleted ||
  !migrationExpected || network.guardedExternalAttempts || provider.externalAttempts || provider.checks !== 51 || required.some(r => r.status === 'FAIL' || r.countMatchesBaseline === false)
const status = fail ? 'FAIL' : required.some(r => r.status !== 'PASS') ? 'BLOCKED' : 'PASS'
const blockers = [
  {id: 'pgvector-full-migration-chain', status: 'OPEN / BLOCKED', detail: 'Exact full chain cannot pass locally without pgvector. No migration skipped/stubbed/edited.', probe: migration},
  {id: 'live-voice-e2e-worker-configuration', status: 'OPEN / BLOCKED', detail: 'No running worker or isolated candidate real-engine/trusted connection transport; model files alone are insufficient.', readiness: live},
]
const summary = {phase: '5.4', providerGateStatus: status, providerGateScope: 'Synthetic registered adapters / real disposable PostgreSQL / single process', liveVoiceE2EStatus: 'BLOCKED', releaseStatus: 'BLOCKED',
  recordedAtUtc: new Date().toISOString(), displayTimezone: 'Asia/Riyadh', runId: run, environment, source, acceptedEvidencePreserved: preserved, preservation, earlierPreservation,
  policy: {providerOperationTimeoutMs: 15000, physicalProviderCalls: 2, sttMaximumBytes: 8000000, ttsMaximumBytes: 2000000, productionComposition: 'disabled', consent: 'ai-interview-v2-audio'},
  tests: regression, newChecks: provider.checks, providerMatrixRows: provider.matrix.length, phase53Fairness: runtime.matrix.filter(r => r.scenario.includes('fairness')), network, releaseBlockers: blockers,
  migrationsAdded: 0, dependenciesAdded: 0, llmGenerationIntroduced: false, realProviderValidation: 'BLOCKED / unconfigured', realTrustedConnectionValidation: 'BLOCKED', phase55Started: false,
  phase55Readiness: 'Safe only for separately approved, scoped follow-on work. Live/production activation is not ready: real adapter/connection/audio UI/worker E2E and full-chain validation remain open.'}
writeJson(resolve(output, 'summary.json'), summary)
const testRows = regression.map(r => `| ${r.id} | \`${r.command}\` | **${r.status}** | ${r.count ?? '—'} ${r.unit ?? ''} |`).join('\n')
const providerRows = provider.matrix.map(r => `| ${r.scenario} | ${r.interviewStatus}/${r.phase ?? '—'} | ${r.version} | ${r.answerCount}/${r.finalizedCount} | ${r.questionCount} | ${r.providerReceipts} | ${r.pendingPlay}/${r.pendingStop} |`).join('\n')
const fileRows = paths.map(path => `| ${sourceChanges.created.some(f => f.path === path) ? 'CREATED' : 'MODIFIED'} | \`${path}\` | ${purposes[path]} |`).join('\n')
const criteria = [
  ['Provider cannot mutate authority', 'Adapter methods receive request data only; closed observations pass through InterviewService/engine under SQL locks.'],
  ['Trusted/untrusted provenance', 'Mock-v1 and audio-v2 paths are separate; generation/session/owner checked on every trusted observation.'],
  ['Browser cannot forge STT', 'Service rejects audio-v2 browser transcript/typed/mock events; no provider callback HTTP endpoint; production browser media disabled.'],
  ['Bounded execution', '15s per async operation, two physical calls, cancellation and late settlement consumption; no synchronous CPU preemption claimed.'],
  ['Duplicate/stale/reordered safety', 'Existing fingerprinted receipts plus ordered cursor/version/correlation; identical and competing simultaneous events tested.'],
  ['Application-owned PLAY', 'Durable reservation and idempotency key; no started/finished transition from TTS accepted response; issued-play ACK required.'],
  ['Interruption consistency', 'Both finish/speech race orders, duplicate starts, late finish, lost/duplicate STOP ACK and interruption reconnect tested.'],
  ['Production fail-closed', 'Absent/invalid/synthetic production registration unavailable; production route composition disabled and START 503.'],
  ['Server-only credentials', 'No provider credential configured or returned; safe readiness allowlist; candidate cookie remains HttpOnly.'],
  ['Phase 5.2 preserved', '26 UI, 27 DB and 56 expanded browser checks; protected evidence unchanged.'],
  ['Phase 5.3 preserved', '14 bounds and 30 runtime checks, fairness/restart matrices; protected evidence unchanged.'],
  ['Evaluation separate', 'No evaluator/report source edits; 76 evidence checks; synthetic completion only creates PENDING frozen evaluation.'],
  ['Existing regressions', 'Every executable baseline suite/typecheck/build PASS; environment migration and live voice blockers remain separate.'],
  ['Reproducible evidence', 'Frozen source, exact entrypoints/arguments, raw logs, guarded network counters, protected package hashes.'],
]
writeFileSync(resolve(output, 'REPORT.md'), `# Phase 5.4 Provider Gate — ${status}

**Provider Gate: ${status} for synthetic adapters in the supported local single-process scope.**
**Live Interview Voice E2E: BLOCKED. Release readiness: BLOCKED.**

Phase 5.1 remains BLOCKED only by the known environment/release validations. Phase 5.2 and Phase 5.3 remain accepted PASS in their supported scopes. All three evidence packages are unchanged.

Recorded ${summary.recordedAtUtc}, display zone Asia/Riyadh. Node ${environment.node}, npm ${environment.npm}, PostgreSQL ${migration.postgresqlVersion}, Chrome ${environment.chromeVersion}.

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
${providerRows}

## Security and evaluation integrity

Foreign interview/generation/question/turn/playback, expired/revoked/stale sessions, browser forgery and conflicting identity reuse fail without unauthorized writes. Candidate/staff separation, HttpOnly protections, Origin, DTO allowlists, HR scope and employee Voice/Copilot/MCP authority remain intact. No provider credential is loaded, logged, returned or stored in browser data. Metadata fields are closed and contain no transcript, raw exception or credential.

No LLM integration is introduced. Synthetic follow-up/clarification proposals use the existing deterministic frozen plan; engine limits remain authoritative. Real LLM/provider validation is separately BLOCKED/unconfigured. Evaluation remains completed durable interview -> frozen input/inputHash -> versioned job -> evidence verification/NOT_ASSESSED -> HR report. Existing 76 evaluation/evidence checks PASS; no evaluator, verifier, runtime or report source file changed.

## Readiness configuration and Live Voice E2E

The explicit server configuration has disabled/synthetic/real modes, a production flag, registered adapter, trusted STT/connection/idempotent-play capabilities and a strict health result. Configured/ready/unhealthy/unavailable are distinguishable. Synthetic registration in production and missing/invalid requirements fail closed. Current HTTP composition is **disabled**, so production START remains 503 with no mock fallback. GET /api/ai-interview/delivery/readiness exposes only status/mode/liveValidated=false.

Local model assets exist; the bounded local readiness probe found ${live.workerListenerPresent ? 'a' : 'no'} worker listener on 8766. There is no isolated candidate real-engine transport/connection source. Real audio-v2 browser disclosure, gesture/media handling and authenticated worker transport remain unvalidated. The old local.e2e.ts is an employee Copilot workflow that reads employee demo credentials; it is not run as substitute proof of candidate voice delivery. No provider/model is started or downloaded.

**Live Interview Voice E2E: BLOCKED**, not executed. Synthetic full lifecycle (secure candidate session, question delivery, trusted-fixture STT, follow-up/clarification and completion) is tested separately and cannot resolve this blocker.

## Complete regression and exact commands

| Suite | Command | Result | Count |
|---|---|---|---|
${testRows}
| live interview voice E2E | no isolated candidate worker/transport configuration | **BLOCKED** | not executed |

All executable baseline suites PASS. New provider gate is **51/51**; Phase 5.2 remains **26/26 UI, 27/27 DB, 56/56 expanded browser**. Phase 5.3 remains **14/14 execution and 30/30 runtime**. Browser counts overlap with original 44/58 coverage. MCP is 18 scenarios with 69 tools per invalid-auth state, not 19 from counting its summary line. Two existing web lint warnings and large-chunk build advisory remain. No original test assertion changed or weakened. Early new-test failures and their correction are retained in [iterations](../../iterations.md).

Phase 5.3 fairness rerun: ${summary.phase53Fairness.map(r => `${r.scenario} ${r.observedWallMs} ms with A=${r.hangingJobStatus}, B=${r.otherJobStatus}`).join('; ')}. Native fixture tolerance remains <2,000ms; production scheduling is one second plus finite DB/scan/scheduling latency.

Exact actual Node arguments/cwd/allowlisted ports are in inventory.json. Per-suite UTC timestamps, exit codes, logs, network counters and browser/database matrices are beside this report. See [README](../../README.md) for reproducible commands. Child environment is allowlisted, .env/provider credentials excluded, older browser evidence redirected, fixture credentials/screenshots suppressed and temporary profiles removed. Node processes instrumented: ${network.instrumentedNodeProcesses}; guarded external attempts **${network.guardedExternalAttempts}**; real provider/model calls **0**. Local PostgreSQL/HTTP/CDP/Vite traffic is expected. Native Chrome background traffic is not independently packet-captured.

## Exact source changes and hashes

| Change | Application/test/config file | Purpose |
|---|---|---|
${fileRows}

All evidence-only files are confined to docs/ai-interviewer/phase-5.4 and listed with SHA-256 in its artifact manifest. [source-changes.json](source-changes.json) contains exact before/after hashes for each source/config difference. Source comparison against accepted Phase 5.3: ${source.created} created, ${source.modified} modified, ${source.deleted} deleted; ${unexpected.length} unexpected paths. Original regression test files and frozen training/model artifacts are unchanged.

Accepted Phase 5.2 source SHA-256: \`${packageSpecs[1][3]}\`.
Accepted Phase 5.3 source SHA-256: \`${source.beforeManifestSHA256}\`.
New Phase 5.4 source manifest SHA-256: \`${source.finalManifestSHA256}\`.
New ${source.fileCount}-file source digest: \`${source.filesDigest}\`.
Final source stable throughout verification: **${source.stableDuringFinalRun}**; matches tested source: **${source.matchesTested}**.

${preservation.map(p => `- ${p.name}: ${p.files} files unchanged; artifact manifest SHA-256 \`${p.artifactManifestSHA256}\`.`).join('\n')}
- Earlier protected evidence/training: ${earlierPreservation.files} files unchanged.

## Acceptance criteria

| Criterion | Supported-scope evidence |
|---|---|
${criteria.map(([name, evidence]) => `| ${name} | ${evidence} |`).join('\n')}

## Remaining production blockers and separate limitations

1. **OPEN / BLOCKED: pgvector/full migration chain.** Exact unchanged migration 0008 still fails with missing vector, rolls back and drops only its generated test DB. Fixture-based 0026 checks do not waive it.
2. **OPEN / BLOCKED: Live Voice E2E worker/configuration.** Requires a running STT/TTS worker plus isolated candidate real-engine/transport/connection configuration and actual synthetic-data live validation.

Separate scope limits: one application process/owner; no distributed coordination; asynchronous/cooperative bounds do not preempt CPU loops or DB/event-loop outages; two permanent physical hangs require restart; graceful durable close depends on DB; no active real candidate media/transport/dispatcher or validated real provider connection; bounded utterance envelopes require future segmentation; no real LLM generation. Provider-ready abstractions and synthetic proof do not establish a production interview delivery guarantee.

## Phase 5.5 readiness

${summary.phase55Readiness} **Phase 5.5 has NOT STARTED.** Stopped after Phase 5.4; the next phase requires separate authorization/specification.
`)
const artifacts = []
function walk(folder) {for (const name of readdirSync(folder).sort()) {const p = resolve(folder, name); if (p === resolve(here, 'artifact-manifest.json')) continue; if (statSync(p).isDirectory()) walk(p); else artifacts.push({path: relative(root, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: sha256(readFileSync(p))})}}
walk(here); writeJson(resolve(here, 'artifact-manifest.json'), {format: 'phase54-artifact-manifest-v1', algorithm: 'SHA-256', files: artifacts})
console.log(JSON.stringify({providerGateStatus: status, liveVoiceE2E: 'BLOCKED', releaseStatus: 'BLOCKED', acceptedEvidencePreserved: preserved, source, newChecks: provider.checks, report: relative(root, resolve(output, 'REPORT.md'))}))
if (status !== 'PASS') process.exitCode = 1
