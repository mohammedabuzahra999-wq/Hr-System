import { db } from '../db/client.js'
import { notifications } from '../db/schema.js'
import { toNotification } from '../mappers.js'
import { publish } from '../realtime/bus.js'

/**
 * Writes a notification and pushes it to that user's open tabs.
 *
 * The message is stored as a dictionary key plus variables rather than as
 * finished text, so it renders in whichever language the reader is using now —
 * not the one they were using when it was written.
 */
export async function notify(
  userId: string,
  key: string,
  vars?: Record<string, string | number>,
) {
  const [row] = await db.insert(notifications).values({ userId, messageKey: key, messageVars: vars ?? null }).returning()
  if (!row) return null

  const notification = toNotification(row)
  publish({ type: 'notification.created', notification }, { kind: 'user', userId })
  return notification
}

/** Same message to several people, in one insert. */
export async function notifyMany(
  userIds: string[],
  key: string,
  vars?: Record<string, string | number>,
) {
  if (userIds.length === 0) return
  const rows = await db
    .insert(notifications)
    .values(userIds.map((userId) => ({ userId, messageKey: key, messageVars: vars ?? null })))
    .returning()

  for (const row of rows) {
    publish(
      { type: 'notification.created', notification: toNotification(row) },
      { kind: 'user', userId: row.userId },
    )
  }
}
