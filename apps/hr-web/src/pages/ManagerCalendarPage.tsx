import { CalendarDays, Clock3, Plus, UserRoundCheck, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { CalendarEvent, CalendarSummary, ServerEventType } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { TKey } from '@/features/i18n/dictionary'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'
import { toDate } from '@/lib/format'

/** Hoisted so the subscription is not torn down and rebuilt on every render. */
const LIVE_ON: ServerEventType[] = ['calendar.changed', 'request.decided']

const kindMeta: Record<CalendarEvent['kind'], { label: TKey; tone: BadgeTone }> = {
  meeting: { label: 'mgrCal.typeMeeting', tone: 'info' },
  training: { label: 'mgrCal.typeTraining', tone: 'success' },
  leave: { label: 'mgrCal.typeLeave', tone: 'warning' },
  holiday: { label: 'mgrCal.typeHoliday', tone: 'neutral' },
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, with no zone suffix. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The team calendar.
 *
 * Scheduled events and approved leave arrive already merged from the API. Leave
 * is derived there on every read rather than copied in when it is approved, so a
 * reversed decision disappears from here on its own — which is why those rows
 * carry `editable: false` and have no remove button.
 */
export function ManagerCalendarPage() {
  return <TeamCalendar />
}

/** Reused in HR leave management so related work stays together. */
export function TeamCalendar({ embedded = false }: { embedded?: boolean }) {
  const { t, loc, fmt } = useI18n()
  const { user } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<TKey | null>(null)

  const calendar = useLiveQuery<CalendarSummary>(() => api.get('/calendar'), [], { on: LIVE_ON })

  const now = Date.now()
  const events = useMemo(() => calendar.data?.events ?? [], [calendar.data])
  const upcoming = useMemo(
    () => events.filter((e) => toDate(e.endsAt).getTime() >= now),
    [events, now],
  )
  const past = useMemo(
    () => events.filter((e) => toDate(e.endsAt).getTime() < now).reverse(),
    [events, now],
  )

  const figure = (value: number | undefined) =>
    value === undefined ? (calendar.loading ? t('common.loading') : t('common.dash')) : fmt.number(value)

  async function remove(id: string) {
    setBusy(true)
    setActionError(null)
    try {
      await api.delete(`/calendar/${id}`)
      calendar.refresh()
    } catch (error) {
      setActionError(errorKey(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-6xl space-y-6'}>
      {embedded ? (
        <div className="flex justify-end">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('mgrCal.addTitle')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">
              {t(user?.role === 'manager' ? 'section.manager' : 'section.hr')}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('mgrCal.title')}</h2>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('mgrCal.addTitle')}
          </Button>
        </div>
      )}

      {(calendar.error || actionError) && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(actionError ?? errorKey(calendar.error))}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('mgrCal.meetings')} icon={Clock3} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(calendar.data?.meetings)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrCal.meetingsSub')}</p>
        </Card>
        <Card title={t('mgrCal.leaveDays')} icon={CalendarDays} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(calendar.data?.leaveDays)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrCal.leaveDaysSub')}</p>
        </Card>
        <Card title={t('mgrCal.training')} icon={UserRoundCheck} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(calendar.data?.training)}</p>
          <p className="mt-2 text-sm text-muted">{t('mgrCal.trainingSub')}</p>
        </Card>
      </div>

      <Card title={t('mgrCal.scheduleTitle')} icon={CalendarDays} className="rounded-2xl">
        {calendar.loading && <p className="text-sm text-muted">{t('common.loading')}</p>}
        {!calendar.loading && events.length === 0 && <p className="text-sm text-muted">{t('common.noData')}</p>}

        {upcoming.length > 0 && (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('mgrCal.upcoming')}
            </p>
            <ul className="space-y-3">
              {upcoming.map((event) => (
                <EventRow key={event.id} event={event} busy={busy} onRemove={remove} />
              ))}
            </ul>
          </>
        )}

        {past.length > 0 && (
          <>
            <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('mgrCal.past')}
            </p>
            <ul className="space-y-3 opacity-70">
              {past.map((event) => (
                <EventRow key={event.id} event={event} busy={busy} onRemove={remove} />
              ))}
            </ul>
          </>
        )}
      </Card>

      <AddEventModal
        open={addOpen}
        audience={user?.role === 'manager' ? 'team' : 'company'}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false)
          calendar.refresh()
        }}
      />
    </div>
  )

  function EventRow({
    event,
    busy: rowBusy,
    onRemove,
  }: {
    event: CalendarEvent
    busy: boolean
    onRemove: (id: string) => void
  }) {
    const meta = kindMeta[event.kind]
    const start = toDate(event.startsAt)

    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {event.kind === 'leave' && event.personName
              ? t('mgrCal.away', { name: loc(event.personName) })
              : loc(event.title)}
          </p>
          <p className="text-sm text-muted">
            {event.allDay ? `${fmt.dayDate(start)} · ${t('mgrCal.allDay')}` : `${fmt.dayDate(start)} · ${fmt.time(start)}`}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={meta.tone}>{t(meta.label)}</Badge>
          {/* Derived rows have nothing to delete — their source is a leave request. */}
          {event.editable && (
            <button
              type="button"
              onClick={() => onRemove(event.id)}
              disabled={rowBusy}
              title={t('mgrCal.remove')}
              aria-label={t('mgrCal.remove')}
              className="rounded-md p-1.5 text-muted transition hover:bg-red-50 hover:text-danger disabled:opacity-45"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </li>
    )
  }
}

