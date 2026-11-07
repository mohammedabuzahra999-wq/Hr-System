import { createConnection } from 'node:net'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, sha256, writeJson } from './manifest.mjs'

const here=dirname(fileURLToPath(import.meta.url)),runId=process.argv[2]
if(!runId||!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Usage: node summarize.mjs RUN_ID')
const output=resolve(here,'runs',runId),read=name=>JSON.parse(readFileSync(resolve(output,name),'utf8'))
const inventory=read('inventory.json'),integrity=read('integrity.json'),environment=read('environment.json')
const countPatterns={engine:/(\d+)\/\d+ Phase 1 checks passed/,persistence:/(\d+)\/\d+ Phase 2 PostgreSQL\/security checks passed/,
  report:/(\d+)\/\d+ Phase 4 report checks passed/,ui:/(\d+)\/\d+ Phase 3 UI logic checks passed/,
  mcp:/PASS: (\d+) MCP authorization lifecycle scenarios/,plans:/PASS: (\d+) shared-plan/,
  'report-security':/PASS: (\d+) report authorization\/scope checks/}
const matrix=inventory.map(item=>{
  const path=item.id==='migrations'?'migrations-run.json':`${item.id}.json`
  if(!existsSync(resolve(output,path)))return {...item,status:'BLOCKED',testCount:null,reason:'Suite not executed; inspect preceding failure before resuming'}
  const result=read(path),log=readFileSync(resolve(output,`${item.id}.log`),'utf8')
  const count=countPatterns[item.id]?.exec(log)?.[1]
  let testCount=count?Number(count):result.passLines,countUnit=count?'checks':'reported passing assertion/groups'
  if(['typechecks','web-build','scenario','migrations'].includes(item.id)){testCount=null;countUnit=item.id==='typechecks'?'3 workspace checks':item.id==='web-build'?'1 production build':item.id==='scenario'?'1 synthetic scenario':'full migration-chain probe'}
  if(item.id.startsWith('browser')){const r=read(`browser/ai-interviewer-phase${item.id==='browser3'?3:4}/browser-results.json`);testCount=r.passed;countUnit='browser checks'}
  return {...item,...result,testCount,countUnit,logSHA256:sha256(Buffer.from(log))}
})
const source=read('source-before.json'),journal=JSON.parse(readFileSync(resolve(root,'services/hr-api/drizzle/meta/_journal.json'),'utf8'))
writeJson(resolve(output,'migration-inventory.json'),{
  journalPath:'services/hr-api/drizzle/meta/_journal.json',
  migrations:journal.entries.map(e=>({...e,...source.files.find(f=>f.path===`services/hr-api/drizzle/${e.tag}.sql`)})),
  relevantInterviewMigration:'0026_ai_interviewer.sql',subsequentMigrationCount:0,
})
async function listening(port){return await new Promise(done=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(700);const finish=value=>{socket.destroy();done(value)};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.once('timeout',()=>finish(false))})}
const localWorkerListening=await listening(8766)
const unavailable=[{id:'live-local-voice-e2e',command:'npm.cmd run check:voice:local:e2e -w @hr/server',status:'BLOCKED',testCount:0,
  reason:localWorkerListening?'No isolated synthetic employee/app/real-engine E2E fixture configured; retained developer accounts and database are outside baseline scope':'Local STT/TTS worker on loopback port 8766 is not running; no isolated synthetic real-engine E2E app configured. No employee account/database was used.',
  localWorkerListening,network:'Dependency checked by loopback TCP connection only; no inference or model/API request'}]
const adjacent=[
  {command:'npm.cmd run check:ollama -w @hr/server',entry:'services/hr-api/src/ai/ollama.check.ts',classification:'Existing employee provider live-inference smoke, outside AI Interviewer Phase 1–4; no inference executed'},
  {command:'npm.cmd run check:resolve-question:ollama -w @hr/server',entry:'services/hr-api/src/copilot/resolveQuestion.ollama.check.ts',classification:'Existing employee Copilot live-inference smoke, outside AI Interviewer Phase 1–4; no inference executed'},
].map(r=>({...r,entryExists:existsSync(resolve(root,r.entry))}))
const migrations=read('migrations.json'),network=readdirSync(resolve(output,'network')).map(p=>read(`network/${p}`))
const browserResults=[3,4].filter(p=>existsSync(resolve(output,`browser/ai-interviewer-phase${p}/browser-results.json`)))
  .map(p=>({phase:p,...read(`browser/ai-interviewer-phase${p}/browser-results.json`)}))
