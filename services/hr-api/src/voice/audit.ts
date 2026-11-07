import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

/**
 * Marks the internal calls that came from a live voice session.
 *
 * A browser can send arbitrary headers, so audit attribution is signed with a
 * server-only secret. This metadata affects audit classification only; it never
 * grants an HR capability.
 */
export function voiceAuditSignature(sessionId: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`voice:${sessionId}`).digest('hex')
}

export function isTrustedVoiceAudit(sessionId: string, signature: string | undefined): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = voiceAuditSignature(sessionId)
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
