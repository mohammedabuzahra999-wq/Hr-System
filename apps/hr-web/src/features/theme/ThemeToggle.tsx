import { Moon, Sun } from 'lucide-react'
import { useI18n } from '@/features/i18n/useI18n'
import { cn } from '@/lib/cn'
import { useTheme } from './useTheme'

/**
 * Two places need this and they sit on different grounds: the topbar's paper
 * surface, and the login page's brand panel where everything is white on a
 * gradient. Same control, told which ground it is standing on.
 */
const looks = {
  surface: 'border-line bg-paper text-muted hover:border-brand/30 hover:bg-brand-50 hover:text-brand',
  onBrand: 'border-white/20 bg-white/10 text-white/90 backdrop-blur-sm hover:bg-white/20',
}

/**
 * One button, because one button is the whole decision most of the time.
 *
 * It shows the theme you would get by pressing it, not the one you are in — a
 * moon on a light page means "go dark". The label says the same thing in words,
 * so the icon is never the only carrier of meaning.
 */
export function ThemeToggle({
  tone = 'surface',
  className,
}: {
  tone?: keyof typeof looks
  className?: string
}) {
  const { t } = useI18n()
  const { resolved, toggle } = useTheme()
  const goingDark = resolved === 'light'
  const label = goingDark ? t('theme.switchToDark') : t('theme.switchToLight')

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn('grid size-9 shrink-0 place-items-center rounded-xl border transition', looks[tone], className)}
    >
      {goingDark ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
    </button>
  )
}
