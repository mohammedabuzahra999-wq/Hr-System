import { z } from 'zod'
import { AbuseBudget } from '../abuseBudget.js'

const eventSchema = z.object({
  event: z.enum(['candidate_session_rejected', 'invite_rejected', 'report_accessed', 'provider_observation_rejected', 'provider_readiness_changed', 'request_rejected', 'shutdown_started', 'shutdown_completed', 'shutdown_incomplete']),
  interviewId: z.uuid().optional(), evaluationId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  reportVersion: z.number().int().positive().optional(),
  code: z.enum(['AUTH', 'EXPIRED', 'REVOKED', 'INVALID', 'STALE', 'THROTTLED', 'INTERNAL', 'DENIED']).optional(),
  state: z.enum(['configured', 'ready', 'unavailable', 'unhealthy']).optional(),
}).strict()
export type InterviewOperationalEvent = z.infer<typeof eventSchema>
/** Closed metadata, bounded emission. Sink failure never changes authorization or durable outcome. */
export class InterviewOperations {
  private budget = new AbuseBudget(1024)
  constructor(private sink: (event: InterviewOperationalEvent) => void = event => console.info('[ai-interview-operations]', JSON.stringify({atUtc: new Date().toISOString(), ...event}))) {}
  record(input: InterviewOperationalEvent) {
    const event = eventSchema.safeParse(input)
    if (!event.success) return
    if (!this.budget.consume('diagnostics', `${event.data.event}:${event.data.interviewId ?? ''}:${event.data.actorId ?? ''}:${event.data.code ?? event.data.state ?? ''}`, event.data.event === 'report_accessed' ? 240 : 3, 60000).allowed) return
    try { this.sink(event.data) } catch { /* Best-effort operational diagnostics, not the durable mutation journal. */ }
  }
}
export const interviewOperations = new InterviewOperations()
const admissions = new WeakMap<object, AbuseBudget>()
/** No public provider ingress exists. These budgets also contain malfunctioning trusted adapter code. */
export function admitInterviewProvider(database: object, operation: 'observation' | 'context' | 'health', interviewId = 'process') {
  let budget = admissions.get(database)
  if (!budget) { budget = new AbuseBudget(); admissions.set(database, budget) }
  return budget.consume(`provider-${operation}`, interviewId, operation === 'health' ? 600 : operation === 'context' ? 1200 : 600, 60000).allowed
}
