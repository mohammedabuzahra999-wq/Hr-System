import { z } from 'zod'
import { idSchema, instantSchema, localizedSchema } from './primitives.js'

/**
 * What the team calendar shows.
 *
 * Two sources are merged into one list: events someone scheduled, and leave that
 * has actually been approved. Leave is never copied into the events table — it is
 * derived from the requests, so a cancelled or reversed approval cannot leave a
 * stale day sitting on the calendar.
 */
export const calendarEventKindSchema = z.enum(['meeting', 'training', 'holiday', 'leave'])
export type CalendarEventKind = z.infer<typeof calendarEventKindSchema>

export const calendarEventSchema = z.object({
  id: z.string(),
  kind: calendarEventKindSchema,
  title: localizedSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  /** Spans whole days, so the time is not meaningful and should not be shown. */
  allDay: z.boolean(),
  location: z.string().nullable(),
  /** Set on a leave entry: whose absence this is. */
  personName: localizedSchema.nullable(),
  /** False for a derived entry, which cannot be edited on the calendar. */
  editable: z.boolean(),
})
export type CalendarEvent = z.infer<typeof calendarEventSchema>

export const calendarRangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
})
export type CalendarRange = z.infer<typeof calendarRangeSchema>

export const createCalendarEventSchema = z
  .object({
    kind: z.enum(['meeting', 'training', 'holiday']),
    title: localizedSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    allDay: z.boolean().default(false),
    location: z.string().max(200).optional(),
    /** 'team' limits it to the author's reports; 'all' reaches everyone. */
    audience: z.enum(['all', 'team']).default('team'),
  })
  .refine((v) => new Date(v.endsAt) >= new Date(v.startsAt), {
    message: 'endsAtBeforeStart',
    path: ['endsAt'],
  })
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>

export const calendarSummarySchema = z.object({
  events: z.array(calendarEventSchema),
  meetings: z.number().int(),
  training: z.number().int(),
  leaveDays: z.number().int(),
})
export type CalendarSummary = z.infer<typeof calendarSummarySchema>

export const deleteCalendarEventSchema = z.object({ id: idSchema })
