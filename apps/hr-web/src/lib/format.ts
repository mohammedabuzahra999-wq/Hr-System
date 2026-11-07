/**
 * Locale-aware formatting. Nothing here hard-codes a language: the current
 * locales come from the i18n provider, which builds one set of formatters per
 * language and hands them to components as `fmt`.
 */

export interface Locales {
  date: string
  time: string
  number: string
}

/**
 * Dates arrive from the API as ISO strings and from local state as Date objects.
 * Every formatter accepts either, so a component never has to remember which one
 * it is holding.
 */
export type DateLike = Date | string

export interface Formatters {
  /** 08:32 AM */
  time(d: DateLike): string
  /** 16 Sep 2026 */
  date(d: DateLike): string
  /** Wednesday, 16 September */
  dayDate(d: DateLike): string
  /** September 2026 */
  monthYear(d: DateLike): string
  /** Sep */
  shortMonth(d: DateLike): string
  /** 16 */
  dayNumber(d: DateLike): string
  /** Wed */
  weekdayShort(d: DateLike): string
  /** JOD 1,250.00 */
  money(amount: number, currency: string): string
  number(n: number): string
  /** 2.4 MB — `Intl` picks the unit's name and the digits for the locale. */
  bytes(n: number): string
  /**
   * "2 h ago" / "yesterday". Returns null under a minute so the caller can use
   * its own "Just now" wording, which reads better than "this minute".
   */
  relative(d: DateLike): string | null
}

/**
 * `YYYY-MM-DD` is parsed as local midnight, not UTC.
 *
 * `new Date('2026-09-17')` is UTC midnight, which renders as the 16th anywhere
 * west of Greenwich — a calendar day must not shift because of the reader's zone.
 */
export function toDate(value: DateLike): Date {
  if (value instanceof Date) return value
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  return new Date(value)
}

/** 8h 32m as parts, so the caller can join them with translated units. */
export function splitDuration(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 }
}

export function createFormatters(locales: Locales): Formatters {
  const time = new Intl.DateTimeFormat(locales.time, { hour: '2-digit', minute: '2-digit' })
  const date = new Intl.DateTimeFormat(locales.date, { day: 'numeric', month: 'short', year: 'numeric' })
  const dayDate = new Intl.DateTimeFormat(locales.date, { weekday: 'long', day: 'numeric', month: 'long' })
  const monthYear = new Intl.DateTimeFormat(locales.date, { month: 'long', year: 'numeric' })
  const shortMonth = new Intl.DateTimeFormat(locales.date, { month: 'short' })
  const dayNumber = new Intl.DateTimeFormat(locales.number, { day: 'numeric' })
  const weekdayShort = new Intl.DateTimeFormat(locales.date, { weekday: 'short' })
  const number = new Intl.NumberFormat(locales.number)
  const relative = new Intl.RelativeTimeFormat(locales.date, { numeric: 'auto' })
  const moneyCache = new Map<string, Intl.NumberFormat>()

  return {
    time: (d) => time.format(toDate(d)),
    date: (d) => date.format(toDate(d)),
    dayDate: (d) => dayDate.format(toDate(d)),
    monthYear: (d) => monthYear.format(toDate(d)),
    shortMonth: (d) => shortMonth.format(toDate(d)),
    dayNumber: (d) => dayNumber.format(toDate(d)),
    weekdayShort: (d) => weekdayShort.format(toDate(d)),
    number: (n) => number.format(n),
    bytes(n) {
      // Kilobyte and megabyte are the units people recognise on a file; anything
      // smaller reads as noise, so bytes round up to 1 KB rather than showing raw.
      const mb = n / (1024 * 1024)
      if (mb >= 1) {
        return new Intl.NumberFormat(locales.number, {
          style: 'unit',
          unit: 'megabyte',
          maximumFractionDigits: 1,
        }).format(mb)
      }
      return new Intl.NumberFormat(locales.number, {
        style: 'unit',
        unit: 'kilobyte',
        maximumFractionDigits: 0,
      }).format(Math.max(1, Math.round(n / 1024)))
    },
    money(amount, currency) {
      let f = moneyCache.get(currency)
      if (!f) {
        f = new Intl.NumberFormat(locales.number, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        moneyCache.set(currency, f)
      }
      return f.format(amount)
    },
    relative(value) {
      const d = toDate(value)
      const minutes = Math.round((Date.now() - d.getTime()) / 60000)
      if (minutes < 1) return null
      if (minutes < 60) return relative.format(-minutes, 'minute')
      const hours = Math.round(minutes / 60)
      if (hours < 24) return relative.format(-hours, 'hour')
      return relative.format(-Math.round(hours / 24), 'day')
    },
  }
}
