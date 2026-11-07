import type { CopilotPlan } from '@hr/shared'
import type { ReadClarification } from './conversation.js'
import { EMPTY_PLAN } from './phrasebook.js'
import { foldRead, readPeriodSuffix, type ReadPeriod } from './readPeriods.js'
import type { ReadRule } from './readRules.js'

/** Only interpret an owner-only reply when the server has actually asked for it.
 * Whole-message matching keeps new instructions and role claims out of the slot.
 * Plans still pass shared validation, the current role gate and scoped SQL.
 */
export function resolveReadClarification(question: string, pending: ReadClarification):
  | { kind: 'resolved'; plan: CopilotPlan; routingRule: ReadRule }
  | { kind: 'needsScope'; timing: ReadPeriod }
  | null {
  const text = foldRead(question).replace(/[?؟!.]+$/u, '').trim()
    .replace(/^(?:طيب|طب|قصدي|اقصد|يعني|i mean)\s+/u, '')
  const parsed = readPeriodSuffix(text)
  if (parsed.unsupported) return null
  if (!parsed.body && parsed.timing.period !== null) return { kind: 'needsScope', timing: parsed.timing }
  const owner = parsed.body
  let intent: CopilotPlan['intent']
  let routingRule: ReadRule
  if (/^(?:انا|الي|لي|نفسي|حضوري(?: انا)?|دوامي(?: انا)?|سجلي(?: الشخصي| انا)?|الحضور تبعي|me|mine|myself|my own|my attendance)$/u.test(owner)) {
    intent = 'myAttendance'; routingRule = 'self_attendance'
  } else if (/^(?:فريقي|فريق عملي|الفريق|للفريق|حضور فريقي|my team|my direct reports|my team attendance)$/u.test(owner)) {
    intent = 'teamAttendance'; routingRule = 'team_attendance'
  } else if (/^(?:الشركه|للشركه|كل الشركه|الموظفين|كل الموظفين|حضور الشركه|the company|company|all employees|company attendance)$/u.test(owner)) {
    intent = 'orgAttendance'; routingRule = 'company_attendance'
  } else return null
  const timing = parsed.timing.period === null ? pending.timing : parsed.timing
  return { kind: 'resolved', plan: { ...EMPTY_PLAN, intent, ...timing }, routingRule }
}

/** An understood read can be empty; say which scope and period were searched. */
export function emptyAttendanceSentence(plan: CopilotPlan, period: { en: string; ar: string } | null) {
  const owner = plan.intent === 'myAttendance' ? { en: 'you', ar: 'إلك' }
    : plan.intent === 'teamAttendance' ? { en: 'your team', ar: 'لفريقك' }
    : plan.intent === 'orgAttendance' ? { en: 'the company', ar: 'للشركة' } : null
  if (!owner) return { en: '', ar: '' }
  const next = plan.period === null || plan.period === 'thisMonth' || plan.period === 'today'
    ? { en: 'You can ask about another period, such as “last month”.', ar: 'بتقدر تطلب فترة ثانية، مثل «الشهر الماضي».' }
    : { en: 'You can ask about another period.', ar: 'بتقدر تطلب فترة ثانية.' }
  return {
    en: `There are no attendance records for ${owner.en} for ${period?.en ?? 'the requested period'}. ${next.en}`,
    ar: `ما في سجلات حضور ${owner.ar} خلال ${period?.ar ?? 'الفترة المطلوبة'}. ${next.ar}`,
  }
}
