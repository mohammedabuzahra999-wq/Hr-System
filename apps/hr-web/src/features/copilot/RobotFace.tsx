/**
 * The assistant, drawn rather than borrowed from an icon set.
 *
 * An icon says "this is a feature". A face says "this is something you talk
 * to", and the whole point of this control is that people ask it questions in
 * their own words — which they will not do if it looks like a settings button.
 *
 * Everything here is `currentColor` or a token, so it inherits the button's
 * colour and works in both themes without a second drawing.
 *
 * The blink is on a long, uneven cycle on purpose. A regular blink reads as a
 * loading spinner; an irregular one reads as idle.
 */
export function RobotFace({ className = '', thinking = false }: { className?: string; thinking?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      {/* antenna */}
      <line x1="24" y1="10" x2="24" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="4" r="2.6" fill="currentColor" className={thinking ? 'animate-pulse' : 'robot-beacon'} />

      {/* head */}
      <rect x="9" y="10" width="30" height="24" rx="9" fill="currentColor" opacity="0.22" />
      <rect x="9" y="10" width="30" height="24" rx="9" stroke="currentColor" strokeWidth="2.2" />

      {/* eyes — the group is what blinks */}
      <g className="robot-eyes">
        <circle cx="18" cy="21" r="3.1" fill="currentColor" />
        <circle cx="30" cy="21" r="3.1" fill="currentColor" />
      </g>

      {/* mouth: a flat line at rest, a wave while it is working */}
      {thinking ? (
        <path
          d="M17 28 q3.5 3 7 0 t7 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="animate-pulse"
        />
      ) : (
        <line x1="19" y1="28" x2="29" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}

      {/* ears */}
      <line x1="6" y1="19" x2="6" y2="25" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="42" y1="19" x2="42" y2="25" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />

      {/*
        Thrusters, not legs. A robot with legs standing on nothing looks like it
        is falling; two short jets under it is what makes the float read as
        deliberate hovering.
      */}
      <line x1="18" y1="37" x2="18" y2="41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="30" y1="37" x2="30" y2="41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}
