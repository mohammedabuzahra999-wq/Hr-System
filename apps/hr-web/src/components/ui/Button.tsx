import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  /** Text shown while loading. */
  loadingText?: string
}

const variants: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-brand to-brand-700 text-white shadow-[0_12px_20px_rgba(29,78,216,0.18)] hover:brightness-105',
  secondary: 'bg-surface text-ink border border-line shadow-sm hover:bg-paper',
  ghost: 'text-muted hover:bg-brand-50 hover:text-ink',
}

/** On the base rather than per variant, so no variant can render an unreadable disabled state. */
const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:brightness-100'

export function Button({ variant = 'primary', loading, loadingText = 'Please wait…', disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200',
        variants[variant],
        disabledLook,
        className,
      )}
      {...props}
    >
      {loading ? loadingText : children}
    </button>
  )
}
