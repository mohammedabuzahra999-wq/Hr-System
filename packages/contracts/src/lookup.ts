import { z } from 'zod'
import { employeeSchema } from './people.js'
import { attendanceSummarySchema } from './attendance.js'
import { leaveBalanceSchema } from './leave.js'
import { payslipSchema } from './payroll.js'
import { documentSchema } from './people.js'
import { dateOnlySchema, idSchema, instantSchema, localizedSchema } from './primitives.js'

/**
 * Everything about one employee, in one answer.
 *
 * The employee list already searches by number, but a filtered list and a file
 * are different things: a list narrows to a row, a file answers the question
 * somebody actually has. HR is asked "what is going on with EMP-1010" — how much
 * leave is left, was there absence, what are they paid, is anything waiting on
 * them — and a list cannot answer any of that without five more clicks.
 *
 * Assembled server-side rather than by five requests from the page, so what HR
 * sees is one moment rather than five, and so the permission check happens once.
 */

/** A contracted salary, as HR sees it. */
export const salaryStructureSchema = z.object({
  basic: z.number(),
  transport: z.number(),
  housing: z.number(),
  other: z.number(),
  currency: z.string(),
  effectiveFrom: dateOnlySchema,
  socialSecurityExempt: z.boolean(),
  dependants: z.number().int(),
})
export type SalaryStructure = z.infer<typeof salaryStructureSchema>

/** One request, summarised for the file. */
export const lookupRequestSchema = z.object({
  id: idSchema,
  kind: z.string(),
  status: z.string(),
  submittedAt: instantSchema,
  detail: localizedSchema.nullable(),
})
export type LookupRequest = z.infer<typeof lookupRequestSchema>

export const employeeFileSchema = z.object({
  employee: employeeSchema,
  /** Who reports to them, when anyone does. */
  directReports: z.array(z.object({ id: idSchema, fullName: localizedSchema, jobTitle: localizedSchema })),

  attendanceThisMonth: attendanceSummarySchema,
  leave: leaveBalanceSchema,
  /** Open requests first — those are the ones somebody is waiting on. */
  requests: z.array(lookupRequestSchema),
  documents: z.array(documentSchema),

  /**
   * Null when no contract has been entered.
   *
   * Distinct from a contract of zero: one means nobody has recorded what this
   * person is paid, which is something HR needs to see rather than a figure to
   * display as though it were agreed.
   */
  salary: salaryStructureSchema.nullable(),
  recentPayslips: z.array(payslipSchema),
})
export type EmployeeFile = z.infer<typeof employeeFileSchema>
