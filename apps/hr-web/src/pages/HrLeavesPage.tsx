import { CalendarDays, FileText } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EmployeeRequest, LeaveDetails, Localized, RequestStatus } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { PresenceBadge } from '@/features/approvals/PresenceBadge'
import { usePresenceToday } from '@/features/approvals/usePresenceToday'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'
import { TeamCalendar } from '@/pages/ManagerCalendarPage'

/** Tone follows the status key, so it survives a language switch. */
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
  userId: string
  employeeName: Localized
  leave: LeaveDetails
  status: RequestStatus
  decidedByName: Localized | null
}

/**
 * Leave management, live.
 *
 * The inbox endpoint scopes itself from the session: for HR that is everyone's
 * requests, so the same call that gives a manager their reports gives HR the
 * organisation. A request submitted or decided anywhere refreshes this screen.
 *
 * HR reads this; it does not decide. Approving and rejecting belong to the
 * employee's line manager, and `POST /requests/:id/decide` admits nobody else.
 * What HR needs from the row is who asked, for how long, where it stands, and
 * whether that person is in today — which is what the columns show.
 */
export function HrLeavesPage() {
  const { t, loc, fmt } = useI18n()
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') === 'calendar' ? 'calendar' : 'requests'

  const inbox = useLiveQuery<{ requests: EmployeeRequest[] }>(() => api.get('/requests/inbox'), [], {
    on: ['request.created', 'request.decided'],
  })
  const presence = usePresenceToday()

  const rows = useMemo<LeaveRow[]>(() => {
    const out: LeaveRow[] = []
    for (const request of inbox.data?.requests ?? []) {
      // Certificates and details updates belong to other screens.
      if (request.kind !== 'leave' || !request.leave) continue
      out.push({
        id: request.id,
        userId: request.userId,
        employeeName: request.employeeName,
        leave: request.leave,
        status: request.status,
        decidedByName: request.decidedByName,
      })
    }
    return out
  }, [inbox.data])

  const pendingCount = rows.filter((row) => row.status === 'pending').length
  const approvedCount = rows.filter((row) => row.status === 'approved').length

  // A figure that has not loaded yet shows as a dash: a zero here would read as a fact.
  const figure = (value: number) => (inbox.loading ? t('common.dash') : fmt.number(value))

  function selectTab(tab: 'requests' | 'calendar') {
    setParams(tab === 'calendar' ? { tab } : {}, { replace: true })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('hrLeaves.title')}</h2>
        </div>
        <div className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">
          {`${t('hrLeaves.approved')} (${figure(approvedCount)})`}
        </div>
      </div>

      {inbox.error && (
        <Alert>
          {errorText(t, inbox.error)}
        </Alert>
      )}

      <div role="tablist" aria-label={t('hrLeaves.title')} className="flex w-fit rounded-xl border border-line bg-paper p-1">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'requests'}
          onClick={() => selectTab('requests')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'requests' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {t('hrLeaves.requests')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'calendar'}
          onClick={() => selectTab('calendar')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'calendar' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {t('nav.teamCalendar')}
        </button>
      </div>

      {activeTab === 'calendar' ? (
        <TeamCalendar embedded />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t('hrLeaves.pending')} icon={FileText} className="rounded-2xl">
              <p className="text-3xl font-bold">{figure(pendingCount)}</p>
              <p className="mt-2 text-sm text-muted">{t('hrLeaves.pendingSub')}</p>
            </Card>
            <Card title={t('hrLeaves.approved')} icon={CalendarDays} className="rounded-2xl">
              <p className="text-3xl font-bold">{figure(approvedCount)}</p>
              <p className="mt-2 text-sm text-muted">{t('hrLeaves.approvedSub')}</p>
            </Card>
          </div>

          <Card title={t('hrLeaves.requests')} icon={CalendarDays} className="rounded-2xl">
            <p className="mb-3 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted">
              {t('approvals.viewOnlyNote')}
            </p>
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
                {
                  key: 'today',
                  header: t('approvals.todayIs'),
                  cell: (row) => <PresenceBadge status={presence.statusOf(row.userId)} />,
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
                {
                  key: 'decided',
                  header: t('table.decidedBy'),
                  alignEnd: true,
                  // A pending row names who it is waiting on, rather than sitting blank.
                  cell: (row) => (
                    <span className="text-xs text-muted">
                      {row.decidedByName
                        ? t('hrLeaves.decidedBy', { name: loc(row.decidedByName) })
                        : row.status === 'pending'
                          ? t('approvals.withManager')
                          : t('common.dash')}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  )
}
