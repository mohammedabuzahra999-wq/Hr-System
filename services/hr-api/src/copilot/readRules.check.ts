import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import type { CopilotPlan, Role } from '@hr/shared'
import { deterministicReadDecision, type ReadRule } from './readRules.js'
import { validateCopilotPlan } from './validatePlan.js'
import { EMPTY_PLAN } from './phrasebook.js'
import { localTrainingPlan } from './training.js'

// Fresh synthetic wording. These fixtures do not import benchmark sentences or
// employee identities; production rules contain no names from either suite.
const positives: readonly [string, Partial<CopilotPlan>, ReadRule][] = [
  ['Please fetch my attendance records today.', { intent: 'myAttendance', period: 'today' }, 'self_attendance'],
  ['Display my absence summary this week', { intent: 'myAttendance', period: 'thisWeek' }, 'self_attendance'],
  ['Could you list my attendance in January 2027?', { intent: 'myAttendance', period: 'calendarMonth', month: 1, year: 2027 }, 'self_attendance'],
  ['View my attendance in month 11', { intent: 'myAttendance', period: 'calendarMonth', month: 11 }, 'self_attendance'],
  ['Tell me my attendance during the previous month', { intent: 'myAttendance', period: 'lastMonth' }, 'self_attendance'],
  ['Check my absences this year', { intent: 'myAttendance', period: 'thisYear' }, 'self_attendance'],
  ['List my attendance last six months', { intent: 'myAttendance', period: 'lastSixMonths' }, 'self_attendance'],
  ['اعرض غيابي هذا الأسبوع', { intent: 'myAttendance', period: 'thisWeek' }, 'self_attendance'],
  ['وريني حضوري اليوم', { intent: 'myAttendance', period: 'today' }, 'self_attendance'],
  ['اعرض حضوري خلال شهر ٤ من ٢٠٢٥', { intent: 'myAttendance', period: 'calendarMonth', month: 4, year: 2025 }, 'self_attendance'],
  ['اعرض حضوري في تشرين الثاني 2025', { intent: 'myAttendance', period: 'calendarMonth', month: 11, year: 2025 }, 'self_attendance'],
  ['Display حضوري this week', { intent: 'myAttendance', period: 'thisWeek' }, 'self_attendance'],
  ['اعرض my attendance في شهر 2 من 2024', { intent: 'myAttendance', period: 'calendarMonth', month: 2, year: 2024 }, 'self_attendance'],
  ['وريني attendance تبعي هذا الشهر', { intent: 'myAttendance', period: 'thisMonth' }, 'self_attendance'],
  ['اعطيني سجل حضوري', { intent: 'myAttendance' }, 'self_attendance'],
  ['أعطيني سجل الحضور تبعي الشهر الماضي', { intent: 'myAttendance', period: 'lastMonth' }, 'self_attendance'],
  ['جيبلي سجل الدوام الخاص بي خلال شهر ٩ من ٢٠٢٦', { intent: 'myAttendance', period: 'calendarMonth', month: 9, year: 2026 }, 'self_attendance'],
  ['هاتلي ملخص حضوري هالشهر', { intent: 'myAttendance', period: 'thisMonth' }, 'self_attendance'],
  ['بدي اشوف حضوري اليوم', { intent: 'myAttendance', period: 'today' }, 'self_attendance'],
  ['حضوري الشهر الماضي', { intent: 'myAttendance', period: 'lastMonth' }, 'self_attendance'],
  ['Give me my attendance history this month', { intent: 'myAttendance', period: 'thisMonth' }, 'self_attendance'],
  ['اعطيني سجل حضور فريقي اليوم', { intent: 'teamAttendance', period: 'today' }, 'team_attendance'],
  ["Show my team's attendance last month", { intent: 'teamAttendance', period: 'lastMonth' }, 'team_attendance'],
  ['List attendance records for my direct reports this week', { intent: 'teamAttendance', period: 'thisWeek' }, 'team_attendance'],
  ['اعطيني سجل حضور الموظفين اليوم', { intent: 'orgAttendance', period: 'today' }, 'company_attendance'],
  ['جيبلي حضور الشركة هذا الشهر', { intent: 'orgAttendance', period: 'thisMonth' }, 'company_attendance'],
  ['Give me company attendance records in month 9 of 2026', { intent: 'orgAttendance', period: 'calendarMonth', month: 9, year: 2026 }, 'company_attendance'],
  ['Give me my remaining annual vacation balance', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['Could you check my sick leave balance?', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['وريني رصيدي من الإجازات', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['كم متبقي لي من الإجازات', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['اعرض leave balance تبعي', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['Display رصيد إجازاتي', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['اعطيني رصيد إجازاتي', { intent: 'myLeaveBalance' }, 'self_leave_balance'],
  ['Please fetch my request status', { intent: 'myRequests' }, 'self_requests'],
  ['List my requests status', { intent: 'myRequests' }, 'self_requests'],
  ['وريني طلباتي', { intent: 'myRequests' }, 'self_requests'],
  ['اعرض request status تبعي', { intent: 'myRequests' }, 'self_requests'],
  ['Display حالة طلباتي', { intent: 'myRequests' }, 'self_requests'],
  ['جيبلي طلباتي', { intent: 'myRequests' }, 'self_requests'],
  ['Please list my pay slips', { intent: 'myPayslips' }, 'self_payslips'],
  ['Fetch my salary', { intent: 'myPayslips' }, 'self_payslips'],
  ['وريني كشوف رواتبي', { intent: 'myPayslips' }, 'self_payslips'],
  ['اعرض salary تبعي', { intent: 'myPayslips' }, 'self_payslips'],
  ['Display راتبي', { intent: 'myPayslips' }, 'self_payslips'],
  ['اعطيني راتبي', { intent: 'myPayslips' }, 'self_payslips'],
  ["Display Anne-Marie O'Connell's salary this week", { intent: 'employeeFile', personName: "Anne-Marie O'Connell", reportType: 'payroll', period: 'thisWeek' }, 'employee_payroll'],
  ['Fetch payroll for José García in December 2024', { intent: 'employeeFile', personName: 'José García', reportType: 'payroll', period: 'calendarMonth', month: 12, year: 2024 }, 'employee_payroll'],
  ['Display overtime pay of Rania Al-Khatib today', { intent: 'employeeFile', personName: 'Rania Al-Khatib', reportType: 'payroll', period: 'today' }, 'employee_payroll'],
  ['View payslips for EMP-037 in month 6 of 2025', { intent: 'employeeFile', employeeNumber: 'EMP-037', reportType: 'payroll', period: 'calendarMonth', month: 6, year: 2025 }, 'employee_payroll'],
  ['اعرض راتب عبد الرحمن الخطيب هذا الشهر', { intent: 'employeeFile', personName: 'عبد الرحمن الخطيب', reportType: 'payroll', period: 'thisMonth' }, 'employee_payroll'],
  ['وريني أوفرتايم تبع هبة نصار خلال شهر 7 من 2024', { intent: 'employeeFile', personName: 'هبة نصار', reportType: 'payroll', period: 'calendarMonth', month: 7, year: 2024 }, 'employee_payroll'],
  ['اعرض overtime pay تبع زين العابدين هذا الأسبوع', { intent: 'employeeFile', personName: 'زين العابدين', reportType: 'payroll', period: 'thisWeek' }, 'employee_payroll'],
  ['Display salary for نور الحسن in September 2025', { intent: 'employeeFile', personName: 'نور الحسن', reportType: 'payroll', period: 'calendarMonth', month: 9, year: 2025 }, 'employee_payroll'],
  ['Give me our company headcount', { intent: 'headcount' }, 'company_headcount'],
  ['How many employees are in our company?', { intent: 'headcount' }, 'company_headcount'],
  ['كم عدد العاملين في الشركة؟', { intent: 'headcount' }, 'company_headcount'],
  ['وريني company staff count', { intent: 'headcount' }, 'company_headcount'],
  ['Display employee count per department', { intent: 'departmentBreakdown' }, 'department_breakdown'],
  ['List employees by department', { intent: 'departmentBreakdown' }, 'department_breakdown'],
  ['اعرض عدد الموظفين حسب الأقسام', { intent: 'departmentBreakdown' }, 'department_breakdown'],
  ['وريني staff per department', { intent: 'departmentBreakdown' }, 'department_breakdown'],
  ['Display عدد الموظفين في كل قسم', { intent: 'departmentBreakdown' }, 'department_breakdown'],
]
const abstentions = [
  'Display my attendance and my salary', 'Show my leave balance but approve my request',
  'Display حضوري وراتبي', 'List attendance for him', 'Show her payslips',
  'Show my attendance last week', 'اعرض حضوري الأسبوع الماضي', 'Display overtime for Rania next month',
  'Display my attendance in month 14', 'Display my attendance in month 5 of 2200',
  'Display my attendance from March to April', 'List my attendance in January 2024 and February 2024',
  'Display my attendance in month 2 of 2025 today', 'Show overtime for someone',
  'Display payroll for my colleague', 'اعرض أوفرتايم عمر وسامر',
  'Show overtime for Rania and the company', 'Display salary for all employees',
  'Show overtime', 'overtime', 'salary', 'Show my overtime', 'Show payroll for employee',
  'Display overtime for Rania in Finance', 'Display overtime for employee 234',
  'Show my payslips this year', 'وريني طلباتي هذا الشهر', 'Show my pending requests',
  'Show my leave balance in March 2024', 'Show company headcount last month',
  'Show headcount', 'How many people work here?', 'Display employees per department except Sales',
  'Show attendance for myself and the company', 'Show my attendance if I was late',
  'Display salary for the employee with the most overtime', 'Show salary for EMP-037 and EMP-038',
  'Show my attendance yesterday', 'Show my attendance tomorrow', 'Show my attendance last year',
  'Display payroll for Rania maybe', 'اعرض راتب يمكن هبة',
  'Show my attendance report last quarter', 'Show payroll for Rania from 2024-01-01 to 2024-01-15',
  'اعطيني سجل حضوري وراتب أحمد', 'اعطيني سجل حضوري الأسبوع الماضي',
  'اعطيني سجل حضور أحمد', 'اعطيني سجل حضور كل الموظفين ما عدا سامر',
  'Give me company attendance if anyone was late',
]

const originalFetch = globalThis.fetch
const key = Symbol.for('hr.read-rules.check.provider')
const slots = globalThis as unknown as Record<symbol, unknown>
assert.equal(slots[key], undefined)
let providerCalls = 0
slots[key] = { generateStructured: async () => {
  providerCalls++
  return { data: { plan: { ...EMPTY_PLAN, intent: 'outOfScope', refusalReason: 'unclear' } },
    model: 'offline-stub', provider: 'openai', inputTokens: null, outputTokens: null }
} }
globalThis.fetch = async () => { throw new Error('Network forbidden in deterministic regressions') }
try {
  const file = new URL('./resolve.ts', import.meta.url)
  const source = readFileSync(file, 'utf8')
  let code = ts.transpileModule(source.replace('questionGenerationProvider(getClient)',
    "globalThis[Symbol.for('hr.read-rules.check.provider')]"), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText
  code = code.replace(/from (['"])([^'"]+)\1/g, (_m, _q, specifier: string) => `from ${JSON.stringify(specifier.startsWith('.')
    ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier))}`)
  const resolver = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')) as {
    resolveQuestion: (input: string, role: Role, previous?: CopilotPlan) => Promise<{ ok: boolean; plan: CopilotPlan; routingSource: string; routingRule?: string }>
  }
  for (const [input, fields, rule] of positives) {
    const expected = { ...EMPTY_PLAN, ...fields }
    const decision = deterministicReadDecision(input)
    assert.equal(decision.kind, 'resolved', input)
    if (decision.kind !== 'resolved') throw new Error('Unreachable')
    assert.deepEqual(decision.plan, expected, input)
    assert.equal(decision.routingRule, rule)
    assert.ok(validateCopilotPlan(decision.plan, 'deterministic').ok)
    const before = providerCalls
    const result = await resolver.resolveQuestion(input, 'hr')
    assert.ok(result.ok, input)
    assert.deepEqual(result.plan, expected, input)
    assert.equal(result.routingSource, 'deterministic')
    assert.equal(result.routingRule, rule)
    assert.equal(providerCalls, before, input)
    if (fields.intent === 'employeeFile' || fields.intent === 'headcount' || fields.intent === 'departmentBreakdown'
      || fields.intent === 'teamAttendance' || fields.intent === 'orgAttendance') {
      const denied = await resolver.resolveQuestion(input, 'employee')
      assert.equal(denied.plan.intent, 'outOfScope')
      assert.equal(denied.plan.refusalReason, 'notPermitted')
    }
    if (fields.intent === 'orgAttendance') {
      const denied = await resolver.resolveQuestion(input, 'manager')
      assert.equal(denied.plan.intent, 'outOfScope')
      assert.equal(denied.plan.refusalReason, 'notPermitted')
    }
  }
  const previous = { ...EMPTY_PLAN, intent: 'employeeFile' as const, personName: 'Synthetic Previous Person', period: 'thisMonth' as const }
  for (const input of [...abstentions, 'his overtime last week', 'and last week']) {
    assert.equal(deterministicReadDecision(input).kind, 'abstain', input)
    assert.equal(localTrainingPlan(input, 'hr'), null, input)
    const before = providerCalls
    const result = await resolver.resolveQuestion(input, 'hr', previous)
    assert.equal(providerCalls, before + 1, input)
    assert.equal(result.routingSource, 'model', input)
  }
  for (const input of ['Could you explain eclipses?', 'Write a story about a garden', 'ما عاصمة اليابان؟']) {
    assert.notEqual(deterministicReadDecision(input).kind, 'resolved', input)
  }
  // Previously supported explicit company payroll must not become a person report.
  const company = localTrainingPlan('Display company payroll summary', 'hr')
  assert.ok(company?.intent === 'payrollInsights' && company.personName === null)
  console.log(JSON.stringify({ pass: true, exactLocalPlans: positives.length, incorrectLocalPlans: 0,
    abstentions: abstentions.length + 2, forcedAmbiguities: 0, allLocalPlansValidated: true,
    providerCallsAreOfflineStubsOnly: true, realNetworkCalls: 0 }))
} finally { globalThis.fetch = originalFetch; delete slots[key] }
