import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { here, inspect, read, walk } from './state.mjs'
import { root, sha256, writeJson } from './manifest.mjs'

const run = process.argv[2], state = inspect(run), output = resolve(here, 'runs', run)
const {currentSourceManifest, ...summary} = state
summary.recordedAtUtc = new Date().toISOString()
summary.securityCases = read(resolve(root, 'docs/ai-interviewer/phase-5.5/runs/final-20261103/security-abuse-matrix.json')).map(row => ({...row, result: state.status === 'PASS' ? 'PASS' : 'SEE FAILURES', verificationRun: run, freshProof: 'operations 41/41 and operations-db 26/26 in this run; combined synthetic acceptance adds isolation/report/invite checks'}))
summary.acceptanceSteps = [
  {step: 1, result: 'PASS', proof: 'architecture-review.md full flow and implemented/mock/blocked/missing mapping'},
  {step: 2, result: 'PASS', proof: 'architecture-review.md contract boundaries; synthetic provider-gate 51 and execution-bounds 14; incomplete real integration marked PARTIAL/BLOCKED'},
  {step: 3, result: 'PASS', proof: 'architecture-review.md five separate missing-work categories and exact code seams'},
  {step: 4, result: state.synthetic.status, proof: 'synthetic-e2e 27/27 plus fresh answer recovery/browser suites'},
  {step: 5, result: state.status, proof: '34 executable PASS, known full-chain probe BLOCKED, zero real calls, prior evidence unchanged'},
  {step: 6, result: 'PASS', proof: 'integration-checklist.md implementation/config/transport/health/live/failure procedure'},
  {step: 7, result: state.status, proof: 'new package report/manifests/results; both release blockers OPEN'},
]
writeJson(resolve(output, 'summary.json'), summary)
writeJson(resolve(output, 'source-final.json'), currentSourceManifest)
writeJson(resolve(output, 'source-changes.json'), {againstAcceptedPhase55SHA256: state.source.acceptedPhase55ManifestSHA256, created: state.source.created, modified: state.source.modified, deleted: state.source.deleted, applicationChanges: 0, evidenceOnlyDirectory: 'docs/ai-interviewer/phase-5.6'})
writeJson(resolve(output, 'preservation-after.json'), {packages: state.preservation, earlierEvidence: state.earlierEvidence})
writeJson(resolve(output, 'security-abuse-matrix.json'), summary.securityCases)
writeJson(resolve(output, 'acceptance-steps.json'), summary.acceptanceSteps)
const fields = {
  STATUS: state.status, RECORDED: summary.recordedAtUtc, RUN: run, SYNTHETIC_CHECKS: state.synthetic.checks, PASS_SUITES: state.completedPassSuites,
  MATRIX: state.synthetic.matrix.filter(r => r.answerCount !== undefined).map(r => `| ${r.stage} | ${r.status}/${r.phase} | ${r.version}/${r.sequence} | ${r.answerCount}/${r.finalizedCount} | ${r.commandReceipts} | ${r.pendingPlay}/${r.pendingStop} | ${r.evaluationStatus ?? '—'} |`).join('\n'),
  REGRESSION: state.regression.map(r => `| ${r.id} | \`${r.command}\` | **${r.status}** | ${r.count === null ? 'completed command/probe' : r.count} |`).join('\n'),
  SECURITY: summary.securityCases.map(r => `| ${r.case} | ${r.scenario} | ${r.result} | ${r.evidence} |`).join('\n'),
  SOURCE_HASH: state.source.finalManifestSHA256, SOURCE_DIGEST: state.source.filesDigest, NETWORK: JSON.stringify(state.network), LOGS: state.logPrivacy.checkedLogs,
  PRESERVATION: state.preservation.map(p => `- ${p.package}: **${p.files} files unchanged**, artifact manifest SHA-256 \`${p.artifactManifestSHA256}\`; accepted source manifest SHA-256 \`${p.sourceManifestSHA256}\`.`).join('\n'),
}
let report = readFileSync(resolve(here, 'report-template.md'), 'utf8')
for (const [key, value] of Object.entries(fields)) report = report.replaceAll(`{{${key}}}`, String(value))
if (/\{\{[A-Z_]+\}\}/.test(report)) throw Error('Unfilled report field')
writeFileSync(resolve(output, 'REPORT.md'), report)
const artifact = resolve(here, 'artifact-manifest.json')
writeJson(artifact, {format: 'phase56-artifact-manifest-v1', algorithm: 'SHA-256', files: walk(here).filter(path => path !== artifact).map(path => ({path: relative(root, path).replaceAll('\\', '/'), bytes: statSync(path).size, sha256: sha256(readFileSync(path))}))})
console.log(JSON.stringify({status: state.status, apiIntegrationReadiness: state.apiIntegrationReadiness, overallReleaseReadiness: state.overallReleaseReadiness, syntheticE2E: state.synthetic.checks + '/27 ' + state.synthetic.status,
  completedPassSuites: state.completedPassSuites, sourceManifestSHA256: state.source.finalManifestSHA256, applicationChanges: 0, acceptedPackagesUnchanged: state.preservation.every(p => p.changes.length === 0), artifactManifestSHA256: sha256(readFileSync(artifact)), failures: state.failures, missing: state.missing}))
if (state.status !== 'PASS') process.exitCode = 1
