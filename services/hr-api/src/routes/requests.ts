import { aliasedTable, and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  createLeaveRequestSchema,
  createSimpleRequestSchema,
  decideRequestSchema,
  requestFilterSchema,
  type CreateLeaveRequestInput,
  type CreateSimpleRequestInput,
  type DecideRequestInput,
  type RequestFilter,
} from '@hr/shared'
import { db } from '../db/client.js'
import { attendanceDays, requests, users } from '../db/schema.js'
import { holidaySet } from '../domain/attendance.js'
import { balanceFor, consumeBalance, validateLeaveRequest } from '../domain/leave.js'
import { notify } from '../domain/notify.js'
import { eachDay, isWorkingDay } from '../domain/workdays.js'
import { toRequest } from '../mappers.js'
import { requireAuth, requireRole, validateBody, validateQuery, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { publish } from '../realtime/bus.js'

export const requestRoutes = new Hono<AppEnv>()

requestRoutes.use('*', requireAuth)

const decider = aliasedTable(users, 'decider')

type UserRow = typeof users.$inferSelect

/**
 * The joined row, named rather than inferred.
 *
 * Drizzle's builder generics plus Hono's accumulating route types push this file
 * past TypeScript's instantiation budget, and the inferred element silently
 * collapses to `never`. Annotating the result keeps the types honest and cuts
 * the work the checker has to do.
 */
interface RequestRow {
  request: typeof requests.$inferSelect
  employee: UserRow
  decider: UserRow | null
}

/**
 * Joins the employee and the decider so a row renders without a second trip.
 * `$dynamic` lets each caller add its own `where` without losing the row type.
 */
const selectRequests = () =>
  db
    .select({ request: requests, employee: users, decider })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.userId))
    .leftJoin(decider, eq(decider.id, requests.decidedBy))
    .$dynamic()

requestRoutes.get('/me', validateQuery(requestFilterSchema), async (c) => {
  const user = c.get('user')
  const filter = c.get('query') as RequestFilter

  const rows: RequestRow[] = await selectRequests()
    .where(
      and(
        eq(requests.userId, user.id),
        filter.status ? eq(requests.status, filter.status) : undefined,
        filter.kind ? eq(requests.kind, filter.kind) : undefined,
      ),
    )
    .orderBy(desc(requests.submittedAt))

  return c.json({
    requests: rows.map((r) => toRequest(r.request, r.employee, r.decider)),
    balance: await balanceFor(user.id),
  })
})

/**
 * The inbox for whoever decides. A manager sees their own reports' requests; HR
 * and admin see everyone's. Scope comes from the session, never a parameter.
 */
requestRoutes.get('/inbox', requireRole(...allowed('viewRequests')), validateQuery(requestFilterSchema), async (c) => {
  const user = c.get('user')
  const filter = c.get('query') as RequestFilter

  const scope =
    user.role === 'manager'
      ? await db.select({ id: users.id }).from(users).where(eq(users.managerId, user.id))
      : null

  const rows: RequestRow[] = await selectRequests()
    .where(
      and(
        scope ? inArray(requests.userId, scope.length ? scope.map((s) => s.id) : ['']) : undefined,
        filter.status ? eq(requests.status, filter.status) : undefined,
        filter.kind ? eq(requests.kind, filter.kind) : undefined,
      ),
    )
    .orderBy(desc(requests.submittedAt))

  return c.json({ requests: rows.map((r) => toRequest(r.request, r.employee, r.decider)) })
})

requestRoutes.post('/leave', validateBody(createLeaveRequestSchema), async (c) => {
  const user = c.get('user')
  const input = c.get('body') as CreateLeaveRequestInput
  const holidays = await holidaySet()

  const check = await validateLeaveRequest(user.id, input.type, input.from, input.to, holidays)
  if (!check.ok) {
    throw new HTTPException(422, {
      res: c.json({ error: 'leaveRejected', message: check.problem.code, problem: check.problem }, 422),
    })
  }

  const [row] = await db
    .insert(requests)
    .values({
      userId: user.id,
      kind: 'leave',
      status: 'pending',
      leaveType: input.type,
      leaveFrom: input.from,
      leaveTo: input.to,
      leaveDays: check.days,
      reason: input.reason ?? null,
    })
    .returning()

  await notify(user.id, 'notif.leaveSent')
  publish(
    { type: 'request.created', requestId: row!.id, userId: user.id, at: row!.submittedAt.toISOString() },
    { kind: 'supervisors', userId: user.id },
  )

  const employee = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  return c.json(toRequest(row!, employee[0]!, null), 201)
})

