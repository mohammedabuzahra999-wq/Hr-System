import { z } from 'zod'
import { dateOnlySchema, idSchema, instantSchema, localizedSchema } from './primitives.js'

export const attendanceStatusSchema = z.enum([
  'present',
  'late',
  'absent',
  'leave',
  'holiday',
  'weekend',
])
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>

export const shiftSchema = z.object({
  startHour: z.number().int().min(0).max(23),
  startMinute: z.number().int().min(0).max(59),
  endHour: z.number().int().min(0).max(23),
  endMinute: z.number().int().min(0).max(59),
  /** Minutes after the start that still count as on time. */
  graceMinutes: z.number().int().min(0).max(120),
})
export type Shift = z.infer<typeof shiftSchema>

export const attendanceDaySchema = z.object({
  date: dateOnlySchema,
  checkIn: instantSchema.nullable(),
  checkOut: instantSchema.nullable(),
  status: attendanceStatusSchema,
})
export type AttendanceDay = z.infer<typeof attendanceDaySchema>

/** One employee's day, for the HR and manager tables. */
export const teamAttendanceRowSchema = attendanceDaySchema.extend({
  userId: idSchema,
  name: localizedSchema,
  department: localizedSchema,
  /** Milliseconds between check-in and check-out, or up to now for an open shift. */
  workedMs: z.number().int().min(0),
})
export type TeamAttendanceRow = z.infer<typeof teamAttendanceRowSchema>

export const attendanceSummarySchema = z.object({
  present: z.number().int(),
  late: z.number().int(),
  absent: z.number().int(),
  leave: z.number().int(),
  worked: z.number().int(),
  totalMs: z.number().int(),
  averageMs: z.number().int(),
})
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>

export const myAttendanceSchema = z.object({
  shift: shiftSchema,
  today: attendanceDaySchema,
  /** Every day of the current month up to today. */
  month: z.array(attendanceDaySchema),
  summary: attendanceSummarySchema,
  holidays: z.array(dateOnlySchema),
})
export type MyAttendance = z.infer<typeof myAttendanceSchema>

/**
 * Check in and check out take no body: the server stamps the time. A
 * client-supplied clock would be the employee's own, and trivially editable.
 */
export const attendanceRangeSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
})
export type AttendanceRange = z.infer<typeof attendanceRangeSchema>
