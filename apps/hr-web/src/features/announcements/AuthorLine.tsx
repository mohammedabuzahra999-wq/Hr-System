import type { Announcement } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * Who sent this, said the same way everywhere it appears.
 *
 * Notices now come from HR and from managers, so "from whom" is part of the
 * notice rather than a footnote: an employee reads a holiday from HR and a
 * meeting from their own manager differently. The role is rendered from its key,
 * so it follows the language like every other app-written word.
 */
export function AuthorLine({ item, className }: { item: Announcement; className?: string }) {
  const { t, loc, fmt } = useI18n()
  if (!item.authorName) return <span className={className}>{fmt.date(item.publishedAt)}</span>

  return (
    <span className={className}>
      {t('announcements.from', { name: loc(item.authorName) })}
      {item.authorRole ? ` · ${t(`role.${item.authorRole}`)}` : ''}
      {' · '}
      {fmt.date(item.publishedAt)}
    </span>
  )
}
