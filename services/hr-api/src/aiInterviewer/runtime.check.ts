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
import { aiInterviewDimensionSchema, type AiInterviewCommand } from '@hr/shared'
import { deferred, ManualTimeouts, nextTurn } from './runtimeTestSupport.js'
import type { EvaluationDiagnostic } from './execution.js'
import type { ReportEvaluator } from './report.js'

const connection=process.env.AI_INTERVIEW_TEST_DATABASE_URL
if(!connection)throw Error('A local AI_INTERVIEW_TEST_DATABASE_URL is required')
const url=new URL(connection)
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Refusing a nonlocal database')
const savedFetch=globalThis.fetch,savedConnect=net.Socket.prototype.connect
let external=0
globalThis.fetch=()=>{external++;throw Error('External network forbidden')}
net.Socket.prototype.connect=function(this:net.Socket,...args:unknown[]){
  const a=Array.isArray(args[0])?args[0] as unknown[]:args,o=typeof a[0]==='object'?a[0] as {host?:string;port?:number}:{host:a[1],port:a[0]}
  if(!['127.0.0.1','localhost','::1'].includes(String(o.host))||Number(o.port)!==Number(url.port||5432)){external++;throw Error('External socket forbidden')}
  return Reflect.apply(savedConnect,this,args)
} as typeof savedConnect
syncBuiltinESMExports()
const name='ai_interview_phase53_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:connection,max:1})
let pool:pg.Pool|undefined,closeApp:(()=>Promise<void>)|undefined,created=false,checks=0
const matrix:Record<string,unknown>[]=[],diagnostics:EvaluationDiagnostic[]=[]
try {
  await admin.query(`CREATE DATABASE "${name}"`);created=true;url.pathname='/'+name
  process.env.DATABASE_URL=url.toString();process.env.SESSION_SECRET=randomBytes(32).toString('hex');process.env.NODE_ENV='development'
  pool=new pg.Pool({connectionString:url.toString(),max:12})
  const schema=await import('../db/schema.js'),{users,candidates,jobOpenings,applications,jobDescriptions,aiInterviewEvents,aiInterviewEvaluations}=schema
  for(const table of [users,candidates,jobOpenings,applications,jobDescriptions]){
    const config=getTableConfig(table)
    await pool.query(`CREATE TABLE "${config.name}" (${config.columns.map(c=>{let t=c.getSQLType();if(!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(t))t='text';return `"${c.name}" ${t}${c.primary?' PRIMARY KEY':''}`}).join(',')})`)
  }
  await pool.query(readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql',import.meta.url),'utf8'))
  const database=drizzle(pool,{schema})
  const {InterviewService}=await import('./service.js'),{InterviewRepository}=await import('./repository.js'),{FakeClock}=await import('./clock.js')
  const {InterviewReportService,reportStorage}=await import('./reportService.js'),{MockReportEvaluator,reportInputHash}=await import('./report.js')
  const {InterviewMaintenance,startInterviewMaintenance}=await import('./runtime.js'),{phase1Plan}=await import('./fixtures.js')
  closeApp=(await import('../db/client.js')).closeDb
  const staff={hr:randomUUID(),manager:randomUUID(),employee:randomUUID(),inactive:randomUUID()}
  for(const [role,id]of Object.entries(staff))await database.insert(users).values({id,role:role==='inactive'?'hr':role as 'hr'|'manager'|'employee',isActive:role!=='inactive',email:`${role}@synthetic.invalid`,employeeNumber:role,fullNameEn:'Synthetic',fullNameAr:'Synthetic'})
  const hr={kind:'staff' as const,userId:staff.hr},system={kind:'system' as const},mock=new MockReportEvaluator()
  const rubric={version:'synthetic-runtime-v1',dimensions:aiInterviewDimensionSchema.options.map(dimension=>({dimension,anchors:['Absent','Basic','Partial','Applied','Explained'] as [string,string,string,string,string]}))}
  const L=(s:string)=>({en:s,ar:s}),list=(s:string[])=>({en:s,ar:s})
  async function active(duration=120,owner='owner-a'){
    const clock=new FakeClock(),service=new InterviewService(new InterviewRepository(database),clock,owner)
    const openingId=randomUUID(),candidateId=randomUUID(),applicationId=randomUUID()
    await database.insert(jobOpenings).values({id:openingId,openedOn:'2026-11-01',titleEn:'Synthetic role',titleAr:'Synthetic',departmentEn:'Test',departmentAr:'Test',status:'open'})
    await database.insert(candidates).values({id:candidateId,fullName:'Synthetic participant',email:'candidate@synthetic.invalid'})
    await database.insert(applications).values({id:applicationId,openingId,candidateId,status:'new',source:'manual'})
    await database.insert(jobDescriptions).values({id:randomUUID(),openingId,titleEn:'Synthetic',titleAr:'Synthetic',status:'approved',approvedAt:new Date(clock.now()),content:{title:L('Synthetic'),summary:L(''),responsibilities:list([]),requiredQualifications:list([]),requiredSkills:list(['rag','problem-solving']),preferredSkills:list([]),softSkills:list([]),experience:L(''),education:L(''),workingConditions:null},scorecard:{weights:[{key:'rag',weight:60},{key:'problem-solving',weight:40}]}})
    const plan=structuredClone(phase1Plan);plan.questions=plan.questions.slice(0,1).map(q=>({...q,answerTimeLimitSec:duration,warningAtSec:0,gracePeriodSec:0,maxFollowUps:0,maxClarifications:0,followUps:[],clarifications:[],silenceAction:'NEXT_QUESTION' as const}))
    const created=await service.create(hr,applicationId,{commandId:randomUUID(),plan,rubric}),id=created.interviewId
    await service.ready(hr,id,{commandId:randomUUID(),expectedVersion:created.version})
    const invite=await service.invite(hr,id,{commandId:randomUUID(),expectedVersion:(await service.load(system,id)).version}),session=await service.exchange(invite.token!)
    const f={id,applicationId,clock,service,candidate:{kind:'candidate' as const,credential:session.credential}}
    await f.service.execute(f.candidate,id,(await row(f)).version,{type:'ACCEPT_CONSENT',policyVersion:'ai-interview-v1',commandId:randomUUID()})
    await send(f,{type:'START_INTERVIEW',commandId:randomUUID()});await deliver(f);await deliver(f)
    return f
  }
  type F=Awaited<ReturnType<typeof active>>
  const row=(f:F)=>f.service.load(system,f.id)
  async function send(f:F,command:AiInterviewCommand){return f.service.execute(system,f.id,(await row(f)).version,command)}
  async function deliver(f:F){const p=(await row(f)).snapshot.playback!;await send(f,{type:'AI_PLAYBACK_STARTED',playbackId:p.id,commandId:randomUUID()});await send(f,{type:'AI_PLAYBACK_FINISHED',playbackId:p.id,commandId:randomUUID()})}
  async function completed(){const f=await active(),r=await row(f);await f.service.submitAnswer(f.candidate,{interviewId:f.id,commandId:randomUUID(),expectedVersion:r.version,sessionVersion:r.candidateSessionVersion,questionId:r.snapshot.currentQuestion!.id,turnId:r.snapshot.draft!.turnId,text:'I measured recall@5 on labeled queries and reviewed incorrect retrievals.'});await send(f,{type:'PROCESS_ANSWER',commandId:randomUUID()});await deliver(f);return f}
  async function prepare(evaluator:ReportEvaluator=mock,timeoutMs=100,f?:F){
    const target=f??await completed(),timers=new ManualTimeouts(),events:EvaluationDiagnostic[]=[]
    const reports=new InterviewReportService(target.service,evaluator,{timeoutMs,scheduleTimeout:timers.schedule,diagnostics:e=>{events.push(e);diagnostics.push(e)}})
    await reports.request(hr,target.id,target.applicationId,{operation:'RUN',commandId:randomUUID(),expectedVersion:(await row(target)).version})
    const hash=(await reports.get(hr,target.id,target.applicationId)).evaluation.inputHash
    return {f:target,reports,timers,events,hash,timeoutMs,answers:structuredClone((await row(target)).snapshot.answers)}
  }
  type Job=Awaited<ReturnType<typeof prepare>>
  const get=(j:Job)=>j.reports.get(hr,j.f.id,j.f.applicationId)
  async function raw(j:Job){return (await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId,j.f.id))).find(r=>r.reportVersion===1)!}
  async function retry(j:Job,reports=j.reports){return reports.request(hr,j.f.id,j.f.applicationId,{operation:'RETRY',commandId:randomUUID(),expectedVersion:(await row(j.f)).version})}
  async function record(label:string,j:Job){const r=await get(j),job=await raw(j),storage=reportStorage(job.results),aggregate=await row(j.f)
    const anchor=storage?.attempts.find(a=>a.inputHash)?.inputHash
    const audits=await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId,j.f.id))
    const value={scenario:label,interviewId:j.f.id,evaluationId:r.evaluation.evaluationId,jobStatus:r.evaluation.status,reportVersion:r.evaluation.reportVersion,retryCount:r.evaluation.retryCount,
    inputHash:r.evaluation.inputHash,inputHashPreserved:r.evaluation.inputHash===j.hash,reportPresent:!!r.evaluation.report,evidenceStatus:r.evaluation.report?.evidenceValidation.status??null,
    attempts:r.evaluation.attempts.map(a=>({attempt:a.attempt,status:!a.finishedAt?'RUNNING':a.failureCode?'FAILED':'COMPLETED',finished:!!a.finishedAt,failureCode:a.failureCode,ownerId:a.ownerId,deadlineAt:a.deadlineAt})),
    retryEligible:r.evaluation.status==='FAILED'&&!!storage&&job.inputHash===reportInputHash(storage.input)&&(!anchor||anchor===job.inputHash),
    answersPreserved:JSON.stringify(aggregate.snapshot.answers)===JSON.stringify(j.answers),auditActions:audits.filter(a=>a.recordType==='AUDIT').map(a=>a.eventType),
    versions:r.versions.length,interviewStatus:r.interviewStatus,interviewVersion:r.version};assert(value.answersPreserved);matrix.push(value);return value}
  async function check(label:string,test:()=>void|Promise<void>){await test();checks++;console.log('PASS '+label)}
  const until=async(test:()=>Promise<boolean>,ms=2000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await test())return;await new Promise(r=>setTimeout(r,10))}throw Error('Controlled runtime condition did not settle')}
  const cancel=async(f:F)=>{const r=await row(f);if(['ACTIVE','PAUSED'].includes(r.snapshot.status))await send(f,{type:'CANCEL_INTERVIEW',commandId:randomUUID()})}

  await check('PENDING input/hash is durable before work and is not an assessment',async()=>{const j=await prepare(),r=await record('pending',j);assert.equal(r.jobStatus,'PENDING');assert.equal(r.reportPresent,false);await j.reports.runJob(j.f.id,1)})
  await check('successful output passes mandatory evidence verification before COMPLETED',async()=>{const j=await prepare();await j.reports.runJob(j.f.id,1);const r=await record('success',j);assert.equal(r.jobStatus,'COMPLETED');assert.equal(r.evidenceStatus,'VALID');assert(r.inputHashPreserved);assert.equal(r.attempts.length,1)})
  for(const kind of ['exception','unavailable','malformed','invalid-evidence'] as const)await check(`${kind} cannot persist a successful report`,async()=>{
    const evaluator:ReportEvaluator={evaluateReport:(input,identity)=>{
      if(kind==='exception')throw Error('SENSITIVE_PAYLOAD_DO_NOT_LOG')
      if(kind==='unavailable')return Promise.reject(Error('SENSITIVE_PAYLOAD_DO_NOT_LOG'))
      if(kind==='malformed')return {authorization:'admin',score:100}
      const r=mock.evaluateReport(input,identity);r.criteriaResults.flatMap(c=>c.evidence)[0]!.quote='Invented sensitive quote';return r
    }}
    const j=await prepare(evaluator);await j.reports.runJob(j.f.id,1);const r=await record(kind,j)
    assert.equal(r.jobStatus,'FAILED');assert.equal(r.reportPresent,false);assert(r.inputHashPreserved);assert(r.retryEligible)
    assert.equal(r.attempts[0]!.failureCode,['exception','unavailable'].includes(kind)?'MOCK_EVALUATOR_FAILED':'EVIDENCE_VALIDATION_FAILED')
    assert(!JSON.stringify(j.events).includes('SENSITIVE_PAYLOAD'))
  })
  await check('timeout is durably FAILED with a finished attempt, no report and retry eligibility',async()=>{
    const gate=deferred<void>(),entered=deferred<void>();const j=await prepare({evaluateReport:async(i,x,context)=>{assert(context?.signal);entered.resolve();await gate.promise;return mock.evaluateReport(i,x)}})
    const p=j.reports.runJob(j.f.id,1);await entered.promise;j.f.clock.advance(j.timeoutMs);j.timers.advance(j.timeoutMs);await p
    const r=await record('timeout',j);assert.equal(r.jobStatus,'FAILED');assert.equal(r.reportPresent,false);assert.equal(r.attempts[0]!.failureCode,'EVALUATOR_TIMEOUT');assert(r.attempts[0]!.finished);assert(r.retryEligible);assert.equal(j.reports.activeEvaluatorCalls,1)
    gate.resolve();await nextTurn();assert.equal(j.reports.activeEvaluatorCalls,0)
  })
  await check('attempt A returns after timed-out A and successful B without changing B or its hash/version',async()=>{
    const gate=deferred<void>(),entered=deferred<void>();let count=0
    const j=await prepare({evaluateReport:async(i,x)=>{const attempt=++count;if(attempt===1){entered.resolve();await gate.promise}const r=mock.evaluateReport(i,x);r.summary=attempt===1?'Synthetic stale attempt A':'Synthetic authoritative attempt B';return r}})
    const a=j.reports.runJob(j.f.id,1);await entered.promise;j.f.clock.advance(j.timeoutMs);j.timers.advance(j.timeoutMs);await a
    await retry(j);await j.reports.runJob(j.f.id,1);const before=await raw(j),aggregate=await row(j.f)
    gate.resolve();await nextTurn();assert.deepEqual(await raw(j),before);const after=await row(j.f);assert.equal(after.version,aggregate.version);assert.equal(after.lastSequence,aggregate.lastSequence)
    const r=await record('late A after authoritative B',j);assert.equal(r.jobStatus,'COMPLETED');assert.equal((await get(j)).evaluation.report!.summary,'Synthetic authoritative attempt B');assert.equal(r.reportVersion,1);assert.equal(r.versions,1);assert.equal(r.retryCount,1);assert(r.inputHashPreserved);assert.equal(count,2);assert(j.events.some(e=>e.event==='evaluation_attempt_fenced'));matrix.push({scenario:'explicit stale A result',lateAttemptReturned:true,authoritativeAttempt:2,reportUnchanged:true,inputHashUnchanged:true,reportVersion:1})
  })
  await check('five-minute lease fencing remains compatible and stale A cannot overwrite B',async()=>{
    const gate=deferred<void>(),entered=deferred<void>();let count=0;const j=await prepare({evaluateReport:async(i,x)=>{if(++count===1){entered.resolve();await gate.promise}return mock.evaluateReport(i,x)}})
    const a=j.reports.runJob(j.f.id,1);await entered.promise;j.f.clock.advance(300001);await j.reports.runJob(j.f.id,1);const before=await raw(j);gate.resolve();await a
    assert.deepEqual(await raw(j),before);const r=await record('legacy lease reclaim',j);assert.equal(r.attempts[0]!.failureCode,'WORKER_LEASE_EXPIRED');assert.equal(r.jobStatus,'COMPLETED')
  })
  await check('restart while PENDING executes the same frozen job under a new owner',async()=>{
    const j=await prepare();j.f.service=new InterviewService(new InterviewRepository(database),j.f.clock,'owner-b');j.reports=new InterviewReportService(j.f.service,mock,{diagnostics:e=>diagnostics.push(e)})
    await j.reports.runJob(j.f.id,1);const r=await record('restart PENDING',j);assert.equal(r.jobStatus,'COMPLETED');assert(r.inputHashPreserved);assert.equal(r.reportVersion,1)
  })
  await check('restart while RUNNING reclaims immediately, fences former owner and preserves source',async()=>{
    const gate=deferred<void>(),entered=deferred<void>();const j=await prepare({evaluateReport:async(i,x)=>{entered.resolve();await gate.promise;const r=mock.evaluateReport(i,x);r.summary='Synthetic stale former owner';return r}})
    const a=j.reports.runJob(j.f.id,1);await entered.promise;j.f.service=new InterviewService(new InterviewRepository(database),j.f.clock,'owner-b')
    const newer=new InterviewReportService(j.f.service,mock,{diagnostics:e=>diagnostics.push(e)});await newer.runJob(j.f.id,1);j.reports=newer
    const before=await raw(j),aggregate=await row(j.f);gate.resolve();await a;assert.deepEqual(await raw(j),before);assert.equal((await row(j.f)).version,aggregate.version);assert.notEqual((await get(j)).evaluation.report!.summary,'Synthetic stale former owner');const r=await record('restart RUNNING',j);assert.equal(r.jobStatus,'COMPLETED');assert.equal(r.attempts[0]!.failureCode,'WORKER_RESTARTED');assert.equal(r.attempts[1]!.ownerId,'owner-b');assert(r.inputHashPreserved)
  })
  await check('restart after durable report but before acknowledgement cannot create another report',async()=>{
    const j=await prepare();await j.reports.runJob(j.f.id,1);const before=await raw(j);j.f.service=new InterviewService(new InterviewRepository(database),j.f.clock,'owner-b')
    j.reports=new InterviewReportService(j.f.service,{evaluateReport:()=>{throw Error('must not execute completed job')}});await j.reports.runJob(j.f.id,1);assert.deepEqual(await raw(j),before);const r=await record('restart after durable commit',j);assert.equal(r.attempts.length,1);assert.equal(r.versions,1)
  })
  for(const transition of ['FAILED','RETRY_PENDING'] as const)await check(`restart around timeout at ${transition} remains deterministic`,async()=>{
    const gate=deferred<void>(),entered=deferred<void>();const j=await prepare({evaluateReport:async(i,x)=>{entered.resolve();await gate.promise;return mock.evaluateReport(i,x)}})
    const a=j.reports.runJob(j.f.id,1);await entered.promise;j.f.clock.advance(j.timeoutMs);j.timers.advance(j.timeoutMs);await a;gate.resolve();await nextTurn()
    if(transition==='RETRY_PENDING')await retry(j)
    j.f.service=new InterviewService(new InterviewRepository(database),j.f.clock,'owner-b');j.reports=new InterviewReportService(j.f.service,mock)
    await j.reports.runJob(j.f.id,1)
    if(transition==='FAILED'){assert.equal((await get(j)).evaluation.status,'FAILED');await retry(j);await j.reports.runJob(j.f.id,1)}
    const r=await record('restart timeout '+transition,j);assert.equal(r.jobStatus,'COMPLETED');assert.equal(r.reportVersion,1);assert.equal(r.retryCount,1);assert(r.inputHashPreserved)
  })
  for(const paused of [false,true])await check(`restart of ${paused?'PAUSED':'ACTIVE'} preserves authoritative remaining duration`,async()=>{
    const f=await active();f.clock.advance(45000);await send(f,{type:'TIMER_TICK',commandId:randomUUID()})
    if(paused)await send(f,{type:'PAUSE_INTERVIEW',reason:'USER',commandId:randomUUID()})
    f.clock.advance(300000);f.service=new InterviewService(new InterviewRepository(database),f.clock,'owner-b')
    if(!paused)await new InterviewMaintenance(f.service).tickInterviews()
    const r=await row(f);assert.equal(r.snapshot.status,'PAUSED');assert.equal(r.snapshot.timer!.pausedRemainingMs,75000)
    matrix.push({scenario:'restart interview '+(paused?'PAUSED':'ACTIVE'),interviewStatus:r.snapshot.status,remainingMs:r.snapshot.timer!.pausedRemainingMs,version:r.version,answerCount:r.snapshot.answers.length})
    f.clock.advance(300000);await send(f,{type:'RESUME_INTERVIEW',commandId:randomUUID()});assert.equal((await row(f)).snapshot.timer!.answerDeadlineAt,f.clock.now()+75000);await cancel(f)
  })
  await check('legacy RUNNING metadata without owner/deadline recovers at the existing bounded lease',async()=>{
    const j=await prepare(),job=await raw(j),storage=reportStorage(job.results)!;storage.attempts=[{attempt:1,startedAt:new Date(j.f.clock.now()).toISOString(),finishedAt:null,failureCode:null}]
    await database.update(aiInterviewEvaluations).set({status:'RUNNING',results:storage}).where(eq(aiInterviewEvaluations.id,job.id))
    await j.reports.runJob(j.f.id,1);assert.equal((await raw(j)).status,'RUNNING');j.f.clock.advance(300000);await j.reports.runJob(j.f.id,1)
    const r=await record('legacy RUNNING after lease',j);assert.equal(r.jobStatus,'COMPLETED');assert.equal(r.attempts[0]!.failureCode,'WORKER_LEASE_EXPIRED');assert(r.inputHashPreserved)
  })
  await check('repeated failures then success preserve input/hash/version; reevaluation stays separate',async()=>{
    let calls=0;const j=await prepare({evaluateReport:(i,x)=>{calls++;if(calls===1)throw Error('unavailable');if(calls===2)return {malformed:true};return mock.evaluateReport(i,x)}})
    await j.reports.runJob(j.f.id,1);await retry(j);await j.reports.runJob(j.f.id,1);await retry(j);await j.reports.runJob(j.f.id,1)
    const r=await record('failure failure retry success',j);assert.equal(r.reportVersion,1);assert.equal(r.retryCount,2);assert.equal(r.attempts.length,3);assert(r.inputHashPreserved);assert.equal(r.jobStatus,'COMPLETED')
    const old=(await get(j)).evaluation.report;await j.reports.request(hr,j.f.id,j.f.applicationId,{operation:'REEVALUATE',commandId:randomUUID(),expectedVersion:(await row(j.f)).version,evaluatorVersion:'mock-report-v2'});await j.reports.runJob(j.f.id,2)
    const newer=await get(j);assert.equal(newer.versions.length,2);assert.equal(newer.evaluation.reportVersion,2);assert.notEqual(newer.evaluation.inputHash,j.hash);assert.deepEqual((await j.reports.get(hr,j.f.id,j.f.applicationId,1)).evaluation.report,old)
  })
  await check('late valid value at the durable deadline is still TIMEOUT, never COMPLETED',async()=>{
    const f=await completed();const j=await prepare({evaluateReport:(i,x)=>{f.clock.advance(100);return mock.evaluateReport(i,x)}},100,f);await j.reports.runJob(f.id,1)
    const r=await record('result at deadline',j);assert.equal(r.jobStatus,'FAILED');assert.equal(r.reportPresent,false);assert.equal(r.attempts[0]!.failureCode,'EVALUATOR_TIMEOUT')
  })
  await check('shutdown cancels bounded waits and drains without waiting for uncancellable work',async()=>{
    const gate=deferred<void>(),entered=deferred<void>();const j=await prepare({evaluateReport:async(i,x)=>{entered.resolve();await gate.promise;return mock.evaluateReport(i,x)}})
    const runtime=new InterviewMaintenance(j.f.service,j.reports,e=>diagnostics.push(e));await runtime.dispatchEvaluations();await entered.promise;await runtime.stop()
    const r=await record('shutdown while RUNNING',j);assert.equal(r.jobStatus,'FAILED');assert.equal(r.attempts[0]!.failureCode,'EVALUATOR_CANCELLED');assert.equal(runtime.activeJobs,0);gate.resolve();await nextTurn()
  })
  await check('physical admission across service objects stays at two; capacity failure is safe and retryable',async()=>{
    const gates=[deferred<void>(),deferred<void>()],starts=[deferred<void>(),deferred<void>()],jobs:Job[]=[],work:Promise<void>[]=[]
    for(let n=0;n<2;n++){const j=await prepare({evaluateReport:async(i,x)=>{starts[n]!.resolve();await gates[n]!.promise;return mock.evaluateReport(i,x)}});jobs.push(j);work.push(j.reports.runJob(j.f.id,1))}
    await Promise.all(starts.map(d=>d.promise));for(const j of jobs){j.f.clock.advance(j.timeoutMs);j.timers.advance(j.timeoutMs)}await Promise.all(work)
    let called=0;const third=await prepare({evaluateReport:(i,x)=>{called++;return mock.evaluateReport(i,x)}});assert.equal(third.reports.activeEvaluatorCalls,2);await third.reports.runJob(third.f.id,1)
    const r=await record('physical capacity exhausted',third);assert.equal(r.jobStatus,'FAILED');assert.equal(r.attempts[0]!.failureCode,'EVALUATOR_CAPACITY_EXHAUSTED');assert.equal(called,0)
    for(const gate of gates)gate.resolve();await nextTurn();assert.equal(third.reports.activeEvaluatorCalls,0);await retry(third);await third.reports.runJob(third.f.id,1);assert.equal((await get(third)).evaluation.status,'COMPLETED')
  })
  for(const native of [false,true])await check(`${native?'native one-second loop':'deterministic pass'} maintains deadline while A hangs and B completes`,async()=>{
    const f=await active(1),hang=await prepare(),normal=await prepare(),gate=deferred<void>(),entered=deferred<void>(),timers=new ManualTimeouts()
    const reports=new InterviewReportService(f.service,{evaluateReport:async(i,x)=>{if(i.interviewId===hang.f.id){entered.resolve();await gate.promise}return mock.evaluateReport(i,x)}},{scheduleTimeout:timers.schedule,diagnostics:e=>diagnostics.push(e)})
    const runtime=native?undefined:new InterviewMaintenance(f.service,reports,e=>diagnostics.push(e)),stop=native?startInterviewMaintenance(f.service,reports):()=>runtime!.stop()
    if(runtime)await runtime.dispatchEvaluations();await entered.promise;await until(async()=>(await get(normal)).evaluation.status==='COMPLETED')
    f.clock.advance(1000);const started=Date.now();if(runtime)await runtime.tickInterviews();await until(async()=>(await row(f)).snapshot.answers.length===1,2000)
    const elapsed=Date.now()-started,activeRow=await row(f);assert(elapsed<2000);assert.equal(activeRow.snapshot.answers[0]!.finalizedAt,f.clock.now());assert.equal((await get(hang)).evaluation.status,'RUNNING')
    matrix.push({scenario:native?'native fairness':'deterministic fairness',maintenanceIntervalMs:1000,fixtureToleranceMs:2000,observedWallMs:elapsed,serverDeadlineDelayMs:0,activeAnswerCount:activeRow.snapshot.answers.length,hangingJobStatus:(await get(hang)).evaluation.status,otherJobStatus:(await get(normal)).evaluation.status,physicalCalls:reports.activeEvaluatorCalls})
    await stop();gate.resolve();await nextTurn();await cancel(f)
  })
  await check('changed frozen input before execution fails without invoking evaluator',async()=>{
    let calls=0;const j=await prepare({evaluateReport:(i,x)=>{calls++;return mock.evaluateReport(i,x)}}),job=await raw(j),s=reportStorage(job.results)!;s.input.answers[0]!.answer.text='Tampered frozen source'
    await database.update(aiInterviewEvaluations).set({results:s}).where(eq(aiInterviewEvaluations.id,job.id));await j.reports.runJob(j.f.id,1)
    assert.equal(calls,0);const r=await record('input corruption before claim',j);assert.equal(r.jobStatus,'FAILED');assert.equal(r.attempts[0]!.failureCode,'EVALUATION_INPUT_CHANGED');await assert.rejects(retry(j),/evaluationInputChanged/)
  })
  await check('consistent replacement input/hash during A cannot accept A or silently retry different source',async()=>{
    const gate=deferred<void>(),entered=deferred<void>();const j=await prepare({evaluateReport:async(i,x)=>{entered.resolve();await gate.promise;return mock.evaluateReport(i,x)}}),p=j.reports.runJob(j.f.id,1);await entered.promise
    const job=await raw(j),s=reportStorage(job.results)!;s.input.answers[0]!.answer.text='Different frozen source';const changedHash=reportInputHash(s.input)
    await database.update(aiInterviewEvaluations).set({results:s,inputHash:changedHash}).where(eq(aiInterviewEvaluations.id,job.id));gate.resolve();await p
    const r=await record('source and hash replaced during claim',j);assert.equal(r.jobStatus,'FAILED');assert.equal(r.reportPresent,false);assert.equal(r.attempts[0]!.failureCode,'EVALUATION_INPUT_CHANGED');await assert.rejects(retry(j),/evaluationInputChanged/)
  })
  await check('invalid durable report envelope fails safely instead of stranding a RUNNING job',async()=>{
    const j=await prepare(),job=await raw(j);await pool!.query("UPDATE ai_interview_evaluations SET status='RUNNING', results='{"+'"format":"phase4-report-v1","invalid":true'+"}'::jsonb WHERE id=$1",[job.id]);await j.reports.runJob(j.f.id,1)
    assert.equal((await raw(j)).status,'FAILED');assert.equal((await raw(j)).failureCode,'EVALUATION_INPUT_INVALID');assert.equal((await get(j)).evaluation.report,null)
    const r=await record('invalid durable envelope',j);assert.equal(r.retryEligible,false)
  })
  await check('HR/resource/candidate authorization is independent of evaluator output',async()=>{
    const j=await prepare();for(const key of ['manager','employee','inactive'] as const)await assert.rejects(j.reports.get({kind:'staff',userId:staff[key]},j.f.id,j.f.applicationId),/forbidden/)
    await assert.rejects(j.reports.get(j.f.candidate,j.f.id,j.f.applicationId),/forbidden/);await assert.rejects(j.reports.get(hr,j.f.id,randomUUID()),/interviewNotFound/)
    await assert.rejects(j.reports.request(hr,j.f.id,j.f.applicationId,{operation:'RUN',commandId:randomUUID(),expectedVersion:0,timeoutMs:0}))
    await j.reports.runJob(j.f.id,1);assert.equal((await database.select().from(applications).where(eq(applications.id,j.f.applicationId)))[0]!.status,'new')
  })
  await check('audit and diagnostics correlate attempts/recovery without secret or answer content',async()=>{
    const rows=await database.select().from(aiInterviewEvents),audit=rows.filter(r=>r.recordType==='AUDIT');const text=JSON.stringify(audit.map(r=>r.payload))+JSON.stringify(diagnostics)
    assert(audit.some(r=>r.eventType==='EVALUATION_ATTEMPT_TIMED_OUT'));assert(audit.some(r=>r.eventType==='RUNTIME_RECOVERY_STARTED'));assert(audit.some(r=>r.eventType==='RUNTIME_RECOVERY_COMPLETED'));assert(!text.includes('SENSITIVE_PAYLOAD'));assert(!text.includes('recall@5'));assert(!text.includes('Invented sensitive'))
    for(const e of diagnostics)for(const key of Object.keys(e))assert(['event','interviewId','evaluationId','reportVersion','attempt','code'].includes(key))
  })
  await check('timeout configuration cannot disable or exceed the production execution bound',()=>{const service=new InterviewService(new InterviewRepository(database));for(const timeoutMs of [0,-1,30001,Infinity])assert.throws(()=>new InterviewReportService(service,mock,{timeoutMs}),/invalidEvaluationTimeout/)})
  await check('no external/model network attempts',()=>assert.equal(external,0))
  if(process.env.PHASE53_OUTPUT)writeFileSync(resolve(process.env.PHASE53_OUTPUT,'runtime-matrix.json'),JSON.stringify({checks,externalAttempts:external,singleProcess:true,fixture:'Real disposable PostgreSQL and unchanged 0026 on synthetic legacy parents; pgvector full-chain blocker open',matrix,diagnostics},null,2)+'\n')
  console.log(`${checks}/${checks} Phase 5.3 runtime/job checks passed; external attempts=${external}`)
} finally {
  await closeApp?.();await pool?.end();if(created&&/^ai_interview_phase53_[a-f0-9]{32}$/.test(name))await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin.end();globalThis.fetch=savedFetch;net.Socket.prototype.connect=savedConnect;syncBuiltinESMExports()
}
