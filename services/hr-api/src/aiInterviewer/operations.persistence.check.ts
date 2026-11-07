import { setSignedCookie } from 'hono/cookie'
import { InterviewShutdown } from './shutdown.js'
import type { InterviewReportService as ReportService } from './reportService.js'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import net from 'node:net'
import { syncBuiltinESMExports } from 'node:module'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { aiInterviewDimensionSchema } from '@hr/shared'
import { InterviewDeliveryGate, type InterviewDeliveryAdapter } from './delivery.js'
import type { DeliveryContext, ProviderObservation } from './deliveryContracts.js'
import { deferred, nextTurn } from './runtimeTestSupport.js'

const connection = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!connection) throw Error('An isolated local AI_INTERVIEW_TEST_DATABASE_URL is required')
const url = new URL(connection)
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Refusing a nonlocal database')
const savedFetch = globalThis.fetch, savedConnect = net.Socket.prototype.connect
let external = 0, checks = 0
globalThis.fetch = () => { external++; throw Error('External network forbidden') }
net.Socket.prototype.connect = function(this: net.Socket, ...args: unknown[]) {
  const a = Array.isArray(args[0]) ? args[0] as unknown[] : args, o = typeof a[0] === 'object' ? a[0] as {host?: string; port?: number} : {host: a[1], port: a[0]}
  if (!['localhost', '127.0.0.1', '::1'].includes(String(o.host)) || Number(o.port) !== Number(url.port || 5432)) { external++; throw Error('External socket forbidden') }
  return Reflect.apply(savedConnect, this, args)
} as typeof savedConnect
syncBuiltinESMExports()
const name = 'ai_interview_phase55_' + randomUUID().replaceAll('-', ''), admin = new pg.Pool({connectionString: connection, max: 1})
let pool: pg.Pool | undefined, closeApp: (() => Promise<void>) | undefined, created = false
const matrix: Record<string, unknown>[] = []
function wav() {
  const b = Buffer.alloc(80); b.write('RIFF'); b.writeUInt32LE(72, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(36, 40); return b
}
class SyntheticAdapter implements InterviewDeliveryAdapter {
  readonly kind = 'synthetic' as const
  trust = {stt: true, connection: true, idempotentPlayback: true}
  transcript = 'I measured retrieval quality on labeled queries.'
  stt: () => Promise<unknown> = async () => ({text: this.transcript, uncertain: false})
  tts: () => Promise<unknown> = async () => ({bytes: wav(), mimeType: 'audio/wav'})
  playback: () => Promise<unknown> = async () => ({accepted: true})
  stopped: () => Promise<unknown> = async () => ({stopped: true})
  healthy: () => Promise<unknown> = async () => ({stt: true, tts: true, connection: true})
  invocations = {stt: 0, tts: 0, play: 0, stop: 0}
  seenKeys = new Set<string>()
  health() { return this.healthy() }
  transcribe(request: {context: DeliveryContext; audio: Uint8Array}) { assert.deepEqual(Object.keys(request).sort(), ['audio', 'context']); this.invocations.stt++; return this.stt() }
  synthesize(request: {context: DeliveryContext; text: string}) { assert.deepEqual(Object.keys(request).sort(), ['context', 'text']); this.invocations.tts++; return this.tts() }
  play(request: {deliveryKey: string}) { this.invocations.play++; this.seenKeys.add(request.deliveryKey); return this.playback() }
  stop() { this.invocations.stop++; return this.stopped() }
}
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true; url.pathname = '/' + name
  process.env.DATABASE_URL = url.toString(); process.env.SESSION_SECRET = randomBytes(32).toString('hex'); process.env.NODE_ENV = 'development'
  pool = new pg.Pool({connectionString: url.toString(), max: 12})
  const schema = await import('../db/schema.js'), {users, candidates, jobOpenings, applications, jobDescriptions, aiInterviewEvents, aiInterviewEvaluations} = schema
  for (const table of [users, candidates, jobOpenings, applications, jobDescriptions, schema.sessions]) {
    const config = getTableConfig(table)
    await pool.query(`CREATE TABLE "${config.name}" (${config.columns.map(c => {let t = c.getSQLType(); if (!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(t)) t = 'text'; return `"${c.name}" ${t}${c.primary ? ' PRIMARY KEY' : ''}`}).join(',')})`)
  }
  await pool.query(readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql', import.meta.url), 'utf8'))
  const database = drizzle(pool, {schema})
  const {InterviewService} = await import('./service.js'), {InterviewRepository} = await import('./repository.js'), {FakeClock} = await import('./clock.js')
  const {phase1Plan} = await import('./fixtures.js'), {createInterviewRoutes, CANDIDATE_COOKIE} = await import('./routes.js')
  closeApp = (await import('../db/client.js')).closeDb
  const {resetRateLimits} = await import('../rateLimit.js'), {InterviewReportService} = await import('./reportService.js'), {MockReportEvaluator} = await import('./report.js')
  const {InterviewMaintenance, startInterviewMaintenance} = await import('./runtime.js')
  const hrId = randomUUID(); await database.insert(users).values({id: hrId, role: 'hr', isActive: true, email: 'synthetic@hr.invalid', employeeNumber: 'SYN', fullNameEn: 'Synthetic', fullNameAr: 'Synthetic'})
  const hr = {kind: 'staff' as const, userId: hrId}, system = {kind: 'system' as const}
  const rubric = {version: 'synthetic-delivery', dimensions: aiInterviewDimensionSchema.options.map(dimension => ({dimension, anchors: ['Absent', 'Basic', 'Partial', 'Applied', 'Explained'] as [string, string, string, string, string]}))}
  const L = (s: string) => ({en: s, ar: s}), list = (s: string[]) => ({en: s, ar: s})
  async function fresh(audio = true) {
    const clock = new FakeClock(), service = new InterviewService(new InterviewRepository(database), clock, 'ops-' + randomUUID())
    const openingId = randomUUID(), candidateId = randomUUID(), applicationId = randomUUID()
    await database.insert(jobOpenings).values({id: openingId, openedOn: '2026-11-03', titleEn: 'Synthetic role', titleAr: 'Synthetic', departmentEn: 'Test', departmentAr: 'Test', status: 'open'})
    await database.insert(candidates).values({id: candidateId, fullName: 'Synthetic candidate', email: 'synthetic@candidate.invalid'})
    await database.insert(applications).values({id: applicationId, candidateId, openingId, status: 'new', source: 'manual'})
    await database.insert(jobDescriptions).values({id: randomUUID(), openingId, titleEn: 'Synthetic', titleAr: 'Synthetic', status: 'approved', approvedAt: new Date(clock.now()), content: {title: L('Synthetic'), summary: L(''), responsibilities: list([]), requiredQualifications: list([]), requiredSkills: list(['rag', 'problem-solving']), preferredSkills: list([]), softSkills: list([]), experience: L(''), education: L(''), workingConditions: null}, scorecard: {weights: [{key: 'rag', weight: 60}, {key: 'problem-solving', weight: 40}]}})
    const plan = structuredClone(phase1Plan); plan.questions = plan.questions.slice(0, 1)
    const r = await service.create(hr, applicationId, {commandId: randomUUID(), plan, rubric}), id = r.interviewId
    await service.ready(hr, id, {commandId: randomUUID(), expectedVersion: r.version})
    const invite = await service.invite(hr, id, {commandId: randomUUID(), expectedVersion: (await service.load(system, id)).version})
    const session = await service.exchange(invite.token!), candidate = {kind: 'candidate' as const, credential: session.credential}
    await service.execute(candidate, id, (await service.load(system, id)).version, {type: 'ACCEPT_CONSENT', policyVersion: audio ? 'ai-interview-v2-audio' : 'ai-interview-v1', commandId: randomUUID()})
    const adapter = new SyntheticAdapter(), gate = new InterviewDeliveryGate(service, {mode: 'synthetic', production: false}, adapter, {timeoutMs: 1000})
    assert.equal((await gate.checkReadiness()).status, 'ready')
    const binding = audio ? await gate.bind(candidate, id) : null
    return {id, applicationId, clock, service, candidate, adapter, gate, binding, cookie: `${CANDIDATE_COOKIE}=${session.credential}`}
  }
  type F = Awaited<ReturnType<typeof fresh>>
  const row = (f: F) => f.service.load(system, f.id)
  async function event(f: F, type: Exclude<ProviderObservation['type'], 'TRANSCRIPT_FINAL'>, changes: Partial<DeliveryContext> = {}, binding = f.binding!) {
    return binding.observe({...((await binding.context()).context), ...changes, type})
  }
  async function start(f: F) { await event(f, 'CONNECTED'); await f.gate.start(f.binding!) }
  async function play(f: F) { await f.gate.deliver(f.binding!); await event(f, 'PLAYBACK_STARTED'); await event(f, 'PLAYBACK_FINISHED') }
  async function listening() { const f = await fresh(); await start(f); await play(f); await play(f); return f }
  async function answer(f: F) { await event(f, 'SPEECH_STARTED'); await f.gate.transcribe(f.binding!, (await f.binding!.context()).context, wav()); await event(f, 'SPEECH_FINISHED') }
  async function record(scenario: string, f: F) {
    const r = await row(f), records = await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, f.id))
    const value = {scenario, interviewStatus: r.snapshot.status, phase: r.snapshot.phase, version: r.version, sequence: r.lastSequence, answerCount: r.snapshot.answers.length,
      finalizedCount: records.filter(r => r.eventType === 'CANDIDATE_ANSWER_FINALIZED').length, questionCount: records.filter(r => r.eventType === 'QUESTION_SELECTED').length,
      providerReceipts: records.filter(r => r.recordType === 'COMMAND' && r.source === 'provider').length,
      pendingPlay: r.pendingEffects.filter(e => e.type === 'PLAY').length, pendingStop: r.pendingEffects.filter(e => e.type === 'STOP_PLAYBACK').length,
      timerStage: r.snapshot.timer?.stage ?? null, remainingMs: r.snapshot.timer?.pausedRemainingMs ?? null, providerReady: f.gate.readiness().status}
    assert.equal(value.answerCount, value.finalizedCount); matrix.push(value); return value
  }
  const check = async (label: string, test: () => Promise<void> | void) => { await test(); checks++; console.log('PASS ' + label) }
  const unchanged = async (f: F, task: () => Promise<unknown>) => { const before = await row(f); await assert.rejects(task()); assert.deepEqual(await row(f), before) }
  const cookieCache = new Map<string, string>()
  async function staffCookie(role: 'hr' | 'employee' = 'hr') {
    if (cookieCache.has(role)) return cookieCache.get(role)!
    const userId = role === 'hr' ? hrId : randomUUID()
    if (role !== 'hr') await database.insert(users).values({id: userId, role, isActive: true, email: 'employee@synthetic.invalid', employeeNumber: 'OPS', fullNameEn: 'Synthetic', fullNameAr: 'Synthetic'})
    const token = randomBytes(32).toString('base64url')
    await database.insert(schema.sessions).values({tokenHash: createHash('sha256').update(token).digest('hex'), userId, expiresAt: new Date(Date.now() + 3600000)})
    const app = new Hono().get('/', async c => {await setSignedCookie(c, 'hr_session', token, process.env.SESSION_SECRET!, {httpOnly: true, path: '/'}); return c.text('ok')})
    const result = (await app.request('http://local/')).headers.get('set-cookie')!.split(';')[0]!
    cookieCache.set(role, result); return result
  }
  function appFor(f: F, production = false, service = f.service, reports?: ReportService) {
    const routes = createInterviewRoutes(service, {origins: ['http://localhost:5173'], secure: production, production, developmentMock: !production, reports})
    return {app: new Hono().route('/api/ai-interview', routes.candidate).route('/api/recruitment', routes.staff), routes}
  }
  const request = (app: Hono, path: string, cookie?: string, body?: unknown, origin: string | null = 'http://localhost:5173') => app.request(path, {
    method: body === undefined ? 'GET' : 'POST', headers: {...(origin ? {origin} : {}), ...(cookie ? {cookie} : {}), 'content-type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  })
  async function mockListening() {
    const f = await fresh(false); await f.service.execute(f.candidate, f.id, (await row(f)).version, {type: 'START_INTERVIEW', commandId: randomUUID()})
    for (let index = 0; index < 2; index++) {const playbackId = (await row(f)).snapshot.playback!.id
      await f.service.execute(system, f.id, (await row(f)).version, {type: 'AI_PLAYBACK_STARTED', commandId: randomUUID(), playbackId})
      await f.service.execute(system, f.id, (await row(f)).version, {type: 'AI_PLAYBACK_FINISHED', commandId: randomUUID(), playbackId})}
    return f
  }
  async function typedEnvelope(f: F) {const r = await row(f); return {interviewId: f.id, expectedVersion: r.version, sessionVersion: r.candidateSessionVersion, commandId: randomUUID(), questionId: r.snapshot.currentQuestion!.id, turnId: r.snapshot.draft!.turnId, text: 'Synthetic typed answer preserved across shutdown.'}}
  async function completedMock() {
    const f = await mockListening(); await f.service.submitAnswer(f.candidate, await typedEnvelope(f)); await f.service.execute(system, f.id, (await row(f)).version, {type: 'PROCESS_ANSWER', commandId: randomUUID()})
    const playbackId = (await row(f)).snapshot.playback!.id; await f.service.execute(system, f.id, (await row(f)).version, {type: 'AI_PLAYBACK_STARTED', commandId: randomUUID(), playbackId}); await f.service.execute(system, f.id, (await row(f)).version, {type: 'AI_PLAYBACK_FINISHED', commandId: randomUUID(), playbackId}); return f
  }
  const reportPath = (f: F) => `/api/recruitment/applications/${f.applicationId}/ai-interviews/${f.id}/evaluation`

  for (const state of ['invalid', 'expired', 'replayed', 'revoked'] as const) await check(`abuse: ${state} invite is safely rejected`, async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f), invitation = await f.service.invite(hr, f.id, {commandId: randomUUID(), expectedVersion: (await row(f)).version})
    if (state === 'expired') f.clock.advance(25 * 3600000)
    if (state === 'replayed') await f.service.exchange(invitation.token!)
    if (state === 'revoked') await f.service.revoke(hr, f.id, {commandId: randomUUID(), expectedVersion: (await row(f)).version})
    const response = await request(app, '/api/ai-interview/session/exchange', undefined, {token: state === 'invalid' ? randomBytes(32).toString('base64url') : invitation.token!})
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), {error: 'invitationInvalid', message: 'invitationInvalid'}); await record('invite ' + state, f)
  })
  await check('repeated invalid invites hit address budget and never establish a session', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f), before = await row(f)
    for (let index = 0; index < 10; index++) assert.equal((await request(app, '/api/ai-interview/session/exchange', undefined, {token: randomBytes(32).toString('base64url')})).status, 401)
    const response = await request(app, '/api/ai-interview/session/exchange', undefined, {token: randomBytes(32).toString('base64url')}); assert.equal(response.status, 429); assert(Number(response.headers.get('retry-after')) > 0); assert.deepEqual(await row(f), before); await record('invalid invite burst', f)
  })
  await check('valid invite exchange retains Secure/HttpOnly/SameSite/path and durable session audits', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f, true), invitation = await f.service.invite(hr, f.id, {commandId: randomUUID(), expectedVersion: (await row(f)).version})
    const response = await request(app, '/api/ai-interview/session/exchange', undefined, {token: invitation.token!}); assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie')!; for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/ai-interview']) assert(cookie.includes(part))
    const actions = (await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, f.id))).map(r => r.eventType)
    assert(actions.includes('INVITATION_REPLACED')); assert(actions.includes('INVITATION_EXCHANGED')); assert(actions.includes('CANDIDATE_SESSION_ESTABLISHED')); await record('session exchange audit/cookie', f)
  })
  await check('foreign and nonexistent interview access share the same external rejection', async () => {
    resetRateLimits(); const f = await fresh(), other = await fresh(), {app} = appFor(f)
    const existing = await request(app, `/api/ai-interview/state?interviewId=${other.id}`, f.cookie), missing = await request(app, `/api/ai-interview/state?interviewId=${randomUUID()}`, f.cookie)
    assert.equal(existing.status, 401); assert.equal(missing.status, 401); assert.deepEqual(await existing.json(), await missing.json()); await record('cross-interview safe errors', f)
  })
  await check('Origin invalid/missing is rejected independently of a valid candidate cookie', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f), body = {interviewId: f.id, expectedVersion: (await row(f)).version, command: {type: 'CANCEL_INTERVIEW', commandId: randomUUID()}}
    for (const origin of ['https://untrusted.invalid', null]) assert.equal((await request(app, '/api/ai-interview/commands', f.cookie, body, origin)).status, 403)
    assert.equal((await row(f)).snapshot.status, 'READY'); await record('Origin rejection', f)
  })
  await check('forged trusted provider endpoint/schema cannot create authority', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f)
    assert.equal((await request(app, '/api/ai-interview/provider/events', f.cookie, {type: 'CONNECTED', source: 'provider'})).status, 404)
    assert.equal((await request(app, '/api/ai-interview/commands', f.cookie, {type: 'CONNECTED', source: 'provider'})).status, 422); await record('forged provider HTTP', f)
  })
  await check('stale and malformed provider events produce no durable effects', async () => {
    const f = await fresh(); await start(f); const old = {...(await f.binding!.context()).context, type: 'DISCONNECTED'}
    await event(f, 'DISCONNECTED'); const replacement = await f.gate.bind(f.candidate, f.id)
    await unchanged(f, () => f.binding!.observe(old)); await unchanged(f, () => replacement.observe({anything: 'invalid'})); await record('stale/malformed provider', f)
  })
  await check('provider malformed-event flood is capped and cannot block trusted close', async () => {
    const f = await fresh(), before = await row(f); let malformed = 0, throttled = 0
    for (let index = 0; index < 605; index++) try {await f.binding!.observe({invalid: true})} catch (error) {if ((error as {status?: number}).status === 429) throttled++; else malformed++}
    assert.equal(malformed, 600); assert.equal(throttled, 5); assert.deepEqual(await row(f), before)
    await f.gate.close(); const actions = (await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, f.id))).map(r => r.eventType); assert(actions.includes('DELIVERY_CLOSED')); await record('provider event flood', f)
  })
  await check('answer submission flood is capped without turning authorization into a budget', async () => {
    resetRateLimits(); const f = await listening(), {app} = appFor(f), body = await typedEnvelope(f), before = await row(f)
    for (let index = 0; index < 120; index++) assert.equal((await request(app, '/api/ai-interview/answers/submit', f.cookie, {...body, commandId: randomUUID()})).status, 403)
    assert.equal((await request(app, '/api/ai-interview/answers/submit', f.cookie, body)).status, 429); assert.deepEqual(await row(f), before)
    resetRateLimits(); assert.equal((await request(app, '/api/ai-interview/answers/submit', undefined, body)).status, 401); await record('answer flood independent auth', f)
  })
  await check('HR without recruitment, candidate HR cookie and unauthenticated report access are denied', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f)
    assert.equal((await request(app, reportPath(f), await staffCookie('employee'))).status, 403)
    assert.equal((await request(app, reportPath(f), f.cookie)).status, 401); assert.equal((await request(app, reportPath(f))).status, 401)
    assert.equal((await request(app, '/api/ai-interview/state', await staffCookie('hr'))).status, 401); await record('HR/candidate/report isolation', f)
  })
  await check('candidate, report, provider and error responses are uncacheable with frame/MIME policy', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f)
    for (const response of [await request(app, `/api/ai-interview/state?interviewId=${f.id}`, f.cookie), await request(app, reportPath(f)), await request(app, '/api/ai-interview/delivery/readiness')]) {
      assert(response.headers.get('cache-control')!.includes('no-store')); assert.equal(response.headers.get('pragma'), 'no-cache'); assert.equal(response.headers.get('x-frame-options'), 'DENY'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert(response.headers.get('content-security-policy')!.includes("frame-ancestors 'none'"))
    }
  })
  await check('candidate/HR/provider-facing exceptions exclude raw SQL, secrets and stacks', async () => {
    resetRateLimits(); const f = await fresh(), failing = Object.create(f.service) as typeof f.service
    failing.load = async () => {throw Error('SENSITIVE_SQL_SECRET')}
    const a = appFor(f, false, failing), candidate = await request(a.app, `/api/ai-interview/state?interviewId=${f.id}`, f.cookie)
    assert.equal(candidate.status, 500); assert.deepEqual(await candidate.json(), {error: 'aiInterviewInternal', message: 'aiInterviewInternal'})
    const reports = new InterviewReportService(f.service); reports.get = async () => {throw Error('SENSITIVE_PROVIDER_SECRET')}
    const b = appFor(f, false, f.service, reports), hrResponse = await request(b.app, reportPath(f), await staffCookie('hr')); assert.equal(hrResponse.status, 500); assert(!(await hrResponse.text()).includes('SENSITIVE'))
    b.routes.delivery.readiness = () => {throw Error('SENSITIVE_PROVIDER_SECRET')}; const provider = await request(b.app, '/api/ai-interview/delivery/readiness'); assert.equal(provider.status, 500); assert(!(await provider.text()).includes('SENSITIVE'))
  })
  await check('provider readiness polling has its own bounded public budget', async () => {
    resetRateLimits(); const f = await fresh(), {app} = appFor(f)
    for (let index = 0; index < 60; index++) assert.equal((await request(app, '/api/ai-interview/delivery/readiness')).status, 200)
    assert.equal((await request(app, '/api/ai-interview/delivery/readiness')).status, 429)
  })
  await check('runtime readiness observes actual successful passes and stop state', async () => {
    const f = await fresh(), runtime = new InterviewMaintenance(f.service)
    assert.equal(runtime.health().timersHealthy, false); await runtime.tickInterviews(); await runtime.dispatchEvaluations(); assert(runtime.health().timersHealthy); assert(runtime.health().evaluationsHealthy); await runtime.stop(); assert.equal(runtime.health().running, false)
  })
  for (const pending of ['active', 'PLAY', 'STOP', 'provider operation'] as const) await check(`shutdown/restart with ${pending} preserves durable authority`, async () => {
    const f = await fresh(); await start(f)
    if (pending === 'STOP') {await play(f); await f.gate.deliver(f.binding!); await event(f, 'PLAYBACK_STARTED'); await event(f, 'SPEECH_STARTED'); assert.equal((await row(f)).pendingEffects.filter(e => e.type === 'STOP_PLAYBACK').length, 1)}
    else if (pending !== 'PLAY') {await play(f); await play(f)}
    let task: Promise<unknown> | undefined, d: ReturnType<typeof deferred<unknown>> | undefined
    if (pending === 'provider operation') {await event(f, 'SPEECH_STARTED'); const entered = deferred<void>(); d = deferred<unknown>(); f.adapter.stt = () => {entered.resolve(); return d!.promise}; task = f.gate.transcribe(f.binding!, (await f.binding!.context()).context, wav()); void task.catch(() => {}); await entered.promise}
    const runtime = startInterviewMaintenance(f.service), shutdown = new InterviewShutdown()
    const outcome = await shutdown.run({http: async () => {}, runtime: runtime.shutdown, provider: () => f.gate.close(), database: async () => {}, forceConnections: () => {}}, 1000)
    assert(outcome.complete); if (task) await assert.rejects(task); const paused = await row(f); assert.equal(paused.snapshot.status, 'PAUSED'); assert.equal(paused.snapshot.answers.length, 0)
    if (pending === 'STOP') assert(paused.pendingEffects.some(e => e.type === 'STOP_PLAYBACK'))
    if (pending === 'PLAY') assert(paused.pendingEffects.some(e => e.type === 'PLAY'))
    const before = structuredClone(paused.snapshot); d?.resolve({text: 'Late after shutdown', uncertain: false}); await nextTurn(); assert.deepEqual((await row(f)).snapshot, before)
    f.service = new InterviewService(new InterviewRepository(database), f.clock, 'restart-' + randomUUID()); const recovered = await row(f); assert.equal(recovered.snapshot.status, 'PAUSED'); assert.deepEqual(recovered.snapshot.timer, paused.snapshot.timer); await record('shutdown/restart ' + pending, f)
  })
  await check('pending typed answer is acknowledged only after commit, then retries exactly once after restart', async () => {
    const f = await mockListening(), body = await typedEnvelope(f), admitted = deferred<void>(), release = deferred<void>()
    const task = (async () => {admitted.resolve(); await release.promise; return f.service.submitAnswer(f.candidate, body)})(); await admitted.promise
    assert.equal((await record('pending answer before drain', f)).answerCount, 0)
    const shutdown = new InterviewShutdown(); let databaseClosed = false
    const closing = shutdown.run({http: () => task, runtime: async () => {}, provider: async () => {}, database: async () => {databaseClosed = true}, forceConnections: () => {}}, 1000)
    assert(shutdown.draining); assert(!databaseClosed); release.resolve(); const answerResult = await task; assert.equal(answerResult.outcome, 'COMMITTED'); assert((await closing).complete); assert(databaseClosed)
    f.service = new InterviewService(new InterviewRepository(database), f.clock, 'restart-' + randomUUID()); const replay = await f.service.submitAnswer(f.candidate, body); assert.equal(replay.outcome, 'COMMITTED'); assert(replay.duplicate); assert.equal((await record('pending answer after restart', f)).answerCount, 1)
    const receiptCount = (await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, f.id))).filter(r => r.recordType === 'COMMAND' && r.commandId === body.commandId).length; assert.equal(receiptCount, 1); matrix.push({scenario: 'typed submission receipt after shutdown/restart', answerCount: 1, receiptCount})
  })
  await check('evaluation outside maintenance is drained/cancelled; frozen hash/version survive restart', async () => {
    const f = await completedMock()
    const entered = deferred<void>(), late = deferred<void>(), mock = new MockReportEvaluator(), reports = new InterviewReportService(f.service, {evaluateReport: async (input, identity) => {entered.resolve(); await late.promise; return mock.evaluateReport(input, identity)}})
    await reports.request(hr, f.id, f.applicationId, {operation: 'RUN', commandId: randomUUID(), expectedVersion: (await row(f)).version}); const original = await reports.get(hr, f.id, f.applicationId)
    const task = reports.runJob(f.id, 1); await entered.promise; const maintenance = startInterviewMaintenance(f.service), shutdown = new InterviewShutdown()
    assert((await shutdown.run({http: async () => {}, runtime: maintenance.shutdown, provider: () => f.gate.close(), database: async () => {}, forceConnections: () => {}}, 1000)).complete); await task
    const failed = await reports.get(hr, f.id, f.applicationId); assert.equal(failed.evaluation.status, 'FAILED'); assert.equal(failed.evaluation.report, null); assert.equal(failed.evaluation.failureCode, 'EVALUATOR_CANCELLED'); assert.equal(failed.evaluation.inputHash, original.evaluation.inputHash)
    const before = await row(f); late.resolve(); await nextTurn(); assert.deepEqual(await row(f), before)
    f.service = new InterviewService(new InterviewRepository(database), f.clock, 'restart-' + randomUUID()); const next = new InterviewReportService(f.service)
    await next.request(hr, f.id, f.applicationId, {operation: 'RETRY', commandId: randomUUID(), expectedVersion: (await row(f)).version}); await next.runJob(f.id, 1); const recovered = await next.get(hr, f.id, f.applicationId)
    assert.equal(recovered.evaluation.status, 'COMPLETED'); assert.equal(recovered.evaluation.inputHash, original.evaluation.inputHash); assert.equal(recovered.evaluation.reportVersion, 1)
    await next.request(hr, f.id, f.applicationId, {operation: 'REEVALUATE', commandId: randomUUID(), expectedVersion: (await row(f)).version}); await next.runJob(f.id, 2)
    const {app} = appFor(f, false, f.service, next); resetRateLimits(); assert.equal((await request(app, reportPath(f), await staffCookie('hr'))).status, 200)
    const actions = (await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, f.id))).map(r => r.eventType); assert(actions.includes('REEVALUATION_REQUESTED')); assert(actions.includes('INTERVIEW_STARTED')); assert(actions.includes('INTERVIEW_COMPLETED')); await record('evaluation drain/restart', f)
  })
  await check('audit payloads exclude answer text/credentials and lifecycle coverage is explicit', async () => {
    const f = await listening(); await answer(f); await event(f, 'DISCONNECTED'); await event(f, 'CONNECTED'); await f.gate.resume(f.binding!); await record('audit lifecycle', f)
    const audit = (await database.select().from(aiInterviewEvents)).filter(r => r.recordType === 'AUDIT'), text = JSON.stringify(audit.map(r => r.payload))
    assert(!text.includes('Synthetic typed answer')); assert(!text.includes('SENSITIVE_')); assert(!text.includes(f.candidate.credential)); assert(!text.includes(f.adapter.transcript))
    for (const action of ['CREATED', 'PLAN_FROZEN', 'INVITATION_GENERATED', 'INVITATION_EXCHANGED', 'CANDIDATE_SESSION_ESTABLISHED', 'INTERVIEW_STARTED', 'INTERVIEW_PAUSED', 'INTERVIEW_RESUMED', 'INTERVIEW_COMPLETED', 'REEVALUATION_REQUESTED']) assert(audit.some(row => row.eventType === action))
  })
  await check('quiesced owner leaves a newly committed PENDING evaluation for the next owner', async () => {
    const f = await completedMock(); let calls = 0; const mock = new MockReportEvaluator(), reports = new InterviewReportService(f.service, {evaluateReport: (input, identity) => {calls++; return mock.evaluateReport(input, identity)}})
    await reports.request(hr, f.id, f.applicationId, {operation: 'RUN', commandId: randomUUID(), expectedVersion: (await row(f)).version}); const original = (await reports.get(hr, f.id, f.applicationId)).evaluation
    const maintenance = startInterviewMaintenance(f.service); await maintenance.shutdown(); await reports.runJob(f.id, 1); assert.equal(calls, 0)
    const durable = (await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, f.id)))[0]!; assert.equal(durable.status, 'PENDING')
    f.service = new InterviewService(new InterviewRepository(database), f.clock, 'restart-' + randomUUID()); const recovered = new InterviewReportService(f.service); await recovered.runJob(f.id, 1)
    const result = await recovered.get(hr, f.id, f.applicationId); assert.equal(result.evaluation.status, 'COMPLETED'); assert.equal(result.evaluation.inputHash, original.inputHash); assert.equal(result.evaluation.reportVersion, 1); await record('quiesced PENDING evaluation', f)
  })
  await check('secret/SQL-free evidence and zero external/model attempts', () => assert.equal(external, 0))
  if (process.env.PHASE55_OUTPUT) writeFileSync(resolve(process.env.PHASE55_OUTPUT, 'operations-database-matrix.json'), JSON.stringify({checks, externalAttempts: external, singleProcess: true, fixture: 'Real disposable PostgreSQL and unchanged 0026 on synthetic legacy parents; full-chain blocker open', matrix}, null, 2) + '\n')
  console.log(`${checks}/${checks} Phase 5.5 operations PostgreSQL checks passed; external attempts=${external}`)
} finally {
  await closeApp?.(); await pool?.end(); if (created && /^ai_interview_phase55_[a-f0-9]{32}$/.test(name)) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin.end(); globalThis.fetch = savedFetch; net.Socket.prototype.connect = savedConnect; syncBuiltinESMExports()
}

