import { z } from 'zod'
import { dateOnlySchema, idSchema, instantSchema, localizedSchema } from './primitives.js'

export const payslipSchema = z.object({
  id: idSchema,
  paidOn: dateOnlySchema,
  currency: z.string(),
  basic: z.number(),
  allowances: z.number(),
  deductions: z.number(),
  /** Derived in the database, never typed in twice. */
  netPay: z.number(),
})
export type Payslip = z.infer<typeof payslipSchema>

export const salarySummarySchema = z.object({
  latest: payslipSchema.nullable(),
  history: z.array(payslipSchema),
  nextPayOn: dateOnlySchema.nullable(),
})
export type SalarySummary = z.infer<typeof salarySummarySchema>

export const payrollStatusSchema = z.enum(['processed', 'underReview', 'onHold'])
export type PayrollStatus = z.infer<typeof payrollStatusSchema>

/** One row of the HR payroll table. */
export const payrollRowSchema = z.object({
  userId: idSchema,
  employeeName: localizedSchema,
  employeeNumber: z.string(),
  netPay: z.number(),
  currency: z.string(),
  status: payrollStatusSchema,
  paidOn: dateOnlySchema.nullable(),
})
export type PayrollRow = z.infer<typeof payrollRowSchema>

export const payrollCycleSchema = z.object({
  rows: z.array(payrollRowSchema),
  currency: z.string(),
  netTotal: z.number(),
  allowancesTotal: z.number(),
  deductionsTotal: z.number(),
})
export type PayrollCycle = z.infer<typeof payrollCycleSchema>

/* ---------- running payroll ---------- */

/**
 * The bands of a progressive tax scale, as stored and edited.
 *
 * Validated rather than trusted, because these are entered by a person and an
 * out-of-order or overlapping set silently produces wrong tax for everybody.
 * `upTo` is annual and in dinars; `null` is the top band.
 */
export const taxBandSchema = z.object({
  upTo: z.number().positive().nullable(),
  rate: z.number().min(0).max(1),
})
export type TaxBand = z.infer<typeof taxBandSchema>

export const payrollSettingsSchema = z.object({
  id: idSchema,
  effectiveFrom: dateOnlySchema,
  socialSecurityEmployeeRate: z.number(),
  socialSecurityEmployerRate: z.number(),
  socialSecurityCeiling: z.number(),
  taxPersonalExemption: z.number(),
  taxDependantExemption: z.number(),
  taxBands: z.array(taxBandSchema),
  /**
   * False until somebody who knows the law has checked these.
   *
   * Every payslip calculated with an unconfirmed row says so on its face. The
   * flag changes nothing about the arithmetic — only whether the company is
   * claiming the figures are right.
   */
  confirmed: z.boolean(),
  note: z.string().nullable(),
})
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>

export const payrollRunStatusSchema = z.enum(['draft', 'approved', 'paid', 'cancelled'])
export type PayrollRunStatus = z.infer<typeof payrollRunStatusSchema>

export const payrollRunSchema = z.object({
  id: idSchema,
  periodYear: z.number().int(),
  periodMonth: z.number().int(),
  status: payrollRunStatusSchema,
  calculatedAt: instantSchema.nullable(),
  approvedAt: instantSchema.nullable(),
  paidOn: dateOnlySchema.nullable(),
})
export type PayrollRun = z.infer<typeof payrollRunSchema>

export const calculateRunSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})
export type CalculateRunInput = z.infer<typeof calculateRunSchema>

/** One line of a payslip, with the working behind it. */
export const payslipLineSchema = z.object({
  kind: z.enum(['earning', 'deduction', 'employerCost']),
  code: z.string(),
  name: localizedSchema,
  amount: z.number(),
  /** How the figure was arrived at, in words a person can check. */
  basis: localizedSchema.nullable(),
})
export type PayslipLine = z.infer<typeof payslipLineSchema>

/* ---------- payroll audit ---------- */

/**
 * The audit has its own lifecycle.  A calculation is not an audit: recalculating
 * a draft invalidates old findings, and only a completed audit of the current
 * calculation can clear a run for human approval.
 */
export const payrollAuditStatusSchema = z.enum(['running', 'completed', 'failed', 'stale'])
export type PayrollAuditStatus = z.infer<typeof payrollAuditStatusSchema>

export const payrollFindingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type PayrollFindingSeverity = z.infer<typeof payrollFindingSeveritySchema>

export const payrollFindingStatusSchema = z.enum(['open', 'reviewed', 'dismissed'])
export type PayrollFindingStatus = z.infer<typeof payrollFindingStatusSchema>

/** Each value is derived on the server from a known payroll source. */
export const payrollFindingTypeSchema = z.enum([
  'salaryChange',
  'deductionChange',
  'unpaidAbsenceMismatch',
  'duplicateAllowance',
  'netPayOutlier',
  'highOvertime',
  'unapprovedBonus',
  'duplicateAdjustment',
])
export type PayrollFindingType = z.infer<typeof payrollFindingTypeSchema>

