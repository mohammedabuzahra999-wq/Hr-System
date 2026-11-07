import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { InterviewPrincipal } from './authorization.js'
import { deliveryContextSchema, type DeliveryContext } from './deliveryContracts.js'
import type { InterviewService } from './service.js'
import { admitInterviewProvider, interviewOperations } from './operations.js'

export const PROVIDER_TIMEOUT_MS = 15_000
export const PROVIDER_CALL_LIMIT = 2
export type DeliveryFailure = 'providerTimeout' | 'providerUnavailable' | 'providerMalformed' | 'providerCapacity' | 'providerCancelled'
export class InterviewDeliveryError extends Error { constructor(readonly code: DeliveryFailure) { super(code) } }
/** Server-registered adapter. No service, database, principal, credential or engine is supplied to its operations. */
export interface InterviewDeliveryAdapter {
  kind: 'synthetic' | 'real'
  trust: { stt: boolean; connection: boolean; idempotentPlayback: boolean }
  health(signal: AbortSignal): Promise<unknown>
  transcribe(request: Readonly<{ context: DeliveryContext; audio: Uint8Array }>, signal: AbortSignal): Promise<unknown>
  synthesize(request: Readonly<{ context: DeliveryContext; text: string }>, signal: AbortSignal): Promise<unknown>
  play(request: Readonly<{ context: DeliveryContext; bytes: Uint8Array; mimeType: 'audio/wav'; deliveryKey: string }>, signal: AbortSignal): Promise<unknown>
  stop(request: Readonly<{ context: DeliveryContext; deliveryKey: string }>, signal: AbortSignal): Promise<unknown>
}
export type DeliveryBinding = Awaited<ReturnType<InterviewService['bindDelivery']>>
export type DeliveryConfiguration = { mode: 'disabled' | 'synthetic' | 'real'; production: boolean }
const healthSchema = z.object({ stt: z.literal(true), tts: z.literal(true), connection: z.literal(true) }).strict()
const transcriptSchema = z.object({ text: z.string().trim().min(1).max(16000), uncertain: z.boolean() }).strict()
/** Boundary format: canonical 44-byte PCM16 mono 16 kHz WAV, no embedded metadata. */
export function validDeliveryWav(bytes: Uint8Array, maximum: number) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 46 || bytes.byteLength > maximum || bytes.byteLength % 2) return false
  const b = Buffer.from(bytes)
  return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 16) === 'WAVEfmt ' && b.toString('ascii', 36, 40) === 'data' &&
    b.readUInt32LE(4) + 8 === b.length && b.readUInt32LE(16) === 16 && b.readUInt16LE(20) === 1 && b.readUInt16LE(22) === 1 &&
    b.readUInt32LE(24) === 16000 && b.readUInt32LE(28) === 32000 && b.readUInt16LE(32) === 2 && b.readUInt16LE(34) === 16 && b.readUInt32LE(40) + 44 === b.length
}
const speechSchema = z.object({ bytes: z.instanceof(Uint8Array).refine(b => validDeliveryWav(b, 2_000_000)), mimeType: z.literal('audio/wav') }).strict()
type PhysicalCall = { owner: string; controller: AbortController }
const registries = new WeakMap<object, Set<PhysicalCall>>()

