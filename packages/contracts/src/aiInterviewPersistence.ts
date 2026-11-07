import { z } from 'zod'
import { aiInterviewCommandSchema, aiInterviewDimensionSchema, aiInterviewStatusSchema, aiInterviewPhaseSchema, interviewPlanSchema } from './aiInterview.js'
import { criterionSchema } from './scorecard.js'

const commandId = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)
export const aiInterviewRubricSchema = z.object({
  version: commandId,
  dimensions: z.array(z.object({ dimension: aiInterviewDimensionSchema, anchors: z.tuple([z.string().min(1).max(1000), z.string().min(1).max(1000), z.string().min(1).max(1000), z.string().min(1).max(1000), z.string().min(1).max(1000)]) }).strict()).length(5),
}).strict().refine(r => new Set(r.dimensions.map(d => d.dimension)).size === 5, 'Each dimension must occur once')
export const aiInterviewFrozenInputsSchema = z.object({
  rubric: aiInterviewRubricSchema, criteria: z.array(criterionSchema).min(1),
  weights: z.array(z.object({ key: z.string(), weight: z.number().int().min(0).max(100) }).strict()),
  jobDescriptionId: z.uuid(), configVersion: z.literal('phase2-mock-v1'), evaluatorVersion: z.literal('mock-v1'),
}).strict()
export type AiInterviewFrozenInputs = z.infer<typeof aiInterviewFrozenInputsSchema>
export const createAiInterviewSchema = z.object({ commandId, plan: interviewPlanSchema, rubric: aiInterviewRubricSchema }).strict()
export const aiInterviewVersionedRequestSchema = z.object({ commandId, expectedVersion: z.number().int().nonnegative() }).strict()
export const aiInterviewCommandRequestSchema = z.object({
  interviewId: z.uuid(), expectedVersion: z.number().int().nonnegative(), command: aiInterviewCommandSchema,
}).strict()
const consentCommand = z.object({ commandId, type: z.literal('ACCEPT_CONSENT'), policyVersion: z.enum(['ai-interview-v1', 'ai-interview-v2-audio']) }).strict()
export const candidateAiInterviewCommandSchema = z.union([
  consentCommand,
  aiInterviewCommandSchema.refine(c => [
    'START_INTERVIEW', 'PAUSE_INTERVIEW', 'RESUME_INTERVIEW', 'CANCEL_INTERVIEW',
    'CANDIDATE_SPEECH_STARTED', 'CANDIDATE_SPEECH_FINISHED', 'CANDIDATE_TRANSCRIPT_FINAL',
  ].includes(c.type), 'Internal interview command is not candidate-accessible').refine(c => c.type !== 'PAUSE_INTERVIEW' || c.reason === 'USER', 'Candidate pause reason must be USER'),
])
export const candidateAiInterviewRequestSchema = z.object({
  interviewId: z.uuid(), expectedVersion: z.number().int().nonnegative(), command: candidateAiInterviewCommandSchema,
}).strict()
export type CandidateAiInterviewRequest = z.infer<typeof candidateAiInterviewRequestSchema>
export const candidateAiInterviewStateSchema = z.object({
  interviewId: z.uuid(), version: z.number().int().nonnegative(), status: aiInterviewStatusSchema,
  phase: aiInterviewPhaseSchema.nullable(), language: z.enum(['en', 'ar', 'mixed']), mock: z.boolean(),
  currentQuestion: z.object({ id: z.string(), prompt: z.string(), kind: z.enum(['BASE', 'FOLLOW_UP', 'CLARIFICATION']) }).strict().nullable(),
  currentTurnId: z.string().nullable(),
  delivery: z.object({ id: z.string(), kind: z.enum(['INTRO', 'QUESTION', 'CLOSING']), text: z.string() }).strict().nullable(),
  timer: z.object({ listeningStartedAt: z.number(), answerDeadlineAt: z.number(), remainingMs: z.number().nonnegative(),
    stage: z.enum(['ANSWER', 'GRACE']), graceDeadlineAt: z.number().nullable(), warningAtSec: z.number(), timeLimitSec: z.number() }).strict().nullable(),
  consent: z.object({ requiredPolicyVersion: z.enum(['ai-interview-v1', 'ai-interview-v2-audio']), accepted: z.boolean() }).strict(),
  recoveryRequired: z.boolean(), lastSequence: z.number().int().nonnegative(),
}).strict()
export type CandidateAiInterviewState = z.infer<typeof candidateAiInterviewStateSchema>
