import { Bell, X } from 'lucide-react'
import type { AppNotification } from '@hr/shared'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useI18n } from '@/features/i18n/useI18n'

interface NotificationsCardProps {
  notifications: AppNotification[]
  onToggleRead: (id: string, read: boolean) => void
  onDismiss: (id: string) => void
  onMarkAllRead: () => void
  className?: string
}

export function NotificationsCard({
  notifications,
  onToggleRead,
  onDismiss,
  onMarkAllRead,
  className,
}: NotificationsCardProps) {
  const { t, tm, fmt, timeAgo } = useI18n()
  const unread = notifications.filter((notification) => !notification.read).length

  return (
    <Card
      title={unread ? t('notifications.titleUnread', { count: fmt.number(unread) }) : t('notifications.title')}
      icon={Bell}
      className={className}
      action={
        unread > 0 && (
          <button
            onClick={onMarkAllRead}
            className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-50"
          >
            {t('notifications.markAllRead')}
          </button>
        )
      }
    >
      {notifications.length === 0 ? (
        <p className="text-sm text-muted">{t('notifications.empty')}</p>
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {notifications.map((notification) => (
            <li key={notification.id} className="group flex items-start gap-3 py-3">
              {/* The dot is the control: tapping it flips read state both ways. */}
              <button
                onClick={() => onToggleRead(notification.id, !notification.read)}
                title={notification.read ? t('notifications.markUnread') : t('notifications.markRead')}
                aria-label={notification.read ? t('notifications.markUnread') : t('notifications.markRead')}
                aria-pressed={!notification.read}
                className="mt-0.5 shrink-0 rounded-full p-1.5 hover:bg-brand-50"
              >
                <span
                  className={cn(
                    'block size-2 rounded-full',
                    notification.read ? 'border border-muted/50' : 'bg-brand',
                  )}
                />
              </button>

              <div className="min-w-0">
                <p className={cn('text-sm', notification.read ? 'text-muted' : 'font-medium text-ink')}>
                  {tm(notification.message)}
                </p>
                <p className="mt-0.5 text-xs text-muted">{timeAgo(notification.at)}</p>
              </div>

              {/* Stays visible on touch screens, which have no hover state. */}
              <button
                onClick={() => onDismiss(notification.id)}
                title={t('notifications.dismiss')}
                aria-label={t('notifications.dismiss')}
                className="ms-auto shrink-0 rounded-md p-1.5 text-muted transition-opacity hover:bg-paper hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
