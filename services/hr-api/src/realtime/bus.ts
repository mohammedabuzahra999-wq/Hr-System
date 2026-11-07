import { EventEmitter } from 'node:events'
import { eq, or } from 'drizzle-orm'
import type { EventAudience, Role, ServerEvent } from '@hr/shared'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'

/**
 * Fan-out for the SSE stream.
 *
 * Delivery is decided per connection from the audience on the event, not by the
 * client asking for a topic: a browser cannot subscribe itself to someone else's
 * attendance. Events carry ids rather than rows, so even a delivery mistake
 * leaks nothing — the client still has to fetch through an authorised endpoint.
 *
 * This is in-process, which is correct for one long-running server. Running more
 * than one instance means moving the transport to Postgres LISTEN/NOTIFY or
 * Redis; `publish` is the only function that would change.
 */

export interface Subscriber {
  id: string
  userId: string
  role: Role
  /** Ids of the people this subscriber supervises, resolved once at connect. */
  supervises: Set<string>
  send: (event: ServerEvent) => void
}

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

const subscribers = new Map<string, Subscriber>()

/**
 * Tells the people who watch rosters that presence moved.
 *
 * Debounced, because connections churn: a page navigation, a reconnect after a
 * dropped network, a second tab — each of those is an add and a remove, and
 * none of them is worth its own refetch on every HR screen. One notice a few
 * seconds after things settle says the same thing for a fraction of the traffic.
 *
 * Announced to the roles that read rosters, not to everyone: an employee has no
 * screen that lists who else is online, and does not need to be told.
 */
let presenceTimer: NodeJS.Timeout | null = null
export function announcePresence() {
  if (presenceTimer) return
  presenceTimer = setTimeout(() => {
    presenceTimer = null
    publish({ type: 'presence.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['manager', 'hr', 'admin'] })
  }, 3000)
  presenceTimer.unref?.()
}

export function addSubscriber(sub: Subscriber) {
  subscribers.set(sub.id, sub)
  announcePresence()
  return () => {
    subscribers.delete(sub.id)
    announcePresence()
  }
}

export function subscriberCount() {
  return subscribers.size
}

function reaches(sub: Subscriber, audience: EventAudience): boolean {
  if (audience.kind === 'everyone') return true
  if (audience.kind === 'user') return sub.userId === audience.userId
  if (audience.kind === 'roles') return audience.roles.includes(sub.role)
  // 'supervisors': the person themselves, their manager, and an org-wide remit.
  return (
    sub.userId === audience.userId ||
    sub.supervises.has(audience.userId) ||
    sub.role === 'hr' ||
    sub.role === 'admin'
  )
}

export function publish(event: ServerEvent, audience: EventAudience) {
  for (const sub of subscribers.values()) {
    if (!reaches(sub, audience)) continue
    try {
      sub.send(event)
    } catch {
      // A dead connection is dropped by its own close handler; never let one
      // broken socket stop the others from being told.
      subscribers.delete(sub.id)
    }
  }
}

/** Direct reports, used to decide who may hear about an employee's activity. */
export async function resolveSupervises(userId: string, role: Role): Promise<Set<string>> {
  if (role === 'employee') return new Set()
  if (role === 'admin' || role === 'hr') {
    const everyone = await db.select({ id: users.id }).from(users)
    return new Set(everyone.map((u) => u.id))
  }
  const reports = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.managerId, userId), eq(users.id, userId)))
  return new Set(reports.map((u) => u.id))
}
