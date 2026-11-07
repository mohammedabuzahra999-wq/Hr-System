import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { aiInterviewDimensionSchema, type AiInterviewCommand } from '@hr/shared'

// A disposable LOCAL database is mandatory. Never fall back to DATABASE_URL.
const testUrl = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!testUrl) throw new Error('Set AI_INTERVIEW_TEST_DATABASE_URL to a disposable local PostgreSQL server')
const address = new URL(testUrl)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)) throw new Error('Phase 2 checks refuse non-local PostgreSQL')
const port = Number(address.port || '5432')
let externalAttempts = 0
const deny = () => { externalAttempts++; throw new Error('External network forbidden') }
const originalFetch = globalThis.fetch, originalConnect = net.Socket.prototype.connect
const oldHttp = { request: http.request, get: http.get, secureRequest: https.request, secureGet: https.get }
globalThis.fetch = deny
http.request = deny; http.get = deny; https.request = deny; https.get = deny
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const normalized = Array.isArray(args[0]) ? args[0] as unknown[] : args
  const options = typeof normalized[0] === 'object' ? normalized[0] as { host?: string; port?: number }
    : { port: normalized[0], host: normalized[1] }
  if (!options || !['127.0.0.1', 'localhost', '::1'].includes(String(options.host ?? '')) || Number(options.port) !== port) return deny()
  return Reflect.apply(originalConnect, this, args)
} as typeof originalConnect
syncBuiltinESMExports()

