import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CopilotAction, CopilotActionPlan, CopilotIntent, CopilotPlan, ReportType, Role } from '@hr/shared'
import { mayDo } from './actions.js'
import { mayAsk } from './intents.js'
import { deterministicReadDecision, type ReadRule } from './readRules.js'
import { maintainedHelpDecision } from '../guide/helpRouting.js'
import { extractReadPersonName } from './personName.js'

/**
 * A local, labelled language set used to make the assistant recognise more
 * ways people ask for a feature.  It is deliberately not a permission source:
 * the source file's `role`, `tool`, and `requires_confirmation` values are
 * never trusted for access or execution.  They only help us select natural
 * language examples for an already authorised role.
 */
type SourceRow = {
  id?: unknown
  text?: unknown
  intent?: unknown
  role?: unknown
}

type TrainingRoute =
  | { kind: 'intent'; intent: CopilotIntent; reportType?: ReportType; refusal?: 'notHrData' | 'unclear' }
  | { kind: 'action'; action: CopilotAction }

type TrainingExample = {
  id: string
  text: string
  sourceRole: string | null
  route: TrainingRoute
  normalized: string
  tokens: readonly string[]
}

export type QuestionTrainingExample = {
  text: string
  intent: CopilotIntent
  reportType: ReportType | null
  refusal: 'notHrData' | 'unclear' | null
}

export type ActionTrainingExample = {
  text: string
  action: CopilotAction
}

export type ExactTrainingMatch =
  | { kind: 'intent'; intent: CopilotIntent; reportType: ReportType | null; refusal: 'notHrData' | 'unclear' | null }
  | { kind: 'action'; action: CopilotAction }

export type TrainingStats = {
  totalRows: number
  usableRows: number
  skippedRows: number
}

const INTENT_MAP: Readonly<Record<string, Extract<TrainingRoute, { kind: 'intent' }>>> = {
  AMBIGUOUS_REQUEST: { kind: 'intent', intent: 'outOfScope', refusal: 'unclear' },
  OUT_OF_SCOPE: { kind: 'intent', intent: 'outOfScope', refusal: 'notHrData' },
  GET_LEAVE_STATUS: { kind: 'intent', intent: 'myRequests' },
  HELP_HR_SYSTEM: { kind: 'intent', intent: 'howDoI' },
  GET_PAYSLIP: { kind: 'intent', intent: 'myPayslips' },
  GENERATE_ATTENDANCE_REPORT: { kind: 'intent', intent: 'generateReport', reportType: 'attendance' },
  GENERATE_HR_REPORT: { kind: 'intent', intent: 'generateReport', reportType: 'employees' },
  GENERATE_LEAVE_REPORT: { kind: 'intent', intent: 'generateReport', reportType: 'leave' },
  GET_ATTENDANCE: { kind: 'intent', intent: 'myAttendance' },
  GET_EMPLOYEE_PROFILE: { kind: 'intent', intent: 'employeeFile' },
  GET_LEAVE_BALANCE: { kind: 'intent', intent: 'myLeaveBalance' },
  GET_OPEN_JOBS: { kind: 'intent', intent: 'recruitmentSummary' },
  GET_POLICY_INFO: { kind: 'intent', intent: 'knowledge' },
  GET_SALARY_INFO: { kind: 'intent', intent: 'myPayslips' },
  RANK_CANDIDATES: { kind: 'intent', intent: 'listApplications' },
  SEARCH_EMPLOYEE: { kind: 'intent', intent: 'employeeFile' },
}

const ACTION_MAP: Readonly<Record<string, CopilotAction>> = {
  ANALYZE_CV: 'analyseApplication',
  APPROVE_LEAVE_REQUEST: 'decideRequest',
  CANCEL_LEAVE_REQUEST: 'cancelRequest',
  CHECK_IN: 'checkIn',
  CHECK_OUT: 'checkOut',
  CREATE_EMPLOYEE: 'addEmployee',
  CREATE_JOB_POSTING: 'createJob',
  CREATE_LEAVE_REQUEST: 'requestLeave',
  GENERATE_JOB_DESCRIPTION: 'generateJobDescription',
  NAVIGATE_ATTENDANCE: 'openScreen',
  NAVIGATE_DASHBOARD: 'openScreen',
  NAVIGATE_EMPLOYEES: 'openScreen',
  NAVIGATE_JOBS: 'openScreen',
  NAVIGATE_LEAVE: 'openScreen',
  NAVIGATE_PAYROLL: 'openScreen',
  NAVIGATE_PROFILE: 'openScreen',
  NAVIGATE_RECRUITMENT: 'openScreen',
  NAVIGATE_REPORTS: 'openScreen',
  NAVIGATE_SETTINGS: 'openScreen',
  PUBLISH_JOB: 'publishOpening',
  REJECT_LEAVE_REQUEST: 'decideRequest',
  UPDATE_EMPLOYEE: 'updateEmployeeDetails',
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'could',
  'do',
  'for',
  'i',
  'is',
  'it',
  'me',
  'my',
  'of',
  'please',
  'the',
  'to',
  'you',
  '\u0627\u0639\u0645\u0644',
  '\u0627\u0646\u0627',
  '\u0628\u062f\u064a',
  '\u0634\u0648',
  '\u0639\u0644\u0649',
  '\u0639\u0646',
  '\u0641\u064a',
  '\u0644\u0648',
  '\u0645\u0645\u0643\u0646',
  '\u0645\u0646',
  '\u064a\u0627',
])

function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0625\u0623\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629/g, '\u0647')
    /* A frequent keyboard slip in Arabic must not turn a report into a refusal. */
    .replace(/\u0645\u0648\u0636\u0641/g, '\u0645\u0648\u0638\u0641')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokensFor(text: string): readonly string[] {
  return [...new Set(normalize(text).split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token)))]
}

function routeFor(sourceIntent: string): TrainingRoute | null {
  const action = ACTION_MAP[sourceIntent]
  if (action) return { kind: 'action', action }
  return INTENT_MAP[sourceIntent] ?? null
}

function loadTrainingSet(): { examples: readonly TrainingExample[]; stats: TrainingStats } {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = resolve(here, 'data', 'hr_agent_intents_10000.jsonl')

  try {
    const rows = readFileSync(source, 'utf8').split(/\r?\n/)
    const examples: TrainingExample[] = []
    let totalRows = 0

    for (const line of rows) {
      if (!line.trim()) continue
      totalRows += 1

      let row: SourceRow
      try {
        row = JSON.parse(line) as SourceRow
      } catch {
        continue
      }

      if (typeof row.text !== 'string' || typeof row.intent !== 'string' || row.text.trim().length < 2) continue
      const route = routeFor(row.intent)
      if (!route) continue

      examples.push({
        id: typeof row.id === 'string' ? row.id : String(totalRows),
        text: row.text.trim().slice(0, 500),
        sourceRole: typeof row.role === 'string' ? row.role.toLocaleLowerCase() : null,
        route,
        normalized: normalize(row.text),
        tokens: tokensFor(row.text),
      })
    }

    return {
      examples,
      stats: { totalRows, usableRows: examples.length, skippedRows: totalRows - examples.length },
    }
  } catch (error) {
    /* The normal classifier still works if a deployment omitted the optional asset. */
    console.warn('[copilot] labelled training set was not loaded:', error instanceof Error ? error.message : error)
    return { examples: [], stats: { totalRows: 0, usableRows: 0, skippedRows: 0 } }
  }
}

/**
 * Phrases for capabilities added after the supplied 10k-row corpus was made.
 * These examples improve routing only. `mayAsk`/`mayDo`, record scope,
 * validation and confirmation still decide whether anything may run.
 */
