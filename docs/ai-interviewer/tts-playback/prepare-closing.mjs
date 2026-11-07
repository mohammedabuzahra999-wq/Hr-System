import { readFileSync,writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { root } from './manifest.mjs'
const sourceUrl=pathToFileURL(resolve(root,'services/hr-api/src/aiInterviewer/playbackTransport.check.ts')).href
let source=readFileSync(new URL(sourceUrl),'utf8').split('  type F=')[0]
source=source.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,sourceUrl).href}'`).replace(/import\('(\.[^']+)'\)/g,(_,p)=>`import('${new URL(p,sourceUrl).href}')`).replaceAll('import.meta.url',JSON.stringify(sourceUrl))
source+=`
  const f=await fresh(),documentId=randomUUID()
  const check=async(label:string,work:()=>Promise<void>)=>{await work();checks++;matrix.push({scenario:label,result:'PASS'});console.log('PASS '+label)}
  async function deliver(){const r=await f.row(),scope={interviewId:f.id,sessionVersion:r.candidateSessionVersion,playbackId:r.snapshot.playback!.id,questionId:r.snapshot.currentQuestion?.id??null,turnId:r.snapshot.draft?.turnId??null};const ready=await f.transport.prepare(f.principal,{...scope,requestId:randomUUID(),expectedVersion:r.version});assert.equal(ready.status,'READY');const body={...scope,documentId,generationId:ready.generationId!};assert((await f.transport.audio(f.principal,body)).length>44);await f.transport.action(f.principal,'start',body);f.clock.advance(1001);return f.transport.action(f.principal,'end',body)}
  await check('TTS intro completion selects the first frozen question without an answer timer',async()=>{await deliver();const r=await f.row();assert.equal(r.snapshot.playback!.kind,'QUESTION');assert.equal(r.snapshot.timer,null)})
  await check('TTS question completion starts the authoritative listening timer',async()=>{await deliver();assert.equal((await f.row()).snapshot.phase,'LISTENING');assert((await f.row()).snapshot.timer)})
  await check('existing atomic answer path and mock decision progress into closing',async()=>{for(let i=0;i<5&&(await f.row()).snapshot.playback?.kind!=='CLOSING';i++){const r=await f.row();assert.equal(r.snapshot.phase,'LISTENING');const answer=await f.service.submitAnswer(f.principal,{interviewId:f.id,commandId:randomUUID(),sessionVersion:r.candidateSessionVersion,expectedVersion:r.version,questionId:r.snapshot.currentQuestion!.id,turnId:r.snapshot.draft!.turnId,text:'I used RAG and measured recall@5 on labeled queries, compared hybrid alternatives and reviewed incorrect retrievals.'});assert.equal(answer.outcome,'COMMITTED');await f.service.execute(system,f.id,(await f.row()).version,{type:'PROCESS_ANSWER',commandId:randomUUID()});if((await f.row()).snapshot.playback?.kind==='QUESTION')await deliver()}assert.equal((await f.row()).snapshot.playback!.kind,'CLOSING')})
  await check('TTS closing atomically completes interview and creates existing evaluation job',async()=>{const result=await deliver();assert.equal(result.state.status,'COMPLETED');const jobs=await database.select().from(schema.aiInterviewEvaluations).where(eq(schema.aiInterviewEvaluations.interviewId,f.id));assert.equal(jobs.length,1);assert.equal(jobs[0]!.status,'PENDING')})
  const {InterviewReportService}=await import('${new URL('./reportService.js',sourceUrl).href}')
  const reports=new InterviewReportService(f.service)
  await check('unchanged mock report independently verifies TTS-completed answer/evidence integrity',async()=>{const r=await f.row(),job=await reports.request(hr,f.id,r.applicationId,{operation:'RUN',commandId:randomUUID(),expectedVersion:r.version});await reports.runJob(f.id,job.reportVersion);const report=await reports.get(hr,f.id,r.applicationId);assert.equal(report.evaluation.status,'COMPLETED');assert(report.evaluation.report);await assert.rejects(reports.get(f.principal,f.id,r.applicationId))})
  await check('zero real provider/model calls',async()=>assert.equal(external,0))
  writeFileSync(resolve(process.env.TTS_PLAYBACK_OUTPUT!,'tts-closing-matrix.json'),JSON.stringify({status:'PASS',checks,externalAttempts:external,generations:f.behavior.calls,answers:(await f.row()).snapshot.answers.length,matrix},null,2)+'\\n')
  console.log(checks+'/'+checks+' TTS closing/regression checks passed; external calls=0')
}finally{await Promise.allSettled(transports.map(t=>t.close()));await closeApp?.();await pool?.end();if(created)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');await admin.end();globalThis.fetch=savedFetch}
`
writeFileSync(new URL('./closing.check.ts',import.meta.url),source)
