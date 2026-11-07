import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@/features/i18n/useI18n'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Accessible dialog built on the native <dialog> element (Esc closes it). */
export function Modal({ open, title, onClose, children, wide = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { t } = useI18n()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-4xl' : 'max-w-md'} rounded-lg bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40`}
    >
      <div className="flex items-center border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button
          onClick={onClose}
          className="ms-auto rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink"
          aria-label={t('common.close')}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}
