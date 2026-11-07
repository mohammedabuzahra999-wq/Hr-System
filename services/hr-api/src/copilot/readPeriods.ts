import type { CopilotPlan } from '@hr/shared'

export type ReadPeriod = Pick<CopilotPlan, 'period' | 'month' | 'year'>
export function foldRead(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[\u064b-\u065f\u0670]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي').replace(/ة/gu, 'ه').replace(/\s+/gu, ' ').trim()
}
const months = [
  ['january', 'jan', 'يناير', 'كانون الثاني'], ['february', 'feb', 'فبراير', 'شباط'],
  ['march', 'mar', 'مارس', 'آذار', 'اذار'], ['april', 'apr', 'أبريل', 'ابريل', 'نيسان'],
  ['may', 'مايو', 'أيار', 'ايار'], ['june', 'jun', 'يونيو', 'حزيران'],
  ['july', 'jul', 'يوليو', 'تموز'], ['august', 'aug', 'أغسطس', 'اغسطس', 'آب', 'اب'],
  ['september', 'sep', 'sept', 'سبتمبر', 'أيلول', 'ايلول'], ['october', 'oct', 'أكتوبر', 'اكتوبر', 'تشرين الأول'],
  ['november', 'nov', 'نوفمبر', 'تشرين الثاني'], ['december', 'dec', 'ديسمبر', 'كانون الأول'],
] as const
const relative: readonly [RegExp, CopilotPlan['period']][] = [
  [/^(?:today|اليوم)$/, 'today'], [/^(?:this week|هذا الاسبوع|هالاسبوع)$/, 'thisWeek'],
  [/^(?:this month|هذا الشهر|هالشهر|الشهر الحالي)$/, 'thisMonth'],
  [/^(?:last month|previous month|الشهر الماضي|الشهر السابق)$/, 'lastMonth'],
  [/^(?:this year|هذه السنه|هاي السنه|السنه الحاليه)$/, 'thisYear'],
  [/^(?:last (?:six|6) months|اخر (?:6|سته) (?:اشهر|شهور))$/, 'lastSixMonths'],
]
function periodValue(value: string): ReadPeriod | null {
  const text = foldRead(value).replace(/^the /u, '').replace(/[٠-٩]/gu, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const match = relative.find(([pattern]) => pattern.test(text))
  if (match) return { period: match[1], month: null, year: null }
  const numbered = /^(?:month|شهر|الشهر)\s+(\d{1,2})(?:\s+(?:(?:of|in|من|سنه|year)\s+)?(\d{4}))?$/u.exec(text)
  if (numbered) {
    const month = Number(numbered[1]), year = numbered[2] ? Number(numbered[2]) : null
    return month >= 1 && month <= 12 && (year === null || year >= 2000 && year <= 2100)
      ? { period: 'calendarMonth', month, year } : null
  }
  const named = /^(?:(?:month|شهر|الشهر)\s+)?(.+?)(?:\s+(?:(?:of|in|من|سنه|year)\s+)?(\d{4}))?$/u.exec(text)
  const index = named ? months.findIndex(aliases => aliases.some(name => foldRead(name) === named[1])) : -1
  const year = named?.[2] ? Number(named[2]) : null
  return index >= 0 && (year === null || year >= 2000 && year <= 2100)
    ? { period: 'calendarMonth', month: index + 1, year } : null
}

/** Only a single complete suffix is consumed. Remaining words must still match
 * the entire read grammar, so unsupported/compound time ranges cannot vanish.
 * No wall-clock dates are calculated here; lastWeek has no current plan value.
 */
export function readPeriodSuffix(text: string): { body: string; timing: ReadPeriod; unsupported: boolean } {
  const words = text.split(/\s+/u)
  for (let i = 0; i < words.length; i++) {
    let suffix = words.slice(i).join(' ')
    const prefix = /^(?:in|for|during|في|خلال|لشهر|للشهر)\s+/iu.exec(suffix)
    if (prefix) suffix = suffix.slice(prefix[0].length)
    // "لشهر" is a calendar-month marker, not a generic preposition.
    if (prefix && ['لشهر', 'للشهر'].includes(foldRead(prefix[0]).trim())) suffix = 'شهر ' + suffix
    const timing = periodValue(suffix)
    if (timing) {
      // Bare English month names can be names; require an explicit preposition
      // or month marker. Relative periods and numbered months need no marker.
      const normalized = foldRead(suffix)
      const namedEnglish = months.some(aliases => aliases.some(name => /^[a-z]+$/u.test(name)
        && new RegExp(`^${name}(?: \\d{4})?$`, 'u').test(normalized)))
      if (namedEnglish && !prefix) continue
      return { body: words.slice(0, i).join(' ').trim(), timing, unsupported: false }
    }
  }
  return { body: text, timing: { period: null, month: null, year: null }, unsupported:
    /\b(?:last week|previous week|yesterday|tomorrow|next week|next month|last year)\b|الاسبوع الماضي|الاسبوع السابق|امس|بكرا|غدا|السنه الماضيه/u.test(foldRead(text)) }
}
