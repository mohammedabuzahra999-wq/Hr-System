import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import pg from 'pg'
import { here } from './state.mjs'
import { root, writeJson } from './manifest.mjs'

const run=process.argv[2]
if(!run||!/^[a-zA-Z0-9_-]+$/.test(run))throw Error('Invalid run')
const result={status:'FAIL',startedAtUtc:new Date().toISOString(),commands:[],removedProfiles:[],databasePolicy:'Read-only resource inspection; no database dropped during finalization'}
const client=new pg.Client({host:'127.0.0.1',port:55442,user:'phase2_test',database:'postgres'})
await client.connect()
try {
  result.activeOtherClientSessions=Number((await client.query("SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()")).rows[0].count)
  const baseline=Date.parse(JSON.parse(readFileSync(resolve(here,'runs/baseline-20261105/environment.json'),'utf8')).recordedAtUtc)
  const databases=(await client.query("SELECT oid,datname FROM pg_database WHERE datname ~ '^(ai_interview_candidateaudio_|ai_interview_audio_|ai_interview_phase3_|ai_interview_phase4_)'")).rows
  result.preexistingTestDatabasesLeftUntouched=[];result.ownDisposableDatabasesRemaining=0
  for(const row of databases){
    const stats=statSync(resolve(root,'.local-dev/ai-interviewer-postgres/data/base',String(row.oid)))
    if(/^ai_interview_phase[34]_/.test(row.datname)&&stats.birthtimeMs<baseline&&stats.mtimeMs<baseline)result.preexistingTestDatabasesLeftUntouched.push({database:row.datname,createdAtUtc:stats.birthtime.toISOString(),lastModifiedAtUtc:stats.mtime.toISOString()})
    else result.ownDisposableDatabasesRemaining++
  }
} finally {await client.end()}
if(result.activeOtherClientSessions||result.ownDisposableDatabasesRemaining)throw Error('Resources still active; refusing cleanup')
const temporary=resolve(root,'.local-dev/candidateaudio-temp')
for(const name of existsSync(temporary)?readdirSync(temporary):[]){
  if(!/^(baseline-20261105|development-\d+|final-20261105|browser-recheck-20261105)$/.test(name))throw Error('Unexpected temporary directory; inspect before cleanup')
  const target=resolve(temporary,name)
  if(!target.startsWith(temporary+'\\')&&!target.startsWith(temporary+'/'))throw Error('Unsafe target')
  const args=['docs/ai-interviewer/candidate-audio-transport/run.mjs',name,'cleanup'],child=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,encoding:'utf8'})
  result.commands.push({command:'node '+args.join(' '),exitCode:child.status,target:relative(root,target).replaceAll('\\','/')})
  if(child.status!==0)throw Error('Profile cleanup failed')
  result.removedProfiles.push(name)
}
const ctl=resolve(root,'.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe'),data=resolve(root,'.local-dev/ai-interviewer-postgres/data')
if(!ctl.startsWith(root+'\\')||!data.startsWith(root+'\\'))throw Error('Unexpected PostgreSQL scope')
for(const args of [['-D',data,'-m','fast','-w','-t','15','stop'],['-D',data,'status']]){
  const child=spawnSync(ctl,args,{windowsHide:true,encoding:'utf8'}),expected=args.at(-1)==='status'?3:0
  result.commands.push({command:'.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe '+args.map(a=>a===data?'.local-dev/ai-interviewer-postgres/data':a).join(' '),exitCode:child.status,expectedExitCode:expected})
  if(child.status!==expected)throw Error('Unexpected local test cluster state')
}
result.localTestClusterStopped=true
result.temporaryRunDirectoriesRemaining=existsSync(temporary)?readdirSync(temporary).length:0
result.finishedAtUtc=new Date().toISOString();result.status=result.temporaryRunDirectoriesRemaining?'FAIL':'PASS'
writeJson(resolve(here,'runs',run,'resource-cleanup.json'),result)
console.log(JSON.stringify(result))
if(result.status!=='PASS')process.exitCode=1
