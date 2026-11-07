import { z } from 'zod'
import { dateOnlySchema, idSchema, instantSchema, localizedSchema } from './primitives.js'

export const leaveTypeSchema = z.enum(['annual', 'sick', 'unpaid'])
export type LeaveType = z.infer<typeof leaveTypeSchema>

export const requestKindSchema = z.enum(['leave', 'certificate', 'detailsUpdate'])
export type RequestKind = z.infer<typeof requestKindSchema>

export const requestStatusSchema = z.enum([
  'pending',
  'approved',
  'completed',
  'rejected',
  'cancelled',
])
export type RequestStatus = z.infer<typeof requestStatusSchema>

export const leaveBalanceSchema = z.object({
  annualTotal: z.number().int(),
  annualRemaining: z.number().int(),
  sickRemaining: z.number().int(),
  usedThisYear: z.number().int(),
  /** Days locked by pending requests, so the remaining figure is not all spendable. */
  heldAnnual: z.number().int(),
  heldSick: z.number().int(),
})
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>

export const leaveDetailsSchema = z.object({
  type: leaveTypeSchema,
  from: dateOnlySchema,
  to: dateOnlySchema,
  /** Working days only — weekends and public holidays excluded. Computed server-side. */
  days: z.number().int().min(1),
  reason: z.string().max(500).nullable(),
})
export type LeaveDetails = z.infer<typeof leaveDetailsSchema>

export const requestSchema = z.object({
  id: idSchema,
  userId: idSchema,
  employeeName: localizedSchema,
  kind: requestKindSchema,
  status: requestStatusSchema,
  submittedAt: instantSchema,
  decidedAt: instantSchema.nullable(),
  decidedByName: localizedSchema.nullable(),
  decisionNote: z.string().nullable(),
  leave: leaveDetailsSchema.nullable(),
})
export type EmployeeRequest = z.infer<typeof requestSchema>

/** `days` is deliberately absent: the server counts working days itself. */
export const createLeaveRequestSchema = z.object({
  type: leaveTypeSchema,
  from: dateOnlySchema,
  to: dateOnlySchema,
  reason: z.string().max(500).optional(),
})
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>

export const createSimpleRequestSchema = z.object({
  kind: z.enum(['certificate', 'detailsUpdate']),
  reason: z.string().max(500).optional(),
})
export type CreateSimpleRequestInput = z.infer<typeof createSimpleRequestSchema>

export const decideRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
})
export type DecideRequestInput = z.infer<typeof decideRequestSchema>

export const requestFilterSchema = z.object({
  status: requestStatusSchema.optional(),
  kind: requestKindSchema.optional(),
})
export type RequestFilter = z.infer<typeof requestFilterSchema>
