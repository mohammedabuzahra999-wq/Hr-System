import { BarChart3, FileText, TrendingUp } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { OrgStats } from '@hr/shared'
import { BarChart, type BarDatum } from '@/components/ui/BarChart'
import { Card } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'

/**
 * Every figure on this page comes from one `/stats/org` read, so the tiles, the
 * meters and the trend can never disagree with each other.
 *
 * Retention, training compliance and the hiring pipeline used to sit here as
 * fixed numbers. Nothing in OrgStats measures them, so they are gone rather than
 * invented — the tiles now carry figures the API actually reports.
 */
export function HrReportsPage() {
  const { t, fmt } = useI18n()

  const stats = useLiveQuery<OrgStats>(() => api.get<OrgStats>('/stats/org'), [], {
    on: ['attendance.changed', 'request.created', 'request.decided', 'employee.changed'],
  })

  const org = stats.data

  const trend: BarDatum[] = useMemo(
    () =>
      (stats.data?.headcountTrend ?? []).map((point) => ({
        id: point.month,
        label: fmt.shortMonth(point.month),
        value: point.headcount,
        valueText: fmt.number(point.headcount),
        hint: `${fmt.monthYear(point.month)} · ${t('chart.headcountValue', { count: fmt.number(point.headcount) })}`,
      })),
    [stats.data, fmt, t],
  )

  /** A tile shows a skeleton while loading and a dash when the read failed — never a stand-in number. */
  function figure(value: number | undefined): ReactNode {
    if (stats.loading) return <span className="inline-block h-8 w-20 animate-pulse rounded bg-line" />
    if (value === undefined) return t('common.dash')
    return fmt.number(value)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('hrRep.title')}</h2>
        </div>
        <div className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">{t('hrRep.badge')}</div>
      </div>

      {stats.error && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(errorKey(stats.error))}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('kpi.activeEmployees')} icon={TrendingUp} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(org?.activeEmployees)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrEmp.activeSub')}</p>
        </Card>
        <Card title={t('hrRep.openRoles')} icon={FileText} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(org?.openPositions)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrRep.openRolesSub')}</p>
        </Card>
        <Card title={t('hrLeaves.pending')} icon={BarChart3} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(org?.pendingApprovals)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrLeaves.pendingSub')}</p>
        </Card>
      </div>

      <Card title={t('hrRep.coreMetrics')} icon={BarChart3} className="rounded-2xl">
        {stats.loading && <p className="text-sm text-muted">{t('common.loading')}</p>}
        {!stats.loading && !org && <p className="text-sm text-muted">{t('common.noData')}</p>}
        {org && (
          <div className="space-y-5">
            <Meter
              label={t('hrRep.barAttendance')}
              value={org.attendanceRate}
              max={100}
              valueText={`${fmt.number(org.attendanceRate)}%`}
              caption={t('hrRep.barAttendanceSub')}
            />
            {/*
              A real ratio rather than a score: people away today read against the
              active headcount the same payload reports.
            */}
            <Meter
              label={t('hrEmp.onLeave')}
              value={org.onLeaveToday}
              max={org.activeEmployees}
              valueText={fmt.number(org.onLeaveToday)}
              maxText={fmt.number(org.activeEmployees)}
            />
          </div>
        )}
      </Card>

      <Card title={t('adminDash.trend')} icon={TrendingUp} className="rounded-2xl">
        {stats.loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : (
          <BarChart caption={t('chart.headcountTrend')} data={trend} highlightId={trend.at(-1)?.id} />
        )}
      </Card>
    </div>
  )
}
