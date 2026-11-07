import { z } from 'zod'
export const audioTicketSchema = z.object({submissionId: z.uuid(), generationId: z.uuid(), sessionVersion: z.number().int().positive(), questionId: z.string(), turnId: z.string(),
  owner: z.string(), deliveryGeneration: z.uuid().nullable(), expiresAt: z.number(), maxDurationMs: z.number()}).strict()
export type AudioTicket = z.infer<typeof audioTicketSchema>
export const audioStatusRecordSchema = audioTicketSchema.extend({status: z.enum(['RESERVED', 'PROCESSING', 'RETRY_REQUIRED', 'COMMITTED', 'CANCELLED']),
  audioHash: z.string().nullable(), attemptId: z.uuid().nullable(), expectedVersion: z.number().nullable(), deadlineAt: z.number().nullable()}).strict()
export type AudioStatusRecord = z.infer<typeof audioStatusRecordSchema>
export type AudioAttempt = {ticket: AudioTicket; attemptId: string; expectedVersion: number; deadlineAt: number; audioHash: string}
export const audioTranscriptSchema = z.object({text: z.string().trim().min(1).max(16000), uncertain: z.boolean()}).strict()
