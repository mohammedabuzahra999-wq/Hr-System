import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  /** Control pinned inside the end of the field, e.g. a show/hide password toggle. */
  trailing?: ReactNode
}

export function Input({ label, error, trailing, id, className, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-muted/70',
            'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
            trailing ? 'pe-10' : null,
            error ? 'border-danger' : 'border-line',
            className,
          )}
          {...props}
        />
        {trailing && <span className="absolute inset-y-0 end-0 flex items-center pe-1.5">{trailing}</span>}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
