import { KeyRound, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Employee, ResetPasswordResult, Role } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { AddEmployeeModal } from '@/features/admin/AddEmployeeModal'
import { TemporaryPasswordDialog } from '@/features/admin/TemporaryPasswordDialog'
import { useAuth } from '@/features/auth/useAuth'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/** `role: null` is the "all" chip. Filtering is by key, so it survives a language switch. */
const filters: { label: TKey; role: Role | null }[] = [
  { label: 'common.all', role: null },
  { label: 'role.admin', role: 'admin' },
  { label: 'role.hr', role: 'hr' },
  { label: 'role.manager', role: 'manager' },
  { label: 'role.employee', role: 'employee' },
]

export function AdminUsersPage() {
  const { t, loc, fmt } = useI18n()
  const { user: actor } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const roleValue = params.get('role')
  const activeRole: Role | null =
    roleValue === 'employee' || roleValue === 'manager' || roleValue === 'hr' || roleValue === 'admin'
      ? roleValue
      : null
  const setQuery = (value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  const setActiveRole = (role: Role | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (role) next.set('role', role)
      else next.delete('role')
      return next
    }, { replace: true })
  const [resetting, setResetting] = useState<string | null>(null)
  const [issued, setIssued] = useState<ResetPasswordResult | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  /*
   * The form's open state lives in the URL, so "Add a user" elsewhere in the
   * admin area is a plain link here rather than a second copy of the form.
   */
  const addOpen = params.get('add') === '1'
  const setAddOpen = (open: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (open) next.set('add', '1')
        else next.delete('add')
        return next
      },
      { replace: true },
    )

  const people = useLiveQuery<{ employees: Employee[] }>(() => api.get('/employees'), [], {
    on: ['employee.changed'],
  })

  const all = useMemo(() => people.data?.employees ?? [], [people.data])

  const counts = useMemo(
    () => ({
      admin: all.filter((p) => p.role === 'admin').length,
      hr: all.filter((p) => p.role === 'hr').length,
      manager: all.filter((p) => p.role === 'manager').length,
      employee: all.filter((p) => p.role === 'employee').length,
    }),
    [all],
  )

  /** Anyone who supervises, so a new hire can be pointed at a real person. */
  const managers = useMemo(
    () => all.filter((p) => p.role === 'manager' || p.role === 'hr' || p.role === 'admin'),
    [all],
  )

  /**
   * The same ceiling the server enforces: only an administrator may reset an
   * administrator, and nobody resets themselves. Hiding a button the API would
   * refuse is kinder than offering it and failing.
   */
  const mayReset = (person: Employee) =>
    person.id !== actor?.id && (person.role !== 'admin' || actor?.role === 'admin')

  async function resetPassword(person: Employee) {
    if (!window.confirm(t('adminUsers.resetConfirm', { name: loc(person.fullName) }))) return
    setResetting(person.id)
    setResetError(null)
    try {
      setIssued(await api.post<ResetPasswordResult>(`/employees/${person.id}/reset-password`))
    } catch (error) {
      setResetError(errorText(t, error))
    } finally {
      setResetting(null)
    }
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return all.filter((person) => {
      if (activeRole && person.role !== activeRole) return false
      if (!normalized) return true
      return `${person.fullName.en} ${person.fullName.ar} ${person.email} ${person.employeeNumber} ${person.department.en} ${person.department.ar}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [all, activeRole, query])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-brand-700 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.2)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.admin')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('adminUsers.title')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20">
              {t('adminUsers.total', { count: fmt.number(all.length) })}
            </span>
            <Button
              onClick={() => setAddOpen(true)}
              className="bg-white text-brand shadow-none hover:bg-slate-100"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {t('adminUsers.add')}
            </Button>
          </div>
        </div>
      </div>

      {created && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t('adminUsers.created', { name: created })}
        </p>
      )}

      {(people.error || resetError) && (
        <Alert>
          {resetError ?? errorText(t, people.error)}
        </Alert>
      )}

      {/* Says why there is no "show password" anywhere on this screen. */}
      <p className="flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        {t('adminUsers.passwordsNote')}
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('adminUsers.managers')} icon={Users} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{fmt.number(counts.manager)}</p>
          <p className="mt-2 text-sm text-muted">{t('adminUsers.managersSub')}</p>
        </Card>
        <Card title={t('adminUsers.hrStaff')} icon={ShieldCheck} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{fmt.number(counts.hr)}</p>
          <p className="mt-2 text-sm text-muted">{t('adminUsers.hrStaffSub')}</p>
        </Card>
        <Card title={t('adminUsers.employees')} icon={Users} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
          <p className="text-3xl font-bold">{fmt.number(counts.employee)}</p>
          <p className="mt-2 text-sm text-muted">{t('adminUsers.employeesSub')}</p>
        </Card>
      </div>

      <Card title={t('adminUsers.matrix')} icon={ShieldCheck} className="rounded-[22px] border-transparent shadow-[0_12px_30px_rgba(var(--shadow-tint),0.04)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted md:min-w-[220px]">
            <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.byUserOrRole')}
              aria-label={t('search.byUserOrRole')}
              className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => setActiveRole(filter.role)}
                aria-pressed={activeRole === filter.role}
                className={[
                  'rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
                  activeRole === filter.role
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-paper text-muted hover:border-brand/40 hover:text-brand',
                ].join(' ')}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          rows={visible}
          rowKey={(person) => person.id}
          loading={people.loading}
          empty={t('adminUsers.empty')}
          columns={[
            {
              key: 'user',
              header: t('table.user'),
              primary: true,
              cell: (person) => (
                <>
                  <p className="font-medium text-ink">{loc(person.fullName)}</p>
                  <p className="text-xs font-normal text-muted">
                    <bdi dir="ltr">{person.email}</bdi> · {person.employeeNumber}
                  </p>
                </>
              ),
            },
            { key: 'role', header: t('table.role'), cell: (person) => t(`role.${person.role}`) },
            {
              key: 'manager',
              header: t('profile.manager'),
              cell: (person) => (person.managerName ? loc(person.managerName) : t('common.dash')),
            },
            {
              key: 'status',
              header: t('table.status'),
              cell: (person) => (
                <Badge tone={person.isActive ? 'success' : 'danger'}>
                  {t(person.isActive ? 'status.active' : 'status.inactive')}
                </Badge>
              ),
            },
            {
              key: 'action',
              header: t('table.action'),
              action: true,
              alignEnd: true,
              cell: (person) =>
                mayReset(person) ? (
                  <button
                    type="button"
                    onClick={() => void resetPassword(person)}
                    disabled={resetting !== null}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-50 disabled:opacity-45"
                  >
                    <KeyRound className="size-3.5" aria-hidden="true" />
                    {t('adminUsers.resetPassword')}
                  </button>
                ) : null,
            },
          ]}
        />
      </Card>

      <TemporaryPasswordDialog result={issued} onClose={() => setIssued(null)} />

      <AddEmployeeModal
        open={addOpen}
        managers={managers}
        onClose={() => setAddOpen(false)}
        onCreated={(employee) => {
          setCreated(loc(employee.fullName))
          people.refresh()
        }}
      />
    </div>
  )
}
