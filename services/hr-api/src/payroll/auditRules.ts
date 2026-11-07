import type { PayrollFindingSeverity, PayrollFindingType } from '@hr/shared'

export type AuditLine = { kind: 'earning' | 'deduction' | 'employerCost'; code: string; amount: number }

export interface AuditPayslip {
  userId: string
  basic: number
  allowances: number
  deductions: number
  netPay: number
  unpaidDays: number
  lines: AuditLine[]
}

export interface AuditAdjustment {
  id: string
  kind: 'overtime' | 'bonus' | 'allowance' | 'deduction'
  amount: number
  effectiveOn: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface AuditEmployeeInput {
  current: AuditPayslip
  history: AuditPayslip[]
  absentDays: number
  adjustments: AuditAdjustment[]
}

export interface AuditRuleSettings {
  salaryChangePercent: number
  deductionChangePercent: number
  overtimeMonthlyThreshold: number
  minHistoryMonths: number
}

export interface AuditFindingDraft {
  userId: string
  type: PayrollFindingType
  severity: PayrollFindingSeverity
  facts: Record<string, string | number>
  explanation: { en: string; ar: string }
}

const L = (en: string, ar: string) => ({ en, ar })

function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null
  return (now - before) / Math.abs(before)
}

function percent(value: number) {
  return Math.round(value * 10_000) / 100
}

function outlierRange(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length < 4) return null
  const at = (p: number) => {
    const index = (sorted.length - 1) * p
    const low = Math.floor(index)
    const high = Math.ceil(index)
    return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low)
  }
  const q1 = at(0.25)
  const q3 = at(0.75)
  const iqr = q3 - q1
  if (iqr <= 0) return null
  return { min: q1 - iqr * 1.5, max: q3 + iqr * 1.5 }
}

function duplicateCodes(lines: AuditLine[]) {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line.kind !== 'earning' || line.code === 'basic') continue
    counts.set(line.code, (counts.get(line.code) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, total]) => total > 1).map(([code]) => code)
}

/**
 * Pure, deterministic checks.  The engine gets values already selected by the
 * service: it cannot query a wider population, call an AI model, or modify a
 * payslip.  That separation lets the exact rules be checked without a database.
 */
