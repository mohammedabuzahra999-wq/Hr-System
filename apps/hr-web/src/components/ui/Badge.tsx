import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-brand-50 text-brand',
  danger: 'bg-danger-soft text-danger',
}

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-brand',
  danger: 'bg-danger',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', tones[tone])}>
      <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden="true" />
      {children}
    </span>
  )
}
