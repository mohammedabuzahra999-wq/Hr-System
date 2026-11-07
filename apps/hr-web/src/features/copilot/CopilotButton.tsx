import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/features/i18n/useI18n'
import { CopilotPanel } from './CopilotPanel'
import { RobotFace } from './RobotFace'

/**
 * The assistant in the topbar, beside the bell.
 *
 * It sits alongside the floating robot rather than instead of it, and the two
 * are for different moments. The floating one is what someone notices without
 * looking for it. This one is where a person goes when they already know the
 * feature exists and want it in the same place every time — and it is the one
 * that survives the floating robot being dragged somewhere forgettable.
 *
 * Same face, no hovering: a control in a row of controls should sit still.
 */
export function CopilotButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('copilot.open')}
        aria-expanded={open}
        className={`grid size-9 place-items-center rounded-full border transition ${
          open
            ? 'border-brand bg-brand text-white'
            : 'border-line bg-surface text-muted hover:border-brand hover:text-brand'
        }`}
      >
        <RobotFace className="size-5" />
      </button>
      {open && <CopilotPanel onClose={() => setOpen(false)} />}
    </div>
  )
}
