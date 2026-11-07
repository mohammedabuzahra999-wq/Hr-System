import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Send } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * The written interview, as the candidate sees it.
 *
 * Public on purpose, like the careers pages: whoever opens this is not an
 * employee, has no account, and should see no sidebar and no sign that they are
 * inside somebody's HR system. The token in the address is the whole of their
 * access and it is never shown back to them as one.
 *
 * One question at a time, and no way back. The server refuses a second answer
 * to the same question, so a screen that offered to edit one would be promising
 * something it cannot do — and an interview you can revise after reading the
 * later questions is a different exercise from the one that was sent.
 */

interface Question {
  id: string
  ordinal: number
  en: string
  ar: string
  questionType: 'written' | 'multipleChoice'
  options: { id: string; en: string; ar: string }[]
  answered: boolean
}

interface Interview {
  position: { en: string; ar: string }
  status: string
  opensAt?: string
  durationMinutes?: number
  questions: Question[]
}

function isComplete(interview: Interview) {
  return interview.status === 'completed'
}

export function InterviewPage() {
  const { token = '' } = useParams()
  const { t, loc, dir, fmt } = useI18n()
  const [data, setData] = useState<Interview | null>(null)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api
      .get<Interview>(`/interview/${token}`)
      .then((d) => {
        setData(d)
        setDone(isComplete(d))
      })
      .catch((e) => setError(errorText(t, e)))
  }, [token, t])

  const awaitingApproval = data?.status === 'awaitingApproval'
  const scheduled = data?.status === 'scheduled'

  useEffect(() => {
    if (!awaitingApproval && !scheduled) return
    const intervalId = window.setInterval(() => {
      void api
        .get<Interview>('/interview/' + token)
        .then((interview) => {
          setData(interview)
          setDone(isComplete(interview))
          setError(null)
        })
        .catch(() => undefined)
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [awaitingApproval, scheduled, token])

  /* The first one not yet answered. Refreshing lands you back on it, not at the start. */
  const current = data?.questions.find((q) => !q.answered) ?? null
  const answered = data?.questions.filter((q) => q.answered).length ?? 0
  const total = data?.questions.length ?? 0

  async function send() {
    if (!current || !answer.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ remaining: number; completed: boolean }>(
        `/interview/${token}/answer`,
        { questionId: current.id, text: answer.trim() },
      )
      setAnswer('')
      setData((prev) =>
        prev
          ? { ...prev, questions: prev.questions.map((q) => (q.id === current.id ? { ...q, answered: true } : q)) }
          : prev,
      )
      if (r.completed) setDone(true)
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div dir={dir} className="min-h-dvh bg-paper px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted">
          {t('interview.eyebrow')}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {data ? loc(data.position) : t('common.loading')}
        </h1>

        {error && <Alert className="mt-4">{error}</Alert>}

        {data && awaitingApproval && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-semibold text-ink">{t('interview.awaitingApproval')}</p>
            <p className="mt-1 text-sm text-muted">{t('interview.awaitingApprovalSub')}</p>
          </div>
        )}

        {data && scheduled && (
          <div className="mt-6 rounded-2xl border border-brand/25 bg-brand-soft/30 p-6 text-center">
            <p className="font-semibold text-ink">
              {data.opensAt
                ? t('interview.scheduled', { date: `${fmt.date(data.opensAt)} ${fmt.time(data.opensAt)}` })
                : t('interview.awaitingApproval')}
            </p>
            {data.durationMinutes && (
              <p className="mt-1 text-sm text-muted">
                {t('interview.scheduledSub', { minutes: String(data.durationMinutes) })}
              </p>
            )}
          </div>
        )}


        {data && !done && current && (
          <>
            {/*
              Where they are, said plainly. Somebody answering eight questions
              with no idea how many are left answers the third one differently
              from the way they answer the last.
            */}
            <div className="mt-6 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-300"
                  style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {t('interview.progress', { n: String(answered + 1), of: String(total) })}
              </span>
            </div>

            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <p className="text-base leading-relaxed text-ink">{loc(current)}</p>

              {current.questionType === 'multipleChoice' && (

                <fieldset className="mt-4 grid gap-2">

                  <legend className="sr-only">{t('interview.typeChoice')}</legend>

                  {current.options.map((option) => (

                    <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${answer === option.id ? 'border-brand bg-brand-soft/40 text-ink' : 'border-line bg-paper text-ink hover:border-brand/50'}`}>

                      <input type="radio" name={`question-${current.id}`} value={option.id} checked={answer === option.id} onChange={(event) => setAnswer(event.target.value)} className="size-4 accent-brand" />

                      <span className="grid size-5 place-items-center rounded-full border border-current text-[10px] font-semibold">{option.id}</span>

                      <span>{loc(option)}</span>

                    </label>

                  ))}

                </fieldset>

              )}


              <textarea
                hidden={current.questionType === 'multipleChoice'}
                disabled={current.questionType === 'multipleChoice'}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={7}
                autoFocus
                placeholder={t('interview.placeholder')}
                className="mt-4 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              />

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button onClick={() => void send()} loading={busy} loadingText={t('interview.sending')} disabled={!answer.trim()}>
                  <Send className="size-4" aria-hidden="true" />
                  {answered + 1 === total ? t('interview.finish') : t('interview.next')}
                </Button>
                {/* Said before they press it, not after. */}
                <span className="text-xs text-muted">{t('interview.noGoingBack')}</span>
              </div>
            </div>
          </>
        )}

        {done && (
          <div className="mt-6 rounded-2xl border border-success/30 bg-success-soft p-6 text-center">
            <Check className="mx-auto size-8 text-success" aria-hidden="true" />
            <p className="mt-3 font-semibold text-ink">{t('interview.thanks')}</p>
            <p className="mt-1 text-sm text-muted">{t('interview.thanksSub')}</p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted">{t('interview.footer')}</p>
      </div>
    </div>
  )
}
