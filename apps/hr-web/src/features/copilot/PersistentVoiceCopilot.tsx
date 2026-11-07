import { AudioLines, Mic, MicOff, Sparkles, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { navigationPathFor, voiceUiContextSchema, type VoiceUiContext } from '@hr/shared'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfirmAction } from './ConfirmAction'
import { type VoiceResult, type VoiceState } from './useVoiceCopilot'
import { useVoiceProvider } from './useVoiceProvider'
import { applyScrollEffect } from './uiEffects'
import { useI18n } from '@/features/i18n/useI18n'

type ContextUpdate = Omit<VoiceUiContext, 'currentPage'>
type StampedContext = { pathname: string; value: ContextUpdate }

function stateLabel(state: VoiceState, t: ReturnType<typeof useI18n>['t']) {
  return t(`voice.status.${state}` as never)
}

function StateIcon({ state }: { state: VoiceState }) {
  if (state === 'processing' || state === 'connecting' || state === 'reconnecting' || state === 'executingAction') {
    return <Sparkles className="size-5 motion-safe:animate-pulse" aria-hidden="true" />
  }
  if (state === 'speaking') return <Volume2 className="size-5" aria-hidden="true" />
  if (state === 'userSpeaking') return <AudioLines className="size-5" aria-hidden="true" />
  if (state === 'error') return <MicOff className="size-5" aria-hidden="true" />
  return <Mic className="size-5" aria-hidden="true" />
}

