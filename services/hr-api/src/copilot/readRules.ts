import type { CopilotPlan } from '@hr/shared'
import { validateCopilotPlan } from './validatePlan.js'
import { extractReadPersonName } from './personName.js'
import { foldRead, readPeriodSuffix, type ReadPeriod } from './readPeriods.js'
import { teamPresenceDecision } from './teamPresence.js'

export type ReadRule = 'self_attendance' | 'team_attendance' | 'company_attendance' | 'attendance_follow_up' | 'self_leave_balance' | 'self_requests' | 'self_payslips'
  | 'employee_payroll' | 'company_headcount' | 'department_breakdown' | 'employee_details' | 'team_present_now' | 'maintained_help'
export type ReadDecision = { kind: 'resolved'; plan: CopilotPlan; routingRule: ReadRule }
  | { kind: 'abstain' } | { kind: 'unmatched' }
const abstain: ReadDecision = { kind: 'abstain' }
const unmatched: ReadDecision = { kind: 'unmatched' }
const readPrefix = '(?:(?:show|display|list|fetch|view|check|summari[sz]e)(?: me)?|tell me|give me|what (?:is|are|was|were)|ورجيني|وريني|اعرض(?:لي)?|ارني|اعطيني|اعطني|جيب(?:لي)?|هات(?:لي)?|بدي اشوف|شو|ما|كم|قديش|كيف كان)'

function readText(question: string): string {
  return question.normalize('NFC').trim().replace(/[?؟!.]+$/u, '').trim()
    .replace(/^(?:please\s+|could you\s+|can you\s+|would you\s+|من فضلك\s+)/iu, '')
    .replace(/\s+(?:please|لو سمحت)$/iu, '').trim()
}

/** A complete read request with no owner. Never guess company access from a role. */
export function unscopedAttendanceTiming(question: string): ReadPeriod | null {
  const parsed = readPeriodSuffix(readText(question))
  return !parsed.unsupported && new RegExp(`^(?:${readPrefix} )?(?:سجل (?:الحضور|الدوام)|(?:the )?attendance (?:records?|log|history))$`, 'u')
    .test(foldRead(parsed.body)) ? parsed.timing : null
}

export function isUnscopedAttendanceRead(question: string): boolean {
  return unscopedAttendanceTiming(question) !== null
}
const topic = '(?:overtime(?: hours| pay| earnings)?|payroll|salary|payslips|pay slips|pay|ساعات العمل [إا]ل[إا]ضافي|ساعات العمل [إا]ضافي|ساعات [إا]ضافية|العمل [إا]ل[إا]ضافي|[أا]وفرتايم|راتب|رواتب|كشوف الرواتب|overtime)'
function candidate(intent: CopilotPlan['intent'], fields: Partial<CopilotPlan>, rule: ReadRule): ReadDecision {
  const result = validateCopilotPlan({ intent, period: null, month: null, year: null, department: null, personName: null,
    employeeNumber: null, rankBy: null, payrollTopic: null, reportType: null, refusalReason: null, ...fields }, 'deterministic')
  return result.ok ? { kind: 'resolved', plan: result.plan, routingRule: rule } : abstain
}

/** Full anchored grammars, not bag-of-word scoring. Abstention is sticky: the
 * caller must not pass these requests to the old fuzzy/local classifier.
 */
