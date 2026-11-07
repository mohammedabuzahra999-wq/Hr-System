import { BriefcaseBusiness, Mail, ShieldCheck, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TeamStats } from '@hr/shared'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/useAuth'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'

const permissions: TKey[] = ['mgrProf.perm1', 'mgrProf.perm2', 'mgrProf.perm3', 'mgrProf.perm4']

export function ManagerProfilePage() {
  const { t, loc, fmt } = useI18n()
  const { user } = useAuth()

  /** Only the headcount comes from the API; the rest of the page is the session itself. */
  const stats = useLiveQuery<TeamStats>(() => api.get('/stats/team'), [], {
    on: ['employee.changed'],
    enabled: Boolean(user),
  })

  if (!user) {
    return (
      <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-brand" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    )
  }

  const name = loc(user.fullName)
  const team = stats.data

  /** `ltr` marks the fields that stay Latin in both languages. */
  const details: { icon: LucideIcon; label: TKey; value: string; ltr?: boolean }[] = [
    { icon: Mail, label: 'mgrProf.email', value: user.email, ltr: true },
    { icon: BriefcaseBusiness, label: 'mgrProf.department', value: loc(user.department) },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.manager')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('mgrProf.title')}</h2>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          {t('status.verified')}
        </div>
      </div>

      {stats.error && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(errorKey(stats.error))}
        </p>
      )}

      <Card title={t('mgrProf.overview')} icon={UserRound} className="rounded-2xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <Avatar name={name} src={user.photoUrl ?? undefined} size="lg" />
          <div>
            <h3 className="text-2xl font-bold text-ink">{name}</h3>
            <p className="mt-1 text-sm text-muted">{loc(user.jobTitle)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {details.map(({ icon: Icon, label, value, ltr }) => (
            <div key={label} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Icon className="size-4" aria-hidden="true" /> {t(label)}
              </div>
              <p className="mt-2 font-medium text-ink">
                {/* bdi keeps a Latin email reading left to right without breaking the Arabic layout. */}
                {ltr ? <bdi dir="ltr">{value}</bdi> : value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('mgrProf.permissions')} icon={ShieldCheck} className="rounded-2xl">
          <ul className="space-y-3 text-sm text-ink">
            {permissions.map((permission) => (
              <li key={permission} className="rounded-lg border border-line bg-paper p-3">
                {t(permission)}
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t('mgrProf.teamSummary')} icon={UserRound} className="rounded-2xl">
          {/* Never a placeholder headcount: it is the real figure, or nothing. */}
          {stats.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : team ? (
            <p className="text-3xl font-bold">{fmt.number(team.teamSize)}</p>
          ) : (
            <p className="text-sm text-muted">{t('common.noData')}</p>
          )}
          <p className="mt-2 text-sm text-muted">{t('mgrProf.teamSummarySub')}</p>
        </Card>
      </div>
    </div>
  )
}
