import { z } from 'zod'
import { attendanceStatusSchema } from './attendance.js'
import { notificationSchema } from './feed.js'
import { requestStatusSchema } from './leave.js'
import { dateOnlySchema, idSchema, instantSchema } from './primitives.js'

/**
 * What the server pushes down the SSE stream.
 *
 * Every event carries only what a client needs to decide whether to refetch —
 * never the row itself. A client that is not allowed to see a record must not
 * receive its contents just because it was subscribed, and a thin event cannot
 * leak one. The client refetches through the same authorised endpoint it would
 * have used anyway.
 */
export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attendance.changed'),
    userId: idSchema,
    date: dateOnlySchema,
    status: attendanceStatusSchema,
    at: instantSchema,
  }),
  z.object({
    type: z.literal('request.created'),
    requestId: idSchema,
    userId: idSchema,
    at: instantSchema,
  }),
  z.object({
    type: z.literal('request.decided'),
    requestId: idSchema,
    userId: idSchema,
    status: requestStatusSchema,
    at: instantSchema,
  }),
  z.object({
    type: z.literal('notification.created'),
    notification: notificationSchema,
  }),
  z.object({
    type: z.literal('announcement.published'),
    announcementId: idSchema,
    at: instantSchema,
  }),
  z.object({
    type: z.literal('employee.changed'),
    userId: idSchema,
    at: instantSchema,
  }),
  z.object({
    type: z.literal('calendar.changed'),
    eventId: z.string(),
    at: instantSchema,
  }),
  /** Somebody opened or closed the app. Carries no names — the reader refetches. */
  z.object({
    type: z.literal('presence.changed'),
    at: instantSchema,
  }),
  /** An opening, a candidate or a CV changed. Carries no row — HR refetches. */
  z.object({
    type: z.literal('recruitment.changed'),
    at: instantSchema,
  }),
  /** Payroll input, audit or run state changed. The reader refetches its allowed view. */
  z.object({
    type: z.literal('payroll.changed'),
    at: instantSchema,
  }),
  /** Sent on connect so a client can tell "open" from "still connecting". */
  z.object({
    type: z.literal('stream.ready'),
    at: instantSchema,
  }),
])
export type ServerEvent = z.infer<typeof serverEventSchema>
export type ServerEventType = ServerEvent['type']

/**
 * Who a given event reaches. The server resolves this to concrete connections;
 * it is never sent to the client.
 */
export type EventAudience =
  | { kind: 'user'; userId: string }
  /** The employee plus whoever supervises them: their manager, HR and admin. */
  | { kind: 'supervisors'; userId: string }
  | { kind: 'roles'; roles: Array<'admin' | 'manager' | 'hr' | 'employee'> }
  | { kind: 'everyone' }
