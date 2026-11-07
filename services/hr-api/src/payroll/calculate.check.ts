import { annualTax, calculatePayslip, toDinars, toFils, type PayrollRates } from './calculate.js'

/**
 * The payroll arithmetic, checked against figures worked out by hand.
 *
 * This is the one calculation in the system that moves money, and it is pure —
 * no database, no clock — so it can be checked exactly. Every expected number
 * below was computed independently and written down before the code ran; a test
 * that copies whatever the function returned proves only that it is consistent.
 *
 *     npm run check:payroll -w @hr/server
 */

let failures = 0
const eq = (label: string, got: number, want: number) => {
  const ok = got === want
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}: ${toDinars(got).toFixed(3)}${ok ? '' : ` (expected ${toDinars(want).toFixed(3)})`}`)
}

/** Deliberately round numbers, so the expected values can be checked mentally. */
const RATES: PayrollRates = {
  socialSecurityEmployeeRate: 0.075,
  socialSecurityEmployerRate: 0.1425,
  socialSecurityCeiling: toFils(3000),
  taxPersonalExemption: toFils(9000),
  taxDependantExemption: toFils(0),
  taxBands: [
    { upTo: toFils(5000), rate: 0.05 },
    { upTo: toFils(10000), rate: 0.1 },
    { upTo: null, rate: 0.2 },
  ],
}

const base = {
  transport: 0,
  housing: 0,
  other: 0,
  workingDays: 22,
  unpaidDays: 0,
  dependants: 0,
  socialSecurityExempt: false,
  otherDeductions: [],
}

console.log('A salary below the tax threshold pays social security and no tax:')
{
  // 1000 gross. SS = 1000 × 7.5% = 75. Annual taxable = (1000 − 75) × 12 = 11,100.
  // Exemption 9000 → 2100 taxable, all in the 5% band → 105/yr → 8.75/month.
  const r = calculatePayslip({ ...base, basic: toFils(1000) }, RATES)
  eq('gross', r.grossPay, toFils(1000))
  eq('social security', r.totalDeductions - toFils(8.75), toFils(75))
  eq('net', r.netPay, toFils(1000) - toFils(75) - toFils(8.75))
  eq('employer cost', r.totalEmployerCost, toFils(1000) + toFils(142.5))
}

console.log('\nAllowances count toward gross and toward the contribution base:')
{
  // 800 + 100 + 50 = 950 gross. SS = 71.25.
  const r = calculatePayslip(
    { ...base, basic: toFils(800), transport: toFils(100), housing: toFils(50) },
    RATES,
  )
  eq('gross', r.grossPay, toFils(950))
  const ss = r.lines.find((l) => l.code === 'socialSecurity')!
  eq('social security', ss.amount, toFils(71.25))
}

console.log('\nEarnings above the ceiling are not contributed on:')
{
  // 5000 gross, ceiling 3000 → SS on 3000 only = 225, not 375.
  const r = calculatePayslip({ ...base, basic: toFils(5000) }, RATES)
  const ss = r.lines.find((l) => l.code === 'socialSecurity')!
  eq('social security capped', ss.amount, toFils(225))
  eq('employer share capped', r.employerSocialSecurity, toFils(427.5))
}

console.log('\nUnpaid days come off basic, not off allowances:')
{
  // 1100 basic over 22 days = 50/day. Three unpaid → 150 off basic.
  // Transport stays whole, so gross = 950 + 100 = 1050.
  const r = calculatePayslip(
    { ...base, basic: toFils(1100), transport: toFils(100), unpaidDays: 3 },
    RATES,
  )
  const basic = r.lines.find((l) => l.code === 'basic')!
  eq('basic after 3 unpaid days', basic.amount, toFils(950))
  const transport = r.lines.find((l) => l.code === 'transport')!
  eq('transport untouched', transport.amount, toFils(100))
  eq('gross', r.grossPay, toFils(1050))
}

console.log('\nApproved unpaid leave is identified separately from an unapproved absence:')
{
  const r = calculatePayslip(
    {
      ...base,
      basic: toFils(1100),
      unpaidDays: 3,
      unpaidAbsenceDays: 1,
      unpaidLeaveDays: 2,
    },
    RATES,
  )
  const basic = r.lines.find((l) => l.code === 'basic')!
  eq('basic after combined unpaid time', basic.amount, toFils(950))
  const basis = basic.basis?.en ?? ''
  const clear = basis.includes('1 unapproved absence') && basis.includes('2 approved unpaid-leave')
  console.log(`  ${clear ? '✓' : '✗'} payslip states the source of unpaid time`)
  if (!clear) failures += 1
}

console.log('\nTax is progressive — each band taxes only its own slice:')
{
  // 20,000 taxable: 5000 @5% = 250, next 5000 @10% = 500, last 10,000 @20% = 2000.
  eq('annual tax on 20,000', annualTax(toFils(20000), RATES.taxBands), toFils(2750))
  // A flat-rate mistake would give 20,000 × 20% = 4000. It must not.
  eq('exactly at a threshold (5,000)', annualTax(toFils(5000), RATES.taxBands), toFils(250))
  eq('one fils into the next band', annualTax(toFils(5000) + 1, RATES.taxBands), toFils(250) + 0)
  eq('nothing taxable', annualTax(0, RATES.taxBands), 0)
  eq('negative is not a refund', annualTax(-toFils(500), RATES.taxBands), 0)
}

console.log('\nAn exempt employee pays no social security, and still pays tax:')
{
  const r = calculatePayslip({ ...base, basic: toFils(2000), socialSecurityExempt: true }, RATES)
  eq('social security', r.lines.filter((l) => l.code === 'socialSecurity').length, 0)
  eq('employer share', r.employerSocialSecurity, 0)
  // Annual taxable = 24,000 − 9,000 = 15,000 → 250 + 500 + 1000 = 1750/yr.
  const tax = r.lines.find((l) => l.code === 'incomeTax')!
  eq('monthly tax', tax.amount, Math.round(toFils(1750) / 12))
}

console.log('\nDependants raise the exemption:')
{
  const withKids: PayrollRates = { ...RATES, taxDependantExemption: toFils(1000) }
  const one = calculatePayslip({ ...base, basic: toFils(2000), dependants: 0 }, withKids)
  const four = calculatePayslip({ ...base, basic: toFils(2000), dependants: 4 }, withKids)
  const taxOne = one.lines.find((l) => l.code === 'incomeTax')?.amount ?? 0
  const taxFour = four.lines.find((l) => l.code === 'incomeTax')?.amount ?? 0
  console.log(`  ${taxFour < taxOne ? '✓' : '✗'} four dependants pay less: ${toDinars(taxFour).toFixed(3)} < ${toDinars(taxOne).toFixed(3)}`)
  if (taxFour >= taxOne) failures += 1
}

console.log('\nThe employer share is never taken from the employee:')
{
  const r = calculatePayslip({ ...base, basic: toFils(1000) }, RATES)
  const deducted = r.lines.filter((l) => l.kind === 'deduction').reduce((a, l) => a + l.amount, 0)
  eq('deductions exclude the employer share', deducted, r.totalDeductions)
  const employerInDeductions = r.lines.some(
    (l) => l.kind === 'deduction' && l.code === 'employerSocialSecurity',
  )
  console.log(`  ${employerInDeductions ? '✗' : '✓'} employer share is not a deduction line`)
  if (employerInDeductions) failures += 1
}

console.log('\nNothing is lost to rounding — the lines always add up:')
{
  for (const salary of [333.333, 777.777, 1234.567, 4999.999]) {
    const r = calculatePayslip({ ...base, basic: toFils(salary), transport: toFils(33.333) }, RATES)
    const earnings = r.lines.filter((l) => l.kind === 'earning').reduce((a, l) => a + l.amount, 0)
    const deductions = r.lines.filter((l) => l.kind === 'deduction').reduce((a, l) => a + l.amount, 0)
    const ok = earnings === r.grossPay && deductions === r.totalDeductions && r.netPay === earnings - deductions
    if (!ok) failures += 1
    console.log(`  ${ok ? '✓' : '✗'} ${salary}: lines sum to the totals exactly`)
  }
}

console.log(`\n${failures === 0 ? 'the arithmetic holds' : `${failures} FAILURES`}`)
process.exit(failures === 0 ? 0 : 1)
