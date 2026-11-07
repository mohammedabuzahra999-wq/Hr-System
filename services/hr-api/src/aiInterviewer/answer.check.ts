import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import net from 'node:net'
import { syncBuiltinESMExports } from 'node:module'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { aiInterviewDimensionSchema, type AiInterviewCommand, type SubmitAiInterviewAnswer } from '@hr/shared'

const connection = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!connection) throw Error('A local AI_INTERVIEW_TEST_DATABASE_URL is required')
const url = new URL(connection)
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Refusing a nonlocal test database')
const savedFetch = globalThis.fetch, savedConnect = net.Socket.prototype.connect
let external = 0
globalThis.fetch = () => { external++; throw Error('External network forbidden') }
net.Socket.prototype.connect = function(this: net.Socket, ...args: unknown[]) {
  const a = Array.isArray(args[0]) ? args[0] as unknown[] : args
  const o = typeof a[0] === 'object' ? a[0] as {host?:string;port?:number} : {port:a[0],host:a[1]}
  if (!['127.0.0.1','localhost','::1'].includes(String(o.host)) || Number(o.port) !== Number(url.port||5432)) { external++; throw Error('External socket forbidden') }
  return Reflect.apply(savedConnect,this,args)
} as typeof savedConnect
syncBuiltinESMExports()
const name = 'ai_interview_phase52_' + randomUUID().replaceAll('-','')
const admin = new pg.Pool({connectionString:connection,max:1})
let pool: pg.Pool|undefined, closeApp: (()=>Promise<void>)|undefined, created=false, checks=0
const matrix: Record<string,unknown>[]=[]
try {
  await admin.query(`CREATE DATABASE "${name}"`);created=true;url.pathname='/'+name
  process.env.DATABASE_URL=url.toString();process.env.SESSION_SECRET=randomBytes(32).toString('hex');process.env.NODE_ENV='development'
  pool=new pg.Pool({connectionString:url.toString(),max:12})
  const schema=await import('../db/schema.js')
  const {users,candidates,jobOpenings,applications,jobDescriptions,aiInterviewEvents}=schema
  // Same synthetic legacy-parent policy as Phases 2/4; full-chain pgvector blocker remains open.
  for(const table of [users,candidates,jobOpenings,applications,jobDescriptions]) {
    const c=getTableConfig(table)
    await pool.query(`CREATE TABLE "${c.name}" (${c.columns.map(col=>{
      let t=col.getSQLType();if(!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(t))t='text'
      return `"${col.name}" ${t}${col.primary?' PRIMARY KEY':''}`
    }).join(',')})`)
  }
  await pool.query(readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql',import.meta.url),'utf8'))
  const database=drizzle(pool,{schema})
  const {InterviewService}=await import('./service.js'),{InterviewRepository}=await import('./repository.js'),{FakeClock}=await import('./clock.js')
  const {phase1Plan,phase1Answers}=await import('./fixtures.js'),{createInterviewRoutes,CANDIDATE_COOKIE}=await import('./routes.js')
  closeApp=(await import('../db/client.js')).closeDb
  const hrId=randomUUID();await database.insert(users).values({id:hrId,role:'hr',isActive:true,email:'synthetic.hr@example.invalid',employeeNumber:'SYN',fullNameEn:'Synthetic',fullNameAr:'Synthetic'})
  const hr={kind:'staff' as const,userId:hrId},system={kind:'system' as const}
  const rubric={version:'synthetic-rubric-v1',dimensions:aiInterviewDimensionSchema.options.map(dimension=>({dimension,anchors:['Absent','Basic','Partial','Applied','Explained'] as [string,string,string,string,string]}))}
  const L=(s:string)=>({en:s,ar:s}),list=(s:string[])=>({en:s,ar:s})
  async function fresh() {
    const clock=new FakeClock(),service=new InterviewService(new InterviewRepository(database),clock,'owner-a')
    const openingId=randomUUID(),candidateId=randomUUID(),applicationId=randomUUID()
    await database.insert(jobOpenings).values({id:openingId,openedOn:'2026-11-01',titleEn:'Synthetic role',titleAr:'Synthetic role',departmentEn:'Test',departmentAr:'Test',status:'open'})
    await database.insert(candidates).values({id:candidateId,fullName:'Synthetic participant',email:'synthetic@example.invalid'})
    await database.insert(applications).values({id:applicationId,candidateId,openingId,status:'new',source:'manual'})
    await database.insert(jobDescriptions).values({id:randomUUID(),openingId,titleEn:'Synthetic role',titleAr:'Synthetic role',status:'approved',approvedAt:new Date(clock.now()),
      content:{title:L('Synthetic'),summary:L(''),responsibilities:list([]),requiredQualifications:list([]),requiredSkills:list(['rag','problem-solving']),preferredSkills:list([]),softSkills:list([]),experience:L(''),education:L(''),workingConditions:null},
      scorecard:{weights:[{key:'rag',weight:60},{key:'problem-solving',weight:40}]}})
    const r=await service.create(hr,applicationId,{commandId:randomUUID(),plan:phase1Plan,rubric}),id=r.interviewId
    await service.ready(hr,id,{commandId:randomUUID(),expectedVersion:r.version})
    const invitation=await service.invite(hr,id,{commandId:randomUUID(),expectedVersion:(await service.load(system,id)).version})
    const session=await service.exchange(invitation.token!),candidate={kind:'candidate' as const,credential:session.credential}
    const f={id,applicationId,clock,service,candidate,cookie:`${CANDIDATE_COOKIE}=${session.credential}`}
    await command(f,{type:'ACCEPT_CONSENT',policyVersion:'ai-interview-v1',commandId:randomUUID()},candidate)
    await command(f,{type:'START_INTERVIEW',commandId:randomUUID()},candidate)
    await deliver(f);await deliver(f)
    return f
  }
  type F=Awaited<ReturnType<typeof fresh>>
  async function row(f:F){return f.service.load(system,f.id)}
  async function command(f:Pick<F,'service'|'id'>,c:AiInterviewCommand|{type:'ACCEPT_CONSENT';policyVersion:'ai-interview-v1';commandId:string},p:typeof system|F['candidate']=system){return f.service.execute(p,f.id,(await f.service.load(system,f.id)).version,c)}
  async function deliver(f:Pick<F,'service'|'id'>){const p=(await f.service.load(system,f.id)).snapshot.playback!;await command(f,{type:'AI_PLAYBACK_STARTED',playbackId:p.id,commandId:randomUUID()});await command(f,{type:'AI_PLAYBACK_FINISHED',playbackId:p.id,commandId:randomUUID()})}
  async function request(f:F,text='I used RAG in an HR assistant.'):Promise<SubmitAiInterviewAnswer>{const r=await row(f);return {interviewId:f.id,commandId:randomUUID(),expectedVersion:r.version,sessionVersion:r.candidateSessionVersion,questionId:r.snapshot.currentQuestion!.id,turnId:r.snapshot.draft!.turnId,text}}
  async function inspect(f:F,b:SubmitAiInterviewAnswer,label:string){
    const r=await row(f),events=await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId,f.id))
    const value={scenario:label,version:r.version,status:r.snapshot.status,phase:r.snapshot.phase,answerCount:r.snapshot.answers.length,
      receiptCount:events.filter(e=>e.recordType==='COMMAND'&&e.commandId===b.commandId).length,finalizedEvents:events.filter(e=>e.eventType==='CANDIDATE_ANSWER_FINALIZED').length,
      followUpDecisions:events.filter(e=>e.eventType==='QUESTION_SELECTED'&&(e.payload as {question?:{kind?:string}}).question?.kind==='FOLLOW_UP').length,pendingEffects:r.pendingEffects.length}
    matrix.push(value);return value
  }
  async function check(label:string,fn:()=>Promise<void>){await fn();checks++;console.log('PASS '+label)}
  const router=(f:F)=>{const r=createInterviewRoutes(f.service,{origins:['http://localhost:5173'],secure:false,production:false,developmentMock:true});return new Hono().route('/api/ai-interview',r.candidate).route('/api/recruitment',r.staff)}
  const http=(f:F,action:string,b:unknown,cookie=f.cookie,origin='http://localhost:5173')=>router(f).request(`/api/ai-interview/answers/${action}`,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(b)})
  await check('atomic submit persists one finalized answer and one receipt before acknowledging',async()=>{const f=await fresh(),b=await request(f),r=await f.service.submitAnswer(f.candidate,b);assert.equal(r.outcome,'COMMITTED');assert.equal(r.duplicate,false);const s=await inspect(f,b,'normal ACK');assert.equal(s.answerCount,1);assert.equal(s.receiptCount,1);assert.equal(s.phase,'PROCESSING');assert.equal((await row(f)).snapshot.answers[0]!.text,b.text)})
  for(const point of ['final-event','receipt','snapshot'])await check(`failure at ${point} rolls back snapshot, answer, receipt, events and effects`,async()=>{
    const f=await fresh(),b=await request(f),before=await row(f)
    const target=point==='snapshot'?'ai_interviews':'ai_interview_events'
    const condition=point==='snapshot'?`NEW.id='${f.id}'`:point==='receipt'?`NEW.command_id='${b.commandId}' AND NEW.record_type='COMMAND'`:`NEW.interview_id='${f.id}' AND NEW.event_type='CANDIDATE_ANSWER_FINALIZED'`
    await pool!.query(`CREATE FUNCTION phase52_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`)
    await pool!.query(`CREATE TRIGGER phase52_fail BEFORE ${point==='snapshot'?'UPDATE':'INSERT'} ON ${target} FOR EACH ROW EXECUTE FUNCTION phase52_fail()`)
    try { const response=await http(f,'submit',b);assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'aiInterviewInternal',message:'aiInterviewInternal'}) }
    finally {await pool!.query(`DROP TRIGGER phase52_fail ON ${target}`);await pool!.query('DROP FUNCTION phase52_fail()')}
    const after=await row(f);assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.lastSequence,before.lastSequence);assert.deepEqual(after.pendingEffects,before.pendingEffects)
    const s=await inspect(f,b,`rollback ${point}`);assert.equal(s.answerCount,0);assert.equal(s.receiptCount,0);assert.equal(s.followUpDecisions,0)
    assert.equal((await f.service.answerStatus(f.candidate,b)).outcome,'OPEN')
    assert.equal((await f.service.submitAnswer(f.candidate,b)).outcome,'COMMITTED');assert.equal((await inspect(f,b,`same-identity retry ${point}`)).answerCount,1)
  })
  await check('20 concurrent identical submissions commit once and all acknowledge the same receipt',async()=>{const f=await fresh(),b=await request(f);const results=await Promise.all(Array.from({length:20},()=>f.service.submitAnswer(f.candidate,b)));assert.equal(results.filter(r=>!r.duplicate).length,1);assert(results.every(r=>r.outcome==='COMMITTED'));const s=await inspect(f,b,'same answer same identity concurrent');assert.equal(s.answerCount,1);assert.equal(s.receiptCount,1);assert.equal(s.finalizedEvents,1)})
  for(const conflicting of [false,true])await check(`two tabs ${conflicting?'conflicting answers':'same answer different identities'} finalize one answer`,async()=>{
    const f=await fresh(),a=await request(f),b={...a,commandId:randomUUID(),text:conflicting?'A conflicting synthetic answer':a.text}
    const results=await Promise.allSettled([f.service.submitAnswer(f.candidate,a),f.service.submitAnswer(f.candidate,b)])
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
    const loser=results[0]!.status==='rejected'?a:b,winner=loser===a?b:a
    assert.equal((await f.service.answerStatus(f.candidate,loser)).outcome,conflicting?'CONFLICT':'COMMITTED')
    const s=await inspect(f,loser,'two-tab losing submission');assert.equal(s.answerCount,1);assert.equal(s.receiptCount,0);assert.equal((await row(f)).snapshot.answers[0]!.text,winner.text)
  })
  await check('stale tab cannot overwrite a committed old turn after state advancement',async()=>{const f=await fresh(),a=await request(f),b={...a,commandId:randomUUID(),text:'Old tab replacement'};await f.service.submitAnswer(f.candidate,a);await command(f,{type:'PROCESS_ANSWER',commandId:`process:${a.turnId}`});await assert.rejects(f.service.submitAnswer(f.candidate,b),/interviewVersionConflict/);assert.equal((await f.service.answerStatus(f.candidate,b)).outcome,'CONFLICT');assert.equal((await inspect(f,b,'old question tab')).answerCount,1)})
  await check('duplicate PROCESS_ANSWER cannot duplicate evaluation, follow-up or durable playback effect',async()=>{const f=await fresh(),b=await request(f);await f.service.submitAnswer(f.candidate,b);const version=(await row(f)).version,c={type:'PROCESS_ANSWER' as const,commandId:`process:${b.turnId}`};await Promise.all([f.service.execute(system,f.id,version,c),f.service.execute(system,f.id,version,c)]);const s=await inspect(f,b,'duplicate process');assert.equal(s.answerCount,1);assert.equal(s.followUpDecisions,1);assert.equal(s.pendingEffects,1);assert.equal((await row(f)).snapshot.evaluations.length,1)})
  await check('commit-before-response-loss is recovered by a fresh service and read-only receipt lookup',async()=>{const f=await fresh(),b=await request(f);await f.service.submitAnswer(f.candidate,b);const version=(await row(f)).version;f.service=new InterviewService(new InterviewRepository(database),f.clock,'owner-restarted');const r=await f.service.answerStatus(f.candidate,b);assert.equal(r.outcome,'COMMITTED');assert.equal((await row(f)).snapshot.status,'PAUSED');const duplicate=await f.service.submitAnswer(f.candidate,b);assert.equal(duplicate.duplicate,true);const s=await inspect(f,b,'restart duplicate');assert.equal(s.answerCount,1);assert.equal(s.receiptCount,1);assert.equal(s.version,version+1)})
  await check('restart before commit pauses; original request cannot silently resume or extend timer',async()=>{const f=await fresh(),b=await request(f),before=await row(f);f.service=new InterviewService(new InterviewRepository(database),f.clock,'owner-restarted');await assert.rejects(f.service.submitAnswer(f.candidate,b),/interviewRecoveryRequired/);const s=await inspect(f,b,'restart before commit');assert.equal(s.answerCount,0);assert.equal(s.receiptCount,0);assert.equal(s.status,'PAUSED');assert.equal((await row(f)).snapshot.timer!.pausedRemainingMs,before.snapshot.timer!.timeLimitSec*1000)})
  await check('receipt fingerprint rejects changed answer content under reused identity',async()=>{const f=await fresh(),b=await request(f);await f.service.submitAnswer(f.candidate,b);for(const action of ['submit','status'])assert.equal((await http(f,action,{...b,text:'Tampered'})).status,409);assert.equal((await inspect(f,b,'changed identity content')).answerCount,1)})
  for(const kind of ['interview','session','question','turn','version'])await check(`tampered ${kind} identifier fails safely`,async()=>{
    const f=await fresh(),b=await request(f),other=await fresh()
    const bad={...b,...(kind==='interview'?{interviewId:other.id}:kind==='session'?{sessionVersion:b.sessionVersion+1}:kind==='question'?{questionId:'other-question'}:kind==='turn'?{turnId:'turn:999'}:{expectedVersion:b.expectedVersion-1})}
    const r=await http(f,'submit',bad);assert([401,403,409].includes(r.status));const s=await inspect(f,b,`modified ${kind}`);assert.equal(s.answerCount,0);assert.equal(s.receiptCount,0)
  })
  await check('another candidate cannot reconcile or submit a foreign recovery envelope',async()=>{const a=await fresh(),b=await request(a),other=await fresh();assert.equal((await http(a,'status',b,other.cookie)).status,401);assert.equal((await http(a,'submit',b,other.cookie)).status,401)})
  for(const kind of ['expired','revoked','stale'])await check(`${kind} candidate session cannot use recovery`,async()=>{
    const f=await fresh(),b=await request(f)
    if(kind==='expired')f.clock.advance(7200001)
    else {await f.service.revoke(hr,f.id,{commandId:randomUUID(),expectedVersion:(await row(f)).version});if(kind==='stale'){const issued=await f.service.invite(hr,f.id,{commandId:randomUUID(),expectedVersion:(await row(f)).version});const replacement=await f.service.exchange(issued.token!);const cookie=`${CANDIDATE_COOKIE}=${replacement.credential}`;assert.equal((await http(f,'status',b,cookie)).status,403)}}
    assert.equal((await http(f,'status',b)).status,401);assert.equal((await http(f,'submit',b)).status,401)
  })
  await check('Origin checks and candidate/staff authentication separation remain enforced',async()=>{const f=await fresh(),b=await request(f);assert.equal((await http(f,'submit',b,f.cookie,'https://attacker.invalid')).status,403);assert.equal((await http(f,'status',b,'hr_session=synthetic-employee-cookie')).status,401);await assert.rejects(f.service.submitAnswer(hr,b),/candidateSessionInvalid/);const c=await http(f,'status',b);assert(c.headers.get('cache-control')!.includes('no-store'));assert.equal(c.headers.get('referrer-policy'),'no-referrer')})
  await check('deadline expiry cannot be bypassed by recovering a local answer',async()=>{const f=await fresh(),b=await request(f);f.clock.advance(120000);await assert.rejects(f.service.submitAnswer(f.candidate,b),/ANSWER_DEADLINE_PASSED/);assert.equal((await inspect(f,b,'expired turn deadline')).receiptCount,0)})
  await check('a silence timeout is CLOSED, never acknowledgement of the unsubmitted local text',async()=>{const f=await fresh(),b=await request(f);f.clock.advance(120000);await command(f,{type:'TIMER_TICK',commandId:randomUUID()});const r=await f.service.answerStatus(f.candidate,b);assert.equal(r.outcome,'CLOSED');const s=await inspect(f,b,'silence timeout');assert.equal(s.receiptCount,0);assert.equal((await row(f)).snapshot.answers[0]!.text,'')})
  await check('after completion original receipt confirms commit but a fresh replay cannot create an answer',async()=>{
    const f=await fresh();let first:SubmitAiInterviewAnswer|undefined,index=0
    while((await row(f)).snapshot.status!=='COMPLETED'){
      const r=await row(f)
      if(r.snapshot.playback)await deliver(f)
      else if(r.snapshot.phase==='LISTENING'){const b=await request(f,phase1Answers[index++]!);first??=b;await f.service.submitAnswer(f.candidate,b)}
      else if(r.snapshot.phase==='PROCESSING')await command(f,{type:'PROCESS_ANSWER',commandId:randomUUID()})
      else throw Error('Unexpected synthetic lifecycle')
    }
    const before=await row(f);assert.equal((await f.service.submitAnswer(f.candidate,first!)).outcome,'COMMITTED');assert.equal((await f.service.answerStatus(f.candidate,first!)).outcome,'COMMITTED')
    await assert.rejects(f.service.submitAnswer(f.candidate,{...first!,commandId:randomUUID(),expectedVersion:before.version}),/answerTurnClosed/)
    const after=await row(f);assert.equal(after.version,before.version);assert.equal(after.snapshot.answers.length,before.snapshot.answers.length)
  })
  await check('candidate result DTO contains no receipt fingerprint, rubric, future prompts or SQL errors',async()=>{const f=await fresh(),b=await request(f),r=await http(f,'submit',b);const value=await r.json();const text=JSON.stringify(value);assert.equal(r.status,200);for(const privateField of ['fingerprint','frozenInputs','proposedRubric','candidateSessionHash','inviteTokenHash','stack'])assert(!text.includes(privateField));assert.deepEqual(Object.keys((value as {state:object}).state).sort(),Object.keys(f.service.candidateState(await row(f))).sort())})
  await check('external model/network attempts remain zero',async()=>assert.equal(external,0))
  const output=process.env.PHASE52_OUTPUT
  if(output)writeFileSync(resolve(output,'answer-database-matrix.json'),JSON.stringify({checks,externalAttempts:external,fixture:'Disposable PostgreSQL, unchanged 0026 with synthetic legacy parents; full-chain pgvector blocker remains open',matrix},null,2)+'\n')
  console.log(`${checks}/${checks} Phase 5.2 PostgreSQL answer checks passed; external attempts=${external}`)
} finally {
  await closeApp?.();await pool?.end()
  if(created&&/^ai_interview_phase52_[a-f0-9]{32}$/.test(name))await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin.end();globalThis.fetch=savedFetch;net.Socket.prototype.connect=savedConnect;syncBuiltinESMExports()
}
