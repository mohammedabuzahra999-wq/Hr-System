import { z } from 'zod'

const key = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)
export const deliveryContextSchema = z.object({
  interviewId: z.uuid(), generationId: z.uuid(), eventId: z.uuid(),
  sequence: z.number().int().positive(), expectedVersion: z.number().int().nonnegative(),
  questionId: key.nullable(), turnId: key.nullable(), playbackId: key.nullable(),
}).strict()
const fields = deliveryContextSchema.shape
export const providerObservationSchema = z.discriminatedUnion('type', [
  z.object({ ...fields, type: z.literal('TRANSCRIPT_FINAL'), text: z.string().trim().min(1).max(16000), uncertain: z.boolean() }).strict(),
  ...(['CONNECTED', 'DISCONNECTED', 'SPEECH_STARTED', 'SPEECH_FINISHED', 'PLAYBACK_STARTED', 'PLAYBACK_FINISHED', 'STOPPED',
    'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'PLAYBACK_FAILED'] as const).map(type => z.object({ ...fields, type: z.literal(type) }).strict()),
])
export type DeliveryContext = z.infer<typeof deliveryContextSchema>
export type ProviderObservation = z.infer<typeof providerObservationSchema>
export type DeliveryIntent = 'START' | 'RESUME' | 'RESERVE_PLAY' | 'CLOSE'
export const AUDIO_CONSENT = 'ai-interview-v2-audio' as const
