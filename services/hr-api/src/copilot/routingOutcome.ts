import { copilotAnswerSchema, type CopilotAnswer, type CopilotPlan, type Role, type VoiceUiContext } from '@hr/shared'
import { deterministicReadDecision, isUnscopedAttendanceRead, type ReadRule } from './readRules.js'
import { deterministicReadPlan } from './training.js'
import { foldRead, readPeriodSuffix } from './readPeriods.js'
import { maintainedHelpDecision } from '../guide/helpRouting.js'
import { EMPTY_PLAN } from './phrasebook.js'
import { validateCopilotPlan } from './validatePlan.js'
import { mayAsk } from './intents.js'
import { localConversationFollowUp } from './conversationTraining.js'

export type TerminalOutcome =
  | { kind: 'unsupportedCapability'; code: 'payslip_period_unsupported' | 'request_status_unsupported' }
  | { kind: 'needsClarification'; code: 'headcount_scope_required' | 'hr_subject_required' | 'attendance_scope_required' }
  | { kind: 'outOfScope'; code: 'external_weather' | 'external_science' }

/** Server decisions only. Providers still produce CopilotPlan, never this union. */
export type RoutingOutcome = TerminalOutcome
  | { kind: 'resolved'; plan: CopilotPlan; routingSource: 'deterministic'; routingRule: ReadRule }
  | { kind: 'unresolved' }

export interface RoutingContext {
  /** Undefined means no pending task. Values/identifiers are not needed here. */
  pendingFields?: readonly string[]
  previousPlan?: CopilotPlan | null
  ui?: VoiceUiContext | null
  path?: string
}

const unresolved = { kind: 'unresolved' } as const
// A complete independent question cannot be a date/enum/number slot answer.
// Free-text, names, titles, unknown fields and mixed slot groups always abstain.
const closedSlots = new Set(['startDate', 'endDate', 'leaveKind', 'documentKind', 'decision', 'stage', 'role',
  'employmentType', 'language', 'scrollTarget', 'amount', 'opensAt', 'durationMinutes', 'questionNumber',
  'payrollAdjustmentKind', 'jobDescriptionSection'])
function contextAllowsTerminal(context: RoutingContext): boolean {
  if (context.pendingFields && (!context.pendingFields.length || context.pendingFields.some(field => !closedSlots.has(field)))) return false
  if (context.previousPlan) return false
  if (context.ui && Object.entries(context.ui).some(([key, value]) => key !== 'currentPage' && value !== undefined)) return false
  // Only neutral landing pages. Record, document, training and other page contexts
  // can make an apparently external or deictic question relevant to HR.
  return [context.path, context.ui?.currentPage].every(path => path === undefined
    || /^\/(?:assistant|home|hr|manager|admin|dashboard)\/?$/u.test(path))
}

