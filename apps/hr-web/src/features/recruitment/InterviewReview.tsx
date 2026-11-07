import { useEffect, useState } from 'react'
import { Check, CircleDot, RefreshCw, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

interface ReviewOption {
  id: string
  en: string
  ar: string
  correct: boolean
}

interface ReviewQuestion {
  id: string
  ordinal: number
  en: string
  ar: string
  questionType: 'written' | 'multipleChoice'
  options: ReviewOption[]
  criterionKey: string | null
  approvalStatus: 'pending' | 'approved'
  reviewFeedback: string | null
}

interface InterviewReviewData {
  status: string
  questions: ReviewQuestion[]
  allApproved: boolean
}

/** HTML datetime-local expects local clock time, while the API receives an ISO instant. */
function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function InterviewReview({ applicationId, onChanged }: { applicationId: string; onChanged: () => void }) {
  const { t, loc } = useI18n()
  const [review, setReview] = useState<InterviewReviewData | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [busyQuestion, setBusyQuestion] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opensAt, setOpensAt] = useState(() => localDateTimeValue(new Date(Date.now() + 5 * 60_000)))
  const [minimumOpensAt] = useState(() => localDateTimeValue(new Date(Date.now() + 60_000)))
  const [durationMinutes, setDurationMinutes] = useState(60)

  useEffect(() => {
    let current = true
    api
      .get<InterviewReviewData>(`/recruitment/applications/${applicationId}/interview`)
      .then((data) => current && setReview(data))
      .catch((err) => current && setError(errorText(t, err)))
    return () => {
      current = false
    }
  }, [applicationId, t])

  async function approve(questionId: string) {
    setBusyQuestion(questionId)
    setError(null)
    try {
      const data = await api.post<InterviewReviewData>(
        `/recruitment/applications/${applicationId}/interview/questions/${questionId}/approve`,
        {},
      )
      setReview(data)
      onChanged()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusyQuestion(null)
    }
  }

  async function revise(questionId: string) {
    const note = feedback[questionId]?.trim() ?? ''
    if (note.length < 3) return
    setBusyQuestion(questionId)
    setError(null)
    try {
      const data = await api.post<InterviewReviewData>(
        `/recruitment/applications/${applicationId}/interview/questions/${questionId}/revise`,
        { feedback: note },
      )
      setReview(data)
      setFeedback((previous) => ({ ...previous, [questionId]: '' }))
      onChanged()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusyQuestion(null)
    }
  }

  async function send() {
    if (!review?.allApproved || sending) return
    const opening = new Date(opensAt)
    if (!opensAt || Number.isNaN(opening.getTime())) {
      setError(t('err.validationFailed'))
      return
    }
    setSending(true)
    setError(null)
    try {
      await api.post(`/recruitment/applications/${applicationId}/interview/send`, {
        opensAt: opening.toISOString(),
        durationMinutes,
      })
      onChanged()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setSending(false)
    }
  }

  if (!review) return <p className="mt-2 text-xs text-muted">{t('common.loading')}</p>

  return (
    <div className="mt-2 rounded-xl border border-brand/25 bg-brand-soft/30 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t('interview.reviewTitle')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('interview.reviewIntro')}</p>
          <p className="mt-1 text-xs font-medium text-brand">{t('interview.structure')}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-3 space-y-3">
        {review.questions.map((question) => {
          const pending = question.approvalStatus === 'pending'
          const busy = busyQuestion === question.id
          return (
            <section key={question.id} className="rounded-lg border border-line bg-paper p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-surface px-2 py-0.5 font-semibold text-muted">{question.ordinal}</span>
                <span className="inline-flex items-center gap-1 font-medium text-muted">
                  <CircleDot className="size-3.5" aria-hidden="true" />
                  {t(question.questionType === 'multipleChoice' ? 'interview.typeChoice' : 'interview.typeWritten')}
                </span>
                <span className={pending ? 'text-warning' : 'inline-flex items-center gap-1 text-success'}>
                  {!pending && <Check className="size-3.5" aria-hidden="true" />}
                  {t(pending ? 'interview.pendingApproval' : 'interview.approved')}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink">{loc(question)}</p>

              {question.questionType === 'multipleChoice' && (
                <div className="mt-2 grid gap-1.5">
                  {question.options.map((option) => (
                    <div key={option.id} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink">
                      <span className="grid size-4 place-items-center rounded-full border border-muted text-[10px] font-semibold text-muted">
                        {option.id}
                      </span>
                      {loc(option)}
                                          {option.correct && <span className="ms-auto text-[10px] font-semibold text-success">{t('interview.correctAnswer')}</span>}</div>
                  ))}
                </div>
              )}

              {question.reviewFeedback && (
                <p className="mt-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-ink">{question.reviewFeedback}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {pending && (
                  <Button onClick={() => void approve(question.id)} loading={busy} loadingText={t('common.loading')}>
                    <Check className="size-3.5" aria-hidden="true" />
                    {t('interview.approveQuestion')}
                  </Button>
                )}
                <input
                  value={feedback[question.id] ?? ''}
                  onChange={(event) => setFeedback((previous) => ({ ...previous, [question.id]: event.target.value }))}
                  placeholder={t('interview.changePlaceholder')}
                  className="h-8 min-w-48 flex-1 rounded-md border border-line bg-surface px-2 text-xs text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
                />
                <Button
                  variant="secondary"
                  disabled={busy || (feedback[question.id]?.trim().length ?? 0) < 3}
                  onClick={() => void revise(question.id)}
                >
                  <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {t('interview.changeQuestion')}
                </Button>
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{t('interview.sendRule')}</p>
          <div className="mt-2 grid max-w-xl gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-ink">
              {t('interview.opensAt')}
              <input
                type="datetime-local"
                value={opensAt}
                min={minimumOpensAt}
                onChange={(event) => setOpensAt(event.target.value)}
                className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-ink">
              {t('interview.durationMinutes', { minutes: String(durationMinutes) })}
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink"
              >
                {[30, 45, 60, 90, 120, 180].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t('interview.durationMinutes', { minutes: String(minutes) })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{t('interview.scheduleRule')}</p>
        </div>
        <Button disabled={!review.allApproved || !opensAt} loading={sending} loadingText={t('interview.sendingToCandidate')} onClick={() => void send()}>
          <Send className="size-4" aria-hidden="true" />
          {t('interview.scheduleAndSend')}
        </Button>
      </div>
    </div>
  )
}