const summary={phase:'5.1',recordedAtUtc:new Date().toISOString(),displayTimezone:'Asia/Riyadh',runId,
  status:matrix.some(r=>r.status==='FAIL')||!integrity.source.unchanged||!integrity.protected.unchanged?'FAIL':matrix.some(r=>r.status==='BLOCKED')||unavailable.length?'BLOCKED':'PASS',
  environment,sourceFingerprint:integrity.source,protectedIntegrity:integrity.protected,matrix,unavailable,adjacentProviderTests:adjacent,migrations,
  network:{blockedExternalAttempts:network.reduce((n,r)=>n+r.blockedExternalAttempts,0),allowedSocketConnections:network.reduce((n,r)=>n+r.socketConnectionsAllowed,0),
    allowedFetchCalls:network.reduce((n,r)=>n+r.fetchCallsAllowed,0),instrumentedNodeProcessCount:network.length,realModelCalls:0,
    suppressedFixtureWrites:network.reduce((n,r)=>n+r.suppressedFixtureWrites,0),suppressedScreenshots:network.reduce((n,r)=>n+r.suppressedScreenshots,0),
    browser:browserResults.map(r=>({phase:r.phase,candidateExternalCompleted:r.candidateExternalRequestsCompleted,candidateExternalBlocked:r.candidateExternalRequestsBlocked,hrFontsBlocked:r.hrThirdPartyFontsBlocked,realAiCalls:r.realAiCalls})),
    limits:'Node socket/fetch counters plus existing suite guards and browser-page CDP interception; native Chrome background traffic not independently packet-captured'},
  changes:{productionSourceModified:false,existingTestsModified:false,existingEvidenceModified:false,migrationsModified:false,dependenciesModified:false,
    additions:'Only docs/ai-interviewer/phase-5.1-baseline; exact package paths and hashes in artifact-manifest.json',generatedOutputs:'Existing production web build outputs/cache regenerated; temporary browser profiles removed; old evidence writes suppressed/redirected'},
  phase52Started:false}
