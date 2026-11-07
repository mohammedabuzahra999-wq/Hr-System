import { and, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type {
  CreatePayrollAdjustmentInput,
  PayrollAudit,
  PayrollAuditOverview,
  PayrollFinding,
  ReviewPayrollFindingInput,
} from '@hr/shared'
import { db } from '../db/client.js'
import {
  attendanceDays,
  payrollAdjustments,
  payrollAuditEvents,
  payrollAuditSettings,
  payrollAudits,
  payrollFindings,
  payrollRuns,
  payslips,
  users,
} from '../db/schema.js'
import { auditPayrollEmployee, type AuditAdjustment, type AuditLine, type AuditPayslip, type AuditRuleSettings } from './auditRules.js'

const L = (en: string, ar: string) => ({ en, ar })
const zeroCounts = () => ({ critical: 0, high: 0, medium: 0, low: 0 })

type Counts = ReturnType<typeof zeroCounts>

function readCounts(value: unknown): Counts {
  const source = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    critical: Number(source.critical) || 0,
    high: Number(source.high) || 0,
    medium: Number(source.medium) || 0,
    low: Number(source.low) || 0,
  }
}

function lines(value: unknown): AuditLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((line) => {
    if (!line || typeof line !== 'object') return []
    const row = line as Record<string, unknown>
    if (!['earning', 'deduction', 'employerCost'].includes(String(row.kind))) return []
    if (typeof row.code !== 'string' || !Number.isFinite(Number(row.amount))) return []
    return [{ kind: row.kind as AuditLine['kind'], code: row.code, amount: Number(row.amount) }]
  })
}

function toAuditPayslip(row: typeof payslips.$inferSelect): AuditPayslip {
  const basic = Number(row.basic)
  const allowances = Number(row.allowances)
  const deductions = Number(row.deductions)
  return {
    userId: row.userId,
    basic,
    allowances,
    deductions,
    netPay: basic + allowances - deductions,
    unpaidDays: Number(row.unpaidDays ?? 0),
    lines: lines(row.lines),
  }
}

function toSettings(row: typeof payrollAuditSettings.$inferSelect): AuditRuleSettings {
  return {
    salaryChangePercent: Number(row.salaryChangePercent),
    deductionChangePercent: Number(row.deductionChangePercent),
    overtimeMonthlyThreshold: Number(row.overtimeMonthlyThreshold),
    minHistoryMonths: row.minHistoryMonths,
  }
}

async function settingsFor(anchor: string, actorId: string) {
  const existing = await db
    .select()
    .from(payrollAuditSettings)
    .where(lte(payrollAuditSettings.effectiveFrom, anchor))
    .orderBy(desc(payrollAuditSettings.effectiveFrom))
    .limit(1)
  if (existing[0]) return existing[0]

  const [created] = await db
    .insert(payrollAuditSettings)
    .values({ effectiveFrom: anchor, createdBy: actorId })
    .returning()
  return created!
}

async function logEvent(input: {
  runId?: string | null
  auditId?: string | null
  findingId?: string | null
  actorId?: string | null
  eventType: string
  status: string
  reason?: string | null
}) {
  await db.insert(payrollAuditEvents).values({
    runId: input.runId ?? null,
    auditId: input.auditId ?? null,
    findingId: input.findingId ?? null,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    status: input.status,
    reason: input.reason ?? null,
  })
}

function dayRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`,
  }
}

const FACT_LABELS: Record<string, { label: { en: string; ar: string }; kind: 'money' | 'percent' | 'days' | 'count' | 'text' }> = {
  previousNet: { label: L('Previous net pay', 'صافي الراتب السابق'), kind: 'money' },
  currentNet: { label: L('Current net pay', 'صافي الراتب الحالي'), kind: 'money' },
  previousDeductions: { label: L('Previous deductions', 'الخصومات السابقة'), kind: 'money' },
  currentDeductions: { label: L('Current deductions', 'الخصومات الحالية'), kind: 'money' },
  changePercent: { label: L('Change', 'التغيّر'), kind: 'percent' },
  absentDays: { label: L('Recorded absent days', 'أيام الغياب المسجّلة'), kind: 'days' },
  payrollUnpaidDays: { label: L('Payroll unpaid days', 'أيام الراتب غير المدفوعة'), kind: 'days' },
  lineCode: { label: L('Repeated line', 'البند المكرّر'), kind: 'text' },
  expectedMin: { label: L('Historic lower range', 'الحد الأدنى التاريخي'), kind: 'money' },
  expectedMax: { label: L('Historic upper range', 'الحد الأعلى التاريخي'), kind: 'money' },
  historyMonths: { label: L('History months', 'أشهر السجل'), kind: 'count' },
  overtime: { label: L('Approved overtime', 'العمل الإضافي المعتمد'), kind: 'money' },
  threshold: { label: L('Review threshold', 'حد المراجعة'), kind: 'money' },
  amount: { label: L('Amount', 'المبلغ'), kind: 'money' },
  status: { label: L('Adjustment status', 'حالة التعديل'), kind: 'text' },
  matchingEntries: { label: L('Matching entries', 'إدخالات متطابقة'), kind: 'count' },
}

function findingDetails(facts: Record<string, unknown>) {
  return Object.entries(facts).flatMap(([key, raw]) => {
    const meta = FACT_LABELS[key]
    if (!meta || raw === null || raw === undefined) return []
    const number = Number(raw)
    const value =
      meta.kind === 'money' && Number.isFinite(number)
        ? `${number.toFixed(2)} JOD`
        : meta.kind === 'percent' && Number.isFinite(number)
          ? `${number.toFixed(2)}%`
          : meta.kind === 'days' && Number.isFinite(number)
            ? `${number} ${number === 1 ? 'day' : 'days'}`
            : String(raw)
    return [{ label: meta.label, value }]
  })
}

function safeLocalized(value: unknown, fallback: { en: string; ar: string }) {
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    if (typeof source.en === 'string' && typeof source.ar === 'string') return { en: source.en, ar: source.ar }
  }
  return fallback
}

function toFinding(row: typeof payrollFindings.$inferSelect, employee: { en: string; ar: string; number: string } | null): PayrollFinding {
  const facts = (row.facts ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    type: row.type as PayrollFinding['type'],
    severity: row.severity,
    status: row.status,
    employee: employee ? { en: employee.en, ar: employee.ar } : null,
    employeeNumber: employee?.number ?? null,
    details: findingDetails(facts),
    explanation: safeLocalized(row.explanation, L('This payroll item needs review.', 'هذا البند في الراتب بحاجة إلى مراجعة.')),
    aiExplanation: row.aiExplanation ? safeLocalized(row.aiExplanation, L('', '')) : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
  }
}

async function auditRecord(auditId: string): Promise<PayrollAudit> {
  const [audit] = await db.select().from(payrollAudits).where(eq(payrollAudits.id, auditId)).limit(1)
  if (!audit) throw new HTTPException(404, { message: 'payrollAuditNotFound' })
  const rows = await db
    .select({ finding: payrollFindings, en: users.fullNameEn, ar: users.fullNameAr, employeeNumber: users.employeeNumber })
    .from(payrollFindings)
    .leftJoin(users, eq(users.id, payrollFindings.userId))
    .where(eq(payrollFindings.auditId, audit.id))
    .orderBy(desc(payrollFindings.severity), desc(payrollFindings.createdAt))
  return {
    id: audit.id,
    runId: audit.runId,
    status: audit.status,
    startedAt: audit.startedAt.toISOString(),
    completedAt: audit.completedAt?.toISOString() ?? null,
    findingCounts: readCounts(audit.summary),
    findings: rows.map((row) =>
      toFinding(
        row.finding,
        row.en && row.ar && row.employeeNumber ? { en: row.en, ar: row.ar, number: row.employeeNumber } : null,
      ),
    ),
  }
}

export async function runPayrollAudit(runId: string, actorId: string): Promise<PayrollAudit> {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1)
  if (!run) throw new HTTPException(404, { message: 'payrollRunNotFound' })
  if (run.status !== 'draft') throw new HTTPException(409, { message: 'payrollRunLocked' })
  if (!run.calculatedAt) throw new HTTPException(422, { message: 'payrollRunNotCalculated' })

  const [alreadyRunning] = await db
    .select({ id: payrollAudits.id })
    .from(payrollAudits)
    .where(and(eq(payrollAudits.runId, run.id), eq(payrollAudits.calculatedAt, run.calculatedAt), eq(payrollAudits.status, 'running')))
    .limit(1)
  if (alreadyRunning) throw new HTTPException(409, { message: 'payrollAuditRunning' })

  const anchor = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`
  const settings = await settingsFor(anchor, actorId)
  const [audit] = await db
    .insert(payrollAudits)
    .values({
      runId: run.id,
      calculatedAt: run.calculatedAt,
      settingsSnapshot: { ...toSettings(settings) },
      startedBy: actorId,
    })
    .returning()
  await logEvent({ runId: run.id, auditId: audit!.id, actorId, eventType: 'PAYROLL_AUDIT_STARTED', status: 'running' })

  try {
    const current = await db.select().from(payslips).where(eq(payslips.runId, run.id))
    if (current.length === 0) throw new HTTPException(422, { message: 'payrollRunEmpty' })
    const userIds = current.map((row) => row.userId)
    const paidOn = current[0]!.paidOn
    const history = await db
      .select()
      .from(payslips)
      .where(and(inArray(payslips.userId, userIds), lt(payslips.paidOn, paidOn)))
      .orderBy(desc(payslips.paidOn))
    const historyByUser = new Map<string, AuditPayslip[]>()
    for (const row of history) {
      const entries = historyByUser.get(row.userId) ?? []
      entries.push(toAuditPayslip(row))
      historyByUser.set(row.userId, entries)
    }

    const range = dayRange(run.periodYear, run.periodMonth)
    const attendance = await db
      .select({ userId: attendanceDays.userId })
      .from(attendanceDays)
      .where(and(inArray(attendanceDays.userId, userIds), eq(attendanceDays.status, 'absent'), gte(attendanceDays.workDate, range.from), lte(attendanceDays.workDate, range.to)))
    const absentByUser = new Map<string, number>()
    for (const row of attendance) absentByUser.set(row.userId, (absentByUser.get(row.userId) ?? 0) + 1)

    const variableRows = await db
      .select()
      .from(payrollAdjustments)
      .where(and(inArray(payrollAdjustments.userId, userIds), gte(payrollAdjustments.effectiveOn, range.from), lte(payrollAdjustments.effectiveOn, range.to)))
    const adjustmentsByUser = new Map<string, AuditAdjustment[]>()
    for (const row of variableRows) {
      const entries = adjustmentsByUser.get(row.userId) ?? []
      entries.push({ id: row.id, kind: row.kind, amount: Number(row.amount), effectiveOn: row.effectiveOn, status: row.status })
      adjustmentsByUser.set(row.userId, entries)
    }

    const ruleSettings = toSettings(settings)
    const findings = current.flatMap((row) =>
      auditPayrollEmployee(
        {
          current: toAuditPayslip(row),
          history: historyByUser.get(row.userId) ?? [],
          absentDays: absentByUser.get(row.userId) ?? 0,
          adjustments: adjustmentsByUser.get(row.userId) ?? [],
        },
        ruleSettings,
      ),
    )
    if (findings.length) {
      await db.insert(payrollFindings).values(
        findings.map((finding) => ({
          auditId: audit!.id,
          userId: finding.userId,
          type: finding.type,
          severity: finding.severity,
          facts: finding.facts,
          explanation: finding.explanation,
        })),
      )
    }
    const counts = zeroCounts()
    for (const finding of findings) counts[finding.severity] += 1
    await db
      .update(payrollAudits)
      .set({ status: 'completed', summary: counts, completedAt: new Date() })
      .where(eq(payrollAudits.id, audit!.id))
    await logEvent({ runId: run.id, auditId: audit!.id, actorId, eventType: 'PAYROLL_AUDIT_COMPLETED', status: 'completed' })
    return auditRecord(audit!.id)
  } catch (error) {
    await db
      .update(payrollAudits)
      .set({ status: 'failed', failure: error instanceof HTTPException ? error.message : 'internal', completedAt: new Date() })
      .where(eq(payrollAudits.id, audit!.id))
    await logEvent({ runId: run.id, auditId: audit!.id, actorId, eventType: 'PAYROLL_AUDIT_COMPLETED', status: 'failed', reason: 'internal' })
    throw error
  }
}

