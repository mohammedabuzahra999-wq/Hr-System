import { Megaphone } from 'lucide-react'
import { useState } from 'react'
import type { Announcement, ServerEventType } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { AnnouncementComposer } from '@/features/announcements/AnnouncementComposer'
import { AnnouncementList } from '@/features/announcements/AnnouncementList'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

const LIVE_ON: ServerEventType[] = ['announcement.published']

/**
 * Announcements from the administrator.
 *
 * The permission already existed on the server — `POST /feed/announcements`
 * has always admitted admin — but there was no screen behind it, so it was a
 * right nobody could exercise. This is that screen.
 *
 * An administrator may withdraw and rewrite anything, including HR's and a
 * manager's: they are the account that answers for what the company has told
 * its staff. The list is shown with `scope=manage` so lapsed notices are visible
 * here too, and can be extended rather than silently forgotten.
 */
export function AdminAnnouncementsPage() {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Announcement | null>(null)

  const feed = useLiveQuery<{ announcements: Announcement[] }>(
    () => api.get('/feed/announcements?scope=manage'),
    [],
    { on: LIVE_ON },
  )

  async function remove(item: Announcement) {
    if (!window.confirm(t('announcements.removeConfirm'))) return
    setBusyId(item.id)
    setError(null)
    try {
      await api.delete(`/feed/announcements/${item.id}`)
      if (editing?.id === item.id) setEditing(null)
      feed.refresh()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-brand-700 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.2)] sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.admin')}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('adminAnn.title')}</h2>
        <p className="mt-2 max-w-xl text-sm text-sky-100">{t('adminAnn.subtitle')}</p>
      </div>

      {(error || feed.error) && <Alert>{error ?? errorText(t, feed.error)}</Alert>}

      <AnnouncementComposer
        key={editing?.id ?? 'new'}
        editing={editing}
        onDone={() => {
          setEditing(null)
          feed.refresh()
        }}
        onCancelEdit={() => setEditing(null)}
        onError={setError}
      />

      <Card title={t('hrAnn.listTitle')} icon={Megaphone} className="rounded-2xl">
        <AnnouncementList
          items={feed.data?.announcements ?? []}
          loading={feed.loading}
          onDelete={remove}
          onEdit={setEditing}
          editingId={editing?.id ?? null}
          busyId={busyId}
        />
      </Card>
    </div>
  )
}