const SUPPLEMENTAL_GROUPS: readonly {
  route: TrainingRoute
  sourceRole: string | null
  texts: readonly string[]
}[] = [
  { route: { kind: 'intent', intent: 'myLeaveBalance' }, sourceRole: 'employee', texts: [
    'كم يوم إجازة ضايل إلي', 'شو رصيد إجازاتي', 'قديش باقيلي إجازات', 'how many leave days do I have left',
  ] },
  { route: { kind: 'intent', intent: 'myRequests' }, sourceRole: 'employee', texts: [
    'وين وصل طلب إجازتي', 'ورجيني طلباتي المعلقة', 'شو صار بطلب الإجازة', 'show my pending requests',
  ] },
  { route: { kind: 'intent', intent: 'myPayslips' }, sourceRole: 'employee', texts: [
    'ورجيني قسيمة راتبي', 'بدي كشف راتبي', 'كم الصافي تبعي هالشهر', 'show my latest payslip',
  ] },
  { route: { kind: 'intent', intent: 'teamPendingApprovals' }, sourceRole: 'manager', texts: [
    'شو الطلبات اللي ناطرة موافقتي', 'مين من فريقي طالب إجازة', 'ورجيني طلبات فريقي المعلقة',
  ] },
  { route: { kind: 'intent', intent: 'teamPresentNow' }, sourceRole: 'manager', texts: [
    'مين من فريقي موجود هسا', 'مين داوم من الفريق اليوم', 'show who is present on my team',
  ] },
  { route: { kind: 'intent', intent: 'openJobOpenings' }, sourceRole: 'hr', texts: [
    'شو الوظائف المفتوحة عنا', 'ايش الشواغر المنشورة', 'ورجيني الوظائف المتاحة للتقديم', 'what jobs are open right now',
  ] },
  { route: { kind: 'intent', intent: 'payrollReadiness' }, sourceRole: 'hr', texts: [
    'هل الرواتب جاهزة للمراجعة', 'شو ناقص قبل تشغيل الرواتب', 'هل في مشاكل مانعة البيرول',
  ] },

  { route: { kind: 'action', action: 'requestLeave' }, sourceRole: 'employee', texts: [
    'قدّملي على إجازة', 'بدي أطلب إجازة', 'اعمللي طلب إجازة من الأحد للخميس', 'submit a leave request for me',
  ] },
  { route: { kind: 'action', action: 'requestDocument' }, sourceRole: 'employee', texts: [
    'اطلبلي شهادة عمل', 'بدي شهادة موظف', 'قدّم طلب تعديل معلوماتي', 'request an employment certificate',
  ] },
  { route: { kind: 'action', action: 'scrollPage' }, sourceRole: null, texts: [
    'انزلي بالصفحة لتحت', 'طلعني لفوق شوي', 'روح لآخر الصفحة', 'رجعني لأول الصفحة', 'scroll down the page',
  ] },
  { route: { kind: 'action', action: 'filterScreen' }, sourceRole: 'hr', texts: [
    'دورلي على أحمد بقائمة الموظفين', 'فلتر المتقدمين بمرحلة المقابلة', 'ورجيني الموظفين اللي دورهم HR',
  ] },
  { route: { kind: 'action', action: 'openEmployeeFile' }, sourceRole: 'hr', texts: [
    'افتح ملف الموظف أحمد', 'روح على ملف EMP-1003', 'ورجيني بروفايل محمد الوظيفي',
  ] },
  { route: { kind: 'action', action: 'setLanguage' }, sourceRole: null, texts: [
    'حول النظام إنجليزي', 'خلي الواجهة عربي', 'switch the system to English',
  ] },
  { route: { kind: 'action', action: 'signOut' }, sourceRole: null, texts: [
    'طلعني من النظام', 'سجل خروج من التطبيق', 'log me out of the system',
  ] },
  { route: { kind: 'action', action: 'markAllNotificationsRead' }, sourceRole: null, texts: [
    'اعتبر كل الإشعارات مقروءة', 'علّم الإشعارات كلها كمقروءة', 'mark all notifications as read',
  ] },
  { route: { kind: 'action', action: 'postAnnouncement' }, sourceRole: 'hr', texts: [
    'انشر إعلان داخلي للموظفين', 'اكتب تعميم للشركة', 'نزّل إعلان جديد للكل',
  ] },
  { route: { kind: 'action', action: 'updateAnnouncement' }, sourceRole: 'hr', texts: [
    'عدل نص الإعلان الداخلي', 'غيّر محتوى التعميم', 'update the company announcement',
  ] },
  { route: { kind: 'action', action: 'addCalendarEvent' }, sourceRole: 'manager', texts: [
    'ضيف موعد على التقويم', 'سجل اجتماع للفريق بكرا', 'add a calendar event',
  ] },
  { route: { kind: 'action', action: 'remindCheckout' }, sourceRole: 'hr', texts: [
    'ذكّر الموظف يسجل مغادرة', 'ابعت تذكير للي ناسي الخروج', 'remind them to check out',
  ] },
  { route: { kind: 'action', action: 'resetPassword' }, sourceRole: 'admin', texts: [
    'اعمل إعادة تعيين لكلمة مرور أحمد', 'صفر باسورد الموظف', 'reset the employee password',
  ] },
  { route: { kind: 'action', action: 'setSalary' }, sourceRole: 'hr', texts: [
    'اعمل عقد راتب لموظف جديد', 'حدد راتب أحمد ألف دينار', 'عدّل الراتب الأساسي لمحمد',
  ] },
  { route: { kind: 'action', action: 'createPayrollAdjustment' }, sourceRole: 'hr', texts: [
    'ضيف مية دينار مكافأة لمحمد', 'سجل خصم خمسين على الموظف', 'حط بدل مواصلات لأحمد', 'add a bonus for the employee',
  ] },
  { route: { kind: 'action', action: 'approvePayrollAdjustment' }, sourceRole: 'hr', texts: [
    'اعتمد مكافأة أحمد', 'وافق على تعديل الراتب المعلق', 'approve the pending payroll adjustment',
  ] },
  { route: { kind: 'action', action: 'reviewPayrollFinding' }, sourceRole: 'hr', texts: [
    'راجع ملاحظة تدقيق الراتب', 'اعتبر مشكلة البيرول مراجعة', 'راجع التنبيه الغريب بالرواتب',
  ] },
  { route: { kind: 'action', action: 'runPayroll' }, sourceRole: 'hr', texts: [
    'جهز رواتب هالشهر', 'احسب البيرول لشهر عشرة', 'شغّل دورة الرواتب',
  ] },
  { route: { kind: 'action', action: 'auditPayroll' }, sourceRole: 'hr', texts: [
    'دقق رواتب الشهر', 'حلل مشاكل دورة الرواتب', 'run the payroll audit',
  ] },
  { route: { kind: 'action', action: 'approvePayroll' }, sourceRole: 'hr', texts: [
    'اعتمد دورة الرواتب', 'وافق على بيرول أكتوبر', 'approve this payroll run',
  ] },
  { route: { kind: 'action', action: 'regenerateJobDescriptionSection' }, sourceRole: 'hr', texts: [
    'اعد كتابة مسؤوليات الوصف الوظيفي', 'جدد قسم المهارات بالوصف', 'rewrite the qualifications section',
  ] },
  { route: { kind: 'action', action: 'approveJobDescription' }, sourceRole: 'hr', texts: [
    'اعتمد الوصف الوظيفي للمحاسب', 'وافق على وصف مطور برمجيات', 'approve the job description',
  ] },
  { route: { kind: 'action', action: 'createOpeningFromJobDescription' }, sourceRole: 'hr', texts: [
    'اعمل شاغر من الوصف الوظيفي', 'حول الوصف لوظيفة مفتوحة', 'create an opening from this job description',
  ] },
  { route: { kind: 'action', action: 'addKnowledgeText' }, sourceRole: 'hr', texts: [
    'ضيف هاي السياسة لقاعدة المعرفة', 'احفظ الإجراء بقاعدة معرفة المساعد', 'add this policy to the knowledge base',
  ] },
  { route: { kind: 'action', action: 'deleteKnowledgeText' }, sourceRole: 'hr', texts: [
    'احذف المقال من قاعدة المعرفة', 'شيل سياسة الإجازات من معرفة المساعد', 'delete the knowledge article',
  ] },
  { route: { kind: 'action', action: 'updateJobOpening' }, sourceRole: 'hr', texts: [
    'عدل تفاصيل الوظيفة المفتوحة', 'غيّر موقع الشاغر لعمان', 'update the job opening',
  ] },
  { route: { kind: 'action', action: 'publishOpening' }, sourceRole: 'hr', texts: [
    'انشر الشاغر للتقديم', 'خلي الوظيفة ظاهرة بصفحة الوظائف', 'publish the job opening',
  ] },
  { route: { kind: 'action', action: 'moveApplication' }, sourceRole: 'hr', texts: [
    'انقل طلب أحمد لمرحلة المقابلة', 'حط المرشح بالقائمة المختصرة', 'move the application to interview',
  ] },
  { route: { kind: 'action', action: 'analyseApplication' }, sourceRole: 'hr', texts: [
    'حلل سيرة المتقدم مع الوظيفة', 'قارن السي في بمتطلبات الشاغر', 'analyze the candidate CV match',
  ] },
  { route: { kind: 'action', action: 'generateInterview' }, sourceRole: 'hr', texts: [
    'جهز امتحان للمتقدم', 'ولّد عشر أسئلة للمرشح', 'generate the applicant assessment',
  ] },
  { route: { kind: 'action', action: 'reviewInterviewQuestion' }, sourceRole: 'hr', texts: [
    'اعتمد السؤال الثالث بالامتحان', 'اعد كتابة السؤال رقم سبعة', 'revise interview question two',
  ] },
  { route: { kind: 'action', action: 'evaluateInterview' }, sourceRole: 'hr', texts: [
    'قيّم إجابات المتقدم', 'حلل نتيجة امتحان المرشح', 'evaluate the completed interview',
  ] },
  { route: { kind: 'action', action: 'sendInterview' }, sourceRole: 'hr', texts: [
    'ابعت الامتحان للمتقدم', 'حدد موعد الامتحان وأرسله', 'send the approved interview',
  ] },
]

