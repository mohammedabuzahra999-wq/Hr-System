import { Bell, Megaphone } from 'lucide-react'
import { useState } from 'react'
import type { Announcement, ServerEventType } from '@hr/shared'
import { Card } from '@/components/ui/Card'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'

/** Hoisted so the subscription is not torn down and rebuilt on every keystroke. */
const LIVE_ON: ServerEventType[] = ['announcement.published']

/** Decorative only — the dot cycles by position, it does not encode anything. */
const DOTS = ['bg-brand', 'bg-amber-500', 'bg-emerald-500']

export function ManagerAnnouncementsPage() {
  const { t, loc, fmt } = useI18n()

  const feed = useLiveQuery<{ announcements: Announcement[] }>(
    () => api.get('/feed/announcements'),
    [],
    { on: LIVE_ON },
  )

  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<TKey | null>(null)

  const items = feed.data?.announcements ?? []
  const canSend = title.trim().length > 0 && detail.trim().length > 0 && !sending

  async function send() {
    if (!canSend) return
    setSending(true)
    setSendError(null)
    try {
      // The author writes in one language; both fields carry it so the row stays
      // valid and the card still reads after a language switch.
      const titleText = title.trim()
      const detailText = detail.trim()
      await api.post('/feed/announcements', {
        title: { en: titleText, ar: titleText },
        detail: { en: detailText, ar: detailText },
        audience: 'team',
      })
      setTitle('')
      setDetail('')
      feed.refresh()
    } catch (error) {
      setSendError(errorKey(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.manager')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('mgrAnn.title')}</h2>
        </div>
      </div>

      <Card title={t('mgrAnn.listTitle')} icon={Megaphone} className="rounded-2xl">
        {feed.error && (
          <p role="alert" className="mb-3 rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
            {t(errorKey(feed.error))}
          </p>
        )}

        {feed.loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">{t('announcements.empty')}</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3">
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOTS[index % DOTS.length] ?? 'bg-brand'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  {/* Written by a person, so it carries both languages rather than a key. */}
                  <p className="text-sm font-semibold text-ink">{loc(item.title)}</p>
                  <p className="mt-0.5 text-sm text-ink">{loc(item.detail)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {fmt.date(item.publishedAt)}
                    {item.authorName ? ` · ${loc(item.authorName)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('mgrAnn.composeTitle')} icon={Bell} className="rounded-2xl">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={sending}
          className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
          placeholder={t('mgrAnn.composeTitle')}
          aria-label={t('mgrAnn.composeTitle')}
        />
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          disabled={sending}
          className="mt-3 min-h-[132px] w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
          placeholder={t('mgrAnn.placeholder')}
          aria-label={t('mgrAnn.placeholder')}
        />

        {sendError && (
          <p role="alert" className="mt-3 rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
            {t(sendError)}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-brand"
          >
            {sending ? t('common.loading') : t('mgrAnn.send')}
          </button>
        </div>
      </Card>
    </div>
  )
}
