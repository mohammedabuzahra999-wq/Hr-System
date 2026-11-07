import { and, eq, inArray, sql } from 'drizzle-orm'
import type { LeaveBalance, LeaveType } from '@hr/shared'
import { db } from '../db/client.js'
import { leaveBalances, requests } from '../db/schema.js'
import { countWorkingDays, rangesOverlap } from './workdays.js'

/**
 * Leave maths lives here, not in the route.
 *
 * The rule that matters: a pending request already *holds* days. Showing the
 * remaining balance without subtracting the hold lets an employee spend the same
 * day twice, so `availableDays` is what any check must use — never `remaining`.
 */

export async function ensureBalance(userId: string, year = new Date().getFullYear()) {
  const rows = await db.select().from(leaveBalances).where(eq(leaveBalances.userId, userId)).limit(1)
  const existing = rows[0]
  if (existing && existing.year === year) return existing

  const [created] = await db
    .insert(leaveBalances)
    .values({ userId, year })
    .onConflictDoUpdate({
      target: leaveBalances.userId,
      // A new year resets what was used but keeps the entitlement.
      set: { year, annualUsed: 0, sickUsed: 0 },
    })
    .returning()
  return created!
}

/** Days locked by requests still awaiting a decision. */
export async function pendingHold(userId: string) {
  const rows = await db
    .select({ type: requests.leaveType, days: requests.leaveDays })
    .from(requests)
    .where(
      and(
        eq(requests.userId, userId),
        eq(requests.kind, 'leave'),
        eq(requests.status, 'pending'),
      ),
    )

  const hold = { annual: 0, sick: 0, unpaid: 0 }
  for (const row of rows) {
    if (row.type && row.days) hold[row.type] += row.days
  }
  return hold
}

export async function balanceFor(userId: string): Promise<LeaveBalance> {
  const [row, hold] = await Promise.all([ensureBalance(userId), pendingHold(userId)])
  return {
    annualTotal: row.annualTotal,
    annualRemaining: row.annualTotal - row.annualUsed,
    sickRemaining: row.sickTotal - row.sickUsed,
    usedThisYear: row.annualUsed + row.sickUsed,
    heldAnnual: hold.annual,
    heldSick: hold.sick,
  }
}

/** What the employee can actually ask for right now. Unpaid leave has no cap. */
export function availableDays(type: LeaveType, balance: LeaveBalance): number {
  if (type === 'unpaid') return Number.MAX_SAFE_INTEGER
  if (type === 'sick') return Math.max(0, balance.sickRemaining - balance.heldSick)
  return Math.max(0, balance.annualRemaining - balance.heldAnnual)
}

export type LeaveProblem =
  | { code: 'errOrder' }
  | { code: 'errNoWorkdays' }
  | { code: 'errBalance'; available: number }
  | { code: 'errOverlap'; from: string; to: string }

/**
 * Validates a request against the calendar and the balance.
 *
 * Runs on the server even though the form checks the same things, because the
 * form can be bypassed and the balance can change between opening it and
 * pressing send.
 */
export async function validateLeaveRequest(
  userId: string,
  type: LeaveType,
  from: string,
  to: string,
  holidays: ReadonlySet<string>,
): Promise<{ ok: true; days: number } | { ok: false; problem: LeaveProblem }> {
  if (from > to) return { ok: false, problem: { code: 'errOrder' } }

  const days = countWorkingDays(from, to, holidays)
  if (days === 0) return { ok: false, problem: { code: 'errNoWorkdays' } }

  const existing = await db
    .select({ from: requests.leaveFrom, to: requests.leaveTo })
    .from(requests)
    .where(
      and(
        eq(requests.userId, userId),
        eq(requests.kind, 'leave'),
        inArray(requests.status, ['pending', 'approved']),
      ),
    )

  for (const row of existing) {
    if (!row.from || !row.to) continue
    const rowFrom = String(row.from)
    const rowTo = String(row.to)
    if (rangesOverlap(from, to, rowFrom, rowTo)) {
      return { ok: false, problem: { code: 'errOverlap', from: rowFrom, to: rowTo } }
    }
  }

  const balance = await balanceFor(userId)
  const available = availableDays(type, balance)
  if (days > available) return { ok: false, problem: { code: 'errBalance', available } }

  return { ok: true, days }
}

/** Approving leave is what spends the balance; a pending request only holds it. */
export async function consumeBalance(userId: string, type: LeaveType, days: number) {
  if (type === 'unpaid') return
  const column = type === 'sick' ? leaveBalances.sickUsed : leaveBalances.annualUsed
  await db
    .update(leaveBalances)
    .set({ [type === 'sick' ? 'sickUsed' : 'annualUsed']: sql`${column} + ${days}` })
    .where(eq(leaveBalances.userId, userId))
}
