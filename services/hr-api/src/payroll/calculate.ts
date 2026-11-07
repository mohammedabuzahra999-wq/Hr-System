/**
 * Working out one person's pay for one month.
 *
 * Pure: it takes numbers and returns numbers, touches no database and no clock.
 * That is deliberate — this is the part of the system that decides what lands in
 * somebody's bank account, so it has to be checkable in isolation, and a
 * function that reads a table cannot be.
 *
 * ---
 *
 * Everything is in fils, the smallest unit, as integers.
 *
 * Not because dinars are inconvenient, but because 0.1 + 0.2 is not 0.3 in
 * binary floating point, and payroll is where that surfaces: a tax band applied
 * to a float gives a figure a hundredth of a dinar off, twelve times a year,
 * across every employee, and it is the accountant who finds it. Integers of the
 * smallest unit cannot drift. Conversion happens once at each edge.
 */

/** Jordanian dinars are divided into 1000 fils. */
export const UNITS_PER_DINAR = 1000

export const toFils = (amount: number | string): number =>
  Math.round(Number(amount) * UNITS_PER_DINAR)

export const toDinars = (fils: number): number => fils / UNITS_PER_DINAR

/** One band of a progressive tax scale. `upTo: null` is the top band. */
export interface TaxBand {
  upTo: number | null
  rate: number
}

export interface PayrollRates {
  socialSecurityEmployeeRate: number
  socialSecurityEmployerRate: number
  /** In fils, per month. */
  socialSecurityCeiling: number
  /** Annual, in fils. */
  taxPersonalExemption: number
  taxDependantExemption: number
  /** Bands are annual, with thresholds in fils. */
  taxBands: TaxBand[]
}

export interface PayrollInput {
  /** All in fils, per month. */
  basic: number
  transport: number
  housing: number
  other: number
  /** Working days in the month, and how many of them were unpaid. */
  workingDays: number
  unpaidDays: number
  /**
   * The composition of `unpaidDays`, retained for a readable payslip.
   *
   * An unpaid absence and an approved unpaid-leave request both reduce basic
   * pay in the same way.  They must still be distinguishable to the employee
   * and to HR.  These are optional so historic callers that only know the
   * total keep their exact behaviour.
   */
  unpaidAbsenceDays?: number
  unpaidLeaveDays?: number
  dependants: number
  socialSecurityExempt: boolean
  /** Approved one-off earnings, retained as separate payslip lines. */
  otherEarnings?: {
    code: string
    name: { en: string; ar: string }
    amount: number
    basis?: { en: string; ar: string } | null
  }[]
  /** Anything already agreed — a loan instalment, an advance being recovered. */
  otherDeductions: { code?: string; name: { en: string; ar: string }; amount: number }[]
}

export type LineKind = 'earning' | 'deduction' | 'employerCost'

export interface PayslipLine {
  kind: LineKind
  code: string
  name: { en: string; ar: string }
  amount: number
  /** How it was arrived at, in words a person can check. */
  basis: { en: string; ar: string } | null
}

export interface PayrollResult {
  lines: PayslipLine[]
  grossPay: number
  totalDeductions: number
  netPay: number
  employerSocialSecurity: number
  /** What the employee costs in total, which is not what they are paid. */
  totalEmployerCost: number
}

const L = (en: string, ar: string) => ({ en, ar })

/**
 * Annual income tax for a taxable amount, by the bands given.
 *
 * Progressive, so each band taxes only the slice inside it — a common and
 * expensive mistake is to find the band a salary falls in and apply that rate to
 * the whole of it, which overcharges everybody near a threshold.
 */
export function annualTax(taxable: number, bands: TaxBand[]): number {
  if (taxable <= 0) return 0
  let remaining = taxable
  let previousCeiling = 0
  let tax = 0

  for (const band of bands) {
    const ceiling = band.upTo ?? Number.POSITIVE_INFINITY
    const slice = Math.min(remaining, ceiling - previousCeiling)
    if (slice <= 0) break
    tax += slice * band.rate
    remaining -= slice
    previousCeiling = ceiling
    if (remaining <= 0) break
  }
  return Math.round(tax)
}