export function deterministicReadDecision(question: string): ReadDecision {
  const presence = teamPresenceDecision(question)
  if (presence === 'resolved') return candidate('teamPresentNow', {}, 'team_present_now')
  if (presence === 'abstain') return abstain
  const text = readText(question)
  const normalized = foldRead(text)
  // Existing action routing and guide handling retain their own boundaries.
  if (/^(?:create|add|update|delete|approve|reject|request|submit|open|find|search|how do i|where (?:do|can) i|كيف (?:اقدم|اطلب)|افتح|اضف|عدل|احذف|اعتمد|سجل|دور(?:لي)?|ابحث|دقق|احسب|شغل|وافق|ضيف|جهز(?:لي)?|اعمل(?:لي|ي)?)(?:\s|$)/u.test(normalized)) return unmatched
  const parsed = readPeriodSuffix(text)
  const body = foldRead(parsed.body)
  const relevant = /\b(?:attendance|absent|absences?|leave|vacation|requests?|payslips?|pay|salary|payroll|overtime|earn|paid|headcount|staff|employees|people|department)\b|حضور|دوام|غياب|غبت|اجاز|طلباتي|راتب|رواتب|اوفرتايم|اضافي|الموظفين|العاملين|عدد الموظف/u.test(normalized)
  if (parsed.unsupported && (relevant || /^(?:and |و)?(?:last week|previous week|yesterday|tomorrow|next week|next month|last year|الاسبوع الماضي|الاسبوع السابق|امس|بكرا|غدا)$/u.test(normalized))) return abstain
  if (!relevant) return unmatched
  if (/\b(?:quarter|quarters|fortnight|recently|summer|winter)\b|الربع|البارحه|الشتاء|الصيف/u.test(body)
    || /\d{4}[-/]\d{1,2}[-/]\d{1,2}/u.test(body)) return abstain
  // Connectors introduce multiple subjects, conditions or ranges. Never drop them.
  if (/\b(?:and|or|but|except|unless|then|versus|before|after)\b|(?:^|\s)(?:و|او|لكن|باستثناء|وبعدها)(?:\s|$)|[;؛&]/u.test(body)) return abstain

  // Preserve dedicated report/Payroll Agent/action paths outside this expansion.
  // These are delegations, not new plans; uncertain person scopes still abstain.
  const report = /\breport\b|تقرير|تقارير/u.test(body)
  const payroll = /\b(?:payroll|salary|payslip)\b|راتب|رواتب/u.test(body)
  if (report && !payroll) return unmatched
  if (report && payroll) {
    const owner = /(?:\bemployee\b|المو[ظض]ف)\s+(.+)$/iu.exec(parsed.body)?.[1]
    if (owner && extractReadPersonName(owner)) return unmatched
    return abstain
  }
  if (/^(?:هل )?الرواتب جاهزه(?: للمراجعه)?$/u.test(body)
    || /^(?:(?:show|display|اعرض) )?(?:(?:highest|lowest|اعلي|اقل) )?(?:payroll summary|ملخص الرواتب|خصومات الرواتب|مكافات الرواتب)$/u.test(body)
    || /^(?:compare payroll (?:with|to)|قارن الرواتب مع)$/u.test(body)
    || /^من (?:هو )?(?:المو[ظض]ف|الشخص) صاحب (?:اعلي|اقل|اكبر|ادني) راتب$/u.test(body)) return unmatched
  if (/^(?:compare|قارن)\s/u.test(body) && /absence|غياب/u.test(body) && /department|اقسام/u.test(body)) return unmatched
  const attendanceOwner = /^(?:show|display|جيب|اعرض|ورجيني)\s+(?:attendance|حضور)\s+(?:for|of|تبع|تبعت|ل)\s+(.+)$/iu.exec(parsed.body)?.[1]
  if (attendanceOwner && parsed.timing.period === null && extractReadPersonName(attendanceOwner)) return unmatched

  const own = new RegExp(`^(?:${readPrefix} )?(.+)$`, 'u').exec(body)?.[1]
  const selfSubjects: readonly [RegExp, CopilotPlan['intent'], ReadRule][] = [
    [/^(?:my (?:attendance|absence|absences)(?: records?| summary| log| history)?|(?:(?:سجل|ملخص) )?(?:حضوري|غيابي|دوامي)(?: انا)?|(?:(?:سجل )?(?:الحضور|الدوام)|attendance(?: records?| log| history)?) (?:تبعي|الخاص بي))$/u, 'myAttendance', 'self_attendance'],
    [/^(?:my (?:(?:remaining|annual|sick) )*(?:leave|vacation) balance|رصيد اجازاتي|رصيد اجازتي|رصيدي من الاجازات|(?:leave balance|رصيد الاجازات) تبعي)$/u, 'myLeaveBalance', 'self_leave_balance'],
    [/^(?:my requests(?: status)?|my request status|حاله طلباتي|طلباتي|(?:requests|request status) تبعي)$/u, 'myRequests', 'self_requests'],
    [/^(?:my (?:payslips|pay slips|salary|payroll|pay)|راتبي|رواتبي|كشوف رواتبي|قسائم راتبي|(?:salary|payslips|payroll) تبعي)$/u, 'myPayslips', 'self_payslips'],
  ]
  if (own) for (const [pattern, intent, rule] of selfSubjects) {
    if (pattern.test(own)) {
      // These executors expose current/recent data, not period-filtered views.
      if (intent !== 'myAttendance' && parsed.timing.period !== null) return abstain
      return candidate(intent, parsed.timing, rule)
    }
  }
  if (own && /^(?:(?:my team|my direct reports)(?:'s)? attendance(?: records?| summary| log| history)?|attendance(?: records?| summary| log| history)? (?:for|of) (?:my team|my direct reports)|(?:سجل )?حضور (?:فريقي|فريق عملي|الفريق|القسم تبعي))$/u.test(own)) {
    return candidate('teamAttendance', parsed.timing, 'team_attendance')
  }
  if (own && /^(?:(?:the |our )?company attendance(?: records?| summary| log| history)?|(?:سجل )?حضور (?:الشركه|الموظفين|كل الموظفين)|(?:سجل )?الحضور (?:في الشركه|علي مستوي الشركه))$/u.test(own)) {
    return candidate('orgAttendance', parsed.timing, 'company_attendance')
  }
  if (/^(?:how many days (?:was i|have i been) absent|كم يوم غبت)$/u.test(body)) {
    return candidate('myAttendance', parsed.timing, 'self_attendance')
  }
  if (/^(?:how many (?:annual |sick )?(?:leave|vacation) days (?:do i have left|remain for me)|(?:قديش|كم) (?:باقيلي|باقي لي|متبقي لي) (?:ايام اجازه|ايام اجازات|من الاجازات))$/u.test(body)) {
    return parsed.timing.period === null ? candidate('myLeaveBalance', {}, 'self_leave_balance') : abstain
  }
  if (/^(?:how much (?:did|do) i earn|what (?:was|am) i paid|how much (?:was|am) i paid)$/u.test(body)) {
    return parsed.timing.period === null ? candidate('myPayslips', {}, 'self_payslips') : abstain
  }
  // Full explicit grouping/company scope is mandatory. "Here" alone is not company scope.
  if (/^(?:how many (?:people|staff|employees) (?:work|are) (?:in|at) (?:our|the) company|(?:show|display|give me|اعرض|ورجيني|وريني) (?:the |our )?(?:company|organisation|organization) (?:headcount|employee count|staff count)|كم (?:عدد )?(?:الموظفين|العاملين|موظف) في الشركه)$/u.test(body)) {
    return parsed.timing.period === null ? candidate('headcount', {}, 'company_headcount') : abstain
  }
  if (/^(?:(?:show|display|list|اعرض|ورجيني|وريني) (?:the )?(?:staff|employees|employee count|headcount) (?:by|per|in each) department|how many (?:staff|employees|people) (?:are|work) in each department|(?:اعرض|ورجيني|وريني|show|display) (?:عدد الموظفين|الموظفين) (?:حسب الاقسام|حسب القسم|في كل قسم)|كم (?:عدد )?الموظفين في كل قسم)$/u.test(body)) {
    return parsed.timing.period === null ? candidate('departmentBreakdown', {}, 'department_breakdown') : abstain
  }

  // Extract a person from possessive/for/of or Arabic subject+owner grammar.
  const rawBody = parsed.body
  const matches = [
    new RegExp(`^(?:${readPrefix}|how much (?:is|was|were)) (.+?)[’']s ${topic}$`, 'iu').exec(rawBody)?.[1],
    new RegExp(`^${readPrefix} ${topic} (?:for|of|تبع|للموظف|للموظفة) (.+)$`, 'iu').exec(rawBody)?.[1],
    new RegExp(`^how many overtime hours (?:did|does) (.+?) (?:work|have)$`, 'iu').exec(rawBody)?.[1],
    new RegExp(`^(?:ورجيني|وريني|اعرض(?:لي)?|أعرض(?:لي)?|كم|شو) ${topic} (?:تبع )?(.+)$`, 'iu').exec(rawBody)?.[1],
  ].filter((name): name is string => name !== undefined)
  if (matches.length) {
    const values = [...new Set(matches.map(name => name.trim()))]
    if (values.length !== 1) return abstain
    const name = values[0]!
    const employeeNumber = /^(?:emp[-_ ]?\d+)$/iu.test(name) ? name.toUpperCase().replace(/[ _]/gu, '-') : null
    const personName = employeeNumber ? null : extractReadPersonName(name)
    if (!employeeNumber && !personName) return abstain
    return candidate('employeeFile', { ...parsed.timing, personName, employeeNumber, reportType: 'payroll' }, 'employee_payroll')
  }
  // Leave already-supported, explicitly company-scoped payroll views to their
  // existing local rule. Do not delegate unsupported dates or mixed ownership.
  if (/^(?:show|display|اعرض) (?:company|company-wide) payroll(?: summary| analytics| overtime)?$/u.test(body)
    && [null, 'thisMonth', 'lastMonth', 'thisYear', 'lastSixMonths'].includes(parsed.timing.period)) return unmatched
  // Employee details retain their existing generic grammar, separate from pay.
  if (/\b(?:details|information|profile|file)\b|معلومات|تفاصيل|ملف|بيانات/u.test(body)
    && !/\b(?:payroll|salary|overtime|attendance|leave)\b|راتب|اضافي|اوفرتايم/u.test(body)
    && parsed.timing.period === null) return unmatched
  return abstain
}
