import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import type { Announcement } from '@hr/shared'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { AuthorLine } from '@/features/announcements/AuthorLine'
import { cn } from '@/lib/cn'
import { useI18n } from '@/features/i18n/useI18n'

export function AnnouncementsCard({ items, className }: { items: Announcement[]; className?: string }) {
  const { t, fmt, loc } = useI18n()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <Card title={t('announcements.title')} icon={Megaphone} className={className}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('announcements.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const open = expanded === item.id

            return (
              <li key={item.id} className="flex gap-3 rounded-md border border-line p-3">
                <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-md bg-brand-50 py-1.5 text-brand">
                  <span className="text-xs font-medium">{fmt.shortMonth(item.publishedAt)}</span>
                  <span className="text-lg font-bold leading-none">{fmt.dayNumber(item.publishedAt)}</span>
                </div>

                <div className="min-w-0">
                  {/* Written by a person, so it carries both languages rather than a key. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{loc(item.title)}</p>
                    {/* A holiday and a meeting are read differently; say which this is. */}
                    {item.kind !== 'general' && (
                      <Badge tone={item.kind === 'holiday' ? 'success' : 'info'}>
                        {t(`announcements.kind.${item.kind}`)}
                      </Badge>
                    )}
                  </div>
                  {/* Who sent it, right under the title: an employee reads a
                      notice from HR and one from their own manager differently. */}
                  <AuthorLine item={item} className="mt-0.5 block text-xs text-muted" />
                  <p className={cn('mt-1 text-sm text-muted', !open && 'line-clamp-2')}>{loc(item.detail)}</p>
                  <button
                    onClick={() => setExpanded(open ? null : item.id)}
                    aria-expanded={open}
                    className="mt-1 text-xs font-medium text-brand hover:underline"
                  >
                    {open ? t('common.readLess') : t('common.readMore')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
