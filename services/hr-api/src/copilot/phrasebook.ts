import type { CopilotAction, CopilotIntent, Role } from '@hr/shared'
import { mayAsk } from './intents.js'
import { mayDo } from './actions.js'
import type { CopilotActionPlan, CopilotPlan } from '@hr/shared'

/**
 * Sentences whose meaning is not in question.
 *
 * Classification is a model call, and a model call is not deterministic — the
 * same instruction has been measured resolving three different ways across
 * three runs of the same thirty-seven cases. Three attempts at fixing that by
 * rewording the prompt made it worse rather than better, which is the usual
 * result of arguing with weather.
 *
 * So the common sentences stop being classified. "كم رصيد اجازاتي" has one
 * meaning, it has had that meaning every time anybody has typed it, and there
 * is nothing for a model to weigh up. Matching it here is a lookup: same input,
 * same output, no call, no latency, no cost, no variance.
 *
 * The model still handles everything else, which is most of what people
 * actually type — this covers the paths that repeat, not the language. Its job
 * changes from "route every sentence" to "route the ones nobody has named",
 * and it is much better at the second.
 *
 * Two things this is NOT:
 *
 *  - **Not a permission bypass.** A match still goes through `mayAsk` or
 *    `mayDo`. An employee typing a manager's phrasing gets the manager's
 *    refusal, not the manager's answer.
 *  - **Not a parameter shortcut.** Only phrasings with no specifics in them
 *    are listed. "بدي اجازة من 5 لـ 6" carries dates that change every time it
 *    is said, so it is not here; "بدي اجازة" is, and the dates are still
 *    worked out by the model afterwards.
 */

/** The form a sentence is matched on — the same folding the titles use. */
export function fold(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة(\s|$)/g, 'ه$1')
    .replace(/[؟?!.,،]/g, '')
    .replace(/\s+/g, ' ')
}

type Known =
  | { kind: 'question'; intent: CopilotIntent }
  /** `screen` is set only by the navigation prefix, which carries its target. */
  | { kind: 'action'; action: CopilotAction; screen?: string; title?: string }

const question = (intent: CopilotIntent, ...phrases: string[]) =>
  phrases.map((p) => [fold(p), { kind: 'question' as const, intent }] as const)

const action = (act: CopilotAction, ...phrases: string[]) =>
  phrases.map((p) => [fold(p), { kind: 'action' as const, action: act }] as const)

/**
 * Written out rather than generated from the suggestion chips.
 *
 * The chips are one phrasing each, and one phrasing is not how people type —
 * the same question arrives as "كم رصيد اجازاتي", "كم باقي من إجازتي" and
 * "how much leave do I have". All three belong to the same answer and none of
 * them is worth a model call.
 */
