import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256 } from './manifest.mjs'

export const here = dirname(fileURLToPath(import.meta.url))
export const acceptedSource = 'e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0'
export const packages = [
  ['phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67', 'runs/20261103T074721Z/source-before.json', '06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163'],
  ['phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342', 'runs/final-20261103-verified-2/source-final.json', 'f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f'],
  ['phase-5.3', '8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900', 'runs/final-20261103/source-final.json', 'b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8'],
  ['phase-5.4', 'c43408d736327197d296ff3b17cc97a0f15539a3c0b9f7e3ce0e2bca530c62e3', 'runs/final-20261103/source-final.json', '9c7c675970cbc16c1b5d42715ce2183b7c01b1f50cd50ea39f15dfb61fa3923c'],
  ['phase-5.5', '2d507d2e555e9fb0dc55a63f46c6b43b2d06d7ee25d7b6ec4027ca9e60b0261d', 'runs/final-20261103/source-final.json', acceptedSource],
]
export function walk(dir) {return readdirSync(dir).sort().flatMap(name => {const path = resolve(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]})}
export const read = path => JSON.parse(readFileSync(path, 'utf8'))
export function fileMismatches(files) {
  return files.filter(file => {const path = resolve(root, file.path); return (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) || !existsSync(path) || sha256(readFileSync(path)) !== file.sha256 || (file.bytes !== undefined && statSync(path).size !== file.bytes)}).map(f => f.path)
}
export function inspect(run) {
  if (!run || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error('Invalid isolated run ID')
  const output = resolve(here, 'runs', run), get = name => read(resolve(output, name)), failures = [], missing = []
  const require = (condition, code) => {if (!condition) failures.push(code)}
  const preservation = packages.map(([name, expected, sourceFile, expectedSource]) => {
    const folder = resolve(root, 'docs/ai-interviewer', name), bytes = readFileSync(resolve(folder, 'artifact-manifest.json')), value = JSON.parse(bytes)
    const changes = fileMismatches(value.files), sourceSHA256 = sha256(readFileSync(resolve(folder, sourceFile)))
    const listed = new Set(value.files.map(f => f.path))
    const unlisted = walk(folder).filter(path => path !== resolve(folder, 'artifact-manifest.json') && !listed.has(relative(root, path).replaceAll('\\', '/')))
    require(sha256(bytes) === expected && sourceSHA256 === expectedSource && !changes.length && !unlisted.length, name + '_CHANGED')
    return {package: name, files: value.files.length, changes, unlisted: unlisted.length, artifactManifestSHA256: sha256(bytes), sourceManifestSHA256: sourceSHA256}
  })
  const current = manifest(), currentBytes = Buffer.from(JSON.stringify(current, null, 2) + '\n')
  const sourceBytes = readFileSync(resolve(output, 'source-before.json')), before = JSON.parse(sourceBytes)
  const prior = read(resolve(root, 'docs/ai-interviewer/phase-5.5/runs/final-20261103/source-final.json'))
  const priorByPath = new Map(prior.files.map(f => [f.path, f])), currentByPath = new Map(current.files.map(f => [f.path, f]))
  const sourceChanges = {created: current.files.filter(f => !priorByPath.has(f.path)), modified: current.files.filter(f => priorByPath.has(f.path) && priorByPath.get(f.path).sha256 !== f.sha256), deleted: prior.files.filter(f => !currentByPath.has(f.path))}
  const source = {fileCount: current.fileCount, filesDigest: current.filesDigest, acceptedPhase55ManifestSHA256: acceptedSource, finalManifestSHA256: sha256(currentBytes), unchangedFromAccepted: JSON.stringify(prior) === JSON.stringify(current), stableDuringTests: JSON.stringify(before) === JSON.stringify(current), ...sourceChanges}
  require(sha256(sourceBytes) === acceptedSource && sha256(currentBytes) === acceptedSource && source.unchangedFromAccepted && source.stableDuringTests, 'SOURCE_CHANGED')
  const protectedFiles = get('protected-before.json'), protectedChanges = fileMismatches(protectedFiles.files)
  require(protectedFiles.fileCount === 608 && protectedChanges.length === 0, 'EARLIER_PROTECTED_EVIDENCE_CHANGED')
  const integrity = get('integrity.json')
  require(integrity.source.unchanged && integrity.protected.unchanged, 'FINAL_INTEGRITY')
  const inventory = [...get('inventory.json')]
  for (const id of ['synthetic-e2e', 'secret-canary']) if (!inventory.some(r => r.id === id)) inventory.push(get(id + '-inventory.json'))
  require(inventory.length === 35 && new Set(inventory.map(r => r.id)).size === 35, 'INVENTORY_COUNT')
  const counts = {operations: 41, 'operations-db': 26, 'provider-gate': 51, 'execution-bounds': 14, 'runtime-jobs': 30, 'answer-ui': 26, 'answer-db': 27, engine: 37, persistence: 65, report: 76, ui: 24, mcp: 18, permissions: 107, gate: 194, plans: 95, 'report-security': 44, voice: 17, 'local-voice-api': 3, 'local-voice-audio': 4, 'local-voice-turn': 8, 'local-voice-queue': 6, scorecard: 27, 'structured-provider': 4, 'secret-scan': 1, browser3: 44, browser4: 58, 'answer-browser': 56, 'synthetic-e2e': 27, 'secret-canary': 1}
  const regression = inventory.map(item => {
    const path = resolve(output, item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')
    if (!existsSync(path)) {missing.push(item.id); return {...item, status: 'BLOCKED', count: null}}
    const result = read(path), log = readFileSync(resolve(output, item.id + '.log'), 'utf8')
    require(result.exitCode === 0 && !!result.finishedAt && Date.parse(result.finishedAt) >= Date.parse(result.startedAt) && result.blockedExternalAttempts === 0, item.id + '_COMPLETION')
    require(result.status === (item.id === 'migrations' ? 'BLOCKED' : 'PASS'), item.id + '_STATUS')
    let count = counts[item.id] === undefined ? null : result.passLines
    for (const [id, regex] of [['mcp', /PASS: (\d+) MCP authorization lifecycle scenarios/], ['plans', /PASS: (\d+) shared-plan/], ['report-security', /PASS: (\d+) report authorization\/scope checks/]]) if (item.id === id) count = Number(regex.exec(log)?.[1])
    if (['browser3', 'browser4', 'answer-browser'].includes(item.id)) {
      const browser = get(`browser/${item.id}/${item.id === 'browser4' ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3'}/browser-results.json`)
      count = browser.passed
      require(browser.status === 'PASS' && browser.failed === 0 && browser.checks.length === counts[item.id] && browser.checks.every(c => c.result === 'PASS'), item.id + '_BROWSER_ASSERTIONS')
    }
    require(counts[item.id] === undefined || count === counts[item.id], item.id + '_COUNT')
    return {...item, ...result, count}
  })
  const synthetic = get('synthetic-e2e-matrix.json'), canary = get('phase56-secret-proof.json'), migration = get('migrations.json')
  require(synthetic.status === 'PASS' && synthetic.checks === 27 && synthetic.cleanup && synthetic.realModelCalls === 0 && synthetic.realProviderCalls === 0, 'SYNTHETIC_ACCEPTANCE')
  require(synthetic.matrix.filter(r => r.answerCount !== undefined).every(r => r.answerCount === r.finalizedCount), 'SYNTHETIC_DURABILITY')
  require(synthetic.matrix.some(r => r.stage === 'final durable state' && r.answerCount === 4 && r.evaluationStatus === 'COMPLETED'), 'SYNTHETIC_COMPLETION')
  require(canary.status === 'PASS' && canary.checkedFiles === 143 && canary.offendingFiles === 0 && canary.valuesPrinted === 0 && canary.phase56CanaryDetectionVerified, 'SECRET_CANARY_SCAN')
  require(/PASS frontend\/bundle secret exclusion; files=143; offendingFiles=0; valuesPrinted=0/.test(readFileSync(resolve(output, 'secret-scan.log'), 'utf8')), 'ORIGINAL_SECRET_SCAN')
  require(migration.status === 'BLOCKED' && migration.vectorAvailable === false && migration.transactionRolledBack && migration.cleanup && migration.sqlState === '0A000', 'MIGRATION_BLOCKER_PROOF')
  require(get('operations-unit-matrix.json').checks === 41 && get('operations-database-matrix.json').checks === 26, 'OPERATIONS_MATRICES')
  const networkRows = readdirSync(resolve(output, 'network')).map(file => get('network/' + file))
  const network = {instrumentedNodeProcesses: networkRows.length, guardedExternalAttempts: networkRows.reduce((sum, r) => sum + r.blockedExternalAttempts, 0), realProviderCalls: 0, realModelCalls: 0, localModelInstallations: 0, ollamaServiceCalls: 0,
    allowedLocalSockets: networkRows.reduce((sum, r) => sum + r.socketConnectionsAllowed, 0), allowedLocalFetch: networkRows.reduce((sum, r) => sum + r.fetchCallsAllowed, 0), scope: 'Node socket/fetch and original Chrome page guards. Native Chrome background traffic is not independently packet-captured.'}
  require(network.guardedExternalAttempts === 0, 'EXTERNAL_ATTEMPTS')
  const logs = walk(here).filter(p => p.endsWith('.log')), privacy = []
  for (const path of logs) {
    const body = readFileSync(path, 'utf8')
    if (/\b[A-Za-z0-9_-]{43}\b|postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])[^\s'"<>]+|phase5[56]-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key/.test(body) || /(?:password|session_secret|api_key|clientSecret|credential)\s*[:=]\s*['"]?(?!\[redacted\])[^\s,'"}]+/i.test(body)) privacy.push(relative(root, path))
  }
  require(!privacy.length && !walk(here).some(p => /(?:^|[\\/])fixture\.json$/.test(p)), 'EVIDENCE_PRIVACY')
  const cleanup = get('resource-cleanup.json')
  require(cleanup.status === 'PASS' && cleanup.activeOtherClientSessions === 0 && cleanup.phase56DisposableDatabasesRemaining === 0 && cleanup.localTestClusterStopped && cleanup.temporaryRunDirectoriesRemaining === 0, 'RESOURCE_CLEANUP')
  for (const name of ['before-state.md', 'architecture-review.md', 'integration-checklist.md', 'README.md']) require(existsSync(resolve(here, name)), name + '_MISSING')
  return {phase: '5.6', status: failures.length ? 'FAIL' : missing.length ? 'BLOCKED' : 'PASS', scope: 'Review and verification of supported local single-process synthetic scope', runId: run,
    overallReleaseReadiness: 'BLOCKED', apiIntegrationReadiness: 'PARTIAL', liveIntegrationActivation: 'BLOCKED', source, preservation,
    earlierEvidence: {files: protectedFiles.fileCount, changes: protectedChanges}, regression, completedPassSuites: regression.filter(r => r.status === 'PASS').length,
    synthetic, secrets: canary, network, logPrivacy: {checkedLogs: logs.length, offendingFiles: privacy.length, paths: privacy}, cleanup,
    environment: get('environment.json'), migration, releaseBlockers: [{id: 'pgvector-full-migration-chain', status: 'OPEN / BLOCKED'}, {id: 'live-voice-worker-trusted-candidate-transport', status: 'OPEN / BLOCKED'}],
    acceptedPhase51Status: 'BLOCKED', applicationChanges: 0, applicationFeaturesImplemented: 0, realIntegrationsImplemented: 0, realProvidersActivated: false, retentionStarted: false, distributedRuntimeStarted: false,
    failures, missing, currentSourceManifest: current}
}
