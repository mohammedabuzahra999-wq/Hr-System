import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packages as priorPackages } from '../phase-5.6/state.mjs'
import { manifest, root, sha256 } from './manifest.mjs'

export const here = dirname(fileURLToPath(import.meta.url)), read = p => JSON.parse(readFileSync(p, 'utf8'))
export const acceptedSource = '9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627'
export const expectedChanges = {
  'apps/hr-web/src/features/aiInterviewer/AudioAnswerPanel.tsx': 'Explicit consent, recording/local-only/upload/processing/commit/retry/closed UX.',
  'apps/hr-web/src/features/aiInterviewer/audioRecovery.ts': 'Session-scoped per-tab IndexedDB WAV envelope, identity preservation, authenticated reconciliation and expiry.',
  'apps/hr-web/src/features/aiInterviewer/microphone.ts': 'Native microphone permission/capture, bounded cleanup and local PCM WAV encoding.',
  'packages/contracts/src/aiInterviewAudio.ts': 'Strict public audio request/result contracts and canonical bounds.',
  'services/hr-api/scripts/checkCandidateAudioBrowser.mjs': 'Reproducibly derived existing HR/candidate harness plus native virtual-microphone tests.',
  'services/hr-api/scripts/checkCandidateAudioBrowserCases.mjs': 'Permission/record/refresh/retry/STT/fencing/privacy browser assertions.',
  'services/hr-api/scripts/checkCandidateAudioUi.mjs': '29 synthetic encoding/storage/recovery/uncertainty/privacy UI checks.',
  'services/hr-api/src/aiInterviewer/audioContracts.ts': 'Server-only durable ticket, attempt and transcript schemas.',
  'services/hr-api/src/aiInterviewer/audioTransport.check.ts': '37 PostgreSQL/HTTP/STT/security/rollback/restart/configuration checks.',
  'services/hr-api/src/aiInterviewer/audioTransport.ts': 'Bounded authenticated WAV reader, registered STT invocation, safe failures and cancellation.',
  'apps/hr-web/src/features/aiInterviewer/client.ts': 'Cookie-authenticated bounded JSON/binary audio API calls.',
  'apps/hr-web/src/features/aiInterviewer/session.ts': 'Own audio recovery controller only when capture is server-enabled.',
  'apps/hr-web/src/features/aiInterviewer/useInterviewSession.ts': 'Observe/reconcile audio state; stop tracks and warn on pending navigation.',
  'apps/hr-web/src/pages/AiInterviewPage.tsx': 'Mount audio panel and accurate consent/completion text; preserve disabled mock behavior.',
  'packages/contracts/src/index.ts': 'Export shared audio schemas.',
  'services/hr-api/package.json': 'Add three synthetic audio verification commands; no dependency changes.',
  'services/hr-api/src/aiInterviewer/routes.ts': 'Authenticated Origin-protected begin/upload/status/cancel with bounded per-session rates.',
  'services/hr-api/src/aiInterviewer/service.ts': 'Existing PostgreSQL receipts/events for capture reservation, atomic answer finalization and stale fences.',
  'services/hr-api/src/aiInterviewer/ui.fixture.ts': 'Opt-in test-only synthetic STT control/inspection for native browser suite.',
  'services/hr-api/src/env.ts': 'Default-off audio capture flag; require valid server STT registration when enabled.',
  'services/hr-api/src/index.ts': 'Register transport from existing server STT registry and close admission on shutdown.',
}
const packages = [...priorPackages,
  ['phase-5.6', 'b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c', 'runs/final-20261105/source-final.json', 'e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0'],
  ['stt-tts-provider-layer', 'e9f1a26ef155286ee7f7992eef8855bfe7efd2153d81401f6fe7dba5bcb4738c', 'runs/final-verified-20261105/source-final.json', acceptedSource],
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
  const after=manifest(),before=get('source-before.json'),old=read(resolve(root,'docs/ai-interviewer/stt-tts-provider-layer/runs/final-verified-20261105/source-final.json'))
  require(sha256(readFileSync(resolve(here,'runs/baseline-20261105/source-before.json')))===acceptedSource,'INITIAL_SOURCE_BASELINE')
  const prior=new Map(old.files.map(f=>[f.path,f])),current=new Map(after.files.map(f=>[f.path,f]))
  const diff={created:after.files.filter(f=>!prior.has(f.path)),modified:after.files.filter(f=>prior.has(f.path)&&prior.get(f.path).sha256!==f.sha256).map(f=>({...f,beforeSHA256:prior.get(f.path).sha256})),deleted:old.files.filter(f=>!current.has(f.path))}
  const paths=[...diff.created,...diff.modified,...diff.deleted].map(f=>f.path)
  require(JSON.stringify(before)===JSON.stringify(after)&&get('integrity.json').source.unchanged,'TEST_SOURCE_CHANGED')
  require(diff.created.length===10&&diff.modified.length===11&&!diff.deleted.length&&paths.length===Object.keys(expectedChanges).length&&paths.every(p=>p in expectedChanges),'UNEXPECTED_SOURCE_SCOPE')
  const protectedBefore=get('protected-before.json'),protectedChanges=changes(protectedBefore.files)
  require(protectedBefore.fileCount===608&&!protectedChanges.length&&get('integrity.json').protected.unchanged,'EARLIER_EVIDENCE_CHANGED')
  const expectedCounts={'audio-ui':29,'audio-transport':37,'audio-browser':28,'speech-contract':58,'synthetic-e2e':27,operations:41,'operations-db':26,'provider-gate':51,'execution-bounds':14,'runtime-jobs':30,'answer-ui':26,'answer-db':27,engine:37,persistence:65,report:76,ui:24,mcp:18,permissions:107,gate:194,plans:95,'report-security':44,voice:17,'local-voice-api':3,'local-voice-audio':4,'local-voice-turn':8,'local-voice-queue':6,scorecard:27,'structured-provider':4,'secret-scan':1,'secret-canary':1,browser3:44,browser4:58,'answer-browser':56}
  const inventory=get('inventory.json');require(inventory.length===39,'SUITE_INVENTORY')
  const recheckMap=existsSync(resolve(output,'rechecks.json'))?get('rechecks.json'):{}
  const regression=inventory.map(item=>{
    const file=item.id==='migrations'?'migrations-run.json':item.id+'.json',original=get(file),selected=recheckMap[item.id]?resolve(here,'runs',recheckMap[item.id].run):output
    if(selected!==output)require(JSON.stringify(read(resolve(selected,'source-before.json')))===JSON.stringify(before),'RECHECK_SOURCE_'+item.id)
    const result=read(resolve(selected,file)),log=readFileSync(resolve(selected,item.id+'.log'),'utf8')
    require(result.exitCode===0&&Number.isFinite(Date.parse(result.finishedAt))&&Date.parse(result.finishedAt)>=Date.parse(result.startedAt)&&result.blockedExternalAttempts===0&&result.status===(item.id==='migrations'?'BLOCKED':'PASS'),item.id+'_RESULT')
    let count=expectedCounts[item.id]===undefined?null:result.passLines
    const patterns={mcp:/PASS: (\d+) MCP authorization lifecycle scenarios/,plans:/PASS: (\d+) shared-plan/,'report-security':/PASS: (\d+) report authorization\/scope checks/}
    if(patterns[item.id])count=Number(patterns[item.id].exec(log)?.[1])
    if(['audio-browser','browser3','browser4','answer-browser'].includes(item.id)){
      const b=read(resolve(selected,`browser/${item.id}/${item.id==='browser4'?'ai-interviewer-phase4':'ai-interviewer-phase3'}/browser-results.json`))
      count=b.passed;require(b.status==='PASS'&&b.failed===0&&b.checks.length===expectedCounts[item.id]&&b.checks.every(c=>c.result==='PASS'),item.id+'_RAW_BROWSER')
    }
    require(expectedCounts[item.id]===undefined||count===expectedCounts[item.id],item.id+'_COUNT')
    return {...item,...result,count,resultDirectory:relative(here,selected).replaceAll('\\','/'),...(selected===output?{}:{originalAttempt:original,retryNote:recheckMap[item.id].note})}
  })
  const transport=get('audio-transport-matrix.json'),contract=get('speech-contract-matrix.json'),synthetic=get('synthetic-e2e-matrix.json')
  require(transport.status==='PASS'&&transport.checks===37&&transport.externalAttempts===0,'AUDIO_TRANSPORT')
  require(contract.status==='PASS'&&contract.checks===58&&contract.syntheticSdkRequests===31&&contract.externalAttempts===0&&contract.realProviderCalls===0,'SPEECH_CONTRACT')
  require(synthetic.status==='PASS'&&synthetic.checks===27&&synthetic.cleanup,'EXISTING_SYNTHETIC_ACCEPTANCE')
  const secrets=get('speech-secret-proof.json'),scan=get('secret-canary.json'),secretLog=readFileSync(resolve(output,'secret-scan.log'),'utf8'),oldScan=/PASS frontend\/bundle secret exclusion; files=(\d+); offendingFiles=0; valuesPrinted=0/.exec(secretLog)
  require(Date.parse(scan.startedAt)>=Date.parse(get('web-build.json').finishedAt)&&secrets.status==='PASS'&&secrets.checkedFiles>=146&&secrets.offendingFiles===0&&secrets.valuesPrinted===0&&secrets.dedicatedSpeechCanaryDetected&&oldScan&&Number(oldScan[1])===secrets.checkedFiles,'POST_BUILD_SECRET_SCAN')
  const selectedFolders=[output,...Object.values(recheckMap).map(r=>resolve(here,'runs',r.run))]
  if(recheckMap.browser3){
    const folder=resolve(here,'runs',recheckMap.browser3.run),diagnostic=read(resolve(folder,'browser-diagnostics.json')),trace=read(resolve(folder,'browser/browser-diagnostics/ai-interviewer-phase3/metadata-trace.json'))
    require(diagnostic.status==='PASS'&&diagnostic.exitCode===0&&diagnostic.passLines===44&&trace.assertionsUnchanged===true,'BROWSER_DIAGNOSTIC_RESULT')
    const allowed=new Set(['at','method','path','command','expectedVersion','httpStatus','error','version','speaking','phase'])
    require(trace.trace.every(row=>Object.keys(row).every(key=>allowed.has(key))),'BROWSER_TRACE_PRIVACY')
  }
  const networkRows=[...new Set(selectedFolders)].flatMap(dir=>readdirSync(resolve(dir,'network')).map(file=>read(resolve(dir,'network',file))))
  const network={instrumentedNodeProcesses:networkRows.length,guardedExternalAttempts:networkRows.reduce((n,r)=>n+r.blockedExternalAttempts,0),realProviderCalls:0,realModelCalls:0,localModelsInstalled:0,ollamaServiceCalls:0,syntheticSpeechSdkRequests:contract.syntheticSdkRequests,scope:'Instrumented Node socket/fetch plus Chrome page guards; native Chrome background traffic not independently packet-captured.'}
  require(network.guardedExternalAttempts===0,'EXTERNAL_CALLS')
  const logs=walk(here).filter(p=>p.endsWith('.log')),privacy=[]
  for(const path of logs){const text=readFileSync(path,'utf8');if(/\b[A-Za-z0-9_-]{43}\b|postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])[^\s'"<>]+|phase5[56]-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key|speech-layer-synthetic-bundle-canary-not-a-key/.test(text)||/(?:password|session_secret|api_key|clientSecret|credential)\s*[:=]\s*['"]?(?!\[redacted\])[^\s,'"}]+/i.test(text))privacy.push(relative(root,path))}
  require(!privacy.length&&!walk(here).some(p=>/(?:^|[\\/])fixture\.json$/.test(p)),'EVIDENCE_PRIVACY')
  const cleanup=get('resource-cleanup.json'),migration=get('migrations.json')
  require(cleanup.status==='PASS'&&cleanup.activeOtherClientSessions===0&&cleanup.ownDisposableDatabasesRemaining===0&&cleanup.localTestClusterStopped&&cleanup.temporaryRunDirectoriesRemaining===0,'RESOURCE_CLEANUP')
  const temporary=resolve(root,'.local-dev/candidateaudio-temp')
  require((!existsSync(temporary)||readdirSync(temporary).length===0)&&!existsSync(resolve(root,'.local-dev/ai-interviewer-postgres/data/postmaster.pid')),'ACTUAL_RESOURCE_CLEANUP')
  require(migration.status==='BLOCKED'&&migration.vectorAvailable===false&&migration.transactionRolledBack&&migration.cleanup&&migration.sqlState==='0A000','MIGRATION_BLOCKER')
  return {status:failures.length?'FAIL':'PASS',runId:run,scope:'Authenticated candidate microphone/WAV uplink to registered STT, synthetic verification, local single-process',overallReleaseReadiness:'BLOCKED',liveVoiceE2E:'BLOCKED',
    source:{beforeAcceptedSHA256:acceptedSource,finalManifestSHA256:sha256(Buffer.from(JSON.stringify(after,null,2)+'\n')),fileCount:after.fileCount,filesDigest:after.filesDigest,stableDuringTests:JSON.stringify(before)===JSON.stringify(after),...diff},
    preservation,earlierEvidence:{files:608,changes:protectedChanges},transport,contract,synthetic,regression,completedPassSuites:regression.filter(r=>r.status==='PASS').length,secrets,
    logPrivacy:{filesChecked:logs.length,offendingFiles:privacy.length,paths:privacy},network,cleanup,migration,
    releaseBlockers:[{id:'pgvector-full-migration-chain',status:'OPEN / BLOCKED'},{id:'live-voice-worker-complete-trusted-candidate-transport',status:'OPEN / BLOCKED'}],
    llmOrchestrationImplemented:false,evaluationIntegrationImplemented:false,realProviderCallsMade:false,dependenciesAdded:0,migrationsAdded:0,failures,currentSourceManifest:after}
}
