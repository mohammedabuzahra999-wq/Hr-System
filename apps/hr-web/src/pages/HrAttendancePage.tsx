import { CalendarCheck2, Clock3, Users } from 'lucide-react'
import { useMemo } from 'react'
import type { TeamAttendanceRow } from '@hr/shared'
import { Card } from '@/components/ui/Card'
import { TeamAttendanceTable } from '@/features/attendance/TeamAttendanceTable'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'

export function HrAttendancePage() {
  const { t, fmt } = useI18n()

  const team = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: ['attendance.changed'],
  })

  // Counted from the rows on screen, so the tiles and the table always agree.
  const counts = useMemo(() => {
    const rows = team.data?.rows ?? []
    return {
      present: rows.filter((r) => r.status === 'present' || r.status === 'late').length,
      late: rows.filter((r) => r.status === 'late').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      total: rows.length,
    }
  }, [team.data])

  const rate = counts.total ? Math.round((counts.present / counts.total) * 1000) / 10 : 0

  /** A zero before the rows arrive reads as a fact. Show nothing until it is one. */
  const figure = (value: number) => (team.data ? fmt.number(value) : t('common.dash'))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('hrAtt.title')}</h2>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          {team.data ? `${fmt.number(rate)}%` : t('common.dash')}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('hrAtt.present')} icon={Users} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(counts.present)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrAtt.presentSub')}</p>
        </Card>
        <Card title={t('hrAtt.late')} icon={Clock3} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(counts.late)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrAtt.lateSub')}</p>
        </Card>
        <Card title={t('hrAtt.absent')} icon={CalendarCheck2} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(counts.absent)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrAtt.absentSub')}</p>
        </Card>
      </div>

      <Card title={t('hrAtt.daily')} icon={CalendarCheck2} className="rounded-2xl">
        <TeamAttendanceTable rows={team.data?.rows ?? []} loading={team.loading} />
      </Card>
    </div>
  )
}