function supplementalExamples(): TrainingExample[] {
  return SUPPLEMENTAL_GROUPS.flatMap((group, groupIndex) =>
    group.texts.map((text, textIndex) => ({
      id: `supplemental-${String(groupIndex).padStart(2, '0')}-${String(textIndex).padStart(2, '0')}`,
      text,
      sourceRole: group.sourceRole,
      route: group.route,
      normalized: normalize(text),
      tokens: tokensFor(text),
    })),
  )
}

const loaded = loadTrainingSet()
const EXAMPLES = [...loaded.examples, ...supplementalExamples()]

export const trainingStats: Readonly<TrainingStats> = loaded.stats

function allowedForRole(example: TrainingExample, role: Role): boolean {
  if (example.route.kind === 'intent') return mayAsk(role, example.route.intent)
  return mayAsk(role, 'doAction') && mayDo(role, example.route.action)
}

/**
 * A word-for-word match is settled locally.  This is the deterministic part of
 * learning from the labelled set; a near match still goes through the model
 * with examples and then through the ordinary server-side permission gate.
 */
export function exactTrainingMatch(question: string, role: Role): ExactTrainingMatch | null {
  const normalized = normalize(question)
  if (!normalized) return null

  const match = EXAMPLES.find((example) => example.normalized === normalized && allowedForRole(example, role))
  if (!match) return null

  if (match.route.kind === 'action') return { kind: 'action', action: match.route.action }

  /* A generic personal attendance or leave report is safe for an employee. */
  const ownReport =
    role === 'employee' &&
    match.route.intent === 'generateReport' &&
    (match.route.reportType === 'attendance' || match.route.reportType === 'leave')

  return {
    kind: 'intent',
    intent: ownReport ? 'myReport' : match.route.intent,
    reportType: match.route.reportType ?? null,
    refusal: match.route.refusal ?? null,
  }
}

/**
 * Identifies a labelled instruction without authorising it.  Routes use this
 * only to give a clear `notPermitted` response when the actor lacks the action
 * capability; execution continues to be guarded by `mayDo` and `/do`.
 */
export function exactTrainingAction(question: string): CopilotAction | null {
  const normalized = normalize(question)
  if (!normalized) return null
  const match = EXAMPLES.find((example) => example.normalized === normalized && example.route.kind === 'action')
  return match?.route.kind === 'action' ? match.route.action : null
}

function emptyQuestionPlan(intent: CopilotIntent, reportType: ReportType | null, refusalReason: CopilotPlan['refusalReason']): CopilotPlan {
  return {
    intent,
    period: null,
    month: null,
    year: null,
    department: null,
    personName: null,
    employeeNumber: null,
    rankBy: null,
    payrollTopic: null,
    reportType,
    refusalReason,
  }
}

function emptyActionPlan(action: CopilotAction): CopilotActionPlan {
  return {
    action,
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
    employmentType: null,
    language: null,
    screen: null,
    scrollTarget: null,
    amount: null,
    opensAt: null,
    durationMinutes: null,
    questionNumber: null,
    payrollAdjustmentKind: null,
    employeeNumberNew: null,
    jobTitle: null,
    department: null,
    jobDescriptionSection: null,
    refusalReason: null,
  }
}

type EmployeeLookup = {
  personName: string | null
  employeeNumber: string | null
}

