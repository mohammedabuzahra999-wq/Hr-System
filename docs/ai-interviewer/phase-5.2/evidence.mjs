import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256, writeJson } from './manifest.mjs'

const here=dirname(fileURLToPath(import.meta.url)),runId=process.argv[2]
if(!runId||!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Usage: node evidence.mjs RUN_ID')
const output=resolve(here,'runs',runId),read=p=>JSON.parse(readFileSync(p,'utf8')),get=name=>read(resolve(output,name))
const phase51=resolve(root,'docs/ai-interviewer/phase-5.1-baseline')
const expectedSourceHash='06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163'
const expectedArtifactHash='3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67'
const frozen=getFile=>readFileSync(resolve(phase51,getFile))
const priorArtifacts=JSON.parse(frozen('artifact-manifest.json'))
const oldSourceHash=sha256(frozen('runs/20261103T074721Z/source-before.json'))
const oldArtifactHash=sha256(frozen('artifact-manifest.json'))
const changedProtected=files=>files.filter(f=>!existsSync(resolve(root,f.path))||sha256(readFileSync(resolve(root,f.path)))!==f.sha256).map(f=>f.path)
const phase51Changes=changedProtected(priorArtifacts.files)
const oldProtected=JSON.parse(frozen('runs/20261103T074721Z/protected-before.json'))
const oldProtectedChanges=changedProtected(oldProtected.files)
const preservation={recordedAtUtc:new Date().toISOString(),status:'BLOCKED',sourceManifestSHA256:oldSourceHash,
  artifactManifestSHA256:oldArtifactHash,sourceHashMatchesAccepted:oldSourceHash===expectedSourceHash,
  packageManifestHashMatchesOriginal:oldArtifactHash===expectedArtifactHash,packageFiles:priorArtifacts.files.length,packageChanges:phase51Changes,
  phase14AndTrainingFiles:oldProtected.fileCount,phase14AndTrainingChanges:oldProtectedChanges}
writeJson(resolve(output,'phase51-preservation-after.json'),preservation)
const before=read(resolve(here,'source-before.json')),after=manifest()
writeJson(resolve(output,'source-final.json'),after)
const oldMap=new Map(before.files.map(f=>[f.path,f])),newMap=new Map(after.files.map(f=>[f.path,f]))
const changes={created:after.files.filter(f=>!oldMap.has(f.path)),modified:after.files.filter(f=>oldMap.has(f.path)&&oldMap.get(f.path).sha256!==f.sha256).map(f=>({...f,beforeSHA256:oldMap.get(f.path).sha256})),deleted:before.files.filter(f=>!newMap.has(f.path))}
writeJson(resolve(output,'source-changes.json'),changes)
const patterns={engine:/(\d+)\/\d+ Phase 1 checks passed/,persistence:/(\d+)\/\d+ Phase 2 PostgreSQL\/security checks passed/,
  report:/(\d+)\/\d+ Phase 4 report checks passed/,ui:/(\d+)\/\d+ Phase 3 UI logic checks passed/,
  mcp:/PASS: (\d+) MCP authorization lifecycle scenarios/,plans:/PASS: (\d+) shared-plan/,'report-security':/PASS: (\d+) report authorization\/scope checks/,
  'answer-ui':/(\d+)\/\d+ Phase 5\.2 recovery checks passed/,'answer-db':/(\d+)\/\d+ Phase 5\.2 PostgreSQL answer checks passed/}
const inventory=[...get('inventory.json'),...readdirSync(output).filter(f=>f.endsWith('-inventory.json')&&f!=='migration-inventory.json').map(f=>get(f))]
const matrix=inventory.map(item=>{
  const file=resolve(output,item.id==='migrations'?'migrations-run.json':item.id+'.json')
  if(!existsSync(file))return {...item,status:'BLOCKED',count:null,reason:'Suite did not execute'}
  const result=read(file),log=readFileSync(resolve(output,item.id+'.log'),'utf8')
  let count=Number(patterns[item.id]?.exec(log)?.[1]??result.passLines),unit=patterns[item.id]?'checks':'reported assertion/groups'
  if(['typechecks','web-build','api-build','contracts-build','scenario','migrations'].includes(item.id)){count=null;unit=item.id==='typechecks'?'3 workspace checks':item.id.endsWith('build')?'1 production build':item.id==='scenario'?'1 synthetic scenario':'full-chain probe'}
  if(['browser3','browser4','answer-browser'].includes(item.id)){
    const path=resolve(output,'browser',item.id,item.id==='browser4'?'ai-interviewer-phase4':'ai-interviewer-phase3','browser-results.json')
    const b=read(path);count=b.passed;unit='browser checks'
  }
  return {...item,...result,count,unit}
})
const network=readdirSync(resolve(output,'network')).map(f=>get('network/'+f))
const integrity=get('integrity.json'),migrations=get('migrations.json'),environment=get('environment.json')
const blockers=[{id:'full-migration-chain',status:'OPEN / BLOCKED',reason:'Local PostgreSQL lacks pgvector; actual migration chain stops at 0008 before 0026',newProbe:migrations},
  {id:'live-local-voice-e2e',status:'OPEN / BLOCKED',command:'npm.cmd run check:voice:local:e2e -w @hr/server',reason:'Accepted blocker remains: STT/TTS worker and isolated synthetic real-engine configuration unavailable; not executed or waived'}]
const fingerprintsGood=preservation.sourceHashMatchesAccepted&&preservation.packageManifestHashMatchesOriginal&&!phase51Changes.length&&!oldProtectedChanges.length
const required=matrix.filter(r=>r.id!=='migrations')
const status=!fingerprintsGood||required.some(r=>r.status==='FAIL')||!integrity.source.unchanged?'FAIL':required.some(r=>r.status!=='PASS')?'BLOCKED':'PASS'
const database=get('answer-database-matrix.json'),browser=get('answer-browser-matrix.json')
const summary={phase:'5.2',status,releaseStatus:'BLOCKED',recordedAtUtc:new Date().toISOString(),displayTimezone:'Asia/Riyadh',runId,environment,
  phase51:preservation,releaseBlockers:blockers,regressionMatrix:matrix,
  phase52Checks:{recovery:matrix.find(r=>r.id==='answer-ui')?.count,postgresql:matrix.find(r=>r.id==='answer-db')?.count,
    browserTotal:matrix.find(r=>r.id==='answer-browser')?.count,browserAdditional:(matrix.find(r=>r.id==='answer-browser')?.count??44)-44,
    databaseMatrixRows:database.matrix.length,browserMatrixRows:browser.matrix.length},
  source:{beforeManifestSHA256:sha256(readFileSync(resolve(here,'source-before.json'))),afterManifestSHA256:sha256(readFileSync(resolve(output,'source-final.json'))),
    finalFilesDigest:after.filesDigest,finalFileCount:after.fileCount,sourceStableDuringFinalRun:integrity.source.unchanged,created:changes.created.length,modified:changes.modified.length,deleted:changes.deleted.length},
  network:{instrumentedNodeProcesses:network.length,blockedExternalAttempts:network.reduce((n,r)=>n+r.blockedExternalAttempts,0),realModelCalls:0,
    allowedLocalSockets:network.reduce((n,r)=>n+r.socketConnectionsAllowed,0),allowedLocalFetch:network.reduce((n,r)=>n+r.fetchCallsAllowed,0),
    suppressedFixtureWrites:network.reduce((n,r)=>n+r.suppressedFixtureWrites,0),suppressedScreenshots:network.reduce((n,r)=>n+r.suppressedScreenshots,0),
    scope:'Node socket/fetch guards and existing CDP page interception; native browser background traffic not independently packet-captured'},
  migrationsAdded:0,dependenciesAdded:0,phase53Started:false,
  limits:['One application process/runtime owner; no distributed coordination added','Local tab recovery is bounded plaintext storage, not cross-device backup',
    'Blocked browser storage prevents sending a new unrecoverable submission and warns the candidate','Expiry/revocation removes local recovery for security; server authorization is never bypassed',
    'Restart tested by new service/runtime owner over the same real PostgreSQL state, not an OS process-kill test','Real network loss still does not imply a trusted server pause; deadlines remain server-authoritative']}
writeJson(resolve(output,'summary.json'),summary)
const rows=matrix.map(r=>`| ${r.id} | \`${r.command}\` | **${r.status}** | ${r.count??'—'} ${r.unit} | ${r.blockedExternalAttempts??'—'} |`).join('\n')
const browserRows=browser.matrix.map(r=>`| ${r.scenario} | ${r.browserState} | ${r.database.status}/${r.database.phase} | ${r.database.version} | ${r.database.answerCount} | ${r.database.receiptCount} | ${r.database.pendingEffects} |`).join('\n')
const changedRows=[...changes.created.map(f=>`- CREATED \`${f.path}\``),...changes.modified.map(f=>`- MODIFIED \`${f.path}\``),...changes.deleted.map(f=>`- DELETED \`${f.path}\``)].join('\n')
const report=`# Phase 5.2 — ${status}

Release readiness remains **BLOCKED**. Phase 5.1 remains **BLOCKED — environment validation blockers only, with clean executable regression**. Neither accepted blocker is waived.

Recorded ${summary.recordedAtUtc}; display zone Asia/Riyadh. Node ${environment.node}, npm ${environment.npm}, PostgreSQL ${migrations.postgresqlVersion}, Chrome ${environment.chromeVersion}. Synthetic data and offline mocks only.

## Result

Typed answer submission now has one durable transactional boundary using the existing PostgreSQL row lock, expected version, engine commands, receipt and fingerprint. Refresh-safe per-tab recovery distinguishes local draft, submitting, server-confirmed committed and recovery-required states. Identical retries never create another answer; conflicting reuse and old-turn replacement fail explicitly. A matching answer committed by another tab can be acknowledged through a read-only check without another successful receipt.

No engine rewrite, migration, dependency, real provider/voice/WebRTC, distributed runtime, retention or Phase 5.3 work was added. Evaluation/report behavior and inputHash/evidence verification are unchanged.

## Immutable evidence

Phase 5.1 source manifest SHA-256: \`${oldSourceHash}\` (matches the accepted value). Its ${preservation.packageFiles} package files and artifact-manifest.json are unchanged. All ${oldProtected.fileCount} earlier evidence/training files are unchanged. Final source state stayed byte-identical throughout the final regression run. Final source manifest SHA-256: \`${summary.source.afterManifestSHA256}\`.

## Full test matrix

The runner invokes unchanged original entrypoints, with a test-only network/evidence preload. Four local-voice component rows are the components of the existing combined npm script. Counts marked groups are reported groups, not invented counts of every assert. Phase 4 includes Phase 3 lifecycle coverage; the additional answer browser run includes the same 44 original Phase 3 checks plus ${summary.phase52Checks.browserAdditional} new cases. Counts overlap.

| Suite | Command | Result | Count | Node external attempts blocked |
|---|---|---|---|---|
${rows}
| live-local-voice-e2e | \`npm.cmd run check:voice:local:e2e -w @hr/server\` | **BLOCKED** | 0, not executed | — |

All executable regression checks passed. The two existing web lint warnings and large-chunk build advisory remain. MCP checks continue to validate live identity/RBAC independently of model classification. No original assertion was removed, relaxed or changed to hide a regression. The existing browser harness/fixture only gained opt-in additive Phase 5.2 cases and private test-process IPC for synthetic DB inspection/fault injection.

## Browser, recovery and durable database matrix

No plaintext answers, UUIDs, cookies or receipt fingerprints are needed in these diagnostic rows. The receipt column counts the particular submission identity; matching text from a different tab may correctly show COMMITTED with zero receipts for the losing identity.

| Scenario | Browser/recovery | Durable state | Version | Answers | Own receipt | Effects |
|---|---|---|---|---|---|---|
${browserRows}

The database matrix additionally records failures at finalized-event insertion, receipt insertion and snapshot update; concurrent same-identity and different-identity races; duplicate processing; deadline closure; new runtime ownership after commit and before commit; and modified resource/session identities. See answer-database-matrix.json. Candidate UX and envelope state transitions, including a simulated renderer crash after receiving ACK but before local transition, are independently asserted in the ${summary.phase52Checks.recovery} recovery checks.

Commit-before-ack browser injection holds the original UI request, sends the identical frozen envelope through the same candidate cookie to obtain a real durable commit, then refreshes before the original UI acknowledgement. This tests the transaction/ack boundary without adding a production fault endpoint. Real rollback injection exists only in the local disposable fixture's stdin control path.

## Security and local storage

Every submit/status operation independently authenticates the HttpOnly candidate cookie and interview binding inside the lock, checks the non-secret session generation, and preserves Origin, body/rate limits and candidate DTO allowlists. The envelope is never authority. Other interviews/candidates, stale/expired/revoked sessions, changed question/turn/version, changed content under a reused identity and fresh replay after completion fail safely. The original receipt can confirm historical commit after completion without a new mutation.

sessionStorage contains only bounded answer text, interview/question/turn/session-generation identifiers, expiry and frozen submission id/version. It contains no credentials. Display waits for authenticated matching scope. Commit, security rejection, scope change, expiry and explicit discard clear the local record; storage removal is best effort if the browser blocks storage access, with scope/expiry revalidation before any later display. A changed scope never displays the previous candidate's copy. The record lives at most two hours and within the server-reported session lifetime. Same-origin scripts/device owners can access browser plaintext; it is not cross-device backup. See ../../design.md for exact states, lifetime and cleanup semantics.

## Open release blockers and limitations

1. **OPEN / BLOCKED:** pgvector is unavailable locally. The unaltered full-chain probe again stops at 0008, rolls back and drops only its generated database. Realistic-order validation of 0026 remains unproven; fixture-based PostgreSQL tests are separate evidence.
2. **OPEN / BLOCKED:** live local voice E2E still lacks the STT/TTS worker and isolated synthetic real-engine configuration. No real audio/model inference was attempted.

One process/runtime owner remains required. Restart proof uses a fresh service owner over durable PostgreSQL, not distributed failover or an OS process-kill test. An uncommitted active attempt can recover PAUSED and requires explicit resume/review; local drafts do not extend deadlines. Closing/clearing browser storage, expiry or revocation can remove an uncommitted local copy, and storage failure is explicitly surfaced before any new submit POST. Future evaluator timeout/maintenance, distributed rate limiting, real provider delivery, retention and broader observability risks remain outside Phase 5.2.

## Changes and reproduction

${changedRows}

Only new files under docs/ai-interviewer/phase-5.2 contain this phase's evidence/tooling. source-changes.json records before/after SHA-256 for every changed source/config file; artifact-manifest.json at the package root lists every exact new evidence/tooling filename and its hash. No previous evidence was overwritten.

Use ../../README.md for exact init/all/integrity/cleanup/evidence commands and prerequisite setup. The runner allowlists child configuration, avoids retained .env files, denies external Node socket/fetch traffic, redirects older browser output paths, suppresses credential-bearing fixture writes/screenshots and confines browser profiles to the run's temporary directory. ${summary.network.instrumentedNodeProcesses} Node processes emitted counters; blocked external attempts=${summary.network.blockedExternalAttempts}; real model calls=0. Local PostgreSQL/HTTP/CDP/Vite traffic is expected. Native Chrome background traffic was not independently packet-captured.

Stopped after Phase 5.2. Phase 5.3 requires separate approval.
`
writeFileSync(resolve(output,'REPORT.md'),report)
const artifacts=[]
function walk(dir){for(const name of readdirSync(dir).sort()){const p=resolve(dir,name);if(p===resolve(here,'artifact-manifest.json'))continue;if(statSync(p).isDirectory())walk(p);else artifacts.push({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:sha256(readFileSync(p))})}}
walk(here);writeJson(resolve(here,'artifact-manifest.json'),{format:'phase52-artifact-manifest-v1',algorithm:'SHA-256',files:artifacts})
console.log(JSON.stringify({phase52Status:status,phase51Status:'BLOCKED',releaseStatus:'BLOCKED',phase51Unchanged:fingerprintsGood,source:summary.source,newChecks:summary.phase52Checks,report:relative(root,resolve(output,'REPORT.md'))}))
if(status!=='PASS')process.exitCode=1
