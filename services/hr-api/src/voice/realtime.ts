import OpenAI from 'openai'
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime.js'
import { voiceTranscriptionPrompt } from '@hr/shared'
import { env } from '../env.js'

let client: OpenAI | null = null

/**
 * A Realtime credential only starts an audio transport; it is not an HR query.
 * Waiting through the SDK's default two automatic retries can therefore leave
 * the launcher on "connecting" for a very long time after an upstream outage.
 *
 * Keep the normal successful request exactly one request, but bound a broken
 * network path so the UI can return control to the person promptly.  Retrying
 * here would make a successful connection after a transient error slower and
 * can create more than one short-lived secret for the same click.  The browser
 * may always make a fresh, authenticated attempt instead.
 */
const REALTIME_SETUP_TIMEOUT_MS = 10_000

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null
  client ??= new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: REALTIME_SETUP_TIMEOUT_MS,
    maxRetries: 0,
  })
  return client
}

function realtimeSessionConfig(): RealtimeSessionCreateRequest {
  return {
    type: 'realtime' as const,
    model: env.OPENAI_REALTIME_MODEL,
    instructions:
      'You are the audio transport for an HR application. Never answer an HR question, never make a decision, never call tools, and never execute an action. Final user transcripts are handled by the application backend. When asked to speak, read only the sentence supplied in that response instruction.',
    output_modalities: ['audio'],
    tools: [],
    tracing: null,
    audio: {
      input: {
        noise_reduction: { type: 'near_field' },
        transcription: {
          model: env.OPENAI_VOICE_TRANSCRIPTION_MODEL,
          // The selected transcriber detects Arabic and English automatically.
          // The prompt improves HR terms but does not influence authorization.
          prompt: voiceTranscriptionPrompt,
        },
        turn_detection: {
          type: 'server_vad',
          // Reject room/keyboard noise before it becomes a transcript. The
          // browser repeats these values after its WebRTC channel opens.
          threshold: 0.6,
          prefix_padding_ms: 450,
          // Keep natural Arabic phrases together without adding a noticeable
          // pause before the trusted backend processes the final transcript.
          silence_duration_ms: 700,
          create_response: false,
          // Let a person naturally interrupt the spoken response. We still
          // create responses ourselves after the trusted backend answers.
          interrupt_response: true,
        },
      },
      output: { voice: env.OPENAI_REALTIME_VOICE },
    },
  }
}

function apiStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/**
 * Creates only an audio transport. It receives no HR tools, no MCP server and
 * no business prompt. Final transcripts return to the ordinary Copilot route.
 */
export async function createRealtimeCall(sdp: string, safetyIdentifier: string): Promise<string> {
  const openai = getClient()
  if (!openai) throw new VoiceRealtimeError('voiceUnavailable')

  try {
    const response = await openai.realtime.calls.create(
      {
        sdp,
        session: realtimeSessionConfig(),
      },
      { headers: { 'OpenAI-Safety-Identifier': safetyIdentifier } },
    )
    if (!response.ok) {
      console.error('[voice] Realtime call failed:', response.status)
      throw new VoiceRealtimeError(response.status === 401 ? 'voiceUnavailable' : 'voiceConnectionFailed')
    }
    const answer = await response.text()
    if (!answer.trim()) throw new VoiceRealtimeError('voiceConnectionFailed')
    return answer
  } catch (error) {
    if (error instanceof VoiceRealtimeError) throw error
    const status = apiStatus(error)
    console.error('[voice] Realtime setup failed:', String(error).slice(0, 160))
    throw new VoiceRealtimeError(status === 401 ? 'voiceUnavailable' : 'voiceConnectionFailed', status)
  }
}

/**
 * A short-lived fallback for networks which time out the backend's multipart
 * SDP request. The token config has the same no-tools audio boundary as the
 * unified request and does not expose the organisation's API key.
 */
export async function createRealtimeClientSecret(safetyIdentifier: string) {
  const openai = getClient()
  if (!openai) throw new VoiceRealtimeError('voiceUnavailable')

  try {
    const secret = await openai.realtime.clientSecrets.create(
      {
        expires_after: { anchor: 'created_at', seconds: 60 },
        session: realtimeSessionConfig(),
      },
      { headers: { 'OpenAI-Safety-Identifier': safetyIdentifier } },
    )
    if (!secret.value) throw new VoiceRealtimeError('voiceConnectionFailed')
    return { value: secret.value, expiresAt: secret.expires_at }
  } catch (error) {
    if (error instanceof VoiceRealtimeError) throw error
    const status = apiStatus(error)
    console.error('[voice] Realtime client-secret setup failed:', String(error).slice(0, 160))
    throw new VoiceRealtimeError(status === 401 ? 'voiceUnavailable' : 'voiceConnectionFailed', status)
  }
}

export class VoiceRealtimeError extends Error {
  constructor(
    readonly code: 'voiceUnavailable' | 'voiceConnectionFailed',
    readonly status?: number,
  ) {
    super(code)
  }
}
