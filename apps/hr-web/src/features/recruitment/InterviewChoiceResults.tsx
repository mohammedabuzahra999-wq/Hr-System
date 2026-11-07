import { useEffect, useState } from 'react'
import { Check, CircleDot, X } from 'lucide-react'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'

interface ResultBase {
  id: string
  ordinal: number
  en: string
  ar: string
}

interface ChoiceResult extends ResultBase {
  questionType: 'multipleChoice'
  selected: { id: string; en: string; ar: string } | null
  correct: boolean
}

interface WrittenResult extends ResultBase {
  questionType: 'written'
  answer: string
}

type Result = ChoiceResult | WrittenResult

export function InterviewChoiceResults({ applicationId }: { applicationId: string }) {
  const { t, loc } = useI18n()
  const [results, setResults] = useState<Result[] | null>(null)

  useEffect(() => {
    let current = true
    api
      .get<Result[]>(`/recruitment/applications/${applicationId}/interview/results`)
      .then((data) => current && setResults(data))
      .catch(() => current && setResults([]))
    return () => {
      current = false
    }
  }, [applicationId])

  if (!results || results.length === 0) return null

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface p-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
        <CircleDot className="size-3.5 text-brand" aria-hidden="true" />
        {t('interview.answerReview')}
      </p>
      <div className="mt-2 space-y-2">
        {results.map((result) => (
          <div key={result.id} className="rounded-lg border border-line bg-paper p-2.5">
            <p className="text-xs font-medium leading-relaxed text-ink">
              {result.ordinal}. {loc(result)}
            </p>
            {result.questionType === 'written' ? (
              <p className="mt-2 whitespace-pre-line rounded-md border border-line bg-surface px-2.5 py-2 text-xs leading-relaxed text-ink">
                {result.answer}
              </p>
            ) : (
              <>
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted">
                  <span className="rounded-full border border-line px-1.5 py-0.5 font-semibold">{result.selected?.id ?? t('common.dash')}</span>
                  {result.selected ? loc(result.selected) : t('interview.noSelection')}
                </p>
                <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${result.correct ? 'text-success' : 'text-danger'}`}>
                  {result.correct ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                  {t(result.correct ? 'interview.answerCorrect' : 'interview.answerIncorrect')}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
