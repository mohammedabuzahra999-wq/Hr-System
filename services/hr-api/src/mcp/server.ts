import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { sessionUserSchema, type ActionParams, type SessionUser } from '@hr/shared'
import { ACTION_DESCRIPTIONS, DESTRUCTIVE, actionsFor, mayDo } from '../copilot/actions.js'
import { executeIntent } from '../copilot/execute.js'
import { INTENT_DESCRIPTIONS, intentsFor, mayAsk } from '../copilot/intents.js'
import { proposeAction, runAction } from '../copilot/perform.js'
import { phraseAnswer, resolveAction, resolveQuestion } from '../copilot/resolve.js'
import { dayKey } from '../domain/workdays.js'
import { callInternal } from '../internalApi.js'
import { TOOL_INPUTS, describeCapabilities } from './tools.js'
import { ACTION_INPUTS, INTENT_INPUTS, planFor, questionPlanFor } from './schemas.js'

/**
 * The HR system, exposed to any agent that speaks MCP.
 *
 * The in-app assistant reaches these capabilities by calling functions in its
 * own process. This is the same capabilities reached over a protocol, so an
 * agent that is not this application — a desktop client, a scheduled job,
 * something written next year — can use them without a second implementation
 * being written for it. That is the argument for MCP here, and it is a good
 * one: the alternative is a new agent per use case, each with its own idea of
 * what the rules are.
 *
 * What it deliberately does NOT do is widen anything. It signs in as one real
 * person and acts as them: the same role checks run, the same routes execute,
 * the same refusals come back. An MCP server holding a privileged service
 * account would be a way to do things through the assistant that nobody is
 * allowed to do in the application, which is the opposite of the point.
 *
 * Run it as a stdio server:
 *   npm run mcp -w @hr/server
 * with HR_MCP_EMAIL and HR_MCP_PASSWORD set to the account it acts as.
 */

const API = process.env.HR_API_URL ?? 'http://localhost:8787/api'

/* ------------------------------------------------------------- the session */

interface Signed {
  cookie: string
  user: SessionUser
}

/**
 * Signing in, once, as the person this server acts for.
 *
 * Through the ordinary login endpoint rather than by reading the users table:
 * a wrong password must fail here exactly as it fails for a browser, and a
 * disabled account must stop working here the moment it stops working there.
 */
async function signIn(): Promise<Signed> {
  const email = process.env.HR_MCP_EMAIL
  const password = process.env.HR_MCP_PASSWORD
  if (!email || !password) {
    throw new Error('HR_MCP_EMAIL and HR_MCP_PASSWORD must be set — this server acts as a real account')
  }

  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(`could not sign in as ${email}: HTTP ${response.status}`)

  const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const body = (await response.json()) as { user?: SessionUser }
  if (!cookie || !body.user) throw new Error('the login succeeded but returned no session')

  return { cookie, user: body.user }
}

/* --------------------------------------------------------- pending changes */

interface Pending {
  params: ActionParams
  summary: string
  at: number
}

/**
 * Plans waiting to be confirmed.
 *
 * Held here rather than handed to the caller as data, so the thing an agent
 * passes to `hr_confirm` is a reference to something this server decided, not
 * an instruction the agent composed. An agent cannot edit a plan it cannot see
 * the contents of — it can only run the one that was described to it, or not.
 *
 * They expire. A plan that has been sitting for five minutes was made against
 * a state of the system that may have moved on: the request it would approve
 * could already be decided, the vacancy it would publish already published.
 */
const pending = new Map<string, Pending>()
const PLAN_TTL_MS = 5 * 60 * 1000

function remember(params: ActionParams, summary: string): string {
  const now = Date.now()
  for (const [key, plan] of pending) if (now - plan.at > PLAN_TTL_MS) pending.delete(key)
  const token = randomUUID()
  pending.set(token, { params, summary, at: now })
  return token
}

/* ---------------------------------------------------------------- the server */

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

/**
 * Propose, declining anything optional.
 *
 * A tool call is one message. There is no second one to answer a question in,
 * so an optional gap here is not a question — it is a field the caller did not
 * pass, which is what optional means. It is turned down on their behalf and the
 * instruction goes through with what was given.
 *
 * Read off the gap rather than from a list of fields kept here, so an optional
 * gap added to any action is handled without this knowing about it.
 */
async function proposeOverTool(
  plan: Parameters<typeof proposeAction>[0],
  user: Parameters<typeof proposeAction>[1],
) {
  const first = await proposeAction(plan, user)
  if (!first.ok && first.missing?.optional) {
    return proposeAction(plan, user, first.missing.fields)
  }
  return first
}

