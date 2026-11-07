import { Bell, CalendarOff, Check, Megaphone, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AnnouncementKind, InboxItem, ServerEventType } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'

/** Hoisted: a fresh array each render would tear down the subscription. */
const LIVE_ON: ServerEventType[] = ['notification.created', 'request.decided', 'announcement.published']

const ANNOUNCEMENT_ICON: Record<AnnouncementKind, LucideIcon> = {
  general: Megaphone,
  holiday: CalendarOff,
  meeting: Users,
}

/**
 * Notifications and announcements, reachable from every page.
 *
 * They used to live only on the employee's home screen, which meant a manager or
 * an HR user was never told anything — and an employee on any other page missed
 * it until they navigated back. The bell sits in the topbar, so the count is
 * visible wherever the reader happens to be.
 *
 * The two kinds stay visibly different inside it. A notification is a line the
 * app wrote about your own request; an announcement is something a person wrote
 * to the whole company, and it keeps its icon, its title and its author.
 */
export function NotificationBell() {
  const { t, tm, loc, timeAgo } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const feed = useLiveQuery<{ items: InboxItem[] }>(() => api.get('/feed/inbox'), [], { on: LIVE_ON })

  const items = feed.data?.items ?? []
  const unread = items.filter((i) => !i.read).length

  // Clicking away closes it, and so does Escape — a panel you cannot dismiss
  // with the keyboard is a trap for anyone not using a mouse.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** Clears both halves: personal notifications and the announcement watermark. */
  async function markAllRead() {
    setBusy(true)
    try {
      await api.post('/feed/notifications/read-all')
      feed.refresh()
    } catch {
      // A failed mark-read is not worth interrupting the page for; the unread
      // count simply stays as it was and the next refresh corrects it.
    } finally {
      setBusy(false)
    }
  }

  async function markOneRead(id: string) {
    try {
      await api.patch(`/feed/notifications/${id}`, { read: true })
      feed.refresh()
    } catch {
      /* same as above */
    }
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread ? t('notifications.titleUnread', { count: String(unread) }) : t('notifications.title')
        }
        className="relative grid size-9 place-items-center rounded-xl border border-line bg-paper text-muted transition hover:border-brand/30 hover:bg-brand-50 hover:text-brand"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white end-[-2px]"
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          /*
            Pinned to the end edge so it opens inward in both directions: in
            Arabic the bar is mirrored, and a panel anchored to `right` would
            hang off the screen.
          */
          className="absolute end-0 z-40 mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_45px_rgba(var(--shadow-tint),0.18)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">{t('notifications.title')}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-50 disabled:opacity-45"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-[min(26rem,60vh)] overflow-y-auto">
            {feed.loading ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t('notifications.empty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const Icon = item.source === 'announcement' ? ANNOUNCEMENT_ICON[item.kind] : null

                  return (
                    <li key={`${item.source}-${item.id}`} className={item.read ? '' : 'bg-brand-50/60'}>
                      <div className="flex items-start gap-2.5 px-4 py-3">
                        {Icon && (
                          <span
                            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"
                            aria-hidden="true"
                          >
                            <Icon className="size-3.5" />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          {item.source === 'announcement' ? (
                            <>
                              {/* Written by a person: shown as stored, in both languages. */}
                              <p className="text-sm font-semibold text-ink">{loc(item.title)}</p>
                              <p className="mt-0.5 line-clamp-2 text-sm text-muted">{loc(item.detail)}</p>
                              <p className="mt-1 text-xs text-muted">
                                {item.authorName
                                  ? `${t('announcements.from', { name: loc(item.authorName) })} · `
                                  : ''}
                                {timeAgo(item.at)}
                              </p>
                            </>
                          ) : (
                            <>
                              {/* Written by the app: arrives as a key, translated here. */}
                              <p className="text-sm text-ink">{tm(item.message)}</p>
                              <p className="mt-0.5 text-xs text-muted">{timeAgo(item.at)}</p>
                            </>
                          )}
                        </div>

                        {/*
                          Only a personal notification can be ticked off on its
                          own. An announcement has no per-reader row to update —
                          "mark all as read" moves the watermark for the lot.
                        */}
                        {!item.read && item.source === 'notification' && (
                          <button
                            type="button"
                            onClick={() => void markOneRead(item.id)}
                            aria-label={t('notifications.markRead')}
                            title={t('notifications.markRead')}
                            className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-brand-50 hover:text-brand"
                          >
                            <Check className="size-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
