import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { changes, here, inspect, read, walk } from './state.mjs'
import { root, sha256 } from './manifest.mjs'

const run = process.argv[2], state = inspect(run), output = resolve(here, 'runs', run), artifactPath = resolve(here, 'artifact-manifest.json'), bytes = readFileSync(artifactPath), artifact = JSON.parse(bytes)
const mismatches = changes(artifact.files), listed = new Set(artifact.files.map(f => f.path)), unlisted = walk(here).filter(p => p !== artifactPath && !listed.has(relative(root, p).replaceAll('\\', '/')))
const failures = [...state.failures], summary = read(resolve(output, 'summary.json'))
if (mismatches.length || unlisted.length) failures.push('NEW_EVIDENCE_INTEGRITY')
if (summary.status !== state.status || summary.overallReleaseReadiness !== 'BLOCKED' || summary.realProviderCallsMade !== false || summary.candidateTransportImplemented !== false || summary.llmOrchestrationImplemented !== false || summary.evaluationIntegrationImplemented !== false || summary.releaseBlockers.length !== 2 || !summary.releaseBlockers.every(b => b.status === 'OPEN / BLOCKED')) failures.push('SUMMARY_SCOPE')
if (sha256(readFileSync(resolve(output, 'source-final.json'))) !== state.source.finalManifestSHA256) failures.push('FINAL_SOURCE_MANIFEST')
console.log(JSON.stringify({status: failures.length ? 'FAIL' : state.status, readOnly: true, speechContractChecks: state.contract.checks, syntheticSdkRequests: state.contract.syntheticSdkRequests,
  verifiedPassSuites: state.completedPassSuites, browserRetries: state.regression.filter(r => r.originalAttempt).map(r => ({id: r.id, original: r.originalAttempt.status, verified: r.status, checks: r.count})),
  sourceManifestSHA256: state.source.finalManifestSHA256, applicationFiles: state.source.fileCount, sourceCreated: state.source.created.length, sourceModified: state.source.modified.length,
  acceptedEvidence: state.preservation.map(p => ({phase: p.phase, files: p.files, mismatches: p.mismatches.length, unlisted: p.unlisted})), earlierEvidence: state.earlierEvidence,
  newArtifacts: {files: artifact.files.length, mismatches: mismatches.length, unlisted: unlisted.length, manifestSHA256: sha256(bytes)},
  postBuildSecrets: state.postBuildSecretVerification.result, logPrivacy: state.logPrivacy, network: state.network, cleanup: state.cleanup.status, overallReleaseReadiness: 'BLOCKED', failures}, null, 2))
if (failures.length || state.status !== 'PASS') process.exitCode = 1