export function calculatePayslip(input: PayrollInput, rates: PayrollRates): PayrollResult {
  const lines: PayslipLine[] = []

  /* ---------- what is earned ---------- */

  /**
   * Unpaid days come off the basic only.
   *
   * Allowances for transport and housing are paid for holding the job, not for
   * each day worked, and deducting them for an unpaid day charges someone twice
   * for the same absence. A company that wants otherwise changes this line, and
   * the payslip will say what it did.
   */
  const dailyRate = input.workingDays > 0 ? Math.round(input.basic / input.workingDays) : 0
  const unpaidDays = Math.max(0, input.unpaidDays)
  const unpaidLeaveDays = Math.min(unpaidDays, Math.max(0, input.unpaidLeaveDays ?? 0))
  const unpaidAbsenceDays = Math.min(
    Math.max(0, unpaidDays - unpaidLeaveDays),
    Math.max(0, input.unpaidAbsenceDays ?? unpaidDays - unpaidLeaveDays),
  )
  const unpaidDeduction = Math.round(dailyRate * unpaidDays)
  const paidBasic = Math.max(0, input.basic - unpaidDeduction)

  const unpaidBasis = () => {
    if (unpaidDays === 0) return null
    const partsEn: string[] = []
    const partsAr: string[] = []
    if (unpaidAbsenceDays > 0) {
      partsEn.push(`${unpaidAbsenceDays} unapproved absence day(s)`)
      partsAr.push(`${unpaidAbsenceDays} يوم غياب غير معتمد`)
    }
    if (unpaidLeaveDays > 0) {
      partsEn.push(`${unpaidLeaveDays} approved unpaid-leave day(s)`)
      partsAr.push(`${unpaidLeaveDays} يوم إجازة بلا راتب معتمدة`)
    }
    if (partsEn.length === 0) {
      partsEn.push(`${unpaidDays} unpaid day(s)`)
      partsAr.push(`${unpaidDays} يوم بلا أجر`)
    }
    return L(
      `${toDinars(input.basic).toFixed(2)} less ${partsEn.join(', ')}`,
      `${toDinars(input.basic).toFixed(2)} ناقص ${partsAr.join(' و')}`,
    )
  }

  lines.push({
    kind: 'earning',
    code: 'basic',
    name: L('Basic salary', 'الراتب الأساسي'),
    amount: paidBasic,
    basis: unpaidBasis(),
  })

  for (const [code, amount, en, ar] of [
    ['transport', input.transport, 'Transport allowance', 'بدل مواصلات'],
    ['housing', input.housing, 'Housing allowance', 'بدل سكن'],
    ['other', input.other, 'Other allowances', 'بدلات أخرى'],
  ] as const) {
    if (amount > 0) {
      lines.push({ kind: 'earning', code, name: L(en, ar), amount, basis: null })
    }
  }

  for (const earning of input.otherEarnings ?? []) {
    if (earning.amount > 0) {
      lines.push({
        kind: 'earning',
        code: earning.code,
        name: earning.name,
        amount: earning.amount,
        basis: earning.basis ?? null,
      })
    }
  }

  const grossPay = lines.filter((l) => l.kind === 'earning').reduce((a, l) => a + l.amount, 0)

  /* ---------- social security ---------- */

  /**
   * Contributed on gross, up to the ceiling.
   *
   * The ceiling is why this is not simply a percentage of pay: earnings above it
   * are not contributed on at all, so a salary over the cap contributes the same
   * as one at it.
   */
  const contributionBase = Math.min(grossPay, rates.socialSecurityCeiling)
  const employeeSs = input.socialSecurityExempt
    ? 0
    : Math.round(contributionBase * rates.socialSecurityEmployeeRate)
  const employerSs = input.socialSecurityExempt
    ? 0
    : Math.round(contributionBase * rates.socialSecurityEmployerRate)

  if (employeeSs > 0) {
    lines.push({
      kind: 'deduction',
      code: 'socialSecurity',
      name: L('Social security', 'الضمان الاجتماعي'),
      amount: employeeSs,
      basis: L(
        `${(rates.socialSecurityEmployeeRate * 100).toFixed(2)}% of ${toDinars(contributionBase).toFixed(2)}`,
        `${(rates.socialSecurityEmployeeRate * 100).toFixed(2)}٪ من ${toDinars(contributionBase).toFixed(2)}`,
      ),
    })
  }

  /* ---------- income tax ---------- */

  /**
   * Computed annually and divided, not computed on one month.
   *
   * Tax bands are annual thresholds. Applying them to a monthly figure puts
   * everybody in the lowest band and collects almost nothing — a mistake that is
   * invisible until the year-end reconciliation, when the company owes the
   * difference.
   *
   * Social security is deducted before tax: it is not income the employee keeps.
   */
  const annualTaxableIncome = Math.max(0, (grossPay - employeeSs) * 12)
  const exemption =
    rates.taxPersonalExemption + rates.taxDependantExemption * Math.max(0, input.dependants)
  const afterExemption = Math.max(0, annualTaxableIncome - exemption)
  const monthlyTax = Math.round(annualTax(afterExemption, rates.taxBands) / 12)

  if (monthlyTax > 0) {
    lines.push({
      kind: 'deduction',
      code: 'incomeTax',
      name: L('Income tax', 'ضريبة الدخل'),
      amount: monthlyTax,
      basis: L(
        `annual taxable ${toDinars(afterExemption).toFixed(2)}, divided by 12`,
        `الدخل الخاضع سنوياً ${toDinars(afterExemption).toFixed(2)}، مقسوماً على ١٢`,
      ),
    })
  }

  /* ---------- anything else agreed ---------- */

  for (const d of input.otherDeductions) {
    if (d.amount > 0) {
      lines.push({ kind: 'deduction', code: d.code ?? 'other', name: d.name, amount: d.amount, basis: null })
    }
  }

  const totalDeductions = lines.filter((l) => l.kind === 'deduction').reduce((a, l) => a + l.amount, 0)

  /**
   * Recorded, never deducted.
   *
   * The employer's contribution is a cost of employing somebody, not something
   * taken from them — showing it as a deduction would be both wrong and alarming
   * on a payslip. It is here because a payroll system that cannot report the real
   * cost of a headcount is not much use for planning.
   */
  if (employerSs > 0) {
    lines.push({
      kind: 'employerCost',
      code: 'employerSocialSecurity',
      name: L('Social security (employer)', 'الضمان الاجتماعي (حصة صاحب العمل)'),
      amount: employerSs,
      basis: L(
        `${(rates.socialSecurityEmployerRate * 100).toFixed(2)}% of ${toDinars(contributionBase).toFixed(2)}`,
        `${(rates.socialSecurityEmployerRate * 100).toFixed(2)}٪ من ${toDinars(contributionBase).toFixed(2)}`,
      ),
    })
  }

  return {
    lines,
    grossPay,
    totalDeductions,
    netPay: grossPay - totalDeductions,
    employerSocialSecurity: employerSs,
    totalEmployerCost: grossPay + employerSs,
  }
}
