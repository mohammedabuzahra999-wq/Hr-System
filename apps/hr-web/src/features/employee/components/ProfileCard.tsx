import type { SessionUser } from '@hr/shared'
import { Avatar } from '@/components/ui/Avatar'
import { useI18n } from '@/features/i18n/useI18n'

export function ProfileCard({ profile }: { profile: SessionUser }) {
  const { t, loc } = useI18n()

  const facts = [
    { label: t('profile.jobTitle'), value: loc(profile.jobTitle) },
    { label: t('profile.department'), value: loc(profile.department) },
    { label: t('profile.employeeNumber'), value: profile.employeeNumber },
    {
      label: t('profile.manager'),
      value: profile.managerName ? loc(profile.managerName) : t('common.dash'),
    },
  ]

  return (
    <section className="flex flex-col gap-6 rounded-lg bg-brand p-6 text-white sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <Avatar name={loc(profile.fullName)} src={profile.photoUrl ?? undefined} size="lg" inverted className="ring-4 ring-white/20" />
        <div>
          <p className="text-2xl font-bold tracking-tight">{loc(profile.fullName)}</p>
          <p className="mt-0.5 text-sm text-white/75">
            <bdi dir="ltr">{profile.email}</bdi>
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:ms-auto lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs text-white/65">{fact.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
