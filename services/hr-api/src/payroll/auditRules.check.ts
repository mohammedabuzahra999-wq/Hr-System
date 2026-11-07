import { auditPayrollEmployee, type AuditEmployeeInput, type AuditRuleSettings } from './auditRules.js'

const settings: AuditRuleSettings = {
  salaryChangePercent: 0.25,
  deductionChangePercent: 0.35,
  overtimeMonthlyThreshold: 250,
  minHistoryMonths: 4,
}

const base: AuditEmployeeInput = {
  current: { userId: 'u1', basic: 1000, allowances: 0, deductions: 100, netPay: 900, unpaidDays: 0, lines: [{ kind: 'earning', code: 'basic', amount: 1000 }] },
  history: [
    { userId: 'u1', basic: 1000, allowances: 0, deductions: 100, netPay: 900, unpaidDays: 0, lines: [] },
    { userId: 'u1', basic: 1000, allowances: 0, deductions: 100, netPay: 910, unpaidDays: 0, lines: [] },
    { userId: 'u1', basic: 1000, allowances: 0, deductions: 100, netPay: 905, unpaidDays: 0, lines: [] },
    { userId: 'u1', basic: 1000, allowances: 0, deductions: 100, netPay: 895, unpaidDays: 0, lines: [] },
  ],
  absentDays: 0,
  adjustments: [],
}

let failures = 0
const has = (label: string, input: AuditEmployeeInput, type: string, expected = true) => {
  const present = auditPayrollEmployee(input, settings).some((f) => f.type === type)
  const ok = present === expected
  if (!ok) failures += 1
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

console.log('Payroll audit rules:')
has('normal payslip is not a salary-change finding', base, 'salaryChange', false)
has('large net-pay change is detected', { ...base, current: { ...base.current, netPay: 1350 } }, 'salaryChange')
has('attendance mismatch is detected', { ...base, current: { ...base.current, unpaidDays: 2 }, absentDays: 1 }, 'unpaidAbsenceMismatch')
has('high overtime is detected', { ...base, adjustments: [{ id: 'o1', kind: 'overtime', amount: 300, effectiveOn: '2026-10-01', status: 'approved' }] }, 'highOvertime')
has('unapproved bonus is detected', { ...base, adjustments: [{ id: 'b1', kind: 'bonus', amount: 100, effectiveOn: '2026-10-01', status: 'pending' }] }, 'unapprovedBonus')
has('duplicated allowance line is detected', { ...base, current: { ...base.current, lines: [{ kind: 'earning', code: 'basic', amount: 1000 }, { kind: 'earning', code: 'transport', amount: 30 }, { kind: 'earning', code: 'transport', amount: 30 }] } }, 'duplicateAllowance')

console.log(failures === 0 ? '\nthe payroll audit rules hold' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
