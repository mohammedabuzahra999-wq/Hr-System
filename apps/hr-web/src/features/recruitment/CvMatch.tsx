import { AlertTriangle, Check, ChevronDown, Minus, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { CvAnalysis, RequirementVerdict } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * The CV match, with its working attached.
 *
 * The percentage is never shown on its own. A reviewer who sees "52%" and no
 * reason will treat it as a verdict, rank by it, and stop reading — and if a
 * candidate ever asks why they were passed over, or a regulator asks how the
 * stack was ordered, a number with no working cannot answer.
 *
 * So the number opens onto the list of requirements, each with the line of the
 * CV behind it. And the wording is careful in one specific place: a requirement
 * the CV does not mention is "not in the CV", never "missing" — the difference
 * is between a fact about a document and a claim about a person, and people
 * leave their strongest skill off the page all the time.
 */

const VERDICT: Record<RequirementVerdict, { icon: typeof Check; tint: string; key: string }> = {
  met: { icon: Check, tint: 'text-success', key: 'screen.met' },
  partial: { icon: Minus, tint: 'text-warning', key: 'screen.partial' },
  notEvidenced: { icon: X, tint: 'text-muted', key: 'screen.notEvidenced' },
}

/**
 * Three bands, not a gradient.
 *
 * A continuous colour scale invites reading 61 as meaningfully better than 58,
 * which the underlying number cannot support — it counts requirements, and one
 * requirement moves it several points.
 */
function band(score: number): string {
  if (score >= 70) return 'text-success'
  if (score >= 40) return 'text-warning'
  return 'text-muted'
}

export function CvMatch({
  analysis,
  busy,
  onRerun,
}: {
  analysis: CvAnalysis | null
  busy?: boolean
  onRerun?: () => void
}) {
  const { t, loc } = useI18n()
  const [open, setOpen] = useState(false)

  if (!analysis) return null

  /*
   * Still being read is not a failure.
   *
   * This fell into the branch below, which shows a warning triangle and a
   * reason — and a pending analysis has no failure to name, so it rendered an
   * alert icon beside an empty string. A reviewer saw something had gone wrong
   * and could not find out what, because nothing had.
   */
  if (analysis.status === 'pending') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
        <RefreshCw className="size-3.5 shrink-0 animate-spin text-muted" aria-hidden="true" />
        <span className="text-xs text-muted">{t('screen.reading')}</span>
      </div>
    )
  }

  if (analysis.status === 'failed' || !analysis.content) {
    /* Never blank: a warning with no words is worse than a vague one. */
    const reason = analysis.failure
      ? t(`screen.fail.${analysis.failure}` as never)
      : t('screen.fail.unknown')
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
        <AlertTriangle className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="text-xs text-muted">{reason}</span>
        {onRerun && (
          <button
            type="button"
            disabled={busy}
            onClick={onRerun}
            className="ms-auto inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-45"
          >
            <RefreshCw className={`size-3 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            {busy ? t('screen.reading') : t('screen.rerun')}
          </button>
        )}
      </div>
    )
  }

  const c = analysis.content
  const counted = c.matches.length

  return (
    <div className="mt-3 rounded-xl border border-line bg-paper">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        {/*
          No weights means no score, and it says so rather than showing a zero.
          A zero here would be read as the worst candidate anybody had seen,
          when what happened is that nobody has said what the role is judged on.
        */}
        <div className="flex items-baseline gap-1.5">
          {c.score === null ? (
            <span className="text-lg font-semibold text-muted">{t('common.dash')}</span>
          ) : (
            <>
              <span className={`text-2xl font-bold tabular-nums ${band(c.score)}`}>{c.score}</span>
              <span className="text-xs text-muted">%</span>
            </>
          )}
        </div>
        {/*
          The second figure: the same verdicts, weighted by what the people
          hired into this role had evidenced. Beside the first rather than
          blended into it — where the two disagree, that disagreement is the
          only thing the second number adds, and an average would erase it.
        */}
        {c.historyScore !== null && (
          <div className="flex items-baseline gap-1.5 border-s border-line ps-3">
            <span className={`text-2xl font-bold tabular-nums ${band(c.historyScore)}`}>
              {c.historyScore}
            </span>
            <span className="text-xs text-muted">%</span>
            <span className="text-[11px] text-muted">
              {t('screen.byHistory', { n: String(c.historyFrom) })}
            </span>
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">
            {c.score === null ? t('screen.noWeights') : t('screen.score')}
          </p>
          <p className="text-[11px] text-muted">
            {c.yearsOfExperience !== null
              ? t('screen.years', { years: c.yearsOfExperience })
              : t('screen.yearsUnknown')}
          </p>
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          {onRerun && (
            <button
              type="button"
              disabled={busy}
              onClick={onRerun}
              aria-label={t('screen.rerun')}
              className="rounded-md border border-line bg-surface p-1.5 text-muted transition hover:border-brand hover:text-brand disabled:opacity-45"
            >
              <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
          >
            {open ? t('screen.hide') : t('screen.details')}
            <ChevronDown className={`size-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-line px-3 py-3">
          <p className="text-sm leading-relaxed text-muted">{loc(c.summary)}</p>

          {counted > 0 && (
            <ul className="space-y-2.5">
              {c.matches.map((m, i) => {
                const v = VERDICT[m.verdict]
                const Icon = v.icon
                return (
                  <li key={i} className="flex gap-2.5">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${v.tint}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{m.requirement}</p>
                      {m.evidence && (
                        <p className="mt-0.5 border-s-2 border-line ps-2 text-xs text-muted">
                          <span className="font-semibold">{t('screen.evidence')}: </span>
                          <bdi>{m.evidence}</bdi>
                        </p>
                      )}
                      {m.gap && (
                        <p className="mt-0.5 text-xs text-muted">
                          <span className="font-semibold">{t('screen.gap')}: </span>
                          {m.gap}
                        </p>
                      )}
                      {m.verdict === 'notEvidenced' && !m.evidence && (
                        <p className="mt-0.5 text-[11px] text-muted">{t('screen.notEvidencedHint')}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {c.concerns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink">{t('screen.concerns')}</p>
              <ul className="mt-1.5 space-y-1">
                {c.concerns.map((x, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <span>{loc(x)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            Said on the screen, not only in a commit message. Whoever reads this
            list every day is the person who needs to know what the number is.
          */}
          <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">{t('screen.advisory')}</p>
        </div>
      )}
    </div>
  )
}

