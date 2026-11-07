import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the real local Voice hook with deferred transports and a small hook
// scheduler. No browser permission, HR service, microphone or network is used.
const key = Symbol.for('hr.voice.playback.check')
const access = "globalThis[Symbol.for('hr.voice.playback.check')]"
const originals = new Map(['navigator', 'AudioContext', 'document', 'fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
const define = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code } }
const test = { ApiError, active: null, playback: null, vad: null }
globalThis[key] = test
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
async function isolated(file, imports) {
  const source = await readFile(file, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from (['"])([^'"]+)\1/g, (_match, _quote, name) => {
      if (!imports[name]) throw Error('Unexpected test import')
      return `from ${JSON.stringify(moduleUrl(imports[name]))}`
    })
  return import(moduleUrl(code))
}
const apiModule = `export const ApiError=${access}.ApiError;export const api={post:(...args)=>${access}.active.post(...args)}`
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const result = {
  answer: { intent: 'outOfScope', result: { kind: 'none' }, refusal: 'notHrData', sentence: { en: 'Synthetic reply', ar: 'Synthetic reply' } },
  spokenText: 'Synthetic reply',
}
function harness(hook, delayed = false) {
  const slots = [], effects = []
  let cursor = 0
  const same = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const state = {
    calls: [], audioCalls: [], opened: 0, stopped: 0, handled: 0, listening: false,
    answer: result, permission: null, audioError: null,
    stt: deferred(), turn: deferred(), tts: deferred(),
    hooks: {
      useState(initial) {
        const index = cursor++
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
        return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
      },
      useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
      useCallback(callback, deps) {
        const index = cursor++
        if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, callback }
        return slots[index].callback
      },
      useEffect(effect, deps) {
        const index = cursor++
        if (!slots[index] || !same(slots[index].deps, deps)) {
          const old = slots[index]
          slots[index] = { deps }
          effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect() })
        }
      },
    },
    async post(path) {
      state.calls.push(path)
      if (path === '/voice/local/session') return { sessionId: 'synthetic-session' }
      if (/\/(turn|confirm)$/.test(path)) return delayed ? state.turn.promise : state.answer
      return {}
    },
    async localFetch(path) {
      state.audioCalls.push(path)
      if (state.audioError) throw state.audioError
      if (path.endsWith('/stt')) return Response.json(delayed ? await state.stt.promise : { transcript: 'Synthetic transcript' })
      if (path.endsWith('/tts')) {
        if (delayed) await state.tts.promise
        return new Response(new Blob([new Uint8Array(64)], { type: 'audio/wav' }), { headers: { 'Content-Type': 'audio/wav' } })
      }
      throw Error('Unexpected audio path')
    },
    async startConversation(callbacks) {
      state.opened++; state.callbacks = callbacks
      if (state.permission) await state.permission.promise
      return { listen() { state.listening = true }, pause() { state.listening = false }, stop() { state.stopped++; state.listening = false } }
    },
    say() {
      assert.equal(state.listening, true, 'Only the listening microphone can begin a turn')
      state.callbacks.onSpeechStart()
      state.listening = false
      return state.callbacks.onSpeechEnd({ timing: { recordingMs: 1000, audioMs: 1000, conversionMs: 1 }, wav: new Blob([new Uint8Array(64)]) })
    },
  }
  const options = { lang: 'en', context: { currentPage: '/assistant' }, onResult: async () => { state.handled++ } }
  const audio = {
    src: '', srcObject: null, onended: null, blocked: true, plays: 0, pauses: 0,
    play() { this.plays++; return this.blocked ? Promise.reject(new DOMException('Synthetic autoplay block', 'NotAllowedError')) : Promise.resolve() },
    pause() { this.pauses++ },
  }
  state.render = () => {
    test.active = state; cursor = 0
    const value = hook(options)
    while (effects.length) effects.shift()()
    value.setAudioNode(audio)
    return value
  }
  state.audio = audio
  state.cleanup = () => { state.render().stop(); for (const slot of slots) slot?.cleanup?.() }
  return state
}

