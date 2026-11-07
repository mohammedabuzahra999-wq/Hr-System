import { BriefcaseBusiness, FileText, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Employee, Role, ServerEventType, TeamAttendanceRow } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmployeeLookup } from '@/features/employees/EmployeeLookup'
import { DataTable } from '@/components/ui/DataTable'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { PresenceBadge } from '@/features/people/PresenceBadge'
import { EmployeeCvModal } from '@/features/recruitment/EmployeeCvModal'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * A row's work status: is the account on, and are they on leave today. All three
 * are dictionary keys, so the badge can render one directly.
 */
type StatusKey = 'status.active' | 'attStatus.leave' | 'status.inactive'
type Tone = 'success' | 'warning' | 'danger'

/**
 * The chips filter on two different things, so the value is not just a status.
 *
 * `online` asks whether someone is in the app right now — a presence question —
 * while the rest ask about the account and today's leave. Keeping them in one
 * union but tagged means neither can be passed where the other belongs.
 */
type Filter = { kind: 'all' } | { kind: 'status'; status: StatusKey } | { kind: 'online' }

const ROSTER_EVENTS: ServerEventType[] = ['employee.changed', 'presence.changed']

const tones: Record<StatusKey, Tone> = {
  'status.active': 'success',
  'attStatus.leave': 'warning',
  'status.inactive': 'danger',
}

/** Filtering is by key, so a choice survives a language switch. */
const filters: { label: TKey; value: Filter }[] = [
  { label: 'common.all', value: { kind: 'all' } },
  { label: 'filter.onlineNow', value: { kind: 'online' } },
  { label: 'status.active', value: { kind: 'status', status: 'status.active' } },
  { label: 'attStatus.leave', value: { kind: 'status', status: 'attStatus.leave' } },
  { label: 'status.inactive', value: { kind: 'status', status: 'status.inactive' } },
]

const sameFilter = (a: Filter, b: Filter) =>
  a.kind === b.kind && (a.kind !== 'status' || b.kind !== 'status' || a.status === b.status)

