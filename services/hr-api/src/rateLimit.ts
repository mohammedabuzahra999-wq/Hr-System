import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { clientAddressPolicy } from './env.js'
import type { AppEnv } from './middleware.js'
import { resolveClientAddress } from './clientIdentity.js'
import { AbuseBudget } from './abuseBudget.js'

/**
 * How often one caller may do something.
 *
 * This exists because the application is about to accept requests from people
 * who are not signed in — the careers page and the form on it — and an endpoint
 * open to the internet with no ceiling is an endpoint that can be used to
 * exhaust whatever is behind it.
 *
 * It also closes a hole that predates any of that. `POST /auth/login` had no
 * limit at all, so a script could try passwords indefinitely. Passwords here are
 * hashed with scrypt, which is deliberately slow, and that turns the same
 * opening into a second problem: fifty concurrent guesses saturate the CPU and
 * nobody else can sign in. One ceiling fixes both.
 *
 * ---
 *
 * The counters live in this process's memory. That is correct while the server
 * is one process and wrong the moment it is two: each instance would keep its
 * own tally and the real ceiling would multiply by the instance count. When this
 * is deployed behind more than one instance, the store below is what moves to
 * Redis — nothing else here changes.
 */

const buckets = new AbuseBudget()

/**
 * Old windows are swept on a timer rather than on read.
 *
 * Sweeping on read only ever touches keys that come back, so a burst from ten
 * thousand addresses that never return would sit in the map forever. The timer
 * is unreferenced so it cannot hold the process open at shutdown.
 */
const SWEEP_MS = 5 * 60 * 1000
setInterval(() => {
  buckets.sweep()
}, SWEEP_MS).unref()

/**
 * Who is asking.
 *
 * Direct mode ignores all address headers. Trusted-proxy mode uses XFF only
 * from an explicitly configured socket peer and peels trusted hops from the
 * right. The proxy must append/replace with its actual observed client address.
 */
function callerKey(c: Context): string {
  // `callInternal()` dispatches an authenticated Request in memory. It has no
  // Node socket, so getConnInfo deliberately has nothing to inspect. Keep its
  // limiter bound to the already-authenticated person rather than throwing and
  // bypassing the Copilot route altogether.
  let peer: string | undefined
  try { peer = getConnInfo(c)?.remote?.address } catch { /* In-process authenticated API calls have no socket. */ }
  if (peer) {
    try { return resolveClientAddress(peer, c.req.header('x-forwarded-for'), clientAddressPolicy) ?? 'unknown' }
    catch { throw new HTTPException(400, {message: 'invalidClientAddress'}) }
  }
  const user = c.get('user') as { id?: unknown } | undefined
  return typeof user?.id === 'string' && user.id ? `internal:${user.id}` : 'unknown'
}

export interface RateLimitOptions {
  /** How many requests are allowed inside one window. */
  limit: number
  /** The window length, in milliseconds. */
  windowMs: number
  /** Distinguishes one limiter's counters from another's for the same caller. */
  name: string
  /**
   * Adds something from the request to the key — an email on a login attempt,
   * so guessing many passwords for one account is limited even when the attempt
   * comes from many addresses.
   */
  keyExtra?: (c: Context) => Promise<string | null> | string | null
  /** Only after requireAuth; identity comes from the resolved server session, never a header/body. */
  keyBy?: 'client' | 'authenticated-user'
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const extra = options.keyExtra ? await options.keyExtra(c) : null
    const user = c.get('user')
    if (options.keyBy === 'authenticated-user' && !user?.id) throw new HTTPException(401, {message: 'unauthenticated'})
    const identity = (options.keyBy === 'authenticated-user' ? `user:${user.id}` : callerKey(c)) + (extra ? ':' + extra.slice(0, 1024) : '')
    const {allowed, remaining, retryAfter} = buckets.consume(options.name, identity, options.limit, options.windowMs)

    c.header('RateLimit-Limit', String(options.limit))
    c.header('RateLimit-Remaining', String(remaining))
    c.header('RateLimit-Reset', String(retryAfter))

    if (!allowed) {
      c.header('Retry-After', String(retryAfter))
      /**
       * 429 with a translatable code, and nothing about which limit was hit or
       * how many attempts remain. A response that counts down for the caller is
       * a response that tells a script exactly how to pace itself.
       */
      throw new HTTPException(429, { message: 'tooManyRequests' })
    }

    await next()
  }
}

/** Visible for tests and for a future move to a shared store. */
export function resetRateLimits(): void {
  buckets.clear()
}
