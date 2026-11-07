import type { AttendanceStatus, Shift } from '@hr/shared'

/**
 * Calendar arithmetic for a Sunday–Thursday working week.
 *
 * Everything here works on `YYYY-MM-DD` strings rather than Date objects, so a
 * day never shifts because the server runs in a different zone from the office.
 * Only the check-in and check-out instants are true timestamps.
 */

/** Friday and Saturday, as used across the region. */
const WEEKEND_DAYS = new Set([5, 6])

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function isWeekend(key: string): boolean {
  return WEEKEND_DAYS.has(parseDay(key).getDay())
}

export function isHoliday(key: string, holidays: ReadonlySet<string>): boolean {
  return holidays.has(key)
}

export function isWorkingDay(key: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(key) && !isHoliday(key, holidays)
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  const end = parseDay(to)
  for (let d = parseDay(from); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(dayKey(d))
  }
  return out
}

/** Working days in a range — what a leave request actually costs. */
export function countWorkingDays(from: string, to: string, holidays: ReadonlySet<string>): number {
  return eachDay(from, to).filter((day) => isWorkingDay(day, holidays)).length
}

export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo
}

export function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`
}

/* ---------- shift maths ---------- */

export function shiftStart(day: string, shift: Shift): Date {
  const d = parseDay(day)
  d.setHours(shift.startHour, shift.startMinute, 0, 0)
  return d
}

export function shiftEnd(day: string, shift: Shift): Date {
  const d = parseDay(day)
  d.setHours(shift.endHour, shift.endMinute, 0, 0)
  return d
}

/** Minutes past the scheduled start; 0 when early or on time. */
export function lateMinutes(checkIn: Date, shift: Shift): number {
  const diff = checkIn.getTime() - shiftStart(dayKey(checkIn), shift).getTime()
  return Math.max(0, Math.round(diff / 60_000))
}

/** Arriving inside the grace period still counts as on time. */
export function statusForCheckIn(checkIn: Date, shift: Shift): AttendanceStatus {
  return lateMinutes(checkIn, shift) > shift.graceMinutes ? 'late' : 'present'
}

export function workedMs(checkIn: Date | null, checkOut: Date | null, now = Date.now()): number {
  if (!checkIn) return 0
  return Math.max(0, (checkOut?.getTime() ?? now) - checkIn.getTime())
}
