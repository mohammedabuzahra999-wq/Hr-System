import { ApiError } from '@/lib/api'
import { LocalVoiceVad } from './localVoiceVad'

export function localAudioAllowed() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return false
  const base = new URL(import.meta.env.VITE_API_URL ?? '/api', window.location.origin)
  return ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
}
/** Local provider never sends audio to an external URL, even if VITE_API_URL is changed. */
export async function localVoiceFetch(path: string, init: RequestInit) {
  if (!localAudioAllowed()) throw new ApiError(503, 'localVoiceUnavailable', 'localVoiceUnavailable')
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}${path}`, { ...init, credentials: 'include', redirect: 'error' })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(response.status, body?.error ?? 'localVoiceUnavailable', 'localVoiceUnavailable')
  }
  return response
}

/** Playback permission is separate from STT/TTS service availability. */
export async function playLocalReply(node: HTMLAudioElement) {
  try {
    await node.play()
  } catch (error) {
    throw new ApiError(0, error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'localVoicePlaybackBlocked' : 'localVoicePlaybackFailed', 'Local reply playback failed')
  }
}

export function pcmWav(samples: Float32Array, rate: number): Blob {
  const length = Math.min(480_000, Math.floor(samples.length * 16000 / rate))
  const buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer)
  const text = (offset: number, value: string) => [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, length * 2, true)
  // Average source samples when downsampling; never label native-rate data as 16 kHz.
  for (let i = 0; i < length; i++) {
    const from = Math.floor(i * rate / 16000), to = Math.max(from + 1, Math.floor((i + 1) * rate / 16000))
    let sum = 0
    for (let j = from; j < to; j++) sum += samples[j] ?? 0
    const sample = Math.max(-1, Math.min(1, sum / (to - from)))
    view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export interface LocalVoiceRecording {
  wav: Blob
  timing: { recordingMs: number; audioMs: number; conversionMs: number }
}

/** One microphone per session. Only completed speech turns leave browser memory. */
export async function startLocalConversation(callbacks: {
  onSpeechStart: () => void
  onSpeechEnd: (recording: LocalVoiceRecording | null) => void
  onError: (error: unknown) => void
}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  let context: AudioContext | null = null
  const module = URL.createObjectURL(new Blob([`
    class LocalRecorder extends AudioWorkletProcessor {
      constructor() { super(); this.buffer = new Float32Array(1024); this.offset = 0 }
      process(inputs) {
        const input = inputs[0]?.[0]
        if (input) for (const sample of input) {
          this.buffer[this.offset++] = sample
          if (this.offset === this.buffer.length) {
            this.port.postMessage(this.buffer.slice()); this.offset = 0
          }
        }
        return true
      }
    }
    registerProcessor('local-voice-recorder', LocalRecorder)
  `], { type: 'text/javascript' }))
  try {
    context = new AudioContext()
    await context.audioWorklet.addModule(module); await context.resume()
    const recordingContext = context
    const node = new AudioWorkletNode(context, 'local-voice-recorder'), source = context.createMediaStreamSource(stream)
    const silent = context.createGain(); silent.gain.value = 0
    source.connect(node); node.connect(silent); silent.connect(context.destination)
    const vad = new LocalVoiceVad(recordingContext.sampleRate)
    let listening = false, ended = false
    let inputTimer: ReturnType<typeof setTimeout> | null = null
    let speechTimer: ReturnType<typeof setTimeout> | null = null
    const tracks = stream.getTracks()
    const pause = () => {
      listening = false; vad.reset(); tracks.forEach(track => { track.enabled = false })
      if (inputTimer !== null) clearTimeout(inputTimer)
      if (speechTimer !== null) clearTimeout(speechTimer)
      inputTimer = null; speechTimer = null
    }
    const watchInput = () => {
      if (inputTimer !== null) clearTimeout(inputTimer)
      inputTimer = setTimeout(() => {
        if (ended || !listening) return
        pause()
        callbacks.onError(new ApiError(0, 'localVoiceCaptureStalled', 'Microphone frames stopped'))
      }, 2500)
    }
    pause()
    const complete = (update: ReturnType<LocalVoiceVad['finish']>) => {
      if (!update.ended) return
      if (speechTimer !== null) clearTimeout(speechTimer)
      speechTimer = null
      if (!update.samples) { callbacks.onSpeechEnd(null); return }
      pause() // No second turn or speaker echo while STT/Copilot/TTS runs.
      const conversionStarted = performance.now()
      const wav = pcmWav(update.samples, recordingContext.sampleRate)
      callbacks.onSpeechEnd({ wav, timing: {
        recordingMs: update.recordingMs, audioMs: update.samples.length / recordingContext.sampleRate * 1000,
        conversionMs: performance.now() - conversionStarted,
      } })
    }
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (ended || !listening) return
      try {
        watchInput()
        const update = vad.push(event.data)
        if (update.started) {
          speechTimer = setTimeout(() => {
            if (ended || !listening) return
            try { complete(vad.finish()) } catch (error) { pause(); callbacks.onError(error) }
          }, 30_000)
          callbacks.onSpeechStart()
        }
        complete(update)
      } catch (error) { pause(); callbacks.onError(error) }
    }
    tracks.forEach(track => { track.onended = () => { if (!ended) { pause(); callbacks.onError(new ApiError(0, 'localVoiceCaptureStalled', 'Microphone disconnected')) } } })
    return {
      listen: () => { if (!ended) { pause(); tracks.forEach(track => { track.enabled = true }); listening = true; watchInput() } },
      pause,
      stop: () => {
        if (ended) return
        ended = true; pause(); node.port.onmessage = null; source.disconnect(); node.disconnect(); silent.disconnect()
        tracks.forEach(track => { track.onended = null; track.stop() }); void recordingContext.close()
      },
    }
  } catch (error) {
    stream.getTracks().forEach(track => track.stop()); void context?.close(); throw error
  } finally { URL.revokeObjectURL(module) }
}
