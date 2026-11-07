import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import { Hono } from 'hono'
import { actionProposalSchema, copilotAnswerSchema, type SessionUser, type Role, type CopilotRequest, type CopilotPlan } from '@hr/shared'
import { CASES } from './benchmark/cases.js'
import { TERMINAL_EXPECTATIONS, ABSTENTIONS } from './routingOutcome.fixtures.js'
import { EMPTY_ACTION_PLAN, EMPTY_PLAN } from './phrasebook.js'
import { remember, pendingFor, clear, rememberQuestion, lastQuestion, readClarificationFor } from './conversation.js'
import { resetRateLimits } from '../rateLimit.js'
import { db } from '../db/client.js'

// Compile in memory with instrumented module boundaries. Production source,
// authentication/body validation/rate limiting, routing and auditing flow run.
function isolatedUrl(file: URL, overrides: Record<string, string>) {
  let code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText
  code = code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote: string, specifier: string) => {
    const replacement = overrides[specifier]
    const url = replacement ? 'data:text/javascript;base64,' + Buffer.from(replacement).toString('base64')
      : specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier)
    return `from ${JSON.stringify(url)}`
  })
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
}
const key = Symbol.for('hr.check.phase3d')
const slots = globalThis as unknown as Record<symbol, unknown>
const zero = () => ({ resolveQuestion: 0, resolveAction: 0, continueTask: 0, phraseAnswer: 0,
  knowledge: 0, embeddings: 0, readExecutor: 0, actionProposal: 0, actionExecutor: 0, network: 0, database: 0, memory: 0 })
