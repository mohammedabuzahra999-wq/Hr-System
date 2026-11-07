import { BarChart3, FileText, TrendingUp } from 'lucide-react'
import type { ServerEventType, TeamStats } from '@hr/shared'
import { Card } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'

/** Hoisted so the subscription is not torn down and rebuilt on every render. */
const EVENTS: ServerEventType[] = ['attendance.changed', 'request.created', 'request.decided']

type BarId = 'attendance' | 'leave' | 'late'

/**
 * A rate reads against 100; a count reads against the team it came from. Giving
 * each meter its own scale keeps a percentage and a headcount off one shared
 * 0–100 track, where they would invite a comparison that means nothing.
 *
 * Only the wording lives here. The numbers and the denominator come from the
 * team the signed-in manager actually supervises, so the bar can never be read
 * against a team size that stopped being true.
 */
const BARS: { id: BarId; title: TKey; detail: TKey; percent: boolean }[] = [
  { id: 'attendance', title: 'mgrRep.barAttendance', detail: 'mgrRep.barAttendanceSub', percent: true },
  { id: 'leave', title: 'mgrRep.barLeave', detail: 'mgrRep.barLeaveSub', percent: false },
  { id: 'late', title: 'mgrRep.barLate', detail: 'mgrRep.barLateSub', percent: false },
]

function readings(stats: TeamStats): Record<BarId, { value: number; max: number }> {
  return {
    attendance: { value: stats.attendanceRate, max: 100 },
    leave: { value: stats.leaveRequestsThisMonth, max: stats.teamSize },
    late: { value: stats.lateThisMonth, max: stats.teamSize },
  }
}

export function ManagerReportsPage() {
  const { t, fmt } = useI18n()

  const stats = useLiveQuery<TeamStats>(() => api.get('/stats/team'), [], { on: EVENTS })
  const data = stats.data
  const read = data ? readings(data) : null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.manager')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('mgrRep.title')}</h2>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          {t('mgrRep.badge')}
        </div>
      </div>

      {stats.error && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(errorKey(stats.error))}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('mgrRep.attendance')} icon={TrendingUp} className="rounded-2xl">
          {stats.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : (
            <p className="text-3xl font-bold">
              {data ? `${fmt.number(data.attendanceRate)}%` : t('common.dash')}
            </p>
          )}
          <p className="mt-2 text-sm text-muted">{t('mgrRep.attendanceSub')}</p>
        </Card>
        <Card title={t('mgrRep.absence')} icon={FileText} className="rounded-2xl">
          {stats.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : (
            <p className="text-3xl font-bold">{data ? fmt.number(data.absentToday) : t('common.dash')}</p>
          )}
          <p className="mt-2 text-sm text-muted">{t('mgrRep.absenceSub')}</p>
        </Card>
      </div>

      <Card title={t('mgrRep.summary')} icon={BarChart3} className="rounded-2xl">
        {stats.loading && <p className="text-sm text-muted">{t('common.loading')}</p>}

        {/* No team means no denominator, so a bar here would measure nothing. */}
        {!stats.loading && (!data || data.teamSize === 0) && (
          <p className="text-sm text-muted">{t('common.noData')}</p>
        )}

        {!stats.loading && read && data && data.teamSize > 0 && (
          <div className="space-y-5">
            {BARS.map((bar) => (
              <Meter
                key={bar.id}
                label={t(bar.title)}
                value={read[bar.id].value}
                max={read[bar.id].max}
                valueText={
                  bar.percent
                    ? `${fmt.number(read[bar.id].value)}%`
                    : fmt.number(read[bar.id].value)
                }
                caption={
                  bar.percent
                    ? t(bar.detail)
                    : `${t(bar.detail)} · ${t('chart.ofMax', { max: fmt.number(read[bar.id].max) })}`
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
