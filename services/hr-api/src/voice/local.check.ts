import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import { Hono } from 'hono'
import { env } from '../env.js'
import { validLocalWav } from './local.js'
import { actionProposalSchema, type SessionUser } from '@hr/shared'

function isolated(file: URL, overrides: Record<string, string>) {
  let code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
  code = code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote: string, specifier: string) => {
    const url = overrides[specifier] ? 'data:text/javascript;base64,' + Buffer.from(overrides[specifier]!).toString('base64')
      : specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier)
    return `from ${JSON.stringify(url)}`
  })
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
const key = Symbol.for('hr.local-voice.check'), slots = globalThis as unknown as Record<symbol, unknown>
const state = { provider: 'local', transport: 'ephemeral', ready: true, key: false, audio: 0, calls: 0, secrets: 0, hr: 0, executions: 0,
  answer: null as unknown,
  actor: { id: randomUUID(), role: 'employee' } as SessionUser }
slots[key] = state
const s = "globalThis[Symbol.for('hr.local-voice.check')]"
const environment = { VOICE_ENABLED: true, VOICE_SHARE_AUDIO: true, VOICE_DEV_MOCK: true,
  OPENAI_REALTIME_MODEL: env.OPENAI_REALTIME_MODEL }
const original = globalThis.fetch
globalThis.fetch = async () => { throw Error('Cloud/network forbidden in unit checks') }
try {
  const route = await isolated(new URL('../routes/voice.ts', import.meta.url), {
    '../env.js': `const base=${JSON.stringify(environment)};export const env=new Proxy(base,{get:(t,k)=>k==='VOICE_PROVIDER'?${s}.provider:k==='VOICE_REALTIME_TRANSPORT'?${s}.transport:k==='OPENAI_API_KEY'?(${s}.key?'synthetic-not-a-key':undefined):t[k]});export const isProduction=false`,
    '../middleware.js': `export const requireAuth=async(c,next)=>{c.set('user',${s}.actor);await next()};export const validateBody=schema=>async(c,next)=>{const p=schema.safeParse(await c.req.json());if(!p.success)return c.json({error:'invalid'},422);c.set('body',p.data);await next()}`,
    '../copilot/audit.js': 'export const auditCopilot=async()=>{}',
    '../internalApi.js': `export const callInternal=async(request)=>{${s}.hr++;if(!${s}.answer)throw Error('Audio endpoints must not invoke HR services');if(request.path==='/copilot/do')${s}.executions++;return {ok:true,data:{answer:${s}.answer},serverTiming:null}}`,
    '../voice/local.js': `export const MAX_LOCAL_AUDIO_BYTES=960044;export class LocalVoiceError extends Error{};
      export const localOllamaReachable=async()=>true;export const localVoiceHealth=async()=>({stt:{ready:${s}.ready},tts:{ready:${s}.ready}});
      export const transcribeLocalWav=async()=>{${s}.audio++;return {transcript:'synthetic test',sttMs:1}};
      export const synthesizeLocalSpeech=async()=>{${s}.audio++;return {bytes:new ArrayBuffer(44),ttsMs:1}}`,
    '../voice/realtime.js': `export class VoiceRealtimeError extends Error{};
      export const createRealtimeCall=async()=>{${s}.calls++;return 'v=0 synthetic'};
      export const createRealtimeClientSecret=async()=>{${s}.secrets++;return {value:'synthetic-ephemeral',expiresAt:2000000000}}`,
  })
  const app = new Hono().route('/voice', route.voiceRoutes)
  const post = (path: string, body = '{}', type = 'application/json') => app.request('/voice' + path,
    { method: 'POST', headers: { 'Content-Type': type }, body })
  const config = await (await app.request('/voice/config')).json() as { provider: string; ready: boolean }
  assert.equal(config.provider, 'local'); assert.ok(config.ready)
  assert.equal((await post('/prepare')).status, 503)
  assert.equal((await post('/connect', 'v=0\r\n', 'application/sdp')).status, 503)
  assert.equal(state.calls + state.secrets, 0, 'Local must never fall back to OpenAI')
  const session = await (await post('/local/session')).json() as { sessionId: string }
  assert.ok(session.sessionId)
  const initial = state.actor
  state.actor = { ...initial, id: randomUUID() }
  assert.equal((await post(`/local/session/${session.sessionId}/stt`, 'not audio', 'audio/wav')).status, 404)
  assert.equal(state.audio, 0, 'Session ownership checked before STT')
  state.actor = initial
  assert.equal((await post(`/local/session/${session.sessionId}/stt`, '{}')).status, 415)
  assert.equal((await post(`/local/session/${session.sessionId}/tts`, JSON.stringify({ text: 'Synthetic', lang: 'ar' }))).status, 200)
  assert.equal(state.hr, 0, 'STT/TTS have no HR authority')
  state.ready = false
  assert.equal((await post('/local/session')).status, 503)
  assert.equal(state.calls + state.secrets, 0, 'Unavailable local engines must not select cloud')
  state.provider = 'openai'
  assert.equal((await post('/prepare')).status, 503, 'OpenAI still requires its key')
  state.key = true
  assert.equal((await post('/prepare')).status, 200)
  assert.equal((await post('/connect', 'v=0\r\n', 'application/sdp')).status, 200)
  assert.equal(state.secrets, 2)
  state.transport = 'unified'
  assert.equal((await post('/prepare')).status, 409)
  assert.equal((await post('/connect', 'v=0\r\n', 'application/sdp')).status, 200)
  assert.equal(state.calls, 1, 'OpenAI unified SDP exchange preserved')
  assert.equal((await post('/local/session')).status, 503)
  console.log('PASS local provider selection, no-key operation, no cloud fallback, ownership, audio-only authority; OpenAI ephemeral/unified prepare/connect preserved (offline mocks)')
  const wav = Buffer.alloc(44 + 6400)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(6400, 40)
  assert.ok(validLocalWav(wav)); assert.ok(!validLocalWav(wav.subarray(0, 50)))
  wav.writeUInt32LE(48000, 24); assert.ok(!validLocalWav(wav))
  console.log('PASS PCM WAV constraints and malformed/truncated/native-rate rejection; zero real network/HR calls')
  state.provider = 'local'; state.ready = true
  const guarded = await (await post('/local/session')).json() as { sessionId: string }
  const params = actionProposalSchema.shape.params.parse(Object.fromEntries(Object.keys(actionProposalSchema.shape.params.shape)
    .map(name => [name, name === 'action' ? 'checkIn' : null])))
  const label = { en: 'Synthetic action', ar: 'Synthetic action' }
  state.answer = { intent: 'doAction', sentence: label, result: { kind: 'confirm', proposal: {
    action: 'checkIn', summary: label, details: [], destructive: false, caution: null, params,
  } }, periodLabel: null, refusal: null, sharingOff: false }
  const proposed = await post(`/session/${guarded.sessionId}/turn`, JSON.stringify({ turnId: randomUUID(), transcript: 'Record my check-in now', lang: 'en' }))
  assert.equal(proposed.status, 200)
  const confirmation = (await proposed.json() as { confirmations: { id: string; phrase: string }[] }).confirmations[0]!
  assert.equal(state.executions, 0, 'Ordinary local transcript only proposes a sensitive action')
  const confirm = (transcript: string) => post(`/session/${guarded.sessionId}/confirm`, JSON.stringify({ confirmationId: confirmation.id, transcript }))
  assert.equal((await confirm(confirmation.phrase)).status, 409, 'Even exact speech cannot bypass visible review')
  await post(`/session/${guarded.sessionId}/review`, JSON.stringify({ confirmationId: confirmation.id }))
  assert.equal((await confirm('yes')).status, 422, 'Reviewed action still requires its exact phrase')
  assert.equal(state.executions, 0)
  assert.equal((await confirm(confirmation.phrase)).status, 200)
  assert.equal(state.executions, 1, 'Reviewed exact phrase reaches ONLY the mocked existing action endpoint')
  console.log('PASS local-session action proposal → review → exact confirmation; no real HR write or model call')
} finally { globalThis.fetch = original; delete slots[key] }