try {
  define('navigator', { mediaDevices: { getUserMedia() { throw Error('Real microphone forbidden') } } })
  define('AudioContext', class {})
  define('document', { hidden: false, addEventListener() {}, removeEventListener() {} })
  define('fetch', () => { throw Error('Real network forbidden') })
  const vadModule = await isolated(new URL('../../../apps/hr-web/src/features/copilot/localVoiceVad.ts', import.meta.url), {})
  test.vad = vadModule.LocalVoiceVad
  const audioModule = await isolated(new URL('../../../apps/hr-web/src/features/copilot/localVoiceAudio.ts', import.meta.url), {
    '@/lib/api': apiModule, './localVoiceVad': `export const LocalVoiceVad=${access}.vad`,
  })
  test.playback = audioModule.playLocalReply
  await assert.rejects(audioModule.playLocalReply({ play: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) }), error => error.code === 'localVoicePlaybackBlocked')
  await assert.rejects(audioModule.playLocalReply({ play: () => Promise.reject(new DOMException('Unsupported', 'NotSupportedError')) }), error => error.code === 'localVoicePlaybackFailed')
  const hooks = ['useCallback', 'useEffect', 'useRef', 'useState'].map(name => `export const ${name}=(...args)=>${access}.active.hooks.${name}(...args)`).join(';')
  const hookModule = await isolated(new URL('../../../apps/hr-web/src/features/copilot/useLocalVoiceCopilot.ts', import.meta.url), {
    react: hooks, '@/lib/api': apiModule,
    './localVoiceAudio': `export const localAudioAllowed=()=>true;export const playLocalReply=(node)=>${access}.playback(node);export const startLocalConversation=(...args)=>${access}.active.startConversation(...args);export const localVoiceFetch=(...args)=>${access}.active.localFetch(...args)`,
  })
  const automatic = harness(hookModule.useLocalVoiceCopilot)
  try {
    automatic.audio.blocked = false
    await automatic.render().start()
    assert.equal(automatic.listening, true)
    await automatic.say()
    const spoken = automatic.render()
    assert.equal(spoken.state, 'speaking')
    assert.equal(spoken.error, null)
    assert.equal(spoken.phase, null)
    assert.equal(spoken.canReplayResponse, false)
    assert.equal(spoken.timing.audioMs, 1000)
    assert.equal(automatic.audio.plays, 1)
    assert.equal(automatic.handled, 1)
    assert.equal(automatic.listening, false, 'Do not hear the assistant while it speaks')
    automatic.audio.onended()
    assert.equal(automatic.render().state, 'listening')
    assert.equal(automatic.listening, true, 'Resume capture automatically after the reply')
    await automatic.say()
    assert.equal(automatic.audio.plays, 2)
    assert.equal(automatic.opened, 1, 'One microphone click supports multiple turns')
    assert.equal(automatic.calls.filter(path => path.endsWith('/turn')).length, 2)
    console.log('PASS one-click conversation: automatic speech turns, replies and resumed listening across multiple turns with one microphone')
  } finally { automatic.cleanup() }
  const first = harness(hookModule.useLocalVoiceCopilot, true)
  try {
    await first.render().start()
    const completion = first.say()
    assert.equal(first.render().phase, 'transcribing')
    assert.equal(first.render().transcript, '')
    first.stt.resolve({ transcript: 'Synthetic transcript' }); await flush()
    assert.equal(first.render().transcript, 'Synthetic transcript')
    assert.equal(first.render().phase, 'copilot', 'STT completes before Copilot')
    first.turn.resolve(result); await flush()
    assert.equal(first.render().phase, 'synthesizing')
    first.tts.resolve(); await completion; await flush()
    const blocked = first.render()
    assert.equal(blocked.error, 'localVoicePlaybackBlocked')
    assert.equal(blocked.state, 'listening', 'Do not claim speaking after rejected play()')
    assert.equal(blocked.phase, null)
    assert.equal(blocked.canReplayResponse, true)
    assert.equal(first.handled, 1)
    assert.equal(first.listening, false, 'Blocked reply playback keeps capture paused')
    const source = first.audio.src, before = [first.calls.length, first.audioCalls.length]
    first.audio.blocked = false
    await blocked.replayResponse()
    assert.equal(first.render().state, 'speaking')
    assert.equal(first.audio.src, source, 'Replay uses the same in-memory audio')
    assert.deepEqual([first.calls.length, first.audioCalls.length], before, 'Playback retry cannot repeat any backend operation')
    first.audio.onended()
    assert.equal(first.render().state, 'listening')
    assert.equal(first.render().canReplayResponse, false)
    assert.equal(first.listening, true)
    console.log('PASS local turn: recording → STT → transcript → Copilot → TTS; accurate progress and blocked-playback recovery without any repeated request')
  } finally { first.cleanup() }

  const unreviewed = harness(hookModule.useLocalVoiceCopilot)
  try {
    unreviewed.audio.blocked = false
    unreviewed.answer = { ...result, answer: { ...result.answer, result: { kind: 'confirm' } }, confirmations: [{ id: 'synthetic-pending', phrase: 'Synthetic exact phrase' }] }
    await unreviewed.render().start(); await unreviewed.say()
    unreviewed.audio.onended()
    assert.equal(unreviewed.render().isConfirmationArmed, false)
    await unreviewed.say()
    assert.equal(unreviewed.calls.filter(path => path.endsWith('/turn')).length, 2)
    assert.equal(unreviewed.calls.filter(path => path.endsWith('/confirm')).length, 0)
    console.log('PASS hands-free speech never implicitly reviews or confirms an action proposal')
  } finally { unreviewed.cleanup() }

  const confirmation = harness(hookModule.useLocalVoiceCopilot)
  try {
    await confirmation.render().start()
    await confirmation.render().armConfirmation({ id: 'synthetic-confirmation', phrase: 'Synthetic exact confirmation' })
    assert.equal(confirmation.render().state, 'awaitingConfirmation')
    assert.equal(confirmation.render().isConfirmationArmed, true)
    assert.equal(confirmation.render().canReplayResponse, true)
    assert.ok(confirmation.calls.some(path => path.endsWith('/review')))
    const before = [confirmation.calls.length, confirmation.audioCalls.length]
    confirmation.audio.blocked = false
    await confirmation.render().replayResponse()
    confirmation.audio.onended()
    assert.equal(confirmation.render().state, 'awaitingConfirmation')
    assert.deepEqual([confirmation.calls.length, confirmation.audioCalls.length], before)
    assert.equal(confirmation.calls.filter(path => path.endsWith('/confirm')).length, 0)
    assert.equal(confirmation.listening, true)
    await confirmation.say()
    assert.equal(confirmation.calls.filter(path => path.endsWith('/confirm')).length, 1, 'Only a new user utterance after visible review may call confirmation')
    console.log('PASS confirmation playback: visible review retained; replay cannot submit confirmation or execute an action')
  } finally { confirmation.cleanup() }

  const canceled = harness(hookModule.useLocalVoiceCopilot, true)
  try {
    await canceled.render().start()
    const pending = canceled.say()
    canceled.render().stop()
    canceled.stt.resolve({ transcript: 'Late synthetic transcript' }); await pending; await flush()
    assert.equal(canceled.render().state, 'idle')
    assert.equal(canceled.render().phase, null)
    assert.equal(canceled.calls.filter(path => path.endsWith('/turn')).length, 0)
    assert.equal(canceled.audioCalls.filter(path => path.endsWith('/tts')).length, 0)
    assert.equal(canceled.listening, false)
    console.log('PASS canceled local turn: late transcription cannot trigger Copilot or audio')
  } finally { canceled.cleanup() }

  const permission = harness(hookModule.useLocalVoiceCopilot)
  try {
    permission.permission = deferred()
    const starting = permission.render().start()
    permission.render().stop()
    permission.permission.resolve(); await starting
    assert.equal(permission.stopped, 1)
    assert.equal(permission.calls.length, 0, 'Late microphone permission cannot create a stopped session')
    assert.equal(permission.render().state, 'idle')
    console.log('PASS stop during microphone permission: late device is released without any backend request')
  } finally { permission.cleanup() }

  const stalled = harness(hookModule.useLocalVoiceCopilot)
  try {
    await stalled.render().start()
    stalled.callbacks.onSpeechStart()
    assert.equal(stalled.render().state, 'userSpeaking')
    stalled.callbacks.onError(new ApiError(0, 'localVoiceCaptureStalled', 'Synthetic missing microphone frames'))
    assert.equal(stalled.render().state, 'error')
    assert.equal(stalled.render().error, 'localVoiceCaptureStalled')
    assert.equal(stalled.stopped, 1)
    assert.equal(stalled.audioCalls.length, 0)
    assert.equal(stalled.calls.filter(path => path.endsWith('/turn')).length, 0)
    console.log('PASS stalled microphone exits hearing state, releases the device and reports the capture error without a model call')
  } finally { stalled.cleanup() }

  const busy = harness(hookModule.useLocalVoiceCopilot)
  try {
    busy.audioError = new ApiError(429, 'localVoiceBusy', 'Synthetic full audio queue')
    await busy.render().start(); await busy.say()
    assert.equal(busy.render().state, 'error')
    assert.equal(busy.render().error, 'localVoiceBusy')
    assert.equal(busy.listening, false)
    assert.equal(busy.audioCalls.length, 1, 'No automatic resubmission after a busy response')
    assert.equal(busy.calls.filter(path => path.endsWith('/turn')).length, 0)
    console.log('PASS full audio queue stops capture without retrying or repeating the user request')
  } finally { busy.cleanup() }
} finally {
  delete globalThis[key]
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
}
