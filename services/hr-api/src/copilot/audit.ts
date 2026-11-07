import type { CopilotAction, CopilotIntent, SessionUser } from '@hr/shared'
import { db } from '../db/client.js'
import { assistantAuditEvents } from '../db/schema.js'

export type AssistantAuditStatus =
  | 'answered'
  | 'proposed'
  | 'executed'
  | 'denied'
  | 'out_of_scope'
  | 'invalid'
  | 'declined'
  | 'failed'

export type AssistantAuditEvent = {
  eventType: 'question' | 'policy' | 'help' | 'report' | 'navigation' | 'action' | 'request'
  status: AssistantAuditStatus
  intent?: CopilotIntent | null
  tool?: CopilotAction | null
  /** A controlled server code, never a question, answer, name, or parameter. */
  reason?: string | null
  /** Text is the normal panel; voice is set only by a signed internal request. */
  channel?: 'text' | 'voice'
  /** An ephemeral voice-call identifier, never an OpenAI session or audio id. */
  voiceSessionId?: string | null
}

/**
 * Write an audit event without making the requested HR operation depend on the
 * audit table being available.  A database outage must never turn a harmless
 * read or a refusal into an unexplained error for the employee.
 */
export async function auditCopilot(actor: SessionUser | null | undefined, event: AssistantAuditEvent): Promise<void> {
  if (!actor) return
  await db
    .insert(assistantAuditEvents)
    .values({
      userId: actor.id,
      role: actor.role,
      eventType: event.eventType,
      intent: event.intent ?? null,
      tool: event.tool ?? null,
      status: event.status,
      reason: event.reason ?? null,
      channel: event.channel ?? 'text',
      voiceSessionId: event.voiceSessionId ?? null,
    })
    .catch((error) => console.error('[copilot] could not write audit event:', String(error).slice(0, 120)))
}
