import { z } from 'zod'
import { interviewQuestionProposalSchema } from './aiInterviewLlm.js'

const key = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)
const text = z.string().trim().min(1).max(4000)
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const seconds = z.number().int().min(1).max(1800)

export const aiInterviewStatusSchema = z.enum(['CREATED', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'])
export const aiInterviewPhaseSchema = z.enum(['INTRO', 'AI_SPEAKING', 'LISTENING', 'PROCESSING', 'FOLLOW_UP', 'CLARIFICATION', 'NEXT_QUESTION', 'CLOSING'])
/** Transport state is not part of the authoritative interview snapshot. */
export const aiInterviewConnectionStateSchema = z.enum(['CONNECTING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED'])
export const aiInterviewTypeSchema = z.enum(['technical', 'behavioral', 'experience', 'job_specific'])
export const aiInterviewEvaluationStatusSchema = z.enum(['NOT_STARTED', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'])
export const aiInterviewDimensionSchema = z.enum(['technical_accuracy', 'relevance', 'depth', 'communication', 'problem_solving'])
export type AiInterviewStatus = z.infer<typeof aiInterviewStatusSchema>
export type AiInterviewPhase = z.infer<typeof aiInterviewPhaseSchema>
export type AiInterviewConnectionState = z.infer<typeof aiInterviewConnectionStateSchema>
export type AiInterviewDimension = z.infer<typeof aiInterviewDimensionSchema>

const promptSchema = z.object({ id: key, prompt: text }).strict()
export const aiInterviewQuestionSchema = z.object({
  // Colons are reserved for engine-generated descendant question ids.
  id: key.max(100).regex(/^[a-zA-Z0-9_.-]+$/),
  criterionKey: z.string().trim().min(1).max(300),
  type: aiInterviewTypeSchema,
  prompt: text,
  order: z.number().int().min(1).max(30),
  answerTimeLimitSec: seconds,
  /** Remaining seconds, not elapsed seconds. Zero disables the warning. */
  warningAtSec: z.number().int().min(0).max(1800),
  gracePeriodSec: z.number().int().min(0).max(120),
  maxFollowUps: z.number().int().min(0).max(5),
  followUpTimeLimitSec: seconds,
  maxClarifications: z.number().int().min(0).max(3),
  clarificationTimeLimitSec: seconds,
  /** Zero means deadline-only silence handling. */
  silenceThresholdSec: z.number().int().min(0).max(1800),
  silenceAction: z.enum(['CLARIFY_OR_NEXT', 'NEXT_QUESTION']),
  allowBargeIn: z.boolean(),
  followUps: z.array(promptSchema).max(5),
  clarifications: z.array(promptSchema).max(3),
}).strict().superRefine((q, ctx) => {
  if (q.warningAtSec > q.answerTimeLimitSec) ctx.addIssue({ code: 'custom', path: ['warningAtSec'], message: 'Warning must fit the base answer limit' })
  for (const field of ['followUps', 'clarifications'] as const) {
    if (new Set(q[field].map(p => p.id)).size !== q[field].length) ctx.addIssue({ code: 'custom', path: [field], message: 'Prompt ids must be unique' })
  }
})
export const interviewPlanSchema = z.object({
  id: key,
  version: z.number().int().min(1),
  language: z.enum(['en', 'ar', 'mixed']),
  type: aiInterviewTypeSchema,
  introduction: text,
  closing: text,
  questions: z.array(aiInterviewQuestionSchema).min(1).max(30),
}).strict().superRefine((plan, ctx) => {
  if (new Set(plan.questions.map(q => q.id)).size !== plan.questions.length) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Question ids must be unique' })
  if (new Set(plan.questions.map(q => q.order)).size !== plan.questions.length) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Question order must be unique' })
})
export type InterviewPlan = z.infer<typeof interviewPlanSchema>
export type AiInterviewQuestion = z.infer<typeof aiInterviewQuestionSchema>

export const aiInterviewEvidenceSchema = z.object({
  questionId: key,
  turnId: key,
  criterionKey: z.string().min(1).max(300),
  evaluationDimension: aiInterviewDimensionSchema,
  exactQuote: z.string().min(1).max(16000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
}).strict().refine(e => e.end > e.start, 'Evidence span must be nonempty')
const assessmentSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('assessed'), dimension: aiInterviewDimensionSchema, score: z.number().int().min(0).max(4), reason: text, evidence: z.array(aiInterviewEvidenceSchema).min(1).max(10) }).strict(),
  z.object({ status: z.literal('not_assessed'), dimension: aiInterviewDimensionSchema, score: z.literal('not_assessed'), reason: text, evidence: z.array(aiInterviewEvidenceSchema).max(0) }).strict(),
])
export const aiInterviewAnswerEvaluationSchema = z.object({
  questionId: key, turnId: key, criterionKey: z.string().min(1).max(300),
  dimensions: z.array(assessmentSchema).length(5),
  evaluatorVersion: key,
}).strict().refine(e => new Set(e.dimensions.map(d => d.dimension)).size === 5, 'Each dimension must occur once')
export type AiInterviewAnswerEvaluation = z.infer<typeof aiInterviewAnswerEvaluationSchema>

export const aiInterviewTimerSchema = z.object({
  listeningStartedAt: timestamp,
  answerDeadlineAt: timestamp,
  timeLimitSec: seconds,
  warningAtSec: z.number().int().nonnegative(),
  gracePeriodSec: z.number().int().nonnegative(),
  stage: z.enum(['ANSWER', 'GRACE']),
  graceDeadlineAt: timestamp.nullable(),
  warningEmitted: z.boolean(),
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
}).strict()
export type AiInterviewTimer = z.infer<typeof aiInterviewTimerSchema>
export const aiInterviewSelectedQuestionSchema = z.object({
  id: key, baseQuestionId: key, criterionKey: z.string().min(1).max(300), prompt: text,
  kind: z.enum(['BASE', 'FOLLOW_UP', 'CLARIFICATION']), timeLimitSec: seconds,
}).strict()
export type AiInterviewSelectedQuestion = z.infer<typeof aiInterviewSelectedQuestionSchema>
export const aiInterviewAnswerSchema = z.object({
  questionId: key, baseQuestionId: key, turnId: key, criterionKey: z.string().min(1).max(300),
  text: z.string().max(16000),
  textSource: z.enum(['final', 'partial', 'none']),
  endReason: z.enum(['SUBMITTED', 'TIME_LIMIT', 'SILENCE']),
  timedOut: z.boolean(), transcriptionUncertain: z.boolean(),
  questionDelivery: z.enum(['complete', 'interrupted']),
  finalizedAt: timestamp,
}).strict()
export type AiInterviewAnswer = z.infer<typeof aiInterviewAnswerSchema>

const playbackSchema = z.object({
  id: key, kind: z.enum(['INTRO', 'QUESTION', 'CLOSING']), text,
  questionId: key.nullable(), started: z.boolean(), interrupted: z.boolean(),
}).strict()
export type AiInterviewPlayback = z.infer<typeof playbackSchema>

/** Internal domain state. This is NOT a future candidate-facing DTO. */
export const aiInterviewSnapshotSchema = z.object({
  interviewId: key, version: z.number().int().nonnegative(), eventSeq: z.number().int().nonnegative(),
  status: aiInterviewStatusSchema, phase: aiInterviewPhaseSchema.nullable(), plan: interviewPlanSchema,
  currentQuestion: aiInterviewSelectedQuestionSchema.nullable(),
  processedBaseQuestionIds: z.array(key),
  counts: z.record(z.string(), z.object({ followUps: z.number().int().nonnegative(), clarifications: z.number().int().nonnegative() }).strict()),
  usedPromptIds: z.array(z.string()),
  playback: playbackSchema.nullable(), timer: aiInterviewTimerSchema.nullable(),
  draft: z.object({
    turnId: key, speaking: z.boolean(), speechStarted: z.boolean(), speechFinished: z.boolean(),
    finalForCurrentSpeech: z.boolean(), latestTextSource: z.enum(['final', 'partial', 'none']),
    partialText: z.string().max(16000), finalText: z.string().max(16000),
    transcriptionUncertain: z.boolean(), lastActivityAt: timestamp,
    questionDelivery: z.enum(['complete', 'interrupted']),
  }).strict().nullable(),
  answers: z.array(aiInterviewAnswerSchema), evaluations: z.array(aiInterviewAnswerEvaluationSchema),
  evaluationStatus: aiInterviewEvaluationStatusSchema,
  pausedAt: timestamp.nullable(), resumeStatus: z.enum(['CREATED', 'READY', 'ACTIVE']).nullable(),
  failure: z.object({ code: key, recoverable: z.boolean() }).strict().nullable(),
}).strict()
export type AiInterviewSnapshot = z.infer<typeof aiInterviewSnapshotSchema>

const command = { commandId: key }
const turn = { ...command, turnId: key }
export const aiInterviewCommandSchema = z.discriminatedUnion('type', [
  z.object({...command,type:z.literal('REVISE_QUESTION_TEXT'),proposal:interviewQuestionProposalSchema}).strict(),
  z.object({ ...command, type: z.literal('CREATE_INTERVIEW'), interviewId: key, plan: interviewPlanSchema }).strict(),
  ...(['MARK_READY', 'START_INTERVIEW', 'TIMER_TICK', 'PROCESS_ANSWER', 'RESUME_INTERVIEW', 'CANCEL_INTERVIEW', 'GENERATE_EVALUATION'] as const).map(type => z.object({ ...command, type: z.literal(type) }).strict()),
  z.object({ ...command, type: z.literal('AI_PLAYBACK_STARTED'), playbackId: key }).strict(),
  z.object({ ...command, type: z.literal('AI_PLAYBACK_FINISHED'), playbackId: key }).strict(),
  z.object({ ...command, type: z.literal('CANDIDATE_INTERRUPTED'), playbackId: key }).strict(),
  z.object({ ...turn, type: z.literal('CANDIDATE_SPEECH_STARTED') }).strict(),
  z.object({ ...turn, type: z.literal('CANDIDATE_SPEECH_FINISHED') }).strict(),
  z.object({ ...turn, type: z.literal('CANDIDATE_TRANSCRIPT_PARTIAL'), text: z.string().max(16000) }).strict(),
  z.object({ ...turn, type: z.literal('CANDIDATE_TRANSCRIPT_FINAL'), text: z.string().trim().min(1).max(16000), uncertain: z.boolean().default(false) }).strict(),
  z.object({ ...command, type: z.literal('PAUSE_INTERVIEW'), reason: z.enum(['USER', 'DISCONNECT', 'PROVIDER_TIMEOUT']) }).strict(),
  z.object({ ...command, type: z.literal('FAIL_INTERVIEW'), code: key, recoverable: z.boolean() }).strict(),
])
export type AiInterviewCommand = z.infer<typeof aiInterviewCommandSchema>

const event = { eventId: key, interviewId: key, commandId: key, seq: z.number().int().positive(), at: timestamp }
const questionEvent = { question: aiInterviewSelectedQuestionSchema }
export const aiInterviewEventSchema = z.discriminatedUnion('type', [
  z.object({...event,type:z.literal('QUESTION_TEXT_REVISED'),questionIds:z.array(key).min(1).max(30)}).strict(),
  z.object({ ...event, type: z.literal('INTERVIEW_CREATED'), plan: interviewPlanSchema }).strict(),
  ...(['INTERVIEW_READY', 'INTERVIEW_STARTED', 'INTRO_STARTED', 'CLOSING_STARTED', 'INTERVIEW_COMPLETED', 'INTERVIEW_CANCELLED', 'EVALUATION_PENDING'] as const).map(type => z.object({ ...event, type: z.literal(type) }).strict()),
  ...(['QUESTION_SELECTED', 'FOLLOW_UP_SELECTED', 'CLARIFICATION_SELECTED', 'NEXT_QUESTION_SELECTED'] as const).map(type => z.object({ ...event, type: z.literal(type), ...questionEvent }).strict()),
  z.object({ ...event, type: z.literal('PLAYBACK_REQUESTED'), playback: playbackSchema }).strict(),
  ...(['QUESTION_PLAYBACK_STARTED', 'QUESTION_PLAYBACK_FINISHED'] as const).map(type => z.object({ ...event, type: z.literal(type), playbackId: key, questionId: key.nullable(), kind: z.enum(['INTRO', 'QUESTION', 'CLOSING']) }).strict()),
  z.object({ ...event, type: z.literal('ANSWER_LISTENING_STARTED'), questionId: key, turnId: key, timer: aiInterviewTimerSchema, questionDelivery: z.enum(['complete', 'interrupted']) }).strict(),
  z.object({ ...event, type: z.literal('ANSWER_WARNING'), turnId: key, remainingMs: z.number().int().nonnegative() }).strict(),
  z.object({ ...event, type: z.literal('ANSWER_GRACE_STARTED'), turnId: key, graceDeadlineAt: timestamp }).strict(),
  ...(['CANDIDATE_SPEECH_STARTED', 'CANDIDATE_SPEECH_FINISHED', 'TRANSCRIPT_FINAL_RECEIVED', 'ANSWER_TIMEOUT', 'ANSWER_SILENCE_DETECTED'] as const).map(type => z.object({ ...event, type: z.literal(type), turnId: key }).strict()),
  z.object({ ...event, type: z.literal('CANDIDATE_ANSWER_FINALIZED'), answer: aiInterviewAnswerSchema }).strict(),
  z.object({ ...event, type: z.literal('ANSWER_EVALUATED'), evaluation: aiInterviewAnswerEvaluationSchema }).strict(),
  z.object({ ...event, type: z.literal('PLAYBACK_INTERRUPTED'), playbackId: key, questionId: key }).strict(),
  z.object({ ...event, type: z.literal('POLICY_LIMIT_ENFORCED'), decision: z.enum(['FOLLOW_UP', 'CLARIFICATION']), baseQuestionId: key }).strict(),
  z.object({ ...event, type: z.literal('INTERVIEW_PAUSED'), reason: z.enum(['USER', 'DISCONNECT', 'PROVIDER_TIMEOUT']), remainingMs: z.number().int().nonnegative().nullable() }).strict(),
  z.object({ ...event, type: z.literal('INTERVIEW_RESUMED'), status: z.enum(['CREATED', 'READY', 'ACTIVE']), timer: aiInterviewTimerSchema.nullable() }).strict(),
  z.object({ ...event, type: z.literal('INTERVIEW_FAILED'), code: key, recoverable: z.boolean() }).strict(),
  z.object({ ...event, type: z.literal('EVALUATION_COMPLETED'), evaluations: z.array(aiInterviewAnswerEvaluationSchema) }).strict(),
])
export type AiInterviewEvent = z.infer<typeof aiInterviewEventSchema>
export type AiInterviewEffect =
  | { type: 'PLAY'; playback: AiInterviewPlayback }
  | { type: 'STOP_PLAYBACK'; playbackId: string }

/** Provider events report observations, never domain decisions or scores. */
export const aiInterviewMediaEventSchema = z.discriminatedUnion('type', [
  z.object({ eventId: key, type: z.literal('PLAYBACK_STARTED'), playbackId: key }).strict(),
  ...(['PLAYBACK_FINISHED', 'INTERRUPTION'] as const).map(type => z.object({ eventId: key, type: z.literal(type), playbackId: key }).strict()),
  ...(['SPEECH_STARTED', 'SPEECH_FINISHED'] as const).map(type => z.object({ eventId: key, type: z.literal(type), turnId: key }).strict()),
  z.object({ eventId: key, type: z.literal('TRANSCRIPT_PARTIAL'), turnId: key, text: z.string().max(16000) }).strict(),
  z.object({ eventId: key, type: z.literal('TRANSCRIPT_FINAL'), turnId: key, text: z.string().min(1).max(16000), uncertain: z.boolean().default(false) }).strict(),
  ...(['SILENCE', 'DISCONNECT', 'RECONNECT', 'TIMEOUT'] as const).map(type => z.object({ eventId: key, type: z.literal(type) }).strict()),
])
export type AiInterviewMediaEvent = z.infer<typeof aiInterviewMediaEventSchema>
