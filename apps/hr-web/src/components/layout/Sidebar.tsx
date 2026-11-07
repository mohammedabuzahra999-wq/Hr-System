import { LogOut, X } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { navItems } from '@/config/navigation'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { cn } from '@/lib/cn'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const { t, loc, dir } = useI18n()
  const navigate = useNavigate()
  const items = navItems.filter((item) => user && item.roles.includes(user.role))
  const roleLabel = t(`role.${user?.role ?? 'employee'}`)
  const displayName = user ? loc(user.fullName) : t('role.employee')

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-30 bg-ink/40 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'app-sidebar fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-gradient-to-b from-brand via-brand-700 to-brand text-white transition-transform',
          'lg:sticky lg:top-0 lg:h-dvh',
          // Scoped to max-lg: a bare `ltr:`/`rtl:` rule outweighs any `lg:` reset
          // (an attribute selector beats a media query), which would strand the
          // sidebar off-canvas on desktop. Below lg there is nothing to outweigh.
          open ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <Logo />
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={t('nav.closeMenu')}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="shrink-0 px-3 py-4">
          <div className="mb-4 rounded-2xl border border-white/15 bg-white/8 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">{t('shell.workspace')}</p>
            <p className="mt-2 text-sm font-medium text-white">{displayName}</p>
            <p className="text-xs text-white/75">{roleLabel}</p>
          </div>
        </div>

        <nav className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t('nav.main')} style={{ direction: 'ltr' }}>
          <ul dir={dir} className="flex flex-col gap-1 px-3 py-2">
            {items.map(({ label, labelKey, to, hash, icon: Icon }) => {
              const itemLabel = labelKey ? t(labelKey) : label

              return (
                <li key={`${to}-${label}-${hash ?? 'root'}`}>
                  <NavLink
                    to={to}
                    onClick={(event) => {
                      if (hash) {
                        event.preventDefault()
                        navigate(`${to}#${hash}`)
                        requestAnimationFrame(() => {
                          const el = document.getElementById(hash)
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        })
                        onClose()
                        return
                      }

                      onClose()
                    }}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-white/18 text-white shadow-inner shadow-white/15 before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-sky-100'
                          : 'text-white/85 hover:bg-white/12 hover:text-white',
                      )
                    }
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {itemLabel}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <footer className="shrink-0 border-t border-white/10 px-3 py-3">
          <p className="px-2 pb-3 text-xs text-white/70">{t('nav.moreSoon')}</p>
          <button
            type="button"
            onClick={() => {
              void logout()
              navigate('/login', { replace: true })
              onClose()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-white/85 transition-colors hover:bg-white/12 hover:text-white"
          >
            <LogOut className="size-5" aria-hidden="true" />
            {t('nav.signOut')}
          </button>
        </footer>
      </aside>
    </>
  )
}
