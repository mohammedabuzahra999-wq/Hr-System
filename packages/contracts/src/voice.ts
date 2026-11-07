import { z } from 'zod'
import { idSchema } from './primitives.js'

/**
 * Domain vocabulary for speech-to-text only. It does not contain instructions,
 * HR data, tools, or permissions. Keeping it shared makes the unified and
 * short-lived Realtime transports transcribe the same Arabic/English terms.
 */
export const voiceTranscriptionPrompt = [
  'HR application used in Jordan.',
  'Transcribe Arabic, Levantine Arabic, English, and natural Arabic-English switching exactly.',
  'Preserve names and HR vocabulary: payroll, payslip, attendance, overtime, leave, unpaid leave, recruitment, employee, manager, HR, admin, job description, candidate, department, Menaitech, Copilot, MCP, RAG.',
  'Arabic vocabulary: الرواتب، كشف الراتب، الحضور، الغياب، الإجازات، إجازة بدون راتب، العمل الإضافي، الموظفين، التوظيف، القسم.',
].join(' ')

/**
 * Context from the screen the person is already looking at.
 *
 * It is deliberately advisory. The backend never uses it as evidence that a
 * person may see a record; every intent and every action still resolves its
 * scope from the authenticated user.
 */
export const voiceUiContextSchema = z.object({
  currentPage: z.string().trim().min(1).max(200).optional(),
  selectedEmployeeId: idSchema.optional(),
  selectedPayrollPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  selectedDepartmentId: idSchema.optional(),
  selectedJobId: idSchema.optional(),
  selectedFindingId: idSchema.optional(),
  /** A compact, non-sensitive label for the result currently on screen. */
  previousResultReference: z.string().trim().min(1).max(160).optional(),
})
export type VoiceUiContext = z.infer<typeof voiceUiContextSchema>

/** A final transcript emitted by the Realtime transport, never raw audio. */
export const voiceTurnSchema = z.object({
  turnId: z.string().trim().min(1).max(200),
  transcript: z.string().trim().min(2).max(500),
  lang: z.enum(['en', 'ar']),
  context: voiceUiContextSchema.optional(),
})
export type VoiceTurn = z.infer<typeof voiceTurnSchema>

/** The next final transcript must be this exact phrase before an action runs. */
export const voiceConfirmSchema = z.object({
  confirmationId: idSchema,
  transcript: z.string().trim().min(2).max(500),
})
export type VoiceConfirm = z.infer<typeof voiceConfirmSchema>

/** Records that the person saw the exact action card before speaking confirmation. */
export const voiceReviewSchema = z.object({
  confirmationId: idSchema,
})
export type VoiceReview = z.infer<typeof voiceReviewSchema>
