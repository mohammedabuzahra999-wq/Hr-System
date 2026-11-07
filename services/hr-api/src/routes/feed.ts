import { aliasedTable, and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  createAnnouncementSchema,
  markReadSchema,
  updateAnnouncementSchema,
  type CreateAnnouncementInput,
  type InboxItem,
  type MarkReadInput,
  type UpdateAnnouncementInput,
} from '@hr/shared'
import { db } from '../db/client.js'
import { announcements, notifications, users } from '../db/schema.js'
import { toAnnouncement, toNotification } from '../mappers.js'
import { requireAuth, requireRole, validateBody, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { announcePresence, publish } from '../realtime/bus.js'

export const feedRoutes = new Hono<AppEnv>()

feedRoutes.use('*', requireAuth)

/* ---------- notifications ---------- */

feedRoutes.get('/notifications', async (c) => {
  const user = c.get('user')
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50)

  return c.json({ notifications: rows.map(toNotification) })
})

feedRoutes.patch('/notifications/:id', validateBody(markReadSchema), async (c) => {
  const user = c.get('user')
  const { read } = c.get('body') as MarkReadInput

  const [row] = await db
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    // Scoped to the owner, so an id from another account simply matches nothing.
    .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, user.id)))
    .returning()

  if (!row) throw new HTTPException(404, { message: 'notificationNotFound' })
  return c.json(toNotification(row))
})

/**
 * Clearing the bell.
 *
 * Stamps both halves: personal notifications get a `readAt`, and announcements
 * are marked seen by moving this reader's watermark to now. Otherwise pressing
 * "mark all as read" would leave the company notices still counted, which is
 * exactly the kind of small lie that makes a badge worth ignoring.
 */
feedRoutes.post('/notifications/read-all', async (c) => {
  const user = c.get('user')
  const now = new Date()
  await Promise.all([
    db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    db.update(users).set({ announcementsSeenAt: now }).where(eq(users.id, user.id)),
  ])
  return c.json({ ok: true })
})

feedRoutes.delete('/notifications/:id', async (c) => {
  const user = c.get('user')
  const result = await db
    .delete(notifications)
    .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, user.id)))
  if (!result.rowCount) throw new HTTPException(404, { message: 'notificationNotFound' })
  return c.json({ ok: true })
})

/**
 * "I am still here."
 *
 * Sent by an open app every `PRESENCE_PING_MS`, and only while the page is
 * actually visible. Unthrottled, unlike the stamp `requireAuth` makes on
 * ordinary traffic: this one *is* the presence signal, and skipping it would be
 * skipping the thing being measured.
 */
feedRoutes.post('/ping', async (c) => {
  const user = c.get('user')
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id))
  announcePresence()
  return c.json({ ok: true })
})

/* ---------- the bell ---------- */

const author = aliasedTable(users, 'author')

/**
 * Everything worth telling this person, in one list.
 *
 * The bell shows notifications and announcements together, so they are merged
 * here rather than in the browser: the two queries have different scoping rules
 * and only the server knows both. Sorted newest first and capped, because a bell
 * is a glance, not an archive.
 */
feedRoutes.get('/inbox', async (c) => {
  const user = c.get('user')

  const [notes, posts, me] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(30),
    db
      .select({ announcement: announcements, author })
      .from(announcements)
      .leftJoin(author, eq(author.id, announcements.authorId))
      // A notice that has lapsed is not news, so the bell never carries one.
      .where(and(visibleTo(user), notExpired()))
      .orderBy(desc(announcements.publishedAt))
      .limit(30),
    db.select({ seenAt: users.announcementsSeenAt }).from(users).where(eq(users.id, user.id)).limit(1),
  ])

  const seenAt = me[0]?.seenAt ?? null

  const items: InboxItem[] = [
    ...notes.map((row): InboxItem => {
      const n = toNotification(row)
      return { source: 'notification', id: n.id, message: n.message, at: n.at, read: n.read }
    }),
    ...posts.map(({ announcement, author: writer }): InboxItem => {
      const a = toAnnouncement(announcement, writer)
      return {
        source: 'announcement',
        id: a.id,
        kind: a.kind,
        title: a.title,
        detail: a.detail,
        at: a.publishedAt,
        // Never seen the bell at all means everything on the board is new.
        read: seenAt !== null && announcement.publishedAt <= seenAt,
        authorName: a.authorName,
        authorRole: a.authorRole,
      }
    }),
  ].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))

  return c.json({ items: items.slice(0, 40) })
})

/* ---------- announcements ---------- */

