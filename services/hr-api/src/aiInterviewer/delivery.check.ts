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
const name = 'ai_interview_phase54_' + randomUUID().replaceAll('-', ''), admin = new pg.Pool({connectionString: connection, max: 1})
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
  for (const table of [users, candidates, jobOpenings, applications, jobDescriptions]) {
    const config = getTableConfig(table)
    await pool.query(`CREATE TABLE "${config.name}" (${config.columns.map(c => {let t = c.getSQLType(); if (!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(t)) t = 'text'; return `"${c.name}" ${t}${c.primary ? ' PRIMARY KEY' : ''}`}).join(',')})`)
  }
  await pool.query(readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql', import.meta.url), 'utf8'))
  const database = drizzle(pool, {schema})
  const {InterviewService} = await import('./service.js'), {InterviewRepository} = await import('./repository.js'), {FakeClock} = await import('./clock.js')
  const {phase1Plan} = await import('./fixtures.js'), {createInterviewRoutes, CANDIDATE_COOKIE} = await import('./routes.js')
  closeApp = (await import('../db/client.js')).closeDb
  const hrId = randomUUID(); await database.insert(users).values({id: hrId, role: 'hr', isActive: true, email: 'synthetic@hr.invalid', employeeNumber: 'SYN', fullNameEn: 'Synthetic', fullNameAr: 'Synthetic'})
  const hr = {kind: 'staff' as const, userId: hrId}, system = {kind: 'system' as const}
  const rubric = {version: 'synthetic-delivery', dimensions: aiInterviewDimensionSchema.options.map(dimension => ({dimension, anchors: ['Absent', 'Basic', 'Partial', 'Applied', 'Explained'] as [string, string, string, string, string]}))}
  const L = (s: string) => ({en: s, ar: s}), list = (s: string[]) => ({en: s, ar: s})
  async function fresh() {
    const clock = new FakeClock(), service = new InterviewService(new InterviewRepository(database), clock, 'delivery-owner-a')
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
    await service.execute(candidate, id, (await service.load(system, id)).version, {type: 'ACCEPT_CONSENT', policyVersion: 'ai-interview-v2-audio', commandId: randomUUID()})
    const adapter = new SyntheticAdapter(), gate = new InterviewDeliveryGate(service, {mode: 'synthetic', production: false}, adapter, {timeoutMs: 30})
    assert.equal((await gate.checkReadiness()).status, 'ready')
    const binding = await gate.bind(candidate, id)
    return {id, applicationId, clock, service, candidate, adapter, gate, binding, cookie: `${CANDIDATE_COOKIE}=${session.credential}`}
  }
  type F = Awaited<ReturnType<typeof fresh>>
  const row = (f: F) => f.service.load(system, f.id)
  async function event(f: F, type: Exclude<ProviderObservation['type'], 'TRANSCRIPT_FINAL'>, changes: Partial<DeliveryContext> = {}, binding = f.binding) {
    return binding.observe({...((await binding.context()).context), ...changes, type})
  }
  async function start(f: F) { await event(f, 'CONNECTED'); await f.gate.start(f.binding) }
  async function play(f: F) { await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED'); await event(f, 'PLAYBACK_FINISHED') }
  async function listening() { const f = await fresh(); await start(f); await play(f); await play(f); return f }
  async function answer(f: F) { await event(f, 'SPEECH_STARTED'); await f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()); await event(f, 'SPEECH_FINISHED') }
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

  await check('production absent/invalid/synthetic providers fail closed without calls', async () => {
    const f = await fresh()
    for (const [config, adapter] of [[{mode: 'disabled', production: true}, undefined], [{mode: 'real', production: true}, f.adapter], [{mode: 'synthetic', production: true}, f.adapter]] as const) {
      const gate = new InterviewDeliveryGate(f.service, config, adapter); assert.equal((await gate.checkReadiness()).status, 'unavailable'); await assert.rejects(gate.bind(f.candidate, f.id), /providerUnavailable/)
    }
    for (const timeoutMs of [0, -1, 15001, Infinity]) assert.throws(() => new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, f.adapter, {timeoutMs}))
    await record('production configuration closed', f)
  })
  await check('trusted connection/STT/idempotent-play requirements cannot be omitted', async () => {
    const f = await fresh()
    for (const key of ['connection', 'stt', 'idempotentPlayback'] as const) { const a = new SyntheticAdapter(); a.trust[key] = false; assert.equal((await new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, a).checkReadiness()).status, 'unavailable') }
  })
  await check('health unavailable/malformed/timeout is unhealthy and cannot bind', async () => {
    const f = await fresh(), pending = deferred<unknown>()
    for (const behavior of [async () => {throw Error('SENSITIVE_SECRET')}, async () => ({stt: true, tts: true, connection: false}), () => pending.promise]) {
      const a = new SyntheticAdapter(); a.healthy = behavior; const gate = new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, a, {timeoutMs: 10})
      assert.equal((await gate.checkReadiness()).status, 'unhealthy'); await assert.rejects(gate.bind(f.candidate, f.id)); await gate.close()
    }
    pending.resolve({stt: true, tts: true, connection: true}); await nextTurn()
  })
  await check('audio consent and trusted connection precede real START', async () => {
    const f = await fresh(); await unchanged(f, () => f.gate.start(f.binding)); await start(f); assert.equal((await row(f)).snapshot.phase, 'INTRO'); await record('trusted start', f)
  })
  await check('provider receives data only; TTS dispatch alone cannot acknowledge playback', async () => {
    const f = await fresh(); await start(f); await f.gate.deliver(f.binding); const r = await row(f); assert.equal(r.snapshot.playback!.started, false); assert.equal(r.snapshot.timer, null); assert.equal(r.pendingEffects.filter(e => e.type === 'PLAY').length, 1)
    await assert.rejects(f.gate.deliver(f.binding), /playbackAlreadyDispatched/); assert.equal(f.adapter.invocations.play, 1); await record('durable PLAY dispatch', f)
  })
  await check('playback completion requires start; wrong effect cannot advance', async () => {
    const f = await fresh(); await start(f); await unchanged(f, () => event(f, 'PLAYBACK_STARTED')); await f.gate.deliver(f.binding); await unchanged(f, () => event(f, 'PLAYBACK_FINISHED')); await unchanged(f, () => event(f, 'PLAYBACK_STARTED', {playbackId: 'other-playback'})); await event(f, 'PLAYBACK_STARTED'); await event(f, 'PLAYBACK_FINISHED'); assert.equal((await row(f)).snapshot.currentQuestion?.id, 'q1')
  })
  await check('playback duplicate receipt is deterministic; different-ID duplicate is rejected', async () => {
    const f = await fresh(); await start(f); await f.gate.deliver(f.binding); const body = {...(await f.binding.context()).context, type: 'PLAYBACK_STARTED' as const}; await f.binding.observe(body)
    const before = await row(f); assert.equal((await f.binding.observe(body)).duplicate, true); assert.deepEqual(await row(f), before); await unchanged(f, () => event(f, 'PLAYBACK_STARTED')); await record('duplicate playback ACK', f)
  })
  await check('trusted STT final plus speech finish commits one durable answer', async () => {
    const f = await listening(); await answer(f); const r = await record('trusted STT answer', f); assert.equal(r.answerCount, 1); assert.equal(r.phase, 'PROCESSING'); assert.equal((await row(f)).snapshot.answers[0]!.text, f.adapter.transcript)
  })
  await check('speech end before final transcript is safe and finalizes exactly once', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); await event(f, 'SPEECH_FINISHED'); await f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()); assert.equal((await record('speech-end before STT', f)).answerCount, 1)
  })
  await check('duplicate final transcript same ID reconciles without another answer', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const body = {...(await f.binding.context()).context, type: 'TRANSCRIPT_FINAL' as const, text: 'Synthetic final', uncertain: false}
    await f.binding.observe(body); await event(f, 'SPEECH_FINISHED'); const before = await row(f); assert.equal((await f.binding.observe(body)).duplicate, true); assert.deepEqual(await row(f), before); await record('duplicate transcript', f)
  })
  await check('conflicting event identity and repeated final with new ID fail safely', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const body = {...(await f.binding.context()).context, type: 'TRANSCRIPT_FINAL' as const, text: 'Synthetic final', uncertain: false}
    await f.binding.observe(body); await unchanged(f, () => f.binding.observe({...body, text: 'Conflicting final'})); await unchanged(f, async () => f.binding.observe({...((await f.binding.context()).context), type: 'TRANSCRIPT_FINAL', text: 'Synthetic final', uncertain: false}))
  })
  for (const mode of ['timeout', 'unavailable', 'malformed'] as const) await check(`STT ${mode} pauses safely without a committed answer`, async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const d = deferred<unknown>()
    f.adapter.stt = mode === 'timeout' ? () => d.promise : mode === 'unavailable' ? async () => {throw Error('SENSITIVE_SECRET')} : async () => ({text: 'Synthetic', authorization: 'hr'})
    await assert.rejects(f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()), new RegExp(mode === 'timeout' ? 'providerTimeout' : mode === 'malformed' ? 'providerMalformed' : 'providerUnavailable'))
    const r = await record('STT ' + mode, f); assert.equal(r.interviewStatus, 'PAUSED'); assert.equal(r.answerCount, 0); d.resolve({text: 'Late synthetic', uncertain: false}); await nextTurn(); assert.equal((await row(f)).snapshot.answers.length, 0)
  })
  await check('late STT after timeout cannot overwrite new generation answer', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const d = deferred<unknown>(); f.adapter.stt = () => d.promise
    await assert.rejects(f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()), /providerTimeout/)
    f.binding = await f.gate.bind(f.candidate, f.id); await event(f, 'CONNECTED'); await f.gate.resume(f.binding); f.adapter.stt = async () => ({text: 'New authoritative final', uncertain: false}); await answer(f)
    const before = await row(f); d.resolve({text: 'Late stale final', uncertain: false}); await nextTurn(); assert.deepEqual(await row(f), before); await record('late STT fenced after recovery', f)
  })
  await check('stale/late STT during timeout deadline cannot rebase to current turn', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); f.gate = new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, f.adapter); await f.gate.checkReadiness()
    const context = (await f.binding.context()).context, d = deferred<unknown>(), entered = deferred<void>(); f.adapter.stt = () => {entered.resolve(); return d.promise}
    const result = f.gate.transcribe(f.binding, context, wav()); void result.catch(() => {}); await entered.promise; f.clock.advance(150000); const r = await row(f); await f.service.execute(system, f.id, r.version, {type: 'TIMER_TICK', commandId: randomUUID()})
    const before = await row(f); d.resolve({text: 'Too late', uncertain: false}); await assert.rejects(result); assert.deepEqual(await row(f), before); await record('late STT after deadline', f)
  })
  for (const mode of ['timeout', 'unavailable', 'malformed', 'playback-failure'] as const) await check(`TTS ${mode} cannot fabricate playback or advancement`, async () => {
    const f = await fresh(); await start(f); const d = deferred<unknown>()
    if (mode === 'timeout') f.adapter.tts = () => d.promise
    if (mode === 'unavailable') f.adapter.tts = async () => {throw Error('SENSITIVE_SECRET')}
    if (mode === 'malformed') f.adapter.tts = async () => ({bytes: 'not-audio', mimeType: 'audio/wav'})
    if (mode === 'playback-failure') f.adapter.playback = async () => {throw Error('SENSITIVE_SECRET')}
    await assert.rejects(f.gate.deliver(f.binding)); const r = await record('TTS ' + mode, f); assert.equal(r.interviewStatus, 'PAUSED'); assert.equal(r.questionCount, 0); assert.equal(r.answerCount, 0); assert.equal(r.pendingStop, 1)
    d.resolve({bytes: wav(), mimeType: 'audio/wav'}); await nextTurn(); assert.equal((await row(f)).snapshot.status, 'PAUSED')
  })
  await check('barge-in preserves STOP intent and processes candidate speech', async () => {
    const f = await fresh(); await start(f); await play(f); await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED'); const playbackId = (await row(f)).snapshot.playback!.id
    await event(f, 'SPEECH_STARTED'); const r = await row(f); assert.equal(r.snapshot.phase, 'LISTENING'); assert.equal(r.snapshot.draft!.speaking, true); assert(r.pendingEffects.some(e => e.type === 'STOP_PLAYBACK' && e.playbackId === playbackId))
    await f.gate.stopPlayback(f.binding, playbackId); await f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()); await event(f, 'SPEECH_FINISHED'); assert.equal((await record('barge-in', f)).answerCount, 1)
  })
  await check('late playback completion after interruption cannot advance', async () => {
    const f = await fresh(); await start(f); await play(f); await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED'); const stale = {...(await f.binding.context()).context, type: 'PLAYBACK_FINISHED'}
    await event(f, 'SPEECH_STARTED'); await unchanged(f, () => f.binding.observe(stale)); await record('late playback after interruption', f)
  })
  await check('playback-complete/speech-start races preserve one turn in both orders', async () => {
    for (const speechFirst of [true, false]) { const f = await fresh(); await start(f); await play(f); await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED')
      if (speechFirst) { await event(f, 'SPEECH_STARTED'); await unchanged(f, () => event(f, 'PLAYBACK_FINISHED')) }
      else { await event(f, 'PLAYBACK_FINISHED'); await event(f, 'SPEECH_STARTED') }
      assert.equal((await row(f)).snapshot.draft!.turnId, 'turn:1'); assert.equal((await row(f)).snapshot.answers.length, 0); await record('race ' + (speechFirst ? 'speech-first' : 'complete-first'), f)
    }
  })
  await check('duplicate speech-start same ID is idempotent and new ID fails', async () => {
    const f = await listening(), body = {...(await f.binding.context()).context, type: 'SPEECH_STARTED'}; await f.binding.observe(body); const before = await row(f); assert.equal((await f.binding.observe(body)).duplicate, true); assert.deepEqual(await row(f), before); await unchanged(f, () => event(f, 'SPEECH_STARTED'))
  })
  await check('lost STOP acknowledgement leaves durable intent for bounded retry', async () => {
    const f = await fresh(); await start(f); await play(f); await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED'); const playbackId = (await row(f)).snapshot.playback!.id; await event(f, 'SPEECH_STARTED')
    const d = deferred<unknown>(); f.adapter.stopped = () => d.promise; await assert.rejects(f.gate.stopPlayback(f.binding, playbackId), /providerTimeout/); assert.equal((await row(f)).pendingEffects.filter(e => e.type === 'STOP_PLAYBACK').length, 1)
    f.adapter.stopped = async () => ({stopped: true}); await f.gate.stopPlayback(f.binding, playbackId); assert.equal((await row(f)).pendingEffects.filter(e => e.type === 'STOP_PLAYBACK').length, 0); d.resolve({stopped: true}); await nextTurn(); await record('lost STOP ACK retry', f)
  })
  for (const state of ['playback', 'speaking', 'interruption', 'pending PLAY'] as const) await check(`trusted disconnect/reconnect during ${state} preserves durable state`, async () => {
    const f = await fresh(); await start(f)
    if (state !== 'pending PLAY') { await play(f); await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED') }
    if (state === 'speaking') { await event(f, 'PLAYBACK_FINISHED'); await event(f, 'SPEECH_STARTED') }
    if (state === 'interruption') await event(f, 'SPEECH_STARTED')
    await event(f, 'DISCONNECTED'); const paused = await row(f); assert.equal(paused.snapshot.status, 'PAUSED'); const remaining = paused.snapshot.timer?.pausedRemainingMs
    f.clock.advance(60000); await event(f, 'CONNECTED'); assert.equal((await row(f)).snapshot.status, 'PAUSED'); await f.gate.resume(f.binding)
    if (remaining !== undefined) assert.equal((await row(f)).snapshot.timer!.answerDeadlineAt, f.clock.now() + remaining!)
    await record('reconnect ' + state, f)
  })
  await check('reconnect after transcript commit and refresh cannot duplicate answer', async () => {
    const f = await listening(); await answer(f); await event(f, 'DISCONNECTED'); const old = f.binding; f.binding = await f.gate.bind(f.candidate, f.id); await event(f, 'CONNECTED'); await f.gate.resume(f.binding)
    assert.equal((await record('refresh after commit', f)).answerCount, 1); await assert.rejects(old.context(), /staleInterviewProvider/)
  })
  await check('refresh before transcript commit preserves draft and fences old response', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const stale = {...(await f.binding.context()).context, type: 'TRANSCRIPT_FINAL', text: 'Old response', uncertain: false}
    await event(f, 'DISCONNECTED'); const old = f.binding; f.binding = await f.gate.bind(f.candidate, f.id); await event(f, 'CONNECTED'); await f.gate.resume(f.binding); await unchanged(f, () => old.observe(stale)); await answer(f); assert.equal((await record('refresh before commit', f)).answerCount, 1)
  })
  await check('provider restart rebinds generation, preserves pause time and pending PLAY', async () => {
    const f = await fresh(); await start(f); const old = f.binding; await f.gate.close(); f.service = new InterviewService(new InterviewRepository(database), f.clock, 'delivery-owner-b')
    f.gate = new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, f.adapter); await f.gate.checkReadiness(); f.binding = await f.gate.bind(f.candidate, f.id)
    assert.equal((await row(f)).snapshot.status, 'PAUSED'); await event(f, 'CONNECTED'); await f.gate.resume(f.binding); await unchanged(f, () => old.observe({...({} as DeliveryContext), type: 'CONNECTED'})); await record('provider restart', f)
  })
  await check('stale connection events cannot pause or resume newer generations', async () => {
    const f = await listening(), old = f.binding, stale = {...(await old.context()).context, type: 'DISCONNECTED'}
    await event(f, 'DISCONNECTED'); f.binding = await f.gate.bind(f.candidate, f.id); await event(f, 'CONNECTED'); await f.gate.resume(f.binding); await unchanged(f, () => old.observe(stale))
  })
  await check('reordered sequence and stale expected version fail without receipts', async () => {
    const f = await listening(), context = (await f.binding.context()).context
    await unchanged(f, () => f.binding.observe({...context, sequence: context.sequence + 1, type: 'SPEECH_STARTED'}))
    await unchanged(f, () => f.binding.observe({...context, expectedVersion: context.expectedVersion - 1, type: 'SPEECH_STARTED'})); await event(f, 'SPEECH_STARTED'); await record('reordered/stale version', f)
  })
  await check('simultaneous provider events serialize; only one same-sequence event commits', async () => {
    const f = await listening(), context = (await f.binding.context()).context
    const results = await Promise.allSettled([f.binding.observe({...context, type: 'SPEECH_STARTED'}), f.binding.observe({...context, eventId: randomUUID(), type: 'SPEECH_STARTED'})]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); await record('concurrent provider events', f)
  })
  await check('browser cannot forge STT/provider identity or use typed/mock media on audio session', async () => {
    const f = await listening(), r = await row(f), routes = createInterviewRoutes(f.service, {origins: ['http://localhost:5173'], secure: false, production: false, developmentMock: true}), app = new Hono().route('/api/ai-interview', routes.candidate)
    const request = (path: string, body: unknown) => app.request('/api/ai-interview' + path, {method: 'POST', headers: {origin: 'http://localhost:5173', cookie: f.cookie, 'content-type': 'application/json'}, body: JSON.stringify(body)})
    assert.equal((await request('/commands', {interviewId: f.id, expectedVersion: r.version, command: {type: 'CANDIDATE_TRANSCRIPT_FINAL', commandId: randomUUID(), turnId: r.snapshot.draft!.turnId, text: 'Forged', uncertain: false}})).status, 403)
    assert.equal((await request('/commands', {...(await f.binding.context()).context, type: 'TRANSCRIPT_FINAL', text: 'Forged', uncertain: false, source: 'provider'})).status, 422)
    assert.equal((await request('/answers/submit', {interviewId: f.id, commandId: randomUUID(), expectedVersion: r.version, sessionVersion: r.candidateSessionVersion, questionId: r.snapshot.currentQuestion!.id, turnId: r.snapshot.draft!.turnId, text: 'Forged'})).status, 403)
    assert.equal((await request('/dev/mock', {interviewId: f.id, expectedVersion: r.version, commandId: randomUUID(), action: 'TICK'})).status, 403)
    assert.equal((await request('/provider/events', {})).status, 404); assert.deepEqual(await row(f), r); await record('browser forgery rejected', f)
  })
  await check('production route/readiness fails closed and exposes no provider credential', async () => {
    const f = await fresh(), routes = createInterviewRoutes(f.service, {origins: ['http://localhost:5173'], secure: true, production: true, developmentMock: true}), app = new Hono().route('/api/ai-interview', routes.candidate)
    const response = await app.request('/api/ai-interview/delivery/readiness'), readiness = await response.json(); assert.deepEqual(readiness, {status: 'unavailable', mode: 'disabled', liveValidated: false})
    const start = await app.request('/api/ai-interview/commands', {method: 'POST', headers: {origin: 'http://localhost:5173', cookie: f.cookie, 'content-type': 'application/json'}, body: JSON.stringify({interviewId: f.id, expectedVersion: (await row(f)).version, command: {type: 'START_INTERVIEW', commandId: randomUUID()}})}); assert.equal(start.status, 503)
  })
  await check('foreign interview/generation/question/turn/effect observations are denied', async () => {
    const f = await listening(), context = (await f.binding.context()).context
    for (const changes of [{interviewId: randomUUID()}, {generationId: randomUUID()}, {questionId: 'another-question'}, {turnId: 'turn:999'}, {playbackId: 'playback:999'}]) await unchanged(f, () => f.binding.observe({...context, ...changes, type: 'SPEECH_STARTED'}))
    const other = await fresh(); await assert.rejects(f.gate.bind(other.candidate, f.id), /candidateSessionInvalid/); await assert.rejects(f.gate.bind(hr, f.id), /candidateSessionInvalid/)
  })
  for (const state of ['expired', 'revoked', 'stale-session'] as const) await check(`${state} candidate blocks provider commit`, async () => {
    const f = await listening(), context = (await f.binding.context()).context
    if (state === 'expired') f.clock.advance(3 * 60 * 60 * 1000)
    else if (state === 'revoked') await f.service.revoke(hr, f.id, {commandId: randomUUID(), expectedVersion: (await row(f)).version})
    else await database.update(schema.aiInterviews).set({candidateSessionVersion: (await row(f)).candidateSessionVersion + 1}).where(eq(schema.aiInterviews.id, f.id))
    await unchanged(f, () => f.binding.observe({...context, type: 'SPEECH_STARTED'})); await record('security ' + state, f)
  })
  await check('frozen STT context cannot commit after session revocation in flight', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const d = deferred<unknown>(); f.adapter.stt = () => d.promise; const result = f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()); void result.catch(() => {}); await nextTurn()
    await f.service.revoke(hr, f.id, {commandId: randomUUID(), expectedVersion: (await row(f)).version}); const before = await row(f); d.resolve({text: 'Late after revoke', uncertain: false}); await assert.rejects(result); assert.deepEqual(await row(f), before)
  })
  await check('bounded physical calls retain abandoned work; exhaustion cannot start more', async () => {
    const f = await fresh(), gates: InterviewDeliveryGate[] = [], pending: ReturnType<typeof deferred<unknown>>[] = []
    for (let i = 0; i < 2; i++) { const a = new SyntheticAdapter(), d = deferred<unknown>(); pending.push(d); a.healthy = () => d.promise; const gate = new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, a, {timeoutMs: 10}); gates.push(gate); assert.equal((await gate.checkReadiness()).status, 'unhealthy') }
    const a = new SyntheticAdapter(); let calls = 0; a.healthy = async () => {calls++; return {stt: true, tts: true, connection: true}}; const third = new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, a)
    assert.equal((await third.checkReadiness()).status, 'unhealthy'); assert.equal(calls, 0); assert.equal(third.physicalCalls, 2)
    for (const d of pending) d.resolve({stt: true, tts: true, connection: true}); await nextTurn(); assert.equal((await third.checkReadiness()).status, 'ready'); for (const gate of gates) await gate.close()
  })
  await check('synthetic complete lifecycle includes follow-up/clarification and isolated evaluation job', async () => {
    const f = await fresh(); await start(f); await play(f); await play(f)
    for (const text of ['I used RAG in an HR assistant.', 'I checked some results.', 'I measured recall@5 on labeled queries and reviewed incorrect retrievals.']) {
      f.adapter.transcript = text; await answer(f); const r = await row(f); await f.service.execute(system, f.id, r.version, {type: 'PROCESS_ANSWER', commandId: randomUUID()}); await play(f)
    }
    const r = await record('synthetic completed delivery', f); assert.equal(r.interviewStatus, 'COMPLETED'); assert.equal(r.answerCount, 3); assert.equal(r.questionCount, 3)
    const evaluations = await database.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, f.id)); assert.equal(evaluations.length, 1); assert.equal(evaluations[0]!.status, 'PENDING'); assert.match(evaluations[0]!.inputHash, /^[0-9a-f]{64}$/)
    assert.equal((await database.select().from(applications).where(eq(applications.id, f.applicationId)))[0]!.status, 'new')
  })
  await check('malformed/oversized input audio is rejected before provider execution', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED')
    for (const bytes of [new Uint8Array(80), new Uint8Array(8_000_002), wav().subarray(0, 50)]) await assert.rejects(f.gate.transcribe(f.binding, (await f.binding.context()).context, bytes), /providerMalformed/)
    assert.equal(f.adapter.invocations.stt, 0); await record('invalid input audio', f)
  })
  await check('late TTS after generation replacement cannot start external playback', async () => {
    const f = await fresh(); await start(f); f.gate = new InterviewDeliveryGate(f.service, {mode: 'synthetic', production: false}, f.adapter); await f.gate.checkReadiness()
    const d = deferred<unknown>(), entered = deferred<void>(); f.adapter.tts = () => {entered.resolve(); return d.promise}
    const result = f.gate.deliver(f.binding); void result.catch(() => {}); await entered.promise; await event(f, 'DISCONNECTED'); f.binding = await f.gate.bind(f.candidate, f.id); await event(f, 'CONNECTED')
    const before = await row(f); d.resolve({bytes: wav(), mimeType: 'audio/wav'}); await assert.rejects(result); assert.equal(f.adapter.invocations.play, 0); assert.deepEqual(await row(f), before); await record('late TTS fenced before play', f)
  })
  await check('adapter close durably fences callbacks and consumes late STT settlement', async () => {
    const f = await listening(); await event(f, 'SPEECH_STARTED'); const d = deferred<unknown>(), entered = deferred<void>(); f.adapter.stt = () => {entered.resolve(); return d.promise}
    const stale = {...(await f.binding.context()).context, type: 'TRANSCRIPT_FINAL', text: 'Late after close', uncertain: false}, result = f.gate.transcribe(f.binding, (await f.binding.context()).context, wav()); void result.catch(() => {})
    await entered.promise; await f.gate.close(); await assert.rejects(result, /providerCancelled/); const before = await row(f); assert.equal(before.snapshot.status, 'PAUSED'); await unchanged(f, () => f.binding.observe(stale))
    d.resolve({text: 'Late after close', uncertain: false}); await nextTurn(); assert.deepEqual(await row(f), before)
    const audit = await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId, f.id)); assert(audit.some(r => r.eventType === 'DELIVERY_CLOSED')); await record('closed generation', f)
  })
  await check('simultaneous identical provider identity produces one receipt', async () => {
    const f = await listening(), body = {...(await f.binding.context()).context, type: 'SPEECH_STARTED'}
    const results = await Promise.all([f.binding.observe(body), f.binding.observe(body)]); assert.equal(results.filter(r => r.duplicate).length, 1); await record('same-identity simultaneous events', f)
  })
  await check('duplicate STOP acknowledgement is idempotent and stale STOP cannot affect a turn', async () => {
    const f = await fresh(); await start(f); await play(f); await f.gate.deliver(f.binding); await event(f, 'PLAYBACK_STARTED'); const playbackId = (await row(f)).snapshot.playback!.id; await event(f, 'SPEECH_STARTED')
    const body = {...(await f.binding.context()).context, playbackId, type: 'STOPPED'}; await f.binding.observe(body); const before = await row(f); assert.equal((await f.binding.observe(body)).duplicate, true); assert.deepEqual(await row(f), before)
    await unchanged(f, () => event(f, 'STOPPED', {playbackId})); await record('duplicate STOP ACK', f)
  })
  await check('provider metadata and failures contain no transcript, raw exception or credential', async () => {
    const audit = (await database.select().from(aiInterviewEvents)).filter(r => r.recordType !== 'DOMAIN')
    const text = JSON.stringify(audit.map(r => r.payload)) + JSON.stringify(matrix); assert(!text.includes('SENSITIVE_SECRET')); assert(!text.includes('recall@5')); assert(!text.includes('Synthetic final'))
    for (const r of audit.filter(r => r.eventType === 'DELIVERY_OBSERVED')) for (const key of Object.keys(r.payload)) assert(['generationId', 'cursor', 'observation', 'connected', 'playbackId'].includes(key))
  })
  await check('real model/provider network attempts remain zero', () => assert.equal(external, 0))
  if (process.env.PHASE54_OUTPUT) writeFileSync(resolve(process.env.PHASE54_OUTPUT, 'provider-matrix.json'), JSON.stringify({checks, externalAttempts: external, providerGate: 'synthetic', liveVoiceE2E: 'BLOCKED', fixture: 'Real disposable PostgreSQL; unchanged 0026 on synthetic legacy parents; full-chain pgvector blocker open', matrix}, null, 2) + '\n')
  console.log(`${checks}/${checks} Phase 5.4 provider-gate checks passed; external attempts=${external}`)
} finally {
  await closeApp?.(); await pool?.end(); if (created && /^ai_interview_phase54_[a-f0-9]{32}$/.test(name)) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin.end(); globalThis.fetch = savedFetch; net.Socket.prototype.connect = savedConnect; syncBuiltinESMExports()
}
