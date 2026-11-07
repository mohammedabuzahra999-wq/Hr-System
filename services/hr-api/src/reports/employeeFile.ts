import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { HrReport, ReportSection, SessionUser } from '@hr/shared'
import type { CopilotPeriod } from '@hr/shared'
import { db } from '../db/client.js'
import {
  attendanceDays,
  cvFiles,
  documents,
  leaveBalances,
  payslips,
  requests,
  salaryStructures,
  users,
} from '../db/schema.js'
import { resolvePeriod } from '../copilot/execute.js'

/**
 * One employee, in full, as a report.
 *
 * This is the question HR is actually asked on the telephone: how much leave is
 * left, was there absence this month, what are they paid, is a CV on file, is
 * anything waiting on them. Built as a report so it prints and files like every
 * other one rather than becoming a fourth way of showing things.
 *
 * Two things depend on who is asking, and both are decided here rather than
 * described to a model:
 *
 *  - A manager sees only their own reports. Anybody else comes back as *not
 *    found* — not "forbidden", which would confirm that the person exists and
 *    quietly turn this into a directory of the whole company.
 *  - A manager does not see pay. Those sections are absent rather than present
 *    and blanked, so there is nothing to uncover by looking closely.
 */

const L = (en: string, ar: string) => ({ en, ar })

type EmployeeIdentifier = { employeeNumber: string | null; personName: string | null }

function foldArabicName(value: string) {
  return value.replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627').replace(/\u0649/g, '\u064a').replace(/\u0629/g, '\u0647')
}

/** Resolves exactly one employee, and applies the caller's scope before any pay is read. */
async function employeeForReport(identifier: EmployeeIdentifier, actor: SessionUser) {
  const number = identifier.employeeNumber?.trim().toLowerCase()
  const name = identifier.personName?.trim().toLowerCase()
  const foldedName = name ? foldArabicName(name) : null
  if (!number && !name) return null

  const matches = await db
    .select()
    .from(users)
    .where(
      number
        ? sql`lower(${users.employeeNumber}) = ${number}`
        : sql`lower(${users.fullNameEn}) like ${`%${name}%`} or lower(${users.fullNameAr}) like ${`%${name}%`} or translate(lower(${users.fullNameAr}), 'أإآٱىة', 'ااايه') like ${`%${foldedName}%`}`,
    )
    .limit(2)

  /* A partial name must not choose somebody on the caller's behalf. */
  if (matches.length !== 1) return null
  const person = matches[0]!
  if (actor.role === 'manager' && person.managerId !== actor.id && person.id !== actor.id) return null
  return person
}