const ENTRIES: (readonly [string, Known])[] = [
  // Match the whole message: a greeting followed by a question still needs routing.
  ...question(
    'greeting',
    'مرحبا',
    'مرحباً',
    'أهلا',
    'أهلاً وسهلاً',
    'هلا',
    'هاي',
    'السلام عليكم',
    'سلام عليكم',
    'السلام عليكم ورحمة الله',
    'السلام عليكم ورحمة الله وبركاته',
    'صباح الخير',
    'مساء الخير',
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'are you there',
  ),
  /* Core workspace tasks. These are deliberately generic: the safe form or
     follow-up collects the role, employee, dates and other changing details. */
  ...action(
    'generateJobDescription',
    '\u062c\u0647\u0632 \u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u062c\u0647\u0632\u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u062c\u0647\u0632 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0627\u0639\u0645\u0644 \u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0627\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0627\u0639\u0645\u0644\u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0639\u0645\u0644\u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0627\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0636\u064a\u0641\u064a',
    '\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0636\u064a\u0641\u064a',
    '\u0627\u0643\u062a\u0628 \u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0627\u0643\u062a\u0628 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0627\u0646\u0634\u0626 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a',
    '\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0627\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0627\u0639\u0645\u0644\u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0639\u0645\u0644\u0644\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0627\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0636\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0636\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0627\u0643\u062a\u0628 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0627\u0646\u0634\u0626 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0627\u0646\u0634\u0627\u0621 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0628\u062f\u064a \u0627\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u062c\u062f\u064a\u062f',
    '\u0628\u062f\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u0629 \u062c\u062f\u064a\u062f',
    '\u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u0629 \u062c\u062f\u064a\u062f',
    '\u0627\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u0629 \u062c\u062f\u064a\u062f',
    '\u0639\u0645\u0644 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u0629 \u062c\u062f\u064a\u062f',
    '\u062c\u0647\u0632 \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u0629 \u062c\u062f\u064a\u062f',
    'prepare a job description',
    'new job description',
    'create a job description',
    'write a job description',
  ),
  ...action(
    'requestLeave',
    '\u0628\u062f\u064a \u0627\u0642\u062f\u0645 \u0627\u062c\u0627\u0632\u0629',
    '\u0628\u062f\u064a \u0625\u062c\u0627\u0632\u0629',
    '\u0642\u062f\u0645 \u0644\u064a \u0627\u062c\u0627\u0632\u0629',
    '\u0627\u0637\u0644\u0628 \u0644\u064a \u0627\u062c\u0627\u0632\u0629',
    'request leave',
    'submit leave',
  ),
  ...action(
    'addEmployee',
    '\u0623\u0636\u0641 \u0645\u0648\u0638\u0641 \u062c\u062f\u064a\u062f',
    '\u0627\u0636\u0641 \u0645\u0648\u0638\u0641 \u062c\u062f\u064a\u062f',
    '\u0633\u062c\u0644 \u0645\u0648\u0638\u0641 \u062c\u062f\u064a\u062f',
    'add a new employee',
    'create an employee',
  ),
  ...action(
    'createJob',
    '\u0627\u0641\u062a\u062d \u0648\u0638\u064a\u0641\u0629 \u0634\u0627\u063a\u0631\u0629',
    '\u0627\u0646\u0634\u0626 \u0648\u0638\u064a\u0641\u0629 \u0634\u0627\u063a\u0631\u0629',
    '\u0623\u0636\u0641 \u0648\u0638\u064a\u0641\u0629 \u0634\u0627\u063a\u0631\u0629',
    'create a job opening',
    'open a vacancy',
  ),
  ...action(
    'createPayrollAdjustment',
    '\u0623\u0636\u0641 \u0645\u0643\u0627\u0641\u0623\u0629',
    '\u0627\u0636\u0641 \u0645\u0643\u0627\u0641\u0623\u0629',
    '\u0623\u0636\u0641 \u062e\u0635\u0645',
    '\u0627\u0636\u0641 \u062e\u0635\u0645',
    '\u0623\u0636\u0641 \u0628\u062f\u0644',
    '\u0627\u0636\u0641 \u0628\u062f\u0644',
    'add a bonus',
    'add a deduction',
    'add an allowance',
  ),
  ...action(
    'addCalendarEvent',
    '\u0623\u0636\u0641 \u062d\u062f\u062b \u0644\u0644\u062a\u0642\u0648\u064a\u0645',
    '\u0627\u0636\u0641 \u062d\u062f\u062b \u0644\u0644\u062a\u0642\u0648\u064a\u0645',
    '\u0623\u0636\u0641 \u0645\u0648\u0639\u062f',
    '\u0627\u0636\u0641 \u0645\u0648\u0639\u062f',
    'add a calendar event',
    'add an event',
  ),
  /* A company notice is not a vacancy or a job description. */
  ...action(
    'postAnnouncement',
    '\u062c\u0647\u0632\u0644\u064a \u0625\u0639\u0644\u0627\u0646',
    '\u062c\u0647\u0632 \u0625\u0639\u0644\u0627\u0646',
    '\u0627\u0639\u0645\u0644 \u0625\u0639\u0644\u0627\u0646',
    '\u0628\u062f\u064a \u0625\u0639\u0644\u0627\u0646',
    'prepare an announcement',
    'create an announcement',
  ),
  /* ---------- about yourself ---------- */
  ...question(
    'myLeaveBalance',
    'كم رصيد اجازاتي', 'كم باقي من اجازتي', 'كم اجازة باقي عندي', 'رصيد اجازاتي',
    'how much leave do i have', 'my leave balance', 'leave balance',
    'how many leave days do i have left', 'how many days off do i have', 'how much annual leave is left',
  ),
  ...question(
    'myPayslips',
    'كم راتبي', 'شو راتبي', 'اعرضلي كشوف رواتبي', 'كشف راتبي', 'رواتبي',
    'what do i earn', 'my salary', 'my payslips', 'how much do i earn',
    'i want to see my payslip', 'show me my payslip', 'where is my payslip',
  ),
  ...question(
    'payrollAuditSummary',
    'payroll audit summary', 'review payroll audit', 'ملخص تدقيق الرواتب', 'دققلي الرواتب',
  ),
  ...question(
    'payrollReadiness',
    'is payroll ready', 'payroll readiness', 'هل الرواتب جاهزة', 'جاهزية الرواتب',
  ),
  ...question(
    'payrollRunSummary',
    'payroll summary', 'payroll total', 'ملخص الرواتب', 'إجمالي الرواتب',
  ),
  ...question(
    'payrollFindings',
    'payroll findings', 'payroll anomalies', 'ملاحظات الرواتب', 'أخطاء الرواتب',
  ),
  ...question(
    'myAttendance',
    'كيف كان حضوري', 'كيف كان حضوري هالشهر', 'حضوري هالشهر', 'كم يوم حضرت',
    'my attendance', 'how was my attendance',
    'show my attendance for last month', 'how many days did i attend', 'my attendance this month',
  ),
  ...question(
    'myRequests',
    'شو وضع طلباتي', 'وين وصلت طلباتي', 'طلباتي',
    'my requests', 'status of my requests',
    'what happened to the request i sent', 'where is my request', 'did my request get approved',
  ),

  /* ---------- a manager's own people ---------- */
  ...question('teamPresentNow', 'مين من فريقي حاضر', 'مين من فريقي حاضر هلق', 'who on my team is in'),
  ...question('teamOnLeave', 'مين من فريقي باجازة', 'مين باجازة من فريقي', 'who on my team is on leave'),
  ...question('teamPendingApprovals', 'شو الطلبات المعلقه عندي', 'الطلبات المعلقه', 'pending approvals'),
  ...question('teamRoster', 'مين بيشتغل تحتي', 'مين بفريقي', 'my team', 'who reports to me'),

  /* ---------- the organisation ---------- */
  ...question('headcount', 'كم عدد الموظفين', 'كم موظف عنا', 'عدد الموظفين', 'headcount', 'how many employees'),
  ...question('departmentBreakdown', 'وزعهم حسب الاقسام', 'الموظفين حسب القسم', 'breakdown by department'),
  ...question('orgAttendance', 'كيف الحضور على مستوى الشركه', 'حضور الشركه', 'company attendance'),
  ...question('whoIsPresentNow', 'مين موجود بالنظام هلق', 'مين حاضر هلق', 'who is in right now'),
  ...question('attendanceRanking', 'مين الاكثر حضورا', 'مين الاكثر حضورا هالشهر', 'who attends most'),
  ...question('recruitmentSummary', 'كيف ماشي التوظيف', 'وضع التوظيف', 'how is recruitment going'),
  ...question(
    'openJobOpenings',
    '\u0645\u0627 \u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629 \u0644\u062f\u064a\u0646\u0627 \u0644\u0644\u062a\u0642\u062f\u064a\u0645 \u0639\u0644\u064a\u0647\u0627',
    '\u0645\u0627 \u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629',
    '\u0645\u0627 \u0647\u064a \u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629',
    '\u0634\u0648 \u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629',
    '\u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629',
    'what jobs are open',
    'open jobs',
    'open vacancies',
    'which roles are open',
  ),
  ...question('listApplications', 'مين قدم عالوظائف', 'مين قدم', 'who has applied'),

  /* ---------- instructions with nothing variable in them ---------- */
  ...action('checkIn', 'سجل حضوري', 'سجلي حضور', 'سجل لي حضور', 'check me in', 'check in'),
  ...action('checkOut', 'سجل مغادرتي', 'سجلي مغادره', 'سجل لي مغادره', 'خلصت دوامي', 'check me out', 'check out'),
  ...action('cancelRequest', 'الغي طلبي', 'اسحب طلبي', 'cancel my request'),
  ...action('remindCheckout', 'ذكر اللي ما سجلوا مغادره', 'remind everyone to check out'),
  ...action('runPayroll', 'شغل رواتب هالشهر', 'احسب الرواتب', 'run payroll'),
  ...action('signOut', 'سجل خروج من النظام', 'اطلعني من النظام', 'خروج', 'log me out', 'sign out'),
]

