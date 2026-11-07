import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { changePasswordSchema, loginSchema, type ChangePasswordInput, type LoginInput } from '@hr/shared'
import { checkPasswordStrength, hashPassword, needsRehash, verifyPassword } from '../auth/password.js'
import { createSession, destroyAllSessions, destroySession } from '../auth/session.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { toSessionUser } from '../mappers.js'
import { requireAuth, validateBody, type AppEnv } from '../middleware.js'
import { rateLimit } from '../rateLimit.js'

export const authRoutes = new Hono<AppEnv>()

/**
 * A wrong email and a wrong password fail identically, and both paths do the
 * same amount of work, so the response cannot be used to discover which
 * addresses have accounts.
 */
const INVALID = () => new HTTPException(401, { message: 'invalidCredentials' })

/**
 * A ceiling on guessing — two of them, because one number cannot do both jobs.
 *
 * This route had no limit at all until the careers page forced the question.
 * Two things were wrong with that, not one: passwords could be guessed
 * indefinitely, and because scrypt is deliberately slow, a handful of
 * concurrent attempts was enough to saturate the CPU and lock everyone else
 * out of signing in.
 *
 * The pair below is deliberate. A single per-address limit tight enough to stop
 * guessing would also lock out an office where forty people share one public
 * address; a single limit loose enough for that office would leave any one
 * account wide open. So:
 *
 *  - Per account, from one address: five. Tight, because nobody mistypes their
 *    own password six times in a quarter of an hour, and this is the number
 *    that actually stops someone working through a password list.
 *  - Per address, across all accounts: forty. Loose enough for a shared office
 *    behind one NAT, tight enough that sweeping a list of addresses from one
 *    machine stops quickly.
 *
 * The two are separate counters, so exhausting one account's five does not
 * consume a colleague's allowance on the same network.
 */
const perAccountLimit = rateLimit({
  name: 'login-account',
  limit: 5,
  windowMs: 15 * 60 * 1000,
  keyExtra: async (c) => {
    // The body is read here and again by `validateBody`; Hono caches the parse,
    // so this does not consume the stream.
    const body = await c.req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null
    return email && email.length <= 200 ? email : null
  },
})

const perAddressLimit = rateLimit({ name: 'login-address', limit: 40, windowMs: 15 * 60 * 1000 })

authRoutes.post('/login', perAddressLimit, perAccountLimit, validateBody(loginSchema), async (c) => {
  const { email, password } = c.get('body') as LoginInput

  const found = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  const user = found[0]

  // Always run a verification, even with no user, so the timing matches.
  const ok = await verifyPassword(password, user?.passwordHash ?? null)
  if (!user || !ok) throw INVALID()
  if (!user.isActive) throw new HTTPException(403, { message: 'accountDisabled' })

  // Cost parameters were raised since this hash was written — upgrade it silently.
  if (needsRehash(user.passwordHash)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(eq(users.id, user.id))
  }

  await createSession(c, user.id)

  const manager = user.managerId
    ? (await db.select().from(users).where(eq(users.id, user.managerId)).limit(1))[0] ?? null
    : null

  return c.json({ user: toSessionUser(user, manager) })
})

authRoutes.post('/logout', async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

/** Who am I — the web app calls this on boot to restore a session. */
authRoutes.get('/me', requireAuth, async (c) => {
  const session = c.get('user')
  const manager = session.managerId
    ? (await db.select().from(users).where(eq(users.id, session.managerId)).limit(1))[0] ?? null
    : null
  const fresh = (await db.select().from(users).where(eq(users.id, session.id)).limit(1))[0]
  if (!fresh) throw new HTTPException(401, { message: 'notAuthenticated' })
  return c.json({ user: toSessionUser(fresh, manager) })
})

authRoutes.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (c) => {
    const session = c.get('user')
    const { currentPassword, newPassword } = c.get('body') as ChangePasswordInput

    const found = await db.select().from(users).where(eq(users.id, session.id)).limit(1)
    const user = found[0]
    if (!user) throw new HTTPException(401, { message: 'notAuthenticated' })

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HTTPException(400, { message: 'currentPasswordWrong' })
    }

    const problem = checkPasswordStrength(newPassword)
    if (problem) throw new HTTPException(422, { message: problem.code })

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id))

    // Every other device is signed out, then this one gets a fresh session.
    await destroyAllSessions(user.id)
    await createSession(c, user.id)

    return c.json({ ok: true })
  },
)
