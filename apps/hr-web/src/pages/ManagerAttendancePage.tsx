import { CalendarCheck2, Clock3, Users } from 'lucide-react'
import type { TeamAttendanceRow, TeamStats } from '@hr/shared'
import { Card } from '@/components/ui/Card'
import { TeamAttendanceTable } from '@/features/attendance/TeamAttendanceTable'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'

export function ManagerAttendancePage() {
  const { t, fmt } = useI18n()

  const team = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: ['attendance.changed'],
  })
  const stats = useLiveQuery<TeamStats>(() => api.get('/stats/team'), [], {
    on: ['attendance.changed', 'request.created', 'request.decided'],
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.manager')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('mgrAtt.title')}</h2>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          {fmt.number(stats.data?.attendanceRate ?? 0)}%
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('mgrAtt.present')} icon={Users} className="rounded-2xl">
          <p className="text-3xl font-bold">{fmt.number(stats.data?.presentToday ?? 0)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrAtt.presentSub')}</p>
        </Card>
        <Card title={t('mgrAtt.absent')} icon={Clock3} className="rounded-2xl">
          <p className="text-3xl font-bold">{fmt.number(stats.data?.absentToday ?? 0)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrAtt.absentSub')}</p>
        </Card>
        <Card title={t('mgrAtt.late')} icon={CalendarCheck2} className="rounded-2xl">
          <p className="text-3xl font-bold">{fmt.number(stats.data?.lateThisMonth ?? 0)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrAtt.lateSub')}</p>
        </Card>
      </div>

      <Card title={t('mgrAtt.today')} icon={CalendarCheck2} className="rounded-2xl">
        <TeamAttendanceTable rows={team.data?.rows ?? []} loading={team.loading} showDepartment={false} />
      </Card>
    </div>
  )
}
