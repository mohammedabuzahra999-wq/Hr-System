import { Mic, MicOff, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GapForm, type GapField } from './GapForm'
import { navigationPathFor, type ActionParams, type CopilotAnswer } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { ConfirmAction } from './ConfirmAction'
import { ReportView } from './ReportView'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'
import { useVoiceDictation } from './useVoiceDictation'
import { applyScrollEffect } from './uiEffects'

/**
 * Asking the HR system a question.
 *
 * Open to every role, because what differs between them is not whether they may
 * ask but which questions exist — and the suggestion chips are fetched from the
 * server rather than listed here, so a role never sees an example of something
 * it would then be refused for asking.
 *
 * A refusal is written as a sentence about scope, not as an error. "Your role
 * does not cover that" is a fact about the system; "something went wrong"
 * implies a fault and invites retrying, which will not help.
 */

/** The request has no progress events, so do not guess its server-side stage. */
function Thinking() {
  const { t } = useI18n()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 5000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="flex items-center gap-2.5 py-1">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full border-2 border-line border-t-brand motion-safe:animate-spin"
      />
      <div>
        <p className="text-sm text-ink">{t('copilot.thinking')}</p>
        {slow && <p className="text-xs text-muted">{t('copilot.slow')}</p>}
      </div>
    </div>
  )
}

const TONE: Record<string, string> = {
  good: 'bg-success',
  warning: 'bg-warning',
  bad: 'bg-danger',
  neutral: 'bg-muted',
}

/**
 * A browser-only transcript entry.
 *
 * It deliberately lives in component state rather than localStorage or the
 * database: answers can contain HR data and a conversation should disappear
 * when this assistant surface is closed, not become another data store.
 */
interface ConversationTurn {
  id: string
  question: string
  answer: CopilotAnswer | null
  error: string | null
}

