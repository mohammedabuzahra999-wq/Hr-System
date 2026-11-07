import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/features/i18n/useI18n'

export interface BarDatum {
  /** Stable key, also used for the table row. */
  id: string
  /** The x-axis tick under the column. */
  label: string
  value: number
  /** The value as the reader should see it — used on the cap, in the tooltip and the table. */
  valueText: string
  /** A second tooltip line, e.g. the full date. */
  hint?: string
}

interface BarChartProps {
  /** Names what is plotted. A single series needs no legend, so this carries the identity. */
  caption: string
  data: BarDatum[]
  /** Scale top. Defaults to the largest value, or the reference when that is higher. */
  max?: number
  /** A hairline to read the columns against, e.g. a full shift or a target. */
  reference?: { value: number; label: string }
  /** Column whose value is direct-labelled besides the extreme, e.g. the latest. */
  highlightId?: string
  className?: string
}

const PLOT_HEIGHT = 168
/** Headroom above the tallest column, so a 100% bar's cap label still has somewhere to sit. */
const LABEL_BAND = 20

/**
 * A single-series column chart.
 *
 * Built from the mark specs rather than styled freehand: columns are capped in
 * width with a 4px rounded top and a square baseline, the axis and reference are
 * solid hairlines, and only the extreme and the highlighted column are
 * direct-labelled — the rest is carried by the tooltip and the table view, so no
 * value is reachable by hover alone.
 */
export function BarChart({ caption, data, max, reference, highlightId, className }: BarChartProps) {
  const { t } = useI18n()
  const [showTable, setShowTable] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const tableId = useId()

  if (data.length === 0) {
    return <p className={cn('text-sm text-muted', className)}>{t('chart.empty')}</p>
  }

  const peak = Math.max(...data.map((d) => d.value), reference?.value ?? 0)
  const scaleTop = max ?? peak
  const extremeId = data.reduce((best, d) => (d.value > best.value ? d : best), data[0]).id
  const referencePct = reference && scaleTop > 0 ? (reference.value / scaleTop) * 100 : null

  return (
    <figure className={cn('m-0', className)}>
      {/*
        The target is stated in the caption rather than floated on its own line.
        On a narrow chart that label sat at the end of the plot and collided with
        the cap label of whichever column happened to be tallest there.
      */}
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>{caption}</span>
        {reference && <span className="tabular-nums">{t('chart.target', { value: reference.label })}</span>}
      </figcaption>

      {/*
        Bars, the reference line and the cap labels all measure from the same box,
        which is inset by LABEL_BAND at the top. A full-height bar therefore still
        leaves room for its label instead of pushing it out of the figure.
      */}
      <div className="relative mt-4" style={{ height: PLOT_HEIGHT }}>
        <div className="absolute inset-x-0 bottom-0" style={{ top: LABEL_BAND }}>
          {referencePct !== null && (
            // The line alone; the caption above names what it marks.
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-line"
              style={{ bottom: `${referencePct}%` }}
            />
          )}

          <ul className="flex h-full items-end gap-2">
            {data.map((datum) => {
              const heightPct = scaleTop > 0 ? (datum.value / scaleTop) * 100 : 0
              const labelled = datum.id === extremeId || datum.id === highlightId
              const active = hovered === datum.id

              return (
                <li key={datum.id} className="relative h-full flex-1">
                  {/* Full-height hit target, so even a short bar clears the 24px minimum. */}
                  <button
                    type="button"
                    className="absolute inset-0 mx-auto flex w-full max-w-6 cursor-default"
                    onMouseEnter={() => setHovered(datum.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(datum.id)}
                    onBlur={() => setHovered(null)}
                    aria-describedby={tableId}
                  >
                    <span
                      className={cn(
                        'absolute inset-x-0 bottom-0 rounded-t-[4px] transition-colors',
                        active ? 'bg-brand-700' : 'bg-brand',
                      )}
                      style={{ height: `${heightPct}%` }}
                    />

                    {labelled && (
                      /* Centred on the bar but free of its width, so a long value never wraps. */
                      <span
                        className="absolute start-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-muted rtl:translate-x-1/2"
                        style={{ bottom: `calc(${heightPct}% + 4px)` }}
                      >
                        {datum.valueText}
                      </span>
                    )}

                    {active && (
                      /*
                        Anchored to the bar's cap, not the full-height hit target,
                        and flipped below the cap on a tall bar so it never lands
                        on the caption above the plot.
                      */
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute start-1/2 z-10 w-max max-w-[11rem] -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-start shadow-lg rtl:translate-x-1/2"
                        style={
                          heightPct > 60
                            ? { top: `calc(${100 - heightPct}% + 8px)` }
                            : { bottom: `calc(${heightPct}% + 8px)` }
                        }
                      >
                        <span className="block text-xs font-semibold text-ink">{datum.valueText}</span>
                        <span className="block text-[11px] text-muted">{datum.hint ?? datum.label}</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div className="mt-2 flex gap-2 border-t border-line pt-2">
        {data.map((datum) => (
          <span key={datum.id} className="flex-1 text-center text-[11px] text-muted">
            {datum.label}
          </span>
        ))}
      </div>

      {/* The table is the WCAG-clean twin: every value here, not only on hover. */}
      <button
        type="button"
        onClick={() => setShowTable((open) => !open)}
        aria-expanded={showTable}
        aria-controls={tableId}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', showTable && 'rotate-180')} aria-hidden="true" />
        {showTable ? t('chart.hideTable') : t('chart.showTable')}
      </button>

      <div id={tableId} hidden={!showTable} className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table className="min-w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-paper text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {t('chart.category')}
              </th>
              <th scope="col" className="px-3 py-2 text-end font-medium">
                {t('chart.value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-start font-normal text-ink">
                  {datum.hint ?? datum.label}
                </th>
                <td className="px-3 py-2 text-end tabular-nums text-muted">{datum.valueText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
