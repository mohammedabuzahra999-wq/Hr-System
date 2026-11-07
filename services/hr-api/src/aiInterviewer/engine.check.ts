import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { syncBuiltinESMExports } from 'node:module'
import { aiInterviewAnswerSchema, aiInterviewEventSchema, aiInterviewSnapshotSchema, interviewPlanSchema,
  type AiInterviewAnswer, type AiInterviewMediaEvent, type AiInterviewQuestion } from '@hr/shared'

// Install before loading the domain: even an accidental I/O dependency must fail.
let networkAttempts = 0
const forbidden = () => { networkAttempts++; throw new Error('Network forbidden in Phase 1 checks') }
const restores: (() => void)[] = []
function replace(object: object, property: string) {
  const old = Object.getOwnPropertyDescriptor(object, property)
  Object.defineProperty(object, property, { configurable: true, writable: true, value: forbidden })
  restores.push(() => { if (old) Object.defineProperty(object, property, old); else Reflect.deleteProperty(object, property) })
}
for (const name of ['fetch', 'WebSocket', 'RTCPeerConnection']) replace(globalThis, name)
for (const object of [http, https]) for (const name of ['request', 'get']) replace(object, name)
for (const name of ['connect', 'createConnection']) replace(net, name)
replace(net.Socket.prototype, 'connect')
replace(tls, 'connect')
syncBuiltinESMExports()