export async function startMcpServer(): Promise<void> {
  const session = await signIn()
  const { user, cookie } = session

  const server = new McpServer({ name: 'menaitech-hr', version: '1.0.0' })

  // Startup identity determines discovery only. Every invocation goes through
  // the normal HTTP session boundary; never refresh an expired session by
  // silently logging in again or reuse the startup role on an auth failure.
  async function currentUser(): Promise<SessionUser | null> {
    try {
      const response = await callInternal({ method: 'GET', path: '/auth/me', cookie })
      if (!response.ok) return null
      const parsed = sessionUserSchema.safeParse((response.data as { user?: unknown } | null)?.user)
      return parsed.success && parsed.data.id === user.id ? parsed.data : null
    } catch {
      return null
    }
  }
  function protectedTool<Args>(handler: (args: Args, actor: SessionUser) => ReturnType<typeof text> | Promise<ReturnType<typeof text>>) {
    return async (args: Args) => {
      const actor = await currentUser()
      if (!actor) return text({ ok: false, reason: 'notAuthenticated' })
      return handler(args, actor)
    }
  }

  server.registerTool(
    'hr_capabilities',
    { description: TOOL_INPUTS.hr_capabilities.description, inputSchema: TOOL_INPUTS.hr_capabilities.schema.shape },
    protectedTool((_args, actor) => text(describeCapabilities(actor.role))),
  )

  /**
   * A question. The same three steps the application takes, in the same order:
   * classify, check the role against the classification, then query.
   */
  server.registerTool(
    'hr_ask',
    { description: TOOL_INPUTS.hr_ask.description, inputSchema: TOOL_INPUTS.hr_ask.schema.shape },
    protectedTool<{ question: string }>(async ({ question }, actor) => {
      const resolved = await resolveQuestion(question, actor.role)
      if (!resolved.ok) return text({ ok: false, reason: resolved.reason })

      // Classification can be slow. Check again immediately before the direct
      // read so a role/session revoked during model resolution is not reused.
      const current = await currentUser()
      if (!current) return text({ ok: false, reason: 'notAuthenticated' })

      const plan = resolved.plan
      if (plan.intent === 'outOfScope') {
        return text({ ok: false, reason: plan.refusalReason ?? 'unclear' })
      }
      if (!mayAsk(current.role, plan.intent)) {
        return text({ ok: false, reason: 'notPermitted', note: 'This account may not ask that.' })
      }
      if (plan.intent === 'doAction') {
        return text({ ok: false, reason: 'thatIsAnInstruction', note: 'Use hr_propose for instructions.' })
      }

      const { result, periodLabel, empty } = await executeIntent(plan, current)
      if (empty) return text({ ok: true, intent: plan.intent, empty: true, result })

      const sentence = await phraseAnswer(question, plan.intent, result)
      return text({ ok: true, intent: plan.intent, period: periodLabel, sentence, result })
    }),
  )

  /**
   * One tool per action this account may take.
   *
   * Generated, so a capability added to the registry appears here without this
   * file being touched — and, more to the point, cannot be added there and
   * forgotten here.
   *
   * Reversible actions run on the single call. Irreversible ones return a
   * description and a token instead, and `hr_confirm` finishes them: an agent
   * working through a list should not be able to delete a vacancy with the same
   * gesture it uses to check somebody in.
   */
  for (const action of actionsFor(user.role)) {
    /* An interface preference is meaningless to a caller with no interface. */
    if (action === 'setLanguage' || action === 'signOut' || action === 'openScreen' || action === 'filterScreen' || action === 'scrollPage') continue
    const irreversible = DESTRUCTIVE.has(action)
    server.registerTool(
      `hr_${action}`,
      {
        description: irreversible
          ? `${ACTION_DESCRIPTIONS[action]} — IRREVERSIBLE: this returns a description and a token; pass the token to hr_confirm to carry it out.`
          : ACTION_DESCRIPTIONS[action],
        inputSchema: ACTION_INPUTS[action],
      },
      protectedTool<Record<string, unknown>>(async (args, actor) => {
        if (!mayDo(actor.role, action)) return text({ ok: false, reason: 'notPermitted' })
        const proposed = await proposeOverTool(planFor(action, args), actor)
        if (!proposed.ok) {
          return text({
            ok: false,
            reason: proposed.reason,
            missing: proposed.missing?.en ?? null,
            candidates: proposed.detail ?? null,
          })
        }
        if ('choice' in proposed) {
          return text({
            ok: false,
            reason: 'ambiguous',
            question: proposed.choice.question.en,
            options: proposed.choice.options.map((o) => ({
              summary: o.summary.en,
              details: o.details.map((d) => `${d.label.en}: ${d.value.en}`),
              token: remember(o.params, o.summary.en),
            })),
          })
        }

        const p = proposed.proposal
        if (irreversible) {
          return text({
            ok: true,
            pending: true,
            summary: p.summary.en,
            details: p.details.map((d) => `${d.label.en}: ${d.value.en}`),
            caution: p.caution?.en ?? null,
            token: remember(p.params, p.summary.en),
            next: 'Call hr_confirm with this token.',
          })
        }

        const current = await currentUser()
        if (!current) return text({ ok: false, reason: 'notAuthenticated' })
        if (!mayDo(current.role, p.action)) return text({ ok: false, reason: 'notPermitted' })
        const outcome = await runAction(p.params, current, cookie)
        return text({
          ok: outcome.ok,
          did: p.summary.en,
          message: outcome.message.en,
          reason: outcome.messageKey ?? null,
          seeAt: outcome.path ?? null,
        })
      }),
    )
  }

  /**
   * One tool per question, for the same reason.
   *
   * These read; none of them can change anything, so there is no confirmation
   * step and no token — the cost of getting one wrong is a figure the caller
   * was already allowed to see.
   */
  for (const intent of intentsFor(user.role)) {
    const shape = INTENT_INPUTS[intent]
    if (!shape) continue
    server.registerTool(
      `hr_${intent}`,
      { description: INTENT_DESCRIPTIONS[intent], inputSchema: shape },
      protectedTool<Record<string, unknown>>(async (args, actor) => {
        if (!mayAsk(actor.role, intent)) return text({ ok: false, reason: 'notPermitted' })
        const plan = questionPlanFor(intent, args)
        const { result, periodLabel, empty } = await executeIntent(plan, actor)
        return text({ ok: true, intent, period: periodLabel, empty, result })
      }),
    )
  }

  /**
   * An instruction, described but not run.
   *
   * A reversible action still goes through this: the description is what lets
   * a calling agent check it understood before anything changes, and making the
   * safe path and the careful path identical means there is no shortcut to
   * reach for under time pressure.
   */
  server.registerTool(
    'hr_propose',
    { description: TOOL_INPUTS.hr_propose.description, inputSchema: TOOL_INPUTS.hr_propose.schema.shape },
    protectedTool<{ instruction: string }>(async ({ instruction }, actor) => {
      const resolved = await resolveAction(instruction, actor.role, dayKey(new Date()))
      if (!resolved.ok) return text({ ok: false, reason: resolved.reason })
      if (resolved.plan.refusalReason === 'notPermitted') {
        return text({ ok: false, reason: 'notPermitted' })
      }

      const current = await currentUser()
      if (!current) return text({ ok: false, reason: 'notAuthenticated' })
      if (!mayDo(current.role, resolved.plan.action)) return text({ ok: false, reason: 'notPermitted' })
      const proposed = await proposeOverTool(resolved.plan, current)
      if (!proposed.ok) {
        return text({
          ok: false,
          reason: proposed.reason,
          /** Named, so the agent can supply it rather than rephrase blindly. */
          missing: proposed.missing?.en ?? null,
          candidates: proposed.detail ?? null,
        })
      }

      if ('choice' in proposed) {
        return text({
          ok: false,
          reason: 'ambiguous',
          question: proposed.choice.question.en,
          options: proposed.choice.options.map((o) => ({
            summary: o.summary.en,
            details: o.details.map((d) => `${d.label.en}: ${d.value.en}`),
            token: remember(o.params, o.summary.en),
          })),
        })
      }

      const p = proposed.proposal
      return text({
        ok: true,
        action: p.action,
        summary: p.summary.en,
        details: p.details.map((d) => `${d.label.en}: ${d.value.en}`),
        irreversible: DESTRUCTIVE.has(p.action),
        caution: p.caution?.en ?? null,
        token: remember(p.params, p.summary.en),
        next: 'Call hr_confirm with this token to carry it out.',
      })
    }),
  )

  /**
   * Doing it.
   *
   * The token is spent whether or not the action succeeded, so a failure is
   * re-proposed against the current state rather than retried against a plan
   * made before it.
   */
  server.registerTool(
    'hr_confirm',
    { description: TOOL_INPUTS.hr_confirm.description, inputSchema: TOOL_INPUTS.hr_confirm.schema.shape },
    protectedTool<{ token: string }>(async ({ token }, actor) => {
      const plan = pending.get(token)
      if (!plan) {
        return text({ ok: false, reason: 'unknownOrExpiredToken', note: 'Call hr_propose again.' })
      }
      if (Date.now() - plan.at > PLAN_TTL_MS) {
        pending.delete(token)
        return text({ ok: false, reason: 'expiredToken', note: 'Call hr_propose again.' })
      }
      pending.delete(token)
      if (!mayDo(actor.role, plan.params.action)) return text({ ok: false, reason: 'notPermitted' })

      const outcome = await runAction(plan.params, actor, cookie)
      return text({
        /** From the backend's own answer, never from the model's intention. */
        ok: outcome.ok,
        did: plan.summary,
        message: outcome.message.en,
        reason: outcome.messageKey ?? null,
        seeAt: outcome.path ?? null,
      })
    }),
  )

  await server.connect(new StdioServerTransport())
  console.error(`[mcp] menaitech-hr ready, acting as ${user.email} (${user.role})`)
}
