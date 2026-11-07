import type { PointerEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface CardProps {
  title?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, icon: Icon, action, className, children }: CardProps) {
  function moveSpotlight(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`)
    event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`)
  }

  function resetSpotlight(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.removeProperty('--spotlight-x')
    event.currentTarget.style.removeProperty('--spotlight-y')
  }

  return (
    <section
      onPointerMove={moveSpotlight}
      onPointerLeave={resetSpotlight}
      className={cn(
        'card-spotlight group relative isolate flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface/95 shadow-[0_12px_35px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-[border-color,box-shadow] duration-200 hover:border-brand/35 hover:shadow-[0_16px_38px_rgba(29,78,216,0.09)]',
        className,
      )}
    >
      {title && (
        <header className="relative z-10 flex items-center gap-2.5 border-b border-line/80 px-5 py-3.5">
          {Icon && (
            <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand shadow-inner shadow-brand/5">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action && <div className="ms-auto">{action}</div>}
        </header>
      )}
      <div className="relative z-10 flex flex-1 flex-col p-5">{children}</div>
    </section>
  )
}
