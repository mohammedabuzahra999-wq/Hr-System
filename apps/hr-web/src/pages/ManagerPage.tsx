import {
  AlertCircle,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  FileText,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Announcement, EmployeeRequest, ServerEventType, TeamAttendanceRow, TeamStats } from '@hr/shared'
import { MyAttendanceCard } from '@/features/attendance/MyAttendanceCard'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Meter } from '@/components/ui/Meter'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/** Hoisted so the subscriptions are not torn down and rebuilt on every render. */
const TEAM_EVENTS: ServerEventType[] = ['attendance.changed', 'request.created', 'request.decided']
const REQUEST_EVENTS: ServerEventType[] = ['request.created', 'request.decided']
const FEED_EVENTS: ServerEventType[] = ['announcement.published']

type Tone = 'success' | 'warning' | 'danger' | 'info'

/** The statuses a manager filters by. Holiday and weekend are the calendar's, not a person's. */
type StatusFilter = 'present' | 'late' | 'absent' | 'leave'

const quickNav: { label: TKey; target: string }[] = [
  { label: 'mgrHome.navOverview', target: '#overview' },
  { label: 'mgrHome.navAttendance', target: '#attendance' },
  { label: 'mgrHome.navApprovals', target: '#approvals' },
  { label: 'mgrHome.navTeam', target: '#team' },
  { label: 'mgrHome.navReports', target: '#reports' },
]

/** `status: null` is the "all" chip. Filtering is by key, so it survives a language switch. */
const filters: { label: TKey; status: StatusFilter | null }[] = [
  { label: 'common.all', status: null },
  { label: 'attStatus.present', status: 'present' },
  { label: 'attStatus.late', status: 'late' },
  { label: 'attStatus.absent', status: 'absent' },
  { label: 'attStatus.leave', status: 'leave' },
]

const statusTones: Record<TeamAttendanceRow['status'], BadgeTone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave: 'info',
  holiday: 'neutral',
  weekend: 'neutral',
}

const overviewTints: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-danger-soft text-red-600',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-brand-50 text-brand',
}

/**
 * The manager's dashboard, live.
 *
 * Every figure on this page is counted by the API from the same tables the rest
 * of the portal reads, so a tile and the list under it cannot disagree. Nothing
 * here keeps a local copy of a number: a check-in, a submitted request or a
 * decision arrives as an event and the affected query refetches itself.
 */
