import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/client.js'
import {
  attendanceDays,
  payrollAdjustments,
  payrollAudits,
  payrollRuns,
  payrollSettings,
  payslips,
  requests,
  salaryStructures,
  users,
} from '../db/schema.js'
import { holidaySet } from '../domain/attendance.js'
import { dayKey, eachDay, isWorkingDay } from '../domain/workdays.js'
import { calculatePayslip, toDinars, toFils, type PayrollRates } from './calculate.js'

/**
 * Running a month's payroll.
 *
 * Deliberately re-runnable while the run is a draft, and completely frozen once
 * it is approved. Payroll goes wrong — a contract is entered late, somebody's
 * unpaid leave is recorded after the fact — and the useful question is not "how
 * do we avoid that" but "what happens when it does". Here: recalculate, look at
 * it again, approve when it is right. After approval the figures are what was
 * paid, and nothing in this file will touch them.
 *
 * Every payslip records the rates row it used, so a payslip from March explains
 * itself with March's rates even after they change.
 */

/** The rates in force for a date, most recent first. */
async function ratesFor(date: string) {
  const rows = await db
    .select()
    .from(payrollSettings)
    .where(lte(payrollSettings.effectiveFrom, date))
    .orderBy(desc(payrollSettings.effectiveFrom))
    .limit(1)
  return rows[0] ?? null
}

/** The contract in force for a person on a date. */
async function contractFor(userId: string, date: string) {
  const rows = await db
    .select()
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.userId, userId),
        lte(salaryStructures.effectiveFrom, date),
        or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, date)),
      ),
    )
    .orderBy(desc(salaryStructures.effectiveFrom))
    .limit(1)
  return rows[0] ?? null
}

function toRates(row: typeof payrollSettings.$inferSelect): PayrollRates {
  return {
    socialSecurityEmployeeRate: Number(row.socialSecurityEmployeeRate),
    socialSecurityEmployerRate: Number(row.socialSecurityEmployerRate),
    socialSecurityCeiling: toFils(row.socialSecurityCeiling),
    taxPersonalExemption: toFils(row.taxPersonalExemption),
    taxDependantExemption: toFils(row.taxDependantExemption),
    taxBands: (row.taxBands as { upTo: number | null; rate: number }[]).map((b) => ({
      upTo: b.upTo === null ? null : toFils(b.upTo),
      rate: b.rate,
    })),
  }
}

/** Working days in a month, excluding weekends and public holidays. */
function workingDaysIn(year: number, month: number, holidays: ReadonlySet<string>): string[] {
  const days: string[] = []
  const last = new Date(year, month, 0).getDate()
  for (let d = 1; d <= last; d += 1) {
    const key = dayKey(new Date(year, month - 1, d))
    if (isWorkingDay(key, holidays)) days.push(key)
  }
  return days
}

