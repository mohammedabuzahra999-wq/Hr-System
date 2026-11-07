import assert from 'node:assert/strict'
import { InterviewSession, orderedReplay } from '../../../apps/hr-web/src/features/aiInterviewer/session.ts'
import { CandidateInterviewClient } from '../../../apps/hr-web/src/features/aiInterviewer/client.ts'
import { interviewTime, remainingInterviewMs } from '../../../apps/hr-web/src/features/aiInterviewer/timer.ts'
import { candidateAiInterviewUiStateSchema } from '@hr/shared'

let passed = 0, failed = 0, network = 0
const originalFetch = globalThis.fetch
globalThis.fetch = () => { network++; throw Error('External network forbidden') }
function state(overrides = {}) {
  return candidateAiInterviewUiStateSchema.parse({ interviewId: '11111111-1111-4111-8111-111111111111', version: 10, status: 'ACTIVE', phase: 'LISTENING',
    language: 'mixed', mock: true, currentQuestion: { id: 'q3', prompt: 'Current question only', kind: 'BASE' }, currentTurnId: 'turn:3', delivery: null,
    timer: { listeningStartedAt: 1000, answerDeadlineAt: 121000, remainingMs: 75000, stage: 'ANSWER', graceDeadlineAt: null, warningAtSec: 30, timeLimitSec: 120 },
    consent: { requiredPolicyVersion: 'ai-interview-v1', accepted: true }, recoveryRequired: false, lastSequence: 20, serverNow: 46000,
    speaking: false, canResume: false, pauseReason: null, progress: { current: 3, total: 4, processed: 2 }, ...overrides })
}
function fixture() {
  const context = { current: state(), requests: [], exchangeCount: 0, commands: [], conflict: false, unauthorized: false, invalidInvite: false, mockEnabled: true }
  const fetcher = async (input, init) => {
    context.requests.push({ path: String(input), init })
    const url = new URL(String(input), 'http://localhost')
    const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/exchange')) { context.exchangeCount++; return context.invalidInvite ? response({ error: 'invitationInvalid' }, 401) : response({ interviewId: context.current.interviewId }) }
    if (url.pathname.endsWith('/config')) return response({ mockControlsEnabled: context.mockEnabled })
    if (context.unauthorized) return response({ error: 'candidateSessionInvalid' }, 401)
    if (url.pathname.endsWith('/state')) { const captured=structuredClone(context.current);if(context.stateGate)await context.stateGate;return response(captured) }
    if (url.pathname.endsWith('/events')) return response({ events: [{ sequence: 20, type: 'ANSWER_LISTENING_STARTED', at: 46000 }], nextAfterSequence: 20, hasMore: false })
    const body = JSON.parse(init.body); context.commands.push(body)
    if (context.conflict) return response({ error: 'interviewVersionConflict' }, 409)
    return response({ state: context.current, duplicate: context.commands.length > 1 })
  }
  const session = new InterviewSession(new CandidateInterviewClient(fetcher, '/api/ai-interview'), () => 100)
  return { context, session }
}
async function check(label, test) {
  try { await test(); passed++; console.log(`PASS ${label}`) } catch (error) { failed++; console.error(`FAIL ${label}`, error) }
}
try {
  await check('one-use exchange is shared across StrictMode initialization and requests token removal', async () => {
    const { context, session } = fixture(), removed = []
    await Promise.all([session.initialize('synthetic-secret', true, ok => removed.push(ok)), session.initialize('synthetic-secret', true, ok => removed.push(ok))])
    assert.equal(context.exchangeCount, 1); assert.deepEqual(removed, [true])
    assert(!JSON.stringify(session.getSnapshot()).includes('synthetic-secret'))
  })
  await check('candidate fetches use cookies, no-store and no-referrer, without employee headers', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {})
    for (const request of context.requests) { assert.equal(request.init.credentials, 'include'); assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.referrerPolicy, 'no-referrer'); assert(!JSON.stringify(request.init.headers ?? {}).includes('Authorization')); assert(request.path.startsWith('/api/ai-interview/')) }
  })
  await check('fetch is not invoked with the client object as its browser receiver', async () => {
    let receiver
    const client = new CandidateInterviewClient(function () { receiver = this; return Promise.resolve(new Response(JSON.stringify({ mockControlsEnabled: true }))) }, '/api/ai-interview')
    await client.config(); assert.equal(receiver, undefined)
  })
  await check('refresh reconstructs Q3 and the backend remaining duration', async () => {
    const { session } = fixture(); await session.initialize(null, false, () => {})
    assert.equal(session.getSnapshot().state.currentQuestion.id, 'q3'); assert.equal(session.getSnapshot().state.timer.remainingMs, 75000)
  })
  await check('persisted consent is displayed after a fresh client load', async () => {
    const { session } = fixture(); await session.initialize(null, false, () => {})
    assert.equal(session.getSnapshot().state.consent.accepted, true)
  })
  await check('older responses cannot overwrite newer authoritative versions', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {})
    context.current = state({ version: 11, serverNow: 47000 }); await session.sync()
    context.current = state({ version: 10, serverNow: 46000 }); await session.sync()
    assert.equal(session.getSnapshot().state.version, 11)
  })
  await check('equal-version late reads do not rewind the displayed timer', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {})
    context.current = state({ serverNow: 45000 }); await session.sync(); assert.equal(session.getSnapshot().state.serverNow, 46000)
  })
  await check('a changed candidate identity cannot populate the existing session cache', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {})
    context.current = state({ interviewId: '22222222-2222-4222-8222-222222222222' }); await session.sync()
    assert.equal(session.getSnapshot().state.interviewId, '11111111-1111-4111-8111-111111111111')
    assert(context.requests.at(-2).path.includes('11111111-1111-4111-8111-111111111111'))
  })
  await check('ordered replay ignores duplicate and old events', () => {
    const page = { events: [5, 3, 5, 2, 4].map(sequence => ({ sequence, type: 'x', at: 0 })), nextAfterSequence: 6, hasMore: false }
    assert.deepEqual(orderedReplay(2, page).events.map(e => e.sequence), [3,4,5]); assert.equal(orderedReplay(2, page).cursor, 6)
  })
  await check('filtered gaps advance the replay cursor without inventing state', () => {
    assert.deepEqual(orderedReplay(10, { events: [], nextAfterSequence: 100, hasMore: true }), { events: [], cursor: 100 })
  })
  await check('version conflict performs reconciliation and never blindly resubmits', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {}); context.conflict = true
    assert.equal(await session.send({ type: 'CANCEL_INTERVIEW', commandId: 'same-command' }), false)
    assert.equal(context.commands.length, 1); assert.equal(session.getSnapshot().notice, 'stateReconciled')
    await session.retryLast(); assert.equal(context.commands.length, 1)
  })
  await check('explicit duplicate retry preserves command id and expected version', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {})
    await session.send({ type: 'PAUSE_INTERVIEW', reason: 'USER', commandId: 'stable-command' }); await session.retryLast()
    assert.deepEqual(context.commands[0], context.commands[1]); assert.equal(session.getSnapshot().notice, 'duplicateAcknowledged')
  })
  await check('409 reconciliation refetches after a pre-conflict poll instead of reusing its stale response',async()=>{
    const {context,session}=fixture();await session.initialize(null,false,()=>{})
    let release;context.stateGate=new Promise(r=>{release=r});const polling=session.sync()
    context.current=state({version:11,serverNow:47000});context.conflict=true
    const action=session.send({type:'CANCEL_INTERVIEW',commandId:'conflict-during-poll'})
    await Promise.resolve();context.stateGate=null;release();await polling;await action
    assert.equal(context.commands.length,1);assert.equal(session.getSnapshot().state.version,11);assert.equal(session.getSnapshot().notice,'stateReconciled')
  })
  await check('session expiry clears sensitive cached state and retries', async () => {
    const { context, session } = fixture(); await session.initialize(null, false, () => {}); context.unauthorized = true; await session.sync()
    assert.equal(session.getSnapshot().state, null); assert.deepEqual(session.getSnapshot().events, []); assert.equal(session.getSnapshot().connection, 'expired')
  })
  await check('invalid invitation shows a safe code and removes the credential URL', async () => {
    const { context, session } = fixture(), removed = []; context.invalidInvite = true
    await session.initialize('invalid', true, ok => removed.push(ok)); assert.deepEqual(removed, [false]); assert.equal(session.getSnapshot().error, 'invitationInvalid')
  })
  await check('mock commands fail closed when server capability is disabled', async () => {
    const { context, session } = fixture(); context.mockEnabled = false; await session.initialize(null, false, () => {})
    assert.equal(await session.mock('FAIL'), false); assert.equal(context.commands.length, 0)
  })
  await check('timer interpolation starts from server remaining time and monotonic elapsed time', () => assert.equal(remainingInterviewMs(state(), 100, 5100), 70000))
  await check('paused countdown is frozen regardless of browser wall time', () => assert.equal(remainingInterviewMs(state({ status: 'PAUSED', canResume: true }), 0, 300000), 75000))
  await check('grace display uses the server grace stage', () => { const s = state(); s.timer.stage = 'GRACE'; s.timer.remainingMs = 15000; assert.equal(remainingInterviewMs(s, 0, 4000), 11000) })
  await check('zero display never finalizes, scores or sends a command', () => { const s = state(); assert.equal(remainingInterviewMs(s, 0, 999999), 0); assert.equal(s.status, 'ACTIVE'); assert(!('score' in s)) })
  await check('remaining time is absent during question delivery', () => assert.equal(remainingInterviewMs(state({ timer: null, phase: 'AI_SPEAKING' }), 0, 100), null))
  await check('timer formatting is stable at minute and subsecond boundaries', () => { assert.equal(interviewTime(120000), '02:00'); assert.equal(interviewTime(1), '00:01'); assert.equal(interviewTime(0), '00:00') })
  await check('candidate state validation rejects rubric/weight fields', () => assert.equal(candidateAiInterviewUiStateSchema.safeParse({ ...state(), rubric: {}, weights: [] }).success, false))
  await check('all mock UI unit checks attempted zero external network operations', () => assert.equal(network, 0))
} finally { globalThis.fetch = originalFetch }
console.log(`\n${passed}/${passed + failed} Phase 3 UI logic checks passed; external attempts=${network}`)
if (failed) process.exitCode = 1
