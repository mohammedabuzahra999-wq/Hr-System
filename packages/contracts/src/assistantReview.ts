import { z } from 'zod'
import { idSchema, instantSchema, roleSchema } from './primitives.js'

/**
 * A question the assistant could not answer on the first request.
 *
 * Unlike the security audit, this is an intentional improvement inbox. It is
 * visible only to HR and administrators so they can see the original wording
 * and decide whether to add a capability or a knowledge-base source.
 */
export const assistantQuestionReasonSchema = z.enum(['notHrData', 'notPermitted', 'unclear', 'noData'])
export type AssistantQuestionReason = z.infer<typeof assistantQuestionReasonSchema>

export const assistantUnansweredQuestionSchema = z.object({
  id: idSchema,
  question: z.string(),
  role: roleSchema,
  intent: z.string().nullable(),
  reason: assistantQuestionReasonSchema,
  createdAt: instantSchema,
})
export type AssistantUnansweredQuestion = z.infer<typeof assistantUnansweredQuestionSchema>

export const assistantUnansweredQuestionsSchema = z.object({
  questions: z.array(assistantUnansweredQuestionSchema),
})
export type AssistantUnansweredQuestions = z.infer<typeof assistantUnansweredQuestionsSchema>
