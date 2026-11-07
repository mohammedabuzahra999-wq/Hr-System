import { aiInterviewEvents } from '../db/schema.js'
import type { InterviewRow, InterviewTransaction } from './repository.js'

/** Same minimal-data principle as assistant audit; candidate content never enters it. */
export async function interviewAudit(tx: InterviewTransaction, row: InterviewRow, commandId: string, action: 'CREATED' | 'PLAN_FROZEN' | 'INVITATION_GENERATED' | 'INVITATION_REPLACED' | 'INVITATION_EXCHANGED' | 'CANDIDATE_SESSION_ESTABLISHED' | 'INVITATION_REVOKED' | 'INTERVIEW_STARTED' | 'INTERVIEW_PAUSED' | 'INTERVIEW_RESUMED' | 'INTERVIEW_COMPLETED' | 'CANCELLED' | 'EVALUATION_REQUESTED' | 'REEVALUATION_REQUESTED' | 'EVALUATION_RETRIED' | 'EVALUATION_RUNNING' | 'EVALUATION_COMPLETED' | 'EVALUATION_FAILED' | 'EVALUATION_ATTEMPT_TIMED_OUT' | 'RUNTIME_RECOVERY_STARTED' | 'RUNTIME_RECOVERY_COMPLETED' | 'REPORT_REVIEWED', actorId: string, now: number, metadata: { evaluationId?: string; reportVersion?: number; attempt?: number; failureCode?: string; reviewStatus?: string } = {}) {
  const sequence = ++row.lastSequence
  await tx.insert(aiInterviewEvents).values({ interviewId: row.id, sequence, recordType: 'AUDIT', eventType: action,
    eventId: `audit:${sequence}`, commandId, stateVersion: row.version, source: actorId === 'system' ? 'system' : actorId.startsWith('candidate') ? 'candidate' : actorId.startsWith('provider:') ? 'provider' : 'staff', actorId,
    payload: { action, ...metadata }, createdAt: new Date(now) })
}
