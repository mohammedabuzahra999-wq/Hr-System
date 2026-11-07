import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import type { AttendanceDay, AttendanceSummary, Shift } from '@hr/shared'
import { db } from '../db/client.js'
import { attendanceDays, publicHolidays, shifts } from '../db/schema.js'
import { toAttendanceDay, toShift } from '../mappers.js'
import { dayKey, eachDay, isHoliday, isWeekend, startOfMonth, workedMs } from './workdays.js'

const DEFAULT_SHIFT: Shift = {
  startHour: 8,
  startMinute: 30,
  endHour: 17,
  endMinute: 30,
  graceMinutes: 10,
}

/** A per-employee shift row wins; otherwise the row with no user is the org default. */
export async function shiftFor(userId: string): Promise<Shift> {
  const rows = await db.select().from(shifts)
  const mine = rows.find((r) => r.userId === userId)
  if (mine) return toShift(mine)
  const fallback = rows.find((r) => r.userId === null)
  return fallback ? toShift(fallback) : DEFAULT_SHIFT
}

export async function holidaySet(): Promise<Set<string>> {
  const rows = await db.select({ d: publicHolidays.holidayDate }).from(publicHolidays)
  return new Set(rows.map((r) => (typeof r.d === 'string' ? r.d : dayKey(r.d))))
}

/**
 * The month so far, as a dense series.
 *
 * Days with no row are filled in as weekend, holiday, or absent, so a gap in the
 * table is never mistaken for a day that did not exist. Today is included only
 * once it has a check-in — opening the app is not attendance.
 */
export async function monthToDate(userId: string, today = dayKey(new Date())): Promise<AttendanceDay[]> {
  return attendanceBetween(userId, startOfMonth(today), today)
}

/**
 * The same, over any span of dates.
 *
 * Split out because the assistant can be asked about last month, and was
 * answering with this month's figures under last month's heading — the plan
 * carried the period and the query ignored it. A range is what the question
 * actually has, so a range is what this takes.
 *
 * `today` stays a separate notion from the end of the range: the rule that an
 * unrecorded today is not yet an absence is about today, not about whichever day
 * a span happens to stop on. For a span that ended in the past, every missing
 * working day counts.
 */
export async function attendanceBetween(
  userId: string,
  first: string,
  last: string,
  today = dayKey(new Date()),
): Promise<AttendanceDay[]> {
  const [rows, holidays] = await Promise.all([
    db
      .select()
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.userId, userId),
          gte(attendanceDays.workDate, first),
          lte(attendanceDays.workDate, last),
        ),
      ),
    holidaySet(),
  ])

  const byDate = new Map(rows.map((r) => [typeof r.workDate === 'string' ? r.workDate : dayKey(r.workDate), r]))

  return eachDay(first, last).flatMap((day): AttendanceDay[] => {
    const row = byDate.get(day)
    if (row) return [toAttendanceDay(row)]
    if (isWeekend(day)) return [{ date: day, checkIn: null, checkOut: null, status: 'weekend' }]
    if (isHoliday(day, holidays)) return [{ date: day, checkIn: null, checkOut: null, status: 'holiday' }]
    // Today with nothing recorded yet is not an absence — it has not finished.
    if (day === today) return []
    return [{ date: day, checkIn: null, checkOut: null, status: 'absent' }]
  })
}

export function summarize(days: AttendanceDay[]): AttendanceSummary {
  const totals: AttendanceSummary = {
    present: 0,
    late: 0,
    absent: 0,
    leave: 0,
    worked: 0,
    totalMs: 0,
    averageMs: 0,
  }

  for (const day of days) {
    if (day.status === 'present') totals.present += 1
    else if (day.status === 'late') totals.late += 1
    else if (day.status === 'absent') totals.absent += 1
    else if (day.status === 'leave') totals.leave += 1

    if (day.status === 'present' || day.status === 'late') {
      totals.worked += 1
      totals.totalMs += workedMs(
        day.checkIn ? new Date(day.checkIn) : null,
        day.checkOut ? new Date(day.checkOut) : null,
      )
    }
  }

  totals.averageMs = totals.worked ? Math.round(totals.totalMs / totals.worked) : 0
  return totals
}

/** Today's stored row, or a blank day when nothing has been recorded. */
export async function todayFor(userId: string, holidays: ReadonlySet<string>): Promise<AttendanceDay> {
  const today = dayKey(new Date())
  const rows = await db
    .select()
    .from(attendanceDays)
    .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, today)))
    .limit(1)

  const row = rows[0]
  if (row) return toAttendanceDay(row)

  const status = isWeekend(today) ? 'weekend' : isHoliday(today, holidays) ? 'holiday' : 'absent'
  return { date: today, checkIn: null, checkOut: null, status }
}

/** Today's rows for a set of employees, for the manager and HR tables. */
export async function todayForMany(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, typeof attendanceDays.$inferSelect>()
  const today = dayKey(new Date())
  const rows = await db
    .select()
    .from(attendanceDays)
    .where(and(inArray(attendanceDays.userId, userIds), eq(attendanceDays.workDate, today)))
  return new Map(rows.map((r) => [r.userId, r]))
}