/** Isolated provider gate, not a real microphone/worker transport. Production defaults disabled. */
export class InterviewDeliveryGate {
  private status: 'configured' | 'unavailable' | 'unhealthy' | 'ready' = 'unavailable'
  private readonly owner = randomUUID()
  private stopped = false
  private readonly calls: Set<PhysicalCall>
  private readonly bindings = new Map<string, DeliveryBinding>()
  readonly timeoutMs: number
  constructor(private readonly service: InterviewService, private readonly configuration: DeliveryConfiguration,
    private readonly adapter?: InterviewDeliveryAdapter, options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > PROVIDER_TIMEOUT_MS) throw new InterviewDeliveryError('providerUnavailable')
    let calls = registries.get(service.repository.database)
    if (!calls) { calls = new Set(); registries.set(service.repository.database, calls) }
    this.calls = calls
    if (['synthetic', 'real'].includes(configuration.mode) && typeof configuration.production === 'boolean' && adapter?.kind === configuration.mode &&
      !(configuration.production && configuration.mode === 'synthetic') && adapter.trust.stt === true && adapter.trust.connection === true && adapter.trust.idempotentPlayback === true) this.changeReadiness('configured')
  }
  private changeReadiness(state: typeof this.status) { if (state !== this.status) {this.status = state; interviewOperations.record({event: 'provider_readiness_changed', state})} }
  readiness() { return { status: this.stopped ? 'unavailable' as const : this.status, mode: this.configuration.mode, liveValidated: false as const } }
  get physicalCalls() { return this.calls.size }
  private ready() { if (this.stopped || this.status !== 'ready' || !this.adapter) throw new InterviewDeliveryError('providerUnavailable'); return this.adapter }
  private call<T>(invoke: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.stopped) return Promise.reject(new InterviewDeliveryError('providerCancelled'))
    if (this.calls.size >= PROVIDER_CALL_LIMIT) return Promise.reject(new InterviewDeliveryError('providerCapacity'))
    const call = { owner: this.owner, controller: new AbortController() }; this.calls.add(call)
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (value: T | null, code?: DeliveryFailure) => {
        if (settled) return; settled = true; clearTimeout(timer); call.controller.signal.removeEventListener('abort', abort)
        if (code) reject(new InterviewDeliveryError(code)); else resolve(value as T)
      }
      const abort = () => finish(null, 'providerCancelled')
      const timer = setTimeout(() => { finish(null, 'providerTimeout'); call.controller.abort() }, this.timeoutMs)
      call.controller.signal.addEventListener('abort', abort, { once: true })
      Promise.resolve().then(() => call.controller.signal.aborted ? Promise.reject() : invoke(call.controller.signal)).then(
        result => { this.calls.delete(call); finish(result) },
        () => { this.calls.delete(call); finish(null, 'providerUnavailable') })
    })
  }
  async checkReadiness() {
    if (this.status === 'unavailable' || this.stopped) return this.readiness()
    if (!admitInterviewProvider(this.service.repository.database, 'health')) { this.changeReadiness('unhealthy'); return this.readiness() }
    try { healthSchema.parse(await this.call(signal => this.adapter!.health(signal))); this.changeReadiness(this.stopped ? 'unavailable' : 'ready') }
    catch { this.changeReadiness(this.stopped ? 'unavailable' : 'unhealthy') }
    return this.readiness()
  }
  async bind(principal: InterviewPrincipal, interviewId: string) {
    if (!this.stopped && this.status === 'unhealthy') {
      const row = await this.service.load(principal, interviewId)
      await this.checkReadiness(); this.ready()
      return this.bindValidated(principal, interviewId, row.version)
    }
    this.ready()
    const row = await this.service.load(principal, interviewId)
    return this.bindValidated(principal, interviewId, row.version)
  }
  private async bindValidated(principal: InterviewPrincipal, interviewId: string, version: number) {
    const raw = await this.service.bindDelivery(principal, interviewId, version)
    this.bindings.set(interviewId, raw)
    const alive = () => { if (this.stopped) throw new InterviewDeliveryError('providerCancelled') }
    return { generationId: raw.generationId,
      context: async () => { alive(); return raw.context() },
      observe: async (input: unknown) => { alive(); return raw.observe(input) },
      intent: async (type: Parameters<DeliveryBinding['intent']>[0], input: DeliveryContext) => { alive(); return raw.intent(type, input) } }
  }
  async start(binding: DeliveryBinding) { this.ready(); return binding.intent('START', (await binding.context()).context) }
  async resume(binding: DeliveryBinding) { this.ready(); return binding.intent('RESUME', (await binding.context()).context) }
  private async failure(binding: DeliveryBinding, context: DeliveryContext, error: unknown) {
    const safe = error instanceof InterviewDeliveryError ? error : new InterviewDeliveryError('providerMalformed')
    if (!this.stopped) this.changeReadiness('unhealthy')
    // The frozen context must still pass every service fence. A failure never rebases itself onto a newer turn.
    await binding.observe({ ...context, type: safe.code === 'providerTimeout' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE' }).catch(() => {})
    throw safe
  }
  async transcribe(binding: DeliveryBinding, input: DeliveryContext, audio: Uint8Array) {
    const adapter = this.ready(), context = deliveryContextSchema.parse(input)
    if (!validDeliveryWav(audio, 8_000_000)) throw new InterviewDeliveryError('providerMalformed')
    // Check session/generation/version before any external work as well as in the terminal transaction.
    const current = (await binding.context()).context
    if (context.interviewId !== current.interviewId || context.generationId !== current.generationId || context.expectedVersion !== current.expectedVersion ||
      context.sequence !== current.sequence || context.questionId !== current.questionId || context.turnId !== current.turnId || context.playbackId !== current.playbackId) throw new InterviewDeliveryError('providerUnavailable')
    let result: z.infer<typeof transcriptSchema>
    try { result = transcriptSchema.parse(await this.call(signal => adapter.transcribe({ context: structuredClone(context), audio: audio.slice() }, signal))) }
    catch (error) { return this.failure(binding, context, error) }
    return binding.observe({ ...context, type: 'TRANSCRIPT_FINAL', ...result })
  }
  async deliver(binding: DeliveryBinding) {
    const adapter = this.ready(), before = await binding.context()
    if (!before.state.delivery) throw new InterviewDeliveryError('providerUnavailable')
    // Commit intent before I/O. An ambiguous call cannot be blindly redelivered in the same generation.
    await binding.intent('RESERVE_PLAY', before.context)
    const context = (await binding.context()).context, deliveryKey = `${context.generationId}:${context.playbackId}`
    try {
      const speech = speechSchema.parse(await this.call(signal => adapter.synthesize({ context: structuredClone(context), text: before.state.delivery!.text }, signal)))
      this.ready()
      const current = (await binding.context()).context
      if (current.expectedVersion !== context.expectedVersion || current.sequence !== context.sequence || current.playbackId !== context.playbackId) throw new InterviewDeliveryError('providerUnavailable')
      z.object({ accepted: z.literal(true) }).strict().parse(await this.call(signal => adapter.play({ context: structuredClone(context), bytes: speech.bytes.slice(), mimeType: speech.mimeType, deliveryKey }, signal)))
      return { status: 'DISPATCHED' as const } // Not playback-started, finished, or answer commitment.
    } catch (error) { return this.failure(binding, context, error) }
  }
  async stopPlayback(binding: DeliveryBinding, playbackId: string) {
    const adapter = this.ready(), value = await binding.context()
    if (!value.effects.some(e => e.type === 'STOP_PLAYBACK' && e.playbackId === playbackId)) throw new InterviewDeliveryError('providerUnavailable')
    const context = { ...value.context, playbackId }
    try {
      z.object({ stopped: z.literal(true) }).strict().parse(await this.call(signal => adapter.stop({ context: structuredClone(context), deliveryKey: `${context.generationId}:${playbackId}:stop` }, signal)))
    } catch (error) { throw error instanceof InterviewDeliveryError ? error : new InterviewDeliveryError('providerMalformed') }
    return binding.observe({ ...context, type: 'STOPPED' })
  }
  async close() {
    this.stopped = true
    this.changeReadiness('unavailable')
    for (const call of this.calls) if (call.owner === this.owner) call.controller.abort()
    // Serialize a trusted close after prior committed observations; no late callback can reuse this generation.
    await Promise.allSettled([...this.bindings.values()].map(async binding => {
      for (let tries = 0; tries < 3; tries++) {
        try { await binding.intent('CLOSE', (await binding.context(true)).context); return }
        catch { if (tries === 2) return }
      }
    }))
    this.bindings.clear()
  }
}
