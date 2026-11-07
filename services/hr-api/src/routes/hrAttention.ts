import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import type { HrAttention, HrAttentionItem } from '@hr/shared'
import { db } from '../db/client.js'
import { documents, payrollAdjustments, payrollFindings, requests, salaryStructures, users } from '../db/schema.js'
import { requireAuth, requireRole, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'

export const hrAttentionRoutes = new Hono<AppEnv>()

hrAttentionRoutes.use('*', requireAuth, requireRole(...allowed('viewOrgStats')))

const L = (en: string, ar: string) => ({ en, ar })

/** YYYY-MM-DD in server time. Salary agreements are date-based, never browser-clock based. */
function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return todayKey(copy)
}

/**
 * HR's single attention queue.
 *
 * This route contains no mutation and exposes no additional payroll figures.
 * It only tells HR/Admin what needs a decision and sends them to the already
 * protected screen that owns that decision.
 */
hrAttentionRoutes.get('/', async (c) => {
  const today = todayKey()
  const [withoutSalaryContract, contractsExpiring, pendingLeaves, pendingAdjustments, openFindings] = await Promise.all([
    db
      .select({ id: users.id, en: users.fullNameEn, ar: users.fullNameAr, number: users.employeeNumber })
      .from(users)
      .leftJoin(
        salaryStructures,
        and(
          eq(salaryStructures.userId, users.id),
          lte(salaryStructures.effectiveFrom, today),
          or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, today)),
        ),
      )
      .where(and(eq(users.isActive, true), isNull(salaryStructures.id)))
      .orderBy(asc(users.fullNameAr), asc(users.fullNameEn)),
    db
      .select({ id: documents.id, en: users.fullNameEn, ar: users.fullNameAr, number: users.employeeNumber, expiresOn: documents.expiresOn })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.userId))
      .where(and(eq(users.isActive, true), eq(documents.kind, 'contract'), gte(documents.expiresOn, today), lte(documents.expiresOn, addDays(new Date(), 30))))
      .orderBy(asc(documents.expiresOn)),
    db
      .select({ id: requests.id, en: users.fullNameEn, ar: users.fullNameAr, number: users.employeeNumber, from: requests.leaveFrom, to: requests.leaveTo })
      .from(requests)
      .innerJoin(users, eq(users.id, requests.userId))
      .where(and(eq(requests.kind, 'leave'), eq(requests.status, 'pending')))
      .orderBy(desc(requests.submittedAt)),
    db
      .select({ id: payrollAdjustments.id, kind: payrollAdjustments.kind, en: users.fullNameEn, ar: users.fullNameAr, number: users.employeeNumber, effectiveOn: payrollAdjustments.effectiveOn })
      .from(payrollAdjustments)
      .innerJoin(users, eq(users.id, payrollAdjustments.userId))
      .where(eq(payrollAdjustments.status, 'pending'))
      .orderBy(desc(payrollAdjustments.createdAt)),
    db
      .select({ id: payrollFindings.id, severity: payrollFindings.severity, explanation: payrollFindings.explanation, en: users.fullNameEn, ar: users.fullNameAr, number: users.employeeNumber })
      .from(payrollFindings)
      .leftJoin(users, eq(users.id, payrollFindings.userId))
      .where(eq(payrollFindings.status, 'open'))
      .orderBy(desc(payrollFindings.createdAt)),
  ])

  const items: HrAttentionItem[] = [
    ...withoutSalaryContract.map((person) => ({
      id: `salary-contract:${person.id}`,
      kind: 'salaryContractMissing' as const,
      severity: 'high' as const,
      title: L('Salary contract needed', '\u0639\u0642\u062f \u0631\u0627\u062a\u0628 \u0645\u0637\u0644\u0648\u0628'),
      detail: L('Payroll is blocked for this employee until a salary contract is recorded.', '\u0644\u0646 \u064a\u062f\u062e\u0644 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0638\u0641 \u0641\u064a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u062d\u062a\u0649 \u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0639\u0642\u062f \u0631\u0627\u062a\u0628.'),
      employee: L(person.en, person.ar),
      employeeNumber: person.number,
      href: `/hr/payroll?salaryEmployee=${encodeURIComponent(person.id)}#salaries`,
    })),
    ...contractsExpiring.map((contract) => ({
      id: `contract-expiring:${contract.id}`,
      kind: 'contractExpiring' as const,
      severity: 'medium' as const,
      title: L('Employment contract renewal is approaching', '\u064a\u0642\u062a\u0631\u0628 \u0645\u0648\u0639\u062f \u062a\u062c\u062f\u064a\u062f \u0639\u0642\u062f \u0627\u0644\u0639\u0645\u0644'),
      detail: L(`Contract expires on ${contract.expiresOn}.`, `\u064a\u0646\u062a\u0647\u064a \u0627\u0644\u0639\u0642\u062f \u0628\u062a\u0627\u0631\u064a\u062e ${contract.expiresOn}.`),
      employee: L(contract.en, contract.ar),
      employeeNumber: contract.number,
      href: `/hr/employees?open=${encodeURIComponent(contract.number)}`,
    })),
    ...pendingLeaves.map((leave) => ({
      id: `leave:${leave.id}`,
      kind: 'leavePending' as const,
      severity: 'medium' as const,
      title: L('Leave request awaiting a decision', '\u0637\u0644\u0628 \u0625\u062c\u0627\u0632\u0629 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0642\u0631\u0627\u0631'),
      detail: L(`Requested period: ${leave.from ?? '—'} to ${leave.to ?? '—'}.`, `\u0627\u0644\u0641\u062a\u0631\u0629: ${leave.from ?? '—'} \u0625\u0644\u0649 ${leave.to ?? '—'}.`),
      employee: L(leave.en, leave.ar),
      employeeNumber: leave.number,
      href: '/hr/leaves',
    })),
    ...pendingAdjustments.map((adjustment) => ({
      id: `adjustment:${adjustment.id}`,
      kind: 'payrollAdjustmentPending' as const,
      severity: 'medium' as const,
      title: L('Payroll input awaiting approval', '\u0625\u062f\u062e\u0627\u0644 \u0631\u0627\u062a\u0628 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f'),
      detail: L(`${adjustment.kind} effective on ${adjustment.effectiveOn}.`, `${adjustment.kind} \u0633\u0627\u0631\u064a \u0645\u0646 ${adjustment.effectiveOn}.`),
      employee: L(adjustment.en, adjustment.ar),
      employeeNumber: adjustment.number,
      href: '/hr/payroll#adjustments',
    })),
    ...openFindings.map((finding) => ({
      id: `finding:${finding.id}`,
      kind: 'payrollFindingOpen' as const,
      severity: finding.severity,
      title: L('Payroll audit finding needs review', '\u0645\u0644\u0627\u062d\u0638\u0629 \u062a\u062f\u0642\u064a\u0642 \u0631\u0648\u0627\u062a\u0628 \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629'),
      detail: finding.explanation,
      employee: finding.en && finding.ar ? L(finding.en, finding.ar) : null,
      employeeNumber: finding.number,
      href: '/hr/payroll#review',
    })),
  ]

  const payload: HrAttention = {
    items,
    counts: {
      salaryContractMissing: withoutSalaryContract.length,
      contractExpiring: contractsExpiring.length,
      leavePending: pendingLeaves.length,
      payrollAdjustmentPending: pendingAdjustments.length,
      payrollFindingOpen: openFindings.length,
    },
  }
  return c.json(payload)
})
