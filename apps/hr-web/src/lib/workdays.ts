/**
 * Working-day arithmetic for leave and attendance.
 *
 * The working week is Sunday–Thursday, so Friday and Saturday are the weekend.
 * Leave is counted in working days: a Thursday-to-Sunday request is two days,
 * not four, and public holidays inside the range are not deducted either.
 *
 * Every helper works in local time. Date-only strings are parsed by hand
 * because `new Date('2026-09-16')` is UTC midnight, which lands on the previous
 * day — and therefore the wrong weekday — west of Greenwich.
 */

const FRIDAY = 5
const SATURDAY = 6

/** Hard stop so a mistyped year cannot spin a day-by-day loop forever. */
const MAX_RANGE_DAYS = 400

export function startOfDay(d: Date) {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Local calendar day as `YYYY-MM-DD`, usable as a map key or an <input type="date"> value. */
export function dayKey(d: Date) {
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** `YYYY-MM-DD` to local midnight, or null when the value is not a real date. */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const d = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(d.getTime()) ? null : d
}

export function isSameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b)
}

export function isWeekend(d: Date) {
  const day = d.getDay()
  return day === FRIDAY || day === SATURDAY
}

export function isHoliday(d: Date, holidays: Date[]) {
  const key = dayKey(d)
  return holidays.some((h) => dayKey(h) === key)
}

export function isWorkingDay(d: Date, holidays: Date[] = []) {
  return !isWeekend(d) && !isHoliday(d, holidays)
}

/** Every calendar day from `from` to `to` inclusive. Empty when the range is backwards. */
export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = []
  const cursor = startOfDay(from)
  const last = startOfDay(to)
  while (cursor <= last && days.length < MAX_RANGE_DAYS) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/** Working days in an inclusive range, skipping weekends and public holidays. */
export function workingDaysBetween(from: Date, to: Date, holidays: Date[] = []) {
  return eachDay(from, to).filter((d) => isWorkingDay(d, holidays)).length
}

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) {
  return startOfDay(aFrom) <= startOfDay(bTo) && startOfDay(bFrom) <= startOfDay(aTo)
}

/** Whole days from today to `d`: negative when `d` is in the past. */
export function daysUntil(d: Date, now = new Date()) {
  const diff = startOfDay(d).getTime() - startOfDay(now).getTime()
  return Math.round(diff / 86_400_000)
}