export const payrollAuditDetailSchema = z.object({
  label: localizedSchema,
  value: z.string(),
})
export type PayrollAuditDetail = z.infer<typeof payrollAuditDetailSchema>

export const payrollFindingSchema = z.object({
  id: idSchema,
  type: payrollFindingTypeSchema,
  severity: payrollFindingSeveritySchema,
  status: payrollFindingStatusSchema,
  employee: localizedSchema.nullable(),
  employeeNumber: z.string().nullable(),
  details: z.array(payrollAuditDetailSchema),
  explanation: localizedSchema,
  aiExplanation: localizedSchema.nullable(),
  reviewedAt: instantSchema.nullable(),
  reviewNote: z.string().nullable(),
})
export type PayrollFinding = z.infer<typeof payrollFindingSchema>

export const payrollAuditSchema = z.object({
  id: idSchema,
  runId: idSchema,
  status: payrollAuditStatusSchema,
  startedAt: instantSchema,
  completedAt: instantSchema.nullable(),
  findingCounts: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  findings: z.array(payrollFindingSchema),
})
export type PayrollAudit = z.infer<typeof payrollAuditSchema>

export const payrollAuditOverviewSchema = payrollAuditSchema.pick({
  id: true,
  runId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  findingCounts: true,
})
export type PayrollAuditOverview = z.infer<typeof payrollAuditOverviewSchema>

export const reviewPayrollFindingSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
  note: z.string().trim().max(500).optional(),
})
export type ReviewPayrollFindingInput = z.infer<typeof reviewPayrollFindingSchema>

/** Controlled payroll inputs that must be approved before calculation. */
export const payrollAdjustmentKindSchema = z.enum(['overtime', 'bonus', 'allowance', 'deduction'])
export type PayrollAdjustmentKind = z.infer<typeof payrollAdjustmentKindSchema>

export const createPayrollAdjustmentSchema = z.object({
  userId: idSchema,
  kind: payrollAdjustmentKindSchema,
  amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, 'notMoney'),
  effectiveOn: dateOnlySchema,
  note: z.string().trim().min(2).max(500),
})
export type CreatePayrollAdjustmentInput = z.infer<typeof createPayrollAdjustmentSchema>

/* ---------- setting what somebody earns ---------- */

/**
 * A pay agreement, as HR states it.
 *
 * Amounts are decimal strings rather than numbers: they arrive from a form as
 * text, they are stored as `numeric`, and passing them through JavaScript's
 * binary floats on the way would round 1234.15 to something that is not it.
 * Validated as money — digits, optionally two decimal places, nothing else.
 */
const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'notMoney')

export const setSalarySchema = z.object({
  basic: moneySchema,
  transport: moneySchema.default('0'),
  housing: moneySchema.default('0'),
  other: moneySchema.default('0'),
  /**
   * From when it applies, which is the whole point of the table.
   *
   * A raise does not edit the old agreement, it starts a new one on a date —
   * so a payslip from before that date still recalculates to what was actually
   * paid, and a correction cannot silently rewrite history.
   */
  effectiveFrom: dateOnlySchema,
  socialSecurityExempt: z.boolean().default(false),
  dependants: z.number().int().min(0).max(20).default(0),
})
export type SetSalaryInput = z.infer<typeof setSalarySchema>

/**
 * One agreement in somebody's history, for the screen that lists them.
 *
 * Distinct from `salaryStructureSchema` in `lookup.ts`, which is the current
 * one as a summary reads it. This carries the row's own identity and the two
 * things a history needs: when it stopped applying, and who set it.
 */
export const salaryRecordSchema = z.object({
  id: idSchema,
  basic: z.string(),
  transport: z.string(),
  housing: z.string(),
  other: z.string(),
  currency: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  socialSecurityExempt: z.boolean(),
  dependants: z.number().int(),
  /** Who set it, so a change always has a name against it. */
  setBy: localizedSchema.nullable(),
  createdAt: instantSchema,
})
export type SalaryRecord = z.infer<typeof salaryRecordSchema>

/**
 * A compact salary-agreement state for the HR contracts workspace.
 *
 * It deliberately contains no amount: the purpose of this list is to show
 * which active employees still need a contract, without turning the page into
 * a disclosure of everyone else's pay.
 */
export const salaryContractStatusSchema = z.object({
  userId: idSchema,
  employee: localizedSchema,
  employeeNumber: z.string(),
  hasSalaryContract: z.boolean(),
  effectiveFrom: dateOnlySchema.nullable(),
})
export type SalaryContractStatus = z.infer<typeof salaryContractStatusSchema>

export const salaryContractStatusesSchema = z.object({
  employees: z.array(salaryContractStatusSchema),
})
export type SalaryContractStatuses = z.infer<typeof salaryContractStatusesSchema>
