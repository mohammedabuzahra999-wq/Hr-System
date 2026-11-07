import { CalendarOff, Megaphone, Pencil, Trash2, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Announcement, AnnouncementKind } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { useI18n } from '@/features/i18n/useI18n'
import { AuthorLine } from './AuthorLine'

/**
 * The kind carries the meaning, so it carries the icon and the colour too.
 *
 * The old list cycled three colours by position, which looked deliberate and
 * meant nothing. A reader could not tell a public holiday from a staff meeting
 * without reading both in full; now the row says which it is before they do.
 */
const LOOK: Record<AnnouncementKind, { icon: LucideIcon; tone: BadgeTone }> = {
  general: { icon: Megaphone, tone: 'neutral' },
  holiday: { icon: CalendarOff, tone: 'success' },
  meeting: { icon: Users, tone: 'info' },
}

interface AnnouncementListProps {
  items: Announcement[]
  loading: boolean
  /**
   * Omitted for readers. HR and an administrator may withdraw or rewrite
   * anything; a manager only what they wrote, which the caller decides per row.
   */
  onDelete?: (item: Announcement) => void
  onEdit?: (item: Announcement) => void
  /** Lets a caller show the controls on some rows and not others. */
  canManage?: (item: Announcement) => boolean
  busyId?: string | null
  /** The row currently loaded into the composer, marked so the two agree. */
  editingId?: string | null
}

export function AnnouncementList({
  items,
  loading,
  onDelete,
  onEdit,
  canManage,
  busyId,
  editingId,
}: AnnouncementListProps) {
  const { t, loc, fmt } = useI18n()

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (items.length === 0) return <p className="text-sm text-muted">{t('announcements.empty')}</p>

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const { icon: Icon, tone } = LOOK[item.kind]
        const mayManage = canManage?.(item) ?? true
        const isEditing = editingId === item.id

        return (
          <div
            key={item.id}
            className={`flex items-start gap-3 rounded-xl border bg-paper p-3 transition ${
              isEditing ? 'border-brand ring-2 ring-brand/15' : 'border-line'
            } ${
              // A lapsed notice is still here to be extended or removed, but it
              // must not read as if it were still on the board.
              item.expired ? 'opacity-60' : ''
            }`}
          >
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand" aria-hidden="true">
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Written by a person, so it carries both languages rather than a key. */}
                <p className="text-sm font-semibold text-ink">{loc(item.title)}</p>
                <Badge tone={tone}>{t(`announcements.kind.${item.kind}`)}</Badge>
                {item.expired ? (
                  <Badge tone="neutral">{t('announcements.expired')}</Badge>
                ) : item.expiresAt ? (
                  <Badge tone="warning">{t('announcements.until', { date: fmt.date(item.expiresAt) })}</Badge>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-ink">{loc(item.detail)}</p>
              <AuthorLine item={item} className="mt-1 block text-xs text-muted" />
            </div>

            {mayManage && (onEdit || onDelete) && (
              <div className="flex shrink-0 items-center gap-1.5">
                {onEdit && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => onEdit(item)}
                    aria-label={t('announcements.edit')}
                    title={t('announcements.edit')}
                    className="rounded-md border border-line bg-surface px-2 py-1.5 text-muted transition hover:border-brand hover:text-brand disabled:opacity-45"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => onDelete(item)}
                    aria-label={t('announcements.remove')}
                    title={t('announcements.remove')}
                    className="rounded-md bg-danger-soft px-2 py-1.5 text-danger transition hover:bg-danger/15 disabled:opacity-45"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
