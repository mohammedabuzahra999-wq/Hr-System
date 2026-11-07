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

const databaseName = `ai_interview_phase2_${randomUUID().replaceAll('-', '')}`
const admin = new pg.Pool({ connectionString: testUrl, max: 1 })
let pool: pg.Pool | undefined
let closeAppPool: (() => Promise<void>) | undefined
let databaseCreated = false
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`)
  databaseCreated = true
  address.pathname = `/${databaseName}`
  process.env.DATABASE_URL = address.toString()
  process.env.SESSION_SECRET = 'phase2-offline-only-synthetic-signing-secret'
  process.env.NODE_ENV = 'development'
  pool = new pg.Pool({ connectionString: address.toString(), max: 8 })
  const schema = await import('../db/schema.js')
  const { users, sessions, candidates, jobOpenings, applications, jobDescriptions, aiInterviews, aiInterviewEvaluations } = schema
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
  const { tokenHash } = await import('./authorization.js')
  const { createInterviewRoutes, CANDIDATE_COOKIE } = await import('./routes.js')
  const { requireAuth } = await import('../middleware.js')
  closeAppPool = (await import('../db/client.js')).closeDb
  const { evaluationInputHash } = await import('./evaluationInput.js')
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
      content: { title: L('Synthetic role'), summary: L(''), responsibilities: list([]), requiredQualifications: list([]), requiredSkills: list(['rag', 'problem-solving']),
        preferredSkills: list([]), softSkills: list([]), experience: L(''), education: L(''), workingConditions: null },
      scorecard: { weights: [{ key: 'rag', weight: 60 }, { key: 'problem-solving', weight: 40 }] } })
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

  await check('01 create persists, including idempotent creation', async () => {
    const f = await fresh(false), loaded = await row(f)
    assert.equal(loaded.applicationId, f.applicationId); assert.equal(loaded.snapshot.status, 'CREATED')
    assert.equal((await f.service.create(hr, f.applicationId, f.body)).interviewId, f.id)
  })
  await check('02 state transition persists', async () => { const f = await fresh(); assert.equal((await row(f)).snapshot.status, 'READY') })
  await check('03 durable event sequence is unique and ordered', async () => {
    const f = await fresh(), events = await f.service.getEventsAfter(hr, f.id, 0)
    assert.deepEqual(events.map(e => e.sequence), events.map((_, i) => i + 1))
  })
  await check('04 evaluation status persists independently', async () => { const f = await completed(); const r = await row(f); assert.equal(r.snapshot.status, 'COMPLETED'); assert.equal(r.snapshot.evaluationStatus, 'PENDING') })
  await check('05 approved plan survives repository reload', async () => {
    const f = await fresh(), reloaded = new InterviewService(new InterviewRepository(database), f.clock, 'runtime-b')
    assert.deepEqual((await reloaded.load(hr, f.id)).snapshot.plan, phase1Plan)
  })
  await check('06 rubric, criteria and weights remain frozen after source edits', async () => {
    const f = await fresh(), before = (await row(f)).frozenInputs
    f.body.rubric.dimensions[0]!.anchors[0] = 'changed outside'
    await database.update(jobDescriptions).set({ scorecard: { weights: [{ key: 'rag', weight: 1 }] } }).where(eq(jobDescriptions.id, f.jdId))
    assert.deepEqual((await row(f)).frozenInputs, before)
  })
  await check('07 restart reload restores the aggregate', async () => { const f = await fresh(); assert.equal((await new InterviewService(new InterviewRepository(database), f.clock, 'restart').load(hr, f.id)).id, f.id) })
  await check('08 stale expectedVersion rejected', async () => { const f = await fresh(); await assert.rejects(f.service.invite(hr, f.id, { commandId: next(), expectedVersion: 0 }), /interviewVersionConflict/) })
  await check('09 two real PostgreSQL transactions cannot consume the same version', async () => {
    const f = await fresh(); await listening(f); const version = (await row(f)).version
    const outcomes = await Promise.allSettled([1, 2].map(() => f.service.execute(system, f.id, version, { type: 'PAUSE_INTERVIEW', reason: 'USER', commandId: next() })))
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1); assert.equal((await row(f)).version, version + 1)
  })
  await check('10 duplicate command has no second state/event effect', async () => {
    const f = await fresh(), request = { commandId: next(), expectedVersion: (await row(f)).version }
    const first = await f.service.invite(hr, f.id, request), retry = await f.service.invite(hr, f.id, request)
    assert.equal(retry.duplicate, true); assert.equal(first.row.version, retry.row.version); assert.equal(first.row.lastSequence, retry.row.lastSequence); assert.equal(retry.token, null)
  })
  await check('11 idempotency survives new service/repository instance', async () => {
    const f = await fresh(), request = { commandId: next(), expectedVersion: (await row(f)).version }
    await f.service.invite(hr, f.id, request)
    const restarted = new InterviewService(new InterviewRepository(database), f.clock, 'restart')
    assert.equal((await restarted.invite(hr, f.id, request)).duplicate, true)
  })
  await check('12 commit-before-lost-ack retry does not duplicate answer', async () => {
    const f = await fresh(); const session = await listening(f), turnId = (await row(f)).snapshot.draft!.turnId
    await send(f, { type: 'CANDIDATE_SPEECH_STARTED', turnId, commandId: next() }, session.principal)
    await send(f, { type: 'CANDIDATE_TRANSCRIPT_FINAL', turnId, text: phase1Answers[0], uncertain: false, commandId: next() }, session.principal)
    const command: AiInterviewCommand = { type: 'CANDIDATE_SPEECH_FINISHED', turnId, commandId: next() }, version = (await row(f)).version
    const committed = await f.service.execute(session.principal, f.id, version, command)
    const restarted = new InterviewService(new InterviewRepository(database), f.clock, 'restart')
    const retry = await restarted.execute(session.principal, f.id, version, command)
    assert.equal(retry.duplicate, true); assert.equal(retry.row.snapshot.answers.length, 1); assert.equal(retry.row.version, committed.row.version)
  })
  await check('13 secure invite exchange succeeds', async () => { const f = await fresh(); const s = await invited(f); assert.equal((await f.service.load(s.principal, f.id)).id, f.id) })
  await check('14 wrong token is rejected', async () => { const f = await fresh(); await assert.rejects(f.service.exchange('x'.repeat(43)), /invitationInvalid/) })
  await check('15 expired invitation is rejected', async () => {
    const f = await fresh(), invite = await f.service.invite(hr, f.id, { commandId: next(), expectedVersion: (await row(f)).version }); f.clock.advance(86400000)
    await assert.rejects(f.service.exchange(invite.token!), /invitationInvalid/)
  })
  await check('16 revoked invitation is rejected', async () => {
    const f = await fresh(), invite = await f.service.invite(hr, f.id, { commandId: next(), expectedVersion: (await row(f)).version })
    await f.service.revoke(hr, f.id, { commandId: next(), expectedVersion: invite.row.version }); await assert.rejects(f.service.exchange(invite.token!), /invitationInvalid/)
  })
  await check('17 only invitation/session hashes are persisted', async () => {
    const f = await fresh(), s = await invited(f), r = await row(f)
    assert.equal(r.inviteTokenHash, tokenHash('invite', s.token)); assert.equal(r.candidateSessionHash, tokenHash('session', s.credential))
    assert(!JSON.stringify(r).includes(s.token)); assert(!JSON.stringify(r).includes(s.credential))
  })
  await check('18 logs and audit contain no credentials', async () => {
    const f = await fresh(), logs: string[] = [], saved = console.log, savedError = console.error
    let s: Awaited<ReturnType<typeof invited>>
    try { console.log = (...v) => { logs.push(v.join(' ')) }; console.error = console.log; s = await invited(f) }
    finally { console.log = saved; console.error = savedError }
    const serialized = JSON.stringify(await f.service.getEventsAfter(hr, f.id, 0)) + logs.join('')
    assert(!serialized.includes(s!.token)); assert(!serialized.includes(s!.credential))
  })
  await check('19 invitation cannot exchange for another interview', async () => {
    const a = await fresh(), b = await fresh(), invite = await a.service.invite(hr, a.id, { commandId: next(), expectedVersion: (await row(a)).version })
    await assert.rejects(a.service.exchange(invite.token!, b.id), /invitationInvalid/)
  })
  await check('20 valid candidate session survives restart', async () => {
    const f = await fresh(), s = await invited(f), restarted = new InterviewService(new InterviewRepository(database), f.clock, 'restart')
    assert.equal((await restarted.load(s.principal, f.id)).id, f.id)
  })
  let isolated: { a: Fixture; b: Fixture; session: Awaited<ReturnType<typeof invited>> }
  await check('21 Candidate A GET Interview B denied', async () => {
    const a = await fresh(), b = await fresh(), session = await invited(a); isolated = { a, b, session }
    assert.equal((await request(app(a), `/api/ai-interview/state?interviewId=${b.id}`, session.cookie)).status, 401)
  })
  await check('22 candidate cannot access employee recruitment routes', async () => {
    const { a, session } = isolated; assert.equal((await request(app(a), `/api/recruitment/applications/${a.applicationId}/ai-interviews/${a.id}`, session.cookie)).status, 401)
  })
  await check('23 employee cookie is never candidate authentication', async () => { const f = await fresh(); assert.equal((await request(app(f), '/api/ai-interview/state', staffCookies.hr)).status, 401) })
  await check('24 candidate cannot authenticate Copilot/employee Voice', async () => {
    const { a, session } = isolated
    for (const path of ['/api/copilot/protected', '/api/voice/protected']) assert.equal((await request(app(a), path, session.cookie)).status, 401)
  })
  await check('25 expired and revoked sessions are rejected', async () => {
    const f = await fresh(), s = await invited(f); f.clock.advance(7200000); await assert.rejects(f.service.load(s.principal, f.id), /candidateSessionInvalid/)
    const g = await fresh(), t = await invited(g); await g.service.revoke(hr, g.id, { commandId: next(), expectedVersion: (await row(g)).version })
    await assert.rejects(g.service.load(t.principal, g.id), /candidateSessionInvalid/)
  })
  let dto: string
  await check('26 candidate DTO does not expose rubric', async () => { const f = await fresh(); dto = JSON.stringify(f.service.candidateState(await row(f))); assert(!dto.includes('rubric')) })
  await check('27 candidate DTO does not expose weights', () => assert(!dto.includes('weight')))
  await check('28 candidate DTO does not expose HR notes or criteria', () => { assert(!dto.includes('INTERNAL_HR_NOTE')); assert(!dto.includes('criterion')) })
  await check('29 candidate DTO does not expose future questions', () => { assert(!dto.includes(phase1Plan.questions[1]!.prompt)); assert(!dto.includes('followUps')) })
  await check('30 candidate DTO does not expose evaluation', () => assert(!dto.includes('evaluation')))
  await check('31 candidate DTO does not expose token hashes', () => assert(!dto.includes('Hash')))
  let paused: Fixture, pausedSession: Awaited<ReturnType<typeof invited>>
  await check('32 pause persists exactly 75 seconds remaining', async () => {
    paused = await fresh(); pausedSession = await listening(paused); paused.clock.advance(45000)
    await send(paused, { type: 'PAUSE_INTERVIEW', reason: 'USER', commandId: next() }, pausedSession.principal)
    assert.equal((await row(paused)).snapshot.timer!.pausedRemainingMs, 75000)
  })
  await check('33 restart preserves paused timer', async () => {
    paused.service = new InterviewService(new InterviewRepository(database), paused.clock, 'restart')
    assert.equal((await paused.service.load(pausedSession.principal, paused.id)).snapshot.timer!.pausedRemainingMs, 75000)
  })
  await check('34 five minutes offline consumes no frozen time', async () => { paused.clock.advance(300000); assert.equal((await row(paused)).snapshot.timer!.pausedRemainingMs, 75000) })
  await check('35 active runtime restart recovers safely into PAUSED', async () => {
    const f = await fresh(); const s = await listening(f); f.clock.advance(45000)
    await send(f, { type: 'TIMER_TICK', commandId: next() }) // Last known healthy observation.
    f.clock.advance(300000); f.service = new InterviewService(new InterviewRepository(database), f.clock, 'restart')
    const restored = await f.service.load(s.principal, f.id)
    assert.equal(restored.snapshot.status, 'PAUSED'); assert.equal(restored.pauseReason, 'SERVER_RESTART')
    assert.equal(restored.snapshot.timer!.pausedRemainingMs, 75000); assert.equal(restored.snapshot.draft!.turnId, 'turn:1')
  })
  await check('36 resume computes a new authoritative deadline', async () => {
    await send(paused, { type: 'RESUME_INTERVIEW', commandId: next() }, pausedSession.principal)
    assert.equal((await row(paused)).snapshot.timer!.answerDeadlineAt, paused.clock.now() + 75000)
  })
  await check('37 afterSequence returns only newer records', async () => {
    const f = await completed(), all = await f.service.getEventsAfter(hr, f.id, 0), after = await f.service.getEventsAfter(hr, f.id, 15)
    assert.deepEqual(after.map(e => e.sequence), all.filter(e => e.sequence > 15).map(e => e.sequence))
  })
  await check('38 event replay remains ordered after reload', async () => {
    const f = await fresh(), loaded = new InterviewService(new InterviewRepository(database), f.clock, 'restart'), events = await loaded.getEventsAfter(hr, f.id, 0)
    assert.deepEqual(events.map(e => e.sequence), [...events.map(e => e.sequence)].sort((a, b) => a - b))
  })
  await check('39 Candidate A cannot replay Interview B events', async () => {
    const { a, b, session } = isolated; assert.equal((await request(app(a), `/api/ai-interview/events?interviewId=${b.id}&afterSequence=0`, session.cookie)).status, 401)
  })
  await check('40 start is blocked without persisted consent', async () => { const f = await fresh(), s = await invited(f); await assert.rejects(send(f, { type: 'START_INTERVIEW', commandId: next() }, s.principal), /interviewConsentRequired/) })
  let consented: Fixture
  await check('41 consent persists with policy version and accepted time', async () => {
    consented = await fresh(); const s = await invited(consented)
    await consented.service.execute(s.principal, consented.id, (await row(consented)).version, { type: 'ACCEPT_CONSENT', commandId: next(), policyVersion: 'ai-interview-v1' })
    assert.deepEqual((await row(consented)).consent, { acceptedAt: consented.clock.now(), policyVersion: 'ai-interview-v1' })
  })
  await check('42 consent survives restart', async () => { const s = new InterviewService(new InterviewRepository(database), consented.clock, 'restart'); assert.equal((await s.load(hr, consented.id)).consent!.policyVersion, 'ai-interview-v1') })
  let finished: Fixture
  await check('43 completed interview with evaluation PENDING is durable', async () => {
    finished = await completed(); const stored = await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, finished.id))
    assert.equal(stored[0]!.status, 'PENDING'); assert.equal((await row(finished)).snapshot.status, 'COMPLETED')
  })
  await check('44 completed evaluation survives reload and uses persisted evidence', async () => {
    await send(finished, { type: 'GENERATE_EVALUATION', commandId: next() })
    const stored = (await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, finished.id)))[0]!
    assert.equal(stored.status, 'COMPLETED'); assert(Array.isArray(stored.results)); assert.equal(stored.results.length, 4); assert(stored.results[0]!.dimensions[0]!.evidence.length)
  })
  await check('45 canonical evaluation hash is stable and excludes unrelated timestamps', async () => {
    const r = await row(finished), a = r.snapshot.answers, b = structuredClone(a); b[0]!.finalizedAt++
    assert.equal(evaluationInputHash(r.frozenInputs!, a, 10, 5), evaluationInputHash(r.frozenInputs!, b, 10, 5))
  })
  await check('46 changed answer, rubric or included version changes hash', async () => {
    const r = await row(finished), original = evaluationInputHash(r.frozenInputs!, r.snapshot.answers, 10, 5), changed = structuredClone(r.snapshot.answers)
    changed[0]!.text += ' changed'; assert.notEqual(evaluationInputHash(r.frozenInputs!, changed, 10, 5), original)
    const frozen = structuredClone(r.frozenInputs!); frozen.rubric.version = 'new-version'
    assert.notEqual(evaluationInputHash(frozen, r.snapshot.answers, 10, 5), original)
    assert.notEqual(evaluationInputHash(r.frozenInputs!, r.snapshot.answers, 11, 5), original)
  })
  await check('47 forged persisted evidence is rejected transactionally', async () => {
    const f = await completed(), r = await row(f); r.snapshot.evaluations[0]!.dimensions[0]!.evidence[0]!.exactQuote = 'not in transcript'
    await database.update(aiInterviews).set({ snapshot: r.snapshot }).where(eq(aiInterviews.id, f.id))
    await assert.rejects(send(f, { type: 'GENERATE_EVALUATION', commandId: next() }), /invalidEvaluationEvidence/)
    assert.equal((await row(f)).snapshot.evaluationStatus, 'PENDING')
  })
  await check('48 no overall score or hiring decision is created', async () => {
    const record = (await database.select().from(applications).where(eq(applications.id, finished.applicationId)))[0]!
    assert.equal(record.status, 'new'); assert.equal(record.decisionNote, null)
    assert(!JSON.stringify((await row(finished)).snapshot.evaluations).includes('hiringDecision'))
  })
  await check('Candidate A POST command to Interview B denied', async () => {
    const { a, b, session } = isolated
    assert.equal((await request(app(a), '/api/ai-interview/commands', session.cookie, { interviewId: b.id, expectedVersion: (await row(b)).version, command: { type: 'CANCEL_INTERVIEW', commandId: next() } })).status, 401)
  })
  await check('Candidate A resume Interview B denied', async () => {
    const { a, b, session } = isolated
    assert.equal((await request(app(a), '/api/ai-interview/commands', session.cookie, { interviewId: b.id, expectedVersion: (await row(b)).version, command: { type: 'RESUME_INTERVIEW', commandId: next() } })).status, 401)
  })
  await check('candidate cannot submit privileged/internal commands', async () => {
    const { a, session } = isolated
    for (const type of ['MARK_READY', 'GENERATE_EVALUATION', 'TIMER_TICK', 'PROCESS_ANSWER']) {
      assert.equal((await request(app(a), '/api/ai-interview/commands', session.cookie, { interviewId: a.id, expectedVersion: (await row(a)).version, command: { type, commandId: next() } })).status, 422)
    }
  })
  await check('HR/Admin allowed and Managers denied in routes AND service', async () => {
    const f = await fresh(), path = `/api/recruitment/applications/${f.applicationId}/ai-interviews/${f.id}`
    for (const role of ['hr', 'admin']) assert.equal((await request(app(f), path, staffCookies[role])).status, 200)
    for (const role of ['manager', 'employee']) {
      assert.equal((await request(app(f), path, staffCookies[role])).status, 403)
      await assert.rejects(f.service.load({ kind: 'staff', userId: staffIds[role as 'manager'] }, f.id), /forbidden/)
    }
  })
  await check('candidate cookies, cache headers, single-use invites and Origin protection', async () => {
    const f = await fresh(), invite = await f.service.invite(hr, f.id, { commandId: next(), expectedVersion: (await row(f)).version })
    const response = await request(app(f, true), '/api/ai-interview/session/exchange', undefined, { token: invite.token })
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie')!
    for (const field of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/ai-interview']) assert(cookie.includes(field))
    assert(response.headers.get('cache-control')!.includes('no-store')); assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    await assert.rejects(f.service.exchange(invite.token!), /invitationInvalid/)
    assert.equal((await request(app(f), '/api/ai-interview/session/exchange', undefined, { token: invite.token }, 'https://attacker.invalid')).status, 403)
  })
  await check('database failure rolls back events, aggregate and command receipt together', async () => {
    const f = await fresh(), before = await row(f)
    await pool!.query("CREATE FUNCTION phase2_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command_id = 'rollback-test' AND NEW.record_type = 'COMMAND' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$")
    await pool!.query('CREATE TRIGGER phase2_fail BEFORE INSERT ON ai_interview_events FOR EACH ROW EXECUTE FUNCTION phase2_test_fail()')
    try { await assert.rejects(f.service.invite(hr, f.id, { commandId: 'rollback-test', expectedVersion: before.version })) }
    finally { await pool!.query('DROP TRIGGER phase2_fail ON ai_interview_events'); await pool!.query('DROP FUNCTION phase2_test_fail()') }
    const after = await row(f); assert.equal(after.version, before.version); assert.equal(after.lastSequence, before.lastSequence); assert.equal(after.inviteTokenHash, null)
    assert.equal((await f.service.getEventsAfter(hr, f.id, 0)).length, before.lastSequence)
  })
  await check('reused command id with changed content is rejected', async () => {
    const f = await fresh(), version = (await row(f)).version, commandId = next(); await f.service.invite(hr, f.id, { commandId, expectedVersion: version })
    await assert.rejects(f.service.revoke(hr, f.id, { commandId, expectedVersion: version }), /interviewCommandConflict/)
  })
  await check('recovery during AI delivery requires a new playback id', async () => {
    const f = await fresh(), s = await invited(f)
    await f.service.execute(s.principal, f.id, (await row(f)).version, { type: 'ACCEPT_CONSENT', policyVersion: 'ai-interview-v1', commandId: next() })
    await send(f, { type: 'START_INTERVIEW', commandId: next() }, s.principal)
    const old = (await row(f)).snapshot.playback!.id
    f.service = new InterviewService(new InterviewRepository(database), f.clock, 'restart')
    assert.equal((await f.service.load(s.principal, f.id)).snapshot.status, 'PAUSED')
    await send(f, { type: 'RESUME_INTERVIEW', commandId: next() }, s.principal)
    assert.notEqual((await row(f)).snapshot.playback!.id, old); assert.equal((await row(f)).snapshot.timer, null)
  })
  await check('candidate replay returns only allowlisted metadata, never raw payloads', async () => {
    const f = await fresh(), s = await listening(f), events = await f.service.getEventsAfter(s.principal, f.id, 0)
    for (const event of events) assert.deepEqual(Object.keys(event).sort(), ['at', 'sequence', 'type'])
    assert(!JSON.stringify(events).includes('fingerprint'))
  })
  await check('revocation succeeds even when an active answer deadline already expired', async () => {
    const f = await fresh(), s = await listening(f); f.clock.advance(150000)
    await f.service.revoke(hr, f.id, { commandId: next(), expectedVersion: (await row(f)).version })
    const r = await row(f); assert.equal(r.snapshot.status, 'PAUSED'); assert.equal(r.snapshot.answers[0]!.timedOut, true)
    await assert.rejects(f.service.load(s.principal, f.id), /candidateSessionInvalid/)
  })
  await check('renaming candidate credential to hr_session never grants employee authentication', async () => {
    const { a, session } = isolated
    assert.equal((await request(app(a), '/api/copilot/protected', `hr_session=${session.credential}`)).status, 401)
  })
  await check('exchange endpoint enforces the existing in-memory rate limit', async () => {
    const { resetRateLimits } = await import('../rateLimit.js'); resetRateLimits()
    const f = await fresh(), router = app(f)
    for (let i = 0; i < 10; i++) assert.equal((await request(router, '/api/ai-interview/session/exchange', undefined, { token: 'x'.repeat(43) })).status, 401)
    assert.equal((await request(router, '/api/ai-interview/session/exchange', undefined, { token: 'x'.repeat(43) })).status, 429)
    resetRateLimits()
  })
  await check('filtered replay still advances its cursor across internal records', async () => {
    const f = await fresh(), s = await invited(f), page = await f.service.getEventsPage(s.principal, f.id, 0)
    assert.equal(page.events.length, 0); assert.equal(page.nextAfterSequence, (await row(f)).lastSequence); assert.equal(page.hasMore, false)
  })
  await check('transient partials cannot be persisted through the service command API', async () => {
    const f = await fresh(); await listening(f)
    const before = await row(f)
    await assert.rejects(send(f, { type: 'CANDIDATE_TRANSCRIPT_PARTIAL', commandId: next(), turnId: before.snapshot.draft!.turnId, text: 'EPHEMERAL_PARTIAL' }), /internalInterviewCommandDenied/)
    assert.equal(JSON.stringify(await row(f)).includes('EPHEMERAL_PARTIAL'), false)
  })
  await check('database rejects a version projection that disagrees with the snapshot', async () => {
    const f = await fresh(), r = await row(f)
    await assert.rejects(database.update(aiInterviews).set({ version: r.version + 1 }).where(eq(aiInterviews.id, f.id)))
    assert.equal((await row(f)).version, r.version)
  })
  await check('existing written-interview routes still read and accept only their own questions', async () => {
    const f = await fresh(), g = await fresh(), interviewId = randomUUID(), otherId = randomUUID()
    const token = `synthetic-written-${randomUUID()}`, otherToken = `synthetic-written-${randomUUID()}`
    await database.insert(schema.interviews).values([
      { id: interviewId, applicationId: f.applicationId, token, status: 'sent', criteria: [], expiresAt: new Date(f.clock.now() + 3600000) },
      { id: otherId, applicationId: g.applicationId, token: otherToken, status: 'sent', criteria: [], expiresAt: new Date(f.clock.now() + 3600000) },
    ])
    const ownQuestion = randomUUID(), nextQuestion = randomUUID(), otherQuestion = randomUUID()
    await database.insert(schema.interviewQuestions).values([
      { id: ownQuestion, interviewId, ordinal: 1, textEn: 'Synthetic written question', textAr: 'Synthetic written question', questionType: 'written', approvalStatus: 'approved' },
      { id: nextQuestion, interviewId, ordinal: 2, textEn: 'Next written question', textAr: 'Next written question', questionType: 'written', approvalStatus: 'approved' },
      { id: otherQuestion, interviewId: otherId, ordinal: 1, textEn: 'Other question', textAr: 'Other question', questionType: 'written', approvalStatus: 'approved' },
    ])
    const { interviewRoutes } = await import('../routes/interview.js')
    const legacy = new Hono().route('/api/interview', interviewRoutes)
    const result = await legacy.request(`/api/interview/${token}`)
    assert.equal(result.status, 200); assert.equal((await result.json() as { questions: unknown[] }).questions.length, 2)
    assert.equal((await request(legacy, `/api/interview/${token}/answer`, undefined, { questionId: otherQuestion, text: 'Synthetic answer' })).status, 404)
    const accepted = await request(legacy, `/api/interview/${token}/answer`, undefined, { questionId: ownQuestion, text: 'Synthetic answer' })
    assert.equal(accepted.status, 200); assert.deepEqual(await accepted.json(), { remaining: 1, completed: false })
  })
  await check('external network/AI attempts are zero with real local PostgreSQL', () => assert.equal(externalAttempts, 0))
  console.log(`\n${checks - failures}/${checks} Phase 2 PostgreSQL/security checks passed; external network attempts=${externalAttempts}; disposable DB cleanup follows`)
  if (failures) process.exitCode = 1
} finally {
  await closeAppPool?.()
  await pool?.end()
  // The identifier is generated above; never delete or touch the configured app DB.
  if (databaseCreated && /^ai_interview_phase2_[a-f0-9]{32}$/.test(databaseName)) await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
  await admin.end()
  globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect
  http.request = oldHttp.request; http.get = oldHttp.get; https.request = oldHttp.secureRequest; https.get = oldHttp.secureGet
  syncBuiltinESMExports()
}
