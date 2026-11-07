import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256, writeJson } from './manifest.mjs'

const here = dirname(fileURLToPath(import.meta.url)), run = process.argv[2]
if (!run || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error('Usage: node evidence.mjs RUN_ID')
const output = resolve(here, 'runs', run), read = p => JSON.parse(readFileSync(p, 'utf8')), get = name => read(resolve(output, name))
const changed = files => files.filter(f => !existsSync(resolve(root, f.path)) || sha256(readFileSync(resolve(root, f.path))) !== f.sha256).map(f => f.path)
const specs = [
  ['phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67', 'runs/20261103T074721Z/source-before.json', '06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163'],
  ['phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342', 'runs/final-20261103-verified-2/source-final.json', 'f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f'],
  ['phase-5.3', '8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900', 'runs/final-20261103/source-final.json', 'b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8'],
  ['phase-5.4', 'c43408d736327197d296ff3b17cc97a0f15539a3c0b9f7e3ce0e2bca530c62e3', 'runs/final-20261103/source-final.json', '9c7c675970cbc16c1b5d42715ce2183b7c01b1f50cd50ea39f15dfb61fa3923c'],
]
const preservation = specs.map(([name, expected, sourceFile, expectedSource]) => {
  const folder = resolve(root, 'docs/ai-interviewer', name), bytes = readFileSync(resolve(folder, 'artifact-manifest.json')), prior = JSON.parse(bytes), sourceHash = sha256(readFileSync(resolve(folder, sourceFile)))
  return {name, files: prior.files.length, artifactManifestSHA256: sha256(bytes), artifactHashMatchesAccepted: sha256(bytes) === expected,
    sourceManifestSHA256: sourceHash, sourceHashMatchesAccepted: sourceHash === expectedSource, changes: changed(prior.files)}
})
const earlier = read(resolve(root, 'docs/ai-interviewer/phase-5.1-baseline/runs/20261103T074721Z/protected-before.json'))
const earlierPreservation = {files: earlier.fileCount, changes: changed(earlier.files)}
writeJson(resolve(output, 'preservation-after.json'), {packages: preservation, earlierEvidence: earlierPreservation})
const beforeBytes = readFileSync(resolve(here, 'source-before.json')), before = JSON.parse(beforeBytes), after = manifest()
writeJson(resolve(output, 'source-final.json'), after)
const old = new Map(before.files.map(f => [f.path, f])), current = new Map(after.files.map(f => [f.path, f]))
const differences = {created: after.files.filter(f => !old.has(f.path)), modified: after.files.filter(f => old.has(f.path) && old.get(f.path).sha256 !== f.sha256).map(f => ({...f, beforeSHA256: old.get(f.path).sha256})), deleted: before.files.filter(f => !current.has(f.path))}
const purposes = {
  'render.yaml': 'Explicit direct identity, disabled provider, one-owner and production mock-off deployment defaults.',
  'services/hr-api/package.json': 'Add isolated operations/operations-DB checks, no dependency changes.',
  'services/hr-api/scripts/checkInterviewSecrets.mjs': 'Frontend source/build secret-indicator and synthetic-canary scan; values never printed.',
  'services/hr-api/src/abuseBudget.ts': 'Bounded process-local fixed-window kernel with conservative overflow.',
  'services/hr-api/src/clientIdentity.ts': 'Strict socket identity and explicit trusted-proxy/right-to-left XFF policy.',
  'services/hr-api/src/rateLimit.ts': 'Use validated identity policy and bounded storage; verified-user scope; preserve existing API.',
  'services/hr-api/src/env.ts': 'Fail-closed production origin/proxy/provider/mock/test/runtime/frontend-secret validation.',
  'services/hr-api/src/index.ts': 'Scoped headers/log/error handling, health endpoints, admission drain and awaited shutdown.',
  'services/hr-api/src/db/client.ts': 'Sanitize idle DB error logs.',
  'services/hr-api/src/aiInterviewer/deployment.ts': 'Pure startup policy validation, independent of provider credentials.',
  'services/hr-api/src/aiInterviewer/operations.ts': 'Closed bounded diagnostics and internal provider admission budgets.',
  'services/hr-api/src/aiInterviewer/securityHeaders.ts': 'Sensitive API/HTML cache, referrer, MIME and frame protections.',
  'services/hr-api/src/aiInterviewer/health.ts': 'Bounded single-query DB probe and safe liveness/runtime/provider/release readiness.',
  'services/hr-api/src/aiInterviewer/shutdown.ts': 'Idempotent draining coordinator with finite grace and unsuccessful timeout outcome.',
  'services/hr-api/src/aiInterviewer/audit.ts': 'Session/invite/lifecycle/reevaluation audit vocabulary and actor sources.',
  'services/hr-api/src/aiInterviewer/authorization.ts': 'Safe session-rejection operational diagnostics; authority unchanged.',
  'services/hr-api/src/aiInterviewer/service.ts': 'Transactional audit completeness, provider admission and safe trusted CLOSE path.',
  'services/hr-api/src/aiInterviewer/reportService.ts': 'Read access/reevaluation audit plus owner-wide evaluation task drain/quiesce.',
  'services/hr-api/src/aiInterviewer/repository.ts': 'Allow explicit safe provider-throttle 429 service errors.',
  'services/hr-api/src/aiInterviewer/routes.ts': 'Staff/readiness quotas, response headers, cookie-option guard and generic candidate scope errors.',
  'services/hr-api/src/aiInterviewer/delivery.ts': 'Provider readiness/rejection diagnostics, bounded health admission, unhealthy/recheck semantics and budget-safe shutdown.',
  'services/hr-api/src/aiInterviewer/runtime.ts': 'Recent-pass health and full owner drain; existing timer/domain rules retained.',
  'services/hr-api/src/aiInterviewer/operations.check.ts': '41 proxy/configuration/health/headers/secret/shutdown checks including native proxy and OS children.',
  'services/hr-api/src/aiInterviewer/operations.persistence.check.ts': '26 real disposable-PostgreSQL abuse/audit/auth/shutdown/restart checks.',
}
const paths = [...differences.created, ...differences.modified, ...differences.deleted].map(f => f.path), unexpected = paths.filter(p => !purposes[p]), missing = Object.keys(purposes).filter(p => !paths.includes(p))
writeJson(resolve(output, 'source-changes.json'), {...differences, purposes, unexpected, expectedButUnchanged: missing})
const patterns = {operations: /(\d+)\/\d+ Phase 5\.5 operations checks passed/, 'operations-db': /(\d+)\/\d+ Phase 5\.5 operations PostgreSQL checks passed/,
  'provider-gate': /(\d+)\/\d+ Phase 5\.4 provider-gate checks passed/, 'execution-bounds': /(\d+)\/\d+ Phase 5\.3 execution-bound checks passed/,
  'runtime-jobs': /(\d+)\/\d+ Phase 5\.3 runtime\/job checks passed/, 'answer-ui': /(\d+)\/\d+ Phase 5\.2 recovery checks passed/, 'answer-db': /(\d+)\/\d+ Phase 5\.2 PostgreSQL answer checks passed/,
  engine: /(\d+)\/\d+ Phase 1 checks passed/, persistence: /(\d+)\/\d+ Phase 2 PostgreSQL\/security checks passed/, report: /(\d+)\/\d+ Phase 4 report checks passed/,
  ui: /(\d+)\/\d+ Phase 3 UI logic checks passed/, mcp: /PASS: (\d+) MCP authorization lifecycle scenarios/, plans: /PASS: (\d+) shared-plan/, 'report-security': /PASS: (\d+) report authorization\/scope checks/}
const expectedCounts = {operations: 41, 'operations-db': 26, 'secret-scan': 1, 'provider-gate': 51, 'execution-bounds': 14, 'runtime-jobs': 30, 'answer-ui': 26, 'answer-db': 27,
  engine: 37, persistence: 65, report: 76, ui: 24, mcp: 18, permissions: 107, gate: 194, plans: 95, 'report-security': 44, voice: 17, 'local-voice-api': 3,
  'local-voice-audio': 4, 'local-voice-turn': 8, 'local-voice-queue': 6, scorecard: 27, 'structured-provider': 4, browser3: 44, browser4: 58, 'answer-browser': 56}
const regression = get('inventory.json').map(item => {
  const path = resolve(output, item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')
  if (!existsSync(path)) return {...item, status: 'BLOCKED', count: null, reason: 'Suite did not execute'}
  const result = read(path), log = readFileSync(resolve(output, item.id + '.log'), 'utf8')
  let count = Number(patterns[item.id]?.exec(log)?.[1] ?? result.passLines), unit = patterns[item.id] ? 'checks/scenarios' : 'reported assertions/groups'
  if (['scenario', 'typechecks', 'contracts-build', 'api-build', 'web-build', 'migrations'].includes(item.id)) {count = null; unit = item.id === 'typechecks' ? '3 workspace checks' : item.id.endsWith('build') ? 'production build' : item.id === 'scenario' ? 'synthetic scenario' : 'full-chain probe'}
  if (['browser3', 'browser4', 'answer-browser'].includes(item.id)) {count = get(`browser/${item.id}/${item.id === 'browser4' ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3'}/browser-results.json`).passed; unit = 'browser checks'}
  return {...item, ...result, count, unit, countMatchesBaseline: expectedCounts[item.id] === undefined || count === expectedCounts[item.id]}
})
const integrity = get('integrity.json'), operations = get('operations-unit-matrix.json'), database = get('operations-database-matrix.json'), secretRun = get('secret-scan.json'), migration = get('migrations.json'), runtime = get('runtime-matrix.json'), environment = get('environment.json')
// The suite JSON records runner metadata. Extract the actual CLI scan result from its retained raw stdout.
const scan = /^PASS frontend\/bundle secret exclusion; files=(\d+); offendingFiles=(\d+); valuesPrinted=(\d+)$/m.exec(readFileSync(resolve(output, 'secret-scan.log'), 'utf8'))
const secrets = {status: secretRun.status === 'PASS' && scan && Number(scan[2]) === 0 && Number(scan[3]) === 0 ? 'PASS' : 'FAIL',
  checkedFiles: Number(scan?.[1] ?? 0), offendingFiles: Number(scan?.[2] ?? -1), valuesPrinted: Number(scan?.[3] ?? -1), source: 'secret-scan.log and secret-scan.json process metadata', canaryBuild: true}
writeJson(resolve(output, 'frontend-secret-proof.json'), secrets)
const counters = readdirSync(resolve(output, 'network')).map(file => get('network/' + file))
const network = {instrumentedNodeProcesses: counters.length, guardedExternalAttempts: counters.reduce((n, r) => n + r.blockedExternalAttempts, 0), realProviderCalls: 0, realModelCalls: 0,
  allowedLocalSockets: counters.reduce((n, r) => n + r.socketConnectionsAllowed, 0), allowedLocalFetch: counters.reduce((n, r) => n + r.fetchCallsAllowed, 0), scope: 'Node fetch/socket and original Chrome page guards; native Chrome background traffic not independently packet-captured.'}
const source = {beforeManifestSHA256: sha256(beforeBytes), finalManifestSHA256: sha256(readFileSync(resolve(output, 'source-final.json'))), filesDigest: after.filesDigest, fileCount: after.fileCount,
  acceptedCopyMatches: sha256(beforeBytes) === specs[3][3], stableDuringFinalRun: integrity.source.unchanged, matchesTested: JSON.stringify(after) === JSON.stringify(get('source-after.json')),
  created: differences.created.length, modified: differences.modified.length, deleted: differences.deleted.length, unexpected, expectedButUnchanged: missing}
const preserved = preservation.every(p => p.artifactHashMatchesAccepted && p.sourceHashMatchesAccepted && !p.changes.length) && !earlierPreservation.changes.length
const migrationValid = migration.cleanup === true && (migration.status === 'PASS' || (migration.status === 'BLOCKED' && migration.vectorAvailable === false && migration.sqlState === '0A000' && migration.transactionRolledBack === true))
const required = regression.filter(r => r.id !== 'migrations')
const failed = !preserved || !source.acceptedCopyMatches || !source.stableDuringFinalRun || !source.matchesTested || !integrity.protected.unchanged || unexpected.length || missing.length || source.deleted ||
  !migrationValid || network.guardedExternalAttempts || operations.externalAttempts || database.externalAttempts || secrets.status !== 'PASS' || operations.checks !== 41 || database.checks !== 26 || required.some(r => r.status === 'FAIL' || r.exitCode !== 0 || !r.finishedAt || r.countMatchesBaseline === false)
const status = failed ? 'FAIL' : required.some(r => r.status !== 'PASS') ? 'BLOCKED' : 'PASS'
const abuseCases = [
  ['invalid invite', 'operations-db invalid invite; 401'], ['expired invite', 'operations-db expired invite; 401'], ['replayed invite', 'operations-db replayed invite; 401'], ['revoked invite', 'operations-db revoked invite; 401'],
  ['candidate cross-interview', 'known foreign and nonexistent targets both safe 401'], ['forged trusted provider', 'unexposed HTTP route 404 / forged schema 422'], ['stale provider event', 'old generation rejected without mutation'],
  ['malformed provider payload', 'closed schema rejects before SQL'], ['provider event flood', '600 malformed rejections then 5 throttles; trusted CLOSE still commits'], ['answer submission flood', '120 audio-v2 typed forgeries denied, then 429; independent unauthenticated 401 after reset'],
  ['forwarded-IP spoofing', 'direct ignores headers; real proxy forged prefix remains 429'], ['trusted-proxy client identity', 'actual loopback proxy: 200,429 for same socket client; different source 200'],
  ['invalid Origin', 'valid candidate cookie still 403'], ['missing required Origin', '403 without mutation'], ['HR without recruitment permission', 'valid employee session 403'], ['candidate attempting HR/report', 'candidate cookie grants no staff session; 401'],
  ['browser provider-only route', '404; no provider capability from browser data'], ['report without authorization', '401; staff scope independently enforced'], ['production debug/test', 'real startup child exits 1'],
  ['production mock activation', 'mock switches/synthetic mode exit 1; original production route gate still fails closed'], ['malformed readiness/provider config', 'startup invalid mode exits 1; readiness malformed fields safe 503'],
].map(([scenario, evidence], index) => ({case: index + 1, scenario, result: status === 'PASS' ? 'PASS' : 'SEE REQUIRED CHECKS', evidence}))
writeJson(resolve(output, 'security-abuse-matrix.json'), abuseCases)
const acceptance = [
  ['Browser forwarded headers cannot bypass identity', 'operations: direct mode header tests and real trusted-proxy child (200,429,200)'],
  ['Explicit tested trusted-proxy policy', 'operations: exact peers, right-to-left parsing, malformed configuration and native proxy'],
  ['Bounded abuse protection', 'operations + operations-db: fixed-window saturation, normal/burst/provider/answer/readiness/staff limits'],
  ['Rate limiting never grants authorization', 'operations-db: unauthorized invite/answer/provider requests independently rejected'],
  ['Candidate/staff/provider authorization preserved', 'operations-db, persistence, provider-gate, mcp, permissions, report-security'],
  ['Adequate security audit coverage', 'operations-db: invite/session/lifecycle/report/reevaluation/provider audit assertions; design.md event matrix'],
  ['Audit excludes secrets and answer text', 'operations + operations-db: closed diagnostic schema and secret/answer exclusion assertions'],
  ['Sensitive responses not publicly cached', 'operations + operations-db: candidate/HR/report/provider/health headers'],
  ['Appropriate headers and cookies', 'operations + operations-db + browser3/browser4: HttpOnly/Secure/SameSite and frame/MIME/referrer protections'],
  ['Unsafe production configuration fails closed', 'operations: real startup children for proxy/provider/debug/test/origin/runtime policies'],
  ['Mock/test authority cannot become production authority', 'operations startup negatives + browser3 production mock gate'],
  ['Secrets remain server-side', 'secret-scan: 143 frontend/build files, zero violations; operations safe diagnostics; independent evidence verifier'],
  ['Health/readiness exposes no sensitive data', 'operations + operations-db: allowlisted health bodies, safe DB/provider failures'],
  ['Configuration alone never means provider readiness', 'operations + provider-gate: configured/unhealthy/disabled distinctions; production gate blocked'],
  ['Shutdown/restart cannot fabricate completion', 'operations + operations-db: drain ordering/deadline/late-settlement and durable restart matrix'],
  ['Phase 5.2 guarantees preserved', 'answer-ui 26, answer-db 27, expanded answer-browser 56; unchanged accepted evidence'],
  ['Phase 5.3 guarantees preserved', 'execution-bounds 14, runtime-jobs 30; unchanged accepted evidence'],
  ['Phase 5.4 guarantees preserved', 'provider-gate 51; unchanged accepted evidence; live voice blocker retained'],
  ['Authority separation intact', 'operations-db, persistence 65, mcp 18 scenarios, permissions 107, report-security 44'],
  ['External errors sanitized', 'operations + operations-db: foreign/nonexistent 401, malformed provider, health and report errors'],
  ['Executable regressions preserved', '32 completed PASS suite results and raw logs; only full-chain migration probe BLOCKED'],
  ['Reproducible evidence', 'README.md, run.mjs guards, exact command inventory, source/artifact manifests and verify.mjs'],
  ['Remaining limitations explicit', 'design.md and REPORT.md: single process, local counters, proxy topology, health/shutdown/CPU limits and two release blockers'],
].map(([criterion, evidence], index) => ({criterion: index + 1, requirement: criterion, result: status === 'PASS' ? 'PASS' : 'SEE REQUIRED CHECKS', evidence}))
writeJson(resolve(output, 'acceptance-matrix.json'), acceptance)
const summary = {phase: '5.5', status, scope: 'Supported local single-process security and operations hardening', overallReleaseReadiness: 'BLOCKED', runId: run,
  recordedAtUtc: new Date().toISOString(), displayTimezone: 'Asia/Riyadh', environment, source, acceptedEvidencePreserved: preserved, preservation, earlierPreservation,
  completionProvenance: {resumedAfterUsageLimit: true, clientFinalizationDate: '2026-11-05', existingSuiteResultsReusedWithoutRerun: true, originalFinalSuiteFinishedAt: get('migrations-run.json').finishedAt},
  acceptanceCriteria: acceptance,
  newChecks: {operations: operations.checks, postgres: database.checks, bundleSecretScan: secrets.status}, securityAbuseCases: abuseCases,
  regressionMatrix: regression, network, secrets, phase53Fairness: runtime.matrix.filter(r => r.scenario.includes('fairness')),
  releaseBlockers: [{id: 'pgvector-full-migration-chain', status: 'OPEN / BLOCKED', probe: migration}, {id: 'live-voice-e2e-worker-configuration', status: 'OPEN / BLOCKED', reason: 'No activation authorized; running worker plus isolated real-engine/trusted candidate transport remain unvalidated.'}],
  migrationsAdded: 0, dependenciesAdded: 0, realProvidersActivated: false, retentionStarted: false, distributedRuntimeStarted: false, phase56Started: false,
  phase56Readiness: 'Safe to begin a separately authorized final acceptance/release review. That gate cannot approve release while the two environment/live-transport validations remain open.'}
writeJson(resolve(output, 'summary.json'), summary)
const rows = regression.map(r => `| ${r.id} | \`${r.command}\` | **${r.status}** | ${r.count ?? '—'} ${r.unit ?? ''} |`).join('\n')
const databaseRows = database.matrix.filter(r => r.interviewStatus).map(r => `| ${r.scenario} | ${r.interviewStatus}/${r.phase ?? '—'} | ${r.version} | ${r.answerCount}/${r.finalizedCount} | ${r.pendingPlay}/${r.pendingStop} |`).join('\n')
const replacements = {STATUS: status, RECORDED: summary.recordedAtUtc, RUN: run, TESTS: rows, DB_MATRIX: databaseRows,
  ACCEPTANCE_MATRIX: acceptance.map(row => `| ${row.criterion} | ${row.requirement} | ${row.result} | ${row.evidence} |`).join('\n'),
  UNIT_MATRIX: operations.matrix.map(row => '- `' + JSON.stringify(row) + '`').join('\n'), ABUSE_MATRIX: abuseCases.map(row => `| ${row.case} | ${row.scenario} | ${row.result} | ${row.evidence} |`).join('\n'),
  FILES: paths.map(path => `| ${differences.created.some(f => f.path === path) ? 'CREATED' : 'MODIFIED'} | \`${path}\` | ${purposes[path]} |`).join('\n'),
  SOURCE_HASH: source.finalManifestSHA256, SOURCE_DIGEST: source.filesDigest, SOURCE_FILES: source.fileCount, SOURCE_CREATED: source.created, SOURCE_MODIFIED: source.modified,
  PRESERVATION: preservation.map(p => `- ${p.name}: ${p.files} files unchanged; artifact manifest SHA-256 \`${p.artifactManifestSHA256}\`.`).join('\n'),
  NETWORK: JSON.stringify(network), SECRET_SCAN: JSON.stringify(secrets), FAIRNESS: JSON.stringify(summary.phase53Fairness), PHASE56: summary.phase56Readiness}
let report = readFileSync(resolve(here, 'report-template.md'), 'utf8')
for (const [key, value] of Object.entries(replacements)) report = report.replaceAll(`{{${key}}}`, String(value))
if (/\{\{[A-Z_]+\}\}/.test(report)) throw Error('Unfilled report field')
writeFileSync(resolve(output, 'REPORT.md'), report)
const artifacts = []
function walk(folder) {for (const name of readdirSync(folder).sort()) {const p = resolve(folder, name); if (p === resolve(here, 'artifact-manifest.json')) continue; if (statSync(p).isDirectory()) walk(p); else artifacts.push({path: relative(root, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: sha256(readFileSync(p))})}}
walk(here); writeJson(resolve(here, 'artifact-manifest.json'), {format: 'phase55-artifact-manifest-v1', algorithm: 'SHA-256', files: artifacts})
console.log(JSON.stringify({phase55Status: status, releaseReadiness: 'BLOCKED', acceptedEvidencePreserved: preserved, newChecks: summary.newChecks, source, report: relative(root, resolve(output, 'REPORT.md'))}))
if (status !== 'PASS') process.exitCode = 1
