import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256 } from './manifest.mjs'

// Read-only independent final verification; never regenerates accepted evidence.
const here = dirname(fileURLToPath(import.meta.url)), run = process.argv[2]
if (!run || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error('Usage: node verify.mjs RUN_ID')
const output = resolve(here, 'runs', run), read = path => JSON.parse(readFileSync(path, 'utf8')), get = name => read(resolve(output, name))
const failures = [], require = (condition, code) => {if (!condition) failures.push(code)}
const packages = [
  ['phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67', 'runs/20261103T074721Z/source-before.json', '06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163'],
  ['phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342', 'runs/final-20261103-verified-2/source-final.json', 'f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f'],
  ['phase-5.3', '8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900', 'runs/final-20261103/source-final.json', 'b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8'],
  ['phase-5.4', 'c43408d736327197d296ff3b17cc97a0f15539a3c0b9f7e3ce0e2bca530c62e3', 'runs/final-20261103/source-final.json', '9c7c675970cbc16c1b5d42715ce2183b7c01b1f50cd50ea39f15dfb61fa3923c'],
]
function verifyFiles(files, label) {
  let mismatches = 0
  for (const file of files) {
    const path = resolve(root, file.path)
    if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) {mismatches++; continue}
    if (!existsSync(path) || sha256(readFileSync(path)) !== file.sha256 || (file.bytes !== undefined && statSync(path).size !== file.bytes)) mismatches++
  }
  require(mismatches === 0, label + '_ARTIFACT_MISMATCH')
  return {files: files.length, mismatches}
}
const preservation = packages.map(([name, expectedManifest, sourceFile, expectedSource]) => {
  const folder = resolve(root, 'docs/ai-interviewer', name), bytes = readFileSync(resolve(folder, 'artifact-manifest.json'))
  require(sha256(bytes) === expectedManifest, name + '_MANIFEST_CHANGED')
  require(sha256(readFileSync(resolve(folder, sourceFile))) === expectedSource, name + '_SOURCE_MANIFEST_CHANGED')
  return {package: name, ...verifyFiles(JSON.parse(bytes).files, name), manifestSHA256: sha256(bytes)}
})
const ownBytes = readFileSync(resolve(here, 'artifact-manifest.json')), own = JSON.parse(ownBytes)
const ownVerified = verifyFiles(own.files, 'PHASE55')
function walk(folder) {return readdirSync(folder).sort().flatMap(name => {const path = resolve(folder, name); return statSync(path).isDirectory() ? walk(path) : [path]})}
const ownPaths = new Set(own.files.map(f => f.path))
const unlisted = walk(here).filter(p => p !== resolve(here, 'artifact-manifest.json') && !ownPaths.has(relative(root, p).replaceAll('\\', '/')))
require(unlisted.length === 0, 'PHASE55_UNLISTED_ARTIFACTS')
const earlier = read(resolve(root, 'docs/ai-interviewer/phase-5.1-baseline/runs/20261103T074721Z/protected-before.json'))
const earlierVerified = verifyFiles(earlier.files, 'EARLIER_EVIDENCE')
const summary = get('summary.json'), finalBytes = readFileSync(resolve(output, 'source-final.json'))
require(summary.status === 'PASS' && summary.overallReleaseReadiness === 'BLOCKED', 'STATUS_OR_RELEASE_GATE')
require(summary.acceptedEvidencePreserved === true, 'PRESERVATION_SUMMARY')
require(sha256(finalBytes) === summary.source.finalManifestSHA256, 'SOURCE_MANIFEST_HASH')
require(JSON.stringify(manifest()) === JSON.stringify(JSON.parse(finalBytes)), 'CURRENT_SOURCE_DIFFERS_FROM_TESTED')
require(summary.source.fileCount === 438 && summary.source.created === 10 && summary.source.modified === 14 && summary.source.deleted === 0 && summary.source.unexpected.length === 0 && summary.source.expectedButUnchanged.length === 0, 'SOURCE_SCOPE')
require(get('integrity.json').source.unchanged && get('integrity.json').protected.unchanged, 'TEST_SOURCE_STABILITY')
require(summary.phase56Started === false && summary.realProvidersActivated === false && summary.retentionStarted === false && summary.distributedRuntimeStarted === false, 'UNAUTHORIZED_PHASE_OR_ACTIVATION')
require(summary.releaseBlockers.length === 2 && summary.releaseBlockers.every(b => b.status === 'OPEN / BLOCKED'), 'RELEASE_BLOCKERS_HIDDEN')
const migration = get('migrations.json')
require(migration.status === 'BLOCKED' && migration.vectorAvailable === false && migration.sqlState === '0A000' && migration.transactionRolledBack === true && migration.cleanup === true, 'MIGRATION_BLOCKER_PROOF')
const expectedCounts = {operations: 41, 'operations-db': 26, 'provider-gate': 51, 'execution-bounds': 14, 'runtime-jobs': 30, 'answer-ui': 26, 'answer-db': 27, engine: 37, persistence: 65, report: 76, ui: 24, mcp: 18, permissions: 107, gate: 194, plans: 95, 'report-security': 44, voice: 17, 'local-voice-api': 3, 'local-voice-audio': 4, 'local-voice-turn': 8, 'local-voice-queue': 6, scorecard: 27, 'structured-provider': 4, 'secret-scan': 1, browser3: 44, browser4: 58, 'answer-browser': 56}
const inventory = get('inventory.json')
require(inventory.length === 33 && summary.regressionMatrix.length === 33, 'SUITE_INVENTORY')
for (const item of inventory) {
  const result = get(item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')
  const row = summary.regressionMatrix.find(r => r.id === item.id)
  require(result.exitCode === 0 && Number.isFinite(Date.parse(result.finishedAt)) && Date.parse(result.finishedAt) >= Date.parse(result.startedAt), item.id + '_NOT_COMPLETED')
  require(result.status === (item.id === 'migrations' ? 'BLOCKED' : 'PASS') && result.blockedExternalAttempts === 0 && existsSync(resolve(output, item.id + '.log')), item.id + '_RESULT')
  if (expectedCounts[item.id] !== undefined) require(row?.count === expectedCounts[item.id] && row.countMatchesBaseline === true, item.id + '_COUNT')
}
for (const [id, expected] of [['browser3', 44], ['browser4', 58], ['answer-browser', 56]]) {
  const result = get(`browser/${id}/${id === 'browser4' ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3'}/browser-results.json`)
  require(result.status === 'PASS' && result.passed === expected && result.failed === 0 && result.checks.length === expected && result.checks.every(c => c.result === 'PASS'), id + '_RAW_BROWSER_RESULT')
}
require(get('operations-unit-matrix.json').checks === 41 && get('operations-database-matrix.json').checks === 26, 'NEW_CHECK_COUNTS')
const secret = get('frontend-secret-proof.json'), secretLog = readFileSync(resolve(output, 'secret-scan.log'), 'utf8')
require(secret.status === 'PASS' && secret.checkedFiles === 143 && secret.offendingFiles === 0 && secret.valuesPrinted === 0 && /files=143; offendingFiles=0; valuesPrinted=0/.test(secretLog), 'BUNDLE_SECRET_SCAN')
const networks = readdirSync(resolve(output, 'network')).map(name => get('network/' + name))
require(networks.every(r => r.blockedExternalAttempts === 0) && summary.network.guardedExternalAttempts === 0 && summary.network.realModelCalls === 0 && summary.network.realProviderCalls === 0, 'EXTERNAL_CALLS')
require(get('acceptance-matrix.json').length === 23 && get('acceptance-matrix.json').every(r => r.result === 'PASS'), 'ACCEPTANCE_MATRIX')
require(get('security-abuse-matrix.json').length === 21 && get('security-abuse-matrix.json').every(r => r.result === 'PASS'), 'ABUSE_MATRIX')
const cleanup = get('resource-cleanup.json')
require(cleanup.status === 'PASS' && cleanup.testsRerun === 0 && cleanup.activeOtherClientSessions === 0 && cleanup.phase55DisposableDatabasesRemaining === 0 && cleanup.localTestClusterStopped === true && cleanup.temporaryRunDirectoriesRemaining === 0 && cleanup.testProfilesRemoved.length === 5, 'RESOURCE_CLEANUP')
const logs = walk(here).filter(p => p.endsWith('.log')), privacyOffenders = []
for (const path of logs) {
  const body = readFileSync(path, 'utf8')
  if (/\b[A-Za-z0-9_-]{43}\b|postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])[^\s'"<>]+|phase55-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key/.test(body)) privacyOffenders.push(relative(root, path))
  if (/(?:password|session_secret|api_key|clientSecret|credential)\s*[:=]\s*['"]?(?!\[redacted\])[^\s,'"}]+/i.test(body)) privacyOffenders.push(relative(root, path))
}
require(privacyOffenders.length === 0, 'EVIDENCE_LOG_PRIVACY')
const fixtures = walk(here).filter(p => /(?:^|[\\/])fixture\.json$/.test(p))
require(fixtures.length === 0, 'CREDENTIAL_FIXTURE_RETAINED')
require(!/\{\{[A-Z_]+\}\}/.test(readFileSync(resolve(output, 'REPORT.md'), 'utf8')), 'REPORT_UNFILLED')
console.log(JSON.stringify({status: failures.length ? 'FAIL' : 'PASS', readOnly: true, phase55: summary.status, overallReleaseReadiness: summary.overallReleaseReadiness,
  preservation, earlierEvidence: earlierVerified, phase55Artifacts: {...ownVerified, unlisted: unlisted.length, manifestSHA256: sha256(ownBytes)},
  sourceManifestSHA256: sha256(finalBytes), completedPassSuites: 32, blockedProbes: 1, expandedAnswerBrowser: '56/56 PASS',
  acceptanceCriteria: 23, securityAbuseCases: 21, logPrivacy: {filesChecked: logs.length, offendingFiles: new Set(privacyOffenders).size, paths: [...new Set(privacyOffenders)]},
  realModelCalls: 0, realProviderCalls: 0, guardedExternalAttempts: 0, phase56Started: false, failures}, null, 2))
if (failures.length) process.exitCode = 1
