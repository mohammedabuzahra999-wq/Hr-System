import type { AssistantQuestionReason, CopilotIntent, SessionUser } from '@hr/shared'
import { db } from '../db/client.js'
import { assistantUnansweredQuestions } from '../db/schema.js'

/**
 * Keep a reviewable copy of a question which did not receive an answer.
 *
 * Logging is best-effort: an unavailable log table must never turn the chat's
 * already clear refusal into an unrelated error for the person asking.
 */
export async function saveUnansweredQuestion(
  actor: SessionUser | null | undefined,
  question: string,
  details: { intent: CopilotIntent | null; reason: AssistantQuestionReason },
): Promise<void> {
  if (!actor) return
  await db
    .insert(assistantUnansweredQuestions)
    .values({
      userId: actor.id,
      role: actor.role,
      question,
      intent: details.intent,
      reason: details.reason,
    })
    .catch((error) => console.error('[copilot] could not save unanswered question:', String(error).slice(0, 120)))
}
