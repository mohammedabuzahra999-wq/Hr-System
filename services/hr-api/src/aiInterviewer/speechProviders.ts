import OpenAI, { toFile } from 'openai'
import { z } from 'zod'
import { validDeliveryWav } from './delivery.js'
import { SpeechConfigurationError, type InterviewSpeechConfiguration } from './speechConfiguration.js'
import { SPEECH_CONCURRENCY, SPEECH_INPUT_MAX_BYTES, SPEECH_OUTPUT_MAX_BYTES, SPEECH_TEXT_MAX_LENGTH, SPEECH_TIMEOUT_MS,
  SpeechProviderError, type InterviewSpeechProviders, type SpeechOperationStatus } from './speechContracts.js'

const transcribeSchema = z.object({audio: z.instanceof(Uint8Array).refine(a => validDeliveryWav(a, SPEECH_INPUT_MAX_BYTES)), language: z.enum(['en', 'ar']).optional()}).strict()
const synthesizeSchema = z.object({text: z.string().trim().min(1).max(SPEECH_TEXT_MAX_LENGTH)}).strict()
const transcriptSchema = z.object({text: z.string().trim().min(1).max(16000)})
const JSON_LIMIT = 128_000
const PCM_LIMIT = ((SPEECH_OUTPUT_MAX_BYTES - 44) / 2) * 3
type Role = 'stt' | 'tts'
type Call = {controller: AbortController}

/** PCM24k mono/S16LE from the cloud contract -> metadata-free canonical PCM16k WAV.
 * Area averaging over each 1.5-input-sample interval preserves duration and DC gain.
 * Perceptual quality and actual cloud/device behavior still require live validation. */
export function speechPcmToWav(input: Uint8Array): Uint8Array {
  if (!(input instanceof Uint8Array) || input.byteLength < 4 || input.byteLength > PCM_LIMIT || input.byteLength % 2) throw new SpeechProviderError('speechProviderMalformed')
  const source = Buffer.from(input), count = Math.floor((source.length / 2) * 2 / 3), out = Buffer.alloc(44 + count * 2)
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(16000, 24); out.writeUInt32LE(32000, 28)
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) {
    const start = i * 1.5, end = start + 1.5
    let value = 0
    for (let j = Math.floor(start); j < Math.ceil(end); j++) value += source.readInt16LE(j * 2) * (Math.min(end, j + 1) - Math.max(start, j))
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value / 1.5))), 44 + i * 2)
  }
  if (!validDeliveryWav(out, SPEECH_OUTPUT_MAX_BYTES)) throw new SpeechProviderError('speechProviderMalformed')
  return out
}

/** Pin destination and disable redirects even if ambient SDK environment overrides are present. */
function boundedFetch(implementation: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== 'https://api.openai.com' || !['/v1/audio/transcriptions', '/v1/audio/speech'].includes(url.pathname)
      || url.search || url.hash || url.username || url.password || init?.method !== 'POST') throw new SpeechProviderError('speechProviderUnavailable')
    const response = await implementation(input, {...init, redirect: 'error'})
    const limit = response.ok && url.pathname.endsWith('/speech') ? PCM_LIMIT : JSON_LIMIT
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    const contentLength = response.headers.get('content-length')
    if ((response.ok && (url.pathname.endsWith('/speech') ? !['audio/pcm', 'application/octet-stream'].includes(contentType ?? '') : contentType !== 'application/json'))
      || (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) || !response.body) {
      void response.body?.cancel().catch(() => {}); throw new SpeechProviderError('speechProviderMalformed')
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const value = await reader.read()
        if (init?.signal?.aborted) throw new SpeechProviderError('speechProviderCancelled')
        if (value.done) break
        length += value.value.byteLength
        if (length > limit) {void reader.cancel().catch(() => {}); throw new SpeechProviderError('speechProviderMalformed')}
        chunks.push(value.value)
      }
    } catch (error) {void reader.cancel().catch(() => {}); throw error}
    finally {reader.releaseLock()}
    return new Response(Buffer.concat(chunks, length), {status: response.status, statusText: response.statusText, headers: response.headers})
  }
}
function safeFailure(error: unknown): SpeechProviderError {
  if (error instanceof SpeechProviderError) return error
  // The SDK may wrap fetch errors; only our own fixed safe error can pass through its cause.
  if (error instanceof OpenAI.APIConnectionError && error.cause instanceof SpeechProviderError) return error.cause
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new SpeechProviderError('speechProviderTimeout', true)
  if (error instanceof SyntaxError) return new SpeechProviderError('speechProviderMalformed')
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) return new SpeechProviderError('speechProviderUnauthorized')
    if (error.status === 429) return new SpeechProviderError('speechProviderRateLimited', true)
    if (error.status && error.status >= 400 && error.status < 500 && error.status !== 408) return new SpeechProviderError('speechProviderRejected')
  }
  return new SpeechProviderError('speechProviderUnavailable', true)
}

/** Server registration. No I/O during construction; injectable HTTP is for isolated contract tests.
 * This object cannot bind sessions, emit provider events, play audio or advance an interview. */