/** Narrow read grammars outrank fuzzy intent/action examples. No writes or name catalogue. */
export function deterministicReadPlan(question: string, role: Role, onRule?: (rule: ReadRule) => void): CopilotPlan | null {
  const decision = deterministicReadDecision(question)
  if (decision.kind === 'abstain') return null
  if (decision.kind === 'resolved') {
    onRule?.(decision.routingRule)
    return mayAsk(role, decision.plan.intent) ? decision.plan : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }
  const text = question.normalize('NFC').trim()
    .replace(/^(?:please\s+|من\s+فضلك\s+)/iu, '')
    .replace(/[?؟!.]+$/u, '').trim()
  const normalized = normalize(text)
  const ownLeave = /^(?:(?:show|display|tell|give)(?: me)?|what (?:is|s)|how much is) my (?:(?:remaining|annual|sick) )*(?:leave|vacation) balance$/u.test(normalized)
    || /^(?:(?:ورجيني|وريني|اعرض(?:لي)?|ارني|كم|شو)\s+)?رصيد\s+(?:اجازاتي|اجازتي)$/u.test(normalized)
  if (ownLeave) {
    return mayAsk(role, 'myLeaveBalance')
      ? emptyQuestionPlan('myLeaveBalance', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  const name = /^(?:show|display)(?:\s+me)?\s+(.+?)[’']s\s+(?:employee\s+)?(?:details|information|profile|file)$/iu.exec(text)?.[1]
    ?? /^(?:show|display)(?:\s+me)?\s+(?:the\s+)?(?:employee\s+)?(?:details|information|profile|file)\s+(?:for|of)\s+(.+)$/iu.exec(text)?.[1]
    ?? /^(?:ورجيني|وريني|اعرض(?:لي)?|أعرض(?:لي)?|ارني|أرني)\s+(?:معلومات|تفاصيل|ملف|بيانات)\s+(?:الموظف\s+)?(.+)$/u.exec(text)?.[1]
  const personName = name ? extractReadPersonName(name) : null
  if (!personName) return null
  onRule?.('employee_details')
  return mayAsk(role, 'employeeFile')
    ? { ...emptyQuestionPlan('employeeFile', null, null), personName }
    : emptyQuestionPlan('outOfScope', null, 'notPermitted')
}

/**
 * A short directory lookup is a common spoken instruction. Keep it narrow:
 * list filters still use `filterScreen`, while a direct name lookup enters the
 * protected employee-file flow where an ambiguous name can be clarified.
 */
function employeeFileLookup(question: string): EmployeeLookup | null {
  const match =
    /^(?:search(?:\s+for)?|find|look\s+up)\s+(?:employee\s+)?(.+)$/iu.exec(question)
    ?? /^(?:\u062f\u0648\u0631(?:\u0644\u064a)?|\u0627\u0628\u062d\u062b(?:\u0644\u064a)?)\s+(?:\u0639\u0644\u0649|\u0639\u0646)\s+(.+)$/u.exec(question)
  if (!match) return null

  const target = (match[1] ?? '')
    .replace(/^(?:the\s+)?(?:employee|staff|\u0627\u0644\u0645\u0648\u0638\u0641)\s+/iu, '')
    .trim()
  if (!target || /(?:\b(?:in|on)\s+(?:the\s+)?(?:employee\s+)?list\b|\u0628\u0642\u0627\u0626\u0645\u0629|\u0642\u0627\u0626\u0645\u0629\s+\u0627\u0644\u0645\u0648\u0638\u0641)/iu.test(target)) return null

  const employeeNumber = /^(?:emp[-_ ]?\d+)$/iu.test(target) ? target.toUpperCase().replace(/[ _]/g, '-') : null
  return employeeNumber ? { personName: null, employeeNumber } : { personName: target, employeeNumber: null }
}

/** A named attendance request is a person-scoped report, never company data. */
function namedEmployeeAttendancePlan(question: string, role: Role): CopilotPlan | null {
  const name =
    /\battendance\s+(?:for|of|\u062a\u0628\u0639|\u062a\u0628\u0639\u062a)\s+(.+)$/iu.exec(question)?.[1]
    ?? /\u062d\u0636\u0648\u0631\s+(?:\u062a\u0628\u0639|\u062a\u0628\u0639\u062a|\u0644)\s+(.+)$/u.exec(question)?.[1]
  const personName = name?.trim() ?? ''
  if (!personName) return null

  return mayAsk(role, 'employeeFile')
    ? { ...emptyQuestionPlan('employeeFile', null, null), personName }
    : emptyQuestionPlan('outOfScope', null, 'notPermitted')
}

/**
 * A deliberately conservative first-pass check for a person asking the system
 * to _do_ something.  It is not an action executor and it does not extract
 * values: the normal action resolver still reads the name, date and other
 * details, then `proposeAction` and `/copilot/do` apply the usual permission
 * and confirmation checks.
 *
 * Its purpose is latency.  The ordinary path used to ask a model twice for a
 * sentence such as "\u0627\u0639\u062a\u0645\u062f \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0644\u0645\u062d\u0627\u0633\u0628": first whether it was an instruction,
 * then which instruction it was.  Here the resource and imperative verb make
 * the first answer deterministic, so only the second, detail-extraction pass
 * remains.  Do not broaden this into fuzzy matching: a false positive makes a
 * question feel like an action even though the confirmation gate prevents a
 * write.
 */
const IMPERATIVE_PREFIX = /^(?:open|go(?:\s+to)?|navigate|show|take\s+me\s+to|click|press|scroll|page\s+(?:up|down)|create|make|prepare|write|add|put|record|submit|request|publish|approve|reject|update|change|edit|delete|remove|close|run|calculate|audit|remind|reset|sign\s*out|\u0627\u0641\u062a\u062d(?:\u0644\u064a)?|\u0631\u0648\u062d|\u0648\u062f\u064a\u0646\u064a|\u0627\u0646\u062a\u0642\u0644|\u0627\u0639\u0631\u0636|\u0627\u0636\u063a\u0637|\u0636\u063a\u0637|\u0627\u0643\u0628\u0633|\u0643\u0628\u0633|\u0627\u0646\u0632\u0644|\u0646\u0632\u0644|\u0627\u0637\u0644\u0639|\u0637\u0644\u0639|\u0627\u0639\u0645\u0644(?:\u0644\u064a)?|\u0639\u0645\u0644(?:\u0644\u064a)?|\u062c\u0647\u0632(?:\u0644\u064a)?|\u0627\u0643\u062a\u0628(?:\u0644\u064a)?|\u0627\u0646\u0634(?:\u0626|\u064a)|\u0627\u0646\u0634\u0627\u0621|\u0627\u0636\u0641|\u0636\u064a\u0641|\u062d\u0637|\u0633\u062c\u0644(?:\u0644\u064a)?|\u0642\u062f\u0645|\u0627\u0637\u0644\u0628|\u0627\u0646\u0634\u0631|\u0646\u0634\u0631|\u0627\u0639\u062a\u0645\u062f|\u0648\u0627\u0641\u0642|\u0627\u0631\u0641\u0636|\u062d\u062f\u062b|\u063a\u064a\u0631|\u0639\u062f\u0644|\u0627\u062d\u0630\u0641|\u0627\u0645\u0633\u062d|\u0633\u0643\u0631|\u0627\u063a\u0644\u0642|\u062f\u0642\u0642|\u0630\u0643\u0631|\u0628\u062f\u064a|\u0628\u062f\u0646\u0627|\u0627\u0631\u064a\u062f)(?:\s|$)/u

function scrollTargetFromInstruction(question: string): CopilotActionPlan['scrollTarget'] {
  const normalized = normalize(question)
  if (/\b(?:top|beginning)\b|(?:\u0627\u0648\u0644|\u0628\u062f\u0627\u064a\u0647)\s+(?:\u0627\u0644\u0635\u0641\u062d\u0647|\u0635\u0641\u062d\u0647)/u.test(normalized)) return 'top'
  if (/\b(?:bottom|end)\b|(?:\u0627\u062e\u0631|\u0646\u0647\u0627\u064a\u0647)\s+(?:\u0627\u0644\u0635\u0641\u062d\u0647|\u0635\u0641\u062d\u0647)/u.test(normalized)) return 'bottom'
  if (/\b(?:scroll\s+up|page\s+up|up)\b|(?:\u0627\u0637\u0644\u0639|\u0637\u0644\u0639|\u0641\u0648\u0642|\u0644\u0641\u0648\u0642)/u.test(normalized)) return 'up'
  if (/\b(?:scroll\s+down|page\s+down|down)\b|(?:\u0627\u0646\u0632\u0644|\u0646\u0632\u0644|\u062a\u062d\u062a|\u0644\u062a\u062d\u062a|\u0627\u0633\u0641\u0644|\u0623\u0633\u0641\u0644)/u.test(normalized)) return 'down'
  return null
}

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term))
}

/**
 * Returns a closed action category only when the wording starts like an
 * instruction and names a resource that belongs to one action.  It never
 * chooses a target record or a value.
 */
