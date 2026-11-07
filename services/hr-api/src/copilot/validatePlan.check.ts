import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import { Hono } from 'hono'
import { actionProposalSchema, type CopilotPlan, type CopilotRequest, type Role, type SessionUser } from '@hr/shared'
import { EMPTY_PLAN, EMPTY_ACTION_PLAN } from './phrasebook.js'
import { validateCopilotPlan, type RoutingSource } from './validatePlan.js'
import { mayAsk } from './intents.js'
import { db } from '../db/client.js'
import { buildEmployeeFile, buildEmployeePayrollReport } from '../reports/employeeFile.js'
import { proposeAction, runAction } from './perform.js'

// In-memory module overrides exercise real resolver/HTTP control flow without
// changing production files, contacting a model or reading/writing real records.
async function isolatedModule(file: URL, overrides: Record<string, string>) {
  let code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText
  code = code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote: string, specifier: string) => {
    const replacement = overrides[specifier]
    const url = replacement ? 'data:text/javascript;base64,' + Buffer.from(replacement).toString('base64')
      : specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier)
    return `from ${JSON.stringify(url)}`
  })
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

const key = Symbol.for('hr.check.plan-validation')
const slots = globalThis as unknown as Record<symbol, unknown>
const state = {
  source: 'model' as RoutingSource,
  candidate: { ...EMPTY_PLAN, intent: 'myAttendance' } as unknown,
  localOverride: false,
  failedResolution: false,
  booked: null as unknown,
  trained: null as unknown,
  actor: {} as SessionUser,
  executions: 0,
  actionRuns: 0,
  employeeCalls: 0,
  resolverCalls: 0,
  executedIntent: '',
  knowledgeCalls: 0,
}
const access = "globalThis[Symbol.for('hr.check.plan-validation')]"
const importUrl = (path: string) => JSON.stringify(new URL(path, import.meta.url).href)
const sources: RoutingSource[] = ['deterministic', 'phrasebook', 'training', 'model']
const plan = (changes: Partial<CopilotPlan> = {}) => ({ ...EMPTY_PLAN, intent: 'myAttendance' as const, ...changes })
let checks = 0
function check(condition: unknown, label: string): asserts condition {
  assert.ok(condition, label)
  checks++
  console.log(`PASS: ${label}`)
}
function actor(role: Role): SessionUser {
  return { id: randomUUID(), role, fullName: { en: 'Synthetic User', ar: 'Synthetic' },
    email: 'synthetic@example.invalid', employeeNumber: 'SYN-TEST', jobTitle: { en: 'Test', ar: 'Test' },
    department: { en: 'Test', ar: 'Test' }, managerId: null, managerName: null, photoUrl: null }
}