export function createInterviewSpeechProviders(configuration: InterviewSpeechConfiguration,
  options: {fetch?: typeof globalThis.fetch} = {}): InterviewSpeechProviders {
  const c = configuration
  if (!Number.isSafeInteger(c.timeoutMs) || c.timeoutMs < 1 || c.timeoutMs > SPEECH_TIMEOUT_MS
    || !['disabled', 'openai'].includes(c.sttProvider) || !['disabled', 'openai'].includes(c.ttsProvider)) throw new SpeechConfigurationError()
  let client: OpenAI | undefined
  try {
    if (c.sttProvider !== 'disabled' || c.ttsProvider !== 'disabled') {
      const apiKey = c.readApiKey()
      if (!apiKey || (c.sttProvider === 'openai' && !c.sttModel) || (c.ttsProvider === 'openai' && (!c.ttsModel || !c.voice))) throw new SpeechConfigurationError()
      client = new OpenAI({apiKey, baseURL: 'https://api.openai.com/v1', organization: null, project: null, adminAPIKey: null, webhookSecret: null,
        timeout: c.timeoutMs, maxRetries: 0, logLevel: 'off', fetch: boundedFetch(options.fetch ?? globalThis.fetch)})
    }
  } catch {throw new SpeechConfigurationError()}
  const states: Record<Role, SpeechOperationStatus> = {stt: c.sttProvider === 'disabled' ? 'disabled' : 'configured', tts: c.ttsProvider === 'disabled' ? 'disabled' : 'configured'}
  const calls = new Set<Call>()
  let closed = false
  function invoke<T>(role: Role, signal: AbortSignal, perform: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (closed || signal.aborted) return Promise.reject(new SpeechProviderError('speechProviderCancelled'))
    if (states[role] === 'disabled') return Promise.reject(new SpeechProviderError('speechProviderDisabled'))
    if (calls.size >= SPEECH_CONCURRENCY) return Promise.reject(new SpeechProviderError('speechProviderCapacity', true))
    const call = {controller: new AbortController()}; calls.add(call)
    return new Promise((resolve, reject) => {
      let settled = false
      const abort = () => finish(undefined, new SpeechProviderError('speechProviderCancelled'))
      const externalAbort = () => call.controller.abort()
      const finish = (value?: T, error?: SpeechProviderError) => {
        if (settled) return; settled = true; clearTimeout(timer)
        signal.removeEventListener('abort', externalAbort); call.controller.signal.removeEventListener('abort', abort)
        if (error) {if (!closed && !['speechProviderCancelled', 'speechProviderCapacity'].includes(error.code)) states[role] = 'unhealthy'; call.controller.abort(); reject(error)}
        else {states[role] = 'last-call-succeeded'; resolve(value as T)}
      }
      const timer = setTimeout(() => {finish(undefined, new SpeechProviderError('speechProviderTimeout', true)); call.controller.abort()}, c.timeoutMs)
      call.controller.signal.addEventListener('abort', abort, {once: true}); signal.addEventListener('abort', externalAbort, {once: true})
      Promise.resolve().then(() => {if (call.controller.signal.aborted) throw new SpeechProviderError('speechProviderCancelled'); return perform(call.controller.signal)}).then(
        value => {calls.delete(call); finish(value)}, error => {calls.delete(call); finish(undefined, safeFailure(error))})
    })
  }
  return Object.freeze<InterviewSpeechProviders>({
    async transcribe(input, signal) {
      const p = transcribeSchema.safeParse(input)
      if (!p.success) throw new SpeechProviderError('speechInputInvalid')
      if (!(signal instanceof AbortSignal)) throw new SpeechProviderError('speechInputInvalid')
      const audio = Uint8Array.from(p.data.audio), language = p.data.language
      return invoke('stt', signal, async inner => {
        const raw = await client!.audio.transcriptions.create({file: await toFile(audio, 'answer.wav', {type: 'audio/wav'}), model: c.sttModel!, response_format: 'json', stream: false, ...(language ? {language} : {})}, {signal: inner, maxRetries: 0, timeout: c.timeoutMs})
        const transcript = transcriptSchema.safeParse(raw)
        if (!transcript.success) throw new SpeechProviderError('speechProviderMalformed')
        // No calibrated confidence policy is implemented. Do not fabricate certainty from a text-only response.
        return {text: transcript.data.text, uncertain: true}
      })
    },
    async synthesize(input, signal) {
      const p = synthesizeSchema.safeParse(input)
      if (!p.success) throw new SpeechProviderError('speechInputInvalid')
      if (!(signal instanceof AbortSignal)) throw new SpeechProviderError('speechInputInvalid')
      return invoke('tts', signal, async inner => {
        const response = await client!.audio.speech.create({model: c.ttsModel!, voice: c.voice!, input: p.data.text, response_format: 'pcm', stream_format: 'audio'}, {signal: inner, maxRetries: 0, timeout: c.timeoutMs})
        return {bytes: speechPcmToWav(new Uint8Array(await response.arrayBuffer())), mimeType: 'audio/wav' as const}
      })
    },
    readiness() {return {stt: {provider: c.sttProvider, status: states.stt}, tts: {provider: c.ttsProvider, status: states.tts}, liveValidated: false as const, transportReady: false as const}},
    get physicalCalls() {return calls.size},
    close() {closed = true; for (const role of ['stt', 'tts'] as const) if (states[role] !== 'disabled') states[role] = 'closed'; for (const call of calls) call.controller.abort()},
  })
}
