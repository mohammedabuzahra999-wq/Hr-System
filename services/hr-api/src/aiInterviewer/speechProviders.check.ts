import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseInterviewSpeechConfiguration, SpeechConfigurationError } from './speechConfiguration.js'
import { createInterviewSpeechProviders, speechPcmToWav } from './speechProviders.js'
import { SpeechProviderError, SPEECH_OUTPUT_MAX_BYTES } from './speechContracts.js'
import { validDeliveryWav } from './delivery.js'
import { deferred, nextTurn } from './runtimeTestSupport.js'

if (process.argv.includes('--configuration-child')) {
  const {interviewSpeechProviders} = await import('./speechRuntime.js')
  console.log(JSON.stringify(interviewSpeechProviders.readiness())); interviewSpeechProviders.close(); process.exit(0)
}
const key = randomBytes(32).toString('base64url'), base = {AI_INTERVIEW_STT_PROVIDER: 'openai', AI_INTERVIEW_TTS_PROVIDER: 'openai',
  AI_INTERVIEW_STT_MODEL: 'synthetic-stt', AI_INTERVIEW_TTS_MODEL: 'synthetic-tts', AI_INTERVIEW_TTS_VOICE: 'alloy', AI_INTERVIEW_SPEECH_API_KEY: key}
const signal = () => new AbortController().signal
let checks = 0, syntheticRequests = 0, external = 0
const savedFetch = globalThis.fetch
globalThis.fetch = async () => {external++; throw Error('External calls forbidden')}
const matrix: Record<string, unknown>[] = []
const check = async (label: string, test: () => unknown | Promise<unknown>) => {await test(); checks++; console.log('PASS ' + label)}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}})
const pcm = (samples = [0, 1000, 2000, 3000, 4000, 5000]) => {const b = Buffer.alloc(samples.length * 2); samples.forEach((v, i) => b.writeInt16LE(v, i * 2)); return b}
function wav() {return speechPcmToWav(pcm())}
const failure = (code: string) => (e: unknown) => e instanceof SpeechProviderError && e.code === code
const make = (http: typeof globalThis.fetch, overrides: Record<string, unknown> = {}) => createInterviewSpeechProviders(parseInterviewSpeechConfiguration({...base, ...overrides}), {
  fetch: async (input, init) => {syntheticRequests++; return http(input, init)},
})
try {
  await check('disabled defaults ignore generic AI credentials and perform no I/O', async () => {
    const providers = createInterviewSpeechProviders(parseInterviewSpeechConfiguration({OPENAI_API_KEY: key}))
    assert.equal(providers.readiness().stt.status, 'disabled'); assert.equal(providers.physicalCalls, 0)
    await assert.rejects(providers.transcribe({audio: wav()}, signal()), failure('speechProviderDisabled'))
    await assert.rejects(providers.synthesize({text: 'Synthetic'}, signal()), failure('speechProviderDisabled')); providers.close()
  })
  await check('configuration and registry serialization exclude credential values', () => {
    const c = parseInterviewSpeechConfiguration(base), p = createInterviewSpeechProviders(c)
    assert(!JSON.stringify(c).includes(key)); assert(!JSON.stringify(p).includes(key)); assert(!JSON.stringify(p.readiness()).includes(key)); p.close()
  })
  for (const [label, overrides] of [
    ['missing dedicated key', {AI_INTERVIEW_SPEECH_API_KEY: undefined, OPENAI_API_KEY: key}],
    ['missing STT model', {AI_INTERVIEW_STT_MODEL: undefined}], ['missing TTS model', {AI_INTERVIEW_TTS_MODEL: undefined}], ['missing TTS voice', {AI_INTERVIEW_TTS_VOICE: undefined}],
    ['unknown provider', {AI_INTERVIEW_STT_PROVIDER: 'other'}], ['mock production selector', {AI_INTERVIEW_STT_PROVIDER: 'synthetic'}], ['local model selector', {AI_INTERVIEW_STT_PROVIDER: 'ollama'}],
    ['short key', {AI_INTERVIEW_SPEECH_API_KEY: 'short'}], ['key newline', {AI_INTERVIEW_SPEECH_API_KEY: key + '\n'}],
    ['non-HTTPS endpoint', {AI_INTERVIEW_SPEECH_BASE_URL: 'http://api.openai.com/v1'}], ['foreign endpoint', {AI_INTERVIEW_SPEECH_BASE_URL: 'https://untrusted.invalid/v1'}],
    ['credential endpoint', {AI_INTERVIEW_SPEECH_BASE_URL: 'https://user:secret@api.openai.com/v1'}], ['zero timeout', {AI_INTERVIEW_SPEECH_TIMEOUT_MS: 0}], ['excessive timeout', {AI_INTERVIEW_SPEECH_TIMEOUT_MS: 15001}], ['nonfinite timeout', {AI_INTERVIEW_SPEECH_TIMEOUT_MS: 'Infinity'}],
  ] as const) await check('fail-closed configuration: ' + label, () => {assert.throws(() => parseInterviewSpeechConfiguration({...base, ...overrides}), e => e instanceof SpeechConfigurationError && !String(e).includes(key))})
  await check('STT and TTS register independently without requiring a disabled role model', async () => {
    const p = make(async () => json({text: 'Synthetic'}), {AI_INTERVIEW_TTS_PROVIDER: 'disabled', AI_INTERVIEW_TTS_MODEL: undefined, AI_INTERVIEW_TTS_VOICE: undefined})
    assert.equal(p.readiness().stt.status, 'configured'); assert.equal(p.readiness().tts.status, 'disabled'); await p.transcribe({audio: wav()}, signal()); p.close()
    const tts = make(async () => new Response(pcm(), {headers: {'content-type': 'audio/pcm'}}), {AI_INTERVIEW_STT_PROVIDER: 'disabled', AI_INTERVIEW_STT_MODEL: undefined})
    assert.equal(tts.readiness().stt.status, 'disabled'); assert.equal(tts.readiness().tts.status, 'configured'); await tts.synthesize({text: 'Synthetic'}, signal()); tts.close()
  })
  await check('selected registration is configuration only and performs no health or cloud probe', () => {
    let calls = 0; const p = make(async () => {calls++; return json({text: 'Synthetic'})})
    assert.equal(calls, 0); assert.equal(p.readiness().stt.status, 'configured'); assert.equal(p.readiness().tts.status, 'configured'); assert.equal(p.readiness().liveValidated, false); p.close()
  })
  await check('SDK STT request uses fixed HTTPS destination, multipart audio and server credential', async () => {
    const p = make(async (input, init) => {
      assert.equal(String(input), 'https://api.openai.com/v1/audio/transcriptions'); assert.equal(init!.redirect, 'error'); assert.equal(init!.method, 'POST')
      assert.equal(new Headers(init!.headers).get('authorization'), 'Bearer ' + key)
      assert(init!.body instanceof FormData); assert.equal(init!.body.get('model'), 'synthetic-stt'); assert.equal(init!.body.get('response_format'), 'json'); assert.equal(init!.body.get('language'), 'ar')
      const file = init!.body.get('file') as File; assert.equal(file.name, 'answer.wav'); assert.equal(file.type, 'audio/wav'); assert(validDeliveryWav(new Uint8Array(await file.arrayBuffer()), 8000000)); assert(init!.signal instanceof AbortSignal)
      return json({text: '  إجابة synthetic  ', usage: {seconds: 1}})
    })
    assert.deepEqual(await p.transcribe({audio: wav(), language: 'ar'}, signal()), {text: 'إجابة synthetic', uncertain: true})
    assert.equal(p.readiness().stt.status, 'last-call-succeeded'); assert.equal(p.readiness().liveValidated, false); assert.equal(p.readiness().transportReady, false); p.close()
  })
  await check('mixed language omits language hint rather than restricting transcription', async () => {
    const p = make(async (_input, init) => {assert.equal((init!.body as FormData).get('language'), null); return json({text: 'Synthetic mixed نص'})})
    await p.transcribe({audio: wav()}, signal()); p.close()
  })
  await check('input audio is copied before asynchronous provider work', async () => {
    const audio = Buffer.from(wav()), original = Buffer.from(audio)
    const p = make(async (_input, init) => {assert.deepEqual(Buffer.from(await ((init!.body as FormData).get('file') as File).arrayBuffer()), original); return json({text: 'Synthetic'})})
    const pending = p.transcribe({audio}, signal()); audio.fill(0); await pending; p.close()
  })
  await check('SDK TTS request returns canonical bounded WAV without accepting playback authority', async () => {
    const p = make(async (input, init) => {
      assert.equal(String(input), 'https://api.openai.com/v1/audio/speech')
      assert.deepEqual(JSON.parse(init!.body as string), {model: 'synthetic-tts', voice: 'alloy', input: 'Synthetic question', response_format: 'pcm', stream_format: 'audio'})
      return new Response(pcm(), {headers: {'content-type': 'audio/pcm'}})
    })
    const output = await p.synthesize({text: 'Synthetic question'}, signal()); assert.equal(output.mimeType, 'audio/wav'); assert(validDeliveryWav(output.bytes, SPEECH_OUTPUT_MAX_BYTES))
    const b = Buffer.from(output.bytes); assert.equal(b.readUInt32LE(24), 16000); assert.equal(b.readUInt16LE(22), 1)
    assert.equal(b.readUInt32LE(40), 8); assert.deepEqual([0, 1, 2, 3].map(i => b.readInt16LE(44 + i * 2)), [333, 1667, 3333, 4667])
    assert(!('play' in p)); assert(!('stop' in p)); assert(!('bind' in p)); p.close()
  })
  await check('PCM conversion preserves signed extrema, duration and exact maximum size', () => {
    for (const value of [-32768, 0, 32767]) {const output = Buffer.from(speechPcmToWav(pcm([value, value, value]))); assert.equal(output.readInt16LE(44), value); assert.equal(output.readInt16LE(46), value)}
    const out = speechPcmToWav(new Uint8Array(((SPEECH_OUTPUT_MAX_BYTES - 44) / 2) * 3)); assert.equal(out.length, SPEECH_OUTPUT_MAX_BYTES)
    for (const bytes of [new Uint8Array(0), new Uint8Array(3), new Uint8Array(3000000)]) assert.throws(() => speechPcmToWav(bytes), failure('speechProviderMalformed'))
  })
  await check('malformed audio/text/unknown request fields fail before SDK invocation', async () => {
    let called = 0; const p = make(async () => {called++; return json({text: 'Synthetic'})})
    for (const audio of [new Uint8Array(0), new Uint8Array(80), new Uint8Array(8000002)]) await assert.rejects(p.transcribe({audio}, signal()), failure('speechInputInvalid'))
    for (const text of ['', ' ', 'x'.repeat(4097)]) await assert.rejects(p.synthesize({text}, signal()), failure('speechInputInvalid'))
    await assert.rejects(p.transcribe({audio: wav(), credential: key} as never, signal()), failure('speechInputInvalid'))
    await assert.rejects(p.synthesize({text: 'Synthetic', provider: 'openai'} as never, signal()), failure('speechInputInvalid')); assert.equal(called, 0); p.close()
  })
  await check('missing AbortSignal fails safely before SDK invocation', async () => {
    let calls = 0; const p = make(async () => {calls++; return json({text: 'Synthetic'})})
    await assert.rejects(p.transcribe({audio: wav()}, undefined as never), failure('speechInputInvalid')); await assert.rejects(p.synthesize({text: 'Synthetic'}, undefined as never), failure('speechInputInvalid')); assert.equal(calls, 0); p.close()
  })
  for (const [label, body] of [['missing text', {}], ['wrong text type', {text: 1}], ['empty text', {text: ' '}], ['oversized text', {text: 'x'.repeat(16001)}]] as const)
    await check('malformed STT response: ' + label, async () => {const p = make(async () => json(body)); await assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderMalformed')); assert.equal(p.readiness().stt.status, 'unhealthy'); p.close()})
  await check('invalid JSON from provider is sanitized as malformed output', async () => {
    const p = make(async () => new Response('{invalid', {headers: {'content-type': 'application/json'}})); await assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderMalformed')); p.close()
  })
  for (const [status, code, retryable] of [[400, 'speechProviderRejected', false], [401, 'speechProviderUnauthorized', false], [403, 'speechProviderUnauthorized', false], [429, 'speechProviderRateLimited', true], [500, 'speechProviderUnavailable', true]] as const)
    await check(`HTTP ${status} is safe and never automatically retried`, async () => {
      let calls = 0; const p = make(async () => {calls++; return json({error: {message: key + ' private candidate text', type: 'provider_error'}}, status)})
      await assert.rejects(p.transcribe({audio: wav()}, signal()), error => error instanceof SpeechProviderError && error.code === code && error.retryable === retryable && !JSON.stringify(error).includes(key) && !String(error.stack).includes(key) && !('cause' in error))
      assert.equal(calls, 1); p.close()
    })
  await check('raw connection exception never exposes credential or provider message', async () => {
    const p = make(async () => {throw Error(key + ' private provider exception')})
    await assert.rejects(p.synthesize({text: 'Synthetic'}, signal()), error => error instanceof SpeechProviderError && error.code === 'speechProviderUnavailable' && !String(error).includes(key) && !('cause' in error)); p.close()
  })
  for (const kind of ['content type', 'content length', 'streamed size', 'odd PCM'] as const) await check('bounded TTS body rejects ' + kind, async () => {
    const p = make(async () => new Response(kind === 'streamed size' ? new Uint8Array(3000000) : kind === 'odd PCM' ? new Uint8Array(5) : pcm(), {headers: {'content-type': kind === 'content type' ? 'text/html' : 'audio/pcm', ...(kind === 'content length' ? {'content-length': '999999999'} : {})}}))
    await assert.rejects(p.synthesize({text: 'Synthetic'}, signal()), failure('speechProviderMalformed')); p.close()
  })
  await check('bounded STT body rejects oversized JSON before SDK parsing', async () => {
    const p = make(async () => new Response(new Uint8Array(128001), {headers: {'content-type': 'application/json'}})); await assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderMalformed')); p.close()
  })
  await check('STT invalid content metadata is rejected without parsing provider text', async () => {
    for (const headers of [{'content-type': 'text/html'}, {'content-type': 'application/json', 'content-length': '-1'}]) {
      const p = make(async () => new Response('{}', {headers})); await assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderMalformed')); p.close()
    }
  })
  await check('redirect responses cannot trigger another credential-bearing request', async () => {
    let calls = 0; const p = make(async (_input, init) => {calls++; assert.equal(init!.redirect, 'error'); return new Response('redirect', {status: 302, headers: {location: 'https://untrusted.invalid'}})})
    await assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderUnavailable')); assert.equal(calls, 1); p.close()
  })
  await check('pre-aborted requests invoke no SDK work', async () => {
    let calls = 0; const p = make(async () => {calls++; return json({text: 'Synthetic'})}), abort = new AbortController(); abort.abort()
    await assert.rejects(p.transcribe({audio: wav()}, abort.signal), failure('speechProviderCancelled')); assert.equal(calls, 0); p.close()
  })
  await check('caller cancellation aborts the underlying request and rejects safely', async () => {
    const entered = deferred<void>(), d = deferred<Response>(), abort = new AbortController(); let inner: AbortSignal | null | undefined
    const p = make(async (_input, init) => {inner = init!.signal; entered.resolve(); return d.promise})
    const work = p.transcribe({audio: wav()}, abort.signal); await entered.promise; abort.abort(); await assert.rejects(work, failure('speechProviderCancelled')); assert(inner!.aborted)
    d.resolve(json({text: 'Late'})); await nextTurn(); p.close()
  })
  await check('timeouts retain physical slots and late settlements cannot become success', async () => {
    const pending: ReturnType<typeof deferred<Response>>[] = []
    const p = make(async () => {const d = deferred<Response>(); pending.push(d); return d.promise}, {AI_INTERVIEW_SPEECH_TIMEOUT_MS: 20})
    await Promise.all([assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderTimeout')), assert.rejects(p.synthesize({text: 'Synthetic'}, signal()), failure('speechProviderTimeout'))])
    assert.equal(p.physicalCalls, 2); await assert.rejects(p.transcribe({audio: wav()}, signal()), failure('speechProviderCapacity')); assert.equal(pending.length, 2)
    for (const d of pending) d.resolve(json({text: 'Late'}))
    for (let i = 0; i < 30 && p.physicalCalls; i++) await new Promise(done => setTimeout(done, 1))
    assert.equal(p.physicalCalls, 0); assert.equal(p.readiness().stt.status, 'unhealthy'); assert.equal(p.readiness().tts.status, 'unhealthy'); p.close()
    matrix.push({scenario: 'timeouts and late settlement', physicalLimit: 2, timeoutMs: 20, lateSuccessAccepted: false})
  })
  await check('response-body stall is bounded and late body completion is fenced', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const p = make(async () => new Response(new ReadableStream<Uint8Array>({start(c) {controller = c}}), {headers: {'content-type': 'audio/pcm'}}), {AI_INTERVIEW_SPEECH_TIMEOUT_MS: 20})
    await assert.rejects(p.synthesize({text: 'Synthetic'}, signal()), failure('speechProviderTimeout')); assert.equal(p.physicalCalls, 1)
    controller.enqueue(pcm()); controller.close(); for (let i = 0; i < 30 && p.physicalCalls; i++) await new Promise(done => setTimeout(done, 1))
    assert.equal(p.physicalCalls, 0); assert.equal(p.readiness().tts.status, 'unhealthy'); p.close()
  })
  await check('shutdown cancels in-flight work and permanently closes admission', async () => {
    const entered = deferred<void>(), d = deferred<Response>(), p = make(async () => {entered.resolve(); return d.promise})
    const work = p.transcribe({audio: wav()}, signal()); await entered.promise; p.close(); p.close(); await assert.rejects(work, failure('speechProviderCancelled'))
    await assert.rejects(p.synthesize({text: 'Synthetic'}, signal()), failure('speechProviderCancelled')); d.resolve(json({text: 'Late'})); await nextTurn(); assert.equal(p.readiness().stt.status, 'closed')
  })
  await check('ambient SDK base URL/logging cannot redirect speech or leak secrets', async () => {
    const previous = {url: process.env.OPENAI_BASE_URL, log: process.env.OPENAI_LOG}, saved = {debug: console.debug, info: console.info, warn: console.warn, error: console.error}; let logs = 0
    process.env.OPENAI_BASE_URL = 'https://untrusted.invalid'; process.env.OPENAI_LOG = 'debug'
    try {
      for (const name of ['debug', 'info', 'warn', 'error'] as const) console[name] = () => {logs++}
      const p = make(async input => {assert.equal(new URL(String(input)).origin, 'https://api.openai.com'); return json({text: 'Synthetic'})}); await p.transcribe({audio: wav()}, signal()); p.close(); assert.equal(logs, 0)
    } finally {Object.assign(console, saved); if (previous.url === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = previous.url; if (previous.log === undefined) delete process.env.OPENAI_LOG; else process.env.OPENAI_LOG = previous.log}
  })
  const production = {NODE_ENV: 'production', SESSION_SECRET: randomBytes(32).toString('hex'), WEB_ORIGIN: 'https://interview.example.invalid', AI_INTERVIEW_DEV_MOCK: 'false', VOICE_DEV_MOCK: 'false', VITE_AI_INTERVIEW_DEV_MOCK: 'false', AI_INTERVIEW_PROVIDER_MODE: 'disabled'}
  for (const [label, override, expected] of [
    ['default disabled', {}, 0], ['selected with missing dedicated key', {AI_INTERVIEW_STT_PROVIDER: 'openai', AI_INTERVIEW_STT_MODEL: 'synthetic-stt'}, 1],
    ['selected with missing model', {AI_INTERVIEW_STT_PROVIDER: 'openai', AI_INTERVIEW_SPEECH_API_KEY: key}, 1],
    ['selected TTS missing voice', {AI_INTERVIEW_TTS_PROVIDER: 'openai', AI_INTERVIEW_TTS_MODEL: 'synthetic-tts', AI_INTERVIEW_SPEECH_API_KEY: key}, 1],
    ['invalid speech timeout', {AI_INTERVIEW_SPEECH_TIMEOUT_MS: '15001'}, 1], ['synthetic selector denied', {AI_INTERVIEW_STT_PROVIDER: 'synthetic'}, 1],
    ['complete provider registration remains not live-ready', base, 0],
  ] as const) await check('actual production startup: ' + label, () => {
    const child = spawnSync(process.execPath, ['--conditions=development', '--import', 'tsx', fileURLToPath(import.meta.url), '--configuration-child'], {env: {...process.env, ...production, ...override}, windowsHide: true, encoding: 'utf8', timeout: 15000})
    assert.equal(child.status, expected); assert(!child.stdout.includes(key)); assert(!child.stderr.includes(key)); assert(!child.stdout.includes(production.SESSION_SECRET)); assert(!child.stderr.includes(production.SESSION_SECRET))
    if (expected === 0) {const state = JSON.parse(child.stdout.trim()); assert.equal(state.liveValidated, false); assert.equal(state.transportReady, false)}
    matrix.push({scenario: label, exitCode: child.status, credentialsPrinted: false})
  })
  await check('external provider/model network attempts remain zero', () => assert.equal(external, 0))
  if (process.env.SPEECH_LAYER_OUTPUT) writeFileSync(resolve(process.env.SPEECH_LAYER_OUTPUT, 'speech-contract-matrix.json'), JSON.stringify({status: 'PASS', checks, syntheticSdkRequests: syntheticRequests, externalAttempts: external, realProviderCalls: 0, matrix}, null, 2) + '\n')
  console.log(`${checks}/${checks} STT/TTS provider contract checks passed; synthetic SDK requests=${syntheticRequests}; real provider/external calls=0`)
} finally {globalThis.fetch = savedFetch}
