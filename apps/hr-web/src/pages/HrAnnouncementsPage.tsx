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

/** Hoisted so the subscription is not rebuilt on every keystroke in the form. */
const LIVE_ON: ServerEventType[] = ['announcement.published']

/**
 * Announcements, written here and read everywhere.
 *
 * HR and managers both post; everyone reads. Every post reaches the whole
 * company, which is why this screen has no audience picker — the server would
 * ignore one. HR may withdraw any post, including a manager's.
 */
export function HrAnnouncementsPage() {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Announcement | null>(null)

  const feed = useLiveQuery<{ announcements: Announcement[] }>(() => api.get('/feed/announcements?scope=manage'), [], {
    on: LIVE_ON,
  })

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
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('hrAnn.title')}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">{t('hrAnn.subtitle')}</p>
      </div>

      {(error || feed.error) && (
        <Alert>
          {error ?? errorText(t, feed.error)}
        </Alert>
      )}

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
