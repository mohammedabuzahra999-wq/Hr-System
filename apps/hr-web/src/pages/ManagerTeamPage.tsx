import { UserRound, Users } from 'lucide-react'
import { useMemo } from 'react'
import type { Employee, TeamAttendanceRow, TeamStats } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

const tones: Record<TeamAttendanceRow['status'], BadgeTone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave: 'info',
  holiday: 'neutral',
  weekend: 'neutral',
}

export function ManagerTeamPage() {
  const { t, loc, fmt } = useI18n()

  /**
   * `/employees` is already scoped by the session — a manager's request returns
   * their own reports — so this page never filters by `managerId` itself.
   */
  const people = useLiveQuery<{ employees: Employee[] }>(() => api.get('/employees'), [], {
    on: ['employee.changed'],
  })

  /** Today's row per person, joined by `userId` to fill the status column. */
  const attendance = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: ['attendance.changed'],
  })

  const stats = useLiveQuery<TeamStats>(() => api.get('/stats/team'), [], {
    on: ['attendance.changed', 'request.created', 'request.decided'],
  })

  const team = useMemo(() => people.data?.employees ?? [], [people.data])

  const statusByUser = useMemo(() => {
    const map = new Map<string, TeamAttendanceRow['status']>()
    for (const row of attendance.data?.rows ?? []) map.set(row.userId, row.status)
    return map
  }, [attendance.data])

  /** "Present" counts anyone who actually turned up, late included. */
  const presentCount = useMemo(
    () =>
      (attendance.data?.rows ?? []).filter((row) => row.status === 'present' || row.status === 'late').length,
    [attendance.data],
  )

  // Until both queries land a row's status would be a guess, so wait instead.
  const listLoading = people.loading || attendance.loading
  const failure = people.error ?? attendance.error ?? stats.error

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand via-brand-700 to-sky-700 p-6 text-white shadow-[0_18px_55px_rgba(29,78,216,0.2)] sm:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-100">{t('section.manager')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('mgrTeam.title')}</h2>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20">
            {people.data ? t('chart.headcountValue', { count: fmt.number(team.length) }) : t('common.loading')}
          </div>
        </div>
      </div>

      {failure && (
        <Alert>
          {errorText(t, failure)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]" title={t('mgrTeam.reports')} icon={Users}>
          <p className="text-3xl font-bold">{people.data ? fmt.number(team.length) : t('common.dash')}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrTeam.reportsSub')}</p>
        </Card>
        <Card className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]" title={t('mgrTeam.present')} icon={UserRound}>
          <p className="text-3xl font-bold">{attendance.data ? fmt.number(presentCount) : t('common.dash')}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrTeam.presentSub')}</p>
        </Card>
        <Card className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]" title={t('mgrTeam.pending')} icon={UserRound}>
          <p className="text-3xl font-bold">
            {stats.data ? fmt.number(stats.data.pendingApprovals) : t('common.dash')}
          </p>
          <p className="mt-2 text-sm text-muted">{t('mgrTeam.pendingSub')}</p>
        </Card>
      </div>

      <Card title={t('mgrTeam.directory')} icon={Users} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
        <DataTable
          rows={team}
          rowKey={(person) => person.id}
          loading={listLoading}
          empty={t('common.noData')}
          columns={[
            {
              key: 'employee',
              header: t('table.employee'),
              primary: true,
              cell: (person) => <span className="font-medium text-ink">{loc(person.fullName)}</span>,
            },
            {
              key: 'position',
              header: t('table.position'),
              cell: (person) => <span className="text-muted">{loc(person.jobTitle)}</span>,
            },
            {
              key: 'status',
              header: t('table.status'),
              cell: (person) => {
                // No row today (a new joiner, a day off the calendar) shows a
                // dash rather than being called absent.
                const status = statusByUser.get(person.id)
                return status ? (
                  <Badge tone={tones[status]}>{t(`attStatus.${status}`)}</Badge>
                ) : (
                  <span className="text-muted">{t('common.dash')}</span>
                )
              },
            },
          ]}
        />
      </Card>
    </div>
  )
}
