import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packages as priorPackages } from '../phase-5.6/state.mjs'
import { manifest, root, sha256 } from './manifest.mjs'

export const here = dirname(fileURLToPath(import.meta.url)), read = p => JSON.parse(readFileSync(p, 'utf8'))
export const acceptedSource = '55f7d754e37e38b185095b6b5410c0d59bf82fc576567cb3c48203aabfeacf14'
export const expectedChanges = {
  "packages/contracts/src/aiInterviewLlm.ts": "Strict question-text proposal and allowed decision contracts.",
  "packages/contracts/src/aiInterview.ts": "Engine-only draft-text revision command/event, excluded from candidate authority.",
  "packages/contracts/src/index.ts": "Export pure model contracts.",
  "services/hr-api/src/aiInterviewer/llmConfiguration.ts": "Default-off, dedicated server configuration and immutable nonsecret provider profile.",
  "services/hr-api/src/aiInterviewer/llmContracts.ts": "Bounded provider context, durable job schema and quarantined text validation.",
  "services/hr-api/src/aiInterviewer/llmProviders.ts": "Deterministic synthetic adapter and pinned OpenAI structured SDK adapter with safe errors and no tools.",
  "services/hr-api/src/aiInterviewer/llmRuntime.ts": "One server-owned provider registration without I/O.",
  "services/hr-api/src/aiInterviewer/llmOrchestrator.ts": "Independent bounded asynchronous discovery, retries, cancellation, admission and late-result fences.",
  "services/hr-api/src/aiInterviewer/llmProviders.check.ts": "24 injected SDK/configuration/size/schema/prompt-boundary checks.",
  "services/hr-api/src/aiInterviewer/llmOrchestration.check.ts": "26 real PostgreSQL/HTTP/engine/approval/recovery/security/timer checks.",
  "services/hr-api/src/aiInterviewer/service.ts": "Existing SQL receipts/events for durable mode and attempts, HR approval, exact policy validation and atomic decision commit.",
  "services/hr-api/src/aiInterviewer/engine.ts": "Only CREATED question text can change; order/criteria/IDs/timing/caps remain engine-owned.",
  "services/hr-api/src/aiInterviewer/runtime.ts": "Model-enabled processing leaves the timer loop; legacy mock processing remains intact.",
  "services/hr-api/src/aiInterviewer/routes.ts": "Authorized generation/review/control APIs and minimal candidate status.",
  "services/hr-api/src/aiInterviewer/ui.fixture.ts": "Explicit test-only synthetic model scenarios and counts.",
  "services/hr-api/src/env.ts": "Validate dedicated LLM configuration without values printed.",
  "services/hr-api/src/index.ts": "Register and start/drain independent model dispatcher.",
  "services/hr-api/package.json": "Three new verification commands, no dependency change.",
  "services/hr-api/scripts/checkLlmOrchestrationBrowser.mjs": "Derived unchanged authenticated setup plus synthetic LLM browser acceptance.",
  "services/hr-api/scripts/checkLlmOrchestrationBrowserCases.mjs": "24 total setup/model/answer/recovery/pause/RBAC browser assertions.",
  "apps/hr-web/src/features/aiInterviewer/client.ts": "Minimal candidate orchestration status client, no model config or credentials.",
  "apps/hr-web/src/features/aiInterviewer/session.ts": "Model status/retry/recovery cache while authoritative answers stay committed.",
  "apps/hr-web/src/features/aiInterviewer/MockControls.tsx": "Disable direct mock PROCESS only for model-enabled rooms.",
  "apps/hr-web/src/pages/AiInterviewPage.tsx": "Truthful committed-answer/model-processing/recovery messages."
}
const packages = [...priorPackages,
  ['phase-5.6', 'b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c', 'runs/final-20261105/source-final.json', 'e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0'],
  ['stt-tts-provider-layer', 'e9f1a26ef155286ee7f7992eef8855bfe7efd2153d81401f6fe7dba5bcb4738c', 'runs/final-verified-20261105/source-final.json', '9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627'],
  ['candidate-audio-transport','877d54b54fc970bedc05a76b0712c13f3b5ecfa7fb18b96f1e83a95522f70efd','runs/final-20261105/source-final.json','fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17'],
  ['tts-playback','97399ec51de20db6c74374a9da6678dfeff94a76e96ea348bbaa172133b32a95','runs/final-verified-20261105/source-final.json',acceptedSource],
]
export function walk(dir) {return readdirSync(dir).sort().flatMap(name => {const p=resolve(dir,name);return statSync(p).isDirectory()?walk(p):[p]})}
export function changes(files) {return files.filter(f=>{const p=resolve(root,f.path);return (!p.startsWith(root+'/')&&!p.startsWith(root+'\\'))||!existsSync(p)||sha256(readFileSync(p))!==f.sha256||(f.bytes!==undefined&&statSync(p).size!==f.bytes)}).map(f=>f.path)}
export function inspect(run) {
  if(!run||!/^[a-zA-Z0-9_-]+$/.test(run))throw Error('Invalid run')
  const output=resolve(here,'runs',run), get=name=>read(resolve(output,name)), failures=[]
  const require=(condition,name)=>{if(!condition)failures.push(name)}
  const preservation=packages.map(([name,expected,sourceFile,expectedSource])=>{
    const folder=resolve(root,'docs/ai-interviewer',name),bytes=readFileSync(resolve(folder,'artifact-manifest.json')),value=JSON.parse(bytes),mismatches=changes(value.files)
    const listed=new Set(value.files.map(f=>f.path)),unlisted=walk(folder).filter(p=>p!==resolve(folder,'artifact-manifest.json')&&!listed.has(relative(root,p).replaceAll('\\','/')))
    require(sha256(bytes)===expected&&sha256(readFileSync(resolve(folder,sourceFile)))===expectedSource&&!mismatches.length&&!unlisted.length,name+'_EVIDENCE_CHANGED')
    return {phase:name,files:value.files.length,mismatches,unlisted:unlisted.length,artifactManifestSHA256:sha256(bytes),sourceManifestSHA256:expectedSource}
  })
  const after=manifest(),before=get('source-before.json'),old=read(resolve(root,'docs/ai-interviewer/tts-playback/runs/final-verified-20261105/source-final.json'))
  require(sha256(readFileSync(resolve(here,'runs/baseline-20261105/source-before.json')))===acceptedSource,'INITIAL_SOURCE_BASELINE')
  const prior=new Map(old.files.map(f=>[f.path,f])),current=new Map(after.files.map(f=>[f.path,f]))
  const diff={created:after.files.filter(f=>!prior.has(f.path)),modified:after.files.filter(f=>prior.has(f.path)&&prior.get(f.path).sha256!==f.sha256).map(f=>({...f,beforeSHA256:prior.get(f.path).sha256})),deleted:old.files.filter(f=>!current.has(f.path))}
  const paths=[...diff.created,...diff.modified,...diff.deleted].map(f=>f.path)
  require(JSON.stringify(before)===JSON.stringify(after)&&get('integrity.json').source.unchanged,'TEST_SOURCE_CHANGED')
  require(diff.created.length===10&&diff.modified.length===14&&!diff.deleted.length&&paths.length===Object.keys(expectedChanges).length&&paths.every(p=>p in expectedChanges),'UNEXPECTED_SOURCE_SCOPE')
  const protectedBefore=get('protected-before.json'),protectedChanges=changes(protectedBefore.files)
  require(protectedBefore.fileCount===608&&!protectedChanges.length&&get('integrity.json').protected.unchanged,'EARLIER_EVIDENCE_CHANGED')
  const expectedCounts={'llm-contract':24,'llm-db':26,'llm-browser':24,'tts-ui':19,'tts-transport':30,'tts-browser':28,'audio-ui':29,'audio-transport':37,'audio-browser':28,'speech-contract':58,'synthetic-e2e':27,operations:41,'operations-db':26,'provider-gate':51,'execution-bounds':14,'runtime-jobs':30,'answer-ui':26,'answer-db':27,engine:37,persistence:65,report:76,ui:24,mcp:18,permissions:107,gate:194,plans:95,'report-security':44,voice:17,'local-voice-api':3,'local-voice-audio':4,'local-voice-turn':8,'local-voice-queue':6,scorecard:27,'structured-provider':4,'secret-scan':1,'secret-canary':1,browser3:44,browser4:58,'answer-browser':56}
  expectedCounts['tts-closing']=6
  const recordedInventory=get('inventory.json'),inventory=[...recordedInventory]
  if(!inventory.some(r=>r.id==='tts-closing')&&existsSync(resolve(output,'tts-closing-inventory.json')))inventory.push(get('tts-closing-inventory.json'))
  require(inventory.length===46,'SUITE_INVENTORY')
  const recheckMap=existsSync(resolve(output,'rechecks.json'))?get('rechecks.json'):{}
  const regression=inventory.map(item=>{
    const file=item.id==='migrations'?'migrations-run.json':item.id+'.json',original=get(file),selected=recheckMap[item.id]?resolve(here,'runs',recheckMap[item.id].run):output
    if(selected!==output)require(JSON.stringify(read(resolve(selected,'source-before.json')))===JSON.stringify(before),'RECHECK_SOURCE_'+item.id)
    const result=read(resolve(selected,file)),log=readFileSync(resolve(selected,item.id+'.log'),'utf8')
    require(result.exitCode===0&&Number.isFinite(Date.parse(result.finishedAt))&&Date.parse(result.finishedAt)>=Date.parse(result.startedAt)&&result.blockedExternalAttempts===0&&result.status===(item.id==='migrations'?'BLOCKED':'PASS'),item.id+'_RESULT')
    let count=expectedCounts[item.id]===undefined?null:result.passLines
    const patterns={mcp:/PASS: (\d+) MCP authorization lifecycle scenarios/,plans:/PASS: (\d+) shared-plan/,'report-security':/PASS: (\d+) report authorization\/scope checks/}
    if(patterns[item.id])count=Number(patterns[item.id].exec(log)?.[1])
    if(['llm-browser','tts-browser','audio-browser','browser3','browser4','answer-browser'].includes(item.id)){
      const b=read(resolve(selected,`browser/${item.id}/${item.id==='browser4'?'ai-interviewer-phase4':'ai-interviewer-phase3'}/browser-results.json`))
      count=b.passed;require(b.status==='PASS'&&b.failed===0&&b.checks.length===expectedCounts[item.id]&&b.checks.every(c=>c.result==='PASS'),item.id+'_RAW_BROWSER')
    }
    require(expectedCounts[item.id]===undefined||count===expectedCounts[item.id],item.id+'_COUNT')
    return {...item,...result,count,resultDirectory:relative(here,selected).replaceAll('\\','/'),...(selected===output?{}:{originalAttempt:original,retryNote:recheckMap[item.id].note})}
  })
  const llmDb=get('llm-db-matrix.json'),llmContract=get('llm-contract-matrix.json');require(llmDb.status==='PASS'&&llmDb.checks===26&&llmDb.externalAttempts===0&&llmContract.status==='PASS'&&llmContract.checks===24&&llmContract.syntheticSdkRequests===14&&llmContract.realProviderCalls===0&&llmContract.externalAttempts===0,'LLM_NEW_VERIFICATION')
  const transport=get('tts-transport-matrix.json'),contract=get('speech-contract-matrix.json'),synthetic=get('synthetic-e2e-matrix.json')
  require(transport.status==='PASS'&&transport.checks===30&&transport.externalAttempts===0,'AUDIO_TRANSPORT')
  const fixedWarning=transport.matrix.find(r=>r.scenario==='warning-version-window');require(fixedWarning?.warningAtomicWithListening===true&&fixedWarning.maintenanceVersionStable===true&&fixedWarning.nextSpeechAccepted===true,'ATOMIC_WARNING_FIX')
  const closing=get('tts-closing-matrix.json');require(closing.status==='PASS'&&closing.checks===6&&closing.externalAttempts===0&&closing.answers>=1,'TTS_CLOSING_INTEGRITY')
  require(contract.status==='PASS'&&contract.checks===58&&contract.syntheticSdkRequests===31&&contract.externalAttempts===0&&contract.realProviderCalls===0,'SPEECH_CONTRACT')
  require(synthetic.status==='PASS'&&synthetic.checks===27&&synthetic.cleanup,'EXISTING_SYNTHETIC_ACCEPTANCE')
  const secrets=get('speech-secret-proof.json'),scan=get('secret-canary.json'),secretLog=readFileSync(resolve(output,'secret-scan.log'),'utf8'),oldScan=/PASS frontend\/bundle secret exclusion; files=(\d+); offendingFiles=0; valuesPrinted=0/.exec(secretLog)
  require(Date.parse(scan.startedAt)>=Date.parse(get('web-build.json').finishedAt)&&secrets.status==='PASS'&&secrets.checkedFiles>=148&&secrets.offendingFiles===0&&secrets.valuesPrinted===0&&secrets.dedicatedSpeechCanaryDetected&&secrets.dedicatedLlmCanaryDetected&&oldScan&&Number(oldScan[1])===secrets.checkedFiles,'POST_BUILD_SECRET_SCAN')

  for(const [suite,recheck]of Object.entries(recheckMap)){
    const path=resolve(here,'runs',recheck.run,`${suite}-cdp-metadata.json`)
    if(existsSync(path)){
      const trace=read(path),allowed=new Set(['at','method','path','command','expectedVersion','httpStatus','error','version','speaking','phase','eventTypes'])
      require(trace.originalAssertionsUnchanged===true&&trace.observationMayAffectTiming===true&&trace.trace.length>0&&trace.trace.length<=4000&&trace.trace.every(row=>Object.keys(row).every(key=>allowed.has(key))),suite+'_TRACE_PRIVACY')
    }
  }
  if(recheckMap.browser3){
    const folder=resolve(here,'runs',recheckMap.browser3.run),diagnostic=read(resolve(folder,'browser-diagnostics.json')),trace=read(resolve(folder,'browser/browser-diagnostics/ai-interviewer-phase3/metadata-trace.json'))
    require(diagnostic.status==='PASS'&&diagnostic.exitCode===0&&diagnostic.passLines===44&&trace.assertionsUnchanged===true,'BROWSER_DIAGNOSTIC_RESULT')
    const allowed=new Set(['at','method','path','command','expectedVersion','httpStatus','error','version','speaking','phase'])
    require(trace.trace.every(row=>Object.keys(row).every(key=>allowed.has(key))),'BROWSER_TRACE_PRIVACY')
  }
  const networkRows=readdirSync(resolve(here,'runs')).map(name=>resolve(here,'runs',name,'network')).filter(existsSync).flatMap(dir=>readdirSync(dir).map(file=>read(resolve(dir,file))))
  const sdkRuns=readdirSync(resolve(here,'runs')).map(name=>resolve(here,'runs',name,'speech-contract-matrix.json')).filter(existsSync)
  const llmSdkRuns=readdirSync(resolve(here,'runs')).map(name=>resolve(here,'runs',name,'llm-contract-matrix.json')).filter(existsSync)
  const network={instrumentedNodeProcesses:networkRows.length,guardedExternalAttempts:networkRows.reduce((n,r)=>n+r.blockedExternalAttempts,0),realProviderCalls:0,realModelCalls:0,localModelsInstalled:0,ollamaServiceCalls:0,syntheticSpeechSdkRequests:sdkRuns.reduce((n,p)=>n+read(p).syntheticSdkRequests,0),finalRunSyntheticSpeechSdkRequests:contract.syntheticSdkRequests,syntheticLlmSdkRequests:llmSdkRuns.reduce((n,p)=>n+read(p).syntheticSdkRequests,0),finalRunSyntheticLlmSdkRequests:llmContract.syntheticSdkRequests,scope:'All guarded task attempts; Node socket/fetch plus Chrome page guards; native Chrome background traffic not independently packet-captured.'}
  require(network.guardedExternalAttempts===0,'EXTERNAL_CALLS')
  const logs=walk(here).filter(p=>p.endsWith('.log')),privacy=[]
  for(const path of logs){const text=readFileSync(path,'utf8');if(/\b[A-Za-z0-9_-]{43}\b|postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])[^\s'"<>]+|phase5[56]-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key|speech-layer-synthetic-bundle-canary-not-a-key|interview-llm-synthetic-bundle-canary-not-a-key/.test(text)||/(?:password|session_secret|api_key|clientSecret|credential)\s*[:=]\s*['"]?(?!\[redacted\])[^\s,'"}]+/i.test(text))privacy.push(relative(root,path))}
  require(!privacy.length&&!walk(here).some(p=>/(?:^|[\\/])fixture\.json$/.test(p)),'EVIDENCE_PRIVACY')
  const cleanup=get('resource-cleanup.json'),migration=get('migrations.json')
  require(cleanup.status==='PASS'&&cleanup.activeOtherClientSessions===0&&cleanup.ownDisposableDatabasesRemaining===0&&cleanup.localTestClusterStopped&&cleanup.temporaryRunDirectoriesRemaining===0,'RESOURCE_CLEANUP')
  const temporary=resolve(root,'.local-dev/llmorchestration-temp')
  require((!existsSync(temporary)||readdirSync(temporary).length===0)&&!existsSync(resolve(root,'.local-dev/ai-interviewer-postgres/data/postmaster.pid')),'ACTUAL_RESOURCE_CLEANUP')
  require(migration.status==='BLOCKED'&&migration.vectorAvailable===false&&migration.transactionRolledBack&&migration.cleanup&&migration.sqlState==='0A000','MIGRATION_BLOCKER')
  return {status:failures.length?'FAIL':'PASS',runId:run,scope:'Asynchronous interview LLM proposals/approved decisions; synthetic verification; supported local single-process',overallReleaseReadiness:'BLOCKED',liveVoiceE2E:'BLOCKED',
    source:{beforeAcceptedSHA256:acceptedSource,finalManifestSHA256:sha256(Buffer.from(JSON.stringify(after,null,2)+'\n')),fileCount:after.fileCount,filesDigest:after.filesDigest,stableDuringTests:JSON.stringify(before)===JSON.stringify(after),...diff},
    preservation,earlierEvidence:{files:608,changes:protectedChanges},llmDb,llmContract,transport,closing,contract,synthetic,regression,completedPassSuites:regression.filter(r=>r.status==='PASS').length,secrets,
    logPrivacy:{filesChecked:logs.length,offendingFiles:privacy.length,paths:privacy},network,cleanup,migration,
    releaseBlockers:[{id:'pgvector-full-migration-chain',status:'OPEN / BLOCKED'},{id:'live-voice-worker-complete-trusted-candidate-transport',status:'OPEN / BLOCKED'}],
    llmOrchestrationImplemented:true,evaluationIntegrationImplemented:false,realProviderCallsMade:false,dependenciesAdded:0,migrationsAdded:0,failures,currentSourceManifest:after}
}