function commonActionInstruction(question: string): CopilotAction | null {
  const normalized = normalize(question)
  if (!IMPERATIVE_PREFIX.test(normalized)) return null

  if (scrollTargetFromInstruction(question)) return 'scrollPage'

  const has = (...terms: string[]) => includesAny(normalized, terms)
  const starts = (...terms: string[]) => terms.some((term) => normalized.startsWith(term))
  const deletes = has('delete', 'remove', '\u0627\u062d\u0630\u0641', '\u0627\u0645\u0633\u062d')
  const approves = has('approve', '\u0627\u0639\u062a\u0645\u062f', '\u0648\u0627\u0641\u0642')
  const rejects = has('reject', '\u0627\u0631\u0641\u0636')
  // "\u0628\u062f\u064a \u0627\u0639\u0631\u0641 \u0639\u0646 \u0627\u062c\u0627\u0632\u062a\u064a" is a question, even though it begins with
  // an informal request word.  Let the question router answer it instead of
  // proposing a leave request.
  if (has('how ', 'what ', 'when ', 'where ', 'why ', 'can i ', '\u0627\u0639\u0631\u0641', '\u0645\u0639\u0631\u0641\u0647', '\u0643\u0645', '\u0634\u0648', '\u0647\u0644', '\u0648\u064a\u0646', '\u0644\u064a\u0634', '\u0645\u062a\u0649')) return null

  // These families already carry safe local parsing below.  Keeping them out
  // of the generic matcher preserves their dates, amounts and type values.
  if (salaryContractInstruction(question) || payrollAdjustmentInstruction(question) || payrollRunInstruction(question)) return null

  const filterVerb = has('filter', 'search', 'find', '\u0641\u0644\u062a\u0631', '\u0627\u0628\u062d\u062b', '\u062f\u0648\u0631')
  const listedRole = has('admin', 'manager', 'employee', 'hr', '\u0645\u062f\u064a\u0631', '\u0645\u0648\u0638\u0641', '\u0645\u0648\u0627\u0631\u062f')
  const listedStage = has('interview', 'offer', 'hired', 'rejected', 'shortlist', '\u0645\u0642\u0627\u0628\u0644', '\u0639\u0631\u0636', '\u0645\u0631\u0641\u0648\u0636')
  if (
    (filterVerb || (has('show', '\u0627\u0639\u0631\u0636') && (listedRole || listedStage))) &&
    has('employee', 'staff', 'user', 'applicant', 'candidate', '\u0645\u0648\u0638\u0641', '\u0645\u0633\u062a\u062e\u062f\u0645', '\u0645\u062a\u0642\u062f\u0645', '\u0645\u0631\u0634\u062d')
  ) return 'filterScreen'

  if (has('job description', '\u0648\u0635\u0641 \u0648\u0638\u064a\u0641', '\u0648\u0635\u0641 \u0648\u0636\u064a\u0641', '\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641', '\u0648\u0635\u0641 \u0627\u0644\u0648\u0636\u064a\u0641')) {
    if (deletes) return 'deleteJobDescription'
    if (approves) return 'approveJobDescription'
    if (has('rewrite', 'regenerate', '\u0627\u0639\u062f \u0643\u062a\u0627\u0628', '\u0627\u0639\u0627\u062f\u0629 \u0643\u062a\u0627\u0628', '\u062c\u062f\u062f')) return 'regenerateJobDescriptionSection'
    if (has('vacancy', 'job opening', '\u0648\u0638\u064a\u0641\u0647 \u0634\u0627\u063a\u0631', '\u0641\u0631\u0635\u0647 \u0639\u0645\u0644')) return 'createOpeningFromJobDescription'
    return 'generateJobDescription'
  }

  if (has('announcement', '\u0627\u0639\u0644\u0627\u0646')) {
    if (deletes) return 'deleteAnnouncement'
    if (has('edit', 'update', 'change', '\u0639\u062f\u0644', '\u062a\u0639\u062f\u064a\u0644')) return 'updateAnnouncement'
    return 'postAnnouncement'
  }

  if (has('calendar', 'event', '\u062a\u0642\u0648\u064a\u0645', '\u0645\u0648\u0639\u062f', '\u062d\u062f\u062b')) {
    return deletes ? 'deleteCalendarEvent' : 'addCalendarEvent'
  }

  if (has('leave', '\u0627\u062c\u0627\u0632')) {
    if (has('cancel', 'withdraw', '\u0627\u0644\u063a\u064a', '\u0627\u0633\u062d\u0628')) return 'cancelRequest'
    if (approves || rejects) return 'decideRequest'
    return 'requestLeave'
  }

  if (has('password', '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631')) return 'resetPassword'

  if (has('language', '\u0627\u0644\u0644\u063a\u0647')) return 'setLanguage'

  if (has('sign out', 'log out', '\u062e\u0631\u0648\u062c \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645')) return 'signOut'

  if (has('checkout', 'check out', '\u0645\u063a\u0627\u062f\u0631')) {
    return has('remind', '\u0630\u0643\u0631') ? 'remindCheckout' : 'checkOut'
  }
  if (starts('check in', '\u0633\u062c\u0644', '\u0627\u0646\u0627 \u062d\u0627\u0636\u0631') && has('attendance', '\u062d\u0636\u0648\u0631')) return 'checkIn'

  if (
    has('question', '\u0633\u0624\u0627\u0644', '\u0627\u0633\u0626\u0644') &&
    (approves || has('rewrite', 'revise', 'regenerate', '\u063a\u064a\u0631', '\u0639\u062f\u0644', '\u0627\u0639\u062f \u0643\u062a\u0627\u0628'))
  ) return 'reviewInterviewQuestion'

  if (has('application', 'applicant', '\u0645\u0631\u0634\u062d', '\u0645\u062a\u0642\u062f\u0645')) {
    if (has('cv', 'resume', '\u0633\u064a \u0641\u064a', '\u062a\u062d\u0644\u064a\u0644')) return 'analyseApplication'
    if (has('stage', 'interview', 'offer', 'hired', 'rejected', '\u0645\u0631\u062d\u0644', '\u0645\u0642\u0627\u0628\u0644', '\u0639\u0631\u0636', '\u0645\u0631\u0641\u0648\u0636')) return 'moveApplication'
  }

  if (has('vacancy', 'job opening', '\u0648\u0638\u064a\u0641\u0647 \u0634\u0627\u063a\u0631', '\u0641\u0631\u0635\u0647 \u0639\u0645\u0644')) {
    if (deletes) return 'deleteOpening'
    if (has('close', '\u0633\u0643\u0631', '\u0627\u063a\u0644\u0642')) return 'closeOpening'
    if (has('publish', '\u0627\u0646\u0634\u0631', '\u0646\u0634\u0631')) return 'publishOpening'
    if (has('update', 'edit', 'change', '\u062d\u062f\u062b', '\u0639\u062f\u0644', '\u063a\u064a\u0631')) return 'updateJobOpening'
    return 'createJob'
  }

  if (has('employee', '\u0645\u0648\u0638\u0641')) {
    if (has('role', 'permission', '\u0635\u0644\u0627\u062d', '\u062f\u0648\u0631')) return 'changeEmployeeRole'
    if (has('update', 'edit', 'change', 'details', '\u062d\u062f\u062b', '\u0639\u062f\u0644', '\u063a\u064a\u0631', '\u0628\u064a\u0627\u0646')) return 'updateEmployeeDetails'
    if (starts('add ', 'create ', '\u0627\u0636\u0641', '\u0636\u064a\u0641', '\u0627\u0646\u0634\u0626', '\u0633\u062c\u0644', '\u0628\u062f\u064a')) return 'addEmployee'
  }

  return null
}

/** Used by the route before it reads remembered instruction routing. */
export function isLikelyInstruction(question: string): boolean {
  return IMPERATIVE_PREFIX.test(normalize(question))
}

type ReportTiming = Pick<CopilotPlan, 'period' | 'month' | 'year'>

function reportTiming(normalized: string): ReportTiming {
  const namedMonth = /(?:month|\u0627\u0644\u0634\u0647\u0631|\u0634\u0647\u0631)\s*(1[0-2]|[1-9])(?:\s*(?:of|in|\u0645\u0646|\u0633\u0646\u0629|year)\s*(20\d{2}))?/u.exec(normalized)
  if (namedMonth) {
    return {
      period: 'calendarMonth',
      month: Number(namedMonth[1]),
      year: namedMonth[2] ? Number(namedMonth[2]) : null,
    }
  }
  if (
    normalized.includes('last 6 months') ||
    normalized.includes('last six months') ||
    normalized.includes('\u0627\u062e\u0631 6 \u0627\u0634\u0647\u0631')
  ) {
    return { period: 'lastSixMonths', month: null, year: null }
  }
  if (normalized.includes('this month') || normalized.includes('\u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631')) return { period: 'thisMonth', month: null, year: null }
  if (normalized.includes('last month') || normalized.includes('\u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u0627\u0636\u064a')) return { period: 'lastMonth', month: null, year: null }
  if (normalized.includes('this year') || normalized.includes('\u0647\u0630\u0647 \u0627\u0644\u0633\u0646\u0629')) return { period: 'thisYear', month: null, year: null }
  return { period: null, month: null, year: null }
}