export function ManagerPage() {
  const { t, loc, fmt, days, duration } = useI18n()
  const [activeStatus, setActiveStatus] = useState<StatusFilter | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const stats = useLiveQuery<TeamStats>(() => api.get('/stats/team'), [], { on: TEAM_EVENTS })
  const team = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: TEAM_EVENTS,
  })
  const inbox = useLiveQuery<{ requests: EmployeeRequest[] }>(() => api.get('/requests/inbox'), [], {
    on: REQUEST_EVENTS,
  })
  const feed = useLiveQuery<{ announcements: Announcement[] }>(() => api.get('/feed/announcements'), [], {
    on: FEED_EVENTS,
  })

  const figures = stats.data
  const rows = useMemo(() => team.data?.rows ?? [], [team.data])
  const pending = useMemo(
    () => (inbox.data?.requests ?? []).filter((request) => request.status === 'pending'),
    [inbox.data],
  )
  const announcements = useMemo(() => feed.data?.announcements ?? [], [feed.data])
  const latestAnnouncement = announcements[0]

  const visibleRows = useMemo(
    () => (activeStatus ? rows.filter((row) => row.status === activeStatus) : rows),
    [rows, activeStatus],
  )

  /** A figure is either the real one or absent — never a placeholder number while it loads. */
  const figure = (value: number | undefined) =>
    value === undefined ? (stats.loading ? t('common.loading') : t('common.dash')) : fmt.number(value)

  const percent = (value: number | undefined) =>
    value === undefined ? (stats.loading ? t('common.loading') : t('common.dash')) : `${fmt.number(value)}%`

  /** "Loading…" is a word, not a figure, so it does not wear the figure's weight. */
  const tileClass = figures ? 'mt-3 text-2xl font-bold tracking-tight' : 'mt-3 text-base font-medium text-muted'
  const reportClass = figures ? 'text-3xl font-bold' : 'text-lg font-medium text-muted'

  const overview: { label: TKey; value: string; tone: Tone; icon: LucideIcon }[] = [
    { label: 'mgrHome.ovTeamSize', value: figure(figures?.teamSize), tone: 'info', icon: Users },
    { label: 'mgrHome.ovPresent', value: figure(figures?.presentToday), tone: 'success', icon: CheckCircle2 },
    { label: 'mgrHome.ovAbsent', value: figure(figures?.absentToday), tone: 'danger', icon: AlertCircle },
    { label: 'mgrHome.ovPending', value: figure(figures?.pendingApprovals), tone: 'warning', icon: Clock3 },
  ]

  /** Each hint states something the API actually returned, not a stock number. */
  const quickActions: { label: TKey; hint: string; icon: LucideIcon; tint: string }[] = [
    {
      label: 'mgrHome.qaApprove',
      hint: inbox.loading ? t('common.loading') : t('empHome.pendingCount', { count: pending.length }),
      icon: CheckCircle2,
      tint: 'bg-amber-500',
    },
    {
      label: 'mgrHome.qaAttendance',
      hint: percent(figures?.attendanceRate),
      icon: TrendingUp,
      tint: 'bg-emerald-500',
    },
    {
      label: 'mgrHome.qaAnnounce',
      hint: latestAnnouncement
        ? loc(latestAnnouncement.title)
        : feed.loading
          ? t('common.loading')
          : t('announcements.empty'),
      icon: Megaphone,
      tint: 'bg-red-500',
    },
  ]

  const loadError = stats.error ?? team.error ?? inbox.error ?? feed.error
  const banner = actionError ?? (loadError ? errorText(t, loadError) : null)

  function titleOf(request: EmployeeRequest) {
    if (!request.leave) return t(`requests.kind.${request.kind as 'certificate' | 'detailsUpdate'}`)
    return t('requests.leaveTitle', {
      type: t(`leaveType.${request.leave.type}`),
      days: days(request.leave.days),
    })
  }

  /** Deciding here is the same round trip as the approvals page, so both stay in step. */
  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusyId(id)
    setActionError(null)
    try {
      await api.post(`/requests/${id}/decide`, { decision })
      inbox.refresh()
      stats.refresh()
      team.refresh()
    } catch (error) {
      setActionError(errorText(t, error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand via-brand-700 to-sky-700 p-6 text-white shadow-[0_18px_55px_rgba(29,78,216,0.25)] sm:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">{t('mgrHome.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t('mgrHome.title')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/80">{t('mgrHome.subtitle')}</p>
          </div>
          <a
            href="#attendance"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand transition hover:bg-slate-100"
          >
            {t('mgrHome.viewAttendance')}
          </a>
        </div>
      </div>

      {/*
        Everyone records their own day, not only employees.
        The server never restricted check-in; only the card was missing here, so
        an attendance report quietly excluded everybody senior — which is the one
        thing an attendance report must not do.
      */}
      <MyAttendanceCard />

      <div className="flex flex-wrap gap-2">
        {quickNav.map((item) => (
          <a
            key={item.label}
            href={item.target}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand"
          >
            {t(item.label)}
          </a>
        ))}
      </div>

      {banner && (
        <Alert>
          {banner}
        </Alert>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickActions.map(({ label, hint, icon: Icon, tint }) => (
          <div key={label} className="rounded-[20px] border border-line bg-surface p-4 shadow-[0_8px_20px_rgba(var(--shadow-tint),0.03)]">
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex size-9 items-center justify-center rounded-xl text-white ${tint}`} aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <span className="text-xs text-muted">{t('action.label')}</span>
            </div>
            <p className="font-semibold text-ink">{t(label)}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{hint}</p>
          </div>
        ))}
      </section>

      <section id="overview" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overview.map(({ label, value, tone, icon: Icon }) => (
          <Card key={label} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">{t(label)}</p>
                <p className={tileClass}>{value}</p>
              </div>
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${overviewTints[tone]}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </div>
          </Card>
        ))}
      </section>

      <section id="attendance" className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title={t('mgrHome.todayTitle')} icon={CalendarCheck2} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          <div className="mb-4 flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => setActiveStatus(filter.status)}
                aria-pressed={activeStatus === filter.status}
                className={[
                  'rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
                  activeStatus === filter.status
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-paper text-muted hover:border-brand/40 hover:text-brand',
                ].join(' ')}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>

          {team.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted">{t('chart.empty')}</p>
          ) : (
            <div className="space-y-3">
              {visibleRows.map((person) => (
                <div key={person.userId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{loc(person.name)}</p>
                    <p className="text-xs text-muted">{loc(person.department)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-xs text-muted">
                      {person.checkIn ? fmt.time(person.checkIn) : t('common.dash')}
                    </span>
                    <Badge tone={statusTones[person.status]}>{t(`attStatus.${person.status}`)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('mgrHome.pendingTitle')} icon={Bell} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          {inbox.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted">{t('common.noData')}</p>
          ) : (
            <div className="space-y-3">
              {pending.map((item) => (
                <div key={item.id} className="rounded-xl border border-line bg-paper p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{loc(item.employeeName)}</p>
                      <p className="mt-1 text-sm text-muted">{titleOf(item)}</p>
                    </div>
                    <Badge tone="warning">{t('status.pending')}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {item.leave ? `${t('common.dayRange', { from: item.leave.from, to: item.leave.to })} · ` : ''}
                    {t('requests.submitted', { date: item.submittedAt })}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void decide(item.id, 'approved')}
                      className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-45"
                    >
                      {t('action.approve')}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void decide(item.id, 'rejected')}
                      className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15 disabled:opacity-45"
                    >
                      {t('action.reject')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section id="approvals" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title={t('mgrHome.attendanceSummary')} icon={Users} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          <DataTable
            rows={rows}
            rowKey={(row) => row.userId}
            loading={team.loading}
            empty={t('chart.empty')}
            columns={[
              {
                key: 'employee',
                header: t('table.employee'),
                primary: true,
                cell: (row) => <p className="font-medium text-ink">{loc(row.name)}</p>,
              },
              {
                key: 'checkIn',
                header: t('table.checkIn'),
                cell: (row) => (
                  <span className="tabular-nums text-muted">
                    {row.checkIn ? fmt.time(row.checkIn) : t('common.dash')}
                  </span>
                ),
              },
              {
                key: 'status',
                header: t('table.status'),
                cell: (row) => <Badge tone={statusTones[row.status]}>{t(`attStatus.${row.status}`)}</Badge>,
              },
              {
                key: 'hours',
                header: t('table.hours'),
                cell: (row) => (
                  <span className="tabular-nums text-muted">
                    {row.workedMs > 0 ? duration(row.workedMs) : t('common.dash')}
                  </span>
                ),
              },
            ]}
          />
        </Card>

        <Card title={t('mgrHome.performance')} icon={TrendingUp} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(var(--shadow-tint),0.04)]">
          {!figures ? (
            <p className="text-sm text-muted">{stats.loading ? t('common.loading') : t('common.noData')}</p>
          ) : (
            <div className="space-y-5">
              {/*
                One hue across all three: these are three measures, not three states, so a
                green and an amber bar would imply a good/warning reading the data never made.
              */}
              <Meter
                label={t('mgrHome.perfAttendance')}
                value={figures.attendanceRate}
                max={100}
                valueText={`${fmt.number(figures.attendanceRate)}%`}
                caption={t('empHome.today')}
              />
              <Meter
                label={t('mgrHome.perfLeave')}
                value={figures.leaveRequestsThisMonth}
                max={figures.teamSize}
                valueText={fmt.number(figures.leaveRequestsThisMonth)}
                caption={`${t('mgrHome.perfLateSub')} · ${t('chart.ofMax', { max: fmt.number(figures.teamSize) })}`}
              />
              <Meter
                label={t('mgrHome.perfLate')}
                value={figures.lateThisMonth}
                max={figures.teamSize}
                valueText={fmt.number(figures.lateThisMonth)}
                caption={`${t('mgrHome.perfLateSub')} · ${t('chart.ofMax', { max: fmt.number(figures.teamSize) })}`}
              />
            </div>
          )}
        </Card>
      </section>

      <section id="team" className="grid gap-6">
        <Card title={t('mgrHome.announcementsTitle')} icon={ShieldCheck} className="rounded-2xl">
          {feed.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-muted">{t('announcements.empty')}</p>
          ) : (
            <div className="space-y-3">
              {announcements.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-xl border border-line bg-paper p-3 text-sm text-ink">
                  {/* Written by a person, so it carries both languages rather than a key. */}
                  <p className="font-medium text-ink">{loc(item.title)}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{loc(item.detail)}</p>
                  <p className="mt-1 text-xs text-muted">{fmt.date(item.publishedAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section id="reports" className="grid gap-6 md:grid-cols-2">
        <Card title={t('mgrHome.trendTitle')} icon={TrendingUp} className="rounded-2xl">
          <p className={reportClass}>{percent(figures?.attendanceRate)}</p>
          <p className="mt-2 text-sm text-muted">{t('empHome.today')}</p>
        </Card>

        <Card title={t('mgrHome.absenceTitle')} icon={FileText} className="rounded-2xl">
          <p className={reportClass}>{figure(figures?.absentToday)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrHome.absenceSub')}</p>
        </Card>
      </section>
    </div>
  )
}