try {
  const { InterviewHarness, runPhase1Scenario, readableTrace } = await import('./harness.js')
  const { InterviewDomainError } = await import('./engine.js')
  const { MockRealtimeProvider } = await import('./providers.js')
  const { MockInterviewerPolicy } = await import('./interviewerPolicy.js')
  const { MockEvaluator, verifyAnswerEvaluation } = await import('./evaluator.js')
  const { phase1Plan, phase1Answers } = await import('./fixtures.js')
  type Harness = InstanceType<typeof InterviewHarness>
  let failures = 0, checks = 0
  function check(label: string, test: () => void) {
    checks++
    try { test(); console.log(`PASS ${String(checks).padStart(2, '0')} ${label}`) }
    catch (error) { failures++; console.error(`FAIL ${label}`, error) }
  }
  function plan(change: Partial<AiInterviewQuestion> = {}) {
    const result = structuredClone(phase1Plan)
    Object.assign(result.questions[0]!, change)
    return interviewPlanSchema.parse(result)
  }
  function listening(change: Partial<AiInterviewQuestion> = {}) {
    const h = new InterviewHarness(); h.listenToFirstQuestion(plan(change)); return h
  }
  const eventsOf = (h: Harness, type: string) => h.engine.events.filter(e => e.type === type)
  const rejects = (fn: () => unknown, code?: string) => assert.throws(fn, error => error instanceof InterviewDomainError && (!code || error.code === code))
  const processAnswer = (h: Harness) => h.send({ type: 'PROCESS_ANSWER' })
  const sampleAnswer = (changes: Partial<AiInterviewAnswer> = {}) => aiInterviewAnswerSchema.parse({
    questionId: 'q1', baseQuestionId: 'q1', criterionKey: 'rag', turnId: 'turn:1', text: phase1Answers[0],
    textSource: 'final', endReason: 'SUBMITTED', timedOut: false, transcriptionUncertain: false,
    questionDelivery: 'complete', finalizedAt: 1000, ...changes,
  })

  check('happy path completes with follow-up, clarification, closing and separate report', () => {
    const run = runPhase1Scenario()
    assert.equal(run.pending.status, 'COMPLETED'); assert.equal(run.pending.evaluationStatus, 'PENDING')
    assert.equal(run.snapshot.evaluationStatus, 'COMPLETED'); assert.equal(run.snapshot.answers.length, 4)
    assert.deepEqual(run.snapshot.processedBaseQuestionIds, ['q1', 'q2'])
    assert(run.trace.some(t => t.includes('FOLLOW_UP_SELECTED')))
    assert(run.trace.some(t => t.includes('CLARIFICATION_SELECTED')))
    assert(run.trace.findIndex(t => t.includes('CLOSING_STARTED')) < run.trace.findIndex(t => t.includes('INTERVIEW_COMPLETED')))
    aiInterviewSnapshotSchema.parse(run.snapshot)
  })
  check('illegal transition is rejected atomically', () => {
    const h = new InterviewHarness(); h.create()
    const before = h.engine.snapshot
    rejects(() => h.send({ type: 'PROCESS_ANSWER' }))
    assert.deepEqual(h.engine.snapshot, before)
  })
  check('answer clock starts only after question playback finishes', () => {
    const h = new InterviewHarness(); h.create(); h.start()
    h.clock.advance(30_000); assert.equal(h.engine.snapshot.timer, null)
    h.deliverPlayback() // Introduction finished; question not yet delivered.
    const id = h.engine.snapshot.playback!.id
    h.media({ type: 'PLAYBACK_STARTED', playbackId: id })
    h.clock.advance(45_000); assert.equal(h.engine.snapshot.timer, null)
    h.media({ type: 'PLAYBACK_FINISHED', playbackId: id })
    assert.equal(h.engine.snapshot.timer!.listeningStartedAt, h.clock.now())
    assert.equal(h.engine.snapshot.timer!.answerDeadlineAt, h.clock.now() + 120_000)
  })
  check('warning occurs at 30 seconds remaining, once per answer', () => {
    const h = listening(); h.advance(89_999); assert.equal(eventsOf(h, 'ANSWER_WARNING').length, 0)
    h.advance(1); h.advance(1); h.advance(500)
    assert.equal(eventsOf(h, 'ANSWER_WARNING').length, 1)
    const e = eventsOf(h, 'ANSWER_WARNING')[0]!
    assert('remainingMs' in e && e.remainingMs === 30_000)
  })
  check('silent candidate reaches ANSWER_TIMEOUT at the exact deadline', () => {
    const h = listening(); h.advance(119_999); assert.equal(h.engine.snapshot.phase, 'LISTENING')
    h.advance(1); assert.equal(eventsOf(h, 'ANSWER_TIMEOUT').length, 1)
    assert.equal(h.engine.snapshot.phase, 'PROCESSING'); assert.equal(h.engine.snapshot.answers[0]!.endReason, 'SILENCE')
  })
  check('timeout with no evidence never invents a zero score', () => {
    const h = listening(); h.advance(120_000); processAnswer(h)
    const evaluation = h.engine.snapshot.evaluations[0]!
    assert(evaluation.dimensions.every(d => d.status === 'not_assessed' && d.score === 'not_assessed'))
  })
  check('already active speaker receives exactly the configured grace', () => {
    const h = listening(), turnId = h.engine.snapshot.draft!.turnId
    h.media({ type: 'SPEECH_STARTED', turnId }); h.advance(120_000)
    assert.equal(h.engine.snapshot.timer!.stage, 'GRACE')
    assert.equal(h.engine.snapshot.timer!.graceDeadlineAt, h.clock.now() + 15_000)
    assert.equal(h.engine.snapshot.answers.length, 0)
  })
  check('grace expires at its boundary and finalizes available partial evidence safely', () => {
    const h = listening(), turnId = h.engine.snapshot.draft!.turnId
    h.media({ type: 'SPEECH_STARTED', turnId }); h.media({ type: 'TRANSCRIPT_PARTIAL', turnId, text: 'I measured recall' })
    h.advance(120_000); h.advance(14_999); assert.equal(h.engine.snapshot.phase, 'LISTENING')
    h.advance(1)
    const answer = h.engine.snapshot.answers[0]!
    assert.equal(answer.endReason, 'TIME_LIMIT'); assert.equal(answer.text, 'I measured recall')
    assert.equal(answer.textSource, 'partial'); assert.equal(answer.transcriptionUncertain, true)
  })
  check('follow-up starts its own followUpTimeLimitSec timer', () => {
    const h = listening(); h.answer(phase1Answers[0]); processAnswer(h)
    assert.equal(h.engine.snapshot.timer, null); assert.equal(h.engine.snapshot.currentQuestion!.kind, 'FOLLOW_UP')
    h.clock.advance(10_000); h.deliverPlayback()
    assert.equal(h.engine.snapshot.timer!.timeLimitSec, 60)
    assert.equal(h.engine.snapshot.timer!.answerDeadlineAt, h.clock.now() + 60_000)
  })
  check('maxFollowUps is enforced against a greedy policy', () => {
    class Greedy extends MockInterviewerPolicy {
      override afterAnswer({ state, baseQuestion }: Parameters<InstanceType<typeof MockInterviewerPolicy>['afterAnswer']>[0]) {
        const index = state.counts[baseQuestion.id]!.followUps % baseQuestion.followUps.length
        return { type: 'FOLLOW_UP' as const, promptId: baseQuestion.followUps[index]?.id ?? 'missing' }
      }
    }
    const h = new InterviewHarness({ policy: new Greedy() })
    h.listenToFirstQuestion(plan({ followUps: [...phase1Plan.questions[0]!.followUps, { id: 'extra', prompt: 'A third approved prompt that exceeds the configured limit.' }] }))
    for (let n = 0; n < 3; n++) { h.answer('Synthetic answer'); processAnswer(h); if (n < 2) h.deliverPlayback() }
    assert.equal(h.engine.snapshot.counts.q1!.followUps, 2)
    assert.equal(h.engine.snapshot.currentQuestion!.baseQuestionId, 'q2')
    assert.equal(eventsOf(h, 'POLICY_LIMIT_ENFORCED').length, 1)
  })
  check('maxClarifications is enforced even when policy keeps requesting one', () => {
    class Greedy extends MockInterviewerPolicy {
      override afterAnswer({ state, baseQuestion }: Parameters<InstanceType<typeof MockInterviewerPolicy>['afterAnswer']>[0]) {
        return { type: 'CLARIFICATION' as const, promptId: baseQuestion.clarifications[state.counts[baseQuestion.id]!.clarifications]?.id ?? 'missing' }
      }
    }
    const h = new InterviewHarness({ policy: new Greedy() })
    h.listenToFirstQuestion(plan({ clarifications: [...phase1Plan.questions[0]!.clarifications, { id: 'extra', prompt: 'A second approved clarification that exceeds the configured limit.' }] }))
    h.answer('Synthetic answer'); processAnswer(h); h.deliverPlayback()
    h.answer('Synthetic answer'); processAnswer(h)
    assert.equal(h.engine.snapshot.counts.q1!.clarifications, 1)
    assert.equal(h.engine.snapshot.currentQuestion!.id, 'q2')
  })
  check('pause stores 80 seconds after 40 seconds used', () => {
    const h = listening(); h.advance(40_000); h.send({ type: 'PAUSE_INTERVIEW', reason: 'USER' })
    assert.equal(h.engine.snapshot.status, 'PAUSED'); assert.equal(h.engine.snapshot.timer!.pausedRemainingMs, 80_000)
  })
  check('resume sets a new deadline using the frozen duration', () => {
    const h = listening(); h.advance(40_000); h.send({ type: 'PAUSE_INTERVIEW', reason: 'USER' })
    h.clock.advance(300_000); h.send({ type: 'RESUME_INTERVIEW' })
    assert.equal(h.engine.snapshot.timer!.answerDeadlineAt, h.clock.now() + 80_000)
    assert.equal(h.engine.snapshot.timer!.pausedRemainingMs, null)
  })
  check('long provider disconnect consumes no paused answer time', () => {
    const h = listening(); h.advance(40_000); h.media({ type: 'DISCONNECT' })
    h.clock.advance(300_000)
    rejects(() => h.send({ type: 'TIMER_TICK' }))
    h.media({ type: 'RECONNECT' }); h.advance(79_999)
    assert.equal(h.engine.snapshot.phase, 'LISTENING'); h.advance(1)
    assert.equal(h.engine.snapshot.phase, 'PROCESSING')
  })
  check('command idempotency never repeats events, effects or state changes', () => {
    const h = new InterviewHarness(); h.create()
    const command = { type: 'START_INTERVIEW' as const, commandId: 'stable-start' }
    const first = h.send(command), after = h.engine.snapshot
    h.clock.advance(5000); const duplicate = h.send(command)
    assert.equal(first.duplicate, false); assert.equal(duplicate.duplicate, true)
    assert.deepEqual(duplicate.events, []); assert.deepEqual(duplicate.effects, [])
    assert.deepEqual(h.engine.snapshot, after)
    rejects(() => h.send({ type: 'CANCEL_INTERVIEW', commandId: 'stable-start' }), 'COMMAND_ID_CONFLICT')
  })
  check('barge-in stops delivery and records that the full question was not heard', () => {
    const h = new InterviewHarness(); h.create(); h.start(); h.deliverPlayback()
    const playbackId = h.engine.snapshot.playback!.id
    h.media({ type: 'PLAYBACK_STARTED', playbackId }); h.media({ type: 'INTERRUPTION', playbackId })
    assert.equal(h.engine.snapshot.phase, 'LISTENING')
    assert.equal(h.engine.snapshot.draft!.questionDelivery, 'interrupted')
    assert((h.provider as InstanceType<typeof MockRealtimeProvider>).wasStopped(playbackId))
    h.answer(phase1Answers[0]); assert.equal(h.engine.snapshot.answers[0]!.questionDelivery, 'interrupted')
    rejects(() => h.media({ type: 'PLAYBACK_FINISHED', playbackId }), 'STALE_PLAYBACK')
  })
  check('completed interview rejects new answers', () => {
    const h = new InterviewHarness(); h.listenToFirstQuestion()
    for (let i = 0; i < 2; i++) { h.answer(phase1Answers[3]); processAnswer(h); h.deliverPlayback() }
    assert.equal(h.engine.snapshot.status, 'COMPLETED')
    rejects(() => h.send({ type: 'CANDIDATE_TRANSCRIPT_FINAL', turnId: 'turn:1', text: 'late', uncertain: false }), 'INTERVIEW_TERMINAL')
  })
  check('cancelled interview rejects continuation', () => {
    const h = listening(); h.send({ type: 'CANCEL_INTERVIEW' })
    rejects(() => h.send({ type: 'RESUME_INTERVIEW' }), 'INTERVIEW_TERMINAL')
    rejects(() => h.send({ type: 'PROCESS_ANSWER' }), 'INTERVIEW_TERMINAL')
  })
  check('failed interview resumes only when explicitly recoverable', () => {
    const h = listening(); h.send({ type: 'FAIL_INTERVIEW', code: 'test-failure', recoverable: false })
    rejects(() => h.send({ type: 'RESUME_INTERVIEW' }), 'INTERVIEW_TERMINAL')
    const retry = listening(); retry.advance(40_000)
    retry.send({ type: 'FAIL_INTERVIEW', code: 'transient', recoverable: true }); retry.clock.advance(300_000)
    retry.send({ type: 'RESUME_INTERVIEW' })
    assert.equal(retry.engine.snapshot.status, 'ACTIVE')
    assert.equal(retry.engine.snapshot.timer!.answerDeadlineAt, retry.clock.now() + 80_000)
  })
  check('mock provider simulates every required observation with no network', () => {
    const provider = new MockRealtimeProvider(), seen: string[] = []
    provider.subscribe(e => seen.push(e.type))
    const observations: AiInterviewMediaEvent[] = [
      { eventId: 'm1', type: 'PLAYBACK_STARTED', playbackId: 'p1' }, { eventId: 'm2', type: 'PLAYBACK_FINISHED', playbackId: 'p1' },
      { eventId: 'm3', type: 'SPEECH_STARTED', turnId: 't1' }, { eventId: 'm4', type: 'TRANSCRIPT_PARTIAL', turnId: 't1', text: 'part' },
      { eventId: 'm5', type: 'TRANSCRIPT_FINAL', turnId: 't1', text: 'final', uncertain: false },
      { eventId: 'm6', type: 'SPEECH_FINISHED', turnId: 't1' }, { eventId: 'm7', type: 'SILENCE' },
      { eventId: 'm8', type: 'INTERRUPTION', playbackId: 'p1' }, { eventId: 'm9', type: 'DISCONNECT' },
      { eventId: 'm10', type: 'RECONNECT' }, { eventId: 'm11', type: 'TIMEOUT' },
    ]
    for (const event of observations) provider.emit(event)
    assert.deepEqual(seen, observations.map(e => e.type)); assert.equal(networkAttempts, 0)
  })
  check('evaluator returns five structured dimensions with exact matching evidence', () => {
    const answer = sampleAnswer(), evaluation = new MockEvaluator().evaluate(answer)
    assert.equal(evaluation.dimensions.length, 5)
    assert(evaluation.dimensions.every(d => d.status === 'assessed' && d.evidence[0]!.exactQuote === answer.text))
    assert(!('overallScore' in evaluation)); assert(!('hiringDecision' in evaluation))
    verifyAnswerEvaluation(evaluation, answer)
  })
  check('policy cannot invent unapproved prompts or skip required base questions', () => {
    class InventsPrompt extends MockInterviewerPolicy {
      override afterAnswer() { return { type: 'FOLLOW_UP' as const, promptId: 'unapproved' } }
    }
    const h = new InterviewHarness({ policy: new InventsPrompt() }); h.listenToFirstQuestion()
    h.answer('Synthetic answer'); processAnswer(h)
    assert.equal(h.engine.snapshot.currentQuestion!.id, 'q2'); assert.equal(h.engine.snapshot.counts.q1!.followUps, 0)
    class Skips extends MockInterviewerPolicy { override chooseNextBase() { return null } }
    const bad = new InterviewHarness({ policy: new Skips() }); bad.create(); bad.start()
    rejects(() => bad.deliverPlayback(), 'POLICY_CANNOT_SKIP_BASE_QUESTION')
  })

  check('zero grace and late ticks cannot extend the answer budget', () => {
    const h = listening({ gracePeriodSec: 0 }), turnId = h.engine.snapshot.draft!.turnId
    h.media({ type: 'SPEECH_STARTED', turnId }); h.advance(120_000)
    assert.equal(h.engine.snapshot.answers[0]!.endReason, 'TIME_LIMIT')
    const late = listening(), t = late.engine.snapshot.draft!.turnId
    late.media({ type: 'SPEECH_STARTED', turnId: t }); late.advance(500_000)
    assert.equal(late.engine.snapshot.phase, 'PROCESSING')
  })
  check('late speech cannot obtain grace and an overdue pause is refused', () => {
    const h = listening(), turnId = h.engine.snapshot.draft!.turnId
    h.clock.advance(120_000)
    rejects(() => h.media({ type: 'SPEECH_STARTED', turnId }), 'ANSWER_DEADLINE_PASSED_TICK_REQUIRED')
    rejects(() => h.send({ type: 'PAUSE_INTERVIEW', reason: 'USER' }), 'ANSWER_DEADLINE_PASSED_TICK_REQUIRED')
    h.send({ type: 'TIMER_TICK' }); assert.equal(h.engine.snapshot.answers[0]!.timedOut, true)
  })
  check('silence clarification has a fresh explicit timer and cannot loop forever', () => {
    const h = listening({ silenceThresholdSec: 10 })
    h.advance(10_000); assert.equal(eventsOf(h, 'ANSWER_SILENCE_DETECTED').length, 1)
    processAnswer(h); h.deliverPlayback(); assert.equal(h.engine.snapshot.timer!.timeLimitSec, 30)
    h.advance(10_000); processAnswer(h)
    assert.equal(h.engine.snapshot.currentQuestion!.id, 'q2')
    assert.equal(h.engine.snapshot.counts.q1!.clarifications, 1)
  })
  check('pause during grace freezes only the remaining grace, without renewing it', () => {
    const h = listening(), turnId = h.engine.snapshot.draft!.turnId
    h.media({ type: 'SPEECH_STARTED', turnId }); h.advance(125_000)
    h.send({ type: 'PAUSE_INTERVIEW', reason: 'USER' }); assert.equal(h.engine.snapshot.timer!.pausedRemainingMs, 10_000)
    h.clock.advance(300_000); h.send({ type: 'RESUME_INTERVIEW' }); h.advance(10_000)
    assert.equal(h.engine.snapshot.answers[0]!.endReason, 'TIME_LIMIT')
    assert.equal(eventsOf(h, 'ANSWER_GRACE_STARTED').length, 1)
  })
  check('reconnect during playback replays it with a new id and no premature timer', () => {
    const h = new InterviewHarness(); h.create(); h.start(); h.deliverPlayback()
    const old = h.engine.snapshot.playback!.id
    h.media({ type: 'PLAYBACK_STARTED', playbackId: old }); h.media({ type: 'DISCONNECT' })
    h.clock.advance(300_000); h.media({ type: 'RECONNECT' })
    assert.notEqual(h.engine.snapshot.playback!.id, old)
    rejects(() => h.media({ type: 'PLAYBACK_FINISHED', playbackId: old }), 'STALE_PLAYBACK')
    assert.equal(h.engine.snapshot.timer, null); h.deliverPlayback()
    assert.equal(h.engine.snapshot.timer!.answerDeadlineAt, h.clock.now() + 120_000)
  })
  check('final transcript may arrive after speech-finished; partial text is not submitted early', () => {
    const h = listening(), turnId = h.engine.snapshot.draft!.turnId
    h.media({ type: 'SPEECH_STARTED', turnId }); h.media({ type: 'TRANSCRIPT_PARTIAL', turnId, text: 'part' })
    h.media({ type: 'SPEECH_FINISHED', turnId }); assert.equal(h.engine.snapshot.answers.length, 0)
    h.media({ type: 'TRANSCRIPT_FINAL', turnId, text: phase1Answers[0], uncertain: false })
    assert.equal(h.engine.snapshot.answers[0]!.text, phase1Answers[0])
  })
  check('timeout, reconnect metadata and uncertainty never cause automatic score deductions', () => {
    const evaluator = new MockEvaluator(), normal = sampleAnswer()
    assert.deepEqual(evaluator.evaluate(normal), evaluator.evaluate({ ...normal, timedOut: true, endReason: 'TIME_LIMIT' }))
    assert(evaluator.evaluate({ ...normal, transcriptionUncertain: true }).dimensions.every(d => d.score === 'not_assessed'))
  })
  check('resumed speech waits for its current final transcript and retains the latest available evidence', () => {
    const h = listening(), turnId = h.engine.snapshot.draft!.turnId
    h.media({ type: 'SPEECH_STARTED', turnId })
    h.media({ type: 'TRANSCRIPT_FINAL', turnId, text: 'Earlier cumulative text.', uncertain: false })
    h.media({ type: 'DISCONNECT' }); h.clock.advance(300_000); h.media({ type: 'RECONNECT' })
    h.media({ type: 'SPEECH_STARTED', turnId })
    h.media({ type: 'TRANSCRIPT_PARTIAL', turnId, text: 'Earlier cumulative text. More evidence.' })
    h.media({ type: 'SPEECH_FINISHED', turnId })
    assert.equal(h.engine.snapshot.answers.length, 0)
    h.media({ type: 'TRANSCRIPT_FINAL', turnId, text: 'Earlier cumulative text. More evidence.', uncertain: false })
    assert.equal(h.engine.snapshot.answers[0]!.text, 'Earlier cumulative text. More evidence.')
    const limited = listening(), t = limited.engine.snapshot.draft!.turnId
    limited.media({ type: 'SPEECH_STARTED', turnId: t })
    limited.media({ type: 'TRANSCRIPT_FINAL', turnId: t, text: 'Earlier text.', uncertain: false })
    limited.media({ type: 'TRANSCRIPT_PARTIAL', turnId: t, text: 'Earlier text. New partial.' })
    limited.advance(135_000)
    assert.equal(limited.engine.snapshot.answers[0]!.text, 'Earlier text. New partial.')
    assert.equal(limited.engine.snapshot.answers[0]!.transcriptionUncertain, true)
  })
  check('fabricated evidence and mismatched turn references are rejected', () => {
    const answer = sampleAnswer(), evaluator = new MockEvaluator(), forged = evaluator.evaluate(answer)
    forged.dimensions[0]!.evidence[0]!.exactQuote = 'invented quote'
    assert.throws(() => verifyAnswerEvaluation(forged, answer), /evidence mismatch/)
    const wrong = evaluator.evaluate(answer); wrong.turnId = 'different-turn'
    assert.throws(() => verifyAnswerEvaluation(wrong, answer), /answer mismatch/)
  })
  check('contracts reject malformed plans, duplicate ids and unreasonable limits', () => {
    for (const change of [{ answerTimeLimitSec: 0 }, { maxFollowUps: 6 }, { warningAtSec: 121 }, { gracePeriodSec: 121 }]) {
      assert.throws(() => plan(change))
    }
    const duplicate = structuredClone(phase1Plan); duplicate.questions[1]!.id = 'q1'
    assert.equal(interviewPlanSchema.safeParse(duplicate).success, false)
    assert.throws(() => plan({ id: 'q1:followUps:1' }))
    for (const language of ['en', 'ar', 'mixed'] as const) assert(interviewPlanSchema.safeParse({ ...phase1Plan, language }).success)
  })
  check('snapshots, plans and returned events cannot mutate engine state', () => {
    const h = new InterviewHarness(), p = structuredClone(phase1Plan); h.create(p)
    p.questions[0]!.prompt = 'changed'
    const snapshot = h.engine.snapshot; snapshot.plan.questions[0]!.prompt = 'changed again'
    const history = h.engine.events; history.length = 0
    assert.equal(h.engine.snapshot.plan.questions[0]!.prompt, phase1Plan.questions[0]!.prompt)
    assert.equal(h.engine.events.length, 2)
  })
  check('event trace is deterministic, typed, ordered, and excludes answer text', () => {
    const a = runPhase1Scenario(), b = runPhase1Scenario(); assert.deepEqual(a, b)
    const h = listening(); h.answer(phase1Answers[0]); processAnswer(h)
    for (const [index, event] of h.engine.events.entries()) { aiInterviewEventSchema.parse(event); assert.equal(event.seq, index + 1) }
    assert(!readableTrace(h.engine).join('\n').includes(phase1Answers[0]))
  })
  check('provider timeout pauses without completing or failing the interview', () => {
    const h = listening(); h.advance(5000); h.media({ type: 'TIMEOUT' })
    assert.equal(h.engine.snapshot.status, 'PAUSED'); assert.equal(h.engine.snapshot.timer!.pausedRemainingMs, 115_000)
  })
  check('barge-in can be disabled by the plan', () => {
    const h = new InterviewHarness(); h.create(plan({ allowBargeIn: false })); h.start(); h.deliverPlayback()
    const playbackId = h.engine.snapshot.playback!.id; h.media({ type: 'PLAYBACK_STARTED', playbackId })
    rejects(() => h.media({ type: 'INTERRUPTION', playbackId }), 'INTERRUPTION_NOT_ALLOWED')
    assert.equal(h.engine.snapshot.timer, null)
  })
  check('full import, harness, policy and evaluator suite attempted zero network operations', () => assert.equal(networkAttempts, 0))
  console.log(`\n${checks - failures}/${checks} Phase 1 checks passed; network attempts=${networkAttempts}`)
  if (failures) process.exitCode = 1
} finally {
  for (const restore of restores.reverse()) restore()
  syncBuiltinESMExports()
}
