import { useState } from 'react'
import { ClipboardList, X } from 'lucide-react'
import type { EmployeeRequest, RequestStatus } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useI18n } from '@/features/i18n/useI18n'

interface RequestsCardProps {
  requests: EmployeeRequest[]
  /** Only pending requests can be withdrawn. */
  onCancel: (id: string) => void
  className?: string
}

const TONES: Record<RequestStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

/** Filters follow the list: a status with no requests is not offered. */
const FILTERS: RequestStatus[] = ['pending', 'approved', 'completed', 'rejected', 'cancelled']

export function RequestsCard({ requests, onCancel, className }: RequestsCardProps) {
  const { t, fmt, days } = useI18n()
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all')

  const counts = FILTERS.filter((status) => requests.some((request) => request.status === status))
  const visible = filter === 'all' ? requests : requests.filter((request) => request.status === filter)

  function titleOf(request: EmployeeRequest) {
    if (!request.leave) return t(`requests.kind.${request.kind as 'certificate' | 'detailsUpdate'}`)
    return t('requests.leaveTitle', {
      type: t(`leaveType.${request.leave.type}`),
      days: days(request.leave.days),
    })
  }

  return (
    <Card title={t('requests.title')} icon={ClipboardList} className={className}>
      {requests.length === 0 ? (
        <p className="text-sm text-muted">{t('requests.empty')}</p>
      ) : (
        <>
          <div className="-mt-1 mb-1 flex flex-wrap gap-1.5">
            {(['all', ...counts] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                aria-pressed={filter === status}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === status
                    ? 'bg-brand text-white'
                    : 'bg-paper text-muted hover:bg-brand-50 hover:text-brand',
                )}
              >
                {status === 'all'
                  ? `${t('common.all')} (${fmt.number(requests.length)})`
                  : `${t(`reqStatus.${status}`)} (${fmt.number(requests.filter((r) => r.status === status).length)})`}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="py-3 text-sm text-muted">{t('requests.emptyFiltered')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((request) => (
                <li key={request.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{titleOf(request)}</p>
                    <p className="text-xs text-muted">
                      {request.leave &&
                        `${t('common.dayRange', { from: request.leave.from, to: request.leave.to })} · `}
                      {t('requests.submitted', { date: request.submittedAt })}
                    </p>
                  </div>

                  <div className="ms-auto flex shrink-0 items-center gap-1.5">
                    <Badge tone={TONES[request.status]}>{t(`reqStatus.${request.status}`)}</Badge>
                    {request.status === 'pending' && (
                      <button
                        onClick={() => onCancel(request.id)}
                        title={t('requests.cancel')}
                        aria-label={t('requests.cancel')}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
