import { cn } from '@/lib/cn'
import { useI18n } from '@/features/i18n/useI18n'

export type MeterTone = 'brand' | 'warning' | 'danger'

interface MeterProps {
  label: string
  /** The measured amount. The fill is derived from this — never passed in separately. */
  value: number
  /** The scale the value is read against, and what the caption states. */
  max: number
  /**
   * The value as the reader should see it ("92%", "6 days"). Only the wording
   * differs from `value`; the bar always follows `value / max`.
   */
  valueText: string
  /** How `max` reads in the caption. Omitted when the label already implies it. */
  maxText?: string
  caption?: string
  tone?: MeterTone
  /**
   * Renders the track and caption alone, for a caller that already shows the
   * label and value above it. `label` and `valueText` still name the bar for
   * assistive tech.
   */
  bare?: boolean
  className?: string
}

const fills: Record<MeterTone, string> = {
  brand: 'bg-brand',
  warning: 'bg-amber-500',
  danger: 'bg-danger',
}

/**
 * A single ratio against a limit.
 *
 * The fill width is computed from `value / max`, so the bar and the number can
 * never disagree, and the track is a lighter step of the same ramp rather than a
 * neutral grey, so the whole bar reads as one scale.
 */
export function Meter({
  label,
  value,
  max,
  valueText,
  maxText,
  caption,
  tone = 'brand',
  bare = false,
  className,
}: MeterProps) {
  const { t } = useI18n()
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const note = caption ?? (maxText ? t('chart.ofMax', { max: maxText }) : undefined)

  return (
    <div className={className}>
      {!bare && (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-ink">{label}</span>
          <span className="tabular-nums text-muted">{valueText}</span>
        </div>
      )}

      <div
        className="h-2 overflow-hidden rounded-full bg-brand-50"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={valueText}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-300', fills[tone])} style={{ width: `${pct}%` }} />
      </div>

      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  )
}