function AddEventModal({
  open,
  audience,
  onClose,
  onCreated,
}: {
  open: boolean
  audience: 'team' | 'company'
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useI18n()
  const [titleText, setTitleText] = useState('')
  const [location, setLocation] = useState('')
  const [kind, setKind] = useState<'meeting' | 'training' | 'holiday'>('meeting')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<TKey | null>(null)

  const problems: { title?: string; startsAt?: string; endsAt?: string } = {}
  if (!titleText.trim()) problems.title = t('userForm.required')
  if (!startsAt) problems.startsAt = t('userForm.required')
  if (!endsAt) problems.endsAt = t('userForm.required')
  else if (startsAt && endsAt < startsAt) problems.endsAt = t('mgrCal.errOrder')
  const errors = touched ? problems : {}

  function reset() {
    setTitleText('')
    setLocation('')
    setKind('meeting')
    setStartsAt('')
    setEndsAt('')
    setTouched(false)
    setError(null)
  }

  function handleClose() {
    if (busy) return
    reset()
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setError(null)
    if (Object.keys(problems).length > 0 || busy) return

    setBusy(true)
    try {
      // The author writes in one language; both fields carry it so the row stays
      // valid and the card still reads after a language switch.
      const text = titleText.trim()
      await api.post('/calendar', {
        kind,
        title: { en: text, ar: text },
        // datetime-local has no zone, so it is read as local time and sent as an instant.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        allDay: false,
        location: location.trim() || undefined,
        audience,
      })
      reset()
      onCreated()
    } catch (e) {
      setError(errorKey(e))
    } finally {
      setBusy(false)
    }
  }

  /** Opening with sensible times beats making someone type both from scratch. */
  if (open && !startsAt) {
    const soon = new Date()
    soon.setHours(soon.getHours() + 1, 0, 0, 0)
    const later = new Date(soon)
    later.setHours(later.getHours() + 1)
    setStartsAt(localInputValue(soon))
    setEndsAt(localInputValue(later))
  }

  return (
    <Modal open={open} title={t('mgrCal.addTitle')} onClose={handleClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          label={t('mgrCal.eventTitle')}
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          error={errors.title}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-kind" className="text-sm font-medium text-ink">
            {t('table.type')}
          </label>
          <select
            id="event-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          >
            <option value="meeting">{t('mgrCal.typeMeeting')}</option>
            <option value="training">{t('mgrCal.typeTraining')}</option>
            <option value="holiday">{t('mgrCal.typeHoliday')}</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('mgrCal.startsAt')}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            error={errors.startsAt}
          />
          <Input
            label={t('mgrCal.endsAt')}
            type="datetime-local"
            value={endsAt}
            min={startsAt || undefined}
            onChange={(e) => setEndsAt(e.target.value)}
            error={errors.endsAt}
          />
        </div>

        <Input
          label={t('mgrCal.eventLocation')}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {error && (
          <p role="alert" className="rounded-md border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
            {t(error)}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy} loadingText={t('common.loading')}>
            {t('mgrCal.add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
