import { and, count, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import type { CopilotPeriod, CopilotPlan, CopilotResult, SessionUser } from '@hr/shared'
import { db } from '../db/client.js'
import { attendanceDays, applications, candidates, jobOpenings, payrollAdjustments, payrollRuns, payrollSettings, payslips, requests, salaryStructures, users } from '../db/schema.js'
import { balanceFor } from '../domain/leave.js'
import { attendanceBetween, summarize } from '../domain/attendance.js'
import { dayKey } from '../domain/workdays.js'
import { presenceOf } from '../domain/presence.js'
import { auditOverviews, latestAuditForRun } from '../payroll/audit.js'

/**
 * Running one of the questions the assistant can answer.
 *
 * Every query here is written by hand and scoped in SQL to what the asker may
 * see. That scoping is the real protection: `teamAttendance` reads
 * `users.managerId = asker.id`, so a manager asking about "the whole company"
 * gets their own team, not because the model was told to be careful, but
 * because there is no query here that would return anything else.
 *
 * None of these functions consult the plan's `intent` to decide permission —
 * that was already settled in the route, against `INTENT_ROLES`, before any of
 * this ran.
 */

/**
 * A date as this machine's calendar sees it, not as UTC does.
 *
 * `toISOString()` converts to UTC first, and Jordan is three hours ahead — so
 * midnight on the first of the month became 21:00 on the last of the previous
 * one, and every "this month" report silently began a day early. The figures
 * were right for the range; the range was wrong, which is harder to notice and
 * worse.
 *
 * Built from the local parts instead, so the day is the day.
 */

export interface ResolvedPeriod {
  from: string
  to: string
  label: { en: string; ar: string }
}

/**
 * Turning a named period into dates, here rather than in the model.
 *
 * A language model asked for "the range for last month" gets it right most of
 * the time, and the times it does not are month boundaries and Januaries — an
 * answer about the wrong month, delivered with the same confidence as a right
 * one. Dates are arithmetic; arithmetic belongs in code.
 */
export function resolvePeriod(
  period: CopilotPeriod | null,
  now = new Date(),
  calendarMonth: { month?: number | null; year?: number | null } = {},
): ResolvedPeriod {
  const y = now.getFullYear()
  const m = now.getMonth()
  const today = dayKey(now)

  switch (period) {
    case 'today':
      return { from: today, to: today, label: { en: 'Today', ar: 'اليوم' } }
    case 'thisWeek': {
      // Week starts Sunday, as the working week does in Jordan.
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay())
      return { from: dayKey(start), to: today, label: { en: 'This week', ar: 'هذا الأسبوع' } }
    }
    case 'lastMonth': {
      const from = new Date(y, m - 1, 1)
      const to = new Date(y, m, 0)
      return { from: dayKey(from), to: dayKey(to), label: { en: 'Last month', ar: 'الشهر الماضي' } }
    }
    case 'lastSixMonths': {
      /* The current partial month plus the five complete months before it. */
      const from = new Date(y, m - 5, 1)
      return { from: dayKey(from), to: today, label: { en: 'Last 6 months', ar: 'آخر 6 أشهر' } }
    }
    case 'calendarMonth': {
      if (!calendarMonth.month) throw new RangeError('calendarMonth requires a month')
      const calendarYear = calendarMonth.year ?? y
      const from = new Date(calendarYear, calendarMonth.month - 1, 1)
      const to = new Date(calendarYear, calendarMonth.month, 0)
      return {
        from: dayKey(from),
        to: dayKey(to),
        label: { en: `Month ${calendarMonth.month}, ${calendarYear}`, ar: `\u0627\u0644\u0634\u0647\u0631 ${calendarMonth.month}\u060c ${calendarYear}` },
      }
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: today, label: { en: 'This year', ar: 'هذه السنة' } }
    case 'thisMonth':
    default:
      return { from: dayKey(new Date(y, m, 1)), to: today, label: { en: 'This month', ar: 'هذا الشهر' } }
  }
}

const L = (en: string, ar: string) => ({ en, ar })

const PAYROLL_RUN_LABEL: Record<string, string> = {
  draft: 'draft · مسودة',
  approved: 'approved · معتمدة',
  paid: 'paid · مدفوعة',
  cancelled: 'cancelled · ملغاة',
}

const PAYROLL_AUDIT_LABEL: Record<string, string> = {
  running: 'running · قيد التحليل',
  completed: 'completed · مكتمل',
  failed: 'failed · تعذّر إكماله',
  stale: 'recalculation needed · يحتاج إعادة حساب',
}

/** Presence, in words a reader of either language recognises. */
const PRESENCE_LABEL = {
  online: L('online', 'متصل'),
  recent: L('recently', 'قريباً'),
  offline: L('offline', 'غير متصل'),
} as const

