import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'danger' | 'success' | 'warning'

/**
 * A message about what just happened.
 *
 * This markup was written out at twenty-three call sites, every one of them
 * spelling the colours literally — `bg-red-50` is a light-mode value, so on a
 * dark page each of those banners lit up as a pale pink slab. Defined once, in
 * tokens, it follows the theme and cannot drift between screens.
 */
const tones: Record<Tone, string> = {
  danger: 'border-danger/25 bg-danger-soft text-danger',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
}

export function Alert({
  tone = 'danger',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <p role="alert" className={cn('rounded-xl border px-3 py-2 text-sm', tones[tone], className)}>
      {children}
    </p>
  )
}
