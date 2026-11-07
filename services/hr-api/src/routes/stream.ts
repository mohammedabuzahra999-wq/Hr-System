import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { ServerEvent } from '@hr/shared'
import { requireAuth, type AppEnv } from '../middleware.js'
import { addSubscriber, resolveSupervises } from '../realtime/bus.js'

export const streamRoutes = new Hono<AppEnv>()

/** Proxies and browsers drop a quiet connection; this keeps it open. */
const HEARTBEAT_MS = 25_000

/**
 * The real-time channel.
 *
 * Server-sent events rather than WebSockets: everything here flows one way,
 * server to browser, and EventSource reconnects on its own. The connection is
 * authenticated like any other route, and what it receives is decided from the
 * session — a client cannot ask to be sent someone else's events.
 */
streamRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user')
  const supervises = await resolveSupervises(user.id, user.role)

  return streamSSE(c, async (stream) => {
    const id = randomUUID()
    const queue: ServerEvent[] = []
    let notify: (() => void) | null = null

    const unsubscribe = addSubscriber({
      id,
      userId: user.id,
      role: user.role,
      supervises,
      send: (event) => {
        queue.push(event)
        notify?.()
      },
    })

    stream.onAbort(() => {
      unsubscribe()
      notify?.()
    })

    queue.push({ type: 'stream.ready', at: new Date().toISOString() })

    try {
      while (!stream.aborted) {
        while (queue.length > 0) {
          const event = queue.shift()!
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
        }

        // Wait for the next event or the heartbeat, whichever comes first.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, HEARTBEAT_MS)
          notify = () => {
            clearTimeout(timer)
            notify = null
            resolve()
          }
        })

        if (!stream.aborted && queue.length === 0) {
          // A comment line keeps the socket alive without being an event.
          await stream.writeSSE({ data: '', event: 'ping' })
        }
      }
    } finally {
      unsubscribe()
    }
  })
})
