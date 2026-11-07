import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Tour } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'
import { RobotFace } from '@/features/copilot/RobotFace'
import { api } from '@/lib/api'

/**
 * The introductory walk through the system, on a first login.
 *
 * It moves through real screens rather than showing pictures of them: each stop
 * navigates, highlights the sidebar link it is talking about, and explains what
 * that screen is for. Somebody who has been shown the actual interface can find
 * it again; somebody who has been shown a slideshow cannot.
 *
 * Offered once. Finishing and skipping are recorded the same way, because a
 * person who dismissed it has decided — and asking again every morning is the
 * software not listening. They can restart it by asking the assistant.
 */

const SPOTLIGHT_PADDING = 6
const CARD_WIDTH = 384
const CARD_GAP = 16

/**
 * Where the card goes, given what it is pointing at.
 *
 * It used to be pinned to the bottom of the screen, always in the same place.
 * That reads as a banner rather than as an explanation: the ring was on the
 * sidebar and the words were in the opposite corner, so following the tour
 * meant looking across the whole screen and back for every step.
 *
 * Beside the highlighted thing instead, on whichever side has room, clamped so
 * it never leaves the viewport. When nothing is highlighted — a screen with no
 * matching link — it centres, because there is nothing to sit beside.
 */
function placeCard(spot: DOMRect | null): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!spot) return { left: (vw - CARD_WIDTH) / 2, top: vh - 260 }

  const roomLeft = spot.left
  const roomRight = vw - spot.right
  const left =
    roomLeft > CARD_WIDTH + CARD_GAP
      ? spot.left - CARD_WIDTH - CARD_GAP
      : roomRight > CARD_WIDTH + CARD_GAP
        ? spot.right + CARD_GAP
        : /* Neither side fits: sit under it and let the clamp keep it on screen. */
          spot.left + spot.width / 2 - CARD_WIDTH / 2

  /* Aligned to the top of what it describes, then kept inside the window. */
  const top = spot.top - 8
  return {
    left: Math.max(CARD_GAP, Math.min(left, vw - CARD_WIDTH - CARD_GAP)),
    top: Math.max(CARD_GAP, Math.min(top, vh - 240)),
  }
}

export function SystemTour() {
  const { t, loc, dir } = useI18n()
  const navigate = useNavigate()
  const [tour, setTour] = useState<Tour | null>(null)
  const [state, setState] = useState<'idle' | 'welcome' | 'running'>('idle')
  const [step, setStep] = useState(0)
  const [spot, setSpot] = useState<DOMRect | null>(null)

  useEffect(() => {
    api
      .get<{ tour: Tour }>('/copilot/tour')
      .then((d) => {
        setTour(d.tour)
        if (d.tour.shouldOffer && d.tour.stops.length > 0) setState('welcome')
      })
      // A tour that cannot load is not worth an error. The app works without it.
      .catch(() => undefined)
  }, [])

  const stop = tour?.stops[step]

  /**
   * Find the element this stop is about, after the page it lives on has
   * rendered.
   *
   * Measured rather than assumed: the sidebar is a different width on a phone,
   * and a hard-coded box would sit next to the thing instead of on it. Re-read
   * on scroll and resize for the same reason.
   */
  const locate = useCallback(() => {
    if (!stop?.highlight) return setSpot(null)
    const el = document.querySelector(stop.highlight)
    setSpot(el ? el.getBoundingClientRect() : null)
  }, [stop])

  useEffect(() => {
    if (state !== 'running' || !stop) return
    navigate(stop.path)
    // After the route has painted, not before.
    const id = window.setTimeout(locate, 350)
    window.addEventListener('resize', locate)
    window.addEventListener('scroll', locate, true)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('resize', locate)
      window.removeEventListener('scroll', locate, true)
    }
  }, [state, step, stop, navigate, locate])

  const finish = useCallback(async () => {
    setState('idle')
    setSpot(null)
    await api.post('/copilot/tour/done').catch(() => undefined)
  }, [])

  // Escape ends it, like every other overlay here.
  useEffect(() => {
    if (state === 'idle') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void finish()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state, finish])

  if (state === 'idle' || !tour) return null

  /* ---------- the welcome ---------- */
  if (state === 'welcome') {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-4" dir={dir}>
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-2xl">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-white">
            <RobotFace className="size-9" />
          </span>
          <h2 className="mt-4 text-xl font-bold text-ink">{t('tour.welcomeTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t('tour.welcomeBody')}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStep(0)
                setState('running')
              }}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {t('tour.start')}
            </button>
            <button
              type="button"
              onClick={() => void finish()}
              className="rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
            >
              {t('tour.skip')}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted">{t('tour.laterHint')}</p>
        </div>
      </div>
    )
  }

  /* ---------- a stop ---------- */
  if (!stop) return null
  const last = step === tour.stops.length - 1
  const Next = dir === 'rtl' ? ArrowLeft : ArrowRight
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft

  return (
    <>
      {/*
        The dimmer is four rectangles around the highlighted element, not one
        overlay with a transparent hole. A hole punched with a box-shadow still
        intercepts clicks over the element it is revealing, which makes a
        "highlighted" control unusable — and the point is that it looks reachable.
      */}
      {spot ? (
        <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden="true">
          <div className="absolute inset-x-0 top-0 bg-ink/55" style={{ height: spot.top - SPOTLIGHT_PADDING }} />
          <div className="absolute inset-x-0 bottom-0 bg-ink/55" style={{ top: spot.bottom + SPOTLIGHT_PADDING }} />
          <div
            className="absolute bg-ink/55"
            style={{ top: spot.top - SPOTLIGHT_PADDING, height: spot.height + SPOTLIGHT_PADDING * 2, left: 0, width: spot.left - SPOTLIGHT_PADDING }}
          />
          <div
            className="absolute bg-ink/55"
            style={{ top: spot.top - SPOTLIGHT_PADDING, height: spot.height + SPOTLIGHT_PADDING * 2, left: spot.right + SPOTLIGHT_PADDING, right: 0 }}
          />
          <div
            className="absolute rounded-lg ring-2 ring-white"
            style={{
              top: spot.top - SPOTLIGHT_PADDING,
              left: spot.left - SPOTLIGHT_PADDING,
              width: spot.width + SPOTLIGHT_PADDING * 2,
              height: spot.height + SPOTLIGHT_PADDING * 2,
            }}
          />
        </div>
      ) : (
        <div className="fixed inset-0 z-[55] bg-ink/55" aria-hidden="true" />
      )}

      <div
        className="fixed z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
        style={placeCard(spot)}
        dir={dir}
        role="dialog"
        aria-label={loc(stop.title)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand">
              {t('tour.stepOf', { n: step + 1, total: tour.stops.length })}
            </p>
            <h3 className="mt-0.5 text-base font-bold text-ink">{loc(stop.title)}</h3>
          </div>
          <button
            type="button"
            onClick={() => void finish()}
            aria-label={t('tour.skip')}
            className="rounded-md p-1 text-muted transition hover:bg-neutral-soft hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-muted">{loc(stop.body)}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <Back className="size-3.5" aria-hidden="true" />
            {t('tour.back')}
          </button>

          <div className="flex gap-1" aria-hidden="true">
            {tour.stops.map((_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full transition ${i === step ? 'bg-brand' : 'bg-line'}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => (last ? void finish() : setStep((s) => s + 1))}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            {last ? t('tour.done') : t('tour.next')}
            {!last && <Next className="size-3.5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </>
  )
}
