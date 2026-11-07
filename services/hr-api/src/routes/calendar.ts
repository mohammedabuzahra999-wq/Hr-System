import { aliasedTable, and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  calendarRangeSchema,
  createCalendarEventSchema,
  type CalendarEvent,
  type CalendarRange,
  type CalendarSummary,
  type CreateCalendarEventInput,
} from '@hr/shared'
import { db } from '../db/client.js'
import { calendarEvents, publicHolidays, requests, users } from '../db/schema.js'
import { countWorkingDays, dayKey, parseDay } from '../domain/workdays.js'
import { holidaySet } from '../domain/attendance.js'
import { requireAuth, requireRole, validateBody, validateQuery, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { publish } from '../realtime/bus.js'

export const calendarRoutes = new Hono<AppEnv>()

calendarRoutes.use('*', requireAuth)

const author = aliasedTable(users, 'author')

type UserRow = typeof users.$inferSelect
type EventRow = typeof calendarEvents.$inferSelect

/** Named rather than inferred, to keep this file inside TypeScript's instantiation budget. */
interface EventJoin {
  event: EventRow
  author: UserRow | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Default window: a fortnight back, two months ahead — enough to plan against. */
function windowFor(range: CalendarRange, now: number) {
  const from = range.from ? new Date(range.from) : new Date(now - 14 * DAY_MS)
  const to = range.to ? new Date(range.to) : new Date(now + 60 * DAY_MS)
  return { from, to }
}

/** A whole-day span, from local midnight to the end of the last day. */
function allDaySpan(fromKey: string, toKey: string) {
  const start = parseDay(fromKey)
  const end = parseDay(toKey)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/**
 * The team calendar.
 *
 * Two sources merge into one list: events somebody scheduled, and leave that has
 * actually been approved. Leave is *derived* on every read rather than copied in
 * when it is approved — a cancelled or reversed approval therefore disappears
 * from the calendar on its own, with no second write to forget.
 */
calendarRoutes.get('/', validateQuery(calendarRangeSchema), async (c) => {
  const user = c.get('user')
  const range = c.get('query') as CalendarRange
  const { from, to } = windowFor(range, Date.now())

  // Who this reader may see leave for. An employee sees only their own.
  let visiblePeople: string[] | null = null
  if (user.role === 'manager') {
    const reports = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.managerId, user.id), eq(users.id, user.id)))
    visiblePeople = reports.map((r) => r.id)
  } else if (user.role === 'employee') {
    visiblePeople = [user.id]
  }

  const [scheduled, approvedLeave, holidays] = await Promise.all([
    db
      .select({ event: calendarEvents, author })
      .from(calendarEvents)
      .leftJoin(author, eq(author.id, calendarEvents.createdBy))
      .where(
        and(
          lte(calendarEvents.startsAt, to),
          gte(calendarEvents.endsAt, from),
          // Company-wide events, plus the reader's own team's.
          or(
            isNull(calendarEvents.teamOfId),
            eq(calendarEvents.teamOfId, user.id),
            user.managerId ? eq(calendarEvents.teamOfId, user.managerId) : undefined,
          ),
        ),
      )
      .orderBy(asc(calendarEvents.startsAt)) as Promise<EventJoin[]>,
    db
      .select({ request: requests, employee: users })
      .from(requests)
      .innerJoin(users, eq(users.id, requests.userId))
      .where(
        and(
          eq(requests.kind, 'leave'),
          eq(requests.status, 'approved'),
          gte(requests.leaveTo, dayKey(from)),
          lte(requests.leaveFrom, dayKey(to)),
          visiblePeople ? inArray(requests.userId, visiblePeople.length ? visiblePeople : ['']) : undefined,
        ),
      ),
    db
      .select()
      .from(publicHolidays)
      .where(and(gte(publicHolidays.holidayDate, dayKey(from)), lte(publicHolidays.holidayDate, dayKey(to)))),
  ])

  const events: CalendarEvent[] = []

  for (const row of scheduled) {
    events.push({
      id: row.event.id,
      kind: row.event.kind,
      title: { en: row.event.titleEn, ar: row.event.titleAr },
      startsAt: row.event.startsAt.toISOString(),
      endsAt: row.event.endsAt.toISOString(),
      allDay: row.event.allDay,
      location: row.event.location,
      personName: row.author ? { en: row.author.fullNameEn, ar: row.author.fullNameAr } : null,
      editable: true,
    })
  }

  for (const row of approvedLeave) {
    const leaveFrom = String(row.request.leaveFrom)
    const leaveTo = String(row.request.leaveTo)
    const span = allDaySpan(leaveFrom, leaveTo)
    events.push({
      // Prefixed so it cannot collide with a real event id, and so the client can
      // tell at a glance that this row has no calendar entry to edit.
      id: `leave:${row.request.id}`,
      kind: 'leave',
      title: { en: row.employee.fullNameEn, ar: row.employee.fullNameAr },
      startsAt: span.start.toISOString(),
      endsAt: span.end.toISOString(),
      allDay: true,
      location: null,
      personName: { en: row.employee.fullNameEn, ar: row.employee.fullNameAr },
      editable: false,
    })
  }

  for (const row of holidays) {
    const key = String(row.holidayDate)
    const span = allDaySpan(key, key)
    events.push({
      id: `holiday:${row.id}`,
      kind: 'holiday',
      title: { en: row.nameEn, ar: row.nameAr },
      startsAt: span.start.toISOString(),
      endsAt: span.end.toISOString(),
      allDay: true,
      location: null,
      personName: null,
      editable: false,
    })
  }

  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  const holidayKeys = await holidaySet()
  const leaveDays = approvedLeave.reduce(
    (total, row) =>
      total + countWorkingDays(String(row.request.leaveFrom), String(row.request.leaveTo), holidayKeys),
    0,
  )

  const summary: CalendarSummary = {
    events,
    meetings: events.filter((e) => e.kind === 'meeting').length,
    training: events.filter((e) => e.kind === 'training').length,
    leaveDays,
  }
  return c.json(summary)
})

calendarRoutes.post(
  '/',
  requireRole(...allowed('manageCalendar')),
  validateBody(createCalendarEventSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.get('body') as CreateCalendarEventInput

    // A manager can only address their own team, whatever they ask for.
    const teamOfId = user.role === 'manager' || input.audience === 'team' ? user.id : null

    const [row] = await db
      .insert(calendarEvents)
      .values({
        kind: input.kind,
        titleEn: input.title.en,
        titleAr: input.title.ar,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        allDay: input.allDay,
        location: input.location ?? null,
        teamOfId,
        createdBy: user.id,
      })
      .returning()

    publish(
      { type: 'calendar.changed', eventId: row!.id, at: row!.createdAt.toISOString() },
      teamOfId ? { kind: 'supervisors', userId: user.id } : { kind: 'everyone' },
    )

    return c.json({ id: row!.id }, 201)
  },
)

calendarRoutes.delete('/:id', requireRole(...allowed('manageCalendar')), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const rows = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw new HTTPException(404, { message: 'eventNotFound' })

  // A manager may only remove what they put on their own team's calendar.
  if (user.role === 'manager' && row.createdBy !== user.id) {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
  publish(
    { type: 'calendar.changed', eventId: id, at: new Date().toISOString() },
    row.teamOfId ? { kind: 'supervisors', userId: row.teamOfId } : { kind: 'everyone' },
  )

  return c.json({ ok: true })
})