export async function latestAuditForRun(runId: string): Promise<PayrollAudit | null> {
  const [audit] = await db.select({ id: payrollAudits.id }).from(payrollAudits).where(eq(payrollAudits.runId, runId)).orderBy(desc(payrollAudits.startedAt)).limit(1)
  return audit ? auditRecord(audit.id) : null
}

export async function auditOverviews(): Promise<PayrollAuditOverview[]> {
  const rows = await db.select().from(payrollAudits).orderBy(desc(payrollAudits.startedAt)).limit(200)
  const current = new Map<string, typeof rows[number]>()
  for (const row of rows) if (!current.has(row.runId)) current.set(row.runId, row)
  return [...current.values()].map((row) => ({
    id: row.id,
    runId: row.runId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    findingCounts: readCounts(row.summary),
  }))
}

export async function reviewPayrollFinding(findingId: string, actorId: string, input: ReviewPayrollFindingInput) {
  const [row] = await db.select({ finding: payrollFindings, audit: payrollAudits }).from(payrollFindings).innerJoin(payrollAudits, eq(payrollAudits.id, payrollFindings.auditId)).where(eq(payrollFindings.id, findingId)).limit(1)
  if (!row) throw new HTTPException(404, { message: 'payrollFindingNotFound' })
  await db.update(payrollFindings).set({ status: input.status, reviewNote: input.note ?? null, reviewedBy: actorId, reviewedAt: new Date() }).where(eq(payrollFindings.id, findingId))
  await logEvent({ runId: row.audit.runId, auditId: row.audit.id, findingId, actorId, eventType: 'PAYROLL_FINDING_REVIEWED', status: input.status })
  return latestAuditForRun(row.audit.runId)
}

