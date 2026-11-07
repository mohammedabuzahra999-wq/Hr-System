import type { AttendanceStatus, EmployeeRequest } from '@hr/shared'
import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/features/i18n/useI18n'
import { PresenceBadge } from './PresenceBadge'
import type { Decision } from './useDecideRequest'

interface ApprovalQueueProps {
  /** Already filtered to what needs a decision — this renders, it does not select. */
  requests: EmployeeRequest[]
  loading: boolean
  /** The row currently being decided; its buttons are disabled until it settles. */
  busyId?: string | null
  /**
   * Omitted for a viewer who may read the queue but not act on it.
   *
   * HR and administrators are in that position by design: they watch the queue
   * and see who is in today, while the decision belongs to the line manager. The
   * server enforces this — leaving the buttons out only stops the app offering a
   * control that would be refused.
   */
  onDecide?: (id: string, decision: Decision) => void
  /** Today's attendance for the person who asked, when the screen shows it. */
  presenceOf?: (userId: string) => AttendanceStatus | null
}

export function ApprovalQueue({ requests, loading, busyId, onDecide, presenceOf }: ApprovalQueueProps) {
  const { t, loc, days } = useI18n()

  function titleOf(request: EmployeeRequest) {
    if (!request.leave) return t(`requests.kind.${request.kind as 'certificate' | 'detailsUpdate'}`)
    return t('requests.leaveTitle', {
      type: t(`leaveType.${request.leave.type}`),
      days: days(request.leave.days),
    })
  }

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (requests.length === 0) return <p className="text-sm text-muted">{t('requests.emptyFiltered')}</p>

  return (
    <div className="space-y-3">
      {requests.map((item) => (
        <div key={item.id} className="rounded-2xl border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{loc(item.employeeName)}</p>
              <p className="mt-1 text-sm text-muted">{titleOf(item)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Badge tone="warning">{t('status.pending')}</Badge>
              {presenceOf && (
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted">{t('approvals.todayIs')}</span>
                  <PresenceBadge status={presenceOf(item.userId)} />
                </span>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-muted">
            {item.leave ? `${t('common.dayRange', { from: item.leave.from, to: item.leave.to })} · ` : ''}
            {t('requests.submitted', { date: item.submittedAt })}
          </p>
          {item.leave?.reason && <p className="mt-1 text-xs text-muted">{item.leave.reason}</p>}

          {onDecide ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => onDecide(item.id, 'approved')}
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-45"
              >
                {t('action.approve')}
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => onDecide(item.id, 'rejected')}
                className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15 disabled:opacity-45"
              >
                {t('action.reject')}
              </button>
            </div>
          ) : (
            // Says who it is waiting on, so an empty row does not read as "stuck".
            <p className="mt-3 text-xs text-muted">{t('approvals.managerDecides')}</p>
          )}
        </div>
      ))}
    </div>
  )
}