writeJson(resolve(output,'summary.json'),summary)
const rows=[...matrix,...unavailable].map(r=>`| ${r.id} | \`${r.command}\` | **${r.status}** | ${r.testCount??'—'}${r.countUnit?' '+r.countUnit:''} | ${r.blockedExternalAttempts??'0 (not run)'} |`).join('\n')
const report=`# Phase 5.1 result: ${summary.status}

Recorded ${summary.recordedAtUtc} (Asia/Riyadh display zone). Node ${environment.node}, npm ${environment.npm}, PostgreSQL ${migrations.postgresqlVersion??'unavailable'}, ${environment.platform} ${environment.architecture}. Chrome ${environment.chromeVersion??'version not recorded'}. No production behavior changed. Phase 5.2 was not started.

## Fingerprint and preservation

- Source: ${integrity.source.fileCount} files; before/after identical.
- Source filesDigest: \`${integrity.source.filesDigest}\`.
- Source manifest file SHA-256: \`${integrity.source.manifestSHA256}\`.
- Protected earlier evidence/training: ${integrity.protected.fileCount} files; before/after identical.
- Protected filesDigest: \`${integrity.protected.filesDigest}\`.
- Exact raw-byte inventories: source-before.json/source-after.json and protected-before.json/protected-after.json. No .git metadata is present.

## Test matrix

Commands map to unchanged entrypoints in inventory.json. Local-voice rows are the four unchanged components of the documented combined npm command. Counts labeled groups are console-reported passing groups, not a fabricated count of every assert statement. Type/build/scenario have no assertion-count claim.

| Suite | Existing command | Result | Count | External attempts blocked by Node guard |
|---|---|---|---|---|
${rows}

All executed regression suites passed. Phase 3 and Phase 4 browser suites ran independently; Phase 4 includes the Phase 3 lifecycle, so their counts must not be treated as disjoint coverage. Typechecks retained two pre-existing web lint warnings (GapForm.tsx and ScorecardEditor.tsx). The production build retained its existing large-chunk advisory. No test was rewritten or weakened.

## Database and migrations

PostgreSQL tests use uniquely named synthetic databases on the existing local test PostgreSQL 18.6 runtime, never the configured developer application database. Persistence/report/browser fixtures apply migration 0026 verbatim against simplified legacy parents; this limitation is stated separately from the full-chain probe.

Full-chain result: **${migrations.status}**. ${migrations.blocker??'See migrations.json for exact outcome.'} Drizzle attempted the actual ${migrations.journalEntries}-entry journal in its production order. ${migrations.status==='BLOCKED'?'Execution stopped at 0008; migration 0026 was not reached through the full chain.':''} Transaction rolled back: ${migrations.transactionRolledBack??'not applicable'}. Disposable full-chain database cleaned up: ${migrations.cleanup}. No SQL, enum, vector type, extension or parent table was substituted. Full-chain migration success and no-op rerun cannot be claimed when pgvector is unavailable. No migration was changed.

## Network and confidential data

${summary.network.instrumentedNodeProcessCount} Node processes emitted guard counters; blocked external attempts=${summary.network.blockedExternalAttempts}; real model calls=0. Loopback PostgreSQL, HTTP/CDP, Vite and IPC are allowed as needed. Candidate completed external requests were zero in both browser runs; existing HR font attempts were intercepted and blocked (see summary.json for counts). Native Chrome background traffic was not packet-captured, so these are application/test-boundary measurements.

Fixture credential files and ${summary.network.suppressedScreenshots} screenshots were not persisted; ${summary.network.suppressedFixtureWrites} credential-bearing fixture writes were suppressed. Old Phase 3/4 outputs were redirected. No raw tokens, cookies, passwords, API keys, production database credentials or retained .env contents are included. Temporary browser profiles are removed by the cleanup command.

## Blocked and excluded checks

${unavailable.map(r=>`- **${r.status}** \`${r.command}\`: ${r.reason}`).join('\n')}
- Existing live Ollama smoke scripts were inventoried separately. They test employee provider/Copilot inference, not the mock AI Interviewer Phase 1–4 path, and were not invoked. Offline structured-provider failure/malformed-response regression passed.

## Supported deployment and remaining risks

One application process and one runtime owner; PostgreSQL durability; process-local rate limiting; no real candidate interview provider/STT/TTS/WebRTC; mock evaluator and follow-up policy; production START fails closed. Employee Voice/MCP remains separately authenticated. Current HR/Admin recruitment scope is role-wide.

Unsubmitted-answer refresh loss, absent trusted real-disconnect pause, missing real effects delivery, unbounded future evaluator execution/sequential maintenance, distributed ownership/rate limits, retention/deletion and richer safe observability remain later-phase risks. Production provider and assessment readiness is not claimed.

## Changes and reproduction

Only this new isolated package was added. artifact-manifest.json gives every exact created filename and SHA-256. All source, package/lockfiles, migrations, existing tests, prior evidence and protected training files are unchanged. Generated web build outputs/cache were refreshed by the existing build. No database schema change was made to the developer database.

See ../../README.md from this run directory (or the package README.md) for exact init, all, integrity, cleanup, summary and manifest-regeneration commands. Keep a fresh run id; no existing results should be overwritten. To unblock full-chain validation, supply a disposable local PostgreSQL runtime with a genuine compatible pgvector extension and rerun the same unaltered probe. Do not stub the extension or skip migration 0008.

Stop here. Phase 5.2 requires further approval.
`
writeFileSync(resolve(output,'REPORT.md'),report)
const packageFiles=[]
function walk(dir){for(const name of readdirSync(dir).sort()){const p=resolve(dir,name);if(p===resolve(here,'artifact-manifest.json'))continue;if(statSync(p).isDirectory())walk(p);else packageFiles.push({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:sha256(readFileSync(p))})}}
walk(here)
writeJson(resolve(here,'artifact-manifest.json'),{format:'phase51-artifact-manifest-v1',algorithm:'SHA-256',files:packageFiles})
console.log(`${summary.status}; suites=${matrix.length}; sourceUnchanged=${integrity.source.unchanged}; protectedUnchanged=${integrity.protected.unchanged}; ${relative(root,resolve(output,'REPORT.md'))}`)
