import { z } from 'zod'
import { SPEECH_TIMEOUT_MS, type SpeechProviderName } from './speechContracts.js'

export class SpeechConfigurationError extends Error {constructor() {super('interviewSpeechConfigurationInvalid'); this.name = 'SpeechConfigurationError'}}
export type InterviewSpeechConfiguration = Readonly<{
  sttProvider: SpeechProviderName; ttsProvider: SpeechProviderName; sttModel?: string; ttsModel?: string; voice?: string; timeoutMs: number;
  /** A non-serializable server-only accessor: never place the credential in a DTO. */
  readApiKey(): string | undefined;
}>
const model = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/)
const schema = z.object({
  AI_INTERVIEW_STT_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
  AI_INTERVIEW_TTS_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
  AI_INTERVIEW_STT_MODEL: model.optional(), AI_INTERVIEW_TTS_MODEL: model.optional(),
  AI_INTERVIEW_TTS_VOICE: z.enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']).optional(),
  AI_INTERVIEW_SPEECH_API_KEY: z.string().min(16).max(512).regex(/^[\x21-\x7e]+$/).optional(),
  AI_INTERVIEW_SPEECH_BASE_URL: z.literal('https://api.openai.com/v1').default('https://api.openai.com/v1'),
  AI_INTERVIEW_SPEECH_TIMEOUT_MS: z.coerce.number().int().min(1).max(SPEECH_TIMEOUT_MS).default(SPEECH_TIMEOUT_MS),
})
/** Independent of general AI/Realtime credentials. Presence of a key never selects a provider. */
export function parseInterviewSpeechConfiguration(input: unknown): InterviewSpeechConfiguration {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new SpeechConfigurationError()
  const p = parsed.data, selected = p.AI_INTERVIEW_STT_PROVIDER === 'openai' || p.AI_INTERVIEW_TTS_PROVIDER === 'openai'
  if ((selected && !p.AI_INTERVIEW_SPEECH_API_KEY) || (p.AI_INTERVIEW_STT_PROVIDER === 'openai' && !p.AI_INTERVIEW_STT_MODEL)
    || (p.AI_INTERVIEW_TTS_PROVIDER === 'openai' && (!p.AI_INTERVIEW_TTS_MODEL || !p.AI_INTERVIEW_TTS_VOICE))) throw new SpeechConfigurationError()
  const apiKey = selected ? p.AI_INTERVIEW_SPEECH_API_KEY : undefined
  return Object.freeze({sttProvider: p.AI_INTERVIEW_STT_PROVIDER, ttsProvider: p.AI_INTERVIEW_TTS_PROVIDER, sttModel: p.AI_INTERVIEW_STT_MODEL,
    ttsModel: p.AI_INTERVIEW_TTS_MODEL, voice: p.AI_INTERVIEW_TTS_VOICE, timeoutMs: p.AI_INTERVIEW_SPEECH_TIMEOUT_MS, readApiKey: () => apiKey})
}
