import assert from 'node:assert/strict'
import { randomBytes,randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { aiInterviewDimensionSchema,playbackResultSchema } from '@hr/shared'
import { CandidateTtsDelivery } from 'file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/playbackTransport.js'
import { deferred,nextTurn } from 'file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/runtimeTestSupport.js'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
if(process.argv.includes('--tts-config-child')){const {interviewSpeechProviders}=await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/speechRuntime.js');console.log(JSON.stringify(interviewSpeechProviders.readiness()));interviewSpeechProviders.close();process.exit(0)}
const connection = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!connection || new URL(connection).hostname !== '127.0.0.1' || new URL(connection).port !== '55442') throw Error('Isolated local test database required')
const url = new URL(connection), name = 'ai_interview_tts_' + randomUUID().replaceAll('-', ''), admin = new pg.Pool({connectionString: connection, max: 1})
let pool: pg.Pool | undefined, closeApp: (() => Promise<void>) | undefined, created = false, checks = 0
const matrix: Record<string, unknown>[] = [], savedFetch = globalThis.fetch
let external = 0
const transports:CandidateTtsDelivery[]=[]
globalThis.fetch = async () => {external++; throw Error('No external network')}
function wav(ms = 1000, value = 1) {const b = Buffer.alloc(44 + ms * 32); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40); b.writeInt16LE(value, 44); return b}
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true; url.pathname = '/' + name
  process.env.DATABASE_URL = url.toString(); process.env.SESSION_SECRET = randomBytes(32).toString('hex'); process.env.NODE_ENV = 'development'
  pool = new pg.Pool({connectionString: url.toString(), max: 12})
  const schema = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/db/schema.js'), {users, candidates, jobOpenings, applications, jobDescriptions, aiInterviewEvents} = schema
  for (const table of [users, candidates, jobOpenings, applications, jobDescriptions]) {
    const c = getTableConfig(table); await pool.query(`CREATE TABLE "${c.name}" (${c.columns.map(col => {let t = col.getSQLType(); if (!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(t)) t = 'text'; return `"${col.name}" ${t}${col.primary ? ' PRIMARY KEY' : ''}`}).join(',')})`)
  }
  await pool.query(readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql', "file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/playbackTransport.check.ts"), 'utf8'))
  const database = drizzle(pool, {schema}), {InterviewService} = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/service.js'), {InterviewRepository} = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/repository.js'), {FakeClock} = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/clock.js')
  const {phase1Plan} = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/fixtures.js'), {createInterviewRoutes, CANDIDATE_COOKIE} = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/routes.js'), {resetRateLimits} = await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/rateLimit.js')
  closeApp = (await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/db/client.js')).closeDb
  const hrId = randomUUID(), hr = {kind: 'staff' as const, userId: hrId}, system = {kind: 'system' as const}
  await database.insert(users).values({id: hrId, role: 'hr', isActive: true, email: 'audio@synthetic.invalid', employeeNumber: 'AUDIO', fullNameEn: 'Synthetic', fullNameAr: 'Synthetic'})
  async function fresh(timeoutMs = 15000, audioV2 = false) {
    const clock = new FakeClock(), service = new InterviewService(new InterviewRepository(database), clock, 'audio-owner-a'), openingId = randomUUID(), candidateId = randomUUID(), applicationId = randomUUID()
    const L = (s: string) => ({en: s, ar: s}), list = (s: string[]) => ({en: s, ar: s})
    await database.insert(jobOpenings).values({id: openingId, openedOn: '2026-11-05', titleEn: 'Synthetic', titleAr: 'Synthetic', departmentEn: 'Test', departmentAr: 'Test', status: 'open'})
    await database.insert(candidates).values({id: candidateId, fullName: 'Synthetic', email: 'audio@candidate.invalid'})
    await database.insert(applications).values({id: applicationId, candidateId, openingId, status: 'new', source: 'manual'})
    await database.insert(jobDescriptions).values({id: randomUUID(), openingId, titleEn: 'Synthetic', titleAr: 'Synthetic', status: 'approved', approvedAt: new Date(clock.now()), content: {title: L('Synthetic'), summary: L(''), responsibilities: list([]), requiredQualifications: list([]), requiredSkills: list(['rag', 'problem-solving']), preferredSkills: list([]), softSkills: list([]), experience: L(''), education: L(''), workingConditions: null}, scorecard: {weights: [{key: 'rag', weight: 60}, {key: 'problem-solving', weight: 40}]}})
    const plan = structuredClone(phase1Plan); plan.questions = plan.questions.slice(0, 1)
    const r = await service.create(hr, applicationId, {commandId: randomUUID(), plan, rubric: {version: 'audio-test', dimensions: aiInterviewDimensionSchema.options.map(dimension => ({dimension, anchors: ['None','Basic','Partial','Applied','Explained']}))}}), id = r.interviewId
    const row = () => service.load(system, id)
    await service.ready(hr, id, {commandId: randomUUID(), expectedVersion: (await row()).version})
    const invite = await service.invite(hr, id, {commandId: randomUUID(), expectedVersion: (await row()).version}), session = await service.exchange(invite.token!)
    const principal = {kind: 'candidate' as const, credential: session.credential}, cookie = `${CANDIDATE_COOKIE}=${session.credential}`
    await service.execute(principal, id, (await row()).version, {type: 'ACCEPT_CONSENT', policyVersion: audioV2 ? 'ai-interview-v2-audio' : 'ai-interview-v1', commandId: randomUUID()})
    const {InterviewDeliveryGate}=await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/delivery.js')
    const gate=audioV2?new InterviewDeliveryGate(service,{mode:'synthetic',production:false},{kind:'synthetic',trust:{stt:true,connection:true,idempotentPlayback:true},health:async()=>({stt:true,tts:true,connection:true}),transcribe:async()=>({text:'Synthetic',uncertain:false}),synthesize:async()=>({bytes:wav(),mimeType:'audio/wav'}),play:async()=>({accepted:true}),stop:async()=>({stopped:true})}):undefined
    const binding=gate?(await gate.checkReadiness(),await gate.bind(principal,id)):undefined
    if(gate&&binding){await binding.observe({...((await binding.context()).context),type:'CONNECTED'});await gate.start(binding)}else await service.execute(system,id,(await row()).version,{type:'START_INTERVIEW',commandId:randomUUID()})
    const behavior={calls:0,work:async():Promise<unknown>=>({bytes:wav(),mimeType:'audio/wav'})}
    const transport=new CandidateTtsDelivery(service,{synthesize:async()=>{behavior.calls++;return behavior.work() as Promise<{bytes:Uint8Array;mimeType:'audio/wav'}>}},timeoutMs);transports.push(transport)
    const routes=createInterviewRoutes(service,{origins:['http://localhost:5173'],secure:true,production:false,developmentMock:true,playback:transport}),app=new Hono().route('/api/ai-interview',routes.candidate)
    const request=(path:string,body:unknown,useCookie=cookie,origin:string|null='http://localhost:5173')=>app.request('/api/ai-interview/playback/'+path,{method:'POST',headers:{'content-type':'application/json',...(useCookie?{cookie:useCookie}:{}),...(origin?{origin}:{})},body:JSON.stringify(body)})
    const current=await row(),scope={interviewId:id,sessionVersion:current.candidateSessionVersion,playbackId:current.snapshot.playback!.id,questionId:current.snapshot.currentQuestion?.id??null,turnId:current.snapshot.draft?.turnId??null},prepare={...scope,requestId:randomUUID(),expectedVersion:current.version},documentId=randomUUID()
    return {id,service,clock,row,principal,cookie,app,request,scope,prepare,documentId,transport,behavior,gate,binding}
  }

  const f=await fresh(),documentId=randomUUID()
  const check=async(label:string,work:()=>Promise<void>)=>{await work();checks++;matrix.push({scenario:label,result:'PASS'});console.log('PASS '+label)}
  async function deliver(){const r=await f.row(),scope={interviewId:f.id,sessionVersion:r.candidateSessionVersion,playbackId:r.snapshot.playback!.id,questionId:r.snapshot.currentQuestion?.id??null,turnId:r.snapshot.draft?.turnId??null};const ready=await f.transport.prepare(f.principal,{...scope,requestId:randomUUID(),expectedVersion:r.version});assert.equal(ready.status,'READY');const body={...scope,documentId,generationId:ready.generationId!};assert((await f.transport.audio(f.principal,body)).length>44);await f.transport.action(f.principal,'start',body);f.clock.advance(1001);return f.transport.action(f.principal,'end',body)}
  await check('TTS intro completion selects the first frozen question without an answer timer',async()=>{await deliver();const r=await f.row();assert.equal(r.snapshot.playback!.kind,'QUESTION');assert.equal(r.snapshot.timer,null)})
  await check('TTS question completion starts the authoritative listening timer',async()=>{await deliver();assert.equal((await f.row()).snapshot.phase,'LISTENING');assert((await f.row()).snapshot.timer)})
  await check('existing atomic answer path and mock decision progress into closing',async()=>{for(let i=0;i<5&&(await f.row()).snapshot.playback?.kind!=='CLOSING';i++){const r=await f.row();assert.equal(r.snapshot.phase,'LISTENING');const answer=await f.service.submitAnswer(f.principal,{interviewId:f.id,commandId:randomUUID(),sessionVersion:r.candidateSessionVersion,expectedVersion:r.version,questionId:r.snapshot.currentQuestion!.id,turnId:r.snapshot.draft!.turnId,text:'I used RAG and measured recall@5 on labeled queries, compared hybrid alternatives and reviewed incorrect retrievals.'});assert.equal(answer.outcome,'COMMITTED');await f.service.execute(system,f.id,(await f.row()).version,{type:'PROCESS_ANSWER',commandId:randomUUID()});if((await f.row()).snapshot.playback?.kind==='QUESTION')await deliver()}assert.equal((await f.row()).snapshot.playback!.kind,'CLOSING')})
  await check('TTS closing atomically completes interview and creates existing evaluation job',async()=>{const result=await deliver();assert.equal(result.state.status,'COMPLETED');const jobs=await database.select().from(schema.aiInterviewEvaluations).where(eq(schema.aiInterviewEvaluations.interviewId,f.id));assert.equal(jobs.length,1);assert.equal(jobs[0]!.status,'PENDING')})
  const {InterviewReportService}=await import('file:///C:/Users/PC-LAB/Downloads/hr-app-step2/services/hr-api/src/aiInterviewer/reportService.js')
  const reports=new InterviewReportService(f.service)
  await check('unchanged mock report independently verifies TTS-completed answer/evidence integrity',async()=>{const r=await f.row(),job=await reports.request(hr,f.id,r.applicationId,{operation:'RUN',commandId:randomUUID(),expectedVersion:r.version});await reports.runJob(f.id,job.reportVersion);const report=await reports.get(hr,f.id,r.applicationId);assert.equal(report.evaluation.status,'COMPLETED');assert(report.evaluation.report);await assert.rejects(reports.get(f.principal,f.id,r.applicationId))})
  await check('zero real provider/model calls',async()=>assert.equal(external,0))
  writeFileSync(resolve(process.env.TTS_PLAYBACK_OUTPUT!,'tts-closing-matrix.json'),JSON.stringify({status:'PASS',checks,externalAttempts:external,generations:f.behavior.calls,answers:(await f.row()).snapshot.answers.length,matrix},null,2)+'\n')
  console.log(checks+'/'+checks+' TTS closing/regression checks passed; external calls=0')
}finally{await Promise.allSettled(transports.map(t=>t.close()));await closeApp?.();await pool?.end();if(created)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');await admin.end();globalThis.fetch=savedFetch}
