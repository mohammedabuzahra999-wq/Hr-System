import { PRESENCE_ONLINE_MS, PRESENCE_RECENT_MS, type Presence } from '@hr/shared'

/**
 * Whether an account counts as present, from its last-seen time.
 *
 * Lifted out of the employees route so the directory and the assistant give the
 * same answer to the same question. Two copies of this would drift the first
 * time a window changed, and "the directory says online, the assistant says
 * offline" is the kind of contradiction that costs trust in both.
 *
 * An account that has never signed in is offline, not unknown: nobody has ever
 * been there.
 */
export function presenceOf(lastSeenAt: Date | null, now = Date.now()): Presence {
  if (!lastSeenAt) return 'offline'
  const since = now - lastSeenAt.getTime()
  if (since <= PRESENCE_ONLINE_MS) return 'online'
  if (since <= PRESENCE_RECENT_MS) return 'recent'
  return 'offline'
}

/** Judges a whole response at one instant, so no two rows disagree about "now". */
export function presenceResolver() {
  const now = Date.now()
  return (row: { lastSeenAt: Date | null }): Presence => presenceOf(row.lastSeenAt, now)
}