export function auditPayrollEmployee(input: AuditEmployeeInput, settings: AuditRuleSettings): AuditFindingDraft[] {
  const { current, history } = input
  const findings: AuditFindingDraft[] = []
  const previous = history[0]

  if (previous) {
    const netChange = change(current.netPay, previous.netPay)
    if (netChange !== null && Math.abs(netChange) >= settings.salaryChangePercent) {
      findings.push({
        userId: current.userId,
        type: 'salaryChange',
        severity: Math.abs(netChange) >= settings.salaryChangePercent * 2 ? 'high' : 'medium',
        facts: { previousNet: previous.netPay, currentNet: current.netPay, changePercent: percent(netChange) },
        explanation: L(
          'Net payroll changed materially from the prior payslip. Review the salary, unpaid absence and approved adjustments below.',
          'تغيّر صافي الراتب بشكل ملحوظ عن كشف الراتب السابق. راجع الراتب والغياب غير المدفوع والتعديلات المعتمدة أدناه.',
        ),
      })
    }

    const deductionChange = change(current.deductions, previous.deductions)
    if (deductionChange !== null && Math.abs(deductionChange) >= settings.deductionChangePercent) {
      findings.push({
        userId: current.userId,
        type: 'deductionChange',
        severity: Math.abs(deductionChange) >= settings.deductionChangePercent * 2 ? 'high' : 'medium',
        facts: { previousDeductions: previous.deductions, currentDeductions: current.deductions, changePercent: percent(deductionChange) },
        explanation: L(
          'Deductions changed materially from the prior payslip. Confirm that the recorded cause is expected before approval.',
          'تغيّرت الخصومات بشكل ملحوظ عن كشف الراتب السابق. أكّد أن السبب المسجّل متوقع قبل الاعتماد.',
        ),
      })
    }
  }

  if (input.absentDays !== current.unpaidDays) {
    findings.push({
      userId: current.userId,
      type: 'unpaidAbsenceMismatch',
      severity: 'high',
      facts: { absentDays: input.absentDays, payrollUnpaidDays: current.unpaidDays },
      explanation: L(
        'Recorded absences and the unpaid days used in payroll do not match. Resolve the attendance record before approval.',
        'أيام الغياب المسجّلة لا تطابق الأيام غير المدفوعة المستخدمة في الراتب. راجع سجل الحضور قبل الاعتماد.',
      ),
    })
  }

  const duplicatedLines = duplicateCodes(current.lines)
  for (const code of duplicatedLines) {
    findings.push({
      userId: current.userId,
      type: 'duplicateAllowance',
      severity: 'high',
      facts: { lineCode: code },
      explanation: L(
        'The same earning line appears more than once in this payslip. Check that it was not entered twice.',
        'يظهر بند الاستحقاق نفسه أكثر من مرة في كشف الراتب. تحقّق من عدم إدخاله مرتين.',
      ),
    })
  }

  const range = history.length >= settings.minHistoryMonths ? outlierRange(history.map((row) => row.netPay)) : null
  if (range && (current.netPay < range.min || current.netPay > range.max)) {
    findings.push({
      userId: current.userId,
      type: 'netPayOutlier',
      severity: 'medium',
      facts: { currentNet: current.netPay, expectedMin: Number(range.min.toFixed(2)), expectedMax: Number(range.max.toFixed(2)), historyMonths: history.length },
      explanation: L(
        'Net payroll falls outside this employee’s normal historical range. This is a review signal, not a payroll decision.',
        'صافي الراتب خارج النطاق التاريخي المعتاد لهذا الموظف. هذه إشارة للمراجعة وليست قراراً للراتب.',
      ),
    })
  }

  const approvedOvertime = input.adjustments
    .filter((a) => a.kind === 'overtime' && a.status === 'approved')
    .reduce((sum, a) => sum + a.amount, 0)
  if (approvedOvertime > settings.overtimeMonthlyThreshold) {
    findings.push({
      userId: current.userId,
      type: 'highOvertime',
      severity: 'medium',
      facts: { overtime: approvedOvertime, threshold: settings.overtimeMonthlyThreshold },
      explanation: L(
        'Approved overtime is above the company review threshold. Confirm the time record and approval.',
        'العمل الإضافي المعتمد تجاوز حد المراجعة في الشركة. أكّد سجل الوقت والموافقة.',
      ),
    })
  }

  for (const bonus of input.adjustments.filter((a) => a.kind === 'bonus' && a.status === 'pending')) {
    findings.push({
      userId: current.userId,
      type: 'unapprovedBonus',
      severity: 'high',
      facts: { adjustmentId: bonus.id, amount: bonus.amount, status: bonus.status },
      explanation: L(
        'A bonus for this payroll period is still not approved. It must not be included until an authorised reviewer approves it.',
        'توجد مكافأة لهذه الفترة لم تُعتمد بعد. لا يجوز إدخالها في الراتب قبل اعتمادها من مراجع مخوّل.',
      ),
    })
  }

  const exactDuplicates = new Map<string, number>()
  for (const adjustment of input.adjustments.filter((a) => a.status === 'approved')) {
    const key = `${adjustment.kind}:${adjustment.amount}:${adjustment.effectiveOn}`
    exactDuplicates.set(key, (exactDuplicates.get(key) ?? 0) + 1)
  }
  for (const [key, total] of exactDuplicates) {
    if (total < 2) continue
    findings.push({
      userId: current.userId,
      type: 'duplicateAdjustment',
      severity: 'high',
      facts: { adjustmentKey: key, matchingEntries: total },
      explanation: L(
        'Matching approved variable-pay entries were found for the same date and amount. Confirm they are separate payments.',
        'تم العثور على تعديلات معتمدة متطابقة في التاريخ والمبلغ. أكّد أنها دفعات منفصلة وليست تكراراً.',
      ),
    })
  }

  return findings
}
