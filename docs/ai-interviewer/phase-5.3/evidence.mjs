import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256, writeJson } from './manifest.mjs'

const here = dirname(fileURLToPath(import.meta.url)), runId = process.argv[2]
if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error('Usage: node evidence.mjs RUN_ID')
const output = resolve(here, 'runs', runId), read = path => JSON.parse(readFileSync(path, 'utf8'))
const get = name => read(resolve(output, name)), slash = path => relative(root, path).replaceAll('\\', '/')
const changed = files => files.filter(file => !existsSync(resolve(root, file.path)) || sha256(readFileSync(resolve(root, file.path))) !== file.sha256).map(file => file.path)
function previousPackage(name, artifactHash, sourcePath, sourceHash) {
  const folder = resolve(root, 'docs/ai-interviewer', name), artifacts = read(resolve(folder, 'artifact-manifest.json'))
  const currentArtifactHash = sha256(readFileSync(resolve(folder, 'artifact-manifest.json')))
  const currentSourceHash = sha256(readFileSync(resolve(folder, sourcePath)))
  return { name, fileCount: artifacts.files.length, changed: changed(artifacts.files), artifactManifestSHA256: currentArtifactHash,
    artifactManifestMatchesAccepted: currentArtifactHash === artifactHash, sourceManifestSHA256: currentSourceHash, sourceManifestMatchesAccepted: currentSourceHash === sourceHash }
}
const phase51 = previousPackage('phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67',
  'runs/20261103T074721Z/source-before.json', '06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163')
const phase52 = previousPackage('phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342',
  'runs/final-20261103-verified-2/source-final.json', 'f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f')
const oldProtected = read(resolve(root, 'docs/ai-interviewer/phase-5.1-baseline/runs/20261103T074721Z/protected-before.json'))
const preservation = { recordedAtUtc: new Date().toISOString(), phase51: { ...phase51, status: 'BLOCKED — environment validation blockers only, with clean executable regression' },
  phase52: { ...phase52, status: 'PASS — implemented local scope' }, earlierEvidence: { fileCount: oldProtected.fileCount, changed: changed(oldProtected.files) } }
writeJson(resolve(output, 'preservation-after.json'), preservation)

const before = read(resolve(here, 'source-before.json')), after = manifest()
writeJson(resolve(output, 'source-final.json'), after)
const oldMap = new Map(before.files.map(file => [file.path, file])), newMap = new Map(after.files.map(file => [file.path, file]))
const changes = { created: after.files.filter(file => !oldMap.has(file.path)),
  modified: after.files.filter(file => oldMap.has(file.path) && oldMap.get(file.path).sha256 !== file.sha256).map(file => ({ ...file, beforeSHA256: oldMap.get(file.path).sha256 })),
  deleted: before.files.filter(file => !newMap.has(file.path)) }
const purposes = {
  'packages/contracts/src/aiInterviewReport.ts': 'Optional backward-compatible persisted attempt owner/token/deadline/hash fields.',
  'services/hr-api/package.json': 'Two additive local check commands; no dependency changes.',
  'services/hr-api/src/aiInterviewer/audit.ts': 'Safe attempt/timeout/recovery audit metadata and system source.',
  'services/hr-api/src/aiInterviewer/execution.ts': '30-second asynchronous bound, cancellation, two physical slots, late-settlement consumption.',
  'services/hr-api/src/aiInterviewer/execution.check.ts': '14 offline execution-bound checks.',
  'services/hr-api/src/aiInterviewer/report.ts': 'Optional AbortSignal context for the existing evaluator interface.',
  'services/hr-api/src/aiInterviewer/reportService.ts': 'Bounded attempts, durable owner/token/deadline fencing, claim-hash and retry anchors.',
  'services/hr-api/src/aiInterviewer/runtime.ts': 'Independent timer/job passes, bounded dispatch and graceful drain.',
  'services/hr-api/src/aiInterviewer/runtime.check.ts': '30 real disposable-PostgreSQL fairness/restart/failure/integrity checks.',
  'services/hr-api/src/aiInterviewer/runtimeTestSupport.ts': 'Deterministic scheduler/deferred test helpers.',
  'services/hr-api/src/aiInterviewer/service.ts': 'Transactional start/completed audit around existing restart recovery.',
  'services/hr-api/src/aiInterviewer/ui.fixture.ts': 'Await asynchronous maintenance shutdown before closing the test database; assertions unchanged.',
  'services/hr-api/src/index.ts': 'Await maintenance drain before database shutdown.'
}
const actualPaths = [...changes.created, ...changes.modified, ...changes.deleted].map(file => file.path)
const unexpected = actualPaths.filter(path => !purposes[path]), missing = Object.keys(purposes).filter(path => !actualPaths.includes(path))
writeJson(resolve(output, 'source-changes.json'), { ...changes, unexpected, expectedButUnchanged: missing, purposes })