/** Server-side approval gate; UI state never decides whether payroll may be approved. */
export async function assertRunReadyForApproval(runId: string) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1)
  if (!run?.calculatedAt) throw new HTTPException(422, { message: 'payrollAuditRequired' })
  const [audit] = await db
    .select()
    .from(payrollAudits)
    .where(and(eq(payrollAudits.runId, runId), eq(payrollAudits.calculatedAt, run.calculatedAt), eq(payrollAudits.status, 'completed')))
    .orderBy(desc(payrollAudits.completedAt))
    .limit(1)
  if (!audit) throw new HTTPException(422, { message: 'payrollAuditRequired' })
  const [unreviewed] = await db
    .select({ id: payrollFindings.id })
    .from(payrollFindings)
    .where(and(eq(payrollFindings.auditId, audit.id), eq(payrollFindings.status, 'open'), inArray(payrollFindings.severity, ['critical', 'high'])))
    .limit(1)
  if (unreviewed) throw new HTTPException(422, { message: 'payrollFindingsNeedReview' })
  return audit
}

function approvedRunFor(date: string) {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return db.select({ id: payrollRuns.id }).from(payrollRuns).where(and(eq(payrollRuns.periodYear, year), eq(payrollRuns.periodMonth, month), eq(payrollRuns.status, 'approved'))).limit(1)
}

export async function createPayrollAdjustment(input: CreatePayrollAdjustmentInput, actorId: string) {
  const [run] = await approvedRunFor(input.effectiveOn)
  if (run) throw new HTTPException(409, { message: 'runAlreadyApproved' })
  const [employee] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1)
  if (!employee) throw new HTTPException(404, { message: 'employeeNotFound' })
  const [adjustment] = await db.insert(payrollAdjustments).values({ ...input, createdBy: actorId }).returning()
  await logEvent({ actorId, eventType: 'PAYROLL_ADJUSTMENT_CREATED', status: 'pending', reason: adjustment!.id })
  return adjustment!
}

export async function approvePayrollAdjustment(id: string, actorId: string) {
  const [adjustment] = await db.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, id)).limit(1)
  if (!adjustment) throw new HTTPException(404, { message: 'payrollAdjustmentNotFound' })
  if (adjustment.status !== 'pending') throw new HTTPException(409, { message: 'payrollAdjustmentNotPending' })
  const [run] = await approvedRunFor(adjustment.effectiveOn)
  if (run) throw new HTTPException(409, { message: 'runAlreadyApproved' })
  const [fresh] = await db.update(payrollAdjustments).set({ status: 'approved', approvedBy: actorId, approvedAt: new Date() }).where(eq(payrollAdjustments.id, id)).returning()
  await logEvent({ actorId, eventType: 'PAYROLL_ADJUSTMENT_APPROVED', status: 'approved', reason: fresh!.id })
  return fresh!
}

export async function findingForAi(findingId: string) {
  const [row] = await db.select().from(payrollFindings).where(eq(payrollFindings.id, findingId)).limit(1)
  if (!row) throw new HTTPException(404, { message: 'payrollFindingNotFound' })
  return row
}

export async function saveAiExplanation(findingId: string, actorId: string, explanation: { en: string; ar: string } | null) {
  if (explanation) await db.update(payrollFindings).set({ aiExplanation: explanation }).where(eq(payrollFindings.id, findingId))
  const [row] = await db.select({ auditId: payrollFindings.auditId }).from(payrollFindings).where(eq(payrollFindings.id, findingId)).limit(1)
  if (row) await logEvent({ auditId: row.auditId, findingId, actorId, eventType: 'PAYROLL_FINDING_AI_EXPLAINED', status: explanation ? 'completed' : 'unavailable' })
  return explanation
}
