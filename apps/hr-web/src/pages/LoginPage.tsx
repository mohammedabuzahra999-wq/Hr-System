import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Clock3,
  Eye,
  EyeOff,
  Globe2,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { useTheme } from '@/features/theme/useTheme'
import type { TKey } from '@/features/i18n/dictionary'
import { errorKey } from '@/lib/apiError'
import { homePathFor } from '@/lib/roles'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The modules this portal actually ships — described, never quantified with invented figures. */
const highlights: { icon: LucideIcon; title: TKey; body: TKey }[] = [
  { icon: Clock3, title: 'login.featAttendance', body: 'login.featAttendanceBody' },
  { icon: CalendarCheck, title: 'login.featLeave', body: 'login.featLeaveBody' },
  { icon: ReceiptText, title: 'login.featPayroll', body: 'login.featPayrollBody' },
  { icon: UsersRound, title: 'login.featPeople', body: 'login.featPeopleBody' },
]

const demoAccounts: { role: TKey; email: string; icon: LucideIcon }[] = [
  { role: 'role.admin', email: 'mo.admin@menaitech.com', icon: ShieldCheck },
  { role: 'role.manager', email: 'mo.manager@menaitech.com', icon: Building2 },
  { role: 'role.hr', email: 'mo.hr@menaitech.com', icon: BriefcaseBusiness },
  { role: 'role.employee', email: 'mo.employee@menaitech.com', icon: UsersRound },
]

const DEMO_PASSWORD = 'Menaitech#2026'

export function LoginPage() {
  const { user, login } = useAuth()
  const { lang, setLang, t } = useI18n()
  const { resolved } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<TKey | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={from ?? homePathFor(user.role)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const next: typeof errors = {}
    if (!EMAIL_RE.test(email.trim())) next.email = t('login.errEmail')
    if (password.length < 8) next.password = t('login.errPassword')
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      const signedIn = await login(email.trim(), password)
      navigate(from ?? homePathFor(signedIn.role), { replace: true })
    } catch (error) {
      // The server never says which of the two was wrong, and neither does this.
      setFormError(errorKey(error))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleLang = () => setLang(lang === 'en' ? 'ar' : 'en')

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[1.05fr_minmax(420px,540px)]">
      {/* Brand panel — hidden on small screens, where the form is all that matters. */}
      <section className="login-brand-panel relative hidden overflow-hidden bg-gradient-to-br from-brand via-brand-700 to-sky-800 p-10 text-white lg:flex lg:flex-col xl:p-14">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <Logo size="lg" />
          <div className="flex items-center gap-2">
            <ThemeToggle tone="onBrand" />
            <button
              type="button"
              onClick={toggleLang}
              aria-label={t('lang.label')}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/20"
            >
              <Globe2 className="size-3.5" />
              {t('lang.switchTo')}
            </button>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-xl pt-16">
          <h2 className="text-[2.6rem] font-black leading-[1.15] tracking-tight">{t('login.heroTitle')}</h2>
          <p className="mt-5 max-w-lg text-base leading-8 text-white/70">{t('login.heroBody')}</p>
        </div>

        <ul className="relative z-10 mt-10 mb-auto grid max-w-xl gap-x-6 gap-y-5 sm:grid-cols-2">
          {highlights.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm">
                <Icon className="size-4 text-sky-100" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">{t(title)}</span>
                <span className="mt-1 block text-[13px] leading-6 text-white/60">{t(body)}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="relative z-10 mt-12 text-xs text-white/45">
          {t('login.footer', { year: String(new Date().getFullYear()) })}
        </p>

        {/* Ambient shapes. Decorative only, so they stay out of the accessibility tree. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 end-[-10rem] size-[30rem] rounded-full bg-sky-400/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-14rem] start-[-8rem] size-[26rem] rounded-full bg-white/10 blur-3xl"
        />
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between gap-4 lg:hidden">
            <Logo tone={resolved === 'dark' ? 'light' : 'dark'} />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={toggleLang}
                aria-label={t('lang.label')}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition hover:bg-brand-50"
              >
                <Globe2 className="size-3.5" />
                {t('lang.switchTo')}
              </button>
            </div>
          </div>

          <div className="login-form-card rounded-[28px] border border-line bg-surface p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                  {t('login.portalLabel')}
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">{t('login.title')}</h1>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/20 bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand">
                <ShieldCheck className="size-3" aria-hidden="true" />
                {t('login.secure')}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{t('login.subtitle')}</p>

            {formError && (
              <p
                role="alert"
                className="login-error mt-4 rounded-xl border border-danger/20 bg-red-50 px-3 py-2.5 text-sm text-danger"
              >
                {t(formError)}
              </p>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-7 flex flex-col gap-5">
              <Input
                label={t('login.email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              <Input
                label={t('login.password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                    aria-pressed={showPassword}
                    className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-brand-50 hover:text-brand"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />
              <Button type="submit" loading={submitting} loadingText={t('login.submitting')} className="login-submit mt-2 h-11 w-full">
                {t('login.submit')}
              </Button>
            </form>
          </div>

          {import.meta.env.DEV && (
            <div className="mt-6 rounded-[24px] border border-line bg-surface p-5 shadow-[0_12px_30px_rgba(15,23,42,0.03)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{t('login.companyAccess')}</p>
              <p className="mt-1.5 text-[13px] leading-5 text-muted/80">{t('login.companyAccessHint')}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {demoAccounts.map(({ role, email: accountEmail, icon: Icon }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setEmail(accountEmail)
                      setPassword(DEMO_PASSWORD)
                      setErrors({})
                      setFormError(null)
                    }}
                    className="flex items-center gap-2.5 rounded-2xl border border-line bg-paper px-3 py-2.5 text-start transition hover:border-brand hover:bg-brand-50"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink">{t(role)}</span>
                      <span className="block truncate text-[11px] text-muted" dir="ltr">
                        {accountEmail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted/70 lg:hidden">
            {t('login.footer', { year: String(new Date().getFullYear()) })}
          </p>
        </div>
      </section>
    </div>
  )
}
