import { useCallback, useEffect, useState } from 'react'
import type { VoiceUiContext } from '@hr/shared'
import { api } from '@/lib/api'
import { useVoiceCopilot, type VoiceResult } from './useVoiceCopilot'
import { useLocalVoiceCopilot } from './useLocalVoiceCopilot'

export interface VoiceConfiguration {
  provider: 'local' | 'openai'; enabled: boolean; ready: boolean; ollamaReachable?: boolean
  local?: { stt: { engine: string; model: string; ready: boolean }; tts: { engine: string; voices: { ar: string; en: string }; ready: boolean } }
}
/** Audio provider selection only. The trusted backend turn pipeline is shared. */
export function useVoiceProvider(options: { lang: 'ar' | 'en'; context: VoiceUiContext; onResult: (result: VoiceResult) => void | Promise<void> }) {
  const [configuration, setConfiguration] = useState<VoiceConfiguration | null>(null)
  const [configError, setConfigError] = useState(false)
  const refresh = useCallback(async () => {
    try { setConfiguration(await api.get<VoiceConfiguration>('/voice/config')); setConfigError(false) }
    catch { setConfigError(true) }
  }, [])
  useEffect(() => {
    let active = true
    void api.get<VoiceConfiguration>('/voice/config').then(value => {
      if (active) { setConfiguration(value); setConfigError(false) }
    }).catch(() => { if (active) setConfigError(true) })
    return () => { active = false }
  }, [])
  // Both hooks have stable React order. Only the explicitly selected OpenAI
  // provider may warm/create Realtime credentials or a WebRTC connection.
  const openai = useVoiceCopilot({ ...options, enabled: configuration?.provider === 'openai' })
  const local = useLocalVoiceCopilot(options)
  const selected = openai.isDevMock || configuration?.provider === 'openai' ? openai : local
  return { ...selected, provider: configuration?.provider, configuration, refresh, loading: !configuration && !configError,
    state: configError ? 'error' as const : selected.state,
    error: configError ? 'localVoiceUnavailable' : selected.error,
    warmConnection: configuration?.provider === 'openai' ? openai.warmConnection : () => undefined,
    isDevMock: openai.isDevMock,
    startDevMock: async () => { local.stop(); await openai.startDevMock() },
    submitDevMockFinal: openai.submitDevMockFinal,
    start: configuration ? selected.start : async () => { await refresh() },
    timing: configuration?.provider === 'local' && !openai.isDevMock ? local.timing : null,
    localPhase: configuration?.provider === 'local' && !openai.isDevMock ? local.phase : null,
    canReplayResponse: configuration?.provider === 'local' && !openai.isDevMock && local.canReplayResponse,
    replayResponse: local.replayResponse,
    cancelConfirmation: configuration?.provider === 'local' && !openai.isDevMock ? local.cancelConfirmation : async () => undefined,
  }
}
