import { z } from 'zod'
import type { CopilotAction, Role } from '@hr/shared'
import { capabilitiesFor } from '../copilot/capabilities.js'

/**
 * The HR system's capabilities, described as tools another agent can call.
 *
 * Generated from the same two registries the in-app assistant uses, rather than
 * listed again here. That is the whole reason this file is short: the work of
 * saying what each action does, what it needs, and who may do it was already
 * done, and doing it twice would produce a second description that drifts from
 * the first — with the drifting copy being the one an outside agent reads.
 *
 * Two things differ from the in-app path, and both come from the same fact:
 * there is no person watching.
 *
 *  - **Authorisation.** The in-app assistant runs inside the asker's request and
 *    carries their session. A tool call arrives from outside it, so this server
 *    signs in as one real user and everything it does is done as them. Not a
 *    service account: an agent with wider access than any human is a hole in the
 *    shape of a convenience, and the permission checks downstream would no
 *    longer mean anything.
 *
 *  - **Confirmation.** In the app, a destructive action is a proposal and a
 *    button. Here there is no button, so those actions are two calls: one that
 *    describes what would happen, and one that does it. An agent that has not
 *    read the description cannot skip to the second, because it does not have
 *    the token the first one returns.
 */

/** What every tool takes: nothing the caller could use to widen its own access. */
export const TOOL_INPUTS = {
  /* ---------- reading ---------- */
  hr_ask: {
    description:
      'Ask the HR system a question in plain language and get the figures back. Use this for anything you want to KNOW: attendance, leave balances, headcount, team rosters, payslips. The question is answered only within what the signed-in user may see.',
    schema: z.object({
      question: z.string().min(2).max(500).describe('The question, in English or Arabic'),
    }),
  },

  hr_capabilities: {
    description:
      'List what the signed-in user may ask and do. Call this first if you are unsure whether an action is available — it is cheaper than attempting one and being refused, and it names the exact tool arguments.',
    schema: z.object({}),
  },

  /* ---------- doing ---------- */
  hr_propose: {
    description:
      'Work out what an instruction would do, WITHOUT doing it. Returns a description of the change and, for reversible actions, a token to pass to hr_confirm. Always call this before hr_confirm.',
    schema: z.object({
      instruction: z
        .string()
        .min(2)
        .max(500)
        .describe('What to do, in plain language: "submit annual leave for me from 5 to 6 October"'),
    }),
  },

  hr_confirm: {
    description:
      'Carry out what hr_propose described. Takes the token from that call. Fails if the token is unknown, already used, or older than five minutes — so a plan cannot be replayed, and an instruction cannot be run without having been described first.',
    schema: z.object({
      token: z.string().describe('The token returned by hr_propose'),
    }),
  },
} as const

export type ToolName = keyof typeof TOOL_INPUTS

/**
 * What this user can reach, written for a model to read.
 *
 * Both lists are filtered by role before they are shown. An agent acting for an
 * employee is never told that `runPayroll` exists — not because seeing the name
 * would grant anything, but because an agent shown a capability it cannot use
 * will try it, fail, and report a fault to somebody who does not have one.
 */
export function describeCapabilities(role: Role): {
  role: Role
  canAsk: { intent: string; about: string }[]
  canDo: { action: CopilotAction; does: string; needsConfirmation: boolean }[]
  /** Same transport-neutral registry exposed to the in-app Copilot. */
  registry: ReturnType<typeof capabilitiesFor>['registry']
} {
  const capabilities = capabilitiesFor(role)
  return {
    role,
    canAsk: capabilities.reads.map((read) => ({ intent: read.id, about: read.description })),
    canDo: capabilities.actions.map((action) => ({
      action: action.id,
      does: action.description,
      /**
       * Said plainly, because an agent planning several steps should know which
       * of them it cannot take back.
       */
      needsConfirmation: action.requiresConfirmation,
    })),
    registry: capabilities.registry,
  }
}
