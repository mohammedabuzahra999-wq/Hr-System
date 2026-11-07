import { Activity, AlertTriangle, ArrowUpRight, BriefcaseBusiness, Building2, Megaphone, UserPlus, Users, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Announcement, OrgStats, ServerEventType } from '@hr/shared'
import { MyAttendanceCard } from '@/features/attendance/MyAttendanceCard'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { AnnouncementList } from '@/features/announcements/AnnouncementList'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/** Labels and icons are fixed; every figure on this page comes from `/stats/org`. */
const kpis: { label: TKey; icon: LucideIcon }[] = [
  { label: 'kpi.activeEmployees', icon: Users },
  { label: 'kpi.attendanceRate', icon: Activity },
  { label: 'kpi.openRoles', icon: BriefcaseBusiness },
  { label: 'kpi.payrollCycle', icon: Wallet },
]

/**
 * Declared once at module level: a fresh array on every render would make the
 * subscription effect tear down and re-open its listener each time.
 */
const ORG_EVENTS: ServerEventType[] = [
  'attendance.changed',
  'request.created',
  'request.decided',
  'employee.changed',
]

const ANNOUNCEMENT_EVENTS: ServerEventType[] = ['announcement.published']

const alerts: TKey[] = ['alerts.contracts', 'alerts.approvals', 'alerts.payroll']

type QuickActionId = 'users' | 'attendance' | 'reports'

/** Each one navigates; a tile that looks like a control and does nothing is worse than no tile. */
const quickActions: { id: QuickActionId; label: TKey; icon: LucideIcon; tint: string; to: string }[] = [
  { id: 'users', label: 'admin.qaUsers', icon: Users, tint: 'bg-brand', to: '/admin/users' },
  { id: 'attendance', label: 'admin.qaAttendance', icon: Activity, tint: 'bg-amber-500', to: '/dashboard' },
  { id: 'reports', label: 'admin.qaReports', icon: BriefcaseBusiness, tint: 'bg-red-500', to: '/dashboard' },
]

/**
 * The operational view now reports what the API actually knows. Hiring pipeline,
 * reviews due and training completion have no source behind them, so they are
 * gone rather than shown as numbers nobody can trace.
 */
const opsTiles: { title: TKey; sub: TKey; pick: (stats: OrgStats) => number; to?: string }[] = [
  // The pending count is the one tile that is also a task, so it is the one that navigates.
  { title: 'hrLeaves.pending', sub: 'hrLeaves.pendingSub', pick: (stats) => stats.pendingApprovals, to: '/admin/approvals' },
  { title: 'hrEmp.onLeave', sub: 'hrEmp.onLeaveSub', pick: (stats) => stats.onLeaveToday },
  { title: 'kpi.activeEmployees', sub: 'adminUsers.employeesSub', pick: (stats) => stats.activeEmployees },
]


/** A placeholder shaped like the figure it is waiting for — never a stand-in number. */
function Skeleton({ className }: { className: string }) {
  return <span className={`inline-block animate-pulse rounded bg-line ${className}`} aria-hidden="true" />
}

