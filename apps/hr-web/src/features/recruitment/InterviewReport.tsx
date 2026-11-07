import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Minus, X } from 'lucide-react'
import type { InterviewSummary } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * What the answers showed, with the working attached.
 *
 * The same shape as the CV match beside it, on purpose: one row per
 * requirement, a verdict, and the line of the candidate's own answer behind it.
 * Two readings of one rubric can be compared; two different rubrics cannot, and
 * "Technical Knowledge: 8/10" would have been a second rubric nobody chose.
 *
 * The number never appears without the rows. A reviewer who sees 75 and no
 * reason will rank by it and stop reading, and an applicant who asks why they
 * were passed over is owed more than a figure.
 */

const VERDICT = {
  met: { icon: Check, tint: 'text-success', key: 'screen.met' },
  partial: { icon: Minus, tint: 'text-warning', key: 'screen.partial' },
  notEvidenced: { icon: X, tint: 'text-muted', key: 'screen.notEvidenced' },
} as const

/** Three bands, not a gradient: one requirement moves this several points. */
function band(score: number): string {
  if (score >= 70) return 'text-success'
  if (score >= 40) return 'text-warning'
  return 'text-muted'
}

export function InterviewReport({ evaluation }: { evaluation: NonNullable<InterviewSummary['evaluation']> }) {
  const { t, loc } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div className="flex items-baseline gap-1.5">
          {evaluation.score === null ? (
            <span className="text-lg font-semibold text-muted">{t('common.dash')}</span>
          ) : (
            <>
              <span className={`text-2xl font-bold tabular-nums ${band(evaluation.score)}`}>
                {evaluation.score}
              </span>
              <span className="text-xs text-muted">%</span>
            </>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">
            {evaluation.score === null ? t('screen.noWeights') : t('interview.match')}
          </p>
          {/* Said every time the number is, not once in a help page. */}
          <p className="text-[11px] text-muted">{t('interview.notADecision')}</p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ms-auto inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
        >
          {open ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
          {t(open ? 'screen.hide' : 'screen.details')}
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-3 py-3">
          <p className="text-sm leading-relaxed text-ink">{loc(evaluation.summary)}</p>

          <ul className="mt-3 space-y-2">
            {evaluation.matches.map((m) => {
              const v = VERDICT[m.verdict]
              const Icon = v.icon
              return (
                <li key={m.requirement} className="rounded-lg border border-line bg-paper p-2.5">
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 size-3.5 shrink-0 ${v.tint}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{m.requirement}</p>
                      <p className="text-[11px] text-muted">{t(v.key as never)}</p>
                      {/*
                        The quote is the whole point of the row. Without it the
                        verdict is an impression, and an impression cannot be
                        shown to the person it ranked.
                      */}
                      {m.evidence && (
                        <p className="mt-1 border-s-2 border-line ps-2 text-xs italic leading-relaxed text-muted">
                          {m.evidence}
                        </p>
                      )}
                      {m.gap && <p className="mt-1 text-xs text-muted">{m.gap}</p>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {evaluation.concerns.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-2.5">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                <AlertTriangle className="size-3.5 text-warning" aria-hidden="true" />
                {t('screen.concerns')}
              </p>
              <ul className="mt-1.5 space-y-1">
                {evaluation.concerns.map((c, i) => (
                  <li key={i} className="text-xs leading-relaxed text-ink">
                    {loc(c)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