const BOOK = new Map<string, Known>(ENTRIES)

/**
 * What this sentence means, when it is one nobody needs to think about.
 *
 * Returns null for anything unlisted, which is the model's job. Returns null
 * too when the person may not ask or do it — so a match never widens what
 * somebody can reach, it only settles what their words meant.
 */
export function lookUp(text: string, role: Role): Known | null {
  const folded = fold(text)

  /**
   * A job-description request often includes its only required value right in
   * the first sentence. Keep that value when the phrasing is unambiguous, so
   * “prepare a job description for accountant” starts at the useful follow-up
   * instead of asking for the title once more.
   */
  const jobDescription = folded.match(
    /^(?:\u062c\u0647\u0632(?:\u0644\u064a)?|\u0627\u0639\u0645\u0644(?:\u0644\u064a)?|\u0639\u0645\u0644(?:\u0644\u064a)?|\u0627\u0643\u062a\u0628(?:\u0644\u064a)?|\u0627\u0646\u0634\u0626)\s+(?:\u0644\u064a\s+)?\u0648\u0635\u0641\s+(?:\u0648(?:\u0638|\u0636)\u064a\u0641\u064a|\u0648\u0638\u064a\u0641(?:\u0629|\u0647))\s+(.+)$/u,
  )
  if (jobDescription?.[1]) {
    const title = jobDescription[1].replace(/^\u0644(?:\u0640)?/, '').trim()
    // "new" describes the requested draft, not a job title. Let the exact
    // phrase below open the normal title prompt instead of writing for a role
    // literally named "new" / "جديد".
    const genericDraftWord = /^(?:new|\u062c\u062f\u064a\u062f(?:\u0647)?)$/u.test(title)
    if (title && !genericDraftWord && mayDo(role, 'generateJobDescription')) {
      return { kind: 'action', action: 'generateJobDescription', title }
    }
  }

  /**
   * "Take me to …" is navigation whatever follows it.
   *
   * The screen name varies, so the sentence cannot be listed — but the verb
   * does not, and the verb is the whole decision. Both measured navigation
   * failures were this phrasing losing to "how do I", which a prefix settles
   * without a model and without listing every screen.
   */
  const NAVIGATES = [
    'وديني علي ',
    'وديني على ',
    'وديني ع',
    'روح علي ',
    'روح على ',
    'روح عال',
    'روح ع ',
    'افتحلي علي ',
    'افتحلي على ',
    'افتحلي عال',
    'افتحلي ع ',
    'افتح علي ',
    'افتح على ',
    'افتح عال',
    'افتح ع ',
    'افتحلي ',
    'افتح ',
    'take me to ',
    'go to ',
    'open the ',
    'open ',
  ]
  const verb = NAVIGATES.find((v) => folded.startsWith(v))
  if (verb) {
    const screen = folded.slice(verb.length).trim()
    /* "ودّيني" with nothing after it names no screen; the model can have that one. */
    if (!screen) return null
    return mayDo(role, 'openScreen') ? { kind: 'action', action: 'openScreen', screen } : null
  }

  const known = BOOK.get(folded)
  if (!known) return null
  if (known.kind === 'question') return mayAsk(role, known.intent) ? known : null
  return mayDo(role, known.action) ? known : null
}

