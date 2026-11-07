import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import type { EmployeeRequest } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { ApprovalQueue } from '@/features/approvals/ApprovalQueue'
import { usePresenceToday } from '@/features/approvals/usePresenceToday'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * Approvals across the organisation — to watch, not to decide.
 *
 * An administrator sees every request and whether the person who asked is in
 * today, which is what the role needs to spot a queue nobody is clearing. The
 * decision itself belongs to the employee's line manager, so this screen offers
 * no approve or reject control and the endpoint would refuse one anyway.
 */
export function AdminApprovalsPage() {
  const { t, fmt } = useI18n()

  const inbox = useLiveQuery<{ requests: EmployeeRequest[] }>(() => api.get('/requests/inbox'), [], {
    on: ['request.created', 'request.decided'],
  })
  const presence = usePresenceToday()

  const all = inbox.data?.requests ?? []
  const pending = all.filter((r) => r.status === 'pending')
  const approved = all.filter((r) => r.status === 'approved')
  const rejected = all.filter((r) => r.status === 'rejected')

  // A count only means something once it has loaded; a zero would read as a fact.
  const figure = (value: number) => (inbox.loading ? t('common.dash') : fmt.number(value))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-brand-700 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.2)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.admin')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('adminAppr.title')}</h2>
            <p className="mt-2 max-w-xl text-sm text-sky-100">{t('adminAppr.subtitle')}</p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20">
            {figure(pending.length)}
          </div>
        </div>
      </div>

      {inbox.error && (
        <Alert>
          {errorText(t, inbox.error)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('adminAppr.pending')} icon={Clock3} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{figure(pending.length)}</p>
          <p className="mt-2 text-sm text-muted">{t('adminAppr.pendingSub')}</p>
        </Card>
        <Card title={t('mgrAppr.approved')} icon={CheckCircle2} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{figure(approved.length)}</p>
          <p className="mt-2 text-sm text-muted">{t('adminAppr.approvedSub')}</p>
        </Card>
        <Card title={t('mgrAppr.rejected')} icon={XCircle} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{figure(rejected.length)}</p>
          <p className="mt-2 text-sm text-muted">{t('adminAppr.rejectedSub')}</p>
        </Card>
      </div>

      <Card title={t('adminAppr.queueTitle')} icon={Clock3} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
        <p className="mb-3 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted">
          {t('approvals.viewOnlyNote')}
        </p>
        <ApprovalQueue
          requests={pending}
          loading={inbox.loading}
          presenceOf={presence.statusOf}
        />
      </Card>
    </div>
  )
}
