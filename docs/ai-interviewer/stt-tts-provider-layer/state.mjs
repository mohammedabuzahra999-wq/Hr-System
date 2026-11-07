import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packages as priorPackages } from '../phase-5.6/state.mjs'
import { manifest, root, sha256 } from './manifest.mjs'

export const here = dirname(fileURLToPath(import.meta.url)), read = p => JSON.parse(readFileSync(p, 'utf8'))
export const acceptedSource = 'e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0'
export const expectedChanges = {
  'services/hr-api/src/aiInterviewer/speechContracts.ts': 'Independent typed STT/TTS result/error/readiness contracts and hard limits.',
  'services/hr-api/src/aiInterviewer/speechConfiguration.ts': 'Explicit server-only provider/model/voice/credential configuration; fail-closed parsing.',
  'services/hr-api/src/aiInterviewer/speechProviders.ts': 'OpenAI SDK speech adapters, pinned destination, bounded bodies/time/capacity, safe errors, cancellation and PCM conversion.',
  'services/hr-api/src/aiInterviewer/speechRuntime.ts': 'One server-owned pair registered without I/O; no transport authority.',
  'services/hr-api/src/aiInterviewer/speechProviders.check.ts': '58 offline provider/configuration/SDK/protocol/bounds/security tests.',
  'services/hr-api/src/env.ts': 'Validate new independent speech configuration at startup without printing values.',
  'services/hr-api/src/index.ts': 'Register speech providers at server startup and close/abort them during shutdown.',
  'services/hr-api/package.json': 'Add speech contract test command; no dependency changes.',
}
const packages = [...priorPackages, ['phase-5.6', 'b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c', 'runs/final-20261105/source-final.json', acceptedSource]]
export function walk(dir) {return readdirSync(dir).sort().flatMap(name => {const path = resolve(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]})}
export function changes(files) {return files.filter(f => {const p = resolve(root, f.path); return (!p.startsWith(root + '/') && !p.startsWith(root + '\\')) || !existsSync(p) || sha256(readFileSync(p)) !== f.sha256 || (f.bytes !== undefined && f.bytes !== statSync(p).size)}).map(f => f.path)}
export function inspect(run) {
  if (!run || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error('Invalid run')
  const output = resolve(here, 'runs', run), get = name => read(resolve(output, name)), failures = []
  const require = (condition, name) => {if (!condition) failures.push(name)}
  const preservation = packages.map(([name, expected, sourceFile, expectedSource]) => {
    const folder = resolve(root, 'docs/ai-interviewer', name), bytes = readFileSync(resolve(folder, 'artifact-manifest.json')), value = JSON.parse(bytes), mismatches = changes(value.files)
    const listed = new Set(value.files.map(f => f.path)), unlisted = walk(folder).filter(p => p !== resolve(folder, 'artifact-manifest.json') && !listed.has(relative(root, p).replaceAll('\\', '/')))
    require(sha256(bytes) === expected && sha256(readFileSync(resolve(folder, sourceFile))) === expectedSource && !mismatches.length && !unlisted.length, name + '_EVIDENCE_CHANGED')
    return {phase: name, files: value.files.length, mismatches, unlisted: unlisted.length, artifactManifestSHA256: sha256(bytes), sourceManifestSHA256: expectedSource}
  })
  const after = manifest(), before = get('source-before.json'), old = read(resolve(root, 'docs/ai-interviewer/phase-5.6/runs/final-20261105/source-final.json'))
  const prior = new Map(old.files.map(f => [f.path, f])), current = new Map(after.files.map(f => [f.path, f]))
  const diff = {created: after.files.filter(f => !prior.has(f.path)), modified: after.files.filter(f => prior.has(f.path) && prior.get(f.path).sha256 !== f.sha256).map(f => ({...f, beforeSHA256: prior.get(f.path).sha256})), deleted: old.files.filter(f => !current.has(f.path))}
  const paths = [...diff.created, ...diff.modified, ...diff.deleted].map(f => f.path)
  require(JSON.stringify(before) === JSON.stringify(after) && get('integrity.json').source.unchanged, 'TEST_SOURCE_CHANGED')
  require(diff.created.length === 5 && diff.modified.length === 3 && !diff.deleted.length && paths.length === Object.keys(expectedChanges).length && paths.every(p => p in expectedChanges), 'UNEXPECTED_SOURCE_SCOPE')
  const protectedBefore = get('protected-before.json'), protectedChanges = changes(protectedBefore.files)
  require(protectedBefore.fileCount === 608 && !protectedChanges.length && get('integrity.json').protected.unchanged, 'EARLIER_EVIDENCE_CHANGED')
  const expectedCounts = {'speech-contract': 58, 'synthetic-e2e': 27, 'secret-canary': 1, operations: 41, 'operations-db': 26, 'provider-gate': 51, 'execution-bounds': 14, 'runtime-jobs': 30, 'answer-ui': 26, 'answer-db': 27, engine: 37, persistence: 65, report: 76, ui: 24, mcp: 18, permissions: 107, gate: 194, plans: 95, 'report-security': 44, voice: 17, 'local-voice-api': 3, 'local-voice-audio': 4, 'local-voice-turn': 8, 'local-voice-queue': 6, scorecard: 27, 'structured-provider': 4, 'secret-scan': 1, browser3: 44, browser4: 58, 'answer-browser': 56}
  const inventory = get('inventory.json'); require(inventory.length === 36, 'SUITE_INVENTORY')
  const browserRecheck = resolve(here, 'runs/browser-recheck-20261105')
  const regression = inventory.map(item => {
    const original = get(item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')
    const selectedOutput = item.id === 'browser3' && original.status === 'FAIL' ? browserRecheck : output
    const result = read(resolve(selectedOutput, item.id === 'migrations' ? 'migrations-run.json' : item.id + '.json')), log = readFileSync(resolve(selectedOutput, item.id + '.log'), 'utf8')
    if (selectedOutput !== output) require(JSON.stringify(read(resolve(selectedOutput, 'source-before.json'))) === JSON.stringify(before), 'BROWSER_RECHECK_SOURCE')
    require(result.exitCode === 0 && Number.isFinite(Date.parse(result.finishedAt)) && Date.parse(result.finishedAt) >= Date.parse(result.startedAt) && result.blockedExternalAttempts === 0 && result.status === (item.id === 'migrations' ? 'BLOCKED' : 'PASS'), item.id + '_RESULT')
    let count = expectedCounts[item.id] === undefined ? null : result.passLines
    const summaryPatterns = {mcp: /PASS: (\d+) MCP authorization lifecycle scenarios/, plans: /PASS: (\d+) shared-plan/, 'report-security': /PASS: (\d+) report authorization\/scope checks/}
    if (summaryPatterns[item.id]) count = Number(summaryPatterns[item.id].exec(log)?.[1])
    if (['browser3', 'browser4', 'answer-browser'].includes(item.id)) {
      const b = read(resolve(selectedOutput, `browser/${item.id}/${item.id === 'browser4' ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3'}/browser-results.json`))
      count = b.passed; require(b.status === 'PASS' && b.failed === 0 && b.checks.length === expectedCounts[item.id] && b.checks.every(c => c.result === 'PASS'), item.id + '_RAW_BROWSER')
    }
    require(expectedCounts[item.id] === undefined || count === expectedCounts[item.id], item.id + '_COUNT')
    return {...item, ...result, count, resultDirectory: relative(here, selectedOutput).replaceAll('\\', '/'), ...(selectedOutput === output ? {} : {originalAttempt: original, retryNote: 'Initial browser attempt stopped at warning/grace speaking observation (20/21). Original failure retained; unchanged isolated recheck used. Timing/version cause remains an inference, not a proven root cause.'})}
  })
  const contract = get('speech-contract-matrix.json'), synthetic = get('synthetic-e2e-matrix.json')
  require(contract.status === 'PASS' && contract.checks === 58 && contract.syntheticSdkRequests === 31 && contract.externalAttempts === 0 && contract.realProviderCalls === 0, 'SPEECH_CONTRACT')
  require(synthetic.status === 'PASS' && synthetic.checks === 27 && synthetic.cleanup, 'EXISTING_SYNTHETIC_ACCEPTANCE')
  // The authoritative run's preliminary scan preceded its new build. Retain it and require the separate completed post-build scan.
  const scanRun = Date.parse(get('secret-canary.json').startedAt) >= Date.parse(get('web-build.json').finishedAt) ? output : resolve(here, 'runs/post-build-verified-20261105')
  const scan = read(resolve(scanRun, 'secret-canary.json')), secrets = read(resolve(scanRun, 'speech-secret-proof.json'))
  require(JSON.stringify(read(resolve(scanRun, 'source-before.json'))) === JSON.stringify(before), 'POST_BUILD_SCAN_SOURCE')
  require(scan.status === 'PASS' && scan.exitCode === 0 && scan.blockedExternalAttempts === 0 && Date.parse(scan.startedAt) >= Date.parse(get('web-build.json').finishedAt)
    && secrets.status === 'PASS' && secrets.checkedFiles === 143 && secrets.offendingFiles === 0 && secrets.valuesPrinted === 0 && secrets.dedicatedSpeechCanaryDetected, 'POST_BUILD_SPEECH_SECRET_SCAN')
  require(/PASS frontend\/bundle secret exclusion; files=143; offendingFiles=0; valuesPrinted=0/.test(readFileSync(resolve(output, 'secret-scan.log'), 'utf8')), 'ORIGINAL_SECRET_SCAN')
  const networkFolders = [...new Set([resolve(output, 'network'), resolve(scanRun, 'network'), resolve(browserRecheck, 'network')])].filter(existsSync)
  const networkRows = networkFolders.flatMap(dir => readdirSync(dir).map(file => read(resolve(dir, file))))
  const network = {instrumentedNodeProcesses: networkRows.length, guardedExternalAttempts: networkRows.reduce((n, r) => n + r.blockedExternalAttempts, 0), realProviderCalls: 0, realModelCalls: 0, localModelsInstalled: 0, ollamaServiceCalls: 0, syntheticSpeechSdkRequests: contract.syntheticSdkRequests,
    scope: 'Node socket/fetch and original browser page guards; native Chrome background traffic not independently packet-captured. Public documentation reads are not inference/provider API calls.'}
  require(network.guardedExternalAttempts === 0, 'EXTERNAL_CALLS')
  const logs = walk(here).filter(p => p.endsWith('.log')), privacy = []
  for (const path of logs) if (/\b[A-Za-z0-9_-]{43}\b|postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])[^\s'"<>]+|phase5[56]-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key|speech-layer-synthetic-bundle-canary-not-a-key/.test(readFileSync(path, 'utf8')) || /(?:password|session_secret|api_key|clientSecret|credential)\s*[:=]\s*['"]?(?!\[redacted\])[^\s,'"}]+/i.test(readFileSync(path, 'utf8'))) privacy.push(relative(root, path))
  require(!privacy.length && !walk(here).some(p => /(?:^|[\\/])fixture\.json$/.test(p)), 'EVIDENCE_PRIVACY')
  const cleanup = get('resource-cleanup.json'), migration = get('migrations.json')
  require(cleanup.status === 'PASS' && cleanup.activeOtherClientSessions === 0 && cleanup.speechlayerDisposableDatabasesRemaining === 0 && cleanup.localTestClusterStopped && cleanup.temporaryRunDirectoriesRemaining === 0, 'RESOURCE_CLEANUP')
  require(migration.status === 'BLOCKED' && migration.vectorAvailable === false && migration.transactionRolledBack && migration.cleanup && migration.sqlState === '0A000', 'MIGRATION_BLOCKER')
  return {status: failures.length ? 'FAIL' : 'PASS', runId: run, scope: 'STT/TTS provider layer only; offline contract-tested', overallReleaseReadiness: 'BLOCKED', apiIntegrationReadiness: 'PARTIAL',
    source: {beforeAcceptedSHA256: acceptedSource, finalManifestSHA256: sha256(Buffer.from(JSON.stringify(after, null, 2) + '\n')), fileCount: after.fileCount, filesDigest: after.filesDigest, stableDuringTests: JSON.stringify(before) === JSON.stringify(after), ...diff},
    preservation, earlierEvidence: {files: 608, changes: protectedChanges}, contract, synthetic, regression, completedPassSuites: regression.filter(r => r.status === 'PASS').length,
    postBuildSecretVerification: {run: relative(here, scanRun).replaceAll('\\', '/'), process: scan, result: secrets}, logPrivacy: {filesChecked: logs.length, offendingFiles: privacy.length, paths: privacy},
    network, cleanup, migration, releaseBlockers: [{id: 'pgvector-full-migration-chain', status: 'OPEN / BLOCKED'}, {id: 'live-voice-worker-trusted-candidate-transport', status: 'OPEN / BLOCKED'}],
    candidateTransportImplemented: false, llmOrchestrationImplemented: false, evaluationIntegrationImplemented: false, realProviderCallsMade: false, dependenciesAdded: 0, migrationsAdded: 0,
    failures, currentSourceManifest: after}
}
