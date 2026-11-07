import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { here, inspect, read, walk, fileMismatches } from './state.mjs'
import { root, sha256 } from './manifest.mjs'

const run = process.argv[2], state = inspect(run), output = resolve(here, 'runs', run)
const path = resolve(here, 'artifact-manifest.json'), bytes = readFileSync(path), artifact = JSON.parse(bytes)
const changes = fileMismatches(artifact.files), listed = new Set(artifact.files.map(f => f.path))
const unlisted = walk(here).filter(p => p !== path && !listed.has(relative(root, p).replaceAll('\\', '/')))
const failures = [...state.failures]
if (changes.length || unlisted.length) failures.push('NEW_EVIDENCE_HASH_OR_INVENTORY')
const summary = read(resolve(output, 'summary.json'))
if (summary.status !== state.status || summary.apiIntegrationReadiness !== 'PARTIAL' || summary.overallReleaseReadiness !== 'BLOCKED' || summary.acceptedPhase51Status !== 'BLOCKED' || summary.realProvidersActivated !== false || summary.applicationChanges !== 0 || summary.releaseBlockers.length !== 2 || !summary.releaseBlockers.every(r => r.status === 'OPEN / BLOCKED')) failures.push('SUMMARY_SCOPE_OR_STATUS')
if (summary.securityCases.length !== 21 || !summary.securityCases.every(r => r.result === 'PASS') || summary.acceptanceSteps.length !== 7 || !summary.acceptanceSteps.every(r => r.result === 'PASS')) failures.push('SECURITY_OR_ACCEPTANCE_MATRIX')
if (sha256(readFileSync(resolve(output, 'source-final.json'))) !== state.source.finalManifestSHA256) failures.push('FINAL_SOURCE_MANIFEST')
if (/\{\{[A-Z_]+\}\}/.test(readFileSync(resolve(output, 'REPORT.md'), 'utf8'))) failures.push('UNFILLED_REPORT')
console.log(JSON.stringify({status: failures.length || state.missing.length ? 'FAIL' : state.status, readOnly: true,
  phase56Acceptance: state.status, apiIntegrationReadiness: state.apiIntegrationReadiness, liveIntegrationActivation: state.liveIntegrationActivation, overallReleaseReadiness: state.overallReleaseReadiness,
  syntheticE2E: `${state.synthetic.checks}/27 ${state.synthetic.status}`, completedPassSuites: state.completedPassSuites, blockedMigrationProbes: 1,
  preservation: state.preservation.map(p => ({package: p.package, files: p.files, mismatches: p.changes.length})), earlierEvidence: state.earlierEvidence,
  sourceManifestSHA256: state.source.finalManifestSHA256, applicationChanges: 0, newEvidence: {files: artifact.files.length, mismatches: changes.length, unlisted: unlisted.length, manifestSHA256: sha256(bytes)},
  logPrivacy: state.logPrivacy, secrets: state.secrets, network: state.network, cleanup: state.cleanup.status,
  realIntegrationsImplemented: 0, failures, missing: state.missing}, null, 2))
if (failures.length || state.status !== 'PASS') process.exitCode = 1
