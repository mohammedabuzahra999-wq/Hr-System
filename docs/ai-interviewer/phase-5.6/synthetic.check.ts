import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { aiInterviewDimensionSchema, aiInterviewReportSchema } from '@hr/shared'
import { InterviewDeliveryGate, type InterviewDeliveryAdapter } from '../../../services/hr-api/src/aiInterviewer/delivery.js'
import type { ProviderObservation, DeliveryContext } from '../../../services/hr-api/src/aiInterviewer/deliveryContracts.js'

const connection = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!connection || !process.env.PHASE56_OUTPUT) throw Error('Isolated evidence output and local database required')
const url = new URL(connection)
if (url.hostname !== '127.0.0.1' || url.port !== '55442') throw Error('Refusing a non-test database server')
const name = 'ai_interview_phase56_' + randomUUID().replaceAll('-', '')
const admin = new pg.Pool({connectionString: connection, max: 1})
const result: {status: string; checks: number; matrix: Record<string, unknown>[]; cleanup: boolean; realProviderCalls: number; realModelCalls: number; limitations: string[]} = {
  status: 'INCOMPLETE', checks: 0, matrix: [], cleanup: false, realProviderCalls: 0, realModelCalls: 0,
  limitations: ['In-process authenticated Hono API requests plus server-only synthetic provider; not live browser microphone E2E.', 'Real disposable PostgreSQL, exact unchanged 0026 on synthetic legacy parents; full-chain pgvector blocker remains open.', 'Owner replacement tests durable state recovery, not an OS-kill deployment test.'],
}
let pool: pg.Pool | undefined, closeApp: (() => Promise<void>) | undefined, created = false, gate: InterviewDeliveryGate | undefined
function wav() {
  const b = Buffer.alloc(80); b.write('RIFF'); b.writeUInt32LE(72, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(36, 40); return b
}
class SyntheticAdapter implements InterviewDeliveryAdapter {
  readonly kind = 'synthetic' as const
  trust = {stt: true, connection: true, idempotentPlayback: true}
  transcript = ''
  invocations = {health: 0, stt: 0, tts: 0, play: 0, stop: 0}
  keys = new Set<string>()
  async health() {this.invocations.health++; return {stt: true, tts: true, connection: true}}
  async transcribe(request: {context: DeliveryContext; audio: Uint8Array}) {assert.deepEqual(Object.keys(request).sort(), ['audio', 'context']); this.invocations.stt++; return {text: this.transcript, uncertain: false}}
  async synthesize(request: {context: DeliveryContext; text: string}) {assert.deepEqual(Object.keys(request).sort(), ['context', 'text']); this.invocations.tts++; return {bytes: wav(), mimeType: 'audio/wav'}}
  async play(request: {deliveryKey: string}) {assert(!this.keys.has(request.deliveryKey)); this.keys.add(request.deliveryKey); this.invocations.play++; return {accepted: true}}
  async stop() {this.invocations.stop++; return {stopped: true}}
}
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true; url.pathname = '/' + name
  process.env.DATABASE_URL = url.toString(); process.env.SESSION_SECRET = randomBytes(32).toString('hex'); process.env.NODE_ENV = 'development'
  pool = new pg.Pool({connectionString: url.toString(), max: 12})
  const schema = await import('../../../services/hr-api/src/db/schema.js')
  const {users, candidates, jobOpenings, applications, jobDescriptions, sessions, aiInterviewEvents, aiInterviewEvaluations} = schema
  for (const table of [users, candidates, jobOpenings, applications, jobDescriptions, sessions]) {
    const config = getTableConfig(table)
    await pool.query(`CREATE TABLE "${config.name}" (${config.columns.map(c => {let type = c.getSQLType(); if (!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(type)) type = 'text'; return `"${c.name}" ${type}${c.primary ? ' PRIMARY KEY' : ''}`}).join(',')})`)
  }
  await pool.query(readFileSync(new URL('../../../services/hr-api/drizzle/0026_ai_interviewer.sql', import.meta.url), 'utf8'))
  const database = drizzle(pool, {schema})
  const {InterviewService} = await import('../../../services/hr-api/src/aiInterviewer/service.js')
  const {InterviewRepository} = await import('../../../services/hr-api/src/aiInterviewer/repository.js')
  const {InterviewReportService, reportStorage} = await import('../../../services/hr-api/src/aiInterviewer/reportService.js')
  const {InterviewMaintenance} = await import('../../../services/hr-api/src/aiInterviewer/runtime.js')
  const {reportInputHash, verifyInterviewReport} = await import('../../../services/hr-api/src/aiInterviewer/report.js')
  const {FakeClock} = await import('../../../services/hr-api/src/aiInterviewer/clock.js')
  const {phase1Plan} = await import('../../../services/hr-api/src/aiInterviewer/fixtures.js')
  const {createInterviewRoutes, CANDIDATE_COOKIE} = await import('../../../services/hr-api/src/aiInterviewer/routes.js')
  closeApp = (await import('../../../services/hr-api/src/db/client.js')).closeDb
  const clock = new FakeClock(), service = new InterviewService(new InterviewRepository(database), clock, 'phase56-synthetic-owner')
  const reports = new InterviewReportService(service), runtime = new InterviewMaintenance(service, reports)
  const routes = createInterviewRoutes(service, {origins: ['http://localhost:5173'], secure: true, production: false, developmentMock: false, reports})
  const app = new Hono().route('/api/ai-interview', routes.candidate).route('/api/recruitment', routes.staff)
  const request = (path: string, cookie?: string, body?: unknown) => app.request(path, {method: body === undefined ? 'GET' : 'POST', headers: {origin: 'http://localhost:5173', 'content-type': 'application/json', ...(cookie ? {cookie} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})})
  const check = (label: string) => {result.checks++; console.log('PASS ' + label)}
  async function staffCookie(role: 'hr' | 'employee') {
    const id = randomUUID(), token = randomBytes(32).toString('base64url')
    await database.insert(users).values({id, role, isActive: true, email: `${role}@synthetic.invalid`, employeeNumber: role, fullNameEn: 'Synthetic', fullNameAr: 'Synthetic'})
    await database.insert(sessions).values({tokenHash: createHash('sha256').update(token).digest('hex'), userId: id, expiresAt: new Date(Date.now() + 3600000)})
    const signing = new Hono().get('/', async c => {await setSignedCookie(c, 'hr_session', token, process.env.SESSION_SECRET!, {httpOnly: true, path: '/'}); return c.text('ok')})
    return (await signing.request('/')).headers.get('set-cookie')!.split(';')[0]!
  }
  const hrCookie = await staffCookie('hr'), employeeCookie = await staffCookie('employee')
  async function application() {
    const openingId = randomUUID(), candidateId = randomUUID(), id = randomUUID(), L = (s: string) => ({en: s, ar: s}), list = (s: string[]) => ({en: s, ar: s})
    await database.insert(jobOpenings).values({id: openingId, openedOn: '2026-11-05', titleEn: 'Synthetic role', titleAr: 'Synthetic', departmentEn: 'Test', departmentAr: 'Test', status: 'open'})
    await database.insert(candidates).values({id: candidateId, fullName: 'Synthetic candidate', email: 'candidate@synthetic.invalid'})
    await database.insert(applications).values({id, candidateId, openingId, status: 'new', source: 'manual'})
    await database.insert(jobDescriptions).values({id: randomUUID(), openingId, titleEn: 'Synthetic', titleAr: 'Synthetic', status: 'approved', approvedAt: new Date(clock.now()), content: {title: L('Synthetic'), summary: L(''), responsibilities: list([]), requiredQualifications: list([]), requiredSkills: list(['rag', 'problem-solving']), preferredSkills: list([]), softSkills: list([]), experience: L(''), education: L(''), workingConditions: null}, scorecard: {weights: [{key: 'rag', weight: 60}, {key: 'problem-solving', weight: 40}]}})
    return id
  }
  const applicationId = await application(), base = `/api/recruitment/applications/${applicationId}/ai-interviews`
  const body = {commandId: randomUUID(), plan: structuredClone(phase1Plan), rubric: {version: 'phase56-synthetic', dimensions: aiInterviewDimensionSchema.options.map(dimension => ({dimension, anchors: ['Absent', 'Basic', 'Partial', 'Applied', 'Explained']}))}}
  assert.equal((await request(base, employeeCookie, body)).status, 403); check('staff recruitment permission independently required')
  const createdResponse = await request(base, hrCookie, body); assert.equal(createdResponse.status, 201)
  const createdInterview = await createdResponse.json() as {interviewId: string}, id = createdInterview.interviewId, system = {kind: 'system' as const}
  const row = () => service.load(system, id)
  async function record(stage: string) {
    const r = await row(), events = await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, id))
    const jobs = await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, id))
    const finalized = events.filter(e => e.eventType === 'CANDIDATE_ANSWER_FINALIZED')
    assert.equal(r.snapshot.answers.length, finalized.length)
    result.matrix.push({stage, status: r.snapshot.status, phase: r.snapshot.phase, version: r.version, sequence: r.lastSequence, answerCount: r.snapshot.answers.length,
      finalizedCount: finalized.length, commandReceipts: events.filter(e => e.recordType === 'COMMAND').length,
      selectedKind: r.snapshot.currentQuestion?.kind ?? null, pendingPlay: r.pendingEffects.filter(e => e.type === 'PLAY').length,
      pendingStop: r.pendingEffects.filter(e => e.type === 'STOP_PLAYBACK').length, evaluationStatus: jobs.at(-1)?.status ?? null})
  }
  check('HR creates a persisted plan through authenticated API')
  assert.equal((await request(base, hrCookie, body)).status, 201); assert.equal((await service.list({kind: 'staff', userId: (await database.select().from(users).where(eq(users.role, 'hr')))[0]!.id}, applicationId)).interviews.length, 1)
  check('same HR create identity is idempotent')
  assert.equal((await request(`${base}/${id}/ready`, hrCookie, {commandId: randomUUID(), expectedVersion: (await row()).version})).status, 200)
  assert((await row()).frozenInputs); check('ready freezes approved job criteria and rubric')
  const inviteResponse = await request(`${base}/${id}/invitation`, hrCookie, {commandId: randomUUID(), expectedVersion: (await row()).version})
  assert.equal(inviteResponse.status, 200); const invitation = await inviteResponse.json() as {token: string}
  const exchange = await request('/api/ai-interview/session/exchange', undefined, {token: invitation.token, interviewId: id}); assert.equal(exchange.status, 200)
  const cookieHeader = exchange.headers.get('set-cookie')!
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/ai-interview']) assert(cookieHeader.includes(flag))
  const candidateCookie = cookieHeader.split(';')[0]!, principal = {kind: 'candidate' as const, credential: candidateCookie.slice(CANDIDATE_COOKIE.length + 1)}
  check('one-time invite establishes protected candidate session')
  assert.equal((await request('/api/ai-interview/session/exchange', undefined, {token: invitation.token})).status, 401); check('replayed invite cannot establish another session')
  const candidateState = await request(`/api/ai-interview/state?interviewId=${id}`, candidateCookie); assert.equal(candidateState.status, 200)
  const candidateData = await candidateState.json() as Record<string, unknown>; assert(!('frozenInputs' in candidateData)); assert(!('rubric' in candidateData)); check('candidate joins through allowlisted state DTO')
  const otherApplication = await application(), other = await service.create({kind: 'staff', userId: (await database.select().from(users).where(eq(users.role, 'hr')))[0]!.id}, otherApplication, {...body, commandId: randomUUID()})
  assert.equal((await request(`/api/ai-interview/state?interviewId=${other.interviewId}`, candidateCookie)).status, 401); check('candidate cannot read another interview')
  assert.equal((await request('/api/ai-interview/commands', candidateCookie, {interviewId: id, expectedVersion: (await row()).version, command: {type: 'ACCEPT_CONSENT', commandId: randomUUID(), policyVersion: 'ai-interview-v2-audio'}})).status, 200)
  check('audio consent is explicitly committed through candidate API')
  assert.equal((await request('/api/ai-interview/provider/events', candidateCookie, {type: 'CONNECTED'})).status, 404)
  assert.equal((await request('/api/ai-interview/commands', candidateCookie, {interviewId: id, expectedVersion: (await row()).version, command: {type: 'START_INTERVIEW', commandId: randomUUID()}})).status, 503)
  check('browser cannot fabricate trusted events or bypass unavailable HTTP delivery')
  const adapter = new SyntheticAdapter(); gate = new InterviewDeliveryGate(service, {mode: 'synthetic', production: false}, adapter)
  assert.equal((await gate.checkReadiness()).status, 'ready'); assert.equal(routes.delivery.readiness().mode, 'disabled'); check('synthetic health is distinct from disabled production composition')
  const binding = await gate.bind(principal, id)
  const event = async (type: Exclude<ProviderObservation['type'], 'TRANSCRIPT_FINAL'>) => binding.observe({...((await binding.context()).context), type})
  async function play() {await gate!.deliver(binding); assert.equal((await row()).snapshot.playback!.started, false); await event('PLAYBACK_STARTED'); await event('PLAYBACK_FINISHED')}
  async function answer(text: string, speaking = false) {
    adapter.transcript = text
    if (!speaking) await event('SPEECH_STARTED')
    const context = (await binding.context()).context
    await gate!.transcribe(binding, context, wav()); await event('SPEECH_FINISHED')
    return {...context, type: 'TRANSCRIPT_FINAL' as const, text, uncertain: false}
  }
  await event('CONNECTED'); await gate.start(binding); await play(); await play(); assert.equal((await row()).snapshot.phase, 'LISTENING'); await record('question delivered')
  check('trusted start and TTS/play observations deliver first question')
  const replay = await answer('I used RAG in an HR assistant.'); assert.equal((await row()).snapshot.answers.length, 1); await record('first answer durable')
  check('synthetic STT and speech finish commit one durable answer')
  const beforeReplay = await row(); assert.equal((await binding.observe(replay)).duplicate, true); assert.deepEqual(await row(), beforeReplay)
  check('simulated lost response retries original transcript receipt without a second answer')
  await runtime.tickInterviews(); assert.equal((await row()).snapshot.currentQuestion!.kind, 'FOLLOW_UP'); await record('follow-up selected')
  check('runtime processes committed answer into frozen follow-up')
  await gate.deliver(binding); await event('PLAYBACK_STARTED'); const interruptedPlayback = (await row()).snapshot.playback!.id
  await event('SPEECH_STARTED'); assert((await row()).pendingEffects.some(e => e.type === 'STOP_PLAYBACK'))
  await gate.stopPlayback(binding, interruptedPlayback); await answer('I checked some results.', true)
  assert.equal((await row()).snapshot.answers[1]!.questionDelivery, 'interrupted'); assert.equal(adapter.invocations.stop, 1); await record('barge-in answer committed')
  check('barge-in persists STOP and commits exactly one interrupted-turn answer')
  await runtime.tickInterviews(); assert.equal((await row()).snapshot.currentQuestion!.kind, 'CLARIFICATION'); await play(); await answer('I measured recall@5 on labeled queries and reviewed incorrect retrievals.'); await runtime.tickInterviews(); await record('clarification committed')
  check('clarification resolves to next base question within frozen limits')
  assert.equal((await row()).snapshot.currentQuestion!.baseQuestionId, 'q2'); await play(); await answer('I compared alternatives, tested the change, and documented the trade-offs.'); await runtime.tickInterviews(); await play()
  assert.equal((await row()).snapshot.status, 'COMPLETED'); assert.equal((await row()).snapshot.answers.length, 4); await record('completed')
  check('complete closing observations persist interview completion and four answers')
  const records = await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, id))
  const finalized = records.filter(e => e.eventType === 'CANDIDATE_ANSWER_FINALIZED'); assert.equal(finalized.length, 4)
  assert.equal(new Set((await row()).snapshot.answers.map(a => a.turnId)).size, 4)
  assert.equal(records.filter(e => e.eventType === 'ANSWER_EVALUATED').length, 4); check('durable history has one finalized answer and one processing decision per turn')
  const reportPath = `${base}/${id}/evaluation`
  assert.equal((await request(reportPath, candidateCookie)).status, 401); assert.equal((await request(reportPath, employeeCookie)).status, 403); assert.equal((await request(reportPath)).status, 401)
  check('candidate, unauthorized employee and anonymous report access rejected')
  const startReport = await request(reportPath, hrCookie, {commandId: randomUUID(), expectedVersion: (await row()).version, operation: 'RUN'})
  assert.equal(startReport.status, 202); const reportVersion = (await startReport.json() as {reportVersion: number}).reportVersion
  await reports.runJob(id, reportVersion)
  let reportBody: Awaited<ReturnType<typeof reports.get>> | undefined
  for (let i = 0; i < 100; i++) {
    const response = await request(reportPath, hrCookie); assert.equal(response.status, 200); assert(response.headers.get('cache-control')!.includes('no-store'))
    reportBody = await response.json() as Awaited<ReturnType<typeof reports.get>>
    if (reportBody.evaluation.status === 'COMPLETED') break
    await new Promise(done => setTimeout(done, 10))
  }
  assert.equal(reportBody!.evaluation.status, 'COMPLETED'); const report = aiInterviewReportSchema.parse(reportBody!.evaluation.report)
  assert.equal(report.mode, 'MOCK'); assert.equal(report.evidenceValidation.status, 'VALID'); check('authorized HR receives completed explicitly MOCK report')
  const jobs = await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, id)); assert.equal(jobs.length, 1)
  const stored = reportStorage(jobs[0]!.results)!; assert.equal(stored.attempts.length, 1); assert.equal(jobs[0]!.inputHash, reportInputHash(stored.input)); assert.equal(stored.input.answers.length, 4)
  verifyInterviewReport(report, stored.input, {evaluationId: report.evaluationId, reportVersion, generatedAt: report.generatedAt})
  check('one evaluation attempt preserves frozen inputHash and independently valid evidence')
  const evidence = report.criteriaResults.flatMap(c => c.evidence); assert(evidence.length > 0)
  const interruptedTurn = (await row()).snapshot.answers[1]!.turnId; assert(evidence.every(e => e.turnId !== interruptedTurn))
  for (const e of evidence) {const a = stored.input.answers.find(a => a.sequence === e.eventSequence)!.answer; assert.equal(a.text.slice(e.startOffset, e.endOffset), e.quote)}
  check('report quotes exact finalized spans and excludes incomplete question delivery')
  const tampered = structuredClone(report); tampered.inputHash = '0'.repeat(64)
  assert.throws(() => verifyInterviewReport(tampered, stored.input, {evaluationId: report.evaluationId, reportVersion, generatedAt: report.generatedAt}))
  check('tampered report input identity fails independent verifier')
  const restarted = new InterviewService(new InterviewRepository(database), clock, 'phase56-restarted-owner'), restartedReports = new InterviewReportService(restarted)
  assert.equal((await restarted.load(principal, id)).snapshot.answers.length, 4)
  const hrId = (await database.select().from(users).where(eq(users.role, 'hr')))[0]!.id
  assert.deepEqual((await restartedReports.get({kind: 'staff', userId: hrId}, id, applicationId)).evaluation.report, report)
  check('new service owner recovers durable completed answers and report')
  assert.equal((await database.select().from(applications).where(eq(applications.id, applicationId)))[0]!.status, 'new'); check('acceptance never advances hiring/application decision')
  await gate.close(); await runtime.stop(); await record('final durable state')
  assert.equal(adapter.invocations.stt, 4); assert.equal(adapter.invocations.stop, 1)
  result.matrix.push({stage: 'synthetic adapter invocation counts', ...adapter.invocations, uniquePlaybackKeys: adapter.keys.size, reportEvidenceSpans: evidence.length})
  check('no real provider or model integration activated')
  result.status = 'PASS'
} catch (error) {
  result.status = 'FAIL'; console.error('FAIL synthetic acceptance; ' + (error instanceof assert.AssertionError ? 'assertion rejected' : 'execution rejected')); process.exitCode = 1
  // Keep only a safe stage marker; do not retain credentials, raw SQL or source-mapped payloads.
  result.matrix.push({stage: 'failure', checksCompleted: result.checks, failureType: error instanceof assert.AssertionError ? 'ASSERTION' : 'EXECUTION'})
} finally {
  await gate?.close(); await closeApp?.(); await pool?.end()
  if (created && /^ai_interview_phase56_[a-f0-9]{32}$/.test(name)) {await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); result.cleanup = true}
  await admin.end()
  writeFileSync(resolve(process.env.PHASE56_OUTPUT!, 'synthetic-e2e-matrix.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(`${result.checks} Phase 5.6 synthetic acceptance checks; status=${result.status}; cleanup=${result.cleanup}; real provider/model calls=0`)
}