export async function buildEmployeeFile(
  identifier: EmployeeIdentifier,
  actor: SessionUser,
  options: { period: CopilotPeriod | null; month: number | null; year: number | null; now?: Date } = {
    period: null,
    month: null,
    year: null,
  },
): Promise<Omit<HrReport, 'summary' | 'findings'> | null> {
  const person = await employeeForReport(identifier, actor)
  if (!person) return null

  const now = options.now ?? new Date()
  const p = resolvePeriod(options.period, now, { month: options.month, year: options.year })
  const sections: ReportSection[] = []

  const [manager] = person.managerId
    ? await db
        .select({ en: users.fullNameEn, ar: users.fullNameAr })
        .from(users)
        .where(eq(users.id, person.managerId))
    : []

  sections.push({
    kind: 'table',
    heading: L('Details', 'البيانات'),
    columns: [L('Field', 'الحقل'), L('Value', 'القيمة')],
    rows: [
      ['الرقم الوظيفي', person.employeeNumber],
      ['المسمّى الوظيفي', person.jobTitleAr || person.jobTitleEn],
      ['القسم', person.departmentAr || person.departmentEn],
      ['المدير المباشر', manager ? manager.ar || manager.en : '—'],
      ['تاريخ المباشرة', String(person.joinedOn)],
      ['البريد', person.email],
      ['الحالة', person.isActive ? 'مفعّل' : 'معطّل'],
    ],
    note: null,
  })

  const counts = await db
    .select({ status: attendanceDays.status, total: count() })
    .from(attendanceDays)
    .where(
      and(
        inArray(attendanceDays.userId, [person.id]),
        gte(attendanceDays.workDate, p.from),
        lte(attendanceDays.workDate, p.to),
      ),
    )
    .groupBy(attendanceDays.status)

  const by = new Map(counts.map((r) => [r.status, Number(r.total)]))
  const [balance] = await db.select().from(leaveBalances).where(eq(leaveBalances.userId, person.id)).limit(1)

  sections.push({
    kind: 'stats',
    heading: L('This month, and leave', 'هذا الشهر، والإجازات'),
    stats: [
      { label: L('Present', 'حضور'), value: String(by.get('present') ?? 0), detail: null },
      { label: L('Late', 'تأخير'), value: String(by.get('late') ?? 0), detail: null },
      { label: L('Absent', 'غياب'), value: String(by.get('absent') ?? 0), detail: null },
      {
        label: L('Annual leave left', 'رصيد الإجازة السنوية'),
        value: balance ? String(Number(balance.annualTotal) - Number(balance.annualUsed)) : '—',
        detail: balance ? L(`of ${balance.annualTotal}`, `من ${balance.annualTotal}`) : null,
      },
      {
        label: L('Sick leave left', 'رصيد الإجازة المرضية'),
        value: balance ? String(Number(balance.sickTotal) - Number(balance.sickUsed)) : '—',
        detail: null,
      },
    ],
  })

  const reqs = await db
    .select()
    .from(requests)
    .where(eq(requests.userId, person.id))
    // Pending first: those are the ones somebody is waiting on.
    .orderBy(sql`case when ${requests.status} = 'pending' then 0 else 1 end`, desc(requests.submittedAt))
    .limit(10)

  if (reqs.length > 0) {
    sections.push({
      kind: 'table',
      heading: L('Requests', 'الطلبات'),
      columns: [L('Type', 'النوع'), L('Status', 'الحالة'), L('Dates', 'التواريخ'), L('Sent', 'أُرسل')],
      rows: reqs.map((r) => [
        r.kind,
        r.status,
        r.leaveFrom ? `${r.leaveFrom} → ${r.leaveTo}` : '—',
        r.submittedAt.toISOString().slice(0, 10),
      ]),
      note: null,
    })
  }

  const docs = await db.select().from(documents).where(eq(documents.userId, person.id))
  const cvs = await db
    .select({ fileName: cvFiles.fileName, at: cvFiles.uploadedAt })
    .from(cvFiles)
    .where(eq(cvFiles.userId, person.id))
    .orderBy(desc(cvFiles.uploadedAt))

  if (docs.length > 0 || cvs.length > 0) {
    sections.push({
      kind: 'table',
      heading: L('Files on record', 'الملفات المحفوظة'),
      columns: [L('Kind', 'النوع'), L('File', 'الملف'), L('Added', 'أُضيف')],
      rows: [
        ...cvs.map((c) => ['السيرة الذاتية', c.fileName, c.at.toISOString().slice(0, 10)]),
        ...docs.map((d) => [d.kind, d.fileName, String(d.issuedOn)]),
      ],
      note: null,
    })
  }

  /* pay — never for a manager */
  if (actor.role !== 'manager') {
    const [salary] = await db
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.userId, person.id))
      .orderBy(desc(salaryStructures.effectiveFrom))
      .limit(1)

    if (salary) {
      sections.push({
        kind: 'stats',
        heading: L('Contracted pay', 'الراتب المتعاقد عليه'),
        stats: [
          { label: L('Basic', 'الأساسي'), value: Number(salary.basic).toFixed(2), detail: null },
          { label: L('Transport', 'مواصلات'), value: Number(salary.transport).toFixed(2), detail: null },
          { label: L('Housing', 'سكن'), value: Number(salary.housing).toFixed(2), detail: null },
          { label: L('In force since', 'ساري من'), value: String(salary.effectiveFrom), detail: null },
        ],
      })
    }

    const slips = await db
      .select({
        paidOn: payslips.paidOn,
        basic: payslips.basic,
        allow: payslips.allowances,
        ded: payslips.deductions,
      })
      .from(payslips)
      .where(eq(payslips.userId, person.id))
      .orderBy(desc(payslips.paidOn))
      .limit(6)

    if (slips.length > 0) {
      sections.push({
        kind: 'table',
        heading: L('Recent payslips', 'آخر كشوف الرواتب'),
        columns: [
          L('Paid on', 'تاريخ الصرف'),
          L('Basic', 'الأساسي'),
          L('Allowances', 'البدلات'),
          L('Deductions', 'الخصومات'),
          L('Net', 'الصافي'),
        ],
        rows: slips.map((s) => [
          String(s.paidOn),
          Number(s.basic).toFixed(2),
          Number(s.allow).toFixed(2),
          Number(s.ded).toFixed(2),
          (Number(s.basic) + Number(s.allow) - Number(s.ded)).toFixed(2),
        ]),
        note: null,
      })
    }
  }

  return {
    type: 'employeeFile',
    title: L(`Employee file — ${person.fullNameEn}`, `ملف الموظّف — ${person.fullNameAr}`),
    period: L(`${p.from} to ${p.to}`, `من ${p.from} إلى ${p.to}`),
    scope: L(person.employeeNumber, person.employeeNumber),
    generatedAt: now.toISOString(),
    generatedBy: actor.fullName,
    sections,
  }
}

/**
 * A narrow payroll document for one person.
 *
 * This is deliberately separate from the general employee file: a request for
 * a salary report should not bring unrelated attendance, leave or document data
 * into the report. Managers cannot receive it because their employee-file view
 * intentionally excludes pay as well.
 */