function VoiceOrb({ state, label, stopLabel, onStop }: { state: VoiceState; label: string; stopLabel: string; onStop: () => void }) {
  return (
    <div className="voice-orb-stage" data-state={state} role="status" aria-label={label}>
      <span className="voice-orb-halo" aria-hidden="true" />
      <span className="voice-orb-ring" aria-hidden="true" />
      <span className="voice-orb-core" aria-hidden="true">
        <i className="voice-orb-liquid voice-orb-liquid-one" />
        <i className="voice-orb-liquid voice-orb-liquid-two" />
        <i className="voice-orb-liquid voice-orb-liquid-three" />
        <i className="voice-orb-shine" />
        <span className="voice-orb-wave">
          {[0, 1, 2, 3, 4, 5, 6].map((bar) => <i key={bar} style={{ animationDelay: `${bar * -90}ms` }} />)}
        </span>
      </span>
      <button type="button" className="voice-orb-stop" onClick={onStop} aria-label={stopLabel}>
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * The one live voice transport for every authenticated screen.
 *
 * It deliberately belongs to AppLayout rather than a page or chat panel. React
 * keeps the layout mounted when Outlet changes, so its WebRTC peer connection
 * and microphone remain owned by the same component while navigation occurs.
 * It still delegates every transcript to the existing voice route and Copilot;
 * this is a persistent surface, not another agent.
 */
export function PersistentVoiceCopilot() {
  const { lang, t } = useI18n()
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const [extraContext, setExtraContext] = useState<StampedContext | null>(null)
  const [lastResult, setLastResult] = useState<VoiceResult | null>(null)
  const [devTranscript, setDevTranscript] = useState('افتحلي الموظفين')

  const context = useMemo<VoiceUiContext>(() => {
    const period = new URLSearchParams(search).get('period')
    const candidate = {
      currentPage: `${pathname}${hash}`,
      ...(extraContext?.pathname === pathname ? extraContext.value : {}),
      ...(period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? { selectedPayrollPeriod: period } : {}),
    }
    /* Context is useful for references such as “his attendance”, never proof
       that the person may see a record. The server still makes that decision. */
    return voiceUiContextSchema.parse(candidate)
  }, [extraContext, hash, pathname, search])

  useEffect(() => {
    const updateContext = (event: Event) => {
      const parsed = voiceUiContextSchema.safeParse((event as CustomEvent<unknown>).detail)
      if (!parsed.success) return
      const { currentPage: _ignored, ...next } = parsed.data
      setExtraContext({ pathname, value: next })
    }
    window.addEventListener('hr:voice-context', updateContext)
    return () => window.removeEventListener('hr:voice-context', updateContext)
  }, [pathname])


  const onResult = useCallback(
    async (result: VoiceResult) => {
      setLastResult(result)
      const effect = result.answer.result.kind === 'done' ? result.answer.result.outcome.uiEffect : null
      if (effect?.kind === 'scroll') {
        await applyScrollEffect(effect)
        return
      }
      if (effect?.kind !== 'navigate') return
      const path = navigationPathFor(effect.page)
      // The server only emits ids from its role-filtered registry. This local
      // mapping is an extra guard: neither voice text nor an LLM can supply a URL.
      if (!path) return
      const [destination, fragment] = path.split('#', 2)
      const query = new URLSearchParams()
      if (effect.period) query.set('period', effect.period)
      if (effect.employeeNumber) query.set('open', effect.employeeNumber)
      if (effect.tab) query.set('tab', effect.tab)
      if (effect.query) query.set('q', effect.query)
      if (effect.role) query.set('role', effect.role)
      if (effect.stage) query.set('stage', effect.stage)
      const search = query.size ? `?${query.toString()}` : ''
      navigate({ pathname: destination, search, hash: fragment ? `#${fragment}` : '' })

      /*
       * React Router updates the location asynchronously relative to this
       * callback. Wait until the browser has committed that route before the
       * voice layer announces success; otherwise a spoken "opened" can be a
       * claim rather than an observed result.
       */
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const expected = `${destination}${search}${fragment ? `#${fragment}` : ''}`
      const actual = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (actual !== expected) throw new Error('navigation_failed')
    },
    [navigate],
  )

  const {
    state: voiceState,
    error: voiceError,
    transcript,
    setAudioNode,
    warmConnection,
    start,
    stop,
    armConfirmation,
    dismissChoice,
    startDevMock,
    submitDevMockFinal,
    isDevMock,
    isConfirmationArmed,
    provider, configuration, refresh, loading, timing, cancelConfirmation,
    localPhase, canReplayResponse, replayResponse,
  } = useVoiceProvider({ lang, context, onResult })
  const active = voiceState !== 'idle' && voiceState !== 'error'
  const awaiting = lastResult?.answer.result.kind === 'confirm' ? lastResult.confirmations?.[0] : null
  const choiceOptions = lastResult?.answer.result.kind === 'choose'
    ? lastResult.answer.result.choice.options.map((proposal, index) => ({ proposal, confirmation: lastResult.confirmations?.[index] })).filter((choice): choice is { proposal: typeof lastResult.answer.result.choice.options[number]; confirmation: NonNullable<typeof lastResult.confirmations>[number] } => Boolean(choice.confirmation))
    : []
  const showDetailCard = Boolean(voiceError || awaiting || choiceOptions.length || (lastResult && (!active || isDevMock)))
  const dismissResult = () => {
    if (choiceOptions.length) {
      void dismissChoice().catch(() => undefined)
    }
    setLastResult(null)
  }

  return (
    <>
      <audio ref={setAudioNode} className="hidden" />

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-[calc(1rem+env(safe-area-inset-right))] z-40 flex max-w-[min(24rem,calc(100vw-2rem))] flex-col items-end gap-2">
        {active && (
          <div className="flex flex-col items-center" aria-live="polite">
            <VoiceOrb state={voiceState} label={stateLabel(voiceState, t)} stopLabel={t('voice.stop')} onStop={stop} />
            {provider === 'local' && !isDevMock && (
              <p className="mt-1 rounded bg-surface px-2 py-1 text-xs text-muted" role="status">
                {canReplayResponse ? t('voice.local.playReply') : localPhase ? t(`voice.local.${localPhase}`) : stateLabel(voiceState, t)}
              </p>
            )}
            {canReplayResponse && (
              <button type="button" onClick={() => void replayResponse()} className="mt-2 rounded-lg bg-brand px-3 py-2 text-sm text-white">
                {t('voice.local.playReply')}
              </button>
            )}
            {transcript && (provider !== 'local' || isDevMock) && (
              <p className="mt-1 max-w-64 truncate rounded-full border border-white/30 bg-slate-950/75 px-3 py-1 text-center text-xs text-white shadow-lg backdrop-blur">
                {transcript}
              </p>
            )}
          </div>
        )}

        {showDetailCard && (
          <div className="w-full rounded-2xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur" role="region" aria-label={stateLabel(voiceState, t)}>
            <div className="flex items-start gap-2.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${active ? 'bg-brand text-white' : 'bg-paper text-muted'}`}>
                <StateIcon state={voiceState} />
              </span>
              <div className="min-w-0 flex-1">
                {voiceError && <p className="text-xs font-semibold text-ink">{stateLabel(voiceState, t)}</p>}
                {voiceError && <p role="alert" className="mt-1 text-xs text-danger">{t(`voice.error.${voiceError}` as never)}</p>}
                {lastResult && !awaiting && !choiceOptions.length && <p className="mt-1 text-xs leading-5 text-muted">{lastResult.spokenText}</p>}
              </div>
              {lastResult && (!active || isDevMock) && (
                <button type="button" onClick={dismissResult} aria-label={t('action.cancel')} className="text-muted hover:text-ink">
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {awaiting && lastResult?.answer.result.kind === 'confirm' && (
              <div className="mt-3">
                <ConfirmAction
                  proposal={lastResult.answer.result.proposal}
                  busy={isConfirmationArmed || voiceState === 'executingAction'}
                  confirmLabel={t('voice.review')}
                  confirmationHint={t('voice.confirmationHint', { phrase: awaiting.phrase })}
                  onConfirm={() => {
                    void armConfirmation(awaiting).catch(() => undefined)
                  }}
                  onCancel={() => { void cancelConfirmation(); setLastResult(null) }}
                />
              </div>
            )}

            {choiceOptions.length > 0 && (
              <div className="mt-3 space-y-2">
                {choiceOptions.map(({ proposal, confirmation }, index) => (
                  <ConfirmAction
                    key={confirmation.id}
                    proposal={proposal}
                    busy={isConfirmationArmed || voiceState === 'executingAction'}
                    confirmLabel={`${index + 1}. ${t('voice.review')}`}
                    confirmationHint={t('voice.confirmationHint', { phrase: confirmation.phrase })}
                    onConfirm={() => {
                      void armConfirmation(confirmation).catch(() => undefined)
                    }}
                    onCancel={dismissResult}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {import.meta.env.DEV && new URLSearchParams(search).get('voiceDebug') === '1' && (
          <details className="w-full rounded-xl border border-dashed border-line bg-surface/95 p-2 text-xs shadow-lg backdrop-blur">
            <summary className="cursor-pointer text-muted">{t('voice.local.diagnostics')}</summary>
            {configuration?.provider === 'local' && configuration.local && <div className="mb-2 text-muted">
              <p>STT: {configuration.local.stt.engine} / {configuration.local.stt.model} — {configuration.local.stt.ready ? 'ready' : 'not ready'}</p>
              <p>TTS: {configuration.local.tts.engine} / {configuration.local.tts.voices.ar}, {configuration.local.tts.voices.en} — {configuration.local.tts.ready ? 'ready' : 'not ready'}</p>
              <p>Ollama: {configuration.ollamaReachable ? 'reachable' : 'unreachable'}</p>
              <button type="button" onClick={() => void refresh()} className="underline">{t('voice.local.refresh')}</button>
              {transcript && <p className="mt-1 break-words">{transcript}</p>}
              {timing && <div>
                <p>Recording {timing.recordingMs.toFixed(0)} ms · audio {timing.audioMs.toFixed(0)} ms · conversion {timing.conversionMs.toFixed(1)} ms</p>
                <p>STT {timing.sttMs.toFixed(0)} ms · Copilot {timing.copilotMs.toFixed(0)} ms · TTS {timing.ttsFirstAudioMs.toFixed(0)} ms · response {timing.totalMs.toFixed(0)} ms</p>
              </div>}
            </div>}
            <p className="font-medium text-muted">Development voice mock (no OpenAI audio)</p>
            {isDevMock ? (
              <div className="mt-2 flex gap-1.5">
                <input value={devTranscript} onChange={(event) => setDevTranscript(event.target.value)} aria-label="Mock final transcript" className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1" />
                <button type="button" onClick={() => submitDevMockFinal(devTranscript)} disabled={!devTranscript.trim()} className="rounded bg-brand px-2 py-1 font-medium text-white disabled:opacity-50">Send</button>
              </div>
            ) : !active ? (
              <button type="button" onClick={() => void startDevMock()} className="mt-2 rounded border border-line px-2 py-1 font-medium text-ink">Start mock</button>
            ) : null}
          </details>
        )}

        {!active && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void start()}
            onPointerEnter={warmConnection}
            onPointerDown={warmConnection}
            onFocus={warmConnection}
            aria-label={t('voice.start')}
            aria-pressed={false}
            className="group relative grid size-14 place-items-center rounded-full border border-brand-700 bg-brand text-white shadow-lg transition duration-200 hover:scale-105 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-95"
          >
            <StateIcon state={voiceState} />
            <span className="sr-only">{t('voice.start')}</span>
          </button>
        )}
      </div>
    </>
  )
}