/** Counts of each attendance status across a set of people and a date range. */
async function attendanceCounts(userIds: string[], from: string, to: string) {
  if (userIds.length === 0) return []
  return db
    .select({ status: attendanceDays.status, total: count() })
    .from(attendanceDays)
    .where(
      and(
        inArray(attendanceDays.userId, userIds),
        gte(attendanceDays.workDate, from),
        lte(attendanceDays.workDate, to),
      ),
    )
    .groupBy(attendanceDays.status)
}

function attendanceStats(rows: { status: string; total: number }[]): CopilotResult {
  const by = new Map(rows.map((r) => [r.status, Number(r.total)]))
  const stat = (key: string, en: string, ar: string) => ({
    label: L(en, ar),
    value: String(by.get(key) ?? 0),
    detail: null,
  })
  return {
    kind: 'stats',
    stats: [
      stat('present', 'Present', 'حضور'),
      stat('late', 'Late', 'تأخير'),
      stat('absent', 'Absent', 'غياب'),
      stat('leave', 'On leave', 'إجازة'),
    ],
  }
}

/** The asker's direct reports. The one query that defines "my team". */
async function directReports(managerId: string) {
  return db
    .select({ id: users.id, en: users.fullNameEn, ar: users.fullNameAr, jobEn: users.jobTitleEn, jobAr: users.jobTitleAr })
    .from(users)
    .where(and(eq(users.managerId, managerId), eq(users.isActive, true)))
}

/** Stage names, so a list of applicants reads in words rather than in codes. */
const STAGE_EN: Record<string, string> = {
  new: 'New',
  underReview: 'Under review',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}
const STAGE_AR: Record<string, string> = {
  new: 'جديد',
  underReview: 'قيد المراجعة',
  shortlisted: 'قائمة مختصرة',
  interview: 'مقابلة',
  offer: 'عرض',
  hired: 'تم التوظيف',
  rejected: 'مرفوض',
}

