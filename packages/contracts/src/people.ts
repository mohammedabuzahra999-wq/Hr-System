import { z } from 'zod'
import { dateOnlySchema, idSchema, instantSchema, localizedSchema, roleSchema } from './primitives.js'

/**
 * Whether someone is actually using the system right now.
 *
 * Deliberately separate from `isActive`, which is whether the *account* is
 * enabled. The two were conflated behind one word — a person who had not signed
 * in for a month still read as "active", because their account had never been
 * switched off. They answer different questions and now say so.
 *
 * - `online`  — the app is open and saying so.
 * - `recent`  — it was open within the last few minutes. A locked phone or a
 *               tab left in the background looks like this.
 * - `offline` — neither.
 *
 * Measured from the last time the app said it was there, not from an open
 * socket. Waiting for a connection to *die* turned out to be unreliable — a
 * closed browser left the server holding a stream it never noticed was gone, so
 * people stayed "online" indefinitely. Absence of a ping is the sturdier signal,
 * because it needs nothing to be detected: it just stops arriving.
 */
export const presenceSchema = z.enum(['online', 'recent', 'offline'])
export type Presence = z.infer<typeof presenceSchema>

/**
 * The windows presence is judged against, shared so that the app and the server
 * cannot disagree about them.
 *
 * An open app pings every `PRESENCE_PING_MS`. The online window is wide enough
 * that one missed ping — a slow network, a browser throttling a busy tab — does
 * not make somebody vanish, and narrow enough that a closed app drops off while
 * anyone is still looking at the screen.
 */
export const PRESENCE_PING_MS = 45 * 1000
export const PRESENCE_ONLINE_MS = 110 * 1000
export const PRESENCE_RECENT_MS = 5 * 60 * 1000

export const employeeSchema = z.object({
  id: idSchema,
  email: z.string(),
  employeeNumber: z.string(),
  fullName: localizedSchema,
  jobTitle: localizedSchema,
  department: localizedSchema,
  role: roleSchema,
  managerId: idSchema.nullable(),
  managerName: localizedSchema.nullable(),
  /** The account is enabled. Says nothing about whether anyone is using it. */
  isActive: z.boolean(),
  presence: presenceSchema,
  /** Null for an account that has never signed in. */
  lastSeenAt: instantSchema.nullable(),
  photoUrl: z.string().nullable(),
  joinedOn: dateOnlySchema,
})
export type Employee = z.infer<typeof employeeSchema>

export const employeeFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  active: z.stringbool().optional(),
})
export type EmployeeFilter = z.infer<typeof employeeFilterSchema>

export const createEmployeeSchema = z.object({
  email: z.email().trim().toLowerCase(),
  employeeNumber: z.string().trim().min(1).max(40),
  fullName: localizedSchema,
  jobTitle: localizedSchema,
  department: localizedSchema,
  role: roleSchema,
  managerId: idSchema.nullable().optional(),
  joinedOn: dateOnlySchema,
  /** Omitted means the account is created without a usable password until reset. */
  password: z.string().min(8).max(200).optional(),
})
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

/**
 * `password` is deliberately dropped here.
 *
 * Setting a password an administrator chose means they know a working
 * credential for that account, and can sign in as them with nothing to show it
 * happened. Password changes go through the reset endpoint instead, which issues
 * a value nobody picked and returns it exactly once.
 */
export const updateEmployeeSchema = createEmployeeSchema
  .omit({ password: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>

/**
 * The result of an administrator resetting someone's password.
 *
 * `temporaryPassword` is the only time this value exists in readable form — it
 * is hashed on the way into the database and cannot be read back afterwards, by
 * anyone. The UI must tell the reader that.
 */
export const resetPasswordResultSchema = z.object({
  temporaryPassword: z.string(),
  employeeName: localizedSchema,
})
export type ResetPasswordResult = z.infer<typeof resetPasswordResultSchema>

export const documentKindSchema = z.enum([
  'contract',
  'passport',
  'nationalId',
  'insuranceCard',
  'degree',
])
export type DocumentKind = z.infer<typeof documentKindSchema>

export const documentSchema = z.object({
  id: idSchema,
  kind: documentKindSchema,
  issuedOn: dateOnlySchema,
  expiresOn: dateOnlySchema.nullable(),
  fileName: z.string(),
  sizeKb: z.number().int().min(0),
})
export type EmployeeDocument = z.infer<typeof documentSchema>

/** Headcount at the end of each month, for the dashboard trend. */
export const headcountPointSchema = z.object({
  month: dateOnlySchema,
  headcount: z.number().int().min(0),
})
export type HeadcountPoint = z.infer<typeof headcountPointSchema>

export const orgStatsSchema = z.object({
  activeEmployees: z.number().int(),
  attendanceRate: z.number(),
  openPositions: z.number().int(),
  payrollThisCycle: z.number(),
  payrollCurrency: z.string(),
  pendingApprovals: z.number().int(),
  onLeaveToday: z.number().int(),
  headcountTrend: z.array(headcountPointSchema),
})
export type OrgStats = z.infer<typeof orgStatsSchema>

export const teamStatsSchema = z.object({
  teamSize: z.number().int(),
  presentToday: z.number().int(),
  absentToday: z.number().int(),
  pendingApprovals: z.number().int(),
  attendanceRate: z.number(),
  lateThisMonth: z.number().int(),
  leaveRequestsThisMonth: z.number().int(),
})
export type TeamStats = z.infer<typeof teamStatsSchema>
