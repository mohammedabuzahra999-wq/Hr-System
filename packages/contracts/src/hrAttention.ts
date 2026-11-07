import { z } from 'zod'
import { localizedSchema } from './primitives.js'

/**
 * A small, permission-scoped work queue for HR.
 *
 * It is intentionally a summary rather than another copy of payroll, leave or
 * recruitment data. Every item carries the route where its real workflow
 * lives, so attention is centralised while decisions remain in their existing
 * audited services.
 */
export const hrAttentionKindSchema = z.enum([
  'salaryContractMissing',
  'contractExpiring',
  'leavePending',
  'payrollAdjustmentPending',
  'payrollFindingOpen',
])
export type HrAttentionKind = z.infer<typeof hrAttentionKindSchema>

export const hrAttentionSeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type HrAttentionSeverity = z.infer<typeof hrAttentionSeveritySchema>

export const hrAttentionItemSchema = z.object({
  id: z.string(),
  kind: hrAttentionKindSchema,
  severity: hrAttentionSeveritySchema,
  title: localizedSchema,
  detail: localizedSchema,
  employee: localizedSchema.nullable(),
  employeeNumber: z.string().nullable(),
  /** Internal route only, constructed by the server rather than supplied by data. */
  href: z.string().startsWith('/'),
})
export type HrAttentionItem = z.infer<typeof hrAttentionItemSchema>

export const hrAttentionSchema = z.object({
  items: z.array(hrAttentionItemSchema),
  counts: z.object({
    salaryContractMissing: z.number().int().nonnegative(),
    contractExpiring: z.number().int().nonnegative(),
    leavePending: z.number().int().nonnegative(),
    payrollAdjustmentPending: z.number().int().nonnegative(),
    payrollFindingOpen: z.number().int().nonnegative(),
  }),
})
export type HrAttention = z.infer<typeof hrAttentionSchema>
