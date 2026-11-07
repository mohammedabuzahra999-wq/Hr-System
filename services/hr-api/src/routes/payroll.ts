import { aliasedTable, and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  calculateRunSchema,
  createPayrollAdjustmentSchema,
  idSchema,
  reviewPayrollFindingSchema,
  setSalarySchema,
  type CalculateRunInput,
  type PayrollCycle,
  type PayrollRow,
  type SalaryContractStatuses,
  type SalaryRecord,
  type SalarySummary,
  type SetSalaryInput,
} from '@hr/shared'
import { db } from '../db/client.js'
import { payrollAdjustments, payrollRuns, payrollSettings, payslips, salaryStructures, users } from '../db/schema.js'
import { toPayrollRun, toPayrollSettings, toPayslip } from '../mappers.js'
import { requireAuth, requireRole, validateBody, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { calculateRun } from '../payroll/run.js'
import {
  approvePayrollAdjustment,
  assertRunReadyForApproval,
  auditOverviews,
  createPayrollAdjustment,
  findingForAi,
  latestAuditForRun,
  reviewPayrollFinding,
  runPayrollAudit,
  saveAiExplanation,
} from '../payroll/audit.js'
import { explainPayrollFinding } from '../payroll/auditAi.js'
import { env } from '../env.js'
import { dayKey } from '../domain/workdays.js'
import { publish } from '../realtime/bus.js'

export const payrollRoutes = new Hono<AppEnv>()

payrollRoutes.use('*', requireAuth)

/** Salary is paid on the 27th; the next payday is the next one that has not passed. */
function nextPayday(from = new Date()): string {
  const thisMonth = new Date(from.getFullYear(), from.getMonth(), 27)
  const next = from <= thisMonth ? thisMonth : new Date(from.getFullYear(), from.getMonth() + 1, 27)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-27`
}

/**
 * Your own payslips.
 *
 * There is deliberately no `userId` parameter: an employee reads their salary
 * through this route and nobody else's, so the route cannot be pointed at
 * another person by changing a query string.
 */
payrollRoutes.get('/me', async (c) => {
  const user = c.get('user')
  const rows = await db
    .select()
    .from(payslips)
    .where(eq(payslips.userId, user.id))
    .orderBy(desc(payslips.paidOn))
    .limit(12)

  const history = rows.map(toPayslip)
  const payload: SalarySummary = {
    latest: history[0] ?? null,
    history,
    nextPayOn: nextPayday(),
  }
  return c.json(payload)
})

/** The whole cycle, for HR. */
payrollRoutes.get('/cycle', requireRole(...allowed('viewPayroll')), async (c) => {
  const now = new Date()
  /*
   * Day 0 of the next month is the last day of this one. Assuming 31 produces
   * "2026-09-31" in a thirty-day month, which is not a date Postgres accepts —
   * the whole query fails rather than returning an empty cycle.
   */
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  const last = `${monthEnd.getFullYear()}-${pad(monthEnd.getMonth() + 1)}-${pad(monthEnd.getDate())}`

  const rowsForPeriod = (from: string, to: string) =>
    db
      .select({ payslip: payslips, user: users })
      .from(payslips)
      .innerJoin(users, eq(users.id, payslips.userId))
      .where(and(gte(payslips.paidOn, from), lte(payslips.paidOn, to)))
      .orderBy(desc(payslips.paidOn))

  let rows = await rowsForPeriod(first, last)

  /*
   * Payroll is often calculated after the start of the following month. If a
   * new month has no run yet, showing an empty page hides the last completed
   * cycle that HR still needs to review. Fall back to that latest cycle, while
   * preserving an empty page when no payslip has ever been recorded.
   */
  if (rows.length === 0) {
    const [latest] = await db
      .select({ paidOn: payslips.paidOn })
      .from(payslips)
      .orderBy(desc(payslips.paidOn))
      .limit(1)

    if (latest) {
      const dateKey = String(latest.paidOn).slice(0, 10)
      const year = Number(dateKey.slice(0, 4))
      const month = Number(dateKey.slice(5, 7))
      const fallbackStart = `${year}-${String(month).padStart(2, '0')}-01`
      const fallbackEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
      rows = await rowsForPeriod(fallbackStart, fallbackEnd)
    }
  }

  const mapped: PayrollRow[] = rows.map((r) => {
    const slip = toPayslip(r.payslip)
    return {
      userId: r.user.id,
      employeeName: { en: r.user.fullNameEn, ar: r.user.fullNameAr },
      employeeNumber: r.user.employeeNumber,
      netPay: slip.netPay,
      currency: slip.currency,
      status: r.payslip.status,
      paidOn: slip.paidOn,
    }
  })

  const totals = rows.reduce(
    (acc, r) => {
      const slip = toPayslip(r.payslip)
      acc.net += slip.netPay
      acc.allowances += slip.allowances
      acc.deductions += slip.deductions
      return acc
    },
    { net: 0, allowances: 0, deductions: 0 },
  )

  const cycle: PayrollCycle = {
    rows: mapped,
    currency: mapped[0]?.currency ?? 'JOD',
    netTotal: Number(totals.net.toFixed(2)),
    allowancesTotal: Number(totals.allowances.toFixed(2)),
    deductionsTotal: Number(totals.deductions.toFixed(2)),
  }
  return c.json(cycle)
})

/** One employee's history, for HR only. */
payrollRoutes.get('/employee/:id', requireRole(...allowed('viewPayroll')), async (c) => {
  const id = c.req.param('id')
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!exists[0]) throw new HTTPException(404, { message: 'employeeNotFound' })

  const rows = await db
    .select()
    .from(payslips)
    .where(eq(payslips.userId, id))
    .orderBy(desc(payslips.paidOn))
    .limit(24)

  return c.json({ history: rows.map(toPayslip) })
})

/* ---------- running payroll ---------- */

/**
 * Calculate a month.
 *
 * Re-runnable while the run is a draft, refused once it is approved. Payroll
 * goes wrong — a contract entered late, unpaid leave recorded after the fact —
 * and the useful behaviour is not to prevent that but to make correcting it
 * ordinary: recalculate, look, approve when it is right.
 */
payrollRoutes.post('/runs', requireRole(...allowed('runPayroll')), validateBody(calculateRunSchema), async (c) => {
  const actor = c.get('user')
  const { year, month } = c.get('body') as CalculateRunInput
  const result = await calculateRun(year, month, actor.id)
  publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json(result, 201)
})

payrollRoutes.get('/runs', requireRole(...allowed('viewPayroll')), async (c) => {
  const rows = await db
    .select()
    .from(payrollRuns)
    .orderBy(desc(payrollRuns.periodYear), desc(payrollRuns.periodMonth))
    .limit(24)
  return c.json({ runs: rows.map(toPayrollRun) })
})

/** Latest audit for each run, used to put review state beside the approval action. */
payrollRoutes.get('/audits', requireRole(...allowed('viewPayroll')), async (c) =>
  c.json({ audits: await auditOverviews() }),
)

/** Analyze the current calculation.  This never approves or changes payroll. */
payrollRoutes.post('/runs/:id/audit', requireRole(...allowed('runPayroll')), async (c) => {
  const audit = await runPayrollAudit(c.req.param('id'), c.get('user').id)
  publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json({ audit }, 201)
})

payrollRoutes.get('/runs/:id/audit', requireRole(...allowed('viewPayroll')), async (c) => {
  const audit = await latestAuditForRun(c.req.param('id'))
  return c.json({ audit })
})

/** Human workflow for a rule finding.  A review does not recalculate a payslip. */
payrollRoutes.post('/findings/:id/review', requireRole(...allowed('runPayroll')), validateBody(reviewPayrollFindingSchema), async (c) => {
  const audit = await reviewPayrollFinding(c.req.param('id'), c.get('user').id, c.get('body'))
  publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json({ audit })
})

/** Optional prose from AI; facts and severity remain the deterministic ones. */
payrollRoutes.post('/findings/:id/explain', requireRole(...allowed('viewPayroll')), async (c) => {
  const actor = c.get('user')
  const finding = await findingForAi(c.req.param('id'))
  const explanation = await explainPayrollFinding({
    type: finding.type,
    severity: finding.severity,
    facts: finding.facts,
    explanation: finding.explanation,
  })
  await saveAiExplanation(finding.id, actor.id, explanation)
  return c.json({ explanation, sharingOff: !env.AI_SHARE_DATA })
})

/**
 * Variable payroll inputs are pending by default.  A bonus or overtime amount
 * cannot reach calculation until an HR/Admin reviewer explicitly approves it.
 */
payrollRoutes.post('/adjustments', requireRole(...allowed('runPayroll')), validateBody(createPayrollAdjustmentSchema), async (c) => {
  const adjustment = await createPayrollAdjustment(c.get('body'), c.get('user').id)
  publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json({ adjustment }, 201)
})

payrollRoutes.get('/adjustments', requireRole(...allowed('viewPayroll')), async (c) => {
  const rows = await db
    .select({ adjustment: payrollAdjustments, en: users.fullNameEn, ar: users.fullNameAr, employeeNumber: users.employeeNumber })
    .from(payrollAdjustments)
    .innerJoin(users, eq(users.id, payrollAdjustments.userId))
    .orderBy(desc(payrollAdjustments.effectiveOn), desc(payrollAdjustments.createdAt))
    .limit(200)
  return c.json({
    adjustments: rows.map(({ adjustment, en, ar, employeeNumber }) => ({
      id: adjustment.id,
      userId: adjustment.userId,
      employee: { en, ar },
      employeeNumber,
      kind: adjustment.kind,
      amount: Number(adjustment.amount),
      effectiveOn: adjustment.effectiveOn,
      note: adjustment.note,
      status: adjustment.status,
    })),
  })
})

payrollRoutes.post('/adjustments/:id/approve', requireRole(...allowed('runPayroll')), async (c) => {
  const adjustment = await approvePayrollAdjustment(c.req.param('id'), c.get('user').id)
  publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json({ adjustment: { ...adjustment, amount: Number(adjustment.amount) } })
})

/**
 * Approving a run.
 *
 * A separate act from calculating it, by a person, with their name and the time
 * recorded — because this is the moment the figures stop being a proposal. The
 * payslips move to `processed` in the same breath, so an employee never sees a
 * figure nobody has agreed to.
 */
payrollRoutes.post('/runs/:id/approve', requireRole(...allowed('runPayroll')), async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const rows = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1)
  if (!rows[0]) throw new HTTPException(404, { message: 'payrollRunNotFound' })
  if (rows[0].status !== 'draft') throw new HTTPException(409, { message: 'payrollRunLocked' })

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payslips)
    .where(eq(payslips.runId, id))
  if (!count || count.n === 0) throw new HTTPException(422, { message: 'payrollRunEmpty' })

  /* This is deliberately server-side: hiding the button in the browser is not
     a control when an HTTP request can be made directly. */
  await assertRunReadyForApproval(id)

  await db
    .update(payrollRuns)
    .set({ status: 'approved', approvedBy: actor.id, approvedAt: new Date() })
    .where(eq(payrollRuns.id, id))
  await db.update(payslips).set({ status: 'processed' }).where(eq(payslips.runId, id))

  const [fresh] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id))
  publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json({ run: toPayrollRun(fresh!) })
})

/** The rates in force, and whether anybody has confirmed them. */
payrollRoutes.get('/settings', requireRole(...allowed('managePayrollSettings')), async (c) => {
  const rows = await db
    .select()
    .from(payrollSettings)
    .orderBy(desc(payrollSettings.effectiveFrom))
    .limit(1)
  return c.json({ settings: rows[0] ? toPayrollSettings(rows[0]) : null })
})

/**
 * Confirming the rates.
 *
 * Nothing about the calculation changes. What changes is whether the company is
 * claiming these figures are right — so it takes a deliberate press by a named
 * person, and until it happens every payslip says the rates are unverified.
 */
payrollRoutes.post('/settings/:id/confirm', requireRole(...allowed('managePayrollSettings')), async (c) => {
  const id = c.req.param('id')
  const rows = await db.select().from(payrollSettings).where(eq(payrollSettings.id, id)).limit(1)
  if (!rows[0]) throw new HTTPException(404, { message: 'payrollSettingsNotFound' })
  await db.update(payrollSettings).set({ confirmed: true }).where(eq(payrollSettings.id, id))
  const [fresh] = await db.select().from(payrollSettings).where(eq(payrollSettings.id, id))
  return c.json({ settings: toPayrollSettings(fresh!) })
})

/**
 * What one person earns, and every agreement they have been on.
 *
 * The history is the point. A salary is not a field that gets overwritten —
 * each agreement has a date it started, and a payslip from two years ago still
 * recalculates against the agreement in force then. Listing them is how anybody
 * later answers "what was he on in March, and who decided that?".
 */
payrollRoutes.get('/salary/:id', requireRole(...allowed('viewPayroll')), async (c) => {
  const id = c.req.param('id')
  if (!idSchema.safeParse(id).success) throw new HTTPException(404, { message: 'employeeNotFound' })

  const setBy = aliasedTable(users, 'set_by_user')
  const rows = await db
    .select({ s: salaryStructures, setBy })
    .from(salaryStructures)
    .leftJoin(setBy, eq(setBy.id, salaryStructures.createdBy))
    .where(eq(salaryStructures.userId, id))
    .orderBy(desc(salaryStructures.effectiveFrom))

  const history: SalaryRecord[] = rows.map(({ s, setBy: who }) => ({
    id: s.id,
    basic: s.basic,
    transport: s.transport,
    housing: s.housing,
    other: s.other,
    currency: s.currency,
    effectiveFrom: String(s.effectiveFrom),
    effectiveTo: s.effectiveTo ? String(s.effectiveTo) : null,
    socialSecurityExempt: s.socialSecurityExempt,
    dependants: s.dependants,
    setBy: who ? { en: who.fullNameEn, ar: who.fullNameAr } : null,
    createdAt: s.createdAt.toISOString(),
  }))

  return c.json({ history })
})

/**
 * Active employees and whether a salary agreement has been recorded for them.
 *
 * The contracts screen needs this as one bounded query: asking the browser to
 * fetch every employee's history separately leaves newly hired people easy to
 * miss, and creates one request per person.  No salary amount is returned
 * here; opening a specific employee remains the deliberate next step.
 */
payrollRoutes.get('/salary-contracts', requireRole(...allowed('viewPayroll')), async (c) => {
  const rows = await db
    .select({
      userId: users.id,
      nameEn: users.fullNameEn,
      nameAr: users.fullNameAr,
      employeeNumber: users.employeeNumber,
      agreementId: salaryStructures.id,
      effectiveFrom: salaryStructures.effectiveFrom,
    })
    .from(users)
    .leftJoin(
      salaryStructures,
      and(eq(salaryStructures.userId, users.id), isNull(salaryStructures.effectiveTo)),
    )
    .where(eq(users.isActive, true))
    .orderBy(users.fullNameAr, users.fullNameEn)

  const payload: SalaryContractStatuses = {
    employees: rows.map((row) => ({
      userId: row.userId,
      employee: { en: row.nameEn, ar: row.nameAr },
      employeeNumber: row.employeeNumber,
      hasSalaryContract: row.agreementId !== null,
      effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom) : null,
    })),
  }
  return c.json(payload)
})

/**
 * Setting a salary, which means starting a new agreement rather than editing.
 *
 * Two writes in one transaction: the agreement in force is closed the day
 * before the new one begins, and the new one is inserted open-ended. Done as a
 * transaction because the half-state — two overlapping open agreements — makes
 * `contractFor` return whichever the database felt like, and a payroll run on
 * that state pays a number nobody chose.
 *
 * Refused while a run covering the new date is already approved: an approved
 * run is final, and quietly changing the salary underneath it would make the
 * payslip disagree with the agreement it claims to be based on.
 */
payrollRoutes.post(
  '/salary/:id',
  requireRole(...allowed('setSalary')),
  validateBody(setSalarySchema),
  async (c) => {
    const actor = c.get('user')
    const id = c.req.param('id')
    const input = c.get('body') as SetSalaryInput
    if (!idSchema.safeParse(id).success) throw new HTTPException(404, { message: 'employeeNotFound' })

    const person = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!person[0]) throw new HTTPException(404, { message: 'employeeNotFound' })

    const from = input.effectiveFrom
    /*
     * Runs are stored by year and month, not by a date range, so the comparison
     * is on the month the new agreement starts in: any approved run for that
     * month or later would have been calculated against the old figure.
     */
    const fromYear = Number(from.slice(0, 4))
    const fromMonth = Number(from.slice(5, 7))
    const approved = await db
      .select({ y: payrollRuns.periodYear, m: payrollRuns.periodMonth })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.status, 'approved'), gte(payrollRuns.periodYear, fromYear)))
    if (approved.some((r) => r.y > fromYear || r.m >= fromMonth)) {
      throw new HTTPException(409, { message: 'runAlreadyApproved' })
    }

    /** The day before the new agreement starts, so the two never overlap. */
    const dayBefore = (date: string) => {
      const d = new Date(`${date}T12:00:00`)
      d.setDate(d.getDate() - 1)
      return dayKey(d)
    }

    await db.transaction(async (tx) => {
      await tx
        .update(salaryStructures)
        .set({ effectiveTo: dayBefore(from) })
        .where(and(eq(salaryStructures.userId, id), isNull(salaryStructures.effectiveTo)))

      await tx.insert(salaryStructures).values({
        userId: id,
        basic: input.basic,
        transport: input.transport,
        housing: input.housing,
        other: input.other,
        effectiveFrom: from,
        socialSecurityExempt: input.socialSecurityExempt,
        dependants: input.dependants,
        createdBy: actor.id,
      })
    })

    console.log(`[payroll] ${actor.email} set the salary for ${id} from ${from}`)
    publish({ type: 'payroll.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
    return c.json({ ok: true }, 201)
  },
)
