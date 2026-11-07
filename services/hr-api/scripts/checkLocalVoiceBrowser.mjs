import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the audio boundary without a browser, microphone, HR data or network.
const source = await readFile(new URL('../../../apps/hr-web/src/features/copilot/localVoiceAudio.ts', import.meta.url), 'utf8')
const vadSource = await readFile(new URL('../../../apps/hr-web/src/features/copilot/localVoiceVad.ts', import.meta.url), 'utf8')
const vadCode = ts.transpileModule(vadSource, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/import \{ ApiError \} from ['"]@\/lib\/api['"];?/, 'class ApiError extends Error { constructor(status, code) { super(code); this.code=code; this.status=status } }')
  .replace(/from ['"]\.\/localVoiceVad['"]/, `from ${JSON.stringify('data:text/javascript;base64,' + Buffer.from(vadCode).toString('base64'))}`)
  .replaceAll('import.meta.env.VITE_API_URL', 'globalThis.__localVoiceTestBase')
const audio = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const originals = new Map(['window', 'navigator', 'AudioContext', 'AudioWorkletNode', 'fetch', 'setTimeout', 'clearTimeout', '__localVoiceTestBase'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
const define = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
let calls = 0, stops = 0, closes = 0
const callbacks = { onSpeechStart() {}, onSpeechEnd() {}, onError(error) { throw error } }
try {
  define('window', { location: { hostname: 'localhost', origin: 'http://localhost:5175' } })
  define('__localVoiceTestBase', undefined)
  define('fetch', async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'include'); return new Response('audio') })
  assert.ok(audio.localAudioAllowed())
  await audio.localVoiceFetch('/voice/test', {})
  define('__localVoiceTestBase', 'https://example.test/api')
  assert.equal(audio.localAudioAllowed(), false)
  await assert.rejects(audio.localVoiceFetch('/voice/test', {}), error => error.code === 'localVoiceUnavailable')
  assert.equal(calls, 1, 'Remote API must be rejected before fetch')
  define('__localVoiceTestBase', undefined)
  window.location.hostname = 'example.test'
  assert.equal(audio.localAudioAllowed(), false)

  const wav = Buffer.from(await audio.pcmWav(new Float32Array(48000).fill(2), 48000).arrayBuffer())
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000)
  assert.equal(wav.readUInt32LE(40), 32000); assert.equal(wav.length, 32044)
  assert.equal(wav.readInt16LE(44), 32767, 'PCM clipping')
  const max = await audio.pcmWav(new Float32Array(16000 * 31), 16000).arrayBuffer()
  assert.equal(max.byteLength, 960044, 'Recording capped at 30 seconds')

  define('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stops++ }] }) } })
  define('AudioContext', class { constructor() { throw Error('device busy') } })
  await assert.rejects(audio.startLocalConversation(callbacks))
  assert.equal(stops, 1, 'Release microphone if AudioContext fails')
  define('AudioContext', class {
    audioWorklet = { addModule: async () => { throw Error('worklet unavailable') } }
    close() { closes++; return Promise.resolve() }
  })
  await assert.rejects(audio.startLocalConversation(callbacks))
  assert.equal(stops, 2); assert.equal(closes, 1)
  console.log('PASS browser local-only audio guard, no redirects/cloud fallback, PCM16 resampling/clipping/cap, microphone cleanup on failure')

  let recorder, starts = 0
  const turns = [], track = { enabled: true, onended: null, stop() { stops++ } }
  const link = () => ({ connect() {}, disconnect() {} })
  define('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } })
  define('AudioWorkletNode', class { port = { onmessage: null }; constructor() { recorder = this }; connect() {}; disconnect() {} })
  define('AudioContext', class {
    sampleRate = 48000
    audioWorklet = { addModule: async () => {} }
    destination = {}
    resume() { return Promise.resolve() }
    close() { closes++; return Promise.resolve() }
    createMediaStreamSource() { return link() }
    createGain() { return { ...link(), gain: { value: 1 } } }
  })
  const mic = await audio.startLocalConversation({ onSpeechStart() { starts++ }, onSpeechEnd(turn) { turns.push(turn) }, onError(error) { throw error } })
  const feed = (seconds, level) => {
    for (let frame = 0; frame < Math.round(seconds / 0.02); frame++) recorder.port.onmessage?.({ data: new Float32Array(960).fill(level) })
  }
  try {
    assert.equal(track.enabled, false, 'Capture starts paused until the owned session is ready')
    mic.listen(); feed(2, 0)
    assert.equal(starts, 0); assert.equal(turns.length, 0, 'Silence must never submit a turn')
    feed(0.8, 0.05); feed(0.5, 0); feed(0.8, 0.05)
    assert.equal(turns.length, 0, 'A short natural pause keeps the same utterance')
    feed(1.2, 0)
    assert.equal(starts, 1); assert.equal(turns.length, 1); assert.ok(turns[0])
    assert.equal(track.enabled, false, 'Capture pauses before a turn is dispatched')
    const capture = Buffer.from(await turns[0].wav.arrayBuffer())
    assert.equal(capture.readUInt32LE(24), 16000)
    assert.ok(turns[0].timing.audioMs > 1600 && turns[0].timing.audioMs < turns[0].timing.recordingMs, 'Trim surplus ending silence while retaining speech')
    feed(2, 0.05)
    assert.equal(turns.length, 1, 'Paused microphone cannot capture the assistant output or duplicate a turn')
    mic.listen(); feed(0.18, 0.05); feed(1.2, 0)
    assert.equal(turns.length, 2); assert.equal(turns[1], null, 'Brief noise is discarded without STT')
    mic.listen()
    const beforeNoise = starts
    feed(2, 0.01)
    assert.equal(starts, beforeNoise, 'Idle background noise is not speech')
    feed(0.8, 0.05); feed(1.2, 0.01)
    assert.equal(turns.length, 3)
    assert.ok(turns[2], 'Speech ends against non-zero room noise instead of waiting for absolute silence')
    assert.equal(track.enabled, false)
    mic.stop(); mic.stop()
    assert.equal(stops, 3); assert.equal(closes, 2)
    assert.equal(track.onended, null)
    assert.equal(recorder.port.onmessage, null)
    console.log('PASS hands-free microphone: sustained speech, natural pauses, automatic endpointing, native-rate resampling, silence/noise rejection, echo gating and idempotent cleanup')
  } finally { mic.stop() }

  const timers = new Map(), failures = []
  let sequence = 0
  define('setTimeout', (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id })
  define('clearTimeout', id => timers.delete(id))
  const guarded = await audio.startLocalConversation({ onSpeechStart() {}, onSpeechEnd() { throw Error('Stalled input must not submit a partial request') }, onError(error) { failures.push(error) } })
  try {
    guarded.listen(); feed(0.4, 0.05)
    assert.ok([...timers.values()].some(timer => timer.delay === 30000), 'Wall-clock speech cap exists independently of received sample count')
    const watchdog = [...timers.values()].find(timer => timer.delay === 2500)
    assert.ok(watchdog)
    watchdog.callback()
    assert.equal(failures.length, 1)
    assert.equal(failures[0].code, 'localVoiceCaptureStalled')
    assert.equal(track.enabled, false)
    assert.equal(timers.size, 0, 'Stalled capture cancels both timers')
    console.log('PASS background-noise endpoint regression; stalled microphone fails clearly without submitting partial speech or waiting forever')
  } finally { guarded.stop() }

  const { LocalVoiceVad } = await import('data:text/javascript;base64,' + Buffer.from(vadCode).toString('base64'))
  const bounded = new LocalVoiceVad(16000)
  let capped
  for (let frame = 0; frame < 1600 && !capped; frame++) {
    const update = bounded.push(new Float32Array(320).fill(0.05))
    if (update.ended) capped = update
  }
  assert.ok(capped?.samples && capped.samples.length <= 480000, 'Speech cannot exceed the existing 30-second server limit')
  bounded.reset()
  assert.equal(bounded.push(new Float32Array(320)).started, false)
  console.log('PASS VAD bounded utterance size and reset; no sentence/name/intent patterns')
} finally {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
}
