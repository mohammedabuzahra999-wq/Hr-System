import { z } from 'zod'
import { idSchema, instantSchema, localizedSchema, messageSchema, roleSchema } from './primitives.js'

export const notificationSchema = z.object({
  id: idSchema,
  /** Written by the app, so it travels as a dictionary key and is translated on render. */
  message: messageSchema,
  at: instantSchema,
  read: z.boolean(),
})
export type AppNotification = z.infer<typeof notificationSchema>

/**
 * What an announcement is about.
 *
 * A public holiday and a staff meeting are both announcements, but they are read
 * differently — one is time off, the other is an obligation — so the kind is
 * stored rather than left for the reader to infer from the wording.
 */
export const announcementKindSchema = z.enum(['general', 'holiday', 'meeting'])
export type AnnouncementKind = z.infer<typeof announcementKindSchema>

export const announcementSchema = z.object({
  id: idSchema,
  /** Written by a person, so it carries both languages. */
  title: localizedSchema,
  detail: localizedSchema,
  kind: announcementKindSchema,
  publishedAt: instantSchema,
  /**
   * When it stops being shown. Null means it stays up until somebody withdraws it.
   *
   * Stored as the moment it lapses rather than as a duration, so a notice about
   * Thursday's closure disappears on Thursday no matter when it was written or
   * edited. A duration would have to be recomputed every time the text changed.
   */
  expiresAt: instantSchema.nullable(),
  /** Resolved by the server against its own clock, never by comparing dates in a browser. */
  expired: z.boolean(),
  authorName: localizedSchema.nullable(),
  /**
   * The author's role, carried alongside the name.
   *
   * A reader wants to know whether a notice came from HR or from a manager, and
   * that is a fact about the account rather than something to read out of the
   * name. Sent as the role key so it is translated at render time and stays
   * right when the reader switches language.
   */
  authorRole: roleSchema.nullable(),
})
export type Announcement = z.infer<typeof announcementSchema>

/**
 * Posting one.
 *
 * There is no audience field. Announcements here are company-wide by definition
 * and only HR and administrators may post: a manager who needs to reach their own
 * team does that through the team screens rather than by broadcasting.
 */
export const createAnnouncementSchema = z.object({
  title: localizedSchema,
  detail: localizedSchema,
  kind: announcementKindSchema.default('general'),
  /** Omitted or null keeps it up indefinitely. */
  expiresAt: instantSchema.nullable().optional(),
})
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>

/**
 * Editing one.
 *
 * Partial, so a caller changing only the expiry does not have to resend the
 * text. `expiresAt: null` is meaningful — it clears an expiry — which is why the
 * field is nullable rather than merely optional.
 */
export const updateAnnouncementSchema = createAnnouncementSchema.partial()
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>

export const markReadSchema = z.object({
  read: z.boolean(),
})
export type MarkReadInput = z.infer<typeof markReadSchema>

/**
 * One list behind the bell, holding two different things.
 *
 * A notification is written by the app and addressed to one person; an
 * announcement is written by a person and addressed to everyone. They are worth
 * reading in the same place and at the same moment, so they arrive merged and
 * already ordered by time — but they are not flattened into one shape, because
 * one is translated from a key at render time and the other is stored text that
 * must not be.
 *
 * `source` discriminates. Nothing else about them is made to look alike.
 */
export const inboxItemSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('notification'),
    id: idSchema,
    message: messageSchema,
    at: instantSchema,
    read: z.boolean(),
  }),
  z.object({
    source: z.literal('announcement'),
    id: idSchema,
    kind: announcementKindSchema,
    title: localizedSchema,
    detail: localizedSchema,
    at: instantSchema,
    /**
     * Derived, not stored per person: an announcement counts as read once it is
     * older than the last time this reader opened the bell. A row per employee
     * per announcement would be a lot of bookkeeping for a board notice.
     */
    read: z.boolean(),
    authorName: localizedSchema.nullable(),
    authorRole: roleSchema.nullable(),
  }),
])
export type InboxItem = z.infer<typeof inboxItemSchema>