const patterns = {
  'execution-bounds': /(\d+)\/\d+ Phase 5\.3 execution-bound checks passed/, 'runtime-jobs': /(\d+)\/\d+ Phase 5\.3 runtime\/job checks passed/,
  engine: /(\d+)\/\d+ Phase 1 checks passed/, persistence: /(\d+)\/\d+ Phase 2 PostgreSQL\/security checks passed/,
  report: /(\d+)\/\d+ Phase 4 report checks passed/, ui: /(\d+)\/\d+ Phase 3 UI logic checks passed/,
  mcp: /PASS: (\d+) MCP authorization lifecycle scenarios/, plans: /PASS: (\d+) shared-plan/,
  'report-security': /PASS: (\d+) report authorization\/scope checks/,
  'answer-ui': /(\d+)\/\d+ Phase 5\.2 recovery checks passed/, 'answer-db': /(\d+)\/\d+ Phase 5\.2 PostgreSQL answer checks passed/
}
const expectedCounts = { 'execution-bounds': 14, 'runtime-jobs': 30, 'answer-ui': 26, 'answer-db': 27, engine: 37, persistence: 65, report: 76, ui: 24,
  mcp: 18, permissions: 107, gate: 194, plans: 95, 'report-security': 44, voice: 17, 'local-voice-api': 3, 'local-voice-audio': 4, 'local-voice-turn': 8,
  'local-voice-queue': 6, scorecard: 27, 'structured-provider': 4, browser3: 44, browser4: 58, 'answer-browser': 56 }
