import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import type { EmployeeRequest } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { ApprovalQueue } from '@/features/approvals/ApprovalQueue'
import { useDecideRequest } from '@/features/approvals/useDecideRequest'
import { usePresenceToday } from '@/features/approvals/usePresenceToday'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * The manager's inbox, live.
 *
 * A request submitted on the employee's screen appears here without a reload,
 * and deciding it pushes the result straight back to them — the two sides of the
 * same round trip. The inbox endpoint returns this manager's reports and nobody
 * else's; the administrator's copy of this screen differs only in its framing.
 */
export function ManagerApprovalsPage() {
  const { t, fmt } = useI18n()

  const inbox = useLiveQuery<{ requests: EmployeeRequest[] }>(() => api.get('/requests/inbox'), [], {
    on: ['request.created', 'request.decided'],
  })
  const { busyId, error, decide } = useDecideRequest(inbox.refresh)
  // Whether the person is in today is context the decision actually uses.
  const presence = usePresenceToday()

  const all = inbox.data?.requests ?? []
  const pending = all.filter((r) => r.status === 'pending')
  const approved = all.filter((r) => r.status === 'approved')
  const rejected = all.filter((r) => r.status === 'rejected')

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-amber-500 via-orange-500 to-brand p-6 text-white shadow-[0_18px_55px_rgba(245,158,11,0.2)] sm:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-100">{t('section.manager')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('mgrAppr.title')}</h2>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20">
            {fmt.number(pending.length)}
          </div>
        </div>
      </div>

      {/* A failed load used to render as an empty queue, which reads as "nothing to do". */}
      {(error || inbox.error) && (
        <Alert>
          {error ?? errorText(t, inbox.error)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('mgrAppr.review')} icon={Clock3} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{fmt.number(pending.length)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrAppr.reviewSub')}</p>
        </Card>
        <Card title={t('mgrAppr.approved')} icon={CheckCircle2} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{fmt.number(approved.length)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrAppr.approvedSub')}</p>
        </Card>
        <Card title={t('mgrAppr.rejected')} icon={XCircle} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{fmt.number(rejected.length)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrAppr.rejectedSub')}</p>
        </Card>
      </div>

      <Card title={t('mgrAppr.pendingTitle')} icon={Clock3} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
        <ApprovalQueue
          requests={pending}
          loading={inbox.loading}
          busyId={busyId}
          onDecide={(id, d) => void decide(id, d)}
          presenceOf={presence.statusOf}
        />
      </Card>
    </div>
  )
}
