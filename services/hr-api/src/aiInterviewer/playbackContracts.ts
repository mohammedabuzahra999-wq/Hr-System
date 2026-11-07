import { z } from 'zod'
import { playbackScopeSchema } from '@hr/shared'
export const playbackRecordSchema=playbackScopeSchema.extend({generationId:z.uuid(),requestId:z.uuid(),owner:z.string(),deliveryGeneration:z.string().nullable(),status:z.enum(['GENERATING','READY','PLAYING','STOPPED','COMPLETED','ERROR']),
  expectedVersion:z.number(),expiresAt:z.number(),durationMs:z.number(),audioHash:z.string().nullable(),documentId:z.uuid().nullable(),finishAt:z.number().nullable(),leaseUntil:z.number().nullable()}).strict()
export type PlaybackRecord=z.infer<typeof playbackRecordSchema>
