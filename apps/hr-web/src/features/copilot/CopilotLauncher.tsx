import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '@/features/i18n/useI18n'
import { CopilotPanel } from './CopilotPanel'

/**
 * The assistant, floating over the page instead of parked in the topbar.
 *
 * A control in the corner of a header is discoverable once and then forgotten;
 * this stays in view while someone scrolls a table of two hundred people, which
 * is exactly when a question occurs to them.
 *
 * It can be dragged, because "in view" and "in the way" are the same position
 * on some screens and not on others — and where it should sit depends on what
 * that person is reading, which nobody can decide for them. Where they put it is
 * remembered per browser.
 *
 * It rests wherever it is let go, edge or middle, and only ever moves itself to
 * stay on screen when the window changes size.
 */

const KEY = 'hr.copilot.position'
/** Below this movement, a pointer down-and-up is a click, not a drag. */
const DRAG_THRESHOLD = 4
const SIZE = 64
const MARGIN = 16

interface Position {
  /** Distance from the viewport's left edge, in pixels. */
  x: number
  y: number
}

function load(): Position | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Position
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null
  } catch {
    // Private windows and blocked site data both throw here. The default
    // position is fine; there is nothing to recover.
    return null
  }
}

function save(p: Position) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* not worth telling anyone about */
  }
}

/**
 * Keeps the button on screen, and otherwise leaves it where it was let go.
 *
 * It used to snap to the nearer side edge, on the reasoning that a button
 * floating mid-page covers content wherever it is put. That is true and it is
 * not the whole story: on a wide table the edges are exactly where the columns
 * people are reading live, and the free space is in the middle. Which position
 * is in the way depends on the screen and on what is on it, and the person
 * dragging it can see both.
 *
 * So the only rule left is that it stays reachable — fully on screen, with a
 * margin, however the window is resized afterwards.
 */
function settle(p: Position): Position {
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN)
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN)
  return {
    x: Math.min(Math.max(p.x, MARGIN), maxX),
    y: Math.min(Math.max(p.y, MARGIN), maxY),
  }
}

export function CopilotLauncher() {
  /*
    Hidden on the assistant's own page — a floating button that opens the
    assistant, on the assistant, is a second door into the room you are in.
  */
  const { pathname } = useLocation()
  const onAssistantPage = pathname.startsWith('/assistant')
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null)
  const [variant, setVariant] = useState<'general' | 'payroll'>('general')
  /**
   * Read once, during initialisation, not in an effect.
   *
   * `localStorage` and the viewport are both available synchronously by the
   * time this renders in a browser, so there is nothing to synchronise with
   * afterwards — and setting state from an effect would render the button in
   * the wrong place for one frame before moving it.
   */
  /**
   * The first position is the side the sidebar is not on.
   *
   * The sidebar sits on the right in Arabic and the left in English, so a fixed
   * default lands on top of it in one of the two languages — which is how this
   * first shipped, hovering over the navigation in the language most of its
   * users read. Reading the document's direction puts it in the content area
   * either way, and a position the user has chosen always wins.
   */
  const [pos, setPos] = useState<Position>(() => {
    const stored = load()
    if (stored) return settle(stored)
    const rtl = document.documentElement.dir === 'rtl'
    return settle({
      x: rtl ? 0 : window.innerWidth,
      y: Math.max(MARGIN, window.innerHeight - SIZE - MARGIN * 5),
    })
  })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  /**
   * Escape, and a click anywhere else, close it.
   *
   * These lived on the old topbar button and were lost when the launcher
   * replaced it — leaving a panel whose only exit was one small X. Every other
   * popover in this app closes both ways, and a control that behaves
   * differently from its neighbours is one people have to think about.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  /* Screens can open the assistant with a transparent, pre-filled question. */
  useEffect(() => {
    const openForQuestion = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: unknown; variant?: unknown }>).detail
      const question = detail?.question
      setInitialQuestion(typeof question === 'string' ? question : null)
      setVariant(detail?.variant === 'payroll' ? 'payroll' : 'general')
      setOpen(true)
    }
    window.addEventListener('hr:open-copilot', openForQuestion)
    return () => window.removeEventListener('hr:open-copilot', openForQuestion)
  }, [])

  // A window that changes size must not leave the button off the edge of it.
  useEffect(() => {
    const onResize = () => setPos(settle)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (open) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, startX: e.clientX, startY: e.clientY, moved: false }
      setDragging(true)
    },
    [pos, open],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    /**
     * A press is a click until the pointer has travelled far enough to be a
     * drag. Without the threshold, the hand tremor in any real press counts as
     * movement and the button never opens — it only ever gets nudged.
     */
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
      d.moved = true
    }
    if (d.moved) setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy })
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d) return
    setPos((p) => {
      const settled = settle(p)
      save(settled)
      return settled
    })
    // A press that did not move is a press: open the panel.
    if (!d.moved) {
      setInitialQuestion(null)
      setVariant('general')
      setOpen(true)
    }
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const onLeft = pos.x + SIZE / 2 < window.innerWidth / 2
  const nearBottom = pos.y > window.innerHeight / 2

  if (onAssistantPage) return null

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          // Keyboard users never drag; the button is simply a button for them.
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        aria-label="Open AI Copilot"
        aria-expanded={open}
        style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE, touchAction: 'none' }}
        className={`group fixed z-50 grid place-items-end ${dragging ? 'cursor-grabbing' : 'cursor-grab'} ${
          open ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <span aria-hidden="true" className={`copilot-robot-aura absolute bottom-0 size-16 ${dragging ? 'opacity-0' : ''}`} />
        <span
          className={`copilot-robot relative grid size-16 place-items-center transition-transform duration-200 ease-out ${
            dragging ? 'scale-105' : 'group-hover:scale-105 group-active:scale-[0.97]'
          }`}
        >
          <span aria-hidden="true" className="copilot-robot-ear copilot-robot-ear-start" />
          <span aria-hidden="true" className="copilot-robot-ear copilot-robot-ear-end" />
          <span aria-hidden="true" className="copilot-robot-antenna" />
          <span aria-hidden="true" className="copilot-robot-red-accent" />
          <span aria-hidden="true" className="copilot-robot-shell">
            <span className="copilot-robot-face">
              <span className="copilot-robot-eye copilot-robot-eye-start" />
              <span className="copilot-robot-eye copilot-robot-eye-end" />
              <span className="copilot-robot-smile" />
            </span>
            <span className="copilot-robot-chin" />
          </span>
        </span>
        <span className="pointer-events-none absolute bottom-[calc(100%+0.65rem)] start-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line/80 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          Ask AI Copilot
        </span>
      </button>

      {open && (
        <div
          ref={panel}
          className="fixed z-50"
          style={{
            left: onLeft ? MARGIN : undefined,
            right: onLeft ? undefined : MARGIN,
            top: nearBottom ? undefined : Math.max(MARGIN, pos.y),
            bottom: nearBottom ? MARGIN : undefined,
          }}
        >
          <div className="relative">
            <CopilotPanel onClose={() => setOpen(false)} floating initialQuestion={initialQuestion ?? undefined} variant={variant} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.close')}
              className="absolute -top-2 -end-2 grid size-7 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:text-ink"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