export function AdminPage() {
  const { t, fmt } = useI18n()

  const stats = useLiveQuery<OrgStats>(() => api.get<OrgStats>('/stats/org'), [], { on: ORG_EVENTS })
  const feed = useLiveQuery<{ announcements: Announcement[] }>(() => api.get('/feed/announcements'), [], {
    on: ANNOUNCEMENT_EVENTS,
  })
  const org = stats.data

  /** One query feeds the tiles and the hints below, so every figure on screen agrees. */
  const kpiValues: Record<string, string> = org
    ? {
        'kpi.activeEmployees': fmt.number(org.activeEmployees),
        'kpi.attendanceRate': `${fmt.number(org.attendanceRate)}%`,
        'kpi.openRoles': fmt.number(org.openPositions),
        'kpi.payrollCycle': fmt.money(org.payrollThisCycle, org.payrollCurrency),
      }
    : {}

  /** `reports` has no figure behind it, so it carries no subtitle at all. */
  const quickHints: Record<QuickActionId, ReactNode> = {
    users: stats.loading ? (
      <Skeleton className="h-4 w-24" />
    ) : org ? (
      t('chart.headcountValue', { count: fmt.number(org.activeEmployees) })
    ) : null,
    attendance: stats.loading ? <Skeleton className="h-4 w-14" /> : org ? `${fmt.number(org.attendanceRate)}%` : null,
    reports: null,
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-brand-700 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.2)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.admin')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('admin.title')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="info">{t('status.systemStable')}</Badge>
            {/*
              The form itself lives on the user-roles page; `?add=1` opens it
              there, so adding a user is reachable from the overview without a
              second copy of the form to keep in step.
            */}
            <Link
              to="/admin/users?add=1"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-brand transition hover:bg-slate-100"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {t('adminUsers.add')}
            </Link>
          </div>
        </div>
      </div>

      {/*
        Everyone records their own day, not only employees.
        The server never restricted check-in; only the card was missing here, so
        an attendance report quietly excluded everybody senior — which is the one
        thing an attendance report must not do.
      */}
      <MyAttendanceCard />

      {stats.error && (
        <Alert>
          {errorText(t, stats.error)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, icon: Icon }) => (
          <Card key={label} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">{t(label)}</p>
                <p className="mt-3 text-2xl font-bold tracking-tight">
                  {stats.loading ? <Skeleton className="h-7 w-20" /> : (kpiValues[label] ?? t('common.dash'))}
                </p>
              </div>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Three columns for three tiles — a four-wide row left one slot empty. */}
      <section className="grid gap-4 md:grid-cols-3">
        {quickActions.map(({ id, label, icon: Icon, tint, to }) => (
          <Link
            key={id}
            to={to}
            className="rounded-[20px] border border-line bg-surface p-4 text-start shadow-[0_8px_20px_rgba(var(--shadow-tint),0.03)] transition hover:border-brand hover:shadow-[0_12px_28px_rgba(29,78,216,0.08)]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex size-9 items-center justify-center rounded-xl text-white ${tint}`} aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <ArrowUpRight className="size-4 text-muted rtl:-scale-x-100" aria-hidden="true" />
            </div>
            <p className="font-semibold text-ink">{t(label)}</p>
            {quickHints[id] !== null && <p className="mt-1 text-sm text-muted">{quickHints[id]}</p>}
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title={t('admin.opsTitle')} icon={Building2} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          <div className="grid gap-4 md:grid-cols-3">
            {opsTiles.map(({ title, sub, pick, to }) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-muted">{t(title)}</p>
                    {to && <ArrowUpRight className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />}
                  </div>
                  <p className="mt-2 text-2xl font-bold">
                    {stats.loading ? <Skeleton className="h-7 w-14" /> : org ? fmt.number(pick(org)) : t('common.dash')}
                  </p>
                  <p className="mt-1 text-xs text-muted">{t(sub)}</p>
                </>
              )

              return to ? (
                <Link
                  key={title}
                  to={to}
                  className="rounded-xl border border-line bg-paper p-4 transition hover:border-brand hover:shadow-[0_10px_24px_rgba(29,78,216,0.08)]"
                >
                  {body}
                </Link>
              ) : (
                <div key={title} className="rounded-xl border border-line bg-paper p-4">
                  {body}
                </div>
              )
            })}
          </div>
        </Card>

        <Card title={t('alerts.title')} icon={AlertTriangle} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
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

      {/*
        This card used to list three fixed sentences that described nothing that
        had happened. It now shows what HR actually announced to the company.
      */}
      <Card title={t('announcements.title')} icon={Megaphone} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
        <AnnouncementList items={feed.data?.announcements ?? []} loading={feed.loading} />
      </Card>
    </div>
  )
}