export async function calculateRun(
  year: number,
  month: number,
  actorId: string,
): Promise<{ runId: string; payslips: number; warnings: string[] }> {
  const anchor = dayKey(new Date(year, month - 1, 1))
  const warnings: string[] = []

  const rates = await ratesFor(anchor)
  if (!rates) throw new HTTPException(422, { message: 'noPayrollSettings' })
  if (!rates.confirmed) {
    warnings.push('ratesUnconfirmed')
  }

  /*
   * A missing salary agreement used to be recorded as a warning while the
   * remaining employees were calculated. That is dangerous in practice: the
   * resulting draft looks usable even though somebody has been left out.
   *
   * Stop before creating or replacing a draft instead. HR gets the exact
   * employee list in the attention centre and can add the agreement there;
   * no partial payroll exists to be mistaken for the month's result.
   */
  const staffWithoutContracts = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(
      salaryStructures,
      and(
        eq(salaryStructures.userId, users.id),
        lte(salaryStructures.effectiveFrom, anchor),
        or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, anchor)),
      ),
    )
    .where(and(eq(users.isActive, true), isNull(salaryStructures.id)))
  if (staffWithoutContracts.length > 0) {
    throw new HTTPException(422, { message: 'payrollContractsMissing' })
  }

  const existing = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.periodYear, year), eq(payrollRuns.periodMonth, month)))
    .limit(1)

  /**
   * An approved run is finished.
   *
   * Recalculating one would change figures somebody has already signed and, in
   * all likelihood, already paid. Correcting an approved month is a deliberate
   * act with its own record — not a side effect of pressing calculate again.
   */
  if (existing[0] && existing[0].status !== 'draft') {
    throw new HTTPException(409, { message: 'payrollRunLocked' })
  }

  const run =
    existing[0] ??
    (await db.insert(payrollRuns).values({ periodYear: year, periodMonth: month }).returning())[0]!

  // A draft being recalculated starts clean, so a removed employee does not
  // leave a stale payslip behind.
  await db.delete(payslips).where(eq(payslips.runId, run.id))
  await db
    .update(payrollAudits)
    .set({ status: 'stale' })
    .where(and(eq(payrollAudits.runId, run.id), inArray(payrollAudits.status, ['running', 'completed'])))

  const holidays = await holidaySet()
  const days = workingDaysIn(year, month, holidays)
  const from = days[0] ?? anchor
  const to = days[days.length - 1] ?? anchor

  const staff = await db
    .select({ id: users.id, en: users.fullNameEn })
    .from(users)
    .where(eq(users.isActive, true))

  const absenceRows = await db
    .select({ userId: attendanceDays.userId, workDate: attendanceDays.workDate })
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.status, 'absent'),
        gte(attendanceDays.workDate, from),
        lte(attendanceDays.workDate, to),
      ),
    )
  const absenceDaysByUser = new Map<string, Set<string>>()
  for (const row of absenceRows) {
    const dates = absenceDaysByUser.get(row.userId) ?? new Set<string>()
    dates.add(String(row.workDate))
    absenceDaysByUser.set(row.userId, dates)
  }

  /**
   * Leave has its own request record. Attendance marks it simply as `leave`,
   * which is correct for the attendance screen but does not say whether it is
   * paid.  Payroll reads only approved unpaid leave here and calculates the
   * exact working dates in this run's month.
   */
  const unpaidLeaveRequests = await db
    .select({ userId: requests.userId, from: requests.leaveFrom, to: requests.leaveTo })
    .from(requests)
    .where(
      and(
        eq(requests.kind, 'leave'),
        eq(requests.status, 'approved'),
        eq(requests.leaveType, 'unpaid'),
        lte(requests.leaveFrom, to),
        gte(requests.leaveTo, from),
      ),
    )
  const unpaidLeaveDaysByUser = new Map<string, Set<string>>()
  for (const request of unpaidLeaveRequests) {
    if (!request.from || !request.to) continue
    const dates = unpaidLeaveDaysByUser.get(request.userId) ?? new Set<string>()
    for (const date of eachDay(String(request.from), String(request.to))) {
      if (date >= from && date <= to && isWorkingDay(date, holidays)) dates.add(date)
    }
    unpaidLeaveDaysByUser.set(request.userId, dates)
  }

  const paidOn = dayKey(new Date(year, month, 0))
  const adjustments = await db
    .select()
    .from(payrollAdjustments)
    .where(
      and(
        eq(payrollAdjustments.status, 'approved'),
        gte(payrollAdjustments.effectiveOn, anchor),
        lte(payrollAdjustments.effectiveOn, paidOn),
      ),
    )
  const adjustmentsByUser = new Map<string, typeof adjustments>()
  for (const adjustment of adjustments) {
    const entries = adjustmentsByUser.get(adjustment.userId) ?? []
    entries.push(adjustment)
    adjustmentsByUser.set(adjustment.userId, entries)
  }

  const rateSet = toRates(rates)
  let written = 0

  for (const person of staff) {
    const contract = await contractFor(person.id, anchor)
    if (!contract) {
      // Named, not skipped silently. An employee missing from payroll is the
      // kind of thing that is discovered by the employee.
      warnings.push(`noContract:${person.en}`)
      continue
    }

    const variable = adjustmentsByUser.get(person.id) ?? []
    const labelFor = (kind: (typeof payrollAdjustments.$inferSelect)['kind']) =>
      kind === 'overtime'
        ? { en: 'Approved overtime', ar: 'عمل إضافي معتمد' }
        : kind === 'bonus'
          ? { en: 'Approved bonus', ar: 'مكافأة معتمدة' }
          : kind === 'allowance'
            ? { en: 'Approved allowance', ar: 'بدل معتمد' }
            : { en: 'Approved deduction', ar: 'خصم معتمد' }

    const leaveDays = unpaidLeaveDaysByUser.get(person.id) ?? new Set<string>()
    const absenceDays = absenceDaysByUser.get(person.id) ?? new Set<string>()
    // A date is counted at most once even if data was corrected in both places.
    const unpaidDates = new Set([...absenceDays, ...leaveDays])
    const absenceOnlyDays = [...absenceDays].filter((date) => !leaveDays.has(date)).length

    const result = calculatePayslip(
      {
        basic: toFils(contract.basic),
        transport: toFils(contract.transport),
        housing: toFils(contract.housing),
        other: toFils(contract.other),
        workingDays: days.length,
        unpaidDays: unpaidDates.size,
        unpaidAbsenceDays: absenceOnlyDays,
        unpaidLeaveDays: leaveDays.size,
        dependants: contract.dependants,
        socialSecurityExempt: contract.socialSecurityExempt,
        otherEarnings: variable
          .filter((a) => a.kind !== 'deduction')
          .map((a) => ({
            code: `adjustment:${a.kind}:${a.id}`,
            name: labelFor(a.kind),
            amount: toFils(a.amount),
            basis: { en: `Approved on ${a.effectiveOn}`, ar: `اعتُمد بتاريخ ${a.effectiveOn}` },
          })),
        otherDeductions: variable
          .filter((a) => a.kind === 'deduction')
          .map((a) => ({
            code: `adjustment:deduction:${a.id}`,
            name: labelFor(a.kind),
            amount: toFils(a.amount),
          })),
      },
      rateSet,
    )

    const earnings = result.lines.filter((l) => l.kind === 'earning')
    const allowanceTotal = earnings
      .filter((l) => l.code !== 'basic')
      .reduce((a, l) => a + l.amount, 0)
    const basicLine = earnings.find((l) => l.code === 'basic')?.amount ?? 0

    await db.insert(payslips).values({
      userId: person.id,
      runId: run.id,
      paidOn,
      currency: contract.currency,
      basic: toDinars(basicLine).toFixed(2),
      allowances: toDinars(allowanceTotal).toFixed(2),
      deductions: toDinars(result.totalDeductions).toFixed(2),
      employerSocialSecurity: toDinars(result.employerSocialSecurity).toFixed(2),
      workingDays: days.length,
      unpaidDays: String(unpaidDates.size),
      // Amounts go out in dinars: the payslip is read, not calculated with.
      lines: result.lines.map((l) => ({ ...l, amount: toDinars(l.amount) })),
      status: 'underReview',
    })
    written += 1
  }

  await db
    .update(payrollRuns)
    .set({ settingsId: rates.id, calculatedBy: actorId, calculatedAt: new Date(), status: 'draft' })
    .where(eq(payrollRuns.id, run.id))

  return { runId: run.id, payslips: written, warnings }
}
