import type { Shift } from '@hr/shared'

/**
 * Presentation helpers only.
 *
 * Deciding whether an arrival counts as late, and summing a month, now happen on
 * the server — it owns the clock, and a browser's is the employee's own. What is
 * left here is what a card needs to *draw* the day it was handed.
 */

/** The scheduled start of the shift on a given day. */
export function shiftStart(date: Date, shift: Shift) {
  const d = new Date(date)
  d.setHours(shift.startHour, shift.startMinute, 0, 0)
  return d
}

/** The scheduled end of the shift on a given day. */
export function shiftEnd(date: Date, shift: Shift) {
  const d = new Date(date)
  d.setHours(shift.endHour, shift.endMinute, 0, 0)
  return d
}

/** Minutes past the scheduled start, 0 when the employee arrived early or on time. */
export function lateMinutes(checkIn: Date, shift: Shift) {
  const diff = checkIn.getTime() - shiftStart(checkIn, shift).getTime()
  return Math.max(0, Math.round(diff / 60_000))
}

/** Milliseconds worked; an open shift is measured up to `now`. */
export function workedMs(day: { checkIn: Date | null; checkOut: Date | null }, now = Date.now()) {
  if (!day.checkIn) return 0
  return Math.max(0, (day.checkOut?.getTime() ?? now) - day.checkIn.getTime())
}
