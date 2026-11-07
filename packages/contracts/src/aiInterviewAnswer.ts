import { z } from 'zod'
import { candidateAiInterviewUiStateSchema } from './aiInterviewUi.js'

/** Scope is a non-secret generation identifier, never an authorization credential. */
export const submitAiInterviewAnswerSchema = z.object({
  interviewId: z.uuid(), commandId: z.uuid(), expectedVersion: z.number().int().nonnegative(),
  sessionVersion: z.number().int().positive(), questionId: z.string().min(1).max(160),
  turnId: z.string().min(1).max(160), text: z.string().trim().min(1).max(16000),
}).strict()
export type SubmitAiInterviewAnswer = z.infer<typeof submitAiInterviewAnswerSchema>
export const aiInterviewAnswerResultSchema = z.object({
  outcome: z.enum(['COMMITTED', 'OPEN', 'CONFLICT', 'CLOSED']),
  submissionId: z.uuid(), questionId: z.string(), turnId: z.string(),
  duplicate: z.boolean(), state: candidateAiInterviewUiStateSchema,
}).strict()
export type AiInterviewAnswerResult = z.infer<typeof aiInterviewAnswerResultSchema>
/** Browser-only recovery data; none of these fields grants server authority. */
export const aiInterviewAnswerRecoveryEnvelopeSchema = z.object({
  format: z.literal('ai-interview-answer-v1'), interviewId: z.uuid(), sessionVersion: z.number().int().positive(),
  questionId: z.string().min(1).max(160), turnId: z.string().min(1).max(160), text: z.string().max(16000),
  expiresAt: z.number().int().positive(),
  submission: z.object({ commandId: z.uuid(), expectedVersion: z.number().int().nonnegative() }).strict().optional(),
}).strict()
export type AiInterviewAnswerRecoveryEnvelope = z.infer<typeof aiInterviewAnswerRecoveryEnvelopeSchema>
