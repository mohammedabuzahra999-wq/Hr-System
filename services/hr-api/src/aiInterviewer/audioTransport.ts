import { createHash } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { CANDIDATE_AUDIO_MAX_BYTES, CANDIDATE_AUDIO_MAX_MS, type CandidateAudioUploadRequest, type CandidateAudioStatusRequest } from '@hr/shared'
import type { InterviewPrincipal } from './authorization.js'
import type { InterviewService } from './service.js'
import type { SpeechToTextProvider } from './speechContracts.js'
import { SPEECH_TIMEOUT_MS } from './speechContracts.js'
import { validDeliveryWav } from './delivery.js'
import { InterviewServiceError } from './repository.js'
import { audioTranscriptSchema } from './audioContracts.js'

/** Complete WAV uplink only. No browser transcript, playback acknowledgement or provider receipt is accepted. */
export class CandidateAudioTransport {
  private closed = false
  private readonly calls = new Set<AbortController>()
  private readonly active = new Map<string, AbortController>()
  private readers = 0
  constructor(readonly service: InterviewService, private readonly stt: SpeechToTextProvider, readonly timeoutMs = SPEECH_TIMEOUT_MS) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > SPEECH_TIMEOUT_MS) throw Error('invalidAudioTimeout')
  }
  get physicalCalls() {return this.calls.size}
  get activeUploads() {return this.readers}
  begin(principal: InterviewPrincipal, body: unknown) {this.available(); return this.service.beginAudio(principal, body)}
  status(principal: InterviewPrincipal, body: unknown) {return this.service.audioStatus(principal, body)}
  preflight(principal: InterviewPrincipal, body: unknown) {this.available(); return this.service.audioPreflight(principal, body)}
  private available() {if (this.closed) throw new HTTPException(503, {message: 'audioUnavailable'})}
  async receive(principal: InterviewPrincipal, request: CandidateAudioUploadRequest, raw: Request) {
    await this.preflight(principal, request)
    if (this.readers >= 2) throw new InterviewServiceError(429, 'audioCapacity')
    this.readers++
    try {return await this.upload(principal, request, await readCandidateWav(raw))}
    finally {this.readers--}
  }
  async cancel(principal: InterviewPrincipal, body: CandidateAudioStatusRequest) {
    const result = await this.service.cancelAudio(principal, body)
    if (result.outcome === 'CANCELLED') this.active.get(`${body.interviewId}:${body.submissionId}`)?.abort()
    return result
  }
  async upload(principal: InterviewPrincipal, request: CandidateAudioUploadRequest, audio: Uint8Array) {
    this.available()
    await this.service.audioPreflight(principal, request)
    if (!validDeliveryWav(audio, CANDIDATE_AUDIO_MAX_BYTES)) throw new InterviewServiceError(422, 'audioInvalid')
    const durationMs = (audio.byteLength - 44) / 32
    if (durationMs < 250 || durationMs > CANDIDATE_AUDIO_MAX_MS) throw new InterviewServiceError(422, 'audioDurationInvalid')
    const hash = createHash('sha256').update(audio).digest('hex'), controller = new AbortController(), capacity = this.calls.size < 2
    if (capacity) this.calls.add(controller)
    let claim: Awaited<ReturnType<InterviewService['claimAudio']>>
    try {claim = await this.service.claimAudio(principal, request, hash, durationMs, capacity, this.timeoutMs)}
    catch (error) {this.calls.delete(controller); throw error}
    if (!claim.attempt) {this.calls.delete(controller); return claim.result}
    const attempt = claim.attempt, deadline = Date.now() + this.timeoutMs
    const workKey = `${request.interviewId}:${request.submissionId}`
    if (this.closed) {this.calls.delete(controller); await this.service.failAudio(principal, request.interviewId, attempt).catch(() => {}); throw new HTTPException(503, {message: 'audioUnavailable'})}
    this.active.set(workKey, controller)
    try {
      const transcript = await new Promise<unknown>((resolve, reject) => {
        let settled = false
        const finish = (value?: unknown, error?: Error) => {if (settled) return; settled = true; clearTimeout(timer); controller.signal.removeEventListener('abort', abort); if (error) {controller.abort(); reject(error)} else resolve(value)}
        const abort = () => finish(undefined, new Error('audioUnavailable'))
        const timer = setTimeout(() => finish(undefined, new Error('audioTimeout')), this.timeoutMs)
        controller.signal.addEventListener('abort', abort, {once: true})
        Promise.resolve().then(() => {if (controller.signal.aborted) throw Error('audioUnavailable'); return this.stt.transcribe({audio: Uint8Array.from(audio)}, controller.signal)}).then(
          value => {this.calls.delete(controller); if (this.active.get(workKey) === controller) this.active.delete(workKey); finish(value)},
          () => {this.calls.delete(controller); if (this.active.get(workKey) === controller) this.active.delete(workKey); finish(undefined, new Error('audioTranscriptionFailed'))})
      })
      if (this.closed || Date.now() >= deadline) throw Error('audioTimeout')
      return await this.service.completeAudio(principal, request.interviewId, attempt, audioTranscriptSchema.parse(transcript))
    } catch (error) {
      await this.service.failAudio(principal, request.interviewId, attempt).catch(() => {})
      if (error instanceof InterviewServiceError) throw error
      throw new HTTPException(503, {message: error instanceof Error && error.message === 'audioTimeout' ? 'audioTimeout' : 'audioTranscriptionFailed'})
    }
  }
  close() {this.closed = true; for (const controller of this.calls) controller.abort()}
}

export async function readCandidateWav(request: Request, timeoutMs = 15000) {
  if (request.headers.get('content-type')?.trim().toLowerCase() !== 'audio/wav') throw new HTTPException(415, {message: 'audioMimeInvalid'})
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > CANDIDATE_AUDIO_MAX_BYTES)) throw new HTTPException(413, {message: 'audioTooLarge'})
  if (!request.body) throw new HTTPException(422, {message: 'audioInvalid'})
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let total = 0
  const deadline = Date.now() + timeoutMs
  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new HTTPException(408, {message: 'audioUploadInterrupted'})
      let timer: ReturnType<typeof setTimeout> | undefined
      const part = await Promise.race([reader.read(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new HTTPException(408, {message: 'audioUploadInterrupted'})), remaining)})]).finally(() => clearTimeout(timer))
      if (request.signal.aborted) throw new HTTPException(400, {message: 'audioUploadInterrupted'})
      if (part.done) break
      total += part.value.byteLength
      if (total > CANDIDATE_AUDIO_MAX_BYTES) throw new HTTPException(413, {message: 'audioTooLarge'})
      chunks.push(part.value)
    }
  } catch (error) {void reader.cancel().catch(() => {}); if (error instanceof HTTPException) throw error; throw new HTTPException(400, {message: 'audioUploadInterrupted'})}
  finally {reader.releaseLock()}
  return Buffer.concat(chunks, total)
}
