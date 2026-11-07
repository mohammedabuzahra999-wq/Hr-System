import {
  Activity,
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ReceiptText,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { OrgStats, TeamAttendanceRow } from '@hr/shared'
import { Badge } from '@/components/ui/Badge'
import { BarChart, type BarDatum } from '@/components/ui/BarChart'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/useAuth'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'

/** Labels and icons are fixed; the figures come from the API at render time. */
const kpis: { label: TKey; detail: TKey; icon: LucideIcon }[] = [
  { label: 'kpi.activeEmployees', detail: 'adminDash.kpiActiveDetail', icon: Users },
  { label: 'kpi.attendanceRate', detail: 'adminDash.kpiAttendanceDetail', icon: Activity },
  { label: 'kpi.openRoles', detail: 'adminDash.kpiOpenRolesDetail', icon: BriefcaseBusiness },
  { label: 'kpi.payrollCycle', detail: 'adminDash.kpiPayrollDetail', icon: Wallet },
]

const alerts: TKey[] = ['alerts.contracts', 'alerts.approvals', 'alerts.payroll']

/**
 * The snapshot reports what the API measures.
 *
 * Hiring pipeline, reviews due and training completion used to sit here as fixed
 * numbers with nothing behind them. There is no source for any of the three, so
 * they are gone rather than shown as figures nobody can trace back.
 */
const opsCards: { title: TKey; sub: TKey; pick: (stats: OrgStats) => number }[] = [
  { title: 'hrLeaves.pending', sub: 'hrLeaves.pendingSub', pick: (s) => s.pendingApprovals },
  { title: 'hrEmp.onLeave', sub: 'hrEmp.onLeaveSub', pick: (s) => s.onLeaveToday },
  { title: 'kpi.openRoles', sub: 'hrRep.openRolesSub', pick: (s) => s.openPositions },
]

const quickActions: { label: TKey; desc: TKey; icon: LucideIcon; tint: string }[] = [
  { label: 'adminDash.qaEmployees', desc: 'adminDash.qaEmployeesDesc', icon: Users, tint: 'bg-brand' },
  { label: 'adminDash.qaAttendance', desc: 'adminDash.qaAttendanceDesc', icon: Activity, tint: 'bg-emerald-500' },
  { label: 'adminDash.qaLeave', desc: 'adminDash.qaLeaveDesc', icon: CalendarDays, tint: 'bg-amber-500' },
  { label: 'adminDash.qaPayroll', desc: 'adminDash.qaPayrollDesc', icon: ReceiptText, tint: 'bg-red-500' },
]

const activity: TKey[] = ['adminDash.activity1', 'adminDash.activity2', 'adminDash.activity3']

const statusTone: Record<TeamAttendanceRow['status'], 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave: 'info',
  holiday: 'neutral',
  weekend: 'neutral',
}

export function DashboardPage() {
  const { user } = useAuth()
  const { t, loc, fmt } = useI18n()

  /** Live figures: the tiles and the trend come from one query, so they agree. */
  const stats = useLiveQuery<OrgStats>(() => api.get<OrgStats>('/stats/org'), [], {
    on: ['attendance.changed', 'request.created', 'request.decided', 'employee.changed'],
  })

  /** Today across the company, refreshed the moment anyone checks in or out. */
  const team = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: ['attendance.changed'],
  })

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

  const kpiValues: Record<string, string> = {
    'kpi.activeEmployees': fmt.number(stats.data?.activeEmployees ?? 0),
    'kpi.attendanceRate': `${fmt.number(stats.data?.attendanceRate ?? 0)}%`,
    'kpi.openRoles': fmt.number(stats.data?.openPositions ?? 0),
    'kpi.payrollCycle': stats.data
      ? fmt.money(stats.data.payrollThisCycle, stats.data.payrollCurrency)
      : t('common.dash'),
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-brand-700 to-brand p-6 text-white shadow-[0_18px_55px_rgba(29,78,216,0.24)] sm:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">{t('adminDash.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {t('dashboard.welcome', { name: user ? loc(user.fullName) : '' })}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">{t('adminDash.subtitle')}</p>
          </div>
          <Badge tone="info">{t('status.systemStable')}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, detail, icon: Icon }) => (
          <Card key={label} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">{t(label)}</p>
                <p className="mt-3 text-3xl font-bold tracking-tight">
                  {stats.loading ? <span className="inline-block h-8 w-20 animate-pulse rounded bg-line" /> : kpiValues[label]}
                </p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 text-sm text-muted">{t(detail)}</p>
          </Card>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickActions.map(({ label, desc, icon: Icon, tint }) => (
          <div key={label} className="rounded-[20px] border border-line bg-surface p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex size-9 items-center justify-center rounded-xl text-white ${tint}`} aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <span className="text-xs text-muted">{t('action.quick')}</span>
            </div>
            <p className="font-semibold text-ink">{t(label)}</p>
            <p className="mt-1 text-sm text-muted">{t(desc)}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card title={t('adminDash.opsTitle')} icon={Building2} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="grid gap-4 md:grid-cols-3">
            {opsCards.map((item) => (
              <div key={item.title} className="rounded-2xl border border-line bg-paper p-4">
                <p className="text-sm text-muted">{t(item.title)}</p>
                <p className="mt-2 text-2xl font-bold">
                  {stats.loading ? (
                    <span className="inline-block h-7 w-14 animate-pulse rounded bg-line" />
                  ) : stats.data ? (
                    fmt.number(item.pick(stats.data))
                  ) : (
                    t('common.dash')
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">{t(item.sub)}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <TrendingUp className="size-4 text-brand" aria-hidden="true" /> {t('adminDash.trend')}
            </div>
            <BarChart className="mt-3" caption={t('chart.headcountTrend')} data={trend} highlightId={trend.at(-1)?.id} />
          </div>
        </Card>

        <Card title={t('alerts.title')} icon={AlertTriangle} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li key={alert} className="flex gap-3 rounded-xl border border-line bg-paper p-3 text-sm text-ink">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                <span>{t(alert)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title={t('adminDash.teamTitle')} icon={Users} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="space-y-3">
            {team.data?.rows.slice(0, 6).map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{loc(member.name)}</p>
                  <p className="text-xs text-muted">{loc(member.department)}</p>
                </div>
                <Badge tone={statusTone[member.status]}>{t(`attStatus.${member.status}`)}</Badge>
              </div>
            ))}
            {team.data?.rows.length === 0 && <p className="text-sm text-muted">{t('chart.empty')}</p>}
          </div>
        </Card>

        <Card title={t('adminDash.activityTitle')} icon={Activity} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="space-y-3">
            {activity.map((item, index) => (
              <div key={item} className="rounded-xl border border-line bg-paper p-3 text-sm text-ink">
                <div className="flex items-center justify-between gap-3">
                  <span>{t(item)}</span>
                  <span className="shrink-0 text-xs text-muted">{t('adminDash.hoursAgo', { count: index + 1 })}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
