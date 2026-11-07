import { AlertTriangle, CalendarClock, ChevronLeft, CircleDollarSign, ClipboardCheck, FileWarning, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { HrAttention, HrAttentionKind, HrAttentionSeverity, ServerEventType } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

const LIVE_ON: ServerEventType[] = ['employee.changed', 'request.created', 'request.decided', 'payroll.changed']

const iconFor: Record<HrAttentionKind, LucideIcon> = {
  salaryContractMissing: FileWarning,
  contractExpiring: RefreshCw,
  leavePending: CalendarClock,
  payrollAdjustmentPending: CircleDollarSign,
  payrollFindingOpen: ClipboardCheck,
}

const toneFor: Record<HrAttentionSeverity, BadgeTone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
}

const labelFor: Record<HrAttentionKind, 'hrAttention.contracts' | 'hrAttention.contractRenewals' | 'hrAttention.leaves' | 'hrAttention.adjustments' | 'hrAttention.findings'> = {
  salaryContractMissing: 'hrAttention.contracts',
  contractExpiring: 'hrAttention.contractRenewals',
  leavePending: 'hrAttention.leaves',
  payrollAdjustmentPending: 'hrAttention.adjustments',
  payrollFindingOpen: 'hrAttention.findings',
}

const aiQuestionFor: Record<HrAttentionKind, string> = {
  salaryContractMissing: '\u062d\u0644\u0644 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0627\u0644\u0630\u064a\u0646 \u0644\u0627 \u064a\u0645\u0644\u0643\u0648\u0646 \u0639\u0642\u0648\u062f \u0631\u0627\u062a\u0628 \u0648\u0645\u0627 \u0627\u0644\u0625\u062c\u0631\u0627\u0621 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0642\u0628\u0644 \u0627\u062d\u062a\u0633\u0627\u0628 \u0627\u0644\u0631\u0648\u0627\u062a\u0628.',
  contractExpiring: '\u0644\u062e\u0635 \u0627\u0644\u0639\u0642\u0648\u062f \u0627\u0644\u062a\u064a \u0642\u0627\u0631\u0628 \u0645\u0648\u0639\u062f \u062a\u062c\u062f\u064a\u062f\u0647\u0627.',
  leavePending: '\u0644\u062e\u0635 \u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0625\u062c\u0627\u0632\u0629 \u0627\u0644\u0645\u0639\u0644\u0642\u0629.',
  payrollAdjustmentPending: '\u0627\u0634\u0631\u062d \u0625\u062f\u062e\u0627\u0644\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0639\u0644\u0642\u0629 \u0648\u0645\u0627 \u064a\u0644\u0632\u0645 \u0645\u0631\u0627\u062c\u0639\u062a\u0647.',
  payrollFindingOpen: '\u062d\u0644\u0644 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629 \u0648\u0631\u062a\u0628 \u0645\u0627 \u064a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629 \u0623\u0648\u0644\u064b\u0627.',
}

/**
 * The HR work queue only links to existing workflows. This page does not make
 * approvals of its own, which keeps the approval and audit rules in one place.
 */
export function HrAttentionPage() {
  const { t, loc, fmt } = useI18n()
  const attention = useLiveQuery<HrAttention>(() => api.get('/hr-attention'), [], { on: LIVE_ON })
  const data = attention.data
  const total = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : null

  const cards = data
    ? [
        { key: 'contracts', count: data.counts.salaryContractMissing, icon: FileWarning, tone: 'danger' as BadgeTone, href: '/hr/payroll#salaries' },
        { key: 'contractRenewals', count: data.counts.contractExpiring, icon: RefreshCw, tone: 'warning' as BadgeTone, href: '/hr/employees' },
        { key: 'leaves', count: data.counts.leavePending, icon: CalendarClock, tone: 'warning' as BadgeTone, href: '/hr/leaves' },
        { key: 'adjustments', count: data.counts.payrollAdjustmentPending, icon: CircleDollarSign, tone: 'warning' as BadgeTone, href: '/hr/payroll#adjustments' },
        { key: 'findings', count: data.counts.payrollFindingOpen, icon: ClipboardCheck, tone: 'danger' as BadgeTone, href: '/hr/payroll#review' },
      ] as const
    : []

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-brand-800 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.2)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.hr')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('hrAttention.title')}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{t('hrAttention.subtitle')}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/20">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {total === null ? t('common.loading') : t('hrAttention.openCount', { count: fmt.number(total) })}
          </span>
        </div>
      </header>

      {attention.error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{errorText(t, attention.error)}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('hrAttention.summary')}>
        {cards.map(({ key, count, icon: Icon, tone, href }) => (
          <Link key={key} to={href} className="group rounded-2xl border border-line bg-surface p-4 shadow-[0_10px_28px_rgba(var(--shadow-tint),0.04)] transition hover:border-brand/35 hover:shadow-[0_14px_32px_rgba(var(--shadow-tint),0.1)]">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand"><Icon className="size-5" aria-hidden="true" /></span>
              <Badge tone={tone}>{fmt.number(count)}</Badge>
            </div>
            <p className="mt-4 text-sm font-semibold text-ink">{t(`hrAttention.${key}` as 'hrAttention.contracts' | 'hrAttention.contractRenewals' | 'hrAttention.leaves' | 'hrAttention.adjustments' | 'hrAttention.findings')}</p>
            <p className="mt-1 text-xs text-muted">{t('hrAttention.openRelated')}</p>
          </Link>
        ))}
      </section>

      <Card title={t('hrAttention.queue')} icon={AlertTriangle} className="rounded-2xl">
        {attention.loading ? (
          <p className="py-8 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : data?.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('hrAttention.clear')}</p>
        ) : (
          <div className="divide-y divide-line">
            {data?.items.map((item) => {
              const Icon = iconFor[item.kind]
              return (
                <article key={item.id} className="group px-1 py-4 first:pt-1">
                  <Link to={item.href} className="flex items-start gap-3 transition hover:bg-brand-50/45">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-brand"><Icon className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{loc(item.title)}</span>
                      <Badge tone={toneFor[item.severity]}>{t(`hrAttention.severity.${item.severity}` as 'hrAttention.severity.critical' | 'hrAttention.severity.high' | 'hrAttention.severity.medium' | 'hrAttention.severity.low')}</Badge>
                      <span className="text-xs text-muted">{t(labelFor[item.kind])}</span>
                    </span>
                    {item.employee && <span className="mt-1 block text-sm font-medium text-ink">{loc(item.employee)}{item.employeeNumber ? <span className="ms-1 text-xs font-normal text-muted">· {item.employeeNumber}</span> : null}</span>}
                    <span className="mt-1 block text-sm leading-6 text-muted">{loc(item.detail)}</span>
                  </span>
                    <ChevronLeft className="mt-2 size-4 shrink-0 text-muted transition group-hover:text-brand rtl:rotate-180" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('hr:open-copilot', { detail: { question: aiQuestionFor[item.kind], variant: item.kind.includes('payroll') ? 'payroll' : 'general' } }))}
                    className="mt-2 ms-12 rounded-lg px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-50"
                  >
                    {t('hrAttention.analyze')}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