const databaseName = `ai_interview_phase4_${randomUUID().replaceAll('-', '')}`
const admin = new pg.Pool({ connectionString: testUrl, max: 1 })
let pool: pg.Pool | undefined
let closeAppPool: (() => Promise<void>) | undefined
let databaseCreated = false
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`)
  databaseCreated = true
  address.pathname = `/${databaseName}`
  process.env.DATABASE_URL = address.toString()
  process.env.SESSION_SECRET = 'phase4-offline-only-synthetic-signing-secret'
  process.env.NODE_ENV = 'development'
  pool = new pg.Pool({ connectionString: address.toString(), max: 8 })
  const schema = await import('../db/schema.js')
  const { users, sessions, candidates, jobOpenings, applications, jobDescriptions, aiInterviewEvents, aiInterviewEvaluations } = schema
  // Synthetic legacy parents only. We test the NEW migration verbatim on real
  // PostgreSQL; existing legacy migrations require extensions not needed here.
  // Unused legacy vector/enum columns are nullable text in this isolated fixture.
  for (const table of [users, sessions, candidates, jobOpenings, applications, jobDescriptions, schema.interviews, schema.interviewQuestions, schema.interviewAnswers]) {
    const config = getTableConfig(table)
    const columns = config.columns.map(column => {
      let type = column.getSQLType()
      if (!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(type)) type = 'text'
      return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}`
    })
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`)
  }
  // Match defaults used by the unchanged written answer handler in its fixture.
  await pool.query('ALTER TABLE interview_answers ALTER COLUMN id SET DEFAULT gen_random_uuid(), ALTER COLUMN answered_at SET DEFAULT now()')
  const migration = readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql', import.meta.url), 'utf8')
  const client = await pool.connect()
  try { await client.query('BEGIN'); await client.query(migration); await client.query('COMMIT') }
  catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  const database = drizzle(pool, { schema })
  const { InterviewRepository } = await import('./repository.js')
  const { InterviewService } = await import('./service.js')
  const { FakeClock } = await import('./clock.js')
  const { phase1Plan, phase1Answers } = await import('./fixtures.js')
  const { createInterviewRoutes, CANDIDATE_COOKIE } = await import('./routes.js')
  const { requireAuth } = await import('../middleware.js')
  closeAppPool = (await import('../db/client.js')).closeDb
  type Principal = import('./authorization.js').InterviewPrincipal
  const staffIds = { hr: randomUUID(), admin: randomUUID(), manager: randomUUID(), employee: randomUUID() }
  const staffCookies: Record<string, string> = {}
  for (const [role, id] of Object.entries(staffIds)) {
    await database.insert(users).values({ id, role: role as 'hr', isActive: true, email: `${role}@example.invalid`, employeeNumber: `SYN-${role}`,
      fullNameEn: 'Synthetic', fullNameAr: 'Synthetic', jobTitleEn: '', jobTitleAr: '', departmentEn: '', departmentAr: '' })
    const token = `synthetic-${id}`
    await database.insert(sessions).values({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: id, expiresAt: new Date(Date.now() + 3600000) })
    const cookieApp = new Hono().get('/', async c => { await setSignedCookie(c, 'hr_session', token, process.env.SESSION_SECRET!); return c.text('ok') })
    staffCookies[role] = (await cookieApp.request('/')).headers.get('set-cookie')!.split(';')[0]!
  }
  const hr: Principal = { kind: 'staff', userId: staffIds.hr }, system: Principal = { kind: 'system' }
  let serial = 0, checks = 0, failures = 0
  const next = () => `test:${++serial}`
  async function check(label: string, test: () => Promise<void> | void) {
    checks++
    try { await test(); console.log(`PASS ${String(checks).padStart(2, '0')} ${label}`) }
    catch (error) { failures++; console.error(`FAIL ${label}`, error) }
  }
  const rubric = { version: 'synthetic-rubric-v1', dimensions: aiInterviewDimensionSchema.options.map(dimension => ({ dimension, anchors: ['Absent', 'Basic', 'Partial', 'Applied', 'Explained trade-offs'] as [string,string,string,string,string] })) }
  const L = (en: string) => ({ en, ar: en }), list = (en: string[]) => ({ en, ar: en })
  async function fresh(ready = true) {
    const clock = new FakeClock(), service = new InterviewService(new InterviewRepository(database), clock, 'runtime-a')
    const openingId = randomUUID(), candidateId = randomUUID(), applicationId = randomUUID(), jdId = randomUUID()
    await database.insert(jobOpenings).values({ id: openingId, openedOn: '2026-11-01', titleEn: 'Synthetic role', titleAr: 'Synthetic role', departmentEn: '', departmentAr: '', status: 'open' })
    await database.insert(candidates).values({ id: candidateId, fullName: 'Synthetic participant', email: `${candidateId}@example.invalid`, notes: 'INTERNAL_HR_NOTE_NEVER_PUBLIC' })
    await database.insert(applications).values({ id: applicationId, openingId, candidateId, status: 'new', source: 'manual' })
    await database.insert(jobDescriptions).values({ id: jdId, openingId, titleEn: 'Synthetic role', titleAr: 'Synthetic role', status: 'approved', approvedAt: new Date(clock.now()),
      content: { title: L('Synthetic role'), summary: L(''), responsibilities: list([]), requiredQualifications: list([]), requiredSkills: list(['rag', 'problem-solving', 'operations']),
        preferredSkills: list([]), softSkills: list([]), experience: L(''), education: L(''), workingConditions: null },
      scorecard: { weights: [{ key: 'rag', weight: 60 }, { key: 'problem-solving', weight: 30 }, { key: 'operations', weight: 10 }] } })
    const body = { commandId: next(), plan: structuredClone(phase1Plan), rubric: structuredClone(rubric) }
    const created = await service.create(hr, applicationId, body)
    if (ready) await service.ready(hr, created.interviewId, { commandId: next(), expectedVersion: created.version })
    return { service, clock, id: created.interviewId, applicationId, candidateId, jdId, body }
  }
  type Fixture = Awaited<ReturnType<typeof fresh>>
  async function row(f: Fixture) { return f.service.load(system, f.id) }
  async function send(f: Fixture, command: AiInterviewCommand, principal: Principal = system) { return f.service.execute(principal, f.id, (await row(f)).version, command) }
  async function invited(f: Fixture) {
    const issued = await f.service.invite(hr, f.id, { commandId: next(), expectedVersion: (await row(f)).version })
    const exchanged = await f.service.exchange(issued.token!)
    return { token: issued.token!, credential: exchanged.credential, principal: { kind: 'candidate', credential: exchanged.credential } as Principal,
      cookie: `${CANDIDATE_COOKIE}=${exchanged.credential}` }
  }
  async function deliver(f: Fixture) {
    const playback = (await row(f)).snapshot.playback!
    await send(f, { type: 'AI_PLAYBACK_STARTED', playbackId: playback.id, commandId: next() })
    await send(f, { type: 'AI_PLAYBACK_FINISHED', playbackId: playback.id, commandId: next() })
  }
  async function listening(f: Fixture) {
    const session = await invited(f)
    await f.service.execute(session.principal, f.id, (await row(f)).version, { type: 'ACCEPT_CONSENT', policyVersion: 'ai-interview-v1', commandId: next() })
    await send(f, { type: 'START_INTERVIEW', commandId: next() }, session.principal)
    await deliver(f); await deliver(f)
    return session
  }
  async function answer(f: Fixture, text: string, p: Principal = system) {
    const turnId = (await row(f)).snapshot.draft!.turnId
    await send(f, { type: 'CANDIDATE_SPEECH_STARTED', turnId, commandId: next() }, p)
    await send(f, { type: 'CANDIDATE_TRANSCRIPT_FINAL', turnId, text, uncertain: false, commandId: next() }, p)
    return send(f, { type: 'CANDIDATE_SPEECH_FINISHED', turnId, commandId: next() }, p)
  }
  async function completed() {
    const f = await fresh(); await listening(f)
    for (const text of phase1Answers) {
      await answer(f, text); await send(f, { type: 'PROCESS_ANSWER', commandId: next() }); await deliver(f)
    }
    return f
  }
  function app(f: Fixture, secure = false) {
    const routes = createInterviewRoutes(f.service, { origins: ['http://localhost:5173'], secure })
    return new Hono().route('/api/recruitment', routes.staff).route('/api/ai-interview', routes.candidate)
      .get('/api/copilot/protected', requireAuth, c => c.text('protected'))
      .get('/api/voice/protected', requireAuth, c => c.text('protected'))
  }
  function request(appInstance: Hono, path: string, cookie?: string, body?: unknown, origin = 'http://localhost:5173') {
    return appInstance.request(path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }


  const { InterviewReportService,reportStorage }=await import('./reportService.js')
  const { MockReportEvaluator,reportInputHash,verifyInterviewReport }=await import('./report.js')
  const { aiInterviewReportSchema,reportCriterionSchema }=await import('@hr/shared')
  const f=await completed(), reports=new InterviewReportService(f.service), evaluator=new MockReportEvaluator()
  const get=()=>reports.get(hr,f.id,f.applicationId)
  const requestReport=async(operation:'RUN'|'RETRY'|'REEVALUATE'='RUN',commandId=next())=>reports.request(hr,f.id,f.applicationId,{operation,commandId,expectedVersion:(await row(f)).version})
  const pending=(await get()).evaluation
  await check('completed interview keeps evaluation PENDING',()=>{assert.equal(pending.status,'PENDING');assert.equal((f as Fixture).id,f.id)})
  const queue=await requestReport()
  const job=(await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId,f.id)))[0]!
  const input=reportStorage(job.results)!.input
  const identity={evaluationId:job.id,reportVersion:1,generatedAt:new Date(f.clock.now()).toISOString()}
  const evaluated=(i=input)=>evaluator.evaluateReport(i,identity)
  const verify=(r:unknown,i=input)=>verifyInterviewReport(r,i,identity)
  const clone=()=>structuredClone(input)
  const invalid=(mutate:(r:ReturnType<typeof evaluated>)=>void)=>{const r=evaluated();mutate(r);assert.throws(()=>verify(r))}
  const first=(r:ReturnType<typeof evaluated>)=>r.criteriaResults.flatMap(c=>c.evidence)[0]!
  await check('completed input contains persisted final answers and no PII/secrets/HR notes',()=>{assert(input.answers.length===4);for(const key of ['credential','email','notes','inviteTokenHash','candidateSessionHash'])assert(!JSON.stringify(input).includes(key))})
  await check('input uses frozen 0–4 rubric',()=>assert.deepEqual(input.frozen.rubric,f.body.rubric))
  await check('later JD mutation does not alter frozen input',async()=>{await database.update(jobDescriptions).set({titleEn:'Later edited role',content:{}}).where(eq(jobDescriptions.id,f.jdId));assert.equal((await get()).evaluation.inputHash,reportInputHash(input))})
  await check('later scorecard mutation does not alter frozen weights',async()=>{await database.update(jobDescriptions).set({scorecard:{weights:[{key:'rag',weight:1}]}}).where(eq(jobDescriptions.id,f.jdId));assert.equal((await get()).frozenWeights.find(w=>w.key==='rag')!.weight,60)})
  await check('same input has same canonical SHA256',()=>assert.equal(reportInputHash(input),reportInputHash(JSON.parse(JSON.stringify(input)))))
  await check('changed final answer changes hash',()=>{const i=clone();i.answers[0]!.answer.text+=' changed';assert.notEqual(reportInputHash(input),reportInputHash(i))})
  await check('changed rubric version changes hash',()=>{const i=clone();i.frozen.rubric.version+='-v2';assert.notEqual(reportInputHash(input),reportInputHash(i))})
  await check('changed criterion mapping changes hash',()=>{const i=clone();i.questions[0]!.criterionKey='operations';assert.notEqual(reportInputHash(input),reportInputHash(i))})
  await check('irrelevant answer finalized timestamps excluded from input',()=>{assert(input.answers.every(r=>!('finalizedAt' in r.answer)));assert.equal(reportInputHash(input),reportInputHash(clone()))})
  await check('assessed criterion has score, rationale and valid evidence',()=>{const r=verify(evaluated());assert(r.criteriaResults.some(c=>c.status==='ASSESSED'));for(const c of r.criteriaResults.filter(c=>c.status!=='NOT_ASSESSED'))assert(c.score!==null&&c.rationale&&c.evidence.length)})
  await check('NOT_ASSESSED is null and no evidence',()=>{const c=evaluated().criteriaResults.find(c=>c.criterionKey==='operations')!;assert.equal(c.status,'NOT_ASSESSED');assert.equal(c.score,null);assert.equal(c.evidence.length,0)})
  await check('unknown mock answers become NOT_ASSESSED, never zero',()=>{const i=clone();i.answers.forEach(a=>a.answer.text='Unsupported fixture answer');assert(evaluated(i).criteriaResults.every(c=>c.score===null&&c.status==='NOT_ASSESSED'))})
  await check('missing approved criterion is not omitted or zeroed',()=>{const r=evaluated();assert.equal(r.criteriaResults.length,input.frozen.criteria.length);assert(r.criteriaResults.some(c=>c.status==='NOT_ASSESSED'&&c.score===null))})
  await check('partial fixture becomes PARTIALLY_ASSESSED',()=>{const i=clone();i.answers.forEach(a=>a.answer.text='I checked some results.');assert(evaluated(i).criteriaResults.some(c=>c.status==='PARTIALLY_ASSESSED'&&c.score===1))})
  await check('NOT_ASSESSED with numeric zero is rejected by shared contract',()=>{const c=evaluated().criteriaResults.find(c=>c.status==='NOT_ASSESSED')!;assert.equal(reportCriterionSchema.safeParse({...c,score:0}).success,false)})
  await check('exact persisted quote validates',()=>assert(verify(evaluated()).evidenceValidation.verified>0))
  await check('invented quote rejected',()=>invalid(r=>{first(r).quote='I deployed Kubernetes at scale.'}))
  await check('wrong turn rejected',()=>invalid(r=>{first(r).turnId='turn:wrong'}))
  await check('wrong question rejected',()=>invalid(r=>{first(r).questionId='q:wrong'}))
  await check('wrong event sequence rejected',()=>invalid(r=>{first(r).eventSequence=999999}))
  await check('invalid offset rejected',()=>invalid(r=>{first(r).startOffset++}))
  await check('correct offsets accepted',()=>assert.doesNotThrow(()=>verify(evaluated())))
  await check('Arabic exact Unicode quotes validate',()=>{const i=clone();i.answers[0]!.answer.text='قست جودة الاسترجاع على أسئلة معلّمة وراجعت الأخطاء.';assert(verify(evaluated(i),i).criteriaResults.flatMap(c=>c.evidence).some(e=>e.quote.includes('قست')))})
  await check('mixed Arabic/English exact quotes validate without normalization',()=>{const i=clone();i.answers[0]!.answer.text='نفذت hybrid retrieval وقست recall@5 على أسئلة معلّمة.';assert(verify(evaluated(i),i).criteriaResults.flatMap(c=>c.evidence).some(e=>e.quote.includes('hybrid retrieval')))})
  await check('partial transcript cannot support a score/evidence',()=>{const i=clone();i.answers.forEach(r=>r.answer.textSource='partial');assert(evaluated(i).criteriaResults.every(c=>c.score===null));assert.throws(()=>verify(evaluated(),i))})
  await check('HR notes cannot be used as quoted evidence',()=>invalid(r=>{first(r).quote='INTERNAL_HR_NOTE_NEVER_PUBLIC'}))
  await check('uncertain transcript is NOT_ASSESSED',()=>{const i=clone();i.answers.forEach(r=>r.answer.transcriptionUncertain=true);assert(evaluated(i).criteriaResults.every(c=>c.score===null))})
  await check('incomplete question delivery does not support scoring',()=>{const i=clone();i.answers.forEach(r=>r.answer.questionDelivery='interrupted');assert(evaluated(i).criteriaResults.every(c=>c.score===null))})
  await check('multiple valid evidence items supported',()=>assert(evaluated().criteriaResults.some(c=>c.evidence.length>1)))
  await check('duplicate evidence ids rejected',()=>invalid(r=>{const e=r.criteriaResults.flatMap(c=>c.evidence);e[1]!.evidenceId=e[0]!.evidenceId}))
  await check('coverage counts are calculated from criterion statuses',()=>{const r=evaluated();assert.equal(r.coverage.assessed+r.coverage.partiallyAssessed+r.coverage.notAssessed,r.coverage.criteriaTotal)})
  await check('coverage explicitly counts not assessed',()=>assert.equal(evaluated().coverage.notAssessed,1))
  await check('coverage percent measures tested criteria, not performance',()=>{const r=evaluated();assert.equal(r.coverage.coveragePercent,66.67);assert.equal(r.overallScore,null)})
  await check('tampered coverage rejected',()=>invalid(r=>{r.coverage.assessed++}))
  await check('frozen approved weights retained without invented aggregation',()=>{assert.deepEqual(input.frozen.weights.map(w=>w.weight),[60,30,10]);assert.equal(evaluated().aggregationRule,'NONE_APPROVED_FOR_0_4')})
  await check('NOT_ASSESSED excluded from all numeric scoring',()=>{const r=evaluated();assert.equal(r.overallScore,null);assert.equal(r.criteriaResults.find(c=>c.status==='NOT_ASSESSED')!.score,null)})
  await check('no hidden/equal overall weighting generated',()=>assert.equal(evaluated().overallScore,null))
  await check('no approved aggregation => no overall score',()=>{const i=clone();i.frozen.weights.forEach(w=>w.weight=0);assert.equal(evaluated(i).overallScore,null)})
  await check('strength references criterion evidence',()=>{const r=evaluated();assert(r.strengths.length);assert.doesNotThrow(()=>verify(r))})
  await check('unsupported strength rejected',()=>invalid(r=>{r.strengths[0]!.evidenceIds=['invented']}))
  await check('weak fixture concern is supported by exact evidence',()=>{const i=clone();i.answers.forEach(a=>a.answer.text='I checked some results.');const r=verify(evaluated(i),i);assert(r.concerns.length);assert(r.concerns.every(c=>c.evidenceIds.length))})
  await check('lack of testing is limitation, not candidate weakness',()=>{const r=evaluated();assert(!r.concerns.some(c=>c.criterionKey==='operations'));assert(r.limitations.some(l=>l.includes('Coverage gap: operations')))})
  await check('unknown hiring decision field rejected by closed report schema',()=>assert.equal(aiInterviewReportSchema.safeParse({...evaluated(),hiringDecision:'HIRE'}).success,false))
  await check('protected trait result cannot enter approved criteria',()=>invalid(r=>{r.criteriaResults[0]!.criterionKey='nationality'}))
  await check('PENDING -> RUNNING is persisted before evaluator execution',async()=>{
    let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r})
    const slow=new InterviewReportService(f.service,{evaluateReport:async(i,identity)=>{entered();await gate;return evaluator.evaluateReport(i,identity)}})
    const running=slow.runJob(f.id,queue.reportVersion);await started;assert.equal((await get()).evaluation.status,'RUNNING');release();await running
  })
  await check('RUNNING -> COMPLETED persisted with versioned report',async()=>{const v=await get();assert.equal(v.evaluation.status,'COMPLETED');assert.equal(v.evaluation.report!.reportVersion,1);assert.equal(v.interviewStatus,'COMPLETED')})
  await check('duplicate job execution leaves report byte-identical',async()=>{const a=(await get()).evaluation.report;await Promise.all([reports.runJob(f.id,1),reports.runJob(f.id,1)]);assert.deepEqual((await get()).evaluation.report,a)})
  await check('request response-loss retry uses durable receipt',async()=>{const commandId=next(),body={operation:'REEVALUATE',commandId,expectedVersion:(await row(f)).version,evaluatorVersion:'mock-report-v2'};const a=await reports.request(hr,f.id,f.applicationId,body),b=await reports.request(hr,f.id,f.applicationId,body);assert.equal(a.reportVersion,b.reportVersion);assert.equal(b.duplicate,true);await reports.runJob(f.id,a.reportVersion)})
  await check('reevaluation creates v2 and preserves v1',async()=>{const v=await get();assert.equal(v.versions.length,2);assert.equal(v.evaluation.reportVersion,2);assert.equal((await reports.get(hr,f.id,f.applicationId,1)).evaluation.report!.evaluatorVersion,'mock-report-v1')})
  await check('legacy GENERATE_EVALUATION cannot overwrite new reports',async()=>assert.rejects(()=>send(f,{type:'GENERATE_EVALUATION',commandId:next()})))
  const failed=await completed(),failedAnswers=structuredClone((await row(failed)).snapshot.answers),fr=new InterviewReportService(failed.service,{evaluateReport:()=>{throw Error('secret transcript must not be logged')}})
  await fr.request(hr,failed.id,failed.applicationId,{operation:'RUN',commandId:next(),expectedVersion:(await row(failed)).version})
  await fr.runJob(failed.id,1)
  const fg=()=>fr.get(hr,failed.id,failed.applicationId)
  await check('RUNNING -> FAILED stores only safe failure code',async()=>{assert.equal((await fg()).evaluation.status,'FAILED');assert.equal((await fg()).evaluation.failureCode,'MOCK_EVALUATOR_FAILED')})
  await check('evaluation failure leaves interview COMPLETED',async()=>assert.equal((await row(failed)).snapshot.status,'COMPLETED'))
  await check('evaluation failure preserves all finalized answers',async()=>assert.deepEqual((await row(failed)).snapshot.answers,failedAnswers))
  const failureInputHash=(await fg()).evaluation.inputHash
  await check('retry uses same frozen input and evaluator version',async()=>{await fr.request(hr,failed.id,failed.applicationId,{operation:'RETRY',commandId:next(),expectedVersion:(await row(failed)).version});assert.equal((await fg()).evaluation.inputHash,failureInputHash)})
  await check('retry succeeds and preserves failed attempt metadata',async()=>{await new InterviewReportService(failed.service).runJob(failed.id,1);const v=await fg();assert.equal(v.evaluation.status,'COMPLETED');assert.equal(v.evaluation.attempts.length,2);assert.equal(v.evaluation.attempts[0]!.failureCode,'MOCK_EVALUATOR_FAILED');assert.equal(v.evaluation.retryCount,1)})
  await check('retry after completion cannot duplicate report',async()=>{const expectedVersion=(await row(failed)).version;await assert.rejects(()=>fr.request(hr,failed.id,failed.applicationId,{operation:'RETRY',commandId:next(),expectedVersion}),/evaluationNotRetryable/);assert.equal((await fg()).versions.length,1)})
  await check('invented evaluator quote fails entire report before persistence',async()=>{
    const invalidService=new InterviewReportService(failed.service,{evaluateReport:(i,identity)=>{const r=evaluator.evaluateReport(i,identity);first(r).quote='I deployed Kubernetes at scale.';return r}})
    await invalidService.request(hr,failed.id,failed.applicationId,{operation:'REEVALUATE',commandId:next(),expectedVersion:(await row(failed)).version});await invalidService.runJob(failed.id,2)
    const v=await fg();assert.equal(v.evaluation.status,'FAILED');assert.equal(v.evaluation.failureCode,'EVIDENCE_VALIDATION_FAILED');assert.equal(v.evaluation.report,null);assert((await invalidService.get(hr,failed.id,failed.applicationId,1)).evaluation.report)
  })
  const reviewBody=async()=>({commandId:next(),expectedVersion:(await row(f)).version,status:'REVIEWED',note:'Synthetic HR review note'})
  await check('authorized HR marks reviewed independently of evaluation',async()=>{await reports.review(hr,f.id,f.applicationId,2,await reviewBody());assert.equal((await get()).evaluation.humanReview.status,'REVIEWED')})
  await check('review metadata persists across service reload',async()=>{const v=await new InterviewReportService(f.service).get(hr,f.id,f.applicationId);assert.equal(v.evaluation.humanReview.reviewedBy,staffIds.hr);assert(v.evaluation.humanReview.reviewedAt);assert.equal(v.evaluation.humanReview.note,'Synthetic HR review note')})
  await check('employee cannot review',async()=>assert.rejects(()=>reports.review({kind:'staff',userId:staffIds.employee!},f.id,f.applicationId,2,{commandId:next(),expectedVersion:0,status:'REVIEWED',note:''})))
  await check('manager denied by default',async()=>assert.rejects(()=>reports.get({kind:'staff',userId:staffIds.manager!},f.id,f.applicationId)))
  await check('candidate cannot review',async()=>assert.rejects(()=>reports.review({kind:'candidate',credential:'anything'},f.id,f.applicationId,2,{commandId:next(),expectedVersion:0,status:'REVIEWED',note:''})))
  await check('review audited without note/transcript leakage',async()=>{const records=await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId,f.id));const audits=records.filter(r=>r.recordType==='AUDIT');assert(audits.some(r=>r.eventType==='REPORT_REVIEWED'));for(const a of audits){assert(!JSON.stringify(a.payload).includes('Synthetic HR review note'));assert(!JSON.stringify(a.payload).includes('recall@5'))}})
  const endpoint=`/api/recruitment/applications/${f.applicationId}/ai-interviews/${f.id}/evaluation`
  await check('HR/Admin report endpoints permitted',async()=>{assert.equal((await request(app(f),endpoint,staffCookies.hr)).status,200);assert.equal((await request(app(f),endpoint,staffCookies.admin)).status,200)})
  await check('candidate cannot fetch report or evidence trace',async()=>{const a=await invited(await fresh());assert.equal((await request(app(f),endpoint,a.cookie)).status,401)})
  await check('employee/manager endpoints denied',async()=>{assert.equal((await request(app(f),endpoint,staffCookies.employee)).status,403);assert.equal((await request(app(f),endpoint,staffCookies.manager)).status,403)})
  await check('Candidate A cannot access B report via any candidate session',async()=>{assert.equal((await request(app(f),endpoint,`${CANDIDATE_COOKIE}=${f.id}.invalid`)).status,401);assert.equal((await request(app(f),`/api/ai-interview/evaluation?interviewId=${f.id}`)).status,404)})
  await check('wrong application relation cannot fetch report',async()=>assert.rejects(()=>reports.get(hr,f.id,randomUUID())))
  await check('candidate DTO and replay leak no report fields',async()=>{const dto=f.service.candidateState(await row(f));for(const key of ['inputHash','criteriaResults','rubric','weights','score','strengths','concerns','humanReview','reportVersion'])assert(!(key in dto));assert(!JSON.stringify(dto).includes('Synthetic HR review note'))})
  await check('review changes do not mutate immutable report or input',async()=>{const v=await get(),r=structuredClone(v.evaluation.report),hash=v.evaluation.inputHash;await reports.review(hr,f.id,f.applicationId,2,{commandId:next(),expectedVersion:v.version,status:'UNREVIEWED',note:''});assert.deepEqual((await get()).evaluation.report,r);assert.equal((await get()).evaluation.inputHash,hash)})
  await check('application hiring status never changed by evaluation/review',async()=>{assert.equal((await database.select().from(applications).where(eq(applications.id,f.applicationId)))[0]!.status,'new');assert.equal((await database.select().from(applications).where(eq(applications.id,failed.applicationId)))[0]!.status,'new')})
  await check('pending job survives new service instance',async()=>{
    const restored=await completed(),r=new InterviewReportService(restored.service)
    await r.request(hr,restored.id,restored.applicationId,{operation:'RUN',commandId:next(),expectedVersion:(await row(restored)).version})
    await new InterviewReportService(restored.service).runJob(restored.id,1)
    assert.equal((await r.get(hr,restored.id,restored.applicationId)).evaluation.status,'COMPLETED')
  })
  await check('expired worker lease is reclaimed and stale worker cannot overwrite report',async()=>{
    const restored=await completed();let count=0,entered!:()=>void,release!:()=>void
    const start=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r})
    const r=new InterviewReportService(restored.service,{evaluateReport:async(i,identity)=>{count++;if(count===1){entered();await gate}return evaluator.evaluateReport(i,identity)}})
    await r.request(hr,restored.id,restored.applicationId,{operation:'RUN',commandId:next(),expectedVersion:(await row(restored)).version})
    const old=r.runJob(restored.id,1);await start;await r.runJob(restored.id,1);assert.equal(count,1)
    restored.clock.advance(300001);await r.runJob(restored.id,1)
    const committed=(await r.get(hr,restored.id,restored.applicationId)).evaluation.report;release();await old
    const final=await r.get(hr,restored.id,restored.applicationId);assert.deepEqual(final.evaluation.report,committed);assert.equal(final.evaluation.attempts.length,2);assert.equal(final.evaluation.attempts[0]!.failureCode,'WORKER_LEASE_EXPIRED')
  })
  await check('review receipt is idempotent and bound to exact note',async()=>{
    const body={commandId:next(),expectedVersion:(await row(f)).version,status:'REVIEWED',note:'Review receipt fixture'}
    await reports.review(hr,f.id,f.applicationId,2,body);assert.equal((await reports.review(hr,f.id,f.applicationId,2,body)).duplicate,true)
    await assert.rejects(()=>reports.review(hr,f.id,f.applicationId,2,{...body,note:'Changed note'}),/interviewCommandConflict/)
  })
  await check('zero external model/network calls',()=>assert.equal(externalAttempts,0))
  console.log(`\n${checks-failures}/${checks} Phase 4 report checks passed; external network attempts=${externalAttempts}`)
  if(failures)process.exitCode=1
} finally {
  await closeAppPool?.()
  await pool?.end()
  // The identifier is generated above; never delete or touch the configured app DB.
  if (databaseCreated && /^ai_interview_phase4_[a-f0-9]{32}$/.test(databaseName)) await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
  await admin.end()
  globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect
  http.request = oldHttp.request; http.get = oldHttp.get; https.request = oldHttp.secureRequest; https.get = oldHttp.secureGet
  syncBuiltinESMExports()
}