const state = { actor: null as SessionUser | null, calls: zero(), permitFallback: false, permitContinuation: false,
  permitLocalRead: false, emptyLocalRead: false, readPlans: [] as CopilotPlan[],
  audits: [] as Record<string, unknown>[], unanswered: [] as Record<string, unknown>[],
  candidate: null as unknown, logs: [] as string[],
  hit(name: keyof ReturnType<typeof zero>, plan?: CopilotPlan) {
    this.calls[name]++
    if (name === 'readExecutor' && this.permitLocalRead) {
      if (plan) this.readPlans.push(plan)
      return { result: { kind: 'stats', stats: [{ label: { en: 'Present', ar: 'حضور' }, value: '2', detail: null }] },
        periodLabel: plan?.period === 'lastMonth' ? { en: 'Last month', ar: 'الشهر الماضي' } : { en: 'This month', ar: 'هذا الشهر' },
        empty: this.emptyLocalRead }
    }
    if (this.permitFallback) {
      if (name === 'resolveQuestion') return this.candidate ? { ok: true, plan: this.candidate, routingSource: 'model' } : { ok: false, reason: 'aiInvalidOutput' }
      if (name === 'resolveAction') return { ok: false, reason: 'aiInvalidOutput' }
      if (name === 'readExecutor') return { result: { kind: 'stats', stats: [] }, periodLabel: null, empty: true }
      if (name === 'memory' || name === 'phraseAnswer') return null
    }
    if (name === 'continueTask' && this.permitContinuation) return { continues: true, plan: { ...EMPTY_ACTION_PLAN, action: 'requestLeave' } }
    if (name === 'actionProposal' && this.permitContinuation) return { ok: true, proposal: actionProposalSchema.parse({
      action: 'requestLeave', summary: { en: 'Synthetic proposal', ar: 'طلب تجريبي' }, details: [], destructive: false,
      caution: null, params: { ...EMPTY_ACTION_PLAN, action: 'requestLeave', targetId: null },
    }) }
    throw new Error(`Forbidden terminal side effect: ${name}`)
  },
}
const access = "globalThis[Symbol.for('hr.check.phase3d')]"
function actor(role: Role): SessionUser {
  return { id: randomUUID(), role, fullName: { en: 'Synthetic', ar: 'تجريبي' }, email: 'synthetic@example.invalid',
    employeeNumber: 'SYN-TEST', jobTitle: { en: 'Synthetic', ar: 'تجريبي' }, department: { en: 'Synthetic', ar: 'تجريبي' },
    managerId: null, managerName: null, photoUrl: null }
}
const savedFetch = globalThis.fetch, savedSelect = db.select, savedInsert = db.insert, savedLog = console.info
assert.equal(slots[key], undefined)
slots[key] = state
globalThis.fetch = async () => { state.hit('network'); throw new Error('Network forbidden') }
db.select = (() => state.hit('database')) as unknown as typeof db.select
db.insert = (() => state.hit('database')) as unknown as typeof db.insert
console.info = (...args) => { state.logs.push(JSON.stringify(args)) }
resetRateLimits()
try {
  const auditStub = `export const auditCopilot=async(_actor,event)=>${access}.audits.push(event)`
  const middleware = isolatedUrl(new URL('../middleware.ts', import.meta.url), {
    './auth/session.js': `export const resolveSession=async()=>${access}.actor`,
    './copilot/audit.js': auditStub,
  })
  const url = isolatedUrl(new URL('../routes/copilot.ts', import.meta.url), {
    '../middleware.js': `export { requireAuth, validateBody } from ${JSON.stringify(middleware)}`,
    '../copilot/resolve.js': `export const resolveQuestion=async()=>${access}.hit('resolveQuestion');
      export const resolveAction=async()=>${access}.hit('resolveAction');
      export const continueTask=async()=>${access}.hit('continueTask');
      export const phraseAnswer=async()=>${access}.hit('phraseAnswer')`,
    '../knowledge/service.js': `export const answerFromKnowledge=async()=>${access}.hit('knowledge')`,
    '../ai/retrieval.js': `export const suggestFromApproved=async()=>${access}.hit('embeddings')`,
    '../copilot/execute.js': `export const executeIntent=async(plan)=>${access}.hit('readExecutor',plan)`,
    '../copilot/perform.js': `export const proposeAction=async()=>${access}.hit('actionProposal');export const runAction=async()=>${access}.hit('actionExecutor')`,
    '../reports/employeeFile.js': `export const buildEmployeeFile=async()=>${access}.hit('readExecutor');export const buildEmployeePayrollReport=buildEmployeeFile`,
    '../reports/build.js': `export const buildReport=async()=>${access}.hit('readExecutor')`,
    '../reports/narrate.js': `export const narrate=async()=>${access}.hit('phraseAnswer')`,
    '../copilot/memory.js': `export const recall=async()=>{${access}.calls.memory++;return null};export const remember=async()=>${access}.hit('memory')`,
    '../copilot/audit.js': auditStub,
    '../copilot/unanswered.js': `export const saveUnansweredQuestion=async(_actor,_question,details)=>${access}.unanswered.push(details)`,
  })
  const route = await import(url)
  const app = new Hono().route('/copilot', route.copilotRoutes)
  async function ask(question: string, extra: Partial<CopilotRequest> = {}) {
    return app.request('/copilot/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, ...extra }) })
  }
  const rows: { id: string; kind: string; pass: boolean; calls: ReturnType<typeof zero> }[] = []
  for (const [id, expected] of Object.entries(TERMINAL_EXPECTATIONS)) {
    const test = CASES.find(test => test.id === id)!
    state.actor = actor(test.role)
    state.calls = zero(); state.audits = []; state.unanswered = []; state.logs = []
    const response = await ask(test.input)
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('Server-Timing'))
    assert.ok(response.headers.get('RateLimit-Limit'))
    const answer = copilotAnswerSchema.parse((await response.json() as { answer: unknown }).answer)
    assert.equal(answer.result.kind, 'none')
    assert.equal(answer.refusal, expected.kind === 'outOfScope' ? 'notHrData' : null)
    assert.deepEqual(state.calls, zero(), id)
    assert.equal(state.audits.length, 1)
    assert.equal(state.audits[0]!.status, expected.kind === 'outOfScope' ? 'out_of_scope' : 'invalid')
    assert.equal(state.audits[0]!.reason, expected.code)
    assert.equal(state.audits[0]!.tool, null)
    assert.deepEqual(state.unanswered, [{ intent: 'outOfScope', reason: expected.kind === 'outOfScope' ? 'notHrData' : 'unclear' }])
    assert.ok(!JSON.stringify(state.audits).includes(test.input))
    assert.ok(!JSON.stringify(state.logs).includes(test.input))
    assert.equal(pendingFor(state.actor.id), null)
    assert.equal(lastQuestion(state.actor.id), null)
    rows.push({ id, kind: expected.kind, pass: true, calls: { ...state.calls } })
  }
  // An attendance record without an owner asks for scope immediately, including
  // on a content page or after a prior answer. No model or data read is needed.
  for (const role of ['employee', 'manager', 'hr', 'admin'] as const) {
    state.actor = actor(role)
    for (const question of ['اعطيني سجل الحضور', 'أعطيني سجل الدوام لو سمحت', 'Give me attendance records']) {
      state.calls = zero()
      rememberQuestion(state.actor.id, { ...EMPTY_PLAN, intent: 'myAttendance' })
      const response = await ask(question, { path: '/hr/job-descriptions' })
      assert.equal(response.status, 200)
      const answer = copilotAnswerSchema.parse((await response.json() as { answer: unknown }).answer)
      assert.match(answer.sentence.ar, /سجل حضور مين/)
      assert.equal(answer.refusal, null)
      assert.equal(answer.result.kind, 'none')
      assert.equal(answer.sentence.ar.includes('«الشركة»'), role === 'hr' || role === 'admin')
      assert.equal(answer.sentence.ar.includes('«فريقي»'), role !== 'employee')
      assert.deepEqual(state.calls, zero())
    }
  }
  // Complete reads (including repeated questions) return nonempty results
  // directly. Optional prose must never introduce a second model round trip.
  const localReads = [
    ['employee', 'اعطيني سجل حضوري الشهر الماضي', 'myAttendance', 'lastMonth'],
    ['manager', 'جيبلي حضور فريقي اليوم', 'teamAttendance', 'today'],
    ['hr', 'اعطيني سجل حضور الشركة هذا الشهر', 'orgAttendance', 'thisMonth'],
    ['admin', 'Give me company attendance records in month 9 of 2026', 'orgAttendance', 'calendarMonth'],
  ] as const
  state.permitLocalRead = true
  for (const [role, question, intent, period] of localReads) {
    state.actor = actor(role)
    for (let repeat = 0; repeat < 2; repeat++) {
      state.calls = zero(); state.readPlans = []
      const response = await ask(question)
      assert.equal(response.status, 200)
      const answer = copilotAnswerSchema.parse((await response.json() as { answer: unknown }).answer)
      assert.equal(answer.intent, intent)
      assert.equal(answer.result.kind, 'stats')
      assert.equal(answer.refusal, null)
      assert.equal(state.readPlans[0]?.period, period)
      assert.deepEqual(state.calls, { ...zero(), readExecutor: 1 })
    }
  }
  // The user's complete transcript: hello -> missing owner -> "my own
  // attendance" -> empty current month -> "then last month". Every turn
  // preserves the right subject, with no model needed to recover context.
  state.actor = actor('admin'); state.calls = zero()
  assert.equal((await (await ask('مرحبا')).json() as { answer: { intent: string } }).answer.intent, 'greeting')
  await ask('اعطيني سجل الحضور')
  assert.ok(readClarificationFor(state.actor.id))
  state.calls = zero(); state.readPlans = []; state.emptyLocalRead = true
  const emptyResponse = await ask('حضوري انا')
  const emptyAnswer = copilotAnswerSchema.parse((await emptyResponse.json() as { answer: unknown }).answer)
  assert.equal(emptyAnswer.intent, 'myAttendance')
  assert.equal(emptyAnswer.refusal, 'noData')
  assert.match(emptyAnswer.sentence.ar, /ما في سجلات حضور إلك خلال هذا الشهر/)
  assert.match(emptyAnswer.sentence.ar, /الشهر الماضي/)
  assert.equal(lastQuestion(state.actor.id)?.intent, 'myAttendance')
  assert.equal(readClarificationFor(state.actor.id), null)
  assert.deepEqual(state.calls, { ...zero(), readExecutor: 1 })
  state.calls = zero(); state.readPlans = []; state.emptyLocalRead = false
  const previousMonth = await ask('طيب الشهر الماضي')
  const previousAnswer = copilotAnswerSchema.parse((await previousMonth.json() as { answer: unknown }).answer)
  assert.equal(previousAnswer.intent, 'myAttendance')
  assert.equal(previousAnswer.refusal, null)
  assert.equal(state.readPlans[0]?.period, 'lastMonth')
  assert.deepEqual(state.calls, { ...zero(), readExecutor: 1 })

  for (const [role, reply, expected] of [
    ['employee', 'أنا', 'myAttendance'], ['manager', 'فريقي', 'teamAttendance'],
    ['hr', 'كل الموظفين', 'orgAttendance'],
  ] as const) {
    state.actor = actor(role)
    await ask('اعطيني سجل الحضور خلال شهر 9 من 2026')
    await ask('مرحبا') // A greeting must not discard the unanswered scope.
    state.calls = zero(); state.readPlans = []
    const response = await ask(reply)
    const answer = copilotAnswerSchema.parse((await response.json() as { answer: unknown }).answer)
    assert.equal(answer.intent, expected)
    assert.equal(answer.refusal, null)
    assert.equal(state.readPlans[0]?.month, 9)
    assert.equal(state.readPlans[0]?.year, 2026)
    assert.deepEqual(state.calls, { ...zero(), readExecutor: 1 })
  }
  state.actor = actor('employee')
  await ask('اعطيني سجل الحضور')
  state.calls = zero()
  const periodOnly = await ask('الشهر الماضي')
  const periodAnswer = copilotAnswerSchema.parse((await periodOnly.json() as { answer: unknown }).answer)
  assert.match(periodAnswer.sentence.ar, /سجل حضور مين/)
  assert.equal(readClarificationFor(state.actor.id)?.timing.period, 'lastMonth')
  assert.deepEqual(state.calls, zero())
  state.readPlans = []
  const scoped = await ask('حضوري أنا')
  assert.equal((await scoped.json() as { answer: { intent: string } }).answer.intent, 'myAttendance')
  assert.equal(state.readPlans[0]?.period, 'lastMonth')
  state.permitLocalRead = false
  for (const role of ['employee', 'manager'] as const) {
    state.actor = actor(role)
    await ask('اعطيني سجل الحضور')
    state.calls = zero()
    const denied = await ask('كل الموظفين')
    assert.equal((await denied.json() as { answer: { refusal: string } }).answer.refusal, 'notPermitted')
    assert.deepEqual(state.calls, zero(), 'A clarified scope must still pass the current role gate')
  }
  for (const [role, question] of [
    ['employee', 'اعطيني سجل حضور الفريق'], ['employee', 'اعطيني سجل حضور الموظفين'],
    ['manager', 'اعطيني سجل حضور الشركة'],
  ] as const) {
    state.actor = actor(role); state.calls = zero()
    const response = await ask(question)
    assert.equal(response.status, 200)
    const answer = copilotAnswerSchema.parse((await response.json() as { answer: unknown }).answer)
    assert.equal(answer.refusal, 'notPermitted')
    assert.deepEqual(state.calls, zero())
  }
  // A wholly independent question cannot be an answer to a date slot. Stop
  // before continueTask, while leaving the pending action intact for later.
  state.actor = actor('employee'); state.calls = zero()
  remember(state.actor.id, { action: 'requestLeave', collected: { ...EMPTY_ACTION_PLAN, action: 'requestLeave' },
    asked: { en: 'Which date?', ar: 'أي تاريخ؟', fields: ['startDate'], optional: false }, declined: [] })
  const pending = pendingFor(state.actor.id)
  assert.equal((await ask('What is the weather on Venus?')).status, 200)
  assert.deepEqual(state.calls, zero())
  assert.equal(pendingFor(state.actor.id), pending)
  clear(state.actor.id)

  // Free-text content may itself be a complete question; preserve continuation.
  for (const [fields, input] of [
    [['text'], 'Can you explain quantum mechanics?'],
    [['text'], 'اعطيني سجل الحضور'],
    [['title'], 'What is the weather on Mars?'],
    [['startDate'], 'tomorrow'], [['leaveKind'], 'annual'],
  ] as const) {
    state.actor = actor('employee'); state.calls = zero(); state.permitContinuation = true
    remember(state.actor.id, { action: 'requestLeave', collected: { ...EMPTY_ACTION_PLAN, action: 'requestLeave' },
      asked: { en: 'Synthetic gap', ar: 'سؤال تجريبي', fields, optional: false }, declined: [] })
    const response = await ask(input)
    const answer = copilotAnswerSchema.parse((await response.json() as { answer: unknown }).answer)
    assert.equal(answer.result.kind, 'confirm')
    assert.equal(state.calls.continueTask, 1)
    assert.equal(state.calls.actionProposal, 1)
    assert.equal(state.calls.actionExecutor, 0)
    state.permitContinuation = false
  }
  // Context/quotations/compound/injection wording must reach the old pipeline.
  state.permitFallback = true
  for (const input of ABSTENTIONS) {
    state.actor = actor('hr'); state.calls = zero()
    await ask(input)
    // Existing deterministic reads/actions also remain available. An abstention
    // from the terminal boundary does not force every request into a model.
    assert.ok(state.calls.resolveQuestion + state.calls.resolveAction + state.calls.readExecutor > 0, input)
  }
  state.actor = actor('hr'); state.calls = zero()
  const previous = { ...EMPTY_PLAN, intent: 'myAttendance' as const }
  rememberQuestion(state.actor.id, previous)
  await ask('What is the weather on Mars?')
  assert.equal(state.calls.resolveQuestion, 1)
  assert.deepEqual(lastQuestion(state.actor.id), previous)
  for (const path of ['/hr/knowledge', '/hr/job-descriptions', '/hr/employees', '/hr/recruitment']) {
    state.actor = actor('hr'); state.calls = zero()
    await ask('Can you explain quantum mechanics?', { path })
    assert.equal(state.calls.resolveQuestion, 1)
  }
  state.actor = actor('employee'); state.calls = zero(); state.audits = []
  state.candidate = { ...EMPTY_PLAN, intent: 'myAttendance', terminal: true, kind: 'outOfScope', code: 'external_weather' }
  await ask('Could you review how my attendance is recorded?')
  assert.equal(state.calls.readExecutor, 1, 'Provider terminal flags are not trusted')
  assert.ok(!state.audits.some(event => event.reason === 'external_weather'))
  state.candidate = null
  state.permitFallback = false
  // Actual authentication, request validation and limiter still precede routing.
  state.actor = null; state.calls = zero()
  assert.equal((await ask('What is the weather on Mars?')).status, 401)
  state.actor = actor('employee')
  assert.equal((await ask('x')).status, 422)
  assert.deepEqual(state.calls, zero())
  resetRateLimits()
  for (let i = 0; i < 20; i++) assert.equal((await ask('What is the weather on Mars?')).status, 200)
  assert.equal((await ask('What is the weather on Mars?')).status, 429)
  assert.deepEqual(state.calls, zero())
  writeFileSync('hybrid-phase3d-http.json', JSON.stringify({ mode: 'offline', terminalCases: rows,
    terminalSideEffects: zero(), realProviderCalls: 0, auth: 'PASS', validation: 'PASS', rateLimit: 'PASS',
    pendingSafety: 'PASS', audit: 'PASS', contextSafety: 'PASS' }, null, 2))
  console.log('PASS Phase 3D HTTP: all 8 terminal fixtures have ZERO AI/embedding/executor calls; auth, body validation, rate limit, audit, pending/context safety and abstentions PASS')
  console.log('PASS attendance HTTP: immediate scope clarification, role-scoped reads, repeated requests, no model prose, and denied scopes without reads')
  console.log('PASS attendance conversation: exact user transcript, empty current month -> last month, scope/period slots, greetings, role gates and ZERO model calls')
} finally {
  globalThis.fetch = savedFetch; db.select = savedSelect; db.insert = savedInsert; console.info = savedLog
  resetRateLimits(); delete slots[key]
}