const savedFetch = globalThis.fetch
const savedSelect = db.select
const savedInsert = db.insert
assert.equal(slots[key], undefined)
slots[key] = state
globalThis.fetch = async () => { throw new Error('Network forbidden in plan validation regression') }
// Any unexpected DB access fails the check; targeted scope fixtures below are in-memory.
db.select = (() => { throw new Error('Real DB access forbidden') }) as typeof db.select
db.insert = (() => { throw new Error('Real DB write forbidden') }) as typeof db.insert
try {
  for (const source of sources) {
    const input = plan({ period: 'calendarMonth', month: 8, year: 2026 })
    const before = JSON.stringify(input)
    const valid = validateCopilotPlan(input, source)
    check(valid.ok && valid.routingSource === source, `${source}: valid plan passes`)
    assert.equal(JSON.stringify(input), before)
    check(!validateCopilotPlan({ ...input, month: 99 }, source).ok, `${source}: malformed plan fails Zod`)
    check(!validateCopilotPlan({ ...input, period: 'lastMonth' }, source).ok, `${source}: incompatible calendar fields fail`)
  }
  const incompatible: Partial<CopilotPlan>[] = [
    { period: 'calendarMonth', month: null },
    { period: null, year: 2026 },
    { payrollTopic: 'overtime' },
    { rankBy: 'absent' },
    { reportType: 'attendance' },
    { refusalReason: 'notPermitted' },
    { intent: 'payrollInsights', personName: 'Synthetic Person' },
    { intent: 'payrollInsights', employeeNumber: 'SYN-001' },
    { intent: 'generateReport', reportType: 'payroll' },
  ]
  for (const fields of incompatible) check(!validateCopilotPlan(plan(fields), 'model').ok, `semantic rule: ${Object.keys(fields).join('/')}`)
  check(validateCopilotPlan(plan({ intent: 'attendanceRanking' }), 'model').ok, 'null rank preserves existing executor default')
  check(validateCopilotPlan(plan({ intent: 'payrollInsights' }), 'model').ok, 'null payroll topic preserves existing summary default')
  check(validateCopilotPlan(plan({ intent: 'employeeFile' }), 'training').ok, 'missing employee identifier preserves existing missing-data flow')
  check(validateCopilotPlan(plan({ intent: 'outOfScope', refusalReason: 'notPermitted', personName: 'Synthetic', period: 'lastMonth' }), 'deterministic').ok,
    'local refusal can retain its original parameters')
  const safe = validateCopilotPlan(plan({ rankBy: 'absent', personName: 'Sensitive synthetic marker' }), 'model')
  check(!safe.ok && !JSON.stringify(safe).includes('Sensitive synthetic marker'), 'validation failure metadata contains no employee values')

  const resolver = await isolatedModule(new URL('./resolve.ts', import.meta.url), {
    '../ai/structuredProvider.js': `export const questionGenerationProvider=()=>({generateStructured:async()=>({data:{plan:${access}.candidate}})})`,
    './training.js': `import * as actual from ${importUrl('./training.ts')}; export * from ${importUrl('./training.ts')};
      export const deterministicReadPlan=(...args)=>${access}.localOverride?${access}.candidate:actual.deterministicReadPlan(...args)`,
  })
  state.localOverride = true
  state.candidate = plan({ intent: 'myLeaveBalance' })
  check((await resolver.resolveQuestion('synthetic direct rule', 'hr')).ok, 'real resolver validates local candidate')
  state.candidate = { ...plan(), intent: 'unknown' }
  check(!(await resolver.resolveQuestion('synthetic direct rule', 'hr')).ok, 'real resolver rejects malformed local candidate')
  state.localOverride = false
  for (const provider of ['OpenAI', 'Ollama']) {
    state.candidate = plan()
    const result = await resolver.resolveQuestion('Could you review the way my attendance is recorded?', 'employee')
    check(result.ok && result.routingSource === 'model', `${provider} contract: real resolver validates model candidate`)
    state.candidate = { ...plan(), period: 'not-a-period' }
    check(!(await resolver.resolveQuestion('Could you review the way my attendance is recorded?', 'employee')).ok, `${provider} contract: malformed model candidate rejected`)
    state.candidate = plan({ period: 'lastMonth', month: 8 })
    check(!(await resolver.resolveQuestion('Could you review the way my attendance is recorded?', 'employee')).ok, `${provider} contract: semantic model failure rejected`)
  }

  const route = await isolatedModule(new URL('../routes/copilot.ts', import.meta.url), {
    '../middleware.js': `export const requireAuth=async(c,next)=>{c.set('user',${access}.actor);await next()};
      export const validateBody=schema=>async(c,next)=>{c.set('body',schema.parse(await c.req.json()));await next()}`,
    '../copilot/resolve.js': `export const resolveQuestion=async()=>{${access}.resolverCalls++;return ${access}.failedResolution
      ?({ok:false,reason:'aiInvalidOutput',routingSource:'model',validation:'semantic',issues:['invalid_plan']})
      :({ok:true,plan:${access}.candidate,routingSource:${access}.source})};
      export const phraseAnswer=async()=>null; export const continueTask=async()=>{throw Error('Unexpected continuation')};
      export const resolveAction=async()=>({ok:true,plan:{...${JSON.stringify(EMPTY_ACTION_PLAN)},action:'checkIn'}})`,
    '../copilot/phrasebook.js': `export * from ${importUrl('./phrasebook.ts')};export const lookUp=()=>${access}.booked`,
    '../copilot/training.js': `export * from ${importUrl('./training.ts')};export const exactTrainingMatch=()=>${access}.trained;
      export const exactTrainingAction=()=>null;export const isLikelyInstruction=()=>false`,
    '../guide/answer.js': 'export const isGuideQuestion=()=>false;export const answerGuide=async()=>null;export const suggestionsFor=()=>[]',
    '../copilot/memory.js': 'export const recall=async()=>null;export const remember=async()=>{}',
    '../copilot/audit.js': 'export const auditCopilot=async()=>{}',
    '../copilot/unanswered.js': 'export const saveUnansweredQuestion=async()=>{}',
    '../knowledge/service.js': `export const answerFromKnowledge=async()=>{${access}.knowledgeCalls++;return null}`,
    '../copilot/execute.js': `export const executeIntent=async(plan)=>{${access}.executions++;${access}.executedIntent=plan.intent;return {result:{kind:'stats',stats:[]},periodLabel:null,empty:false}}`,
    '../reports/employeeFile.js': `export const buildEmployeeFile=async()=>{${access}.employeeCalls++;return null};export const buildEmployeePayrollReport=buildEmployeeFile`,
    '../copilot/perform.js': `export {proposeAction} from ${importUrl('./perform.ts')};export const runAction=async()=>{${access}.actionRuns++;throw Error('Action executed before confirmation')}`,
  })
  const app = new Hono().route('/copilot', route.copilotRoutes)
  async function ask(candidate: unknown, source: RoutingSource, role: Role = 'hr', context?: CopilotRequest['context'], question = 'synthetic control') {
    state.actor = actor(role)
    state.source = source
    state.candidate = candidate
    const action = (candidate as CopilotPlan).intent === 'doAction'
    state.booked = source === 'phrasebook' ? action ? { kind: 'action', action: 'checkIn' }
      : { kind: 'question', intent: (candidate as CopilotPlan).intent } : null
    state.trained = source === 'training' ? action ? { kind: 'action', action: 'checkIn' }
      : { kind: 'intent', intent: (candidate as CopilotPlan).intent,
      reportType: (candidate as CopilotPlan).reportType, refusal: (candidate as CopilotPlan).refusalReason } : null
    const response = await app.request('/copilot/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, ...(context ? { context } : {}) }) })
    assert.equal(response.status, 200)
    return response.json() as Promise<{ error?: string; answer: { refusal: string | null; result: { kind: string } } }>
  }
  for (const source of sources) {
    const before = state.executions
    check(!(await ask(plan(), source)).error && state.executions === before + 1, `HTTP ${source}: valid candidate reaches existing executor`)
    const bad = source === 'training' ? { ...plan(), reportType: 99 } : { ...plan(), intent: 'unknown' }
    check((await ask(bad, source)).error === 'aiInvalidOutput', `HTTP ${source}: malformed candidate refused`)
    assert.equal(state.executions, before + 1)
  }
  const before = state.executions
  check((await ask(plan({ month: 8 }), 'model')).error === 'aiInvalidOutput', 'HTTP semantic failure stops before execution')
  check(state.executions === before, 'invalid candidate cannot reach data executor')
  check((await ask(plan({ intent: 'payrollInsights' }), 'model', 'hr', { selectedPayrollPeriod: '2101-08' })).error === 'aiInvalidOutput',
    'HTTP invalid context-derived plan is revalidated before execution')
  assert.equal(state.executions, before)
  state.failedResolution = true
  check((await ask(plan(), 'model')).error === 'aiInvalidOutput', 'resolver validation failure cannot bypass the boundary through another service')
  assert.equal(state.executions, before)
  state.failedResolution = false
  check(!(await ask(plan({ intent: 'payrollInsights' }), 'model', 'hr', { selectedPayrollPeriod: '2026-08' })).error,
    'HTTP valid contextual payroll period preserves existing execution')
  assert.equal(state.knowledgeCalls, 0, 'Invalid plans must not reach a fallback service')
  for (const source of sources) {
    for (const intent of ['employeeFile', 'payrollInsights'] as const) {
      const denied = await ask(plan({ intent }), source, 'employee')
      check(denied.answer.refusal === 'notPermitted', `HTTP ${source}: employee cannot bypass ${intent} RBAC`)
    }
  }
  check((await ask(plan({ intent: 'payrollInsights' }), 'model', 'manager')).answer.refusal === 'notPermitted', 'HTTP manager cannot access company payroll')
  for (const source of sources) {
    for (const role of ['manager', 'hr', 'admin'] as const) {
      const before = state.employeeCalls
      const allowed = await ask(plan({ intent: 'employeeFile', personName: 'Synthetic Person' }), source, role)
      check(!allowed.error && allowed.answer.refusal === 'noData' && state.employeeCalls === before + 1,
        `HTTP ${source}: authorised ${role} employee-file plan reaches scoped service`)
    }
  }
  for (const role of ['hr', 'admin'] as const) {
    check(mayAsk(role, 'employeeFile') && mayAsk(role, 'payrollInsights'), `${role}: permission registry unchanged`)
    check(!(await ask(plan({ intent: 'payrollInsights' }), 'model', role)).error, `HTTP ${role}: authorised payroll still executes`)
  }

  state.actor = actor('manager')
  let lookups = 0
  db.select = (() => ({ from: () => ({ where: () => ({ limit: async () => {
    lookups++
    return [{ id: randomUUID(), managerId: 'another-manager', employeeNumber: 'SYN-001' }]
  } }) }) })) as unknown as typeof db.select
  check(await buildEmployeeFile({ personName: 'Synthetic Outside Team', employeeNumber: null }, state.actor) === null,
    'real employee-file service rejects a manager outside-team target before reading records/pay')
  assert.equal(lookups, 1)
  check(await buildEmployeePayrollReport({ personName: 'Synthetic', employeeNumber: null }, state.actor,
    { period: null, month: null, year: null }) === null, 'real employee payroll service denies manager pay access')
  assert.equal(lookups, 1)
  db.select = (() => { throw new Error('Unexpected DB access') }) as typeof db.select
  const proposed = await proposeAction({ ...EMPTY_ACTION_PLAN, action: 'checkIn' }, actor('employee'))
  check(proposed.ok && 'proposal' in proposed, 'real action service still creates a proposal')
  for (const source of sources) {
    check((await ask(plan({ intent: 'doAction' }), source, 'employee')).answer.result.kind === 'confirm',
      `HTTP ${source} action still requires confirmation`)
  }
  check((await ask(plan({ intent: 'outOfScope', refusalReason: 'unclear' }), 'model', 'employee')).answer.result.kind === 'confirm',
    'existing unclear-instruction retry clears obsolete refusal and still requires confirmation')
  assert.equal(state.actionRuns, 0)
  check(!(await runAction(actionProposalSchema.shape.params.parse({ ...EMPTY_ACTION_PLAN, targetId: null, action: 'runPayroll' }), actor('employee'), '')).ok,
    'real action executor independently denies unauthorised payroll')
  for (const source of ['phrasebook', 'training'] as const) {
    const before = state.resolverCalls
    await ask(plan({ intent: 'headcount' }), source, 'hr', undefined, 'Fetch my attendance records today')
    check(state.resolverCalls === before && state.executedIntent === 'myAttendance', `HTTP strict read outranks stale ${source} mapping`)
    for (const input of ['Display payroll for someone', 'Show my attendance last week', 'Display my attendance and my payslips']) {
      const before = state.resolverCalls
      await ask(plan(), source, 'hr', undefined, input)
      check(state.resolverCalls === before + 1, `HTTP abstention bypasses ${source} shortcuts and reaches model resolver`)
    }
  }
  check((await ask(plan({ intent: 'doAction' }), 'phrasebook', 'employee', undefined,
    'Display overtime pay for Rania Al-Khatib')).answer.refusal === 'notPermitted', 'HTTP new named-payroll rule cannot bypass employee RBAC')
  const beforePresence = state.resolverCalls
  await ask(plan({ intent: 'headcount' }), 'training', 'manager', undefined, 'Who on my team is connected?')
  check(state.resolverCalls === beforePresence && state.executedIntent === 'teamPresentNow',
    'HTTP own-team application presence outranks stale training without model execution')
  check((await ask(plan({ intent: 'headcount' }), 'training', 'employee', undefined,
    'Who on my team is connected?')).answer.refusal === 'notPermitted', 'HTTP team presence retains RBAC')
  const beforeHelp = state.resolverCalls
  const beforeActions = state.actionRuns
  await ask(plan({ intent: 'doAction' }), 'training', 'employee', undefined, 'How can I submit a sick leave request?')
  check(state.resolverCalls === beforeHelp && state.actionRuns === beforeActions,
    'HTTP maintained instructional help outranks action training without executing actions')
  for (const input of ['Who on my team is online in the office?', 'How do I repair the database?']) {
    const before = state.resolverCalls
    await ask(plan(), 'training', 'hr', undefined, input)
    check(state.resolverCalls === before + 1, 'HTTP uncertain presence/help bypasses stale training')
  }
  console.log(`PASS: ${checks} shared-plan, resolver, HTTP, RBAC, scope and confirmation checks; zero real model/DB calls`)
} finally {
  globalThis.fetch = savedFetch
  db.select = savedSelect
  db.insert = savedInsert
  delete slots[key]
}

