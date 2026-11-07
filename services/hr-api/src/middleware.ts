import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ZodType } from 'zod'
import type { Role, SessionUser } from '@hr/shared'
import { resolveSession } from './auth/session.js'
import { auditCopilot } from './copilot/audit.js'

export interface AppEnv {
  Variables: {
    user: SessionUser
  }
}

/**
 * Rejects anything without a live session before a handler runs, so no route can
 * forget to check. `c.get('user')` is therefore always present downstream.
 *
 * It deliberately does NOT record presence.
 *
 * It used to: every authenticated request stamped `lastSeenAt`, on the reasoning
 * that a request means somebody is there. It does not. A script with a valid
 * cookie is a request. A forgotten tab polling in the background is a request.
 * An automated check is a request — and that is exactly how this was caught: the
 * directory showed three people as having been in the system an hour and a half
 * ago, when what had actually happened was a test logging in as them.
 *
 * Presence now has one writer, `POST /feed/ping`, which an open and *visible*
 * app sends. "Somebody is here" is a claim about a person, so only the person's
 * own app is allowed to make it.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveSession(c)
  if (!user) {
    throw new HTTPException(401, { message: 'notAuthenticated' })
  }
  c.set('user', user)
  await next()
}

/**
 * Role gate. Runs after `requireAuth`.
 *
 * Deliberately returns 403 and not 404: the caller is authenticated, and hiding
 * the existence of an admin route from a signed-in employee buys nothing.
 */
export const requireRole =
  (...roles: Role[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: 'forbidden' })
    }
    await next()
  }

/** Validates a JSON body and replaces it with the parsed value. */
export function validateBody<T>(schema: ZodType<T>): MiddlewareHandler<AppEnv & { Variables: { body: T } }> {
  return async (c, next) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      void auditInvalidCopilotRequest(c, 'invalid_json')
      throw new HTTPException(400, { message: 'invalidJson' })
    }

    const result = schema.safeParse(raw)
    if (!result.success) {
      void auditInvalidCopilotRequest(c, 'invalid_arguments')
      throw new HTTPException(422, {
        res: c.json(
          {
            error: 'validationFailed',
            message: 'The request body did not match the expected shape.',
            details: fieldErrors(result.error.issues),
          },
          422,
        ),
      })
    }

    c.set('body', result.data)
    await next()
  }
}

/** Invalid assistant bodies are audited without retaining the submitted body. */
async function auditInvalidCopilotRequest(
  c: { req: { path: string }; get: (key: 'user') => SessionUser },
  reason: 'invalid_json' | 'invalid_arguments',
): Promise<void> {
  if (!c.req.path.includes('/copilot/')) return
  await auditCopilot(c.get('user'), { eventType: 'request', status: 'invalid', reason })
}

/** Validates the query string and exposes it as `c.get('query')`. */
export function validateQuery<T>(schema: ZodType<T>): MiddlewareHandler<AppEnv & { Variables: { query: T } }> {
  return async (c, next) => {
    const result = schema.safeParse(c.req.query())
    if (!result.success) {
      throw new HTTPException(422, {
        res: c.json(
          {
            error: 'validationFailed',
            message: 'The query string did not match the expected shape.',
            details: fieldErrors(result.error.issues),
          },
          422,
        ),
      })
    }
    c.set('query', result.data)
    await next()
  }
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}
