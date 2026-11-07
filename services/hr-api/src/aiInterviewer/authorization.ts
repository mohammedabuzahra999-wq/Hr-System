import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { allowed } from '../permissions.js'
import { applications, users } from '../db/schema.js'
import { InterviewServiceError, type InterviewRow, type InterviewTransaction } from './repository.js'
import { interviewOperations } from './operations.js'

export type InterviewPrincipal = { kind: 'staff'; userId: string } | { kind: 'candidate'; credential: string } | { kind: 'system' }
export const tokenHash = (purpose: 'invite' | 'session', token: string) => createHash('sha256').update(`ai-interview:${purpose}:v1:${token}`).digest('hex')
export const newCredential = () => randomBytes(32).toString('base64url')
const equalHash = (a: string | null, b: string) => !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
export const isCredential = (value: string) => /^[a-zA-Z0-9_-]{43}$/.test(value)

export async function requireInterviewStaff(tx: InterviewTransaction, principal: InterviewPrincipal) {
  if (principal.kind !== 'staff') throw new InterviewServiceError(403, 'forbidden')
  const actor = (await tx.select({ role: users.role, active: users.isActive }).from(users).where(eq(users.id, principal.userId)))[0]
  if (!actor?.active || !allowed('manageRecruitment').includes(actor.role)) throw new InterviewServiceError(403, 'forbidden')
}
export async function authorizeInterview(tx: InterviewTransaction, row: InterviewRow, principal: InterviewPrincipal, now: number): Promise<string> {
  if (principal.kind === 'system') return 'system'
  if (principal.kind === 'staff') { await requireInterviewStaff(tx, principal); return `staff:${principal.userId}` }
  const parts = principal.credential.split('.')
  if (parts.length !== 2 || parts[0] !== row.id || !isCredential(parts[1]!)
    || !equalHash(row.candidateSessionHash, tokenHash('session', principal.credential))
    || !row.candidateSessionExpiresAt || row.candidateSessionExpiresAt.getTime() <= now
    || row.inviteRevokedAt || ['CREATED', 'CANCELLED'].includes(row.snapshot.status)
    || (row.snapshot.status === 'FAILED' && !row.snapshot.failure?.recoverable)) {
    interviewOperations.record({event: 'candidate_session_rejected', interviewId: row.id, code: row.inviteRevokedAt ? 'REVOKED' : row.candidateSessionExpiresAt && row.candidateSessionExpiresAt.getTime() <= now ? 'EXPIRED' : 'AUTH'})
    throw new InterviewServiceError(401, 'candidateSessionInvalid')
  }
  const app = (await tx.select({ candidateId: applications.candidateId }).from(applications).where(eq(applications.id, row.applicationId)))[0]!
  return `candidate:${app.candidateId}`
}