export function CopilotPanel({
  onClose,
  floating = false,
  initialQuestion,
  variant = 'general',
  /**
   * Rendered as a page rather than as a card.
   *
   * Drops the border, the shadow and the close button — a page has no corner
   * to sit in and nothing to be dismissed back to — and gives the answer area
   * the height the screen can spare.
   */
  fullPage = false,
}: {
  onClose: () => void
  floating?: boolean
  /** A page can prepare a safe, read-only question for the assistant. */
  initialQuestion?: string
  /** A focused entry point can give the same secure assistant a clear identity. */
  variant?: 'general' | 'payroll'
  fullPage?: boolean
}) {
  const { t, loc, dir, lang, setLang } = useI18n()
  const { logout } = useAuth()
  /**
   * Where the user is, sent with every question.
   *
   * "Explain this page" cannot be answered without it, and it lets the
   * suggestions be about the screen in front of them rather than a generic list.
   */
  const { pathname, hash } = useLocation()
  const currentPath = `${pathname}${hash}`
  const navigate = useNavigate()
  const payrollMode = variant === 'payroll'
  const [question, setQuestion] = useState(initialQuestion ?? '')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ConversationTurn[]>([])
  /**
   * The boxes the server asked for, and what it already knows.
   *
   * Held with the action it belongs to, because submitting them does not send a
   * sentence — it names the instruction outright, which is why filling a form
   * needs no classification and cannot be misread.
   */
  const [gap, setGap] = useState<{
    action: string
    fields: GapField[]
    values: Record<string, string>
    /** Field name to the approved description a pre-filled value was taken from. */
    suggested: Record<string, string>
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Move the visible turn above the next one, keeping the newest six turns. */
  function archiveCurrentTurn() {
    if (!asked) return
    const turn: ConversationTurn = {
      id: `${Date.now()}-${asked}`,
      question: asked,
      answer,
      error,
    }
    setHistory((turns) => [...turns, turn].slice(-6))
  }

  const {
    listening: dictating,
    interim: dictationPreview,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
  } = useVoiceDictation({
    lang,
    onTranscript: (text) => {
      setQuestion((current) => `${current.trimEnd()}${current.trim() ? ' ' : ''}${text}`)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    },
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [pathname, hash])

  /** Apply an approved, browser-side outcome from any chat response. */
  async function applyUiEffect(nextAnswer: CopilotAnswer) {
    const effect = nextAnswer.result.kind === 'done' ? nextAnswer.result.outcome.uiEffect : null
    if (effect?.kind === 'setLanguage') {
      setLang(effect.language)
      return
    }
    if (effect?.kind === 'signedOut') {
      await logout()
      return
    }
    if (effect?.kind === 'scroll') {
      await applyScrollEffect(effect)
      return
    }
    if (effect?.kind !== 'navigate') return

    const path = navigationPathFor(effect.page)
    if (!path) return
    const [destination, fragment] = path.split('#', 2)
    const query = new URLSearchParams()
    if (effect.period) query.set('period', effect.period)
    if (effect.employeeNumber) query.set('open', effect.employeeNumber)
    if (effect.tab) query.set('tab', effect.tab)
    if (effect.query) query.set('q', effect.query)
    if (effect.role) query.set('role', effect.role)
    if (effect.stage) query.set('stage', effect.stage)
    navigate({ pathname: destination, search: query.size ? `?${query.toString()}` : '', hash: fragment ? `#${fragment}` : '' })
    onClose()
  }

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    archiveCurrentTurn()
    setBusy(true)
    setError(null)
    setAsked(trimmed)
    // A chat input is ready for the next thought as soon as this one is sent.
    setQuestion('')
    setAnswer(null)
    setGap(null)
    try {
      const d = await api.post<{
        answer: CopilotAnswer
        error?: string
        action?: string | null
        detail?: string | null
        missing?: { en: string; ar: string } | null
        optional?: boolean
        continuing?: boolean
        form?: GapField[]
        values?: Record<string, string>
        suggested?: Record<string, string>
      }>('/copilot/ask', {
        question: trimmed,
        path: currentPath,
        lang,
        // Advisory context improves follow-ups; server-side RBAC remains the
        // sole authority for every record and action.
        context: { currentPage: currentPath },
      })
      /*
        A refusal is only useful with the specifics attached: which names
        matched, or which piece was missing. Without them the person is left
        guessing at a phrasing, which is how an assistant earns a reputation
        for being temperamental.
      */
      /*
       * Boxes instead of a sentence about boxes.
       *
       * When the server sends fields, the wording that named the missing detail
       * is not shown: the labels say the same thing, in the place where it is
       * answered. Reading "I still need the job title" and then hunting for
       * where to put it was the complaint that produced this.
       */
      if (d.form?.length && d.action) {
        setGap({ action: d.action, fields: d.form, values: d.values ?? {}, suggested: d.suggested ?? {} })
        return
      }
      if (d.error) {
        setError(
          d.missing
            ? /*
                Two wordings, because there are two situations. "I still need X"
                is true of a leave request with no dates and false of a job
                description with no seniority — that one is worth asking about
                and not worth blocking on, and saying "I need it" would be the
                assistant misdescribing its own rules.
              */
              t(
                d.optional
                  ? 'copilot.err.action.wants'
                  : /*
                      "Almost" only means something to somebody who was already
                      part-way. On a first message it reads as a correction of a
                      sentence that was never wrong — they asked for a job
                      description and a job description needs a role, which is a
                      question, not a near miss.
                    */
                    d.continuing
                    ? 'copilot.err.action.needs'
                    : 'copilot.err.action.asks',
                { what: loc(d.missing) },
              )
            : [t(`copilot.err.${d.error}` as never), d.detail].filter(Boolean).join(' '),
        )
      }
      else {
        setAnswer(d.answer)
        await applyUiEffect(d.answer)
      }
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * The boxes, filled in and sent.
   *
   * Goes to `/copilot/fill`, which names the action outright instead of
   * describing it, so there is no classification anywhere in the round trip —
   * measurably faster and, more to the point, incapable of being misread. What
   * comes back is the same proposal a sentence would have produced, so the
   * confirm step below is unchanged.
   */
  async function submitGap(values: Record<string, string>) {
    if (!gap || busy) return
    setBusy(true)
    setError(null)
    try {
      const d = await api.post<{
        answer: CopilotAnswer
        error?: string
        action?: string | null
        detail?: string | null
        missing?: { en: string; ar: string } | null
        optional?: boolean
        form?: GapField[]
        values?: Record<string, string>
      }>('/copilot/fill', { action: gap.action, values, question: asked ?? undefined })

      if (d.error) {
        /*
         * The boxes stay on screen holding what was typed. A form that emptied
         * itself to report a problem would make the person type it all again to
         * fix one field.
         */
        /* What they typed stays; a suggestion is only ever offered on the first pass. */
        if (d.form?.length) setGap({ action: gap.action, fields: d.form, values, suggested: {} })
        setError(
          d.missing
            ? t('copilot.err.action.needs', { what: loc(d.missing) })
            : [t(`copilot.err.${d.error}` as never), d.detail].filter(Boolean).join(' '),
        )
        return
      }
      setGap(null)
      setAnswer(d.answer)
      await applyUiEffect(d.answer)
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Committing a proposed action.
   *
   * Posts back the instruction the server resolved, unchanged. It is not a
   * token and grants nothing: the server re-checks the role and re-reads the
   * record, so this is a convenience that saves it remembering the proposal.
   */
  async function confirmAction(params: ActionParams) {
    /* Sent so the assistant can remember that this sentence, read this way, was right. */
    setBusy(true)
    setError(null)
    try {
      const d = await api.post<{ answer: CopilotAnswer }>('/copilot/do', { params, question: asked ?? undefined })
      setAnswer(d.answer)
      /* One handler for every server-approved UI outcome. Keeping this shared
       * with text responses prevents a new typed navigation parameter from
       * working in one Copilot path but not after a confirmation card. */
      await applyUiEffect(d.answer)
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Backing out, and saying so.
   *
   * Somebody who reads a proposal and declines it has just told the assistant
   * it read them wrong — the clearest correction available, and the only one it
   * cannot work out for itself. Best-effort: a person cancelling must never be
   * shown an error for cancelling.
   */
  async function decline(action: string) {
    const question = asked
    setAnswer(null)
    setAsked(null)
    if (question) {
      await api.post('/copilot/declined', { question, action }).catch(() => undefined)
    }
  }

  const r = answer?.result
  // A report is a document; an answer is a card. They do not want the same width.
  const wide = r?.kind === 'report'


  return (
    <div
      className={`${
        // Docked under the topbar button, or placed by the floating launcher.
        /*
          Whole class names, never built from a variable.
          Tailwind reads these files as text to decide what CSS to generate, so
          `w-[min(${x},…)]` produces a class that is never written — the panel
          silently rendered at its minimum width instead of the one it asked for.
        */
        floating
          ? wide
            ? 'w-[min(46rem,calc(100vw-2rem))]'
            : 'w-[min(28rem,calc(100vw-2rem))]'
          : wide
            ? /*
                A report is wider than the button it hangs from, so it is placed
                against the viewport rather than anchored to that button. Anchored,
                it grew off the side of the screen the moment a report replaced an
                answer — the extra width had nowhere to go.
              */
              'fixed end-4 top-16 w-[min(46rem,calc(100vw-2rem))]'
            : 'absolute end-0 top-full mt-2 w-[min(28rem,calc(100vw-2rem))]'
      /*
        This z-index orders the panel against the topbar's other children, and
        nothing beyond them: the topbar is `sticky z-20`, which makes it a
        stacking context, and no z-index in here can climb out of it. Where the
        panel sits relative to the sidebar is decided on the sidebar — see the
        note there.
      */
      } ${
        fullPage
          ? 'w-full'
          : 'z-40 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_55px_rgba(var(--shadow-tint),0.18)]'
      }`}
      dir={dir}
    >
      <div
        className={`flex items-center justify-between gap-2 px-4 py-3 ${fullPage ? '' : 'border-b border-line'}`}
        hidden={fullPage}
      >
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          {/* The opened panel repeats the launcher mark, so "Ask the system"
              is visibly tied to the same assistant the person just selected. */}
          <span className="relative grid size-7 place-items-center overflow-visible" aria-hidden="true">
            <span className="copilot-robot absolute grid size-16 place-items-center origin-center scale-[0.43]">
              <span className="copilot-robot-ear copilot-robot-ear-start" />
              <span className="copilot-robot-ear copilot-robot-ear-end" />
              <span className="copilot-robot-antenna" />
              <span className="copilot-robot-red-accent" />
              <span className="copilot-robot-shell">
                <span className="copilot-robot-face">
                  <span className="copilot-robot-eye copilot-robot-eye-start" />
                  <span className="copilot-robot-eye copilot-robot-eye-end" />
                  <span className="copilot-robot-smile" />
                </span>
                <span className="copilot-robot-chin" />
              </span>
            </span>
          </span>
          {t(payrollMode ? 'hrPay.agent' : 'copilot.title')}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded-md p-1 text-muted transition hover:bg-neutral-soft hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
        className="flex items-center gap-2 border-b border-line px-3 py-2.5"
      >
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t(payrollMode ? 'hrPay.agentPlaceholder' : 'copilot.placeholder')}
          maxLength={500}
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        <button
          type="button"
          onClick={dictating ? stopDictation : startDictation}
          aria-label={t(dictating ? 'voice.dictationStop' : 'voice.dictationStart')}
          aria-pressed={dictating}
          className={`rounded-md p-2 transition ${
            dictating ? 'bg-danger-soft text-danger hover:brightness-95' : 'text-muted hover:bg-neutral-soft hover:text-brand'
          }`}
        >
          {dictating ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
        </button>
        <button
          type="submit"
          disabled={busy || !question.trim()}
          aria-label={t('copilot.send')}
          className="rounded-md bg-brand p-2 text-white transition hover:bg-brand-700 disabled:opacity-45"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>

      {(dictating || dictationError) && (
        <section className="border-b border-line px-4 py-3" aria-live="polite">
          {dictating && (
            <div className="rounded-xl border border-brand/20 bg-brand-soft/45 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
                  <span className="grid size-7 place-items-center rounded-full bg-brand text-white">
                    <Mic className="size-3.5 motion-safe:animate-pulse" aria-hidden="true" />
                  </span>
                  {t('voice.dictationListening')}
                </p>
                <button
                  type="button"
                  onClick={stopDictation}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                >
                  <MicOff className="size-3.5" aria-hidden="true" />
                  {t('voice.dictationStop')}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">{t('voice.dictationHint')}</p>
              {dictationPreview && (
                <p className="mt-2 rounded-md bg-paper px-2.5 py-2 text-sm text-ink"><bdi>{dictationPreview}</bdi></p>
              )}
            </div>
          )}
          {dictationError && <p className="text-xs text-danger">{t(`voice.error.${dictationError}` as never)}</p>}
        </section>
      )}

      <div
        className={`${fullPage ? 'max-h-[calc(100dvh-24rem)]' : wide ? 'max-h-[34rem]' : 'max-h-[26rem]'} overflow-y-auto px-4 py-3`}
      >
        {/*
          No prompts on the page.

          A grid of example questions is a menu, and a menu turns "ask me
          anything" into "pick one of these" — which is exactly the impression
          the page exists to avoid. The small panel keeps them, because a
          popover has no room to explain itself and a hint earns its space
          there.
        */}
        {/*
          No suggestions, in either place.
          They were kept here on the reasoning that a popover has no room to
          explain itself and a hint earns its space — but a list of things to
          say is only useful before you know what to say, and it is in the way
          every time after that. The box and the question are the whole of it.
        */}
        {history.length > 0 && (
          <section aria-label={t('copilot.history')} className="mb-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('copilot.history')}</p>
            {history.map((turn) => {
              const prior = turn.answer
              const priorResult = prior?.result
              const sentence = prior ? loc(prior.sentence).trim() : ''

              return (
                <article key={turn.id} className="rounded-xl border border-line bg-paper p-3">
                  <p className="text-sm font-medium text-ink"><bdi>{turn.question}</bdi></p>
                  {turn.error ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-danger">{turn.error}</p>
                  ) : prior?.refusal ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{sentence || t(`copilot.refusal.${prior.refusal}` as never)}</p>
                  ) : sentence ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{sentence}</p>
                  ) : priorResult?.kind === 'stats' ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {priorResult.stats.slice(0, 4).map((stat, index) => (
                        <span key={index} className="rounded-md bg-surface px-2 py-1 text-xs text-ink">
                          <bdi>{stat.value}</bdi> · {loc(stat.label)}
                        </span>
                      ))}
                    </div>
                  ) : prior?.sharingOff ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t('privacy.sharingOff')}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted">{t('copilot.historyResponse')}</p>
                  )}
                </article>
              )
            })}
          </section>
        )}
        {asked && (
          <p className="mb-3 rounded-lg bg-neutral-soft px-3 py-2 text-sm text-neutral-ink">
            <bdi>{asked}</bdi>
          </p>
        )}

        {busy && !gap && <Thinking />}
        {error && <Alert>{error}</Alert>}

        {gap && (
          <GapForm
            fields={gap.fields}
            initial={gap.values}
            suggested={gap.suggested}
            busy={busy}
            onSubmit={submitGap}
            onCancel={() => {
              setGap(null)
              setError(null)
            }}
          />
        )}

        {answer?.refusal && (
          <p className="text-sm leading-relaxed text-muted">{loc(answer.sentence).trim() || t(`copilot.refusal.${answer.refusal}` as never)}</p>
        )}

        {answer && !answer.refusal && (
          <div className="space-y-3">
            {answer.sentence.en || answer.sentence.ar ? (
              <p className="text-sm leading-relaxed text-ink">{loc(answer.sentence)}</p>
            ) : answer.sharingOff ? (
              /*
                Said, not left blank. An empty space where a sentence should be
                reads as a fault; this is a setting, and the figures are intact.
              */
              <p className="rounded-lg border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-muted">
                {t('privacy.sharingOff')}
              </p>
            ) : null}

            {answer.periodLabel && <p className="text-xs text-muted">{loc(answer.periodLabel)}</p>}

            {/* A greeting's real answer is the list of questions, not the sentence above it. */}

            {r?.kind === 'stats' && (
              <div className="grid grid-cols-2 gap-2">
                {r.stats.map((s, i) => (
                  <div key={i} className="rounded-lg border border-line bg-paper px-3 py-2">
                    <p className="text-lg font-bold tabular-nums text-ink">{s.value}</p>
                    <p className="text-xs text-muted">{loc(s.label)}</p>
                    {s.detail && <p className="text-[11px] text-muted">{loc(s.detail)}</p>}
                  </div>
                ))}
              </div>
            )}

            {r?.kind === 'people' && (
              <ul className="space-y-1.5">
                {r.people.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
                    <span className={`size-2 shrink-0 rounded-full ${TONE[p.tone] ?? TONE.neutral}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      <bdi>{loc(p.name)}</bdi>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{loc(p.detail)}</span>
                  </li>
                ))}
              </ul>
            )}

            {r?.kind === 'guide' && (
              <div className="space-y-3">
                {r.steps.length > 0 && (
                  <ol className="space-y-2">
                    {r.steps.map((step, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm leading-relaxed text-ink">{loc(step.text)}</p>
                          {/*
                            A step that names a screen takes you there. Reading
                            "go to Recruitment" and then having to find it is the
                            part of a written guide that wastes the most time.
                          */}
                          {step.path && (
                            <button
                              type="button"
                              onClick={() => {
                                navigate(step.path!)
                                onClose()
                              }}
                              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                            >
                              {t('copilot.takeMe')}
                              <span aria-hidden="true">{dir === 'rtl' ? '\u2190' : '\u2192'}</span>
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {r.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                    {r.links.map((l, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          navigate(l.path)
                          onClose()
                        }}
                        className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink transition hover:border-brand hover:text-brand"
                      >
                        {loc(l.label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/*
              Several records fit. Each option is a full proposal, rendered the
              same way a single one is — so choosing and confirming are the same
              gesture, and the details that tell them apart are already there.
            */}
            {r?.kind === 'choose' && (
              <div className="space-y-2">
                {r.choice.options.map((option, i) => (
                  <ConfirmAction
                    key={i}
                    proposal={option}
                    busy={busy}
                    onCancel={() => void decline(option.action)}
                    onConfirm={() => void confirmAction(option.params)}
                  />
                ))}
              </div>
            )}

            {r?.kind === 'confirm' && (
              <ConfirmAction
                proposal={r.proposal}
                busy={busy}
                onCancel={() => void decline(r.proposal.action)}
                onConfirm={() => void confirmAction(r.proposal.params)}
              />
            )}

            {r?.kind === 'done' && (
              <div
                className={`rounded-xl border px-3 py-2.5 text-sm ${
                  r.outcome.ok ? 'border-success/30 bg-success-soft text-ink' : 'border-danger/30 bg-danger-soft text-ink'
                }`}
              >
                {/*
                  The refusal the form would have given, where there is one.
                  Same rule, same sentence, wherever the person met it.
                */}
                <p className="font-medium">
                  {r.outcome.messageKey
                    ? t(r.outcome.messageKey as never, r.outcome.messageParams ?? undefined)
                    : loc(r.outcome.message)}
                </p>
                {r.outcome.ok && r.outcome.path && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate(r.outcome.path!)
                      onClose()
                    }}
                    className="mt-1.5 text-xs font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    {t('action.seeIt')}
                  </button>
                )}
              </div>
            )}

            {r?.kind === 'report' && <ReportView report={r.report} sharingOff={answer.sharingOff} />}

            {r?.kind === 'knowledge' && (
              <div className="space-y-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{loc(r.answer)}</p>
                <div className="rounded-xl border border-line bg-paper p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('copilot.sources')}</p>
                  <ul className="mt-2 space-y-2">
                    {r.sources.map((source, index) => (
                      <li key={`${source.title}-${index}`} className="text-sm">
                        <p className="font-medium text-ink">{source.title}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-muted">{source.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {r?.kind === 'table' && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-paper">
                    <tr>
                      {r.columns.map((col, i) => (
                        <th key={i} className="px-3 py-2 text-start text-xs font-semibold text-muted">
                          {loc(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t border-line">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-ink">
                            <bdi>{cell}</bdi>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/*
        Said where it is read, not only in the code. Somebody using this every
        day should know its boundary without having to discover it by being
        refused.
      */}
      {/*
        Kept, even on the simplified page: it says the answers come from this
        system and stop at what this person may see. That is a claim about
        scope worth making once, quietly.
      */}
      <p
        className={`text-[11px] leading-relaxed text-muted ${
          fullPage ? 'pt-3 text-center' : 'border-t border-line px-4 py-2.5'
        }`}
      >
        {t('copilot.scope')}
      </p>
    </div>
  )
}
