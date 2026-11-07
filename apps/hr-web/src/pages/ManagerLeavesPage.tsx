import { CalendarDays, FileText } from 'lucide-react'
import { useMemo } from 'react'
import type { EmployeeRequest, LeaveDetails, Localized, RequestStatus } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/** Tone follows the status key, not the translated word, so it survives a language switch. */
const TONES: Record<RequestStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

/** A request narrowed to the leave rows this table shows — `leave` is no longer nullable. */
interface LeaveRow {
  id: string
  employeeName: Localized
  leave: LeaveDetails
  status: RequestStatus
}

/**
 * The manager's leave screen, live.
 *
 * The inbox endpoint scopes itself from the session, so a manager gets their own
 * reports and nobody else's — the page never has to filter by team itself. A
 * request submitted or decided anywhere refreshes this screen.
 *
 * The old "annual days remaining" tile is gone on purpose: that is a per-employee
 * balance, and there is no team-wide figure behind it. The two tiles that remain
 * are counted from the rows actually on screen.
 */
export function ManagerLeavesPage() {
  const { t, loc, fmt } = useI18n()

  const inbox = useLiveQuery<{ requests: EmployeeRequest[] }>(() => api.get('/requests/inbox'), [], {
    on: ['request.created', 'request.decided'],
  })

  const rows = useMemo<LeaveRow[]>(() => {
    const out: LeaveRow[] = []
    for (const request of inbox.data?.requests ?? []) {
      // Certificates and details updates belong to the approvals screen.
      if (request.kind !== 'leave' || !request.leave) continue
      out.push({
        id: request.id,
        employeeName: request.employeeName,
        leave: request.leave,
        status: request.status,
      })
    }
    return out
  }, [inbox.data])

  const pendingCount = rows.filter((row) => row.status === 'pending').length
  const approvedCount = rows.filter((row) => row.status === 'approved').length

  // A figure that has not loaded yet shows as a dash: a zero here would read as a fact.
  const figure = (value: number) => (inbox.loading ? t('common.dash') : fmt.number(value))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.manager')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('mgrLeaves.title')}</h2>
        </div>
        <div className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">
          {`${t('mgrLeaves.requests')} (${figure(rows.length)})`}
        </div>
      </div>

      {inbox.error && (
        <Alert>
          {errorText(t, inbox.error)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('mgrLeaves.pending')} icon={FileText} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(pendingCount)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrLeaves.pendingSub')}</p>
        </Card>
        <Card title={t('mgrLeaves.approved')} icon={CalendarDays} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(approvedCount)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrLeaves.approvedSub')}</p>
        </Card>
      </div>

      <Card title={t('mgrLeaves.requests')} icon={CalendarDays} className="rounded-2xl">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={inbox.loading}
          empty={t('common.noData')}
          columns={[
            {
              key: 'employee',
              header: t('table.employee'),
              primary: true,
              cell: (row) => <span className="font-medium text-ink">{loc(row.employeeName)}</span>,
            },
            { key: 'type', header: t('table.type'), cell: (row) => t(`leaveType.${row.leave.type}`) },
            {
              key: 'period',
              header: t('table.period'),
              cell: (row) => t('common.dayRange', { from: row.leave.from, to: row.leave.to }),
            },
            {
              key: 'status',
              header: t('table.status'),
              cell: (row) => <Badge tone={TONES[row.status]}>{t(`reqStatus.${row.status}`)}</Badge>,
            },
          ]}
        />
      </Card>
    </div>
  )
}