export function HrEmployeesPage() {
  const { t, loc, fmt } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const roleValue = searchParams.get('role')
  const roleFilter: Role | null =
    roleValue === 'employee' || roleValue === 'manager' || roleValue === 'hr' || roleValue === 'admin'
      ? roleValue
      : null
  const setQuery = (value: string) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [cvFor, setCvFor] = useState<Employee | null>(null)

  /**
   * Presence lapses by the clock, not by an event: nobody sends anything when
   * an app is closed, that is the whole point. So this screen refetches on a
   * timer as well as on events, or a row would sit on 'in the app now' until
   * something unrelated happened.
   */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  /**
   * Refetched when the roster changes and when anyone opens or closes the app,
   * so the presence column is a live reading rather than a snapshot from
   * whenever the page happened to load.
   */
  const people = useLiveQuery<{ employees: Employee[] }>(() => api.get('/employees'), [tick], {
    on: ROSTER_EVENTS,
  })

  /**
   * "On leave" is not a field on an employee record, so it is read off today's
   * attendance rather than invented: whoever is booked as `leave` today.
   */
  const attendance = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: ['attendance.changed', 'request.decided'],
  })

  const all = useMemo(() => people.data?.employees ?? [], [people.data])

  const onLeaveIds = useMemo(() => {
    const rows = attendance.data?.rows ?? []
    return new Set(rows.filter((row) => row.status === 'leave').map((row) => row.userId))
  }, [attendance.data])

  /** The account's own flag, with today's approved leave laid over it. */
  const statusOf = useCallback(
    (person: Employee): StatusKey => {
      if (!person.isActive) return 'status.inactive'
      return onLeaveIds.has(person.id) ? 'attStatus.leave' : 'status.active'
    },
    [onLeaveIds],
  )

  const activeCount = useMemo(() => all.filter((person) => person.isActive).length, [all])
  const onLeaveCount = useMemo(
    () => all.filter((person) => person.isActive && onLeaveIds.has(person.id)).length,
    [all, onLeaveIds],
  )

  const visibleEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return all.filter((person) => {
      if (roleFilter && person.role !== roleFilter) return false
      // The two kinds of chip ask different questions: one about presence, the
      // other about the account and today's leave.
      if (filter.kind === 'online' && person.presence !== 'online') return false
      if (filter.kind === 'status' && statusOf(person) !== filter.status) return false
      if (!normalized) return true
      // Match either language, so a search survives switching between them.
      return [person.fullName, person.department].some((field) =>
        `${field.en} ${field.ar}`.toLowerCase().includes(normalized),
      ) || person.employeeNumber.toLowerCase().includes(normalized)
    })
  }, [all, filter, roleFilter, statusOf, query])

  /*
   * The voice layer receives only a selected record id and a compact result
   * count. It is advisory UI state, never an authorization claim: Copilot
   * still re-resolves every employee under the signed-in user's scope.
   */
  useEffect(() => {
    const openEmployeeNumber = searchParams.get('open')?.trim().toLowerCase()
    const selectedEmployeeId = openEmployeeNumber
      ? all.find((person) => person.employeeNumber.toLowerCase() === openEmployeeNumber)?.id
      : undefined
    window.dispatchEvent(new CustomEvent('hr:voice-context', {
      detail: {
        ...(selectedEmployeeId ? { selectedEmployeeId } : {}),
        previousResultReference: `employees:${visibleEmployees.length}`,
      },
    }))
  }, [all, searchParams, visibleEmployees.length])

  // Until both queries land, a row's status would be a guess — so wait instead.
  const listLoading = people.loading || attendance.loading
  const failure = people.error ?? attendance.error

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-sky-900 to-brand p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.18)] sm:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.hr')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('hrEmp.title')}</h2>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20">
            {people.data
              ? t('chart.headcountValue', { count: fmt.number(all.length) })
              : t('common.loading')}
          </div>

      {/*
        Above the list, because it is the first thing HR reaches for: somebody
        rings with a number and wants an answer, not a filtered table.
      */}
      <EmployeeLookup employeeNumber={searchParams.get('open')} />
        </div>
      </div>

      {failure && (
        <Alert>
          {errorText(t, failure)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('hrEmp.active')} icon={Users} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{people.data ? fmt.number(activeCount) : t('common.dash')}</p>
          <p className="mt-2 text-sm text-muted">{t('hrEmp.activeSub')}</p>
        </Card>
        <Card title={t('hrEmp.onLeave')} icon={BriefcaseBusiness} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">
            {people.data && attendance.data ? fmt.number(onLeaveCount) : t('common.dash')}
          </p>
          <p className="mt-2 text-sm text-muted">{t('hrEmp.onLeaveSub')}</p>
        </Card>
      </div>

      <Card title={t('hrEmp.directory')} icon={Users} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted md:min-w-[220px]">
            <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.byEmployeeOrDept')}
              aria-label={t('search.byEmployeeOrDept')}
              className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {filters.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => setFilter(chip.value)}
                aria-pressed={sameFilter(filter, chip.value)}
                className={[
                  'rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
                  sameFilter(filter, chip.value)
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-paper text-muted hover:border-brand/40 hover:text-brand',
                ].join(' ')}
              >
                {t(chip.label)}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          rows={visibleEmployees}
          rowKey={(person) => person.id}
          loading={listLoading}
          empty={t('adminUsers.empty')}
          columns={[
            {
              key: 'employee',
              header: t('table.employee'),
              primary: true,
              cell: (person) => <span className="font-medium text-ink">{loc(person.fullName)}</span>,
            },
            {
              key: 'department',
              header: t('table.department'),
              cell: (person) => <span className="text-muted">{loc(person.department)}</span>,
            },
            {
              key: 'presence',
              header: t('table.presence'),
              cell: (person) => <PresenceBadge person={person} />,
            },
            {
              key: 'status',
              header: t('table.status'),
              cell: (person) => {
                const status = statusOf(person)
                return <Badge tone={tones[status]}>{t(status)}</Badge>
              },
            },
            {
              key: 'cv',
              header: t('table.cv'),
              action: true,
              alignEnd: true,
              cell: (person) => (
                <button
                  type="button"
                  onClick={() => setCvFor(person)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  {t('recruit.employeeCv')}
                </button>
              ),
            },
          ]}
        />
      </Card>

      <EmployeeCvModal employee={cvFor} onClose={() => setCvFor(null)} />
    </div>
  )
}
