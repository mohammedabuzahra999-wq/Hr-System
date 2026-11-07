import { Bell, CalendarDays, LockKeyhole, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'

const preferences: { icon: LucideIcon; title: TKey; description: TKey }[] = [
  { icon: Bell, title: 'mgrSet.prefEmail', description: 'mgrSet.prefEmailDesc' },
  { icon: ShieldCheck, title: 'mgrSet.prefSecurity', description: 'mgrSet.prefSecurityDesc' },
  { icon: CalendarDays, title: 'mgrSet.prefDigest', description: 'mgrSet.prefDigestDesc' },
]

const securityItems: TKey[] = ['mgrSet.sec1', 'mgrSet.sec2', 'mgrSet.sec3', 'mgrSet.sec4']

export function ManagerSettingsPage() {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.manager')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">{t('mgrSet.title')}</h2>
        </div>
        <Badge tone="success">{t('mgrSet.badge')}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('mgrSet.prefs')} icon={Bell}>
          <ul className="divide-y divide-line">
            {preferences.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">{t(title)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{t(description)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t('mgrSet.security')} icon={LockKeyhole}>
          <ul className="space-y-3">
            {securityItems.map((item) => (
              <li key={item} className="flex gap-3 rounded-lg border border-line bg-paper p-3 text-sm text-ink">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={t('mgrSet.accessTitle')} icon={ShieldCheck}>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">{t('mgrSet.accessBody')}</p>
      </Card>
    </div>
  )
}