requestRoutes.post('/simple', validateBody(createSimpleRequestSchema), async (c) => {
  const user = c.get('user')
  const input = c.get('body') as CreateSimpleRequestInput

  const [row] = await db
    .insert(requests)
    .values({ userId: user.id, kind: input.kind, status: 'pending', reason: input.reason ?? null })
    .returning()

  publish(
    { type: 'request.created', requestId: row!.id, userId: user.id, at: row!.submittedAt.toISOString() },
    { kind: 'supervisors', userId: user.id },
  )

  const employee = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  return c.json(toRequest(row!, employee[0]!, null), 201)
})

/** Withdrawing your own request. Only while it is still pending. */
requestRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const rows = await db.select().from(requests).where(eq(requests.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw new HTTPException(404, { message: 'requestNotFound' })
  if (row.userId !== user.id) throw new HTTPException(403, { message: 'forbidden' })
  if (row.status !== 'pending') throw new HTTPException(409, { message: 'requestNotPending' })

  const [updated] = await db
    .update(requests)
    .set({ status: 'cancelled', decidedAt: new Date() })
    .where(eq(requests.id, id))
    .returning()

  if (row.kind === 'leave' && row.leaveFrom && row.leaveTo) {
    await notify(user.id, 'notif.leaveCancelled', { from: String(row.leaveFrom), to: String(row.leaveTo) })
  }
  publish(
    { type: 'request.decided', requestId: id, userId: user.id, status: 'cancelled', at: new Date().toISOString() },
    { kind: 'supervisors', userId: user.id },
  )

  const employee = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  return c.json(toRequest(updated!, employee[0]!, null))
})

/**
 * Approving or rejecting.
 *
 * The employee's own manager decides, and nobody else — not HR, not an
 * administrator. They both read this queue and both see whether the person is in
 * today, but the decision is the line manager's to make and to answer for.
 *
 * Approved leave both spends the balance and writes the days into attendance, so
 * the month summary shows "on leave" rather than a run of absences — the two
 * views cannot disagree because one write produces both.
 */
requestRoutes.post('/:id/decide', requireRole(...allowed('decideRequests')), validateBody(decideRequestSchema), async (c) => {
  const decidedBy = c.get('user')
  const id = c.req.param('id')
  const { decision, note } = c.get('body') as DecideRequestInput

  const rows = await db.select().from(requests).where(eq(requests.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw new HTTPException(404, { message: 'requestNotFound' })
  if (row.status !== 'pending') throw new HTTPException(409, { message: 'requestNotPending' })

  // A manager may only decide for their own reports.
  if (decidedBy.role === 'manager') {
    const target = await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, row.userId)).limit(1)
    if (target[0]?.managerId !== decidedBy.id) throw new HTTPException(403, { message: 'forbidden' })
  }

  const now = new Date()
  const [updated] = await db
    .update(requests)
    .set({ status: decision, decidedAt: now, decidedBy: decidedBy.id, decisionNote: note ?? null })
    .where(eq(requests.id, id))
    .returning()

  if (decision === 'approved' && row.kind === 'leave' && row.leaveType && row.leaveFrom && row.leaveTo) {
    await consumeBalance(row.userId, row.leaveType, row.leaveDays ?? 0)

    const holidays = await holidaySet()
    const days = eachDay(String(row.leaveFrom), String(row.leaveTo)).filter((d) => isWorkingDay(d, holidays))
    if (days.length > 0) {
      await db
        .insert(attendanceDays)
        .values(days.map((workDate) => ({ userId: row.userId, workDate, status: 'leave' as const })))
        .onConflictDoUpdate({
          target: [attendanceDays.userId, attendanceDays.workDate],
          set: { status: 'leave', updatedAt: now },
        })
    }

    await notify(row.userId, 'notif.leaveApproved', {
      from: String(row.leaveFrom),
      to: String(row.leaveTo),
    })
  } else if (decision === 'rejected') {
    await notify(row.userId, 'notif.leaveRejected')
  }

  publish(
    { type: 'request.decided', requestId: id, userId: row.userId, status: decision, at: now.toISOString() },
    { kind: 'supervisors', userId: row.userId },
  )

  const [employee, deciderRow] = await Promise.all([
    db.select().from(users).where(eq(users.id, row.userId)).limit(1),
    db.select().from(users).where(eq(users.id, decidedBy.id)).limit(1),
  ])

  return c.json(toRequest(updated!, employee[0]!, deciderRow[0] ?? null))
})
