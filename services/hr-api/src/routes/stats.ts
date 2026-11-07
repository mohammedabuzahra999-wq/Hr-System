import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { HeadcountPoint, OrgStats, TeamStats } from '@hr/shared'
import { db } from '../db/client.js'
import { attendanceDays, jobOpenings, payslips, requests, users } from '../db/schema.js'
import { dayKey, startOfMonth } from '../domain/workdays.js'
import { requireAuth, requireRole, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'

export const statsRoutes = new Hono<AppEnv>()

statsRoutes.use('*', requireAuth)

/**
 * Figures the dashboards read.
 *
 * Every number is counted from the tables at request time rather than stored, so
 * a tile and the chart beside it cannot drift apart — the headcount the trend
 * ends on is the same query that fills the "active employees" tile.
 */

/** Headcount at the end of each of the last `months` months, from join dates. */
async function headcountTrend(months = 7): Promise<HeadcountPoint[]> {
  const now = new Date()
  const points: HeadcountPoint[] = []

  for (let i = months - 1; i >= 0; i -= 1) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
    const endKey = dayKey(end)
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(and(lte(users.joinedOn, endKey), eq(users.isActive, true)))
    points.push({ month: `${endKey.slice(0, 7)}-01`, headcount: row?.n ?? 0 })
  }

  return points
}

statsRoutes.get('/org', requireRole(...allowed('viewOrgStats')), async (c) => {
  const today = dayKey(new Date())
  const monthStart = startOfMonth(today)

  const [active, presentToday, onLeave, pending, payroll, openings, trend] = await Promise.all([
    db.select({ n: count() }).from(users).where(eq(users.isActive, true)),
    db
      .select({ n: count() })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.workDate, today), inArray(attendanceDays.status, ['present', 'late']))),
    db
      .select({ n: count() })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.workDate, today), eq(attendanceDays.status, 'leave'))),
    db.select({ n: count() }).from(requests).where(eq(requests.status, 'pending')),
    db
      .select({
        total: sql<string>`coalesce(sum(${payslips.basic} + ${payslips.allowances} - ${payslips.deductions}), 0)`,
        currency: sql<string>`coalesce(min(${payslips.currency}), 'JOD')`,
      })
      .from(payslips)
      .where(gte(payslips.paidOn, monthStart)),
    // Was hardcoded to zero while no table backed it. It is a real count now.
    db.select({ n: count() }).from(jobOpenings).where(eq(jobOpenings.status, 'open')),
    headcountTrend(),
  ])

  const activeCount = active[0]?.n ?? 0
  const present = presentToday[0]?.n ?? 0

  const stats: OrgStats = {
    activeEmployees: activeCount,
    attendanceRate: activeCount ? Number(((present / activeCount) * 100).toFixed(1)) : 0,
    openPositions: openings[0]?.n ?? 0,
    payrollThisCycle: Number(Number(payroll[0]?.total ?? 0).toFixed(2)),
    payrollCurrency: payroll[0]?.currency ?? 'JOD',
    pendingApprovals: pending[0]?.n ?? 0,
    onLeaveToday: onLeave[0]?.n ?? 0,
    headcountTrend: trend,
  }
  return c.json(stats)
})

statsRoutes.get('/team', requireRole(...allowed('viewTeamStats')), async (c) => {
  const user = c.get('user')
  const today = dayKey(new Date())
  const monthStart = startOfMonth(today)

  const team = await db
    .select({ id: users.id })
    .from(users)
    .where(
      user.role === 'manager'
        ? and(eq(users.managerId, user.id), eq(users.isActive, true))
        : eq(users.isActive, true),
    )

  const ids = team.map((t) => t.id)
  if (ids.length === 0) {
    const empty: TeamStats = {
      teamSize: 0,
      presentToday: 0,
      absentToday: 0,
      pendingApprovals: 0,
      attendanceRate: 0,
      lateThisMonth: 0,
      leaveRequestsThisMonth: 0,
    }
    return c.json(empty)
  }

  const [present, late, pending, leaveReqs, monthDays] = await Promise.all([
    db
      .select({ n: count() })
      .from(attendanceDays)
      .where(
        and(
          inArray(attendanceDays.userId, ids),
          eq(attendanceDays.workDate, today),
          inArray(attendanceDays.status, ['present', 'late']),
        ),
      ),
    db
      .select({ n: count() })
      .from(attendanceDays)
      .where(
        and(
          inArray(attendanceDays.userId, ids),
          gte(attendanceDays.workDate, monthStart),
          eq(attendanceDays.status, 'late'),
        ),
      ),
    db
      .select({ n: count() })
      .from(requests)
      .where(and(inArray(requests.userId, ids), eq(requests.status, 'pending'))),
    db
      .select({ n: count() })
      .from(requests)
      .where(and(inArray(requests.userId, ids), eq(requests.kind, 'leave'), gte(requests.submittedAt, new Date(monthStart)))),
    db
      .select({ n: count() })
      .from(attendanceDays)
      .where(
        and(
          inArray(attendanceDays.userId, ids),
          gte(attendanceDays.workDate, monthStart),
          inArray(attendanceDays.status, ['present', 'late', 'absent']),
        ),
      ),
  ])

  const presentCount = present[0]?.n ?? 0
  const recorded = monthDays[0]?.n ?? 0

  const stats: TeamStats = {
    teamSize: ids.length,
    presentToday: presentCount,
    absentToday: Math.max(0, ids.length - presentCount),
    pendingApprovals: pending[0]?.n ?? 0,
    attendanceRate: ids.length ? Number(((presentCount / ids.length) * 100).toFixed(1)) : 0,
    lateThisMonth: late[0]?.n ?? 0,
    leaveRequestsThisMonth: leaveReqs[0]?.n ?? 0,
  }
  void recorded
  return c.json(stats)
})