/** For the check that keeps this honest. */
export const PHRASEBOOK_ENTRIES = ENTRIES

/**
 * A plan with nothing filled in.
 *
 * A looked-up sentence has no parameters by construction — anything with a
 * date or a name in it is not in the book — so the plan it produces is the
 * intent and nothing else.
 */
export const EMPTY_PLAN: CopilotPlan = {
  intent: 'outOfScope',
  period: null,
  month: null,
  year: null,
  department: null,
  personName: null,
  employeeNumber: null,
  rankBy: null,
  payrollTopic: null,
  reportType: null,
  refusalReason: null,
}

/** The same, for an instruction. */
export const EMPTY_ACTION_PLAN: CopilotActionPlan = {
  action: 'checkIn',
  leaveKind: null,
  startDate: null,
  endDate: null,
  documentKind: null,
  text: null,
  title: null,
  personName: null,
  employeeNumber: null,
  decision: null,
  stage: null,
  role: null,
  email: null,
  location: null,
  language: null,
  screen: null,
  scrollTarget: null,
  employmentType: null,
  employeeNumberNew: null,
  jobTitle: null,
  department: null,
  amount: null,
  opensAt: null,
  durationMinutes: null,
  questionNumber: null,
  payrollAdjustmentKind: null,
  jobDescriptionSection: null,
  refusalReason: null,
}
