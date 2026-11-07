import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Globe2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/ui/Logo'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'

const pillars: { title: TKey; text: TKey; icon: LucideIcon }[] = [
  { title: 'welcome.pillarTeam', text: 'welcome.pillarTeamBody', icon: Users },
  { title: 'welcome.pillarHr', text: 'welcome.pillarHrBody', icon: BriefcaseBusiness },
  { title: 'welcome.pillarReports', text: 'welcome.pillarReportsBody', icon: BarChart3 },
  { title: 'welcome.pillarSecurity', text: 'welcome.pillarSecurityBody', icon: ShieldCheck },
]

const roles: { name: TKey; description: TKey; tag: TKey }[] = [
  { name: 'role.admin', description: 'welcome.roleAdminDesc', tag: 'welcome.roleAdminTag' },
  { name: 'role.manager', description: 'welcome.roleManagerDesc', tag: 'welcome.roleManagerTag' },
  { name: 'role.hr', description: 'welcome.roleHrDesc', tag: 'welcome.roleHrTag' },
  { name: 'role.employee', description: 'welcome.roleEmployeeDesc', tag: 'welcome.roleEmployeeTag' },
]

/** The modules the portal ships, described rather than quantified with invented figures. */
const modules: { label: TKey; icon: LucideIcon }[] = [
  { label: 'login.featAttendance', icon: Clock3 },
  { label: 'login.featLeave', icon: CalendarCheck },
  { label: 'login.featPayroll', icon: ReceiptText },
  { label: 'login.featPeople', icon: UsersRound },
]

const points: TKey[] = ['welcome.point1', 'welcome.point2', 'welcome.point3']

export function WelcomePage() {
  const { t, lang, setLang } = useI18n()

  useEffect(() => {
    try {
      sessionStorage.removeItem('hr-app:user')
    } catch {
      /* ignore if storage is unavailable */
    }
  }, [])

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5 sm:px-8">
        <Logo tone="dark" />
        <nav className="flex items-center gap-4 text-sm text-muted sm:gap-6">
          <a href="#features" className="hidden transition hover:text-brand md:inline">
            {t('welcome.navFeatures')}
          </a>
          <a href="#roles" className="hidden transition hover:text-brand md:inline">
            {t('welcome.navRoles')}
          </a>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            aria-label={t('lang.label')}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition hover:bg-brand-50"
          >
            <Globe2 className="size-3.5" />
            {t('lang.switchTo')}
          </button>
          <Link to="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
            {t('welcome.navSignIn')}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-6 sm:px-8">
        <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-brand via-brand-700 to-sky-700 p-6 text-white shadow-[0_25px_70px_rgba(29,78,216,0.22)] sm:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {t('welcome.badge')}
              </span>

              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">{t('welcome.title')}</h1>

              <p className="mt-5 max-w-xl text-base leading-8 text-white/80 sm:text-lg">{t('welcome.body')}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login">
                  <Button className="h-11 rounded-xl bg-white px-6 text-brand shadow-none hover:bg-slate-100">
                    {t('welcome.ctaPrimary')}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary" className="h-11 border-white/20 bg-white/5 px-6 text-white hover:bg-white/10">
                    {t('welcome.ctaSecondary')}
                  </Button>
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-4 text-sm text-white/75">
                {points.map((point) => (
                  <span key={point} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-300" aria-hidden="true" />
                    {t(point)}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <div className="rounded-[22px] bg-slate-950/25 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                  {t('welcome.previewTitle')}
                </p>

                <ul className="mt-5 space-y-3">
                  {modules.map(({ label, icon: Icon }) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
                        <Icon className="size-4 text-sky-100" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-medium text-white">{t(label)}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 text-xs text-white/50">{t('welcome.previewNote')}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pillars.map(({ title, text, icon: Icon }) => (
            <Card key={title} className="rounded-[24px] border-transparent bg-white/85 shadow-[0_14px_38px_rgba(15,23,42,0.04)]">
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-ink">{t(title)}</h3>
              <p className="mt-2 text-sm leading-7 text-muted">{t(text)}</p>
            </Card>
          ))}
        </section>

        <section id="roles" className="mt-14">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-ink">{t('welcome.rolesTitle')}</h2>
            <span className="text-sm text-muted">{t('welcome.rolesSubtitle')}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {roles.map((role) => (
              <div key={role.name} className="rounded-[24px] border border-line bg-surface p-5 shadow-[0_12px_30px_rgba(15,23,42,0.03)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">{t(role.name)}</p>
                <p className="mt-4 text-lg font-bold text-ink">{t(role.description)}</p>
                <p className="mt-2 text-sm text-muted">{t(role.tag)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-[28px] border border-line bg-surface p-6 shadow-[0_18px_45px_rgba(15,23,42,0.04)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">{t('welcome.ctaEyebrow')}</p>
              <h3 className="mt-3 text-3xl font-black text-ink">{t('welcome.ctaTitle')}</h3>
            </div>
            <Link to="/login" className="shrink-0">
              <Button className="h-11 rounded-xl px-6">
                {t('welcome.ctaButton')}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
