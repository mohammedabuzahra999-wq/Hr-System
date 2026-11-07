import { CalendarDays, FileText, ReceiptText, ShieldCheck, UserPlus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Employee, OrgStats, Role, ServerEventType } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'

/**
 * Hoisted so the subscription is set up once: an inline array would be a new
 * reference on every render, and the hook would resubscribe each time.
 */
const ORG_EVENTS: ServerEventType[] = [
  'attendance.changed',
  'request.created',
  'request.decided',
  'employee.changed',
]

/** A people list only moves when a person record does. */
const PEOPLE_EVENTS: ServerEventType[] = ['employee.changed']

/** Labels and icons are fixed; every figure below comes from the API at render time. */
const quickActions: { label: TKey; hint: TKey; icon: LucideIcon; tint: string }[] = [
  { label: 'hrHome.qaAdd', hint: 'adminUsers.addSub', icon: UserPlus, tint: 'bg-brand' },
  { label: 'hrHome.qaLeaves', hint: 'hrLeaves.pendingSub', icon: CalendarDays, tint: 'bg-amber-500' },
  { label: 'hrHome.qaPayroll', hint: 'hrHome.qaPayrollHint', icon: ReceiptText, tint: 'bg-emerald-500' },
]

const policies: TKey[] = ['hrHome.policy1', 'hrHome.policy2', 'hrHome.policy3']

const roleTone: Record<Role, BadgeTone> = {
  admin: 'info',
  hr: 'success',
  manager: 'warning',
  employee: 'neutral',
}

/** How many people the HR home previews; the directory page holds the full list. */
const PREVIEW = 6

export function HrPage() {
  const { t, loc, fmt } = useI18n()

  /** The tiles all read one payload, so the figures on screen agree with each other. */
  const stats = useLiveQuery<OrgStats>(() => api.get<OrgStats>('/stats/org'), [], { on: ORG_EVENTS })

  const people = useLiveQuery<{ employees: Employee[] }>(() => api.get('/employees'), [], {
    on: PEOPLE_EVENTS,
  })

  const metrics = useMemo<{ label: TKey; detail: TKey; value: string | null }[]>(() => {
    const org = stats.data
    return [
      {
        label: 'hrHome.metricTotal',
        detail: 'adminUsers.employeesSub',
        value: org ? fmt.number(org.activeEmployees) : null,
      },
      {
        label: 'kpi.openRoles',
        detail: 'hrRep.openRolesSub',
        value: org ? fmt.number(org.openPositions) : null,
      },
      {
        label: 'kpi.attendanceRate',
        detail: 'hrAtt.presentSub',
        value: org ? `${fmt.number(org.attendanceRate)}%` : null,
      },
      {
        label: 'kpi.payrollCycle',
        detail: 'hrPay.netSub',
        value: org ? fmt.money(org.payrollThisCycle, org.payrollCurrency) : null,
      },
    ]
  }, [stats.data, fmt])

  const directory = useMemo(() => (people.data?.employees ?? []).slice(0, PREVIEW), [people.data])

  const failure = stats.error ?? people.error

  /** A figure is never guessed: a skeleton while it loads, a dash if it never arrives. */
  const figure = (value: string | null) =>
    stats.loading ? (
      <span className="inline-block h-8 w-24 animate-pulse rounded bg-line" />
    ) : (
      (value ?? t('common.dash'))
    )

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-sky-900 to-brand p-6 text-white shadow-[0_18px_55px_rgba(15,23,42,0.18)] sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">{t('hrHome.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t('hrHome.title')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">{t('hrHome.subtitle')}</p>
          </div>
          <Badge tone="success">{t('hrHome.panelActive')}</Badge>
        </div>
      </div>

      {failure && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(errorKey(failure))}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">{t(metric.label)}</p>
            <p className="mt-3 text-3xl font-bold">{figure(metric.value)}</p>
            <p className="mt-2 text-xs text-muted">{t(metric.detail)}</p>
          </Card>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickActions.map(({ label, hint, icon: Icon, tint }) => (
          <div key={label} className="rounded-[20px] border border-line bg-surface p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex size-9 items-center justify-center rounded-xl text-white ${tint}`} aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <span className="text-xs text-muted">{t('action.quick')}</span>
            </div>
            <p className="font-semibold text-ink">{t(label)}</p>
            <p className="mt-1 text-sm text-muted">{t(hint)}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card title={t('hrEmp.directory')} icon={Users} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="space-y-3">
            {people.loading && <p className="text-sm text-muted">{t('common.loading')}</p>}

            {!people.loading && directory.length === 0 && (
              <p className="text-sm text-muted">{t('common.noData')}</p>
            )}

            {!people.loading &&
              directory.map((person) => (
                <div key={person.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{loc(person.fullName)}</p>
                    <p className="text-xs text-muted">{loc(person.jobTitle)}</p>
                  </div>
                  <Badge tone={roleTone[person.role]}>{t(`role.${person.role}`)}</Badge>
                </div>
              ))}
          </div>
        </Card>

        <Card title={t('hrHome.policyTitle')} icon={ShieldCheck} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <ul className="space-y-3">
            {policies.map((policy) => (
              <li key={policy} className="rounded-xl border border-line bg-paper p-3 text-sm text-ink">
                {t(policy)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('hrHome.leaveTitle')} icon={FileText} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <p className="text-3xl font-bold">
            {figure(stats.data ? fmt.number(stats.data.pendingApprovals) : null)}
          </p>
          <p className="mt-2 text-sm text-muted">{t('hrLeaves.pendingSub')}</p>
        </Card>

        <Card title={t('hrEmp.onLeave')} icon={CalendarDays} className="rounded-2xl border-transparent shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <p className="text-3xl font-bold">
            {figure(stats.data ? fmt.number(stats.data.onLeaveToday) : null)}
          </p>
          <p className="mt-2 text-sm text-muted">{t('hrEmp.onLeaveSub')}</p>
        </Card>
      </div>
    </div>
  )
}