export async function buildEmployeePayrollReport(
  identifier: EmployeeIdentifier,
  actor: SessionUser,
  options: { period: CopilotPeriod | null; month: number | null; year: number | null; now?: Date },
): Promise<Omit<HrReport, 'summary' | 'findings'> | null> {
  if (actor.role !== 'hr' && actor.role !== 'admin') return null

  const person = await employeeForReport(identifier, actor)
  if (!person) return null

  const now = options.now ?? new Date()
  const period = resolvePeriod(options.period, now, { month: options.month, year: options.year })
  const [contract] = await db
    .select()
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.userId, person.id),
        lte(salaryStructures.effectiveFrom, period.to),
        or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, period.from)),
      ),
    )
    .orderBy(desc(salaryStructures.effectiveFrom))
    .limit(1)

  const slips = await db
    .select({
      paidOn: payslips.paidOn,
      currency: payslips.currency,
      basic: payslips.basic,
      allowances: payslips.allowances,
      deductions: payslips.deductions,
      status: payslips.status,
    })
    .from(payslips)
    .where(and(eq(payslips.userId, person.id), gte(payslips.paidOn, period.from), lte(payslips.paidOn, period.to)))
    .orderBy(desc(payslips.paidOn))

  const totals = new Map<string, { gross: number; deductions: number; net: number }>()
  for (const slip of slips) {
    const current = totals.get(slip.currency) ?? { gross: 0, deductions: 0, net: 0 }
    const gross = Number(slip.basic) + Number(slip.allowances)
    current.gross += gross
    current.deductions += Number(slip.deductions)
    current.net += gross - Number(slip.deductions)
    totals.set(slip.currency, current)
  }
  const amount = (pick: (total: { gross: number; deductions: number; net: number }) => number) =>
    totals.size === 0
      ? '—'
      : [...totals.entries()].map(([currency, total]) => `${pick(total).toFixed(2)} ${currency}`).join(' · ')

  const sections: ReportSection[] = [
    {
      kind: 'stats',
      heading: L('Payroll summary', 'ملخّص الرواتب'),
      stats: [
        { label: L('Payslips issued', 'كشوف الرواتب الصادرة'), value: String(slips.length), detail: null },
        { label: L('Gross pay', 'إجمالي الاستحقاقات'), value: amount((total) => total.gross), detail: null },
        { label: L('Deductions', 'إجمالي الخصومات'), value: amount((total) => total.deductions), detail: null },
        { label: L('Net pay', 'صافي الراتب'), value: amount((total) => total.net), detail: null },
      ],
    },
  ]

  if (contract) {
    const currency = contract.currency
    sections.push({
      kind: 'stats',
      heading: L('Contracted monthly pay', 'الراتب الشهري المتعاقد عليه'),
      stats: [
        { label: L('Basic', 'الأساسي'), value: `${Number(contract.basic).toFixed(2)} ${currency}`, detail: null },
        { label: L('Transport', 'المواصلات'), value: `${Number(contract.transport).toFixed(2)} ${currency}`, detail: null },
        { label: L('Housing', 'السكن'), value: `${Number(contract.housing).toFixed(2)} ${currency}`, detail: null },
        { label: L('Other', 'بدلات أخرى'), value: `${Number(contract.other).toFixed(2)} ${currency}`, detail: null },
      ],
    })
  }

  sections.push({
    kind: 'table',
    heading: L('Payslips in this period', 'كشوف الرواتب ضمن الفترة'),
    columns: [
      L('Paid on', 'تاريخ الصرف'),
      L('Basic', 'الأساسي'),
      L('Allowances', 'البدلات'),
      L('Deductions', 'الخصومات'),
      L('Net', 'الصافي'),
      L('Status', 'الحالة'),
    ],
    rows: slips.map((slip) => [
      String(slip.paidOn),
      `${Number(slip.basic).toFixed(2)} ${slip.currency}`,
      `${Number(slip.allowances).toFixed(2)} ${slip.currency}`,
      `${Number(slip.deductions).toFixed(2)} ${slip.currency}`,
      `${(Number(slip.basic) + Number(slip.allowances) - Number(slip.deductions)).toFixed(2)} ${slip.currency}`,
      slip.status,
    ]),
    note: slips.length === 0 ? L('No payslips were issued in this period.', 'لم يصدر كشف راتب خلال هذه الفترة.') : null,
  })

  return {
    type: 'payroll',
    title: L(`Payroll report — ${person.fullNameEn}`, `تقرير رواتب الموظف — ${person.fullNameAr}`),
    period: L(`${period.from} to ${period.to}`, `من ${period.from} إلى ${period.to}`),
    scope: L(person.employeeNumber, person.employeeNumber),
    generatedAt: now.toISOString(),
    generatedBy: actor.fullName,
    sections,
  }
}
