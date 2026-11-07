import { z } from 'zod'
import { validateInterviewDeployment } from './aiInterviewer/deployment.js'
import { parseInterviewSpeechConfiguration } from './aiInterviewer/speechConfiguration.js'
import { parseInterviewLlmConfiguration } from './aiInterviewer/llmConfiguration.js'
import { parseEvaluationConfiguration } from './aiInterviewer/evaluationConfiguration.js'

/**
 * Configuration is read once, at boot, and validated.
 *
 * A missing secret fails the process immediately with a message naming the
 * variable, rather than surfacing later as an unauthenticated request that
 * happened to work.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see services/hr-api/.env.example'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Where uploaded CVs are written. Deliberately outside the web root and never
   * served statically — a download goes through an endpoint that checks the
   * session first. On a container, point this at a mounted volume.
   */
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Explicit selection for provider adapters; never inferred from available API keys.
   * Currently used by resolveQuestion only; other AI call sites retain their providers.
   */
  AI_PROVIDER: z.enum(['openai', 'ollama']).default('openai'),
  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).default('qwen3:4b'),
  /**
   * Optional. Without it the job-description feature still works end to end,
   * but arranges what HR typed instead of generating prose — see src/ai.
   */
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  /** Overridable without touching code; verified against the account at boot. */
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-4o'),
  /** Changing this changes the vector dimension — the column would need a migration. */
  OPENAI_EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
  /**
   * Voice is opt-in and independent of text inference. Local audio needs only
   * VOICE_ENABLED; both switches plus a key are required for OpenAI Realtime.
   */
  VOICE_PROVIDER: z.enum(['local', 'openai']).default(process.env.NODE_ENV === 'production' ? 'openai' : 'local'),
  LOCAL_VOICE_URL: z.url().default('http://127.0.0.1:8766').refine(value => {
    const url = new URL(value)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
  }, 'Local Voice must use an HTTP loopback URL'),
  VOICE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  VOICE_SHARE_AUDIO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Local-only voice event adapter. It never creates an OpenAI connection and
   * is refused when NODE_ENV is production even if accidentally configured.
   */
  VOICE_DEV_MOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Development interview observations only; routes are also forbidden in production. */
  AI_INTERVIEW_DEV_MOCK: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  CLIENT_ADDRESS_MODE: z.enum(['direct', 'trusted-proxy']).default('direct'),
  TRUSTED_PROXY_ADDRESSES: z.string().default(''),
  AI_INTERVIEW_PROVIDER_MODE: z.enum(['disabled', 'synthetic', 'real']).default('disabled'),
  AI_INTERVIEW_AUDIO_UPLOAD_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  AI_INTERVIEW_TTS_PLAYBACK_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  AI_INTERVIEW_RUNTIME_OWNERS: z.coerce.number().int().positive().default(1),
  AI_INTERVIEW_DEBUG: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  AI_INTERVIEW_TEST_MODE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  /** Server-only Realtime configuration. Nothing with a VITE_ prefix may name these. */
  OPENAI_REALTIME_MODEL: z.string().trim().min(1).default('gpt-realtime-2.1'),
  OPENAI_VOICE_TRANSCRIPTION_MODEL: z.string().trim().min(1).default('gpt-4o-mini-transcribe'),
  OPENAI_REALTIME_VOICE: z.string().trim().min(1).default('marin'),
  /**
   * `unified` keeps the SDP exchange on our backend. `ephemeral` grants the
   * browser a short-lived, audio-only Realtime token when the network path to
   * the unified endpoint is unavailable.
   */
  VOICE_REALTIME_TRANSPORT: z.enum(['unified', 'ephemeral']).default('unified'),
  /**
   * Whether employee data may be sent to the AI provider.
   *
   * The assistant works in two halves. The server runs the queries and produces
   * the figures — that never leaves this machine and this flag does not touch
   * it. The model then writes the sentence around those figures, and to do that
   * it has to be shown them: names on a presence list, salary lines on an
   * employee file, the text of a CV being screened.
   *
   * Some companies cannot allow that, and it is their decision rather than a
   * technical one. Set this to `false` and nothing about anybody's pay, name or
   * CV goes to a third party. Reports, tables and figures all still work — the
   * written summary is simply absent, and the screen says why.
   *
   * What it does NOT cover, stated plainly: the question the user typed is still
   * sent, because classifying it is the whole feature. Somebody who types "how
   * much does Ahmad earn" has sent that sentence either way.
   *
   * Defaults to true so that turning privacy on is a deliberate act rather than
   * something that silently removes a feature somebody was relying on.
   */
  AI_SHARE_DATA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().default(8787),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
  console.error(`Invalid server configuration:\n${problems}`)
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
export const interviewLlmConfiguration=(()=>{try{return parseInterviewLlmConfiguration(process.env)}catch{console.error('Invalid interview model configuration: interviewLlmConfigurationInvalid');process.exit(1)}})()
export const interviewEvaluationConfiguration=(()=>{try{return parseEvaluationConfiguration(process.env)}catch{console.error('Invalid interview evaluation configuration: interviewEvaluationConfigurationInvalid');process.exit(1)}})()

/** Separate server-only STT/TTS registration; no generic AI key fallback or implicit activation. */
export const interviewSpeechConfiguration = (() => {
  try {
    const configuration = parseInterviewSpeechConfiguration(process.env)
    if (env.AI_INTERVIEW_AUDIO_UPLOAD_ENABLED && configuration.sttProvider === 'disabled') throw Error('audioSttRequired')
    if (env.AI_INTERVIEW_TTS_PLAYBACK_ENABLED && configuration.ttsProvider === 'disabled') throw Error('playbackTtsRequired')
    return configuration
  }
  catch {console.error('Invalid interview speech configuration: interviewSpeechConfigurationInvalid'); process.exit(1)}
})()

/** Origins the browser may call the API from. */
export const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
export const clientAddressPolicy = (() => {
  try {
    return validateInterviewDeployment({production: isProduction, sessionSecret: env.SESSION_SECRET, origins: allowedOrigins,
      addressMode: env.CLIENT_ADDRESS_MODE, proxyAddresses: env.TRUSTED_PROXY_ADDRESSES, providerMode: env.AI_INTERVIEW_PROVIDER_MODE,
      runtimeOwners: env.AI_INTERVIEW_RUNTIME_OWNERS,
      debug: env.AI_INTERVIEW_DEV_MOCK || env.VOICE_DEV_MOCK || env.AI_INTERVIEW_DEBUG || env.AI_INTERVIEW_TEST_MODE || process.env.VITE_AI_INTERVIEW_DEV_MOCK === 'true',
      unsafeFrontendSecret: Object.keys(process.env).some(name => /^VITE_.*(?:SECRET|PASSWORD|API_KEY|TOKEN|PRIVATE_KEY|CREDENTIAL|DATABASE_URL)/i.test(name))})
  } catch (error) {
    console.error('Invalid server deployment policy: ' + (error instanceof Error ? error.message : 'invalidConfiguration'))
    process.exit(1)
  }
})()
