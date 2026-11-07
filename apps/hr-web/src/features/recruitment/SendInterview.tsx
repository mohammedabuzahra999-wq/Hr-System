import { useState } from 'react'
import { Check, Copy, MessageSquareText, RefreshCw } from 'lucide-react'
import type { InterviewSummary } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'
import { InterviewReport } from './InterviewReport'
import { InterviewReview } from './InterviewReview'
import { InterviewChoiceResults } from './InterviewChoiceResults'

/**
 * The written interview for one applicant: send it, or see where it got to.
 *
 * The link used to be shown once, at creation, on the reasoning that a list of
 * tokens is a list of credentials. That reasoning was wrong here, and the bug
 * it caused was immediate: an interview created and its link not kept is an
 * interview that exists, cannot be reopened, and refuses to be replaced — the
 * screen said "this applicant already has one" and offered nothing else.
 *
 * Whoever is looking at this card can already read the candidate's file, their
 * CV, and shortly their answers. Withholding the link from them protected
 * nothing and removed the only way to resend it.
 */
export function SendInterview({
  applicationId,
  interview,
  onSent,
}: {
  applicationId: string
  interview: InterviewSummary | null
  onSent: () => void
}) {
  const { t, fmt } = useI18n()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  /*
   * Kept here rather than raised to the page: the page renders its error at the
   * top, and this button sits near the bottom of a long list, so a refusal
   * appeared fifteen hundred pixels above the thing that was pressed.
   */
  const [error, setError] = useState<string | null>(null)

  const link = interview ? `${window.location.origin}/interview/${interview.token}` : null

  async function send() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/recruitment/applications/${applicationId}/interview`, {})
      onSent()
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  async function reread() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/recruitment/applications/${applicationId}/interview/evaluate`, {})
      onSent()
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* The link is on screen and selectable; nothing to recover from. */
    }
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-danger">{error}</span>
        <button
          type="button"
          onClick={() => setError(null)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
        >
          {t('interview.tryAgain')}
        </button>
      </div>
    )
  }

  if (interview?.status === 'draft') {
    return <InterviewReview applicationId={applicationId} onChanged={onSent} />
  }

  if (interview) {
    const expired = interview.status === 'expired'
    return (
      <div className="w-full rounded-xl border border-line bg-paper p-3">
        <div className="flex flex-wrap items-center gap-2">
          <MessageSquareText className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink">
            {t(`interview.status.${interview.status}` as never)}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {t('interview.answeredOf', {
              n: String(interview.answered),
              of: String(interview.questions),
            })}
          </span>
          <span className="ms-auto text-xs text-muted">
            {expired
              ? t('interview.expiredOn', { date: fmt.date(interview.expiresAt) })
              : interview.opensAt
                ? `${t('interview.opensAt')}: ${fmt.date(interview.opensAt)} ${fmt.time(interview.opensAt)} · ${t('interview.durationMinutes', { minutes: String(interview.durationMinutes) })}`
                : t('interview.expiresOn', { date: fmt.date(interview.expiresAt) })}
          </span>
        </div>

        {/*
          The assessment, or a way to ask for one. An interview that has been
          answered and never read is the state this button exists for.
        */}
        {interview.status === 'completed' && interview.evaluation ? (
          <InterviewReport evaluation={interview.evaluation} />
        ) : interview.status === 'completed' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reread()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-45"
          >
            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('interview.reread')}
          </button>
        ) : null}

        {interview.status === 'completed' && <InterviewChoiceResults applicationId={applicationId} />}

        {/*
          An expired link is reported but not offered for copying. Sending
          somebody a link that will turn them away is worse than telling HR it
          has lapsed.
        */}
        {!expired && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink" dir="ltr">
              {link}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
            >
              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copied ? t('recruit.copied') : t('interview.copyLink')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void send()}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-45"
    >
      <MessageSquareText className="size-3.5" aria-hidden="true" />
      {busy ? t('interview.generating') : t('interview.generate')}
    </button>
  )
}