export async function executeIntent(
  plan: CopilotPlan,
  actor: SessionUser,
): Promise<{ result: CopilotResult; periodLabel: { en: string; ar: string } | null; empty: boolean }> {
  const period = resolvePeriod(plan.period, new Date(), plan)
  const none = { result: { kind: 'none' } as CopilotResult, periodLabel: null, empty: true }

  switch (plan.intent) {
    /* ---------- about the asker ---------- */
    case 'myAttendance': {
      /*
       * The period the question carried, not the month it happens to be.
       *
       * This read the current month whatever was asked, and labelled it "this
       * month" — so "how was my attendance last month" came back with this
       * month's figures under a heading that said otherwise. The plan had the
       * period all along.
       */
      const span = resolvePeriod(plan.period, new Date(), plan)
      const days = await attendanceBetween(actor.id, span.from, span.to)
      const s = summarize(days)
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Present', 'حضور'), value: String(s.present), detail: null },
            { label: L('Late', 'تأخير'), value: String(s.late), detail: null },
            { label: L('Absent', 'غياب'), value: String(s.absent), detail: null },
            { label: L('Hours worked', 'ساعات العمل'), value: (s.totalMs / 3_600_000).toFixed(1), detail: null },
          ],
        },
        periodLabel: span.label,
        empty: days.length === 0,
      }
    }

    case 'myLeaveBalance': {
      const b = await balanceFor(actor.id)
      return {
        result: {
          kind: 'stats',
          stats: [
            {
              label: L('Annual leave left', 'رصيد الإجازة السنوية'),
              value: String(b.annualRemaining),
              detail: L(`of ${b.annualTotal} days`, `من ${b.annualTotal} يوماً`),
            },
            { label: L('Sick leave left', 'رصيد الإجازة المرضية'), value: String(b.sickRemaining), detail: null },
            { label: L('Used this year', 'المستخدم هذه السنة'), value: String(b.usedThisYear), detail: null },
          ],
        },
        periodLabel: null,
        empty: false,
      }
    }

    case 'myRequests': {
      const rows = await db
        .select({ kind: requests.kind, status: requests.status, submittedAt: requests.submittedAt })
        .from(requests)
        .where(eq(requests.userId, actor.id))
        .orderBy(desc(requests.submittedAt))
        .limit(10)
      return {
        result: {
          kind: 'table',
          columns: [L('Request', 'الطلب'), L('Status', 'الحالة'), L('Sent', 'أُرسل')],
          rows: rows.map((r) => [r.kind, r.status, dayKey(r.submittedAt)]),
        },
        periodLabel: null,
        empty: rows.length === 0,
      }
    }

    case 'myPayslips': {
      const rows = await db
        .select({
          paidOn: payslips.paidOn,
          currency: payslips.currency,
          basic: payslips.basic,
          allowances: payslips.allowances,
          deductions: payslips.deductions,
          status: payslips.status,
        })
        .from(payslips)
        .where(eq(payslips.userId, actor.id))
        .orderBy(desc(payslips.paidOn))
        .limit(6)
      return {
        result: {
          kind: 'table',
          columns: [L('Paid on', 'تاريخ الصرف'), L('Net pay', 'صافي الراتب'), L('Status', 'الحالة')],
          // Net is derived the same way the payslip screen derives it, not stored.
          rows: rows.map((r) => [
            String(r.paidOn),
            `${(Number(r.basic) + Number(r.allowances) - Number(r.deductions)).toFixed(2)} ${r.currency}`,
            r.status,
          ]),
        },
        periodLabel: null,
        empty: rows.length === 0,
      }
    }

    /*
     * Payroll Agent: a fixed set of payroll views. The topic is validated by
     * the shared schema and the route has already admitted HR/Admin only.
     * This deliberately has no write branch and no model-written query.
     */
    case 'payrollInsights': {
      const topic = plan.payrollTopic ?? 'summary'
      const year = Number(period.from.slice(0, 4))
      const month = Number(period.from.slice(5, 7))
      const monthStart = `${period.from.slice(0, 7)}-01`
      const monthEnd = `${period.from.slice(0, 5)}${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
      const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.periodYear, year), eq(payrollRuns.periodMonth, month))).limit(1)

      if (topic === 'readiness') {
        const [settings] = await db.select({ confirmed: payrollSettings.confirmed }).from(payrollSettings).where(lte(payrollSettings.effectiveFrom, monthStart)).orderBy(desc(payrollSettings.effectiveFrom)).limit(1)
        const pending = await db.select({ id: payrollAdjustments.id }).from(payrollAdjustments).where(and(gte(payrollAdjustments.effectiveOn, monthStart), lte(payrollAdjustments.effectiveOn, monthEnd), eq(payrollAdjustments.status, 'pending')))
        const audit = run ? await latestAuditForRun(run.id) : null
        const urgent = audit?.findings.filter((finding) => finding.status === 'open' && (finding.severity === 'critical' || finding.severity === 'high')).length ?? 0
        return {
          result: { kind: 'stats', stats: [
            { label: L('Payroll run', 'دورة الرواتب'), value: run ? (PAYROLL_RUN_LABEL[run.status] ?? run.status) : 'not calculated · لم تُحسب بعد', detail: null },
            { label: L('Pending adjustments', 'تعديلات معلّقة'), value: String(pending.length), detail: null },
            { label: L('Payroll audit', 'تدقيق الرواتب'), value: audit ? (PAYROLL_AUDIT_LABEL[audit.status] ?? audit.status) : 'not completed · لم يكتمل بعد', detail: null },
            { label: L('Open blocking findings', 'ملاحظات حرجة أو عالية مفتوحة'), value: String(urgent), detail: null },
            { label: L('Payroll settings', 'إعدادات الرواتب'), value: settings?.confirmed ? 'confirmed · مؤكدة' : 'needs confirmation · تحتاج تأكيدًا', detail: null },
          ] },
          periodLabel: period.label,
          empty: false,
        }
      }

      if (topic === 'adjustments' || topic === 'overtime' || topic === 'bonuses') {
        const kind = topic === 'overtime' ? 'overtime' : topic === 'bonuses' ? 'bonus' : null
        const rows = await db
          .select({ nameEn: users.fullNameEn, nameAr: users.fullNameAr, number: users.employeeNumber, kind: payrollAdjustments.kind, amount: payrollAdjustments.amount, status: payrollAdjustments.status, note: payrollAdjustments.note, effectiveOn: payrollAdjustments.effectiveOn })
          .from(payrollAdjustments)
          .innerJoin(users, eq(users.id, payrollAdjustments.userId))
          .where(and(gte(payrollAdjustments.effectiveOn, monthStart), lte(payrollAdjustments.effectiveOn, monthEnd), ...(kind ? [eq(payrollAdjustments.kind, kind)] : [])))
          .orderBy(desc(payrollAdjustments.amount))
          .limit(25)
        return {
          result: { kind: 'table', columns: [L('Employee', 'الموظف'), L('Type', 'النوع'), L('Amount', 'المبلغ'), L('Status', 'الحالة'), L('Reason', 'السبب')], rows: rows.map((row) => [`${row.nameAr || row.nameEn} · ${row.number}`, row.kind, `${Number(row.amount).toFixed(2)} JOD`, row.status, row.note]) },
          periodLabel: period.label,
          empty: rows.length === 0,
        }
      }

      if (topic === 'contracts') {
        const rows = await db
          .select({ nameEn: users.fullNameEn, nameAr: users.fullNameAr, number: users.employeeNumber, basic: salaryStructures.basic, transport: salaryStructures.transport, housing: salaryStructures.housing, other: salaryStructures.other, currency: salaryStructures.currency, effectiveFrom: salaryStructures.effectiveFrom })
          .from(salaryStructures)
          .innerJoin(users, eq(users.id, salaryStructures.userId))
          .where(and(lte(salaryStructures.effectiveFrom, monthEnd), or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, monthStart))))
          .orderBy(desc(salaryStructures.effectiveFrom))
          .limit(50)
        return {
          result: { kind: 'table', columns: [L('Employee', 'الموظف'), L('Basic', 'الأساسي'), L('Allowances', 'البدلات'), L('Effective from', 'سارٍ من')], rows: rows.map((row) => {
            const allowances = Number(row.transport) + Number(row.housing) + Number(row.other)
            return [`${row.nameAr || row.nameEn} · ${row.number}`, `${Number(row.basic).toFixed(2)} ${row.currency}`, `${allowances.toFixed(2)} ${row.currency}`, row.effectiveFrom]
          }) },
          periodLabel: period.label,
          empty: rows.length === 0,
        }
      }

      if (!run) return { ...none, periodLabel: period.label }
      const slips = await db
        .select({ userId: payslips.userId, nameEn: users.fullNameEn, nameAr: users.fullNameAr, number: users.employeeNumber, basic: payslips.basic, allowances: payslips.allowances, deductions: payslips.deductions, currency: payslips.currency })
        .from(payslips)
        .innerJoin(users, eq(users.id, payslips.userId))
        .where(eq(payslips.runId, run.id))
      if (slips.length === 0) return { ...none, periodLabel: period.label }
      const net = (slip: (typeof slips)[number]) => Number(slip.basic) + Number(slip.allowances) - Number(slip.deductions)

      if (topic === 'deductions' || topic === 'highestNetPay' || topic === 'lowestNetPay') {
        const sorted = [...slips].sort((a, b) => topic === 'deductions' ? Number(b.deductions) - Number(a.deductions) : topic === 'highestNetPay' ? net(b) - net(a) : net(a) - net(b)).slice(0, 20)
        return {
          result: { kind: 'table', columns: topic === 'deductions' ? [L('Employee', 'الموظف'), L('Deductions', 'الخصومات'), L('Net pay', 'صافي الراتب')] : [L('Employee', 'الموظف'), L('Net pay', 'صافي الراتب'), L('Deductions', 'الخصومات')], rows: sorted.map((slip) => [`${slip.nameAr || slip.nameEn} · ${slip.number}`, `${(topic === 'deductions' ? Number(slip.deductions) : net(slip)).toFixed(2)} ${slip.currency}`, `${(topic === 'deductions' ? net(slip) : Number(slip.deductions)).toFixed(2)} ${slip.currency}`]) },
          periodLabel: period.label,
          empty: false,
        }
      }

      if (topic === 'findings') {
        const audit = await latestAuditForRun(run.id)
        const open = audit?.findings.filter((finding) => finding.status === 'open') ?? []
        return {
          result: { kind: 'people', people: open.slice(0, 20).map((finding) => ({ name: finding.employee ?? L('Payroll review', 'مراجعة الرواتب'), detail: L(`${finding.type} · ${finding.severity}`, `${finding.type} · ${finding.severity}`), tone: finding.severity === 'critical' || finding.severity === 'high' ? 'bad' as const : 'warning' as const })) },
          periodLabel: period.label,
          empty: open.length === 0,
        }
      }

      const gross = slips.reduce((total, slip) => total + Number(slip.basic) + Number(slip.allowances), 0)
      const deductions = slips.reduce((total, slip) => total + Number(slip.deductions), 0)
      const currentNet = gross - deductions
      const currency = slips[0]?.currency ?? 'JOD'
      if (topic === 'variance') {
        const previousDate = new Date(year, month - 2, 1)
        const [previousRun] = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(and(eq(payrollRuns.periodYear, previousDate.getFullYear()), eq(payrollRuns.periodMonth, previousDate.getMonth() + 1))).limit(1)
        const previous = previousRun ? await db.select({ basic: payslips.basic, allowances: payslips.allowances, deductions: payslips.deductions }).from(payslips).where(eq(payslips.runId, previousRun.id)) : []
        const previousNet = previous.reduce((total, slip) => total + Number(slip.basic) + Number(slip.allowances) - Number(slip.deductions), 0)
        const change = currentNet - previousNet
        return {
          result: { kind: 'stats', stats: [
            { label: L('Current net pay', 'صافي الرواتب الحالي'), value: `${currentNet.toFixed(2)} ${currency}`, detail: null },
            { label: L('Previous net pay', 'صافي الرواتب السابق'), value: previousRun ? `${previousNet.toFixed(2)} ${currency}` : 'no previous run · لا توجد دورة سابقة', detail: null },
            { label: L('Change', 'الفرق'), value: previousRun ? `${change >= 0 ? '+' : ''}${change.toFixed(2)} ${currency}` : '—', detail: previousRun && previousNet !== 0 ? L(`${((change / previousNet) * 100).toFixed(1)}%`, `${((change / previousNet) * 100).toFixed(1)}%`) : null },
          ] },
          periodLabel: period.label,
          empty: false,
        }
      }

      return {
        result: { kind: 'stats', stats: [
          { label: L('Employees', 'الموظفون'), value: String(slips.length), detail: L(`Run ${run.status}`, `حالة الدورة: ${PAYROLL_RUN_LABEL[run.status] ?? run.status}`) },
          { label: L('Gross pay', 'إجمالي الاستحقاقات'), value: `${gross.toFixed(2)} ${currency}`, detail: null },
          { label: L('Deductions', 'إجمالي الخصومات'), value: `${deductions.toFixed(2)} ${currency}`, detail: null },
          { label: L('Net pay', 'صافي الرواتب'), value: `${currentNet.toFixed(2)} ${currency}`, detail: null },
        ] },
        periodLabel: period.label,
        empty: false,
      }
    }

    /* ---------- Payroll Agent (HR/Admin only; route gates this before SQL) ---------- */
    case 'payrollReadiness': {
      const year = Number(period.from.slice(0, 4))
      const month = Number(period.from.slice(5, 7))
      const monthStart = `${period.from.slice(0, 7)}-01`
      const monthEnd = `${period.from.slice(0, 5)}${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
      const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.periodYear, year), eq(payrollRuns.periodMonth, month))).limit(1)
      const [settings] = await db
        .select({ confirmed: payrollSettings.confirmed })
        .from(payrollSettings)
        .where(lte(payrollSettings.effectiveFrom, monthStart))
        .orderBy(desc(payrollSettings.effectiveFrom))
        .limit(1)
      const pending = await db
        .select({ id: payrollAdjustments.id })
        .from(payrollAdjustments)
        .where(and(gte(payrollAdjustments.effectiveOn, monthStart), lte(payrollAdjustments.effectiveOn, monthEnd), eq(payrollAdjustments.status, 'pending')))
      const audit = run ? await latestAuditForRun(run.id) : null
      const urgent = audit?.findings.filter((finding) => finding.status === 'open' && (finding.severity === 'critical' || finding.severity === 'high')).length ?? 0
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Payroll run', 'دورة الرواتب'), value: run ? (PAYROLL_RUN_LABEL[run.status] ?? run.status) : 'not calculated · لم تُحسب بعد', detail: null },
            { label: L('Pending adjustments', 'تعديلات معلّقة'), value: String(pending.length), detail: null },
            { label: L('Payroll audit', 'تدقيق الرواتب'), value: audit ? (PAYROLL_AUDIT_LABEL[audit.status] ?? audit.status) : 'not completed · لم يكتمل بعد', detail: null },
            { label: L('Open blocking findings', 'ملاحظات حرجة أو عالية مفتوحة'), value: String(urgent), detail: null },
            { label: L('Payroll settings', 'إعدادات الرواتب'), value: settings?.confirmed ? 'confirmed · مؤكدة' : 'needs confirmation · تحتاج تأكيدًا', detail: settings ? L(settings.confirmed ? 'Confirmed by payroll owner' : 'Awaiting accountant confirmation', settings.confirmed ? 'مؤكدة من مسؤول الرواتب' : 'بانتظار تأكيد المحاسب') : L('No settings for this month', 'لا توجد إعدادات لهذا الشهر') },
          ],
        },
        periodLabel: period.label,
        empty: false,
      }
    }

    case 'payrollRunSummary': {
      const year = Number(period.from.slice(0, 4))
      const month = Number(period.from.slice(5, 7))
      const [run] = await db.select({ id: payrollRuns.id, status: payrollRuns.status }).from(payrollRuns).where(and(eq(payrollRuns.periodYear, year), eq(payrollRuns.periodMonth, month))).limit(1)
      if (!run) return { ...none, periodLabel: period.label }
      const slips = await db
        .select({ basic: payslips.basic, allowances: payslips.allowances, deductions: payslips.deductions, currency: payslips.currency })
        .from(payslips)
        .where(eq(payslips.runId, run.id))
      if (slips.length === 0) return { ...none, periodLabel: period.label }
      const gross = slips.reduce((total, slip) => total + Number(slip.basic) + Number(slip.allowances), 0)
      const deductions = slips.reduce((total, slip) => total + Number(slip.deductions), 0)
      const currency = slips[0]?.currency ?? 'JOD'
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Employees', 'الموظفون'), value: String(slips.length), detail: L(`Run ${run.status}`, `حالة الدورة: ${PAYROLL_RUN_LABEL[run.status] ?? run.status}`) },
            { label: L('Gross pay', 'إجمالي الاستحقاقات'), value: `${gross.toFixed(2)} ${currency}`, detail: null },
            { label: L('Deductions', 'إجمالي الخصومات'), value: `${deductions.toFixed(2)} ${currency}`, detail: null },
            { label: L('Net pay', 'صافي الرواتب'), value: `${(gross - deductions).toFixed(2)} ${currency}`, detail: null },
          ],
        },
        periodLabel: period.label,
        empty: false,
      }
    }

    /* ---------- a manager's own reports ---------- */
    case 'teamRoster': {
      const team = await directReports(actor.id)
      return {
        result: {
          kind: 'people',
          people: team.map((t) => ({ name: L(t.en, t.ar), detail: L(t.jobEn, t.jobAr), tone: 'neutral' as const })),
        },
        periodLabel: null,
        empty: team.length === 0,
      }
    }

    case 'teamPresentNow': {
      const team = await directReports(actor.id)
      if (team.length === 0) return none
      const rows = await db
        .select({ id: users.id, lastSeenAt: users.lastSeenAt })
        .from(users)
        .where(inArray(users.id, team.map((t) => t.id)))
      const seen = new Map(rows.map((r) => [r.id, r.lastSeenAt]))
      return {
        result: {
          kind: 'people',
          people: team.map((t) => {
            const p = presenceOf(seen.get(t.id) ?? null)
            return {
              name: L(t.en, t.ar),
              detail: PRESENCE_LABEL[p],
              tone: p === 'online' ? ('good' as const) : p === 'recent' ? ('warning' as const) : ('neutral' as const),
            }
          }),
        },
        periodLabel: L('Right now', 'الآن'),
        empty: false,
      }
    }

    case 'teamAttendance': {
      const team = await directReports(actor.id)
      if (team.length === 0) return none
      const rows = await attendanceCounts(team.map((t) => t.id), period.from, period.to)
      return { result: attendanceStats(rows), periodLabel: period.label, empty: rows.length === 0 }
    }

    case 'teamOnLeave': {
      const team = await directReports(actor.id)
      if (team.length === 0) return none
      const rows = await db
        .select({ userId: attendanceDays.userId, workDate: attendanceDays.workDate })
        .from(attendanceDays)
        .where(
          and(
            inArray(attendanceDays.userId, team.map((t) => t.id)),
            eq(attendanceDays.status, 'leave'),
            gte(attendanceDays.workDate, period.from),
            lte(attendanceDays.workDate, period.to),
          ),
        )
      const byUser = new Map<string, number>()
      for (const r of rows) byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + 1)
      const named = team.filter((t) => byUser.has(t.id))
      return {
        result: {
          kind: 'people',
          people: named.map((t) => ({
            name: L(t.en, t.ar),
            detail: L(`${byUser.get(t.id)} days`, `${byUser.get(t.id)} أيام`),
            tone: 'warning' as const,
          })),
        },
        periodLabel: period.label,
        empty: named.length === 0,
      }
    }

    case 'teamPendingApprovals': {
      const team = await directReports(actor.id)
      if (team.length === 0) return none
      const rows = await db
        .select({ kind: requests.kind, total: count() })
        .from(requests)
        .where(and(inArray(requests.userId, team.map((t) => t.id)), eq(requests.status, 'pending')))
        .groupBy(requests.kind)
      return {
        result: {
          kind: 'stats',
          stats: rows.map((r) => ({ label: L(r.kind, r.kind), value: String(r.total), detail: null })),
        },
        periodLabel: null,
        empty: rows.length === 0,
      }
    }

    /* ---------- the organisation ---------- */
    case 'headcount': {
      const [total] = await db.select({ n: count() }).from(users).where(eq(users.isActive, true))
      const byDept = await db
        .select({ dept: users.departmentAr, deptEn: users.departmentEn, n: count() })
        .from(users)
        .where(eq(users.isActive, true))
        .groupBy(users.departmentAr, users.departmentEn)
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Employees', 'الموظفون'), value: String(total?.n ?? 0), detail: null },
            ...byDept.map((d) => ({ label: L(d.deptEn, d.dept), value: String(d.n), detail: null })),
          ],
        },
        periodLabel: null,
        empty: (total?.n ?? 0) === 0,
      }
    }

    case 'departmentBreakdown': {
      const rows = await db
        .select({ deptEn: users.departmentEn, deptAr: users.departmentAr, n: count() })
        .from(users)
        .where(eq(users.isActive, true))
        .groupBy(users.departmentEn, users.departmentAr)
      const filtered = plan.department
        ? rows.filter((r) =>
            [r.deptEn, r.deptAr].some((d) => d.toLowerCase().includes(plan.department!.toLowerCase())),
          )
        : rows
      return {
        result: {
          kind: 'table',
          columns: [L('Department', 'القسم'), L('People', 'العدد')],
          rows: filtered.map((r) => [r.deptAr || r.deptEn, String(r.n)]),
        },
        periodLabel: null,
        empty: filtered.length === 0,
      }
    }

    case 'orgAttendance': {
      const staff = await db
        .select({ id: users.id, deptEn: users.departmentEn, deptAr: users.departmentAr })
        .from(users)
        .where(eq(users.isActive, true))
      const scoped = plan.department
        ? staff.filter((s) =>
            [s.deptEn, s.deptAr].some((d) => d.toLowerCase().includes(plan.department!.toLowerCase())),
          )
        : staff
      const rows = await attendanceCounts(scoped.map((s) => s.id), period.from, period.to)
      return { result: attendanceStats(rows), periodLabel: period.label, empty: rows.length === 0 }
    }

    case 'orgLeaveSummary': {
      const rows = await db
        .select({ n: count() })
        .from(attendanceDays)
        .where(
          and(
            eq(attendanceDays.status, 'leave'),
            gte(attendanceDays.workDate, period.from),
            lte(attendanceDays.workDate, period.to),
          ),
        )
      const pending = await db
        .select({ n: count() })
        .from(requests)
        .where(and(eq(requests.kind, 'leave'), eq(requests.status, 'pending')))
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Leave days taken', 'أيام إجازة مأخوذة'), value: String(rows[0]?.n ?? 0), detail: null },
            { label: L('Requests pending', 'طلبات معلّقة'), value: String(pending[0]?.n ?? 0), detail: null },
          ],
        },
        periodLabel: period.label,
        empty: false,
      }
    }

    case 'recruitmentSummary': {
      const [open] = await db
        .select({ n: count() })
        .from(jobOpenings)
        .where(eq(jobOpenings.status, 'open'))
      const [apps] = await db.select({ n: count() }).from(applications)
      const byStatus = await db
        .select({ status: applications.status, n: count() })
        .from(applications)
        .groupBy(applications.status)
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Open vacancies', 'وظائف مفتوحة'), value: String(open?.n ?? 0), detail: null },
            { label: L('Applications', 'الطلبات'), value: String(apps?.n ?? 0), detail: null },
            ...byStatus.map((s) => ({ label: L(s.status, s.status), value: String(s.n), detail: null })),
          ],
        },
        periodLabel: null,
        empty: (open?.n ?? 0) === 0 && (apps?.n ?? 0) === 0,
      }
    }

    case 'openJobOpenings': {
      const openings = await db
        .select({
          titleEn: jobOpenings.titleEn,
          titleAr: jobOpenings.titleAr,
          departmentEn: jobOpenings.departmentEn,
          departmentAr: jobOpenings.departmentAr,
          locationEn: jobOpenings.locationEn,
          locationAr: jobOpenings.locationAr,
        })
        .from(jobOpenings)
        .where(eq(jobOpenings.status, 'open'))
        .orderBy(desc(jobOpenings.openedOn))
        .limit(20)
      return {
        result: {
          kind: 'people',
          people: openings.map((opening) => ({
            name: L(opening.titleEn, opening.titleAr),
            detail: L(
              [opening.departmentEn, opening.locationEn].filter(Boolean).join(' · ') || 'Open vacancy',
              [opening.departmentAr, opening.locationAr].filter(Boolean).join(' · ') || '\u0648\u0638\u064a\u0641\u0629 \u0645\u0641\u062a\u0648\u062d\u0629',
            ),
            tone: 'good' as const,
          })),
        },
        periodLabel: null,
        empty: openings.length === 0,
      }
    }

    case 'whoIsPresentNow': {
      const staff = await db
        .select({ id: users.id, en: users.fullNameEn, ar: users.fullNameAr, lastSeenAt: users.lastSeenAt })
        .from(users)
        .where(eq(users.isActive, true))
      const present = staff
        .map((s) => ({ ...s, p: presenceOf(s.lastSeenAt) }))
        .filter((s) => s.p !== 'offline')
      return {
        result: {
          kind: 'people',
          people: present.map((s) => ({
            name: L(s.en, s.ar),
            detail: PRESENCE_LABEL[s.p],
            tone: s.p === 'online' ? ('good' as const) : ('warning' as const),
          })),
        },
        periodLabel: L('Right now', 'الآن'),
        empty: present.length === 0,
      }
    }

    /**
     * People ranked by attendance.
     *
     * The population comes from who is asking, not from the question: a manager
     * ranks their own reports, HR and an administrator rank everyone. That is
     * the same rule every other query here follows, and it is why "who has the
     * best attendance" is a safe question for a manager to ask — there is no
     * form of it that reaches somebody else's team.
     *
     * Ties are ordered by name so the same data always produces the same list.
     * A ranking that reshuffles between refreshes reads as the numbers changing.
     */
    case 'attendanceRanking': {
      const people =
        actor.role === 'manager'
          ? await directReports(actor.id)
          : await db
              .select({
                id: users.id,
                en: users.fullNameEn,
                ar: users.fullNameAr,
                jobEn: users.jobTitleEn,
                jobAr: users.jobTitleAr,
              })
              .from(users)
              .where(eq(users.isActive, true))

      if (people.length === 0) return none

      const by = plan.rankBy ?? 'present'
      const rows = await db
        .select({ userId: attendanceDays.userId, total: count() })
        .from(attendanceDays)
        .where(
          and(
            inArray(attendanceDays.userId, people.map((p) => p.id)),
            eq(attendanceDays.status, by),
            gte(attendanceDays.workDate, period.from),
            lte(attendanceDays.workDate, period.to),
          ),
        )
        .groupBy(attendanceDays.userId)

      const counts = new Map(rows.map((r) => [r.userId, Number(r.total)]))
      const ranked = people
        .map((p) => ({ ...p, n: counts.get(p.id) ?? 0 }))
        .sort((a, b) => b.n - a.n || a.en.localeCompare(b.en))
        .slice(0, 10)

      // Everyone on zero means nothing was recorded, which is not a ranking.
      if (ranked.every((r) => r.n === 0)) return { ...none, periodLabel: period.label }

      const unit = {
        present: L('days present', 'يوم حضور'),
        absent: L('days absent', 'يوم غياب'),
        late: L('days late', 'يوم تأخير'),
      }[by]

      return {
        result: {
          kind: 'people',
          people: ranked.map((r) => ({
            name: L(r.en, r.ar),
            detail: L(`${r.n} ${unit.en}`, `${r.n} ${unit.ar}`),
            tone: by === 'present' ? ('good' as const) : ('warning' as const),
          })),
        },
        periodLabel: period.label,
        empty: false,
      }
    }

    /**
     * The applicants, rather than how many of them there are.
     *
     * `recruitmentSummary` answers "how is hiring going" with counts;
     * this answers "who applied" with people. They were one intent at first and
     * the counts won every time, which made the question about a person
     * unanswerable — a summary cannot be drilled into.
     *
     * Capped, because a long-running vacancy accumulates hundreds and a list
     * that long is not read, it is scrolled past.
     */
    case 'listApplications': {
      const rows = await db
        .select({
          name: candidates.fullName,
          status: applications.status,
          title: jobOpenings.titleEn,
          titleAr: jobOpenings.titleAr,
          at: applications.appliedAt,
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
        .orderBy(desc(applications.appliedAt))
        .limit(25)

      if (rows.length === 0) return none
      return {
        result: {
          kind: 'people',
          people: rows.map((r) => ({
            name: L(r.name, r.name),
            detail: L(`${r.title} — ${STAGE_EN[r.status] ?? r.status}`, `${r.titleAr} — ${STAGE_AR[r.status] ?? r.status}`),
            tone:
              r.status === 'hired' ? ('good' as const)
              : r.status === 'rejected' ? ('bad' as const)
              : ('neutral' as const),
          })),
        },
        periodLabel: null,
        empty: false,
      }
    }

    /* Payroll audit data is available only after the intent gate has admitted
       HR/Admin.  These calls expose stored, deterministic findings; the model
       does not build a query or choose who is in scope. */
    case 'payrollAuditSummary': {
      const [latest] = await auditOverviews()
      if (!latest) return none
      return {
        result: {
          kind: 'stats',
          stats: [
            { label: L('Critical findings', 'ملاحظات حرجة'), value: String(latest.findingCounts.critical), detail: null },
            { label: L('High findings', 'ملاحظات عالية'), value: String(latest.findingCounts.high), detail: null },
            { label: L('Medium findings', 'ملاحظات متوسطة'), value: String(latest.findingCounts.medium), detail: null },
            { label: L('Low findings', 'ملاحظات منخفضة'), value: String(latest.findingCounts.low), detail: null },
          ],
        },
        periodLabel: null,
        empty: false,
      }
    }

    case 'payrollFindings': {
      const [latest] = await auditOverviews()
      if (!latest) return none
      const audit = await latestAuditForRun(latest.runId)
      const open = audit?.findings.filter((finding) => finding.status === 'open') ?? []
      if (open.length === 0) return { ...none, periodLabel: null }
      const labels: Record<string, { en: string; ar: string }> = {
        salaryChange: L('Material pay change', 'تغيّر ملحوظ في الراتب'),
        deductionChange: L('Material deduction change', 'تغيّر ملحوظ في الخصومات'),
        unpaidAbsenceMismatch: L('Absence mismatch', 'عدم تطابق الغياب'),
        duplicateAllowance: L('Duplicate earning line', 'بند استحقاق مكرّر'),
        netPayOutlier: L('Unusual net pay', 'صافي راتب غير معتاد'),
        highOvertime: L('High overtime', 'عمل إضافي مرتفع'),
        unapprovedBonus: L('Unapproved bonus', 'مكافأة غير معتمدة'),
        duplicateAdjustment: L('Duplicate adjustment', 'تعديل مكرّر'),
      }
      return {
        result: {
          kind: 'people',
          people: open.slice(0, 20).map((finding) => ({
            name: finding.employee ?? L('Payroll review', 'مراجعة الرواتب'),
            detail: L(
              `${labels[finding.type]?.en ?? finding.type} — ${finding.severity}`,
              `${labels[finding.type]?.ar ?? finding.type} — ${finding.severity}`,
            ),
            tone: finding.severity === 'critical' || finding.severity === 'high' ? ('bad' as const) : ('warning' as const),
          })),
        },
        periodLabel: null,
        empty: false,
      }
    }

    case 'outOfScope':
    default:
      return none
  }
}
