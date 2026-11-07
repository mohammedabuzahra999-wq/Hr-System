import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { env } from '../env.js'
import { LocalVoiceBusyError, LocalVoiceQueue } from './localQueue.js'

const audioQueue = new LocalVoiceQueue()

export const MAX_LOCAL_AUDIO_BYTES = 960_044 // 30 seconds, mono PCM16 at 16 kHz
export class LocalVoiceError extends Error {
  constructor(readonly code: 'localVoiceUnavailable' | 'localVoiceBusy' | 'localVoiceNoSpeech' | 'localVoiceInvalidAudio') { super(code) }
}
export function validLocalWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_LOCAL_AUDIO_BYTES) return false
  const b = Buffer.from(bytes)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE'
    || b.readUInt32LE(4) + 8 !== b.length) return false
  let format = false
  for (let offset = 12; offset + 8 <= b.length;) {
    const id = b.toString('ascii', offset, offset + 4), size = b.readUInt32LE(offset + 4)
    if (offset + 8 + size > b.length) return false
    if (id === 'fmt ') {
      if (size < 16) return false
      format = b.readUInt16LE(offset + 8) === 1 && b.readUInt16LE(offset + 10) === 1
        && b.readUInt32LE(offset + 12) === 16000 && b.readUInt32LE(offset + 16) === 32000
        && b.readUInt16LE(offset + 20) === 2 && b.readUInt16LE(offset + 22) === 16
    }
    if (id === 'data') return format && size >= 6400 && size % 2 === 0 && offset + 8 + size === b.length
    offset += 8 + size + size % 2
  }
  return false
}

function workerTokenPath() {
  // Locate the project in both src/voice and dist/services/hr-api/src/voice layouts.
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(directory, 'services', 'hr-api', 'scripts', 'startLocalVoice.mjs'))) return join(directory, '.local-voice', 'worker.token')
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new LocalVoiceError('localVoiceUnavailable')
}

/** Audio/text goes only to the validated loopback URL; redirects are forbidden. */
async function request(path: string, init: RequestInit = {}) {
  try {
    const token = (await readFile(workerTokenPath(), 'utf8')).trim()
    const response = await fetch(new URL(path, env.LOCAL_VOICE_URL), { ...init, redirect: 'error',
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(path === '/stt' ? 45_000 : path === '/health' ? 2500 : 15_000) })
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: string } | null
      if (['localVoiceBusy', 'localVoiceNoSpeech', 'localVoiceInvalidAudio'].includes(error?.error ?? '')) {
        throw new LocalVoiceError(error!.error as 'localVoiceBusy' | 'localVoiceNoSpeech' | 'localVoiceInvalidAudio')
      }
      throw new LocalVoiceError('localVoiceUnavailable')
    }
    return response
  } catch (error) {
    if (error instanceof LocalVoiceError) throw error
    throw new LocalVoiceError('localVoiceUnavailable')
  }
}
export interface LocalVoiceHealth {
  stt: { engine: string; model: string; ready: boolean }
  tts: { engine: string; voices: { ar: string; en: string }; ready: boolean }
  busy?: boolean
  operation?: 'stt' | 'tts' | null
  operationMs?: number
}
const healthSchema = z.object({
  stt: z.object({ engine: z.string().min(1).max(80), model: z.string().min(1).max(100), ready: z.boolean() }),
  tts: z.object({ engine: z.string().min(1).max(80), voices: z.object({ ar: z.string().min(1).max(100), en: z.string().min(1).max(100) }), ready: z.boolean() }),
  busy: z.boolean().optional(),
  operation: z.enum(['stt', 'tts']).nullable().optional(),
  operationMs: z.number().finite().nonnegative().optional(),
})
export async function localVoiceHealth(): Promise<LocalVoiceHealth> {
  try { return healthSchema.parse(await (await request('/health')).json()) } catch {
    return { stt: { engine: 'whisper.cpp', model: 'small-q5_1 multilingual', ready: false },
      tts: { engine: 'Piper', voices: { ar: 'ar_JO-kareem-low', en: 'en_US-lessac-low' }, ready: false } }
  }
}
async function admitted<T>(operation: () => Promise<T>) {
  try {
    return await audioQueue.run(operation, async () => Boolean((await localVoiceHealth()).busy))
  } catch (error) {
    if (error instanceof LocalVoiceBusyError) throw new LocalVoiceError('localVoiceBusy')
    throw error
  }
}
export async function transcribeLocalWav(bytes: Uint8Array) {
  if (!validLocalWav(bytes)) throw new LocalVoiceError('localVoiceInvalidAudio')
  return admitted(async () => {
    const response = await request('/stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Buffer.from(bytes) })
    const body = await response.json() as { transcript?: unknown; sttMs?: number; profile?: unknown }
    if (typeof body.transcript !== 'string' || body.transcript.trim().length < 2 || body.transcript.length > 500) throw new LocalVoiceError('localVoiceNoSpeech')
    const profile = z.object({
      audioMs: z.number().finite().nonnegative().max(30_000), inferenceMs: z.number().finite().nonnegative(),
      modelLoadMs: z.literal(0), processStartupMs: z.literal(0), queueMs: z.literal(0), threads: z.number().int().min(1).max(8),
    }).safeParse(body.profile)
    return { transcript: body.transcript, sttMs: body.sttMs ?? null, ...(profile.success ? { profile: profile.data } : {}) }
  })
}
export async function synthesizeLocalSpeech(text: string, lang: 'ar' | 'en') {
  return admitted(async () => {
    const response = await request('/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) })
    if (response.headers.get('content-type')?.split(';')[0] !== 'audio/wav') throw new LocalVoiceError('localVoiceUnavailable')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength < 44 || bytes.byteLength > 4_000_000) throw new LocalVoiceError('localVoiceUnavailable')
    return { bytes, ttsMs: Number(response.headers.get('x-tts-ms')) || 0 }
  })
}
export async function localOllamaReachable() {
  try {
    const url = new URL(env.OLLAMA_BASE_URL)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false
    const response = await fetch(new URL('/api/tags', url), { signal: AbortSignal.timeout(1500), redirect: 'error' })
    return response.ok
  } catch { return false }
}
