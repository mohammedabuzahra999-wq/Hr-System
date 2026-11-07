import { z } from 'zod'
import { aiInterviewFrozenInputsSchema } from './aiInterviewPersistence.js'
import { aiInterviewAnswerSchema, aiInterviewTypeSchema, aiInterviewDimensionSchema } from './aiInterview.js'
import { evaluationProviderSnapshotSchema, evaluationProviderAssessmentSchema } from './aiInterviewEvaluationProvider.js'

const id = z.string().min(1).max(300)
const text = z.string().min(1).max(16000)
export const reportEvaluatorVersionSchema = z.enum(['mock-report-v1', 'mock-report-v2', 'llm-report-v1'])
export const evaluationReportInputSchema = z.object({
  format: z.literal('ai-interview-report-input-v1'), interviewId: z.uuid(), interviewVersion: z.number().int().nonnegative(),
  lastIncludedSequence: z.number().int().positive(), evaluatorVersion: reportEvaluatorVersionSchema,
  frozen: aiInterviewFrozenInputsSchema,
  provider: evaluationProviderSnapshotSchema.optional(),
  questions: z.array(z.object({ questionId: id, baseQuestionId: id, criterionKey: id, prompt: text,
    type: aiInterviewTypeSchema, kind: z.enum(['BASE', 'FOLLOW_UP', 'CLARIFICATION']), dimension: aiInterviewDimensionSchema }).strict()),
  answers: z.array(z.object({ sequence: z.number().int().positive(), answer: aiInterviewAnswerSchema.omit({ finalizedAt: true }) }).strict()),
}).strict().refine(i=>(i.evaluatorVersion==='llm-report-v1')===!!i.provider,'Evaluation provider provenance must match evaluator version')
export type EvaluationReportInput = z.infer<typeof evaluationReportInputSchema>
export const reportEvidenceSchema = z.object({
  evidenceId: id, criterionKey: id, questionId: id, turnId: id, eventSequence: z.number().int().positive(),
  quote: text, source: z.literal('CANDIDATE_FINAL_ANSWER'), validationStatus: z.literal('VALID'),
  startOffset: z.number().int().nonnegative(), endOffset: z.number().int().positive(), explanation: text,
}).strict()
export const reportCriterionSchema = z.object({
  criterionKey: id, criterionLabel: z.object({ en: z.string(), ar: z.string() }).strict(),
  status: z.enum(['ASSESSED', 'PARTIALLY_ASSESSED', 'NOT_ASSESSED']), score: z.number().int().min(0).max(4).nullable(), maxScore: z.literal(4),
  rationale: text, evidence: z.array(reportEvidenceSchema).max(1000), questionIds: z.array(id), turnIds: z.array(id), limitations: z.array(text),
}).strict().superRefine((c, ctx) => {
  if (c.status === 'NOT_ASSESSED' ? c.score !== null || c.evidence.length !== 0 : c.score === null || !c.evidence.length)
    ctx.addIssue({ code: 'custom', message: 'Assessed results require score and evidence; NOT_ASSESSED requires null and no evidence' })
})
const finding = z.object({ text, criterionKey: id, evidenceIds: z.array(id).min(1) }).strict()
export const aiInterviewReportSchema = z.object({
  evaluationId: z.uuid(), interviewId: z.uuid(), reportVersion: z.number().int().positive(), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  evaluatorVersion: reportEvaluatorVersionSchema, rubricVersion: id, status: z.literal('COMPLETED'), mode: z.enum(['MOCK','LLM_SYNTHETIC','LLM']), generatedAt: z.string().datetime(),
  modelAssessment: evaluationProviderAssessmentSchema.optional(),
  criteriaResults: z.array(reportCriterionSchema).min(1),
  coverage: z.object({ criteriaTotal: z.number().int().positive(), assessed: z.number().int().nonnegative(), partiallyAssessed: z.number().int().nonnegative(),
    notAssessed: z.number().int().nonnegative(), coveragePercent: z.number().min(0).max(100) }).strict(),
  overallScore: z.null(), aggregationRule: z.literal('NONE_APPROVED_FOR_0_4'), summary: text,
  strengths: z.array(finding), concerns: z.array(finding), limitations: z.array(text).min(1),
  evidenceValidation: z.object({ status: z.literal('VALID'), normalization: z.literal('NONE'), offsetUnit: z.literal('UTF16_CODE_UNIT'), verified: z.number().int().nonnegative() }).strict(),
}).strict()
export type AiInterviewReport = z.infer<typeof aiInterviewReportSchema>
export const humanInterviewReviewSchema = z.object({
  status: z.enum(['UNREVIEWED', 'REVIEWED']), reviewedBy: z.uuid().nullable(), reviewedAt: z.string().datetime().nullable(), note: z.string().max(4000),
}).strict()
export type HumanInterviewReview = z.infer<typeof humanInterviewReviewSchema>
export const aiInterviewReportStorageSchema = z.object({
  format: z.literal('phase4-report-v1'), input: evaluationReportInputSchema,
  report: aiInterviewReportSchema.nullable(), review: humanInterviewReviewSchema,
  attempts: z.array(z.object({ attempt: z.number().int().positive(), startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(), failureCode: z.string().nullable(),
    ownerId: z.string().min(1).max(160).optional(), executionId: z.uuid().optional(), deadlineAt: z.string().datetime().optional(), inputHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()),
}).strict()
export type AiInterviewReportStorage = z.infer<typeof aiInterviewReportStorageSchema>
export const requestInterviewEvaluationSchema = z.object({ commandId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/), expectedVersion: z.number().int().nonnegative(),
  operation: z.enum(['RUN', 'RETRY', 'REEVALUATE']), evaluatorVersion: reportEvaluatorVersionSchema.optional() }).strict()
export const reviewInterviewReportSchema = z.object({ commandId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/), expectedVersion: z.number().int().nonnegative(),
  status: z.enum(['UNREVIEWED', 'REVIEWED']), note: z.string().max(4000) }).strict()
