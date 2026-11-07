import { Printer } from 'lucide-react'
import type { HrReport } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * A generated report, on screen.
 *
 * Laid out as a document rather than as an answer, because that is what it is:
 * it carries who it covers, the dates it covers, who produced it and when. A
 * report printed without those is one nobody can place six months later.
 *
 * The prose and the figures are visibly separate. The summary sits in its own
 * block, labelled; the numbers are in tables beneath it. A reader should be able
 * to tell at a glance which part of the page was measured and which was
 * described — and the described part carries a line saying so.
 */
export function ReportView({ report, sharingOff = false }: { report: HrReport; sharingOff?: boolean }) {
  const { t, loc, fmt } = useI18n()

  return (
    <div className="report-document space-y-4">
      <header className="border-b border-line pb-3">
        <h3 className="text-base font-bold text-ink">{loc(report.title)}</h3>
        <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="font-semibold">{t('report.scope')}:</dt>
            <dd>{loc(report.scope)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold">{t('report.period')}:</dt>
            <dd dir="ltr">{loc(report.period)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold">{t('report.by')}:</dt>
            <dd>
              <bdi>{loc(report.generatedBy)}</bdi>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-semibold">{t('report.at')}:</dt>
            <dd>{`${fmt.date(report.generatedAt)} · ${fmt.time(report.generatedAt)}`}</dd>
          </div>
        </dl>
      </header>

      {report.summary.en || report.summary.ar ? (
        <section className="rounded-lg border border-line bg-paper p-3">
          <p className="text-xs font-semibold text-ink">{t('report.summary')}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{loc(report.summary)}</p>

          {report.findings.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {report.findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{loc(f)}</span>
                </li>
              ))}
            </ul>
          )}

          {/*
            Which half of this page a model wrote, said on the page.
            A report that will be forwarded should carry that with it.
          */}
          <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
            {t('report.proseNote')}
          </p>
        </section>
      ) : sharingOff ? (
        <p className="rounded-lg border border-line bg-paper p-3 text-xs leading-relaxed text-muted">
          {t('privacy.sharingOff')}
        </p>
      ) : null}

      {report.sections.map((section, i) => (
        <section key={i}>
          <h4 className="text-sm font-semibold text-ink">{loc(section.heading)}</h4>

          {section.kind === 'stats' ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {section.stats.map((s, j) => (
                <div key={j} className="rounded-lg border border-line bg-paper px-3 py-2">
                  <p className="text-lg font-bold tabular-nums text-ink">{s.value}</p>
                  <p className="text-xs text-muted">{loc(s.label)}</p>
                  {s.detail && <p className="text-[11px] text-muted">{loc(s.detail)}</p>}
                </div>
              ))}
            </div>
          ) : section.kind === 'barChart' ? (
            <>
              <div className="mt-2 space-y-2 rounded-lg border border-line bg-paper p-3">
                {section.bars.map((bar, j) => (
                  <div key={j}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-ink">{loc(bar.label)}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">{bar.valueLabel}</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-line"
                      role="img"
                      aria-label={`${loc(bar.label)}: ${bar.valueLabel}`}
                    >
                      <div className="h-full rounded-full bg-brand" style={{ width: `${bar.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {section.note && <p className="mt-1 text-[11px] text-muted">{loc(section.note)}</p>}
            </>
          ) : (
            <>
              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-paper">
                    <tr>
                      {section.columns.map((c, j) => (
                        <th key={j} className="whitespace-nowrap px-3 py-2 text-start text-xs font-semibold text-muted">
                          {loc(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, j) => (
                      <tr key={j} className="border-t border-line">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-1.5 text-ink tabular-nums">
                            <bdi>{cell}</bdi>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* A capped table says so. A silent cut reads as the whole set. */}
              {section.note && <p className="mt-1 text-[11px] text-muted">{loc(section.note)}</p>}
            </>
          )}
        </section>
      ))}

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
      >
        <Printer className="size-3.5" aria-hidden="true" />
        {t('report.print')}
      </button>
    </div>
  )
}