/** A live analytics question which produces the same controlled department report. */
function departmentAbsencePlan(question: string, role: Role): CopilotPlan | null {
  const normalized = normalize(question)
  const asksAbsence = normalized.includes('absence') || normalized.includes('\u063a\u064a\u0627\u0628')
  const asksDepartments =
    normalized.includes('department') || normalized.includes('\u0642\u0633\u0645') || normalized.includes('\u0627\u0642\u0633\u0627\u0645')
  if (!asksAbsence || !asksDepartments) return null

  const plan = mayAsk(role, 'departmentAbsenceComparison')
    ? emptyQuestionPlan('departmentAbsenceComparison', 'department', null)
    : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  return { ...plan, ...reportTiming(normalized) }
}

/**
 * A salary report about a named person is never an organisation report.
 *
 * The general report recogniser used to see the word "report" and produced an
 * employee/company report before it got as far as the name.  That is especially
 * misleading for pay: a request for Ahmad's payslips must either become Ahmad's
 * report or fail safely, never quietly widen to everyone.
 */
function namedEmployeePayrollPlan(question: string, role: Role): CopilotPlan | null {
  const normalized = normalize(question)
  const asksPayroll =
    normalized.includes('payroll') ||
    normalized.includes('salary') ||
    normalized.includes('payslip') ||
    normalized.includes('\u0631\u0648\u0627\u062a\u0628') ||
    normalized.includes('\u0631\u0648\u0627\u062a\u062a\u0628') ||
    normalized.includes('\u0631\u0627\u062a\u0628')
  if (!asksPayroll) return null

  const number = /\b(?:emp[-_ ]?\d+)\b/iu.exec(normalized)?.[0] ?? null
  /* Keep the original spelling for the database lookup: Ø£Ø­Ù…Ø¯ and Ø§Ø­Ù…Ø¯ should
     both route the same way, but the stored name may retain its hamza. */
  const afterEmployee = /(?:\bemployee\b|(?:\u0627\u0644)?\u0645\u0648[\u0638\u0636]\u0641)\s+(.+)$/iu.exec(question)?.[1]
    ?? /(?:\bsalary\b|\u0631\u0627\u062a\u0628)\s+(.+)$/iu.exec(question)?.[1]
    ?? null
  const personName = afterEmployee
    ?.replace(/\s+(?:for|from|in|during|this|last|month|year)\b.*$/iu, '')
    /* "Ù„Ø´Ù‡Ø± 9" is a period qualifier, not part of Ahmad's name. Arabic
       letters are not JavaScript \b word characters, so write this boundary
       around whitespace rather than relying on \b. */
    .replace(/\s+(?:\u0644?\u0634\u0647\u0631)\s*(?:1[0-2]|[1-9])(?:\s*(?:\u0645\u0646|\u0633\u0646\u0629|year)\s*20\d{2})?.*$/u, '')
    .replace(/\s+(?:(?:\u0644?\u0647\u0630\u0627|\u0647\u0630\u0627)\s+\u0627\u0644\u0634\u0647\u0631|\u0627\u0644\u0634\u0647\u0631\s+\u0627\u0644\u0645\u0627\u0636\u064a|\u0644\u0644\u0641\u062a\u0631\u0629|\u0645\u0646\s+\d{4}-\d{2}-\d{2}).*$/u, '')
    .trim() ?? null
  /* â€œthe employee with the highest salaryâ€ describes a payroll ranking; it is
     not a person called â€œhighest salaryâ€. Keep it with the Payroll Agent. */
  const normalizedPerson = personName ? normalize(personName) : ''
  const describesRanking =
    (normalizedPerson.startsWith('\u0635\u0627\u062d\u0628 ') && (normalizedPerson.includes('\u0627\u0639\u0644\u064a') || normalizedPerson.includes('\u0627\u0643\u0628\u0631') || normalizedPerson.includes('\u0627\u0642\u0644') || normalizedPerson.includes('\u0627\u062f\u0646\u064a'))) ||
    /^(?:the\s+(?:highest|top|most|lowest|least))(?:\s|$)/iu.test(normalizedPerson)
  const isGeneric = !personName || describesRanking || /^(?:all|employees|\u0643\u0644|\u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646|\u0627\u0644\u0634\u0647\u0631|\u0647\u0630\u0627|\u0627\u0644\u062d\u0627\u0644\u064a)$/u.test(personName)
  if (!number && isGeneric) return null

  const plan = mayAsk(role, 'employeeFile')
    ? emptyQuestionPlan('employeeFile', 'payroll', null)
    : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  return {
    ...plan,
    personName: number ? null : personName,
    employeeNumber: number,
    ...reportTiming(normalized),
  }
}

function reportPlan(question: string, role: Role): CopilotPlan | null {
  const normalized = normalize(question)
  const asksForReport = normalized.includes('report') || normalized.includes('\u062a\u0642\u0631\u064a\u0631') || normalized.includes('\u062a\u0642\u0627\u0631\u064a\u0631')
  if (!asksForReport) return null

  const type: ReportType =
    normalized.includes('new hire') || normalized.includes('\u0627\u0644\u062c\u062f\u062f') || normalized.includes('\u062c\u062f\u062f')
      ? 'newHires'
      : normalized.includes('attendance') || normalized.includes('\u062d\u0636\u0648\u0631')
        ? 'attendance'
        : normalized.includes('leave') || normalized.includes('\u0627\u062c\u0627\u0632')
          ? 'leave'
          : normalized.includes('recruit') || normalized.includes('\u062a\u0648\u0638\u064a\u0641') || normalized.includes('\u0645\u0631\u0634\u062d')
            ? 'recruitment'
            : normalized.includes('department') || normalized.includes('\u0642\u0633\u0645') || normalized.includes('\u0627\u0642\u0633\u0627\u0645')
              ? 'department'
              : 'employees'

  const own = /\b(my|mine)\b/u.test(normalized) || /\u062d\u0636\u0648\u0631\u064a|\u0627\u062c\u0627\u0632\u0627\u062a\u064a|\u0639\u0646\u064a/u.test(normalized)
  const aboutOtherPeople =
    normalized.includes('employees') ||
    normalized.includes('\u0645\u0648\u0638\u0641') ||
    normalized.includes('company') ||
    normalized.includes('\u0627\u0644\u0634\u0631\u0643')

  const plan =
    own || (!aboutOtherPeople && role === 'employee')
      ? emptyQuestionPlan('myReport', type, null)
      : mayAsk(role, 'generateReport')
        ? emptyQuestionPlan('generateReport', type, null)
        : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  return { ...plan, ...reportTiming(normalized) }
}

/** Payroll review keeps working with no model key, through one closed query. */
function payrollAuditPlan(question: string, role: Role): CopilotPlan | null {
  const normalized = normalize(question)
  const asksPayroll = normalized.includes('payroll') || normalized.includes('\u0631\u0648\u0627\u062a\u0628') || normalized.includes('\u0631\u0627\u062a\u0628')
  const asksReview = normalized.includes('audit') || normalized.includes('finding') || normalized.includes('anomal') || normalized.includes('review') || normalized.includes('\u062a\u062f\u0642\u064a\u0642') || normalized.includes('\u0645\u0644\u0627\u062d\u0638') || normalized.includes('\u062e\u0637\u0623')
  if (!asksPayroll || !asksReview) return null
  const wantsFindings = normalized.includes('finding') || normalized.includes('anomal') || normalized.includes('\u0645\u0644\u0627\u062d\u0638') || normalized.includes('\u062e\u0637\u0623')
  const intent = wantsFindings ? 'payrollFindings' : 'payrollAuditSummary'
  return mayAsk(role, intent)
    ? emptyQuestionPlan(intent, null, null)
    : emptyQuestionPlan('outOfScope', null, 'notPermitted')
}

