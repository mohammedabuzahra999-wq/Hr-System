import { Languages, LogOut, Menu } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { initialsOf } from '@/lib/initials'

interface TopbarProps {
  title: string
  onMenuClick: () => void
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth()
  const { t, lang, setLang, loc } = useI18n()
  const displayName = user ? loc(user.fullName) : ''
  const initials = initialsOf(displayName || '?')
  const roleLabel = t(`role.${user?.role ?? 'employee'}`)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line/80 bg-surface/85 px-4 shadow-[0_10px_30px_rgba(15,23,42,0.02)] backdrop-blur-xl sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-xl border border-line bg-paper p-2 text-muted transition hover:border-brand/30 hover:bg-brand-50 hover:text-brand lg:hidden"
        aria-label={t('nav.openMenu')}
      >
        <Menu className="size-5" />
      </button>

      {/*
        `min-w-0` lets the heading shrink instead of forcing the bar wider, and
        `truncate` keeps a long title on one line — the bar is a fixed height, so
        a wrapped title spilled out of it and over the page beneath.
      */}
      <div className="min-w-0 flex-1">
        {/* The product name is context, not information — it goes before the title does. */}
        <p className="hidden truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-muted sm:block">
          {t('shell.suite')}
        </p>
        <h1 className="truncate text-lg font-semibold text-ink" title={title}>
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <NotificationBell />
        <ThemeToggle />
        <Button
          variant="ghost"
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          className="hidden items-center gap-2 rounded-full px-2.5 md:inline-flex"
        >
          <Languages className="size-4" />
          <span>{t('lang.switchTo')}</span>
        </Button>

        <div className="hidden rounded-full border border-line bg-paper px-3 py-1.5 text-end sm:block">
          <p className="text-sm font-medium leading-tight text-ink">{displayName}</p>
          <p className="text-[11px] text-muted">
            {roleLabel}
            {' · '}
            <bdi dir="ltr">{user?.email}</bdi>
          </p>
        </div>
        <span
          className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-brand-50 to-brand/10 text-sm font-semibold text-brand ring-4 ring-brand/5"
          aria-hidden="true"
        >
          {initials}
        </span>
        <Button variant="ghost" onClick={logout} className="rounded-full px-2.5" aria-label={t('nav.signOut')}>
          <LogOut className="size-4" />
          <span className="hidden md:inline">{t('nav.signOut')}</span>
        </Button>
      </div>
    </header>
  )
}
