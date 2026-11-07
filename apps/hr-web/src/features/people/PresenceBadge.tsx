import type { Employee, Presence } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

const DOT: Record<Presence, string> = {
  online: 'bg-success',
  recent: 'bg-warning',
  offline: 'bg-muted/50',
}

/**
 * Whether someone is using the system right now.
 *
 * A plain dot and a word, not a badge: this sits beside the account status in a
 * table, and two pill badges on one row read as two competing verdicts when one
 * of them is only context for the other.
 *
 * `offline` still shows when they were last seen, because "not here" is much
 * more useful with "since when" attached — and if that is never, it says so
 * rather than leaving a blank.
 */
export function PresenceBadge({ person, className }: { person: Employee; className?: string }) {
  const { t, timeAgo } = useI18n()

  const detail =
    person.presence === 'online'
      ? null
      : person.lastSeenAt
        ? timeAgo(person.lastSeenAt)
        : t('presence.never')

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className ?? ''}`}>
      <span className={`size-2 shrink-0 rounded-full ${DOT[person.presence]}`} aria-hidden="true" />
      <span className="text-sm text-ink">{t(`presence.${person.presence}`)}</span>
      {detail && <span className="text-xs text-muted">· {detail}</span>}
    </span>
  )
}