/** Closed routing for the Payroll Agent's fixed, read-only payroll views. */
function payrollAgentPlan(question: string, role: Role): CopilotPlan | null {
  const normalized = normalize(question)
  const asksPayroll = ['payroll', 'salary', 'payslip', '\u0631\u0648\u0627\u062a\u0628', '\u0631\u0627\u062a\u0628', '\u0627\u0636\u0627\u0641\u064a', '\u0645\u0643\u0627\u0641', '\u062e\u0635\u0648', '\u062a\u0639\u062f\u064a\u0644', '\u0639\u0642\u062f', '\u0639\u0642\u0648', '\u0628\u062f\u0644', '\u0636\u0645\u0627\u0646', '\u0636\u0631\u064a\u0628'].some((term) => normalized.includes(term))
  if (!asksPayroll) return null

  /* A command remains an action with its own confirmation and permission gate. */
  if (['calculate', 'run payroll', 'approve payroll', '\u0627\u062d\u0633\u0628', '\u0634\u063a\u0644', '\u0627\u0639\u062a\u0645\u062f'].some((term) => normalized.includes(term))) return null

  const topic =
    normalized.includes('ready') || normalized.includes('readiness') || normalized.includes('\u062c\u0627\u0647\u0632') || normalized.includes('\u062c\u0627\u0647\u0632\u064a\u0629') ? 'readiness'
    : normalized.includes('overtime') || normalized.includes('\u0627\u0636\u0627\u0641\u064a') ? 'overtime'
    : normalized.includes('bonus') || normalized.includes('\u0645\u0643\u0627\u0641') ? 'bonuses'
    : normalized.includes('deduction') || normalized.includes('\u062e\u0635\u0648') || normalized.includes('\u0636\u0645\u0627\u0646') || normalized.includes('\u0636\u0631\u064a\u0628') ? 'deductions'
    : normalized.includes('adjustment') || normalized.includes('\u062a\u0639\u062f\u064a\u0644') ? 'adjustments'
    : normalized.includes('highest') || normalized.includes('top paid') || normalized.includes('most paid') || normalized.includes('\u0627\u0639\u0644\u064a') || normalized.includes('\u0627\u0644\u0627\u0639\u0644\u064a') ? 'highestNetPay'
    : normalized.includes('lowest') || normalized.includes('least paid') || normalized.includes('\u0627\u0642\u0644') || normalized.includes('\u0627\u0644\u0627\u0642\u0644') || normalized.includes('\u0627\u062f\u0646\u064a') ? 'lowestNetPay'
    : normalized.includes('contract') || normalized.includes('\u0639\u0642\u062f') || normalized.includes('\u0639\u0642\u0648') || normalized.includes('\u0627\u0633\u0627\u0633\u064a') || normalized.includes('\u0628\u062f\u0644') ? 'contracts'
    : normalized.includes('change') || normalized.includes('difference') || normalized.includes('compare') || normalized.includes('variance') || normalized.includes('\u062a\u063a\u064a\u0631') || normalized.includes('\u0641\u0631\u0642') || normalized.includes('\u0642\u0627\u0631\u0646') ? 'variance'
    : normalized.includes('audit') || normalized.includes('finding') || normalized.includes('anomal') || normalized.includes('review') || normalized.includes('\u062a\u062f\u0642\u064a\u0642') || normalized.includes('\u0645\u0644\u0627\u062d\u0638') || normalized.includes('\u062e\u0637\u0623') ? 'findings'
    : 'summary'
  const plan = mayAsk(role, 'payrollInsights')
    ? emptyQuestionPlan('payrollInsights', null, null)
    : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  return { ...plan, payrollTopic: plan.intent === 'payrollInsights' ? topic : null, ...reportTiming(normalized) }
}

/**
 * "Create a salary contract" is an instruction, not a request to list the
 * existing contracts. Keep it out of the read-only Payroll Agent before the
 * general classifier sees it, so the guided contract flow works with or
 * without an AI key.
 */
function salaryContractInstruction(question: string): boolean {
  const normalized = normalize(question)
  const namesAContract =
    normalized.includes('salary contract') ||
    normalized.includes('contract salary') ||
    (normalized.includes('\u0639\u0642\u062f') && normalized.includes('\u0631\u0627\u062a\u0628')) ||
    normalized.includes('set salary') ||
    normalized.includes('\u062d\u062f\u062f \u0631\u0627\u062a\u0628')
  const asksForAReport = normalized.includes('report') || normalized.includes('\u062a\u0642\u0631\u064a\u0631')
  const isCommand = [
    'create', 'make', 'prepare', 'set', 'add',
    '\u0627\u0639\u0645\u0644', '\u0633\u0648\u064a', '\u062c\u0647\u0632', '\u0627\u0646\u0634\u0626', '\u062d\u062f\u062f', '\u062d\u0637', '\u0627\u0636\u0641',
  ].some((term) => normalized.includes(term))
  return namesAContract && isCommand && !asksForAReport
}

/** A write to payroll starts as a pending input, never as a read-only request. */
function payrollAdjustmentInstruction(question: string): 'overtime' | 'bonus' | 'allowance' | 'deduction' | null {
  const normalized = normalize(question)
  const isCommand = [
    'add', 'create', 'give', 'put', 'record',
    '\u0627\u0636\u0641', '\u0623\u0636\u0641', '\u0636\u064a\u0641', '\u062d\u0637', '\u0633\u062c\u0644', '\u0627\u0639\u0645\u0644', '\u0633\u0648\u064a',
  ].some((term) => normalized.includes(term))
  if (!isCommand) return null
  if (normalized.includes('overtime') || normalized.includes('\u0627\u0636\u0627\u0641\u064a') || normalized.includes('\u0625\u0636\u0627\u0641\u064a')) return 'overtime'
  if (normalized.includes('bonus') || normalized.includes('\u0645\u0643\u0627\u0641')) return 'bonus'
  if (normalized.includes('allowance') || normalized.includes('\u0628\u062f\u0644')) return 'allowance'
  if (normalized.includes('deduction') || normalized.includes('\u062e\u0635\u0645')) return 'deduction'
  return null
}

/**
 * Keep the obvious values in a short payroll instruction.  They remain only
 * untrusted words until `proposeAction` resolves the person inside the
 * asker's authorised scope and validates the amount.
 */
function payrollAdjustmentDetails(question: string): Pick<CopilotActionPlan, 'personName' | 'employeeNumber' | 'amount' | 'text'> {
  const arabicDigits: Record<string, string> = { '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4', '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9' }
  const amountMatch = question.match(/[0-9\u0660-\u0669]+(?:[.,\u066b][0-9\u0660-\u0669]{1,2})?/u)
  const amount = amountMatch?.[0]
    ? [...amountMatch[0]].map((character) => arabicDigits[character] ?? character).join('').replace(/[\u066b,]/g, '.')
    : null
  const employeeNumberMatch = /\b[A-Z]{2,}[\s-]?\d{2,}\b/iu.exec(question)
  const personMatch = employeeNumberMatch ? null : /(?:\u0644\u0644\u0645\u0648\u0638\u0641\s+|\u0644)([\p{L}]+)/u.exec(question)
  const reasonMatch = /\u0628\u0633\u0628\u0628\s+(.+)$/u.exec(question)
  return {
    personName: personMatch?.[1] ?? null,
    employeeNumber: employeeNumberMatch?.[0]?.replace(/\s/g, '') ?? null,
    amount,
    text: reasonMatch?.[1]?.trim() || null,
  }
}

/** Resolve a requested payroll month before the action is proposed. */
function payrollRunInstruction(question: string): { startDate: string | null } | null {
  const normalized = normalize(question)
  const namesPayroll = normalized.includes('payroll') || normalized.includes('\u0631\u0648\u0627\u062a\u0628')
  const isCommand = [
    'run', 'calculate', 'prepare',
    '\u0634\u063a\u0644', '\u0627\u062d\u0633\u0628', '\u062c\u0647\u0632',
  ].some((term) => normalized.includes(term))
  if (!namesPayroll || !isCommand) return null

  const timing = reportTiming(normalized)
  if (timing.period === 'calendarMonth' && timing.month) {
    const year = timing.year ?? new Date().getFullYear()
    return { startDate: `${year}-${String(timing.month).padStart(2, '0')}-01` }
  }
  return { startDate: null }
}

/**
 * Payroll audit and approval are commands, whereas a request to *see* the
 * audit stays a read-only Payroll Agent question.  The imperative/resource
 * pair is enough to skip the intent-model round trip; the action resolver
 * still extracts the payroll month and the normal confirmation gate remains.
 */
