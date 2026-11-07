import { z } from 'zod'
import { candidateAiInterviewUiStateSchema } from './aiInterviewUi.js'

export const CANDIDATE_AUDIO_CONSENT = 'ai-interview-audio-upload-v1' as const
export const CANDIDATE_AUDIO_MAX_MS = 120_000
export const CANDIDATE_AUDIO_MAX_BYTES = 44 + CANDIDATE_AUDIO_MAX_MS * 32
const key = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)
export const beginCandidateAudioSchema = z.object({interviewId: z.uuid(), submissionId: z.uuid(), sessionVersion: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(), questionId: key, turnId: key, consent: z.literal(CANDIDATE_AUDIO_CONSENT)}).strict()
export const candidateAudioStatusSchema = z.object({interviewId: z.uuid(), submissionId: z.uuid()}).strict()
export const candidateAudioUploadSchema = candidateAudioStatusSchema.extend({generationId: z.uuid()}).strict()
export const candidateAudioResultSchema = z.object({submissionId: z.uuid(), generationId: z.uuid().nullable(),
  outcome: z.enum(['NOT_FOUND', 'RESERVED', 'PROCESSING', 'RETRY_REQUIRED', 'COMMITTED', 'CANCELLED', 'CLOSED']),
  expiresAt: z.number().int().nonnegative(), maxDurationMs: z.number().int().min(0).max(CANDIDATE_AUDIO_MAX_MS), state: candidateAiInterviewUiStateSchema}).strict()
export type BeginCandidateAudio = z.infer<typeof beginCandidateAudioSchema>
export type CandidateAudioStatusRequest = z.infer<typeof candidateAudioStatusSchema>
export type CandidateAudioUploadRequest = z.infer<typeof candidateAudioUploadSchema>
export type CandidateAudioResult = z.infer<typeof candidateAudioResultSchema>
