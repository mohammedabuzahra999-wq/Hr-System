import { z } from 'zod'
import { aiInterviewDimensionSchema } from './aiInterview.js'

export const evaluationProviderSnapshotSchema=z.object({format:z.literal('llm-report-provider-v1'),provider:z.enum(['synthetic','openai']),model:z.string().min(1).max(100),profile:z.string().min(1).max(200),timeoutMs:z.number().int().min(1).max(30000),maxAttempts:z.number().int().min(1).max(3)}).strict()
/** No free-form findings, hiring decisions, aggregate or unanchored numeric score. */
export const evaluationProviderOutputSchema=z.object({criteria:z.array(z.object({criterionKey:z.string().min(1).max(300),
  anchor:z.object({dimension:aiInterviewDimensionSchema,score:z.number().int().min(0).max(4),text:z.string().min(1).max(1000)}).strict().nullable(),
  citations:z.array(z.object({eventSequence:z.number().int().positive(),startOffset:z.number().int().nonnegative(),endOffset:z.number().int().positive(),quote:z.string().min(1).max(16000)}).strict()).max(100),
}).strict()).min(1).max(100)}).strict()
export const evaluationProviderAssessmentSchema=z.object({contract:z.literal('evidence-rubric-selection-v1'),provider:evaluationProviderSnapshotSchema,selection:evaluationProviderOutputSchema}).strict()
export type EvaluationProviderSnapshot=z.infer<typeof evaluationProviderSnapshotSchema>
export type EvaluationProviderOutput=z.infer<typeof evaluationProviderOutputSchema>
