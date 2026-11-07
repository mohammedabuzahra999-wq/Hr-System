import type { ActionOutcome } from '@hr/shared'

type ScrollEffect = Extract<NonNullable<ActionOutcome['uiEffect']>, { kind: 'scroll' }>

/** Execute a typed viewport command and verify that the browser accepted it. */
export async function applyScrollEffect(effect: ScrollEffect) {
  const root = document.scrollingElement ?? document.documentElement
  const before = root.scrollTop
  const max = Math.max(0, root.scrollHeight - root.clientHeight)
  const step = Math.max(420, Math.round(window.innerHeight * 0.78))
  const requested =
    effect.target === 'top'
      ? 0
      : effect.target === 'bottom'
        ? max
        : effect.target === 'up'
          ? before - step
          : before + step
  const expected = Math.max(0, Math.min(max, requested))
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  root.scrollTo({ top: expected, behavior: reducedMotion ? 'auto' : 'smooth' })
  await new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : 220))

  const after = root.scrollTop
  const alreadyAtTarget = Math.abs(before - expected) < 2
  const movedTowardTarget =
    effect.target === 'up' || effect.target === 'top'
      ? after < before || alreadyAtTarget
      : after > before || alreadyAtTarget
  if (!movedTowardTarget) throw new Error('scroll_failed')
}
