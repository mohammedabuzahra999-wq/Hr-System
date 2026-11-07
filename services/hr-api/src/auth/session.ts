import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { db } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { env, isProduction } from '../env.js'
import { toSessionUser } from '../mappers.js'
import type { SessionUser } from '@hr/shared'

export const SESSION_COOKIE = 'hr_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

/**
 * Sessions live in the database, not in a JWT.
 *
 * The cookie holds a random token; the table holds only its SHA-256. A database
 * leak therefore does not hand over live sessions, and signing out or disabling
 * an account takes effect immediately — a stateless token would stay valid until
 * it expired.
 */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(c: Context, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    userAgent: c.req.header('user-agent')?.slice(0, 500) ?? null,
  })

  await setSignedCookie(c, SESSION_COOKIE, token, env.SESSION_SECRET, {
    httpOnly: true, // JavaScript cannot read it, so XSS cannot steal the session.
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    path: '/',
    expires: expiresAt,
  })

  return { token, expiresAt }
}

export async function destroySession(c: Context) {
  const token = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Ends every session for a user — used when an account is disabled or its password changes. */
export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

export async function resolveSession(c: Context): Promise<SessionUser | null> {
  const token = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  if (!token) return null

  const tokenHash = hashToken(token)
  const rows = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  // Compare again in constant time; the lookup above already matched, this guards
  // against a timing signal on the hash prefix if the index is ever changed.
  const a = Buffer.from(row.sessions.tokenHash)
  const b = Buffer.from(tokenHash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  // A disabled account keeps no access, even with a cookie that has not expired.
  if (!row.users.isActive) return null

  return toSessionUser(row.users, null)
}

/** Housekeeping: drop rows that can no longer authenticate anyone. */
export async function pruneExpiredSessions() {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  return result.rowCount ?? 0
}
