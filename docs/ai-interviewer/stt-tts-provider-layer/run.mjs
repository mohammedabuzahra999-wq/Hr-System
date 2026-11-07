import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256, writeJson } from './manifest.mjs'

const here = dirname(fileURLToPath(import.meta.url)), api = resolve(root, 'services/hr-api')
const npm = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
const ts = file => ['--conditions=development', '--import', 'tsx', file]
const definitions = [
  ['speech-contract', 'STT/TTS registry/SDK mock/configuration/timeouts/capacity/errors/audio/secrets', 'npm.cmd run check:ai-interviewer:speech -w @hr/server', api, ts('src/aiInterviewer/speechProviders.check.ts')],
  ['synthetic-e2e', 'Phase 5.6 combined authenticated API/synthetic audio/durable answer/follow-up/interruption/evaluation/report acceptance', 'node --conditions=development --import tsx docs/ai-interviewer/phase-5.6/synthetic.check.ts', root, ts('docs/ai-interviewer/phase-5.6/synthetic.check.ts'), '55442'],
  ['operations', 'Phase 5.5 proxy/abuse/configuration/readiness/headers/secrets/shutdown', 'node --conditions=development --import tsx src/aiInterviewer/operations.check.ts', api, ts('src/aiInterviewer/operations.check.ts'), '8797,8798'],
  ['operations-db', 'Phase 5.5 abuse/audit/authorization/shutdown/restart with PostgreSQL', 'node --conditions=development --import tsx src/aiInterviewer/operations.persistence.check.ts', api, ts('src/aiInterviewer/operations.persistence.check.ts'), '55442'],
  ['provider-gate', 'Phase 5.5 synthetic provider ingress/STT/TTS/interruption/reconnect/security', 'node --conditions=development --import tsx src/aiInterviewer/delivery.check.ts', api, ts('src/aiInterviewer/delivery.check.ts'), '55442'],
  ['execution-bounds', 'Phase 5.5 asynchronous bounds/cancellation/physical admission/late settlement', 'node --conditions=development --import tsx src/aiInterviewer/execution.check.ts', api, ts('src/aiInterviewer/execution.check.ts')],
  ['runtime-jobs', 'Phase 5.5 PostgreSQL fairness/restart/fencing/frozen input/security', 'node --conditions=development --import tsx src/aiInterviewer/runtime.check.ts', api, ts('src/aiInterviewer/runtime.check.ts'), '55442'],
  ['answer-ui', 'Phase 5.2 browser recovery/state/refresh/uncertainty/security', 'node --conditions=development --import tsx scripts/checkAiInterviewAnswerRecovery.mjs', api, ['--conditions=development','--import','tsx','scripts/checkAiInterviewAnswerRecovery.mjs']],
  ['answer-db', 'Phase 5.2 atomic commit/rollback/two-tab/restart/receipt/security', 'node --conditions=development --import tsx src/aiInterviewer/answer.check.ts', api, ts('src/aiInterviewer/answer.check.ts'), '55442'],
  ['engine', 'engine/timer/follow-up/clarification/evidence', 'npm.cmd run check:ai-interviewer -w @hr/server', api, ts('src/aiInterviewer/engine.check.ts')],
  ['scenario', 'synthetic lifecycle demonstration', 'npm.cmd run demo:ai-interviewer -w @hr/server', api, ts('src/aiInterviewer/scenario.ts')],
  ['persistence', 'PostgreSQL/session/invite/RBAC/idempotency/recovery/rollback', 'npm.cmd run check:ai-interviewer:persistence -w @hr/server', api, ts('src/aiInterviewer/persistence.check.ts'), '55442'],
  ['report', 'evaluation/frozen input/hash/evidence/retry/worker fencing', 'npm.cmd run check:ai-interviewer:report -w @hr/server', api, ts('src/aiInterviewer/report.check.ts'), '55442'],
  ['ui', 'candidate cache/replay/conflicts/session expiry/timer', 'npm.cmd run check:ai-interviewer:ui -w @hr/server', api, ['--conditions=development', '--import', 'tsx', 'scripts/checkAiInterviewUi.mjs']],
  ['mcp', 'MCP session lifecycle/RBAC/action checks', 'node --conditions=development --import tsx src/mcp/authorization.security.check.ts', api, ts('src/mcp/authorization.security.check.ts')],
  ['permissions', 'capability registry and route role policy', 'npm.cmd run check:permissions -w @hr/server', api, ts('src/permissions.check.ts')],
  ['gate', 'Copilot intent/action authorization independent of model', 'npm.cmd run check:gate -w @hr/server', api, ts('src/copilot/gate.check.ts')],
  ['plans', 'HTTP/shared plans/RBAC/scope/confirmation', 'npm.cmd run check:plans -w @hr/server', api, ts('src/copilot/validatePlan.check.ts')],
  ['report-security', 'existing employee report resource scope', 'node --conditions=development --import tsx src/reports/build.security.check.ts', api, ts('src/reports/build.security.check.ts')],
  ['voice', 'mock voice session/turn/confirmation guards', 'npm.cmd run check:voice -w @hr/server', api, ts('src/voice/session.check.ts')],
  ['local-voice-api', 'local voice adapter/ownership/no cloud fallback (mock)', 'npm.cmd run check:voice:local -w @hr/server [component 1/4]', api, ts('src/voice/local.check.ts')],
  ['local-voice-audio', 'audio/VAD/device cleanup (in-memory browser API doubles)', 'npm.cmd run check:voice:local -w @hr/server [component 2/4]', api, ['scripts/checkLocalVoiceBrowser.mjs']],
  ['local-voice-turn', 'local voice turn/cancellation/confirmation UI (hook harness)', 'npm.cmd run check:voice:local -w @hr/server [component 3/4]', api, ['scripts/checkLocalVoiceTurn.mjs']],
  ['local-voice-queue', 'bounded queue/admission/no hidden retry', 'npm.cmd run check:voice:local -w @hr/server [component 4/4]', api, ['scripts/checkLocalVoiceQueue.mjs']],
  ['scorecard', 'frozen criteria/weight arithmetic regressions', 'npm.cmd run check:scorecard -w @hr/server', api, ts('src/ai/scorecard.check.ts')],
  ['structured-provider', 'malformed/unavailable model responses using offline mocks', 'node --conditions=development --import tsx src/ai/structuredProvider.check.ts', api, ts('src/ai/structuredProvider.check.ts')],
  ['typechecks', 'contracts/API/web TypeScript and web lint', 'npm.cmd run check', root, [npm, 'run', 'check']],
  ['contracts-build', 'production contracts emission', 'npm.cmd run build -w @hr/shared', root, [npm, 'run', 'build', '-w', '@hr/shared']],
  ['api-build', 'production API emission and compiled migration/data copy', 'npm.cmd run build -w @hr/server', root, [npm, 'run', 'build', '-w', '@hr/server']],
  ['web-build', 'production web build with mock flag explicitly true', 'npm.cmd run build -w hr-app', root, [npm, 'run', 'build', '-w', 'hr-app']],
  ['secret-scan', 'Phase 5.5 frontend/bundle secret exclusion with isolated synthetic canaries', 'node scripts/checkInterviewSecrets.mjs', api, ['scripts/checkInterviewSecrets.mjs']],
  ['secret-canary', 'Frontend/build scan for existing and new dedicated speech credential canaries', 'node docs/ai-interviewer/stt-tts-provider-layer/secret-check.mjs', root, ['docs/ai-interviewer/stt-tts-provider-layer/secret-check.mjs']],
  ['browser3', 'real Chrome + disposable PostgreSQL Phase 3 E2E', 'npm.cmd run check:ai-interviewer:browser -w @hr/server', api, ['scripts/checkAiInterviewBrowser.mjs'], '55442,5179,5180,8793,9333'],
  ['browser4', 'real Chrome Phase 3 lifecycle + Phase 4 HR report cases', 'npm.cmd run check:ai-interviewer:report:browser -w @hr/server', api, ['scripts/checkAiInterviewReportBrowser.mjs'], '55442,5179,5180,8793,9333'],
  ['answer-browser', 'Phase 5.2 real Chrome recovery/refresh/network/two-tab cases plus unchanged Phase 3', 'node scripts/checkAiInterviewAnswerBrowser.mjs', api, ['scripts/checkAiInterviewAnswerBrowser.mjs'], '55442,5179,5180,8793,9333'],
  ['migrations', 'unaltered full migration chain + rerun idempotency', 'node docs/ai-interviewer/stt-tts-provider-layer/migrations.mjs', root, [resolve(here, 'migrations.mjs')], '55442'],
]
const runId = process.argv[2]
if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error('Usage: node run.mjs RUN_ID init|all|SUITE|integrity|cleanup')
const operation = process.argv[3] || 'all', output = resolve(here, 'runs', runId), temp = resolve(root, '.local-dev/speechlayer-temp', runId)
mkdirSync(output, { recursive: true }); mkdirSync(temp, { recursive: true })
const slash = p => relative(root, p).replaceAll('\\','/')
if (operation === 'init') {
  if (existsSync(resolve(output, 'source-before.json'))) throw Error('Run already initialized; use a new RUN_ID')
  writeJson(resolve(output, 'source-before.json'), manifest())
  writeJson(resolve(output, 'protected-before.json'), manifest('protected'))
  writeJson(resolve(output, 'inventory.json'), definitions.map(([id, protection, command, cwd, args, ports]) => ({ id, protection, command, cwd:slash(cwd), actualExecutable:'node', actualArguments:args.map(a=>a.startsWith(root)?slash(a):a), allowedLoopbackPorts:ports||'', entryExists:existsSync(resolve(cwd,args.at(-1))) || id==='typechecks' || id==='web-build' })))
  writeJson(resolve(output, 'environment.json'), { recordedAtUtc: new Date().toISOString(), displayTimezone:'Asia/Riyadh', node:process.version,
    npm:execFileSync(process.execPath, [npm, '--version'], { encoding:'utf8', windowsHide:true }).trim(), platform:process.platform, architecture:process.arch,
    chromeVersion:process.platform==='win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"(Get-Item -LiteralPath 'C:/Program Files/Google/Chrome/Application/chrome.exe').VersionInfo.ProductVersion"],{encoding:'utf8',windowsHide:true}).trim() : 'unavailable',
    gitMetadataPresent:existsSync(resolve(root,'.git')), testMode:'development/offline mocks; browser additionally probes production fail-closed policy',
    environmentPolicy:'Child environment allowlisted; no retained .env loaded; no API/provider credentials inherited; synthetic local database and signing configuration only',
    networkPolicy:'Node preload permits only listed loopback ports; tests add their own guards; Chrome request interception blocks nonlocal page requests; native Chrome background traffic not independently packet-captured',
    artifactPolicy:'Older evidence writes redirected; fixture credentials and screenshots suppressed; browser profile temporary and removed after runs' })
  console.log('Baseline initialized: ' + slash(output)); process.exit(0)
}
if (!existsSync(resolve(output,'source-before.json'))) throw Error('Initialize first')
if (operation === 'integrity') {
  const results = {}
  for (const [kind, label] of [['source','source'], ['protected','protected']]) {
    const after=manifest(kind), before=JSON.parse(readFileSync(resolve(output,`${label}-before.json`),'utf8'))
    writeJson(resolve(output,`${label}-after.json`),after)
    results[label]={unchanged:JSON.stringify(before)===JSON.stringify(after),fileCount:after.fileCount,filesDigest:after.filesDigest,
      manifestSHA256:sha256(readFileSync(resolve(output,`${label}-before.json`)))}
  }
  writeJson(resolve(output,'integrity.json'),results); console.log(JSON.stringify(results)); if(Object.values(results).some(r=>!r.unchanged))process.exitCode=1
  process.exit(process.exitCode||0)
}
if(operation==='cleanup') {
  const allowed=resolve(root,'.local-dev/speechlayer-temp')
  if(!temp.startsWith(allowed+'\\') && !temp.startsWith(allowed+'/'))throw Error('Unsafe cleanup path')
  rmSync(temp,{recursive:true,force:true});console.log('Removed only this run temporary browser profiles');process.exit(0)
}
const selected=operation==='all'?definitions:definitions.filter(d=>d[0]===operation)
if(!selected.length)throw Error('Unknown suite')
for(const [id,protection,command,cwd,args,ports] of selected) {
  const resultPath=resolve(output,`${id}.json`)
  if(existsSync(resultPath))throw Error('Result exists; use a new run id for reruns')
  const recordedInventory=JSON.parse(readFileSync(resolve(output,'inventory.json'),'utf8'))
  if(!recordedInventory.some(item=>item.id===id))writeJson(resolve(output,`${id}-inventory.json`),{id,protection,command,cwd:slash(cwd),actualExecutable:'node',actualArguments:args,allowedLoopbackPorts:ports||''})
  const env={}
  for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'])if(process.env[name])env[name]=process.env[name]
  Object.assign(env,{NODE_ENV:'development',DATABASE_URL:'postgresql://phase2_test@127.0.0.1:55442/speechlayer_unused',SESSION_SECRET:randomBytes(32).toString('hex'),
    AI_INTERVIEW_TEST_DATABASE_URL:'postgresql://phase2_test@127.0.0.1:55442/postgres',DOTENV_CONFIG_PATH:resolve(temp,'no-dotenv-file'),
    AI_SHARE_DATA:'false',VOICE_ENABLED:'false',VOICE_SHARE_AUDIO:'false',AI_INTERVIEW_DEV_MOCK:'false',VOICE_DEV_MOCK:'false',
    VITE_AI_INTERVIEW_DEV_MOCK:'true',VITE_API_TARGET:'http://127.0.0.1:8793',
    SPEECH_LAYER_OUTPUT:output,SPEECH_LAYER_TEMP:temp,SPEECH_LAYER_SUITE:id,SPEECH_LAYER_PORTS:ports||'',NODE_OPTIONS:'--require '+JSON.stringify(resolve(here,'guard.cjs'))})
  env.PHASE56_OUTPUT=output // Accepted Phase 5.6 synthetic check output stays in this NEW run.
  env.PHASE55_OUTPUT=output // Existing operations checks write only into this NEW phase run.
  env.PHASE52_OUTPUT=output // Existing Phase 5.2 tests write only into the NEW run.
  env.PHASE53_OUTPUT=output // Existing Phase 5.3 tests also write only into the NEW run.
  env.PHASE54_OUTPUT=output // Existing Phase 5.4 tests cannot write accepted evidence.
  if(id==='web-build')Object.assign(env,{OPENAI_API_KEY:'phase56-synthetic-bundle-canary-openai-not-a-key',ANTHROPIC_API_KEY:'phase56-synthetic-bundle-canary-anthropic-not-a-key',AI_INTERVIEW_SPEECH_API_KEY:'speech-layer-synthetic-bundle-canary-not-a-key'})
  const startedAt=new Date().toISOString(); console.log('RUN '+id)
  const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let log=''
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log+=b.toString()})
  const exitCode=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done)})
  // Do not retain exception source maps/data URLs or accidentally emitted credential fields.
  const safe=log.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[inline module omitted]')
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database URL omitted]')
    .replace(/([?&]token=)[^\s'"<>]+/g,'$1[redacted]')
    .replace(/\b[A-Za-z0-9_-]{43}\b/g,'[credential-shaped value omitted]')
    .replace(/(password|session_secret|api_key|clientSecret|credential)\s*[:=]\s*['"]?[^\s,'"}]+/gi,'$1=[redacted]')
  const { writeFileSync }=await import('node:fs');writeFileSync(resolve(output,`${id}.log`),safe)
  const network=readdirSync(resolve(output,'network')).filter(f=>f.startsWith(id+'-')).map(f=>JSON.parse(readFileSync(resolve(output,'network',f),'utf8')))
  const blocked=network.reduce((n,r)=>n+r.blockedExternalAttempts,0)
  const status=exitCode===0&&blocked===0?'PASS':'FAIL'
  const result={id,protection,command,startedAt,finishedAt:new Date().toISOString(),exitCode,status,blockedExternalAttempts:blocked,networkProcessCount:network.length,
    outputLog:`${id}.log`,passLines:(safe.match(/^\s*(?:PASS\b|ok\s|✓)/gm)||[]).length}
  if(id==='migrations' && existsSync(resolve(output,'migrations.json')))result.status=JSON.parse(readFileSync(resolve(output,'migrations.json'),'utf8')).status
  // migrations.mjs owns migrations.json; keep runner metadata separately.
  writeJson(id==='migrations'?resolve(output,'migrations-run.json'):resultPath,result)
  console.log(`${result.status} ${id}; exit=${exitCode}; passLines=${result.passLines}; blockedExternal=${blocked}`)
  console.log(safe.split(/\r?\n/).filter(Boolean).slice(-3).join('\n'))
  if(result.status==='FAIL'){console.error('STOP: baseline failure; investigate without changing existing tests.');process.exitCode=1;break}
}