function payrollLifecycleInstruction(question: string): Extract<CopilotAction, 'auditPayroll' | 'approvePayroll'> | null {
  const normalized = normalize(question)
  const namesPayroll = normalized.includes('payroll') || normalized.includes('\u0631\u0648\u0627\u062a\u0628') || normalized.includes('\u0631\u0627\u062a\u0628')
  if (!namesPayroll || !IMPERATIVE_PREFIX.test(normalized)) return null

  if (includesAny(normalized, ['audit', '\u062f\u0642\u0642', '\u062a\u062f\u0642\u064a\u0642'])) return 'auditPayroll'
  if (includesAny(normalized, ['approve', '\u0627\u0639\u062a\u0645\u062f', '\u0648\u0627\u0641\u0642'])) return 'approvePayroll'
  return null
}

type ScoredExample = { example: TrainingExample; score: number }

function bestExample(question: string, role: Role, kind?: TrainingRoute['kind']): ScoredExample | null {
  const candidates = EXAMPLES.filter((example) => allowedForRole(example, role) && (!kind || example.route.kind === kind))
    .map((example) => ({ example, score: relevance(question, example, role) }))
    .filter((hit) => hit.score >= 0.4)
    .sort((a, b) => b.score - a.score || a.example.id.localeCompare(b.example.id))
  return candidates[0] ?? null
}

/**
 * Offline classifier used only when no AI key is available.  Its output is the
 * same closed plan the hosted classifier produces, so the normal intent gate
 * and the hand-written SQL remain in charge of data access.
 */
export function localTrainingPlan(question: string, role: Role, onSource?: (source: 'deterministic' | 'training') => void): CopilotPlan | null {
  if (maintainedHelpDecision(question, role).kind === 'abstain') return null
  // Optional provenance only; it does not affect matching, ordering or permissions.
  onSource?.('deterministic')
  if (deterministicReadDecision(question).kind === 'abstain') return null
  const read = deterministicReadPlan(question, role)
  if (read) return read

  if (salaryContractInstruction(question)) {
    return mayDo(role, 'setSalary')
      ? emptyQuestionPlan('doAction', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  if (payrollAdjustmentInstruction(question)) {
    return mayDo(role, 'createPayrollAdjustment')
      ? emptyQuestionPlan('doAction', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  if (payrollRunInstruction(question)) {
    return mayDo(role, 'runPayroll')
      ? emptyQuestionPlan('doAction', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  const payrollLifecycle = payrollLifecycleInstruction(question)
  if (payrollLifecycle) {
    return mayDo(role, payrollLifecycle)
      ? emptyQuestionPlan('doAction', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  const employeeLookup = employeeFileLookup(question)
  if (employeeLookup) {
    return mayDo(role, 'openEmployeeFile')
      ? emptyQuestionPlan('doAction', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  const namedAttendance = namedEmployeeAttendancePlan(question, role)
  if (namedAttendance) return namedAttendance

  const namedPayroll = namedEmployeePayrollPlan(question, role)
  if (namedPayroll) return namedPayroll

  const payrollAgent = payrollAgentPlan(question, role)
  if (payrollAgent) return payrollAgent

  const payrollAudit = payrollAuditPlan(question, role)
  if (payrollAudit) return payrollAudit

  const comparison = departmentAbsencePlan(question, role)
  if (comparison) return comparison

  const report = reportPlan(question, role)
  if (report) return report

  /*
   * A high-confidence imperative/resource pair is enough to know this is an
   * instruction.  The second resolver still extracts its changing details,
   * and `mayDo` keeps the same capability boundary as the hosted classifier.
   */
  const commonAction = commonActionInstruction(question)
  if (commonAction) {
    return mayDo(role, commonAction)
      ? emptyQuestionPlan('doAction', null, null)
      : emptyQuestionPlan('outOfScope', null, 'notPermitted')
  }

  onSource?.('training')
  const hit = bestExample(question, role)
  if (!hit) return null
  if (hit.example.route.kind === 'action') return emptyQuestionPlan('doAction', null, null)
  return emptyQuestionPlan(
    hit.example.route.intent,
    hit.example.route.reportType ?? null,
    hit.example.route.refusal ?? null,
  )
}

/** Offline second pass for familiar instructions; missing details still open the normal form. */
export function localTrainingAction(question: string, role: Role): CopilotActionPlan | null {
  const scrollTarget = scrollTargetFromInstruction(question)
  if (scrollTarget && mayDo(role, 'scrollPage')) return { ...emptyActionPlan('scrollPage'), scrollTarget }

  const employeeLookup = employeeFileLookup(question)
  if (employeeLookup && mayDo(role, 'openEmployeeFile')) {
    return { ...emptyActionPlan('openEmployeeFile'), ...employeeLookup }
  }

  if (salaryContractInstruction(question) && mayDo(role, 'setSalary')) return emptyActionPlan('setSalary')

  const payrollAdjustmentKind = payrollAdjustmentInstruction(question)
  if (payrollAdjustmentKind && mayDo(role, 'createPayrollAdjustment')) {
    return { ...emptyActionPlan('createPayrollAdjustment'), payrollAdjustmentKind, ...payrollAdjustmentDetails(question) }
  }

  const payrollRun = payrollRunInstruction(question)
  if (payrollRun && mayDo(role, 'runPayroll')) {
    return { ...emptyActionPlan('runPayroll'), startDate: payrollRun.startDate }
  }

  const hit = bestExample(question, role, 'action')
  if (!hit || hit.example.route.kind !== 'action') return null
  return emptyActionPlan(hit.example.route.action)
}

/**
 * Scores the approved training phrases locally.  It never sends the whole
 * training set to a provider, and the source role only breaks a tie between
 * equally similar wording; it never grants an ability.
 */
function relevance(question: string, example: TrainingExample, role: Role): number {
  const normalized = normalize(question)
  if (!normalized || !example.normalized) return 0
  if (normalized === example.normalized) return 10

  const questionTokens = tokensFor(question)
  if (!questionTokens.length || !example.tokens.length) return 0
  const common = questionTokens.filter((token) => example.tokens.includes(token)).length
  if (!common) return 0

  const sourceRoleMatches = example.sourceRole === role ? 0.03 : 0
  const phraseBonus = example.normalized.includes(normalized) || normalized.includes(example.normalized) ? 0.4 : 0
  return common / Math.sqrt(questionTokens.length * example.tokens.length) + phraseBonus + sourceRoleMatches
}

function nearest(question: string, role: Role, kind: TrainingRoute['kind'], limit: number): TrainingExample[] {
  return EXAMPLES.filter((example) => example.route.kind === kind && allowedForRole(example, role))
    .map((example) => ({ example, score: relevance(question, example, role) }))
    .filter((hit) => hit.score >= 0.2)
    .sort((a, b) => b.score - a.score || a.example.id.localeCompare(b.example.id))
    .slice(0, limit)
    .map((hit) => hit.example)
}

/** Examples for the question classifier.  Actions are shown as the one safe `doAction` intent. */
export function questionTrainingExamples(question: string, role: Role, limit = 10): QuestionTrainingExample[] {
  const intents = nearest(question, role, 'intent', limit)
  const actions = nearest(question, role, 'action', limit)

  return [...intents, ...actions]
    .map((example): QuestionTrainingExample => {
      if (example.route.kind === 'action') {
        return { text: example.text, intent: 'doAction', reportType: null, refusal: null }
      }
      return {
        text: example.text,
        intent: example.route.intent,
        reportType: example.route.reportType ?? null,
        refusal: example.route.refusal ?? null,
      }
    })
    .slice(0, limit)
}

/** Examples for the second, action-only classifier. */
export function actionTrainingExamples(question: string, role: Role, limit = 8): ActionTrainingExample[] {
  return nearest(question, role, 'action', limit).map((example) => {
    if (example.route.kind !== 'action') throw new Error('Action training example expected')
    return { text: example.text, action: example.route.action }
  })
}
