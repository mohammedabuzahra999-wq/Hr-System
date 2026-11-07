import { CalendarDays, FileText, Search, Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmployeeFile } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * Looking one employee up by their number.
 *
 * A lookup, not a filter. The list above already narrows on a number, which
 * answers "does this person exist"; what HR is actually asked is "what is going
 * on with EMP-1010" — leave left, absence, pay, anything waiting — and that is a
 * file, not a row.
 *
 * One request fetches all of it, so what appears on screen is one moment rather
 * than six that arrived in whatever order the network chose.
 */
export function EmployeeLookup({ employeeNumber }: { employeeNumber?: string | null }) {
  const { t, loc, fmt } = useI18n()
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<EmployeeFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (raw: string) => {
    const q = raw.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setFile(null)
    try {
      const d = await api.get<{ file: EmployeeFile }>(`/employees/lookup/${encodeURIComponent(q)}`)
      setFile(d.file)
    } catch (err) {
      // A number that matches nobody is an ordinary outcome, not a fault.
      setError((err as { status?: number }).status === 404 ? t('lookup.notFound') : errorText(t, err))
    } finally {
      setBusy(false)
    }
  }, [busy, t])

  function look(e: React.FormEvent) {
    e.preventDefault()
    void load(number)
  }

  /*
   * A typed UI command may navigate here with an employee number. This reads
   * the same protected lookup service the Search button uses; it is not a
   * client-side reconstruction of an employee record. Remember the last
   * command so a refresh/re-render never issues the request repeatedly.
   */
  const opened = useRef<string | null>(null)
  useEffect(() => {
    const next = employeeNumber?.trim().toUpperCase() ?? ''
    if (!next || opened.current === next) return
    opened.current = next
    setNumber(next)
    void load(next)
  }, [employeeNumber, load])

  const e = file?.employee
  const money = (n: number) => `${n.toFixed(2)}`

  return (
    <Card title={t('lookup.title')} icon={Search} className="rounded-2xl">
      <form onSubmit={look} className="flex flex-wrap items-center gap-2">
        <input
          value={number}
          onChange={(ev) => setNumber(ev.target.value.toUpperCase())}
          placeholder={t('lookup.hint')}
          dir="ltr"
          maxLength={40}
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        <button
          type="submit"
          disabled={busy || !number.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-45"
        >
          <Search className="size-4" aria-hidden="true" />
          {busy ? t('common.loading') : t('lookup.search')}
        </button>
        {file && (
          <button
            type="button"
            onClick={() => {
              setFile(null)
              setNumber('')
              setError(null)
            }}
            aria-label={t('lookup.clear')}
            className="grid size-10 place-items-center rounded-md border border-line bg-paper text-muted transition hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {file && e && (
        <div className="mt-4 space-y-4">
          {/* who they are */}
          <div className="rounded-xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold text-ink">
                  <bdi>{loc(e.fullName)}</bdi>
                </p>
                <p className="text-sm text-muted">
                  {loc(e.jobTitle)} · {loc(e.department)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted" dir="ltr">
                  {e.employeeNumber} · {e.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={e.isActive ? 'success' : 'neutral'}>
                  {t(e.isActive ? 'status.active' : 'status.inactive')}
                </Badge>
                <Badge tone={e.presence === 'online' ? 'success' : e.presence === 'recent' ? 'warning' : 'neutral'}>
                  {t(`presence.${e.presence}`)}
                </Badge>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              {e.managerName && (
                <span>
                  {t('lookup.reportsTo')}: <bdi className="text-ink">{loc(e.managerName)}</bdi>
                </span>
              )}
              {file.directReports.length > 0 && (
                <span>
                  {t('lookup.manages')}: <span className="text-ink">{fmt.number(file.directReports.length)}</span>
                </span>
              )}
              <span>
                {t('userForm.joinedOn')}: <span className="text-ink">{fmt.date(e.joinedOn)}</span>
              </span>
            </div>
          </div>

          {/* the three things HR is usually asked */}
          <div className="grid gap-3 md:grid-cols-3">
            <Panel icon={CalendarDays} title={t('lookup.attendanceThisMonth')}>
              <Figures
                items={[
                  [t('attStatus.present'), file.attendanceThisMonth.present],
                  [t('attStatus.late'), file.attendanceThisMonth.late],
                  [t('attStatus.absent'), file.attendanceThisMonth.absent],
                ]}
                fmt={fmt}
              />
            </Panel>

            <Panel icon={CalendarDays} title={t('lookup.leave')}>
              <Figures
                items={[
                  [t('leaveType.annual'), file.leave.annualRemaining],
                  [t('leaveType.sick'), file.leave.sickRemaining],
                ]}
                fmt={fmt}
              />
            </Panel>

            <Panel icon={FileText} title={t('lookup.documents')}>
              <p className="text-2xl font-bold text-ink">{fmt.number(file.documents.length)}</p>
              <p className="mt-1 text-xs text-muted">
                {file.documents.map((d) => d.fileName).join(' · ') || t('common.dash')}
              </p>
            </Panel>
          </div>

          {/* pay */}
          <Panel icon={Wallet} title={t('lookup.salary')}>
            {file.salary ? (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(
                    [
                      [t('lookup.basic'), file.salary.basic],
                      [t('lookup.transport'), file.salary.transport],
                      [t('lookup.housing'), file.salary.housing],
                      [t('lookup.otherAllowance'), file.salary.other],
                    ] as const
                  )
                    .filter(([, v]) => v > 0)
                    .map(([label, v]) => (
                      <div key={label}>
                        <p className="text-lg font-bold tabular-nums text-ink">
                          {money(v)} <span className="text-xs font-normal text-muted">{file.salary!.currency}</span>
                        </p>
                        <p className="text-xs text-muted">{label}</p>
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {t('lookup.effectiveFrom', { date: fmt.date(file.salary.effectiveFrom) })}
                  {file.salary.dependants > 0 && ` · ${t('lookup.dependants', { count: file.salary.dependants })}`}
                  {file.salary.socialSecurityExempt && ` · ${t('lookup.ssExempt')}`}
                </p>
              </>
            ) : (
              /* Absent, not zero. Nobody has recorded what this person is paid. */
              <p className="text-sm text-muted">{t('lookup.noSalary')}</p>
            )}
          </Panel>

          {file.requests.length > 0 && (
            <Panel icon={FileText} title={t('lookup.openRequests')}>
              <ul className="space-y-1.5">
                {file.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={r.status === 'pending' ? 'warning' : 'neutral'}>{r.status}</Badge>
                    <span className="text-ink">{r.kind}</span>
                    {r.detail && (
                      <span className="text-xs text-muted" dir="ltr">
                        {loc(r.detail)}
                      </span>
                    )}
                    <span className="ms-auto text-xs text-muted">{fmt.date(r.submittedAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </Card>
  )
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Search
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Icon className="size-3.5 text-muted" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Figures({
  items,
  fmt,
}: {
  items: readonly (readonly [string, number])[]
  fmt: { number: (n: number) => string }
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-2xl font-bold tabular-nums text-ink">{fmt.number(value)}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      ))}
    </div>
  )
}