function terminalDecision(question: string, context: RoutingContext): TerminalOutcome | null {
  // This standalone request still needs an owner after an earlier answer or
  // a page change. Pending form content keeps its normal continuation path.
  if (!context.pendingFields && isUnscopedAttendanceRead(question)) {
    return { kind: 'needsClarification', code: 'attendance_scope_required' }
  }
  if (!contextAllowsTerminal(context)) return null
  // Quoted/document content and multi-part instructions are not independent asks.
  if (/["'“”‘’«»`\n\r;؛&]/u.test(question)) return null
  const text = foldRead(question).replace(/[?؟!.]+$/u, '').trim().replace(/^please /u, '')
  const parsed = readPeriodSuffix(text)
  const selfPay = /^(?:how much (?:did|do) i earn|what (?:was|am) i paid|how much (?:was|am) i paid|(?:show|display|list)(?: me)? my (?:payslips|pay slips|pay|salary|payroll)|(?:اعرض|ورجيني|وريني) (?:راتبي|رواتبي|كشوف رواتبي))$/u
  if (parsed.timing.period !== null && selfPay.test(parsed.body)) return { kind: 'unsupportedCapability', code: 'payslip_period_unsupported' }
  const status = '(?:awaiting approval|pending(?: approval)?|approved|rejected|cancelled|canceled)'
  if (new RegExp(`^(?:which of my requests are ${status}|(?:show|display|list)(?: me)?(?: only)? my ${status} requests|(?:show|display|list)(?: me)? my requests (?:with status |that are )${status})$`, 'u').test(text)
    || /^(?:اعرض|ورجيني|وريني) طلباتي (?:بانتظار الموافقه|المعلقه|الموافق عليها|المرفوضه)$/u.test(text)) return { kind: 'unsupportedCapability', code: 'request_status_unsupported' }
  if (/^how many (?:people|staff|employees) (?:work|are) here$/u.test(text)) return { kind: 'needsClarification', code: 'headcount_scope_required' }
  if (/^(?:what is|how is) (?:the )?(?:situation|status|state) (?:with|in|of) (?:hr|human resources)$/u.test(text)
    || /^(?:شو|ما) (?:وضع|حاله) (?:الامور )?(?:بالموارد البشريه|في الموارد البشريه|بال?hr)$/u.test(text)) return { kind: 'needsClarification', code: 'hr_subject_required' }

  // Reviewed external subject grammars, not keyword refusals or an arbitrary
  // "explain X" classifier. All remaining words must match the complete ask.
  const planet = '(?:mars|venus|jupiter|saturn|neptune|uranus|mercury|المريخ|الزهره|المشتري|زحل|نبتون|اورانوس|عطارد)'
  if (new RegExp(`^(?:what is (?:the )?weather (?:on|in) (?:planet )?${planet}|شو (?:الطقس|weather) (?:علي|على|في|on) ${planet})$`, 'u').test(text)) return { kind: 'outOfScope', code: 'external_weather' }
  if (/^(?:(?:can|could) you )?explain(?: to me)? (?:quantum mechanics|general relativity|planetary motion|photosynthesis)$/u.test(text)) return { kind: 'outOfScope', code: 'external_science' }
  return null
}

/** Pure preflight. Only terminal outcomes may return before conversation handling.
 * Resolved candidates still go through the route's shared validation/RBAC path.
 */
export function deterministicRoutingOutcome(question: string, role: Role, context: RoutingContext = {}): RoutingOutcome {
  const terminal = terminalDecision(question, context)
  if (terminal) return terminal
  const read = deterministicReadDecision(question)
  if (read.kind === 'resolved') {
    const plan = deterministicReadPlan(question, role)
    if (plan) return { kind: 'resolved', plan, routingSource: 'deterministic', routingRule: read.routingRule }
  }
  const help = maintainedHelpDecision(question, role)
  if (help.kind === 'resolved') {
    const result = validateCopilotPlan({ ...EMPTY_PLAN, intent: 'howDoI' }, 'deterministic')
    if (result.ok) return { kind: 'resolved', plan: result.plan, routingSource: 'deterministic', routingRule: 'maintained_help' }
  }
  if (!context.pendingFields && read.kind !== 'abstain' && help.kind !== 'abstain' && context.previousPlan
    && ['myAttendance', 'teamAttendance', 'orgAttendance'].includes(context.previousPlan.intent)) {
    const followUp = localConversationFollowUp(question, role, context.previousPlan)
    if (followUp) return { kind: 'resolved', plan: followUp, routingSource: 'deterministic', routingRule: 'attendance_follow_up' }
  }
  return unresolved
}

/** Fixed text only: never interpolate a question, name, record or model output. */
export function terminalAnswer(outcome: TerminalOutcome, role: Role): CopilotAnswer {
  let sentence: CopilotAnswer['sentence'] = { en: '', ar: '' }
  switch (outcome.code) {
    case 'payslip_period_unsupported':
      sentence = { en: 'Copilot cannot filter your payslips by period yet. You can ask for your recent payslips instead.',
        ar: 'المساعد لا يدعم تصفية قسائم راتبك حسب الفترة بعد. يمكنك طلب قسائم راتبك الأخيرة بدلاً من ذلك.' }; break
    case 'request_status_unsupported':
      sentence = { en: 'Copilot cannot filter your requests by approval status yet. You can ask for your recent requests instead.',
        ar: 'المساعد لا يدعم تصفية طلباتك حسب حالة الموافقة بعد. يمكنك طلب قائمة طلباتك الأخيرة بدلاً من ذلك.' }; break
    case 'headcount_scope_required':
      sentence = { en: 'Which group or location do you mean by “here”? Please name the scope you want counted.',
        ar: 'أي مجموعة أو موقع تقصد بكلمة «هنا»؟ يرجى تحديد النطاق الذي تريد معرفة عدده.' }; break
    case 'attendance_scope_required': {
      const examples = [
        { intent: 'myAttendance', en: 'mine', ar: 'حضوري' },
        { intent: 'teamAttendance', en: 'my team', ar: 'فريقي' },
        { intent: 'orgAttendance', en: 'the company', ar: 'الشركة' },
      ] as const
      const visible = examples.filter(example => mayAsk(role, example.intent))
      sentence = {
        en: `Whose attendance record do you need? You can reply: ${visible.map(example => `“${example.en}”`).join(', ')}. You can also include a period.`,
        ar: `سجل حضور مين تقصد؟ ممكن تجاوب: ${visible.map(example => `«${example.ar}»`).join('، ')}، وتحدد الفترة إذا بدك.`,
      }; break
    }
    case 'hr_subject_required': {
      const topics = [
        { intent: 'myAttendance', en: 'your attendance', ar: 'حضورك' },
        { intent: 'myLeaveBalance', en: 'your leave balance', ar: 'رصيد إجازاتك' },
        { intent: 'myRequests', en: 'your requests', ar: 'طلباتك' },
        { intent: 'myPayslips', en: 'your payslips', ar: 'قسائم راتبك' },
      ] as const
      const visible = topics.filter(topic => mayAsk(role, topic.intent))
      sentence = { en: `Which HR subject would you like to ask about? For example: ${visible.map(topic => topic.en).join(', ')}.`,
        ar: `عن أي موضوع بالموارد البشرية تريد السؤال؟ مثلاً: ${visible.map(topic => topic.ar).join('، ')}.` }; break
    }
    case 'external_weather': case 'external_science': break // existing refusal presentation
  }
  return copilotAnswerSchema.parse({ intent: 'outOfScope', sentence, result: { kind: 'none' }, periodLabel: null,
    refusal: outcome.kind === 'outOfScope' ? 'notHrData' : null, sharingOff: false })
}
