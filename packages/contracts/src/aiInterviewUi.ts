import { z } from 'zod'
import { candidateAiInterviewStateSchema } from './aiInterviewPersistence.js'

export const candidateAiInterviewUiStateSchema = candidateAiInterviewStateSchema.extend({
  serverNow: z.number().int().nonnegative(),
  answerRecovery: z.object({ sessionVersion: z.number().int().positive(), expiresAt: z.number().int().nonnegative() }).strict().optional(),
  speaking: z.boolean(),
  canResume: z.boolean(),
  pauseReason: z.enum(['USER', 'DISCONNECT', 'PROVIDER_TIMEOUT', 'SERVER_RESTART', 'INVITATION_REVOKED']).nullable(),
  progress: z.object({ current: z.number().int().nonnegative(), total: z.number().int().positive(), processed: z.number().int().nonnegative() }).strict(),
  delivery: z.object({ id: z.string(), kind: z.enum(['INTRO', 'QUESTION', 'CLOSING']), text: z.string(), started: z.boolean() }).strict().nullable(),
}).strict()
export type CandidateAiInterviewUiState = z.infer<typeof candidateAiInterviewUiStateSchema>
export const aiInterviewReplayPageSchema = z.object({
  events: z.array(z.object({ sequence: z.number().int().positive(), type: z.string(), at: z.number() }).strict()),
  nextAfterSequence: z.number().int().nonnegative(), hasMore: z.boolean(),
}).strict()
export type AiInterviewReplayPage = z.infer<typeof aiInterviewReplayPageSchema>

const mockBase = { interviewId: z.uuid(), expectedVersion: z.number().int().nonnegative(), commandId: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.:-]+$/) }
export const aiInterviewMockRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...mockBase, action: z.literal('PLAYBACK_START'), playbackId: z.string().min(1).max(160) }).strict(),
  ...(['PLAYBACK_FINISH', 'INTERRUPT'] as const).map(action => z.object({ ...mockBase, action: z.literal(action), playbackId: z.string().min(1).max(160) }).strict()),
  ...(['PROCESS', 'TICK', 'DISCONNECT', 'RECONNECT', 'TIMEOUT', 'FAIL'] as const).map(action => z.object({ ...mockBase, action: z.literal(action) }).strict()),
])
export type AiInterviewMockRequest = z.infer<typeof aiInterviewMockRequestSchema>