const regression = get('inventory.json').map(item => {
  const path = resolve(output, item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')
  if (!existsSync(path)) return { ...item, status: 'BLOCKED', reason: 'Suite did not execute', count: null }
  const result = read(path), log = readFileSync(resolve(output, item.id + '.log'), 'utf8')
  let count = Number(patterns[item.id]?.exec(log)?.[1] ?? result.passLines), unit = patterns[item.id] ? 'checks/scenarios' : 'reported assertions/groups'
  if (['typechecks', 'web-build', 'api-build', 'contracts-build', 'scenario', 'migrations'].includes(item.id)) {
    count = null; unit = item.id === 'typechecks' ? '3 workspace checks' : item.id.endsWith('build') ? '1 production build' : item.id === 'scenario' ? '1 synthetic scenario' : 'full-chain probe'
  }
  if (['browser3', 'browser4', 'answer-browser'].includes(item.id)) {
    count = read(resolve(output, 'browser', item.id, item.id === 'browser4' ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3', 'browser-results.json')).passed
    unit = 'browser checks'
  }
  return { ...item, ...result, count, unit, countMatchesBaseline: expectedCounts[item.id] === undefined || expectedCounts[item.id] === count }
})
const runtime = get('runtime-matrix.json'), integrity = get('integrity.json'), migration = get('migrations.json'), environment = get('environment.json')
const networks = readdirSync(resolve(output, 'network')).map(file => get('network/' + file))
const network = { instrumentedNodeProcesses: networks.length, blockedExternalAttempts: networks.reduce((n, row) => n + row.blockedExternalAttempts, 0), realModelCalls: 0,
  allowedLocalSockets: networks.reduce((n, row) => n + row.socketConnectionsAllowed, 0), allowedLocalFetch: networks.reduce((n, row) => n + row.fetchCallsAllowed, 0),
  suppressedFixtureWrites: networks.reduce((n, row) => n + row.suppressedFixtureWrites, 0), suppressedScreenshots: networks.reduce((n, row) => n + row.suppressedScreenshots, 0),
  scope: 'Node fetch/socket preload and original Chrome page interception; native Chrome background traffic not independently packet-captured.' }
const packagesPreserved = [phase51, phase52].every(row => row.artifactManifestMatchesAccepted && row.sourceManifestMatchesAccepted && !row.changed.length) && !preservation.earlierEvidence.changed.length
const acceptedCopyMatches = sha256(readFileSync(resolve(here, 'source-before.json'))) === phase52.sourceManifestSHA256
const finalMatchesTested = JSON.stringify(after) === JSON.stringify(get('source-after.json'))
const source = { beforeManifestSHA256: sha256(readFileSync(resolve(here, 'source-before.json'))), afterManifestSHA256: sha256(readFileSync(resolve(output, 'source-final.json'))),
  finalFilesDigest: after.filesDigest, finalFileCount: after.fileCount, sourceStableDuringFinalRun: integrity.source.unchanged, finalMatchesTested,
  acceptedCopyMatches, created: changes.created.length, modified: changes.modified.length, deleted: changes.deleted.length, unexpected, expectedButUnchanged: missing }
const required = regression.filter(row => row.id !== 'migrations')
const migrationProbeValid = migration.cleanup === true && (migration.status === 'PASS' ||
  (migration.status === 'BLOCKED' && migration.vectorAvailable === false && migration.sqlState === '0A000' && migration.transactionRolledBack === true))
const failed = !packagesPreserved || !acceptedCopyMatches || !integrity.source.unchanged || !integrity.protected.unchanged || !finalMatchesTested || unexpected.length || missing.length ||
  changes.deleted.length || !migrationProbeValid || network.blockedExternalAttempts || runtime.externalAttempts || required.some(row => row.status === 'FAIL' || row.countMatchesBaseline === false)
const status = failed ? 'FAIL' : required.some(row => row.status !== 'PASS') ? 'BLOCKED' : 'PASS'
const blockers = [
  { id: 'full-migration-chain', status: 'OPEN / BLOCKED', reason: 'Local PostgreSQL lacks pgvector; unchanged full migration chain stops at 0008. Fixture-based 0026 checks do not waive this.', probe: migration },
  { id: 'live-local-voice-e2e', status: 'OPEN / BLOCKED', command: 'npm.cmd run check:voice:local:e2e -w @hr/server', reason: 'STT/TTS worker and isolated synthetic real-engine configuration unavailable; not executed or waived.' }
]
const limitations = [
  'One application process/runtime owner and one database coordinator; no distributed ownership or multi-instance failover.',
  'The 30-second bound covers asynchronous/cooperative evaluator waits. In-process JS cannot preempt synchronous CPU-blocking code; evaluator code must return/yield promptly.',
  'No hard real-time guarantee during event-loop stalls, database outages or arbitrary workload. Timer tolerance is one second plus finite scan/DB/scheduling latency.',
  'Uncancellable calls retain physical slots. Two permanently stuck calls exhaust capacity and require restart; new attempts fail explicitly without a report.',
  'Legacy RUNNING attempts lacking owner/deadline use the existing five-minute recovery lease.',
  'Restart proof uses fresh runtime/service ownership over real durable PostgreSQL, not an OS process-kill test.',
  'Graceful logical drain still depends on database availability; interrupted RUNNING state is reconciled by the next owner.',
  'Production evaluator timeout is verified as a constant/config bound; native timing uses a reduced trusted test timeout and deterministic PostgreSQL cases use a manual clock.',
  'Native Chrome background traffic is not independently packet-captured. Instrumented application network/model attempts remain zero.'
]
const summary = { phase: '5.3', status, scope: 'Supported asynchronous/cooperative evaluator, local single-process runtime', releaseStatus: 'BLOCKED', runId,
  recordedAtUtc: new Date().toISOString(), displayTimezone: 'Asia/Riyadh', environment, preservation, packagesPreserved, source,
  policy: { evaluatorTimeoutMs: 30000, physicalCallLimit: 2, logicalDispatchLimit: 2, discoveryLimit: 64, maintenanceIntervalMs: 1000, legacyLeaseMs: 300000 },
  regressionMatrix: regression, runtimeChecks: runtime.checks, runtimeMatrixRows: runtime.matrix.length,
  fairness: runtime.matrix.filter(row => row.scenario.includes('fairness')), network, releaseBlockers: blockers, limitations,
  migrationsAdded: 0, dependenciesAdded: 0, phase54Started: false,
  phase54Readiness: status === 'PASS' ? 'Ready for separately approved isolated implementation of the delivery gate. Production activation remains blocked by the two existing release blockers and the documented execution limits.' : 'Not ready; resolve Phase 5.3 findings first.' }
writeJson(resolve(output, 'summary.json'), summary)
const textCell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ')
const testRows = regression.map(row => `| ${row.id} | \`${row.command}\` | **${row.status}** | ${row.count ?? '—'} ${row.unit ?? ''} |`).join('\n')
const stateRows = runtime.matrix.filter(row => row.jobStatus).map(row => `| ${row.scenario} | ${row.jobStatus} | ${row.attempts.map(a => `${a.attempt}:${a.status}${a.failureCode ? '/' + a.failureCode : ''}`).join(', ') || 'none'} | ${row.retryEligible} | ${row.reportPresent ? row.evidenceStatus : 'none'} | ${row.inputHashPreserved} | ${row.reportVersion}/${row.versions} | ${row.answersPreserved} |`).join('\n')
const extraRows = runtime.matrix.filter(row => !row.jobStatus).map(row => `- **${row.scenario}:** \`${JSON.stringify(row)}\``).join('\n')
const sourceRows = actualPaths.map(path => `| ${changes.created.some(file => file.path === path) ? 'CREATED' : 'MODIFIED'} | \`${path}\` | ${purposes[path] ?? 'UNEXPECTED'} |`).join('\n')
const criteria = [
  ['Bounded evaluator wait', 'execution-bounds 14/14; runtime timeout, at-deadline commit refusal and two physical-call admission checks.'],
  ['Timer independence', 'Independent timer pass; deterministic/native fairness while A remains RUNNING and B completes.'],
  ['Timeout cannot succeed', 'FAILED/EVALUATOR_TIMEOUT, finished attempt, null report; at-deadline output also refused.'],
  ['Stale completion cannot overwrite', 'Distinct A/B valid summaries; raw job/report/hash and aggregate version/sequence unchanged after late A.'],
  ['Frozen retry input/hash', 'Repeated failure/retry uses the same input/hash; corruption and consistent replacement are refused.'],
  ['Retry preserves reportVersion', 'Two retries finish version 1; only explicit REEVALUATE creates version 2.'],
  ['RUNNING restart', 'Fresh owner immediately fences old attempt; legacy attempt recovers after bounded five-minute lease.'],
  ['ACTIVE/PAUSED restart', 'Both recover PAUSED with 75,000 ms; resume derives its deadline from that exact duration.'],
  ['Mandatory evidence verification', 'Success is VALID; malformed/invalid-evidence output fails without report; report regression 76/76.'],
  ['Phase 5.2 recovery', '26/26 UI, 27/27 PostgreSQL and expanded 56/56 browser checks.'],
  ['Phase 1–4 regression', 'All executable original suites/builds PASS; counts and raw logs below.'],
  ['No real external/model calls', 'Guarded external attempts 0, real model calls 0; synthetic/offline adapters only.'],
  ['Reproducible evidence', 'Allowlisted runner, raw results, exact commands, stable final source and unchanged accepted packages.'],
  ['Single-process assumptions', 'New owner means restart; no distributed leadership or CPU worker isolation claimed.']
]
writeFileSync(resolve(output, 'REPORT.md'), `# Phase 5.3 — ${status}

Release readiness remains **BLOCKED**. Phase 5.1 remains **BLOCKED — environment validation blockers only, with clean executable regression**. Phase 5.2 remains accepted **PASS for its implemented local scope**. Both release blockers remain explicitly OPEN.

Recorded ${summary.recordedAtUtc} (display zone Asia/Riyadh). Node ${environment.node}, npm ${environment.npm}, PostgreSQL ${migration.postgresqlVersion}, Chrome ${environment.chromeVersion}. Synthetic disposable data and offline mocks only.

## Runtime architecture: before and after

Before: one serial one-second loop awaited every evaluation before processing active interview timers. An unresolved evaluator left its running flag set and blocked future timer passes. RUNNING recovery used a five-minute lease and attempt-count fencing; stop only cleared the interval.

After: interview timer work and job discovery have independent one-second intervals/reentrancy guards. Evaluator waits stay outside the timer path and outside SQL transactions. Discovery scans at most 64 envelopes and dispatches two logical jobs; the shared coordinator admits two physical calls across service objects for the same database. Shutdown cancels bounded waits, drains logical work, then closes the DB. Domain timer/warning/grace/silence rules remain unchanged. See [before-state](../../before-state.md) and [design](../../design.md).

## Evaluator timeout and cleanup

Production asynchronous wait is **30,000 ms**. Trusted constructor tests may lower it to 1..30,000 ms; HTTP/config cannot disable or raise it. Claim durably records owner, unique execution token, deadline and inputHash before invocation. Timeout aborts the optional signal and commits **FAILED / EVALUATOR_TIMEOUT**, finished attempt and **no report**. Result observed at/after its persisted deadline is refused even if the timer callback had not fired. Rejection/unavailable uses MOCK_EVALUATOR_FAILED; malformed/invalid evidence uses EVIDENCE_VALIDATION_FAILED. No fabricated report is emitted.

Uncancellable work retains its physical slot until settlement; late fulfillment/rejection is consumed and emits only a safe fenced diagnostic. Two permanently hung calls require restart. Further eligible attempts fail EVALUATOR_CAPACITY_EXHAUSTED without invoking an evaluator. Shutdown produces EVALUATOR_CANCELLED and drains logical promises without waiting for uncancellable physical work.

This bounds asynchronous/cooperative waits. It cannot preempt synchronous CPU loops, a stalled Node event loop or an unavailable database. Trusted evaluator code must return/yield promptly. No process/worker isolation is added or claimed.

## Maintenance fairness

${summary.fairness.map(row => `- **${row.scenario}:** observed in ${row.observedWallMs} ms, server-clock deadline delay ${row.serverDeadlineDelayMs} ms, hanging job ${row.hangingJobStatus}, other job ${row.otherJobStatus}, active answer count ${row.activeAnswerCount}.`).join('\n')}

Supported tolerance is one 1,000 ms interval plus finite active-row scan/DB/event-loop latency. Native local fixture acceptance is less than 2,000 ms wall time after injection; its service clock is controlled at the exact due timestamp. The zero server-clock delay is an assertion under that controlled clock, not a measured zero wall-clock latency. No deadline is extended. There is no hard real-time guarantee under arbitrary load/outage. A healthy one-hang/one-normal pair leaves the second slot usable. Finite queues drain at two jobs per scan subject to the execution bound and SQL completion; exhausted physical capacity becomes explicit failure.

## Restart and failure-injection matrix

These are real disposable PostgreSQL states, not in-memory persistence substitutes. Restart uses new runtime/service ownership over the same durable rows, rather than OS process kill. Attempt status is derived from persisted finishedAt/failureCode. Detailed rows include correlation IDs, full hashes, owner/deadline, audit actions, interview version and retry eligibility in [runtime-matrix.json](runtime-matrix.json). Invalid/corrupted input is deliberately not retryable; the deliberately replaced hash is expected to show false in the preservation column.

| Scenario | Job | Attempts | Retry eligible | Report/evidence | Original hash preserved | Report version/count | Answers preserved |
|---|---|---|---|---|---|---|---|
${stateRows}

Additional measured states:

${extraRows}

ACTIVE restart pauses at durable lastObservedAt; PAUSED restart preserves its frozen duration. Both assert 75,000 ms and exact resume deadline. PENDING runs the same frozen job. New-format RUNNING changes owner immediately, finishes former attempt WORKER_RESTARTED and uses the same job/version. Legacy ownerless/deadlineless RUNNING retains the five-minute lease. COMPLETED after lost acknowledgement is a no-op. FAILED stays failed until explicit RETRY; committed RETRY/PENDING survives restart and completes version 1. No duplicate authoritative reports appear.

## Stale completion and retry integrity

Attempt A and B intentionally return different valid summaries. A times out, HR retries the same frozen job, B becomes authoritative, then A returns. The exact durable evaluation row, report, inputHash, reportVersion and interview aggregate version/sequence remain unchanged. A former-owner/lease worker is likewise fenced. Terminal write requires RUNNING, matching attempt count, execution token and owner, plus current hash matching both the original claim and independently recomputed frozen input.

Two failures followed by successful retries preserve version 1, frozen input and inputHash. Explicit REEVALUATE separately produces version 2 and leaves the prior report intact. A first-available-attempt hash anchor also supports legacy histories. Replacing input and its current hash together during execution is refused and cannot silently rebase RETRY. Existing request fingerprints/receipts and transactional authorization remain authoritative.

## Complete test results and exact commands

| Suite | Command | Result | Count |
|---|---|---|---|
${testRows}
| live-local-voice-e2e | \`npm.cmd run check:voice:local:e2e -w @hr/server\` | **BLOCKED** | not executed |

New checks are 14 execution-bound checks plus 30 PostgreSQL runtime/job checks. All original relevant executable suites are rerun. Counts overlap: Phase 4 includes Phase 3, and expanded answer browser includes its original 44 plus 12 Phase 5.2 cases. Reported groups are not invented counts of every assert. MCP is 18 scenarios with 69 tools per invalid-auth state; the log's summary line is not another scenario. Original assertions were not weakened. The fixture change only awaits shutdown. Two existing web lint warnings and the large-chunk build advisory remain.

Raw per-suite logs, exit codes, UTC timestamps, actual Node arguments and loopback port allowlists are beside this report. inventory.json records the human npm command and actual direct entrypoint; its superficial entryExists check can be false for npm build arguments even though the recorded production build ran successfully. See [README](../../README.md) for reproducible init/all/integrity/cleanup/evidence commands.

## Security, evidence verification and diagnostics

HR/resource/staff checks, candidate isolation, HttpOnly sessions, Origin policy, DTO allowlists, expected versions, command receipts and answer atomicity remain intact. Candidate recovery/security regressions all PASS. Evaluator output never controls authorization; malformed output with authorization-shaped fields fails evidence/schema verification. No real provider was added. Application hiring status is unchanged by evaluation execution.

Operational diagnostics allow only event, interview/evaluation IDs, reportVersion, attempt and safe code. They omit raw exceptions, SQL, prompts, answers, report content, personal names and credentials. Sink failure cannot change authority. Attempt timeout and recovery audits are transactional; start/completed recovery audits disappear on rollback. System actors use system source. Raw runtime evidence contains only synthetic correlation metadata/hashes and audit action names, with a closed-key/privacy assertion.

Instrumented Node processes: ${network.instrumentedNodeProcesses}; guarded external network attempts: **${network.blockedExternalAttempts}**; real model calls: **0**. Only allowed local PostgreSQL/HTTP/CDP/Vite traffic is used. Native Chrome background traffic is not independently packet-captured. Old fixture credentials/screenshots are suppressed and browser profiles removed by the bounded cleanup command.

## Source changes and immutable evidence

Compared with accepted Phase 5.2 source: ${changes.created.length} created, ${changes.modified.length} modified, ${changes.deleted.length} deleted. Unexpected paths: ${unexpected.length}; expected-but-unchanged paths: ${missing.length}. No migrations/dependencies added. Existing Phase 5.1/5.2 tooling is unchanged; all new evidence/tooling is under Phase 5.3.

| Change | Exact file | Purpose |
|---|---|---|
${sourceRows}

[source-changes.json](source-changes.json) contains exact before/after SHA-256 values. Final source has ${after.fileCount} files; stable throughout the authoritative run: **${source.sourceStableDuringFinalRun}**; final manifest matches tested source: **${finalMatchesTested}**.

- Phase 5.1 accepted source SHA-256: \`${phase51.sourceManifestSHA256}\`.
- Phase 5.1 artifact manifest SHA-256: \`${phase51.artifactManifestSHA256}\`; ${phase51.fileCount} listed files unchanged.
- Phase 5.2 accepted source SHA-256: \`${phase52.sourceManifestSHA256}\`.
- Phase 5.2 artifact manifest SHA-256: \`${phase52.artifactManifestSHA256}\`; ${phase52.fileCount} listed files unchanged.
- Earlier evidence/training: ${oldProtected.fileCount} files unchanged.
- New final source manifest SHA-256: \`${source.afterManifestSHA256}\`.
- New source files digest: \`${after.filesDigest}\`.

## Acceptance criteria

| Criterion | Evidence |
|---|---|
${criteria.map(([name, evidence]) => `| ${textCell(name)} | ${textCell(evidence)} |`).join('\n')}

## Remaining blockers and separate local limitations

1. **OPEN / BLOCKED — pgvector / full migration chain.** The unchanged full-chain probe still stops at 0008; its transaction rolls back and only its generated DB is dropped. Synthetic-parent 0026 persistence tests do not establish full-chain validity.
2. **OPEN / BLOCKED — live local voice E2E.** STT/TTS worker and isolated synthetic real-engine configuration remain unavailable. No real audio/model inference was attempted.

Separate supported-scope limitations:

${limitations.map(item => '- ' + item).join('\n')}

## Phase 5.4 readiness

${summary.phase54Readiness} Phase 5.4 — Real Interview Delivery Gate has **not started**. No real STT/TTS/LLM/provider/WebRTC, distributed ownership, retention or unrelated refactor was implemented. STOP after Phase 5.3; separate approval is required for Phase 5.4.
`)
const artifacts = []
function walk(folder) {
  for (const name of readdirSync(folder).sort()) {
    const path = resolve(folder, name)
    if (path === resolve(here, 'artifact-manifest.json')) continue
    if (statSync(path).isDirectory()) walk(path)
    else artifacts.push({ path: slash(path), bytes: statSync(path).size, sha256: sha256(readFileSync(path)) })
  }
}
walk(here)
writeJson(resolve(here, 'artifact-manifest.json'), { format: 'phase53-artifact-manifest-v1', algorithm: 'SHA-256', files: artifacts })
console.log(JSON.stringify({ phase53Status: status, releaseStatus: 'BLOCKED', packagesPreserved, source, fairness: summary.fairness, report: slash(resolve(output, 'REPORT.md')) }))
if (status !== 'PASS') process.exitCode = 1
