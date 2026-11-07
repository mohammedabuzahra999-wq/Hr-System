import { and, eq } from 'drizzle-orm'
import { actionOutcomeSchema, type ActionOutcome, type CopilotAction, type SessionUser } from '@hr/shared'
import { db } from '../db/client.js'
import { assistantActionExecutions } from '../db/schema.js'

export type ActionExecutionStart =
  | { kind: 'run' }
  | { kind: 'completed'; outcome: ActionOutcome }
  | { kind: 'processing' }
  | { kind: 'conflict' }

/**
 * Claim a user-bound operation id before a confirmed action runs. A matching
 * completed request returns the original result; an uncertain in-flight one is
 * never replayed automatically.
 */
export async function beginActionExecution(
  actor: SessionUser,
  operationId: string,
  action: CopilotAction,
): Promise<ActionExecutionStart> {
  const [created] = await db
    .insert(assistantActionExecutions)
    .values({ userId: actor.id, operationId, action, status: 'processing' })
    .onConflictDoNothing({ target: [assistantActionExecutions.userId, assistantActionExecutions.operationId] })
    .returning({ id: assistantActionExecutions.id })
  if (created) return { kind: 'run' }

  const [existing] = await db
    .select({
      action: assistantActionExecutions.action,
      status: assistantActionExecutions.status,
      outcome: assistantActionExecutions.outcome,
    })
    .from(assistantActionExecutions)
    .where(and(eq(assistantActionExecutions.userId, actor.id), eq(assistantActionExecutions.operationId, operationId)))
    .limit(1)
  if (!existing) return { kind: 'processing' }
  if (existing.action !== action) return { kind: 'conflict' }
  if (existing.status !== 'completed') return { kind: 'processing' }
  const outcome = actionOutcomeSchema.safeParse(existing.outcome)
  return outcome.success ? { kind: 'completed', outcome: outcome.data } : { kind: 'processing' }
}

export async function completeActionExecution(actor: SessionUser, operationId: string, action: CopilotAction, outcome: ActionOutcome): Promise<void> {
  await db
    .update(assistantActionExecutions)
    .set({ status: 'completed', outcome, completedAt: new Date() })
    .where(and(
      eq(assistantActionExecutions.userId, actor.id),
      eq(assistantActionExecutions.operationId, operationId),
      eq(assistantActionExecutions.action, action),
      eq(assistantActionExecutions.status, 'processing'),
    ))
}