/** Who a given reader is allowed to see, expiry aside. */
const visibleTo = (user: { id: string; managerId: string | null }) =>
  // Company-wide posts, plus team posts from the reader's own manager.
  or(
    isNull(announcements.teamOfId),
    user.managerId ? eq(announcements.teamOfId, user.managerId) : undefined,
    eq(announcements.teamOfId, user.id),
  )

/** Still up: no expiry set, or one that has not arrived yet. */
const notExpired = () => or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date()))

/**
 * Reading the board.
 *
 * Expired posts are dropped here rather than hidden in the browser — an employee
 * whose client filtered them would still have been sent them. The screens that
 * manage announcements ask for `scope=manage` to get the lapsed ones back, so
 * their author can extend or withdraw them, and only the three roles that can
 * post are allowed that view.
 */
feedRoutes.get('/announcements', async (c) => {
  const user = c.get('user')
  const manageView =
    c.req.query('scope') === 'manage' && ['manager', 'hr', 'admin'].includes(user.role)

  const rows = await db
    .select({ announcement: announcements, author })
    .from(announcements)
    .leftJoin(author, eq(author.id, announcements.authorId))
    .where(manageView ? visibleTo(user) : and(visibleTo(user), notExpired()))
    .orderBy(desc(announcements.publishedAt))
    .limit(30)

  return c.json({ announcements: rows.map((r) => toAnnouncement(r.announcement, r.author)) })
})

/**
 * Editing one.
 *
 * The same hands that may withdraw a post may rewrite it: HR and an
 * administrator for anything, a manager only for their own. Changing the expiry
 * alone is the common case, so every field is optional — and `expiresAt: null`
 * is a real instruction to clear it, not an omission.
 */
feedRoutes.patch(
  '/announcements/:id',
  requireRole(...allowed('postAnnouncements')),
  validateBody(updateAnnouncementSchema),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const input = c.get('body') as UpdateAnnouncementInput

    const existing = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1)
    if (!existing[0]) throw new HTTPException(404, { message: 'announcementNotFound' })
    if (user.role === 'manager' && existing[0].authorId !== user.id) {
      throw new HTTPException(403, { message: 'forbidden' })
    }

    const [row] = await db
      .update(announcements)
      .set({
        ...(input.title ? { titleEn: input.title.en, titleAr: input.title.ar } : {}),
        ...(input.detail ? { detailEn: input.detail.en, detailAr: input.detail.ar } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
      })
      .where(eq(announcements.id, id))
      .returning()

    publish({ type: 'announcement.published', announcementId: id, at: new Date().toISOString() }, { kind: 'everyone' })

    const writer = await db.select().from(users).where(eq(users.id, row!.authorId ?? user.id)).limit(1)
    return c.json({ announcement: toAnnouncement(row!, writer[0] ?? null) })
  },
)

/**
 * Publishing an announcement.
 *
 * HR, a manager and an administrator may all post, and every post reaches the
 * whole company — a holiday or a meeting is not a per-team fact, so `teamOfId`
 * is always null and the event goes to everyone.
 *
 * Because a reader now gets notices from more than one source, the author's name
 * and role travel with each row: "who is telling me this" is part of the notice.
 */
feedRoutes.post(
  '/announcements',
  requireRole(...allowed('postAnnouncements')),
  validateBody(createAnnouncementSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.get('body') as CreateAnnouncementInput

    const [row] = await db
      .insert(announcements)
      .values({
        titleEn: input.title.en,
        titleAr: input.title.ar,
        detailEn: input.detail.en,
        detailAr: input.detail.ar,
        kind: input.kind,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        authorId: user.id,
        teamOfId: null,
      })
      .returning()

    publish(
      { type: 'announcement.published', announcementId: row!.id, at: row!.publishedAt.toISOString() },
      { kind: 'everyone' },
    )

    const author = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
    return c.json({ announcement: toAnnouncement(row!, author[0] ?? null) }, 201)
  },
)

/**
 * Withdrawing one.
 *
 * HR and an administrator can withdraw anything; a manager only what they wrote
 * themselves. Otherwise any manager could silently delete an HR notice about a
 * public holiday, and nobody reading the board would know it had been there.
 */
feedRoutes.delete('/announcements/:id', requireRole(...allowed('postAnnouncements')), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const rows = await db
    .select({ id: announcements.id, authorId: announcements.authorId })
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1)
  if (!rows[0]) throw new HTTPException(404, { message: 'announcementNotFound' })
  if (user.role === 'manager' && rows[0].authorId !== user.id) {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  await db.delete(announcements).where(eq(announcements.id, id))
  publish({ type: 'announcement.published', announcementId: id, at: new Date().toISOString() }, { kind: 'everyone' })
  return c.json({ ok: true })
})
