import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceUiContext } from '@hr/shared'
import { api, ApiError } from '@/lib/api'
import type { VoiceConfirmation, VoiceResult, VoiceState } from './useVoiceCopilot'
import { localAudioAllowed, localVoiceFetch, playLocalReply, startLocalConversation, type LocalVoiceRecording } from './localVoiceAudio'

export interface LocalVoiceTiming {
  recordingMs: number; audioMs: number; conversionMs: number
  sttMs: number; copilotMs: number; ttsFirstAudioMs: number; totalMs: number
  inferenceMs?: number
}
export function useLocalVoiceCopilot({ lang, context, onResult }: {
  lang: 'ar' | 'en'; context: VoiceUiContext; onResult: (result: VoiceResult) => void | Promise<void>
}) {
  const [state, setState] = useState<VoiceState>('idle'), [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState(''), [armed, setArmed] = useState(false)
  const [timing, setTiming] = useState<LocalVoiceTiming | null>(null)
  const [phase, setPhase] = useState<'transcribing' | 'copilot' | 'synthesizing' | null>(null)
  const [canReplayResponse, setCanReplayResponse] = useState(false)
  const session = useRef<string | null>(null), confirmation = useRef<VoiceConfirmation | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null), audioUrl = useRef<string | null>(null)
  const microphone = useRef<Awaited<ReturnType<typeof startLocalConversation>> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const current = useRef({ lang, context, onResult })
  useEffect(() => { current.current = { lang, context, onResult } }, [lang, context, onResult])
  const mode = useRef<VoiceState>('idle'), generation = useRef(0)
  const setMode = useCallback((value: VoiceState) => { mode.current = value; setState(value) }, [])
  const silence = useCallback(() => {
    if (audio.current) audio.current.onended = null
    audio.current?.pause()
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    audioUrl.current = null
    setCanReplayResponse(false)
  }, [])
  const resumeListening = useCallback(() => {
    if (!session.current || !microphone.current) return
    setPhase(null)
    setMode(confirmation.current ? 'awaitingConfirmation' : 'listening')
    microphone.current.listen()
  }, [setMode])
  const stop = useCallback(() => {
    generation.current++; controller.current?.abort(); controller.current = null
    microphone.current?.stop(); microphone.current = null; silence()
    const id = session.current; session.current = null; confirmation.current = null; setArmed(false)
    if (id) void api.post(`/voice/session/${id}/close`).catch(() => undefined)
    setTranscript(''); setPhase(null); setMode('idle')
  }, [setMode, silence])
  const speak = useCallback(async (text: string) => {
    const id = session.current, node = audio.current
    if (!id) return 0
    if (!text.trim()) { resumeListening(); return 0 }
    if (!node) throw new ApiError(0, 'localVoicePlaybackFailed', 'Local reply player is unavailable')
    const turn = generation.current, started = performance.now()
    microphone.current?.pause()
    setPhase('synthesizing')
    const response = await localVoiceFetch(`/voice/local/session/${id}/tts`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 500), lang: current.current.lang }), signal: controller.current?.signal })
    const blob = await response.blob()
    if (turn !== generation.current) return 0
    silence(); audioUrl.current = URL.createObjectURL(blob); node.srcObject = null; node.src = audioUrl.current
    node.onended = () => { if (turn === generation.current) { silence(); resumeListening() } }
    try {
      await playLocalReply(node)
    } catch (caught) {
      if (turn !== generation.current) return 0
      setCanReplayResponse(true)
      throw caught
    }
    if (turn !== generation.current) return 0
    setPhase(null); setMode('speaking')
    return performance.now() - started
  }, [resumeListening, setMode, silence])
  const replayResponse = useCallback(async () => {
    // Reuse only the in-memory reply audio. Never repeat STT, classification,
    // review or a confirmed action when the user retries browser playback.
    const node = audio.current, turn = generation.current
    if (!node || !audioUrl.current || !canReplayResponse) return
    setError(null)
    try {
      await playLocalReply(node) // Called directly from the user's click.
      if (turn !== generation.current) return
      setCanReplayResponse(false); setMode('speaking')
    } catch (caught) {
      if (turn === generation.current) setError(caught instanceof ApiError ? caught.code : 'localVoicePlaybackFailed')
    }
  }, [canReplayResponse, setMode])
  const handleTurn = useCallback(async (recording: LocalVoiceRecording) => {
    if (!session.current || !['listening', 'userSpeaking', 'awaitingConfirmation'].includes(mode.current)) return
    microphone.current?.pause()
    const started = performance.now()
    const turn = generation.current, id = session.current
    controller.current = new AbortController(); setError(null); setTranscript(''); setTiming(null); setPhase('transcribing'); setMode('processing')
    try {
      const transcriptionStarted = performance.now()
      const response = await localVoiceFetch(`/voice/local/session/${id}/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: recording.wav, signal: controller.current.signal })
      const stt = await response.json() as { transcript: string; profile?: { inferenceMs: number } }
      const sttMs = performance.now() - transcriptionStarted
      if (turn !== generation.current) return
      setTranscript(stt.transcript)
      setPhase('copilot')
      const processing = performance.now(), chosen = confirmation.current
      // Transcripts use the existing trusted turn/review/confirm pipeline. Audio
      // code never creates plans, selects employee ids or executes HR operations.
      const result = chosen
        ? await api.post<VoiceResult>(`/voice/session/${id}/confirm`, { confirmationId: chosen.id, transcript: stt.transcript }, { signal: controller.current.signal })
        : await api.post<VoiceResult>(`/voice/session/${id}/turn`, { turnId: crypto.randomUUID(), transcript: stt.transcript,
          lang: current.current.lang, context: current.current.context }, { signal: controller.current.signal })
      const copilotMs = performance.now() - processing
      if (turn !== generation.current) return
      await current.current.onResult(result); confirmation.current = null; setArmed(false)
      const sentence = current.current.lang === 'ar' ? result.answer.sentence.ar : result.answer.sentence.en
      const text = result.answer.result.kind === 'none' && !result.answer.refusal ? sentence || result.spokenText : result.spokenText
      const ttsFirstAudioMs = await speak(text)
      if (turn === generation.current) setTiming({ ...recording.timing, sttMs, copilotMs, ttsFirstAudioMs,
        ...(stt.profile ? { inferenceMs: stt.profile.inferenceMs } : {}), totalMs: performance.now() - started })
    } catch (caught) {
      if (turn !== generation.current || controller.current?.signal.aborted) return
      if (caught instanceof ApiError && (caught.status === 401 || ['voiceSessionNotFound', 'voiceSessionExpired', 'localVoiceBusy'].includes(caught.code))) {
        stop(); setError(caught.code); setMode('error'); return
      }
      setPhase(null)
      setError(caught instanceof ApiError ? caught.code : 'localVoiceUnavailable')
      // Keep the mic paused while prepared reply audio awaits a playback click.
      if (audioUrl.current) setMode(confirmation.current ? 'awaitingConfirmation' : 'listening')
      else resumeListening()
    }
  }, [resumeListening, setMode, speak, stop])
  const start = useCallback(async () => {
    if (mode.current !== 'idle' && mode.current !== 'error') return
    if (!localAudioAllowed() || !navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext) {
      setError('localVoiceUnavailable'); setMode('error'); return
    }
    const turn = ++generation.current
    setError(null); setTranscript(''); setTiming(null); setPhase(null); setMode('connecting')
    try {
      // The user's one microphone click authorizes this local capture session.
      // Capture starts paused and sends nothing until the owned API session exists.
      const input = await startLocalConversation({
        onSpeechStart: () => {
          if (turn === generation.current && ['listening', 'awaitingConfirmation'].includes(mode.current)) setMode('userSpeaking')
        },
        onSpeechEnd: recording => {
          if (turn !== generation.current) return
          if (recording) return handleTurn(recording)
          else resumeListening()
        },
        onError: caught => {
          if (turn !== generation.current) return
          stop(); setError(caught instanceof ApiError ? caught.code : caught instanceof DOMException && caught.name === 'NotAllowedError' ? 'voiceMicrophoneDenied' : 'localVoiceUnavailable')
          setMode('error')
        },
      })
      if (turn !== generation.current) { input.stop(); return }
      microphone.current = input
      const result = await api.post<{ sessionId: string }>('/voice/local/session')
      if (turn !== generation.current) { void api.post(`/voice/session/${result.sessionId}/close`).catch(() => undefined); return }
      session.current = result.sessionId; resumeListening()
    } catch (caught) {
      if (turn !== generation.current) return
      stop()
      setError(caught instanceof ApiError ? caught.code : caught instanceof DOMException && caught.name === 'NotAllowedError' ? 'voiceMicrophoneDenied' : 'localVoiceUnavailable')
      setMode('error')
    }
  }, [handleTurn, resumeListening, setMode, stop])
  const armConfirmation = useCallback(async (chosen: VoiceConfirmation) => {
    const id = session.current, turn = generation.current
    if (!id || !['listening', 'speaking', 'awaitingConfirmation'].includes(mode.current)) return
    microphone.current?.pause(); silence()
    try {
      await api.post(`/voice/session/${id}/review`, { confirmationId: chosen.id })
      if (turn !== generation.current || id !== session.current) return
      confirmation.current = chosen; setArmed(true); controller.current = new AbortController()
      await speak(chosen.phrase)
    } catch (caught) {
      if (turn !== generation.current) return
      setPhase(null); setError(caught instanceof ApiError ? caught.code : 'localVoicePlaybackFailed')
      if (audioUrl.current) setMode(confirmation.current ? 'awaitingConfirmation' : 'listening')
      else resumeListening()
    }
  }, [resumeListening, setMode, silence, speak])
  const dismissChoice = useCallback(async () => {
    confirmation.current = null; setArmed(false); silence()
    if (session.current) await api.post(`/voice/session/${session.current}/choice/cancel`)
    resumeListening()
  }, [resumeListening, silence])
  useEffect(() => {
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide); stop() }
  }, [stop])
  return { state, error, transcript, start, stop, armConfirmation, dismissChoice, cancelConfirmation: dismissChoice, timing,
    phase, canReplayResponse, replayResponse,
    setAudioNode: useCallback((node: HTMLAudioElement | null) => { audio.current = node }, []),
    isConfirmationArmed: armed }
}
