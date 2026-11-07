import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { MyAttendance, TeamAttendanceRow } from '@hr/shared'
import { db } from '../db/client.js'
import { attendanceDays, users } from '../db/schema.js'
import {
  holidaySet,
  monthToDate,
  shiftFor,
  summarize,
  todayFor,
  todayForMany,
} from '../domain/attendance.js'
import { dayKey, statusForCheckIn, workedMs } from '../domain/workdays.js'
import { toAttendanceDay } from '../mappers.js'
import { requireAuth, requireRole, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { publish } from '../realtime/bus.js'
import { notify } from '../domain/notify.js'

export const attendanceRoutes = new Hono<AppEnv>()

attendanceRoutes.use('*', requireAuth)

/** Everything the employee's own attendance card and month chart need. */
attendanceRoutes.get('/me', async (c) => {
  const user = c.get('user')
  const [shift, holidays] = await Promise.all([shiftFor(user.id), holidaySet()])
  const [today, month] = await Promise.all([todayFor(user.id, holidays), monthToDate(user.id)])

  const payload: MyAttendance = {
    shift,
    today,
    month,
    summary: summarize(month),
    holidays: [...holidays].sort(),
  }
  return c.json(payload)
})

/**
 * The server stamps the time.
 *
 * Nothing about `when` comes from the request: a client-supplied clock is the
 * employee's own and trivially editable, which would make the whole record
 * worthless. The unique index on (user, day) makes a double check-in a conflict
 * rather than a second row.
 */
/*
 * The gate on checking in and out admits every role, so it refuses nobody
 * today. It is here because the permissions screen states that everyone may
 * check in, and a stated rule with no gate behind it is a claim nobody checks —
 * the exact thing that screen was rewritten to stop doing. If the list ever
 * narrows, it narrows here and on the screen at once.
 */
attendanceRoutes.post('/check-in', requireRole(...allowed('recordOwnAttendance')), async (c) => {
  const user = c.get('user')
  const now = new Date()
  const today = dayKey(now)
  const shift = await shiftFor(user.id)
  const status = statusForCheckIn(now, shift)

  const existing = await db
    .select()
    .from(attendanceDays)
    .where(and(eq(attendanceDays.userId, user.id), eq(attendanceDays.workDate, today)))
    .limit(1)

  if (existing[0]?.checkIn) {
    throw new HTTPException(409, { message: 'alreadyCheckedIn' })
  }

  const [row] = await db
    .insert(attendanceDays)
    .values({ userId: user.id, workDate: today, checkIn: now, status })
    .onConflictDoUpdate({
      target: [attendanceDays.userId, attendanceDays.workDate],
      set: { checkIn: now, status, updatedAt: now },
    })
    .returning()

  const day = toAttendanceDay(row!)
  publish(
    { type: 'attendance.changed', userId: user.id, date: today, status, at: now.toISOString() },
    { kind: 'supervisors', userId: user.id },
  )

  return c.json(day)
})

attendanceRoutes.post('/check-out', requireRole(...allowed('recordOwnAttendance')), async (c) => {
  const user = c.get('user')
  const now = new Date()
  const today = dayKey(now)

  const existing = await db
    .select()
    .from(attendanceDays)
    .where(and(eq(attendanceDays.userId, user.id), eq(attendanceDays.workDate, today)))
    .limit(1)

  const row = existing[0]
  if (!row?.checkIn) throw new HTTPException(409, { message: 'notCheckedIn' })
  if (row.checkOut) throw new HTTPException(409, { message: 'alreadyCheckedOut' })

  const [updated] = await db
    .update(attendanceDays)
    .set({ checkOut: now, updatedAt: now })
    .where(eq(attendanceDays.id, row.id))
    .returning()

  publish(
    {
      type: 'attendance.changed',
      userId: user.id,
      date: today,
      status: updated!.status,
      at: now.toISOString(),
    },
    { kind: 'supervisors', userId: user.id },
  )

  return c.json(toAttendanceDay(updated!))
})

/**
 * Today across the people the caller is allowed to see: a manager sees their own
 * reports, HR and admin see everyone. The scope is derived from the session, not
 * from a query parameter.
 */
attendanceRoutes.get('/team', requireRole(...allowed('viewTeamAttendance')), async (c) => {
  const user = c.get('user')

  const people =
    user.role === 'manager'
      ? await db.select().from(users).where(eq(users.managerId, user.id))
      : await db.select().from(users).where(eq(users.isActive, true))

  const [records, holidays] = await Promise.all([
    todayForMany(people.map((p) => p.id)),
    holidaySet(),
  ])
  const today = dayKey(new Date())
  const blankStatus = holidays.has(today) ? 'holiday' : 'absent'

  const rows: TeamAttendanceRow[] = people.map((person) => {
    const record = records.get(person.id)
    return {
      userId: person.id,
      name: { en: person.fullNameEn, ar: person.fullNameAr },
      department: { en: person.departmentEn, ar: person.departmentAr },
      date: today,
      checkIn: record?.checkIn?.toISOString() ?? null,
      checkOut: record?.checkOut?.toISOString() ?? null,
      status: record?.status ?? blankStatus,
      workedMs: workedMs(record?.checkIn ?? null, record?.checkOut ?? null),
    }
  })

  return c.json({ rows })
})

/** HR nudge: remind everyone still checked in to record their departure. */
attendanceRoutes.post('/remind-checkout', requireRole(...allowed('remindCheckout')), async (c) => {
  const today = dayKey(new Date())
  const open = await db
    .select({ userId: attendanceDays.userId })
    .from(attendanceDays)
    .where(and(eq(attendanceDays.workDate, today), eq(attendanceDays.status, 'present')))

  const pending = open.filter((row) => row.userId)
  await Promise.all(pending.map((row) => notify(row.userId, 'notif.checkoutReminder')))

  return c.json({ reminded: pending.length })
})
