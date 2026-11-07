import { CalendarOff, Megaphone, Save, Send, Users, X } from 'lucide-react'
import { useState } from 'react'
import type { Announcement, AnnouncementKind } from '@hr/shared'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

const KINDS: { value: AnnouncementKind; icon: typeof Megaphone }[] = [
  { value: 'general', icon: Megaphone },
  { value: 'holiday', icon: CalendarOff },
  { value: 'meeting', icon: Users },
]

/**
 * How long it stays up.
 *
 * Offered as durations because that is how the decision is actually made — "for
 * a week", not "until the 27th" — but stored as the resulting instant, so the
 * notice lapses on time regardless of when it was last edited. `custom` hands
 * over to a date field for the cases a preset does not cover.
 */
const DURATIONS = [
  { value: 'none', days: null },
  { value: 'd1', days: 1 },
  { value: 'd3', days: 3 },
  { value: 'd7', days: 7 },
  { value: 'd14', days: 14 },
  { value: 'd30', days: 30 },
  { value: 'custom', days: null },
] as const

type DurationValue = (typeof DURATIONS)[number]['value']

const empty = { titleEn: '', titleAr: '', detailEn: '', detailAr: '' }

/** End of the chosen day, so "until the 27th" includes the 27th. */
function endOfDay(isoDate: string): string {
  const d = new Date(`${isoDate}T23:59:59`)
  return d.toISOString()
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/**
 * Writing an announcement, or rewriting one.
 *
 * Shared by HR and by managers, who post the same thing to the same audience —
 * the whole company. What differs between them is only who the reader sees it
 * came from, and that is stamped by the server from the session, never sent from
 * here.
 */
export function AnnouncementComposer({
  editing,
  onDone,
  onCancelEdit,
  onError,
}: {
  /** A post being rewritten, or null to write a new one. */
  editing?: Announcement | null
  onDone: () => void
  onCancelEdit?: () => void
  onError: (message: string | null) => void
}) {
  const { t, fmt } = useI18n()
  /**
   * Seeded from the post being edited, not synchronised to it.
   *
   * The caller gives this component a `key` tied to the row, so choosing a
   * different one remounts the form and these initialisers run again. That is
   * React's own answer to "reset state when the input changes", and it avoids
   * the extra render an effect-plus-setState pass would cost on every edit.
   */
  const [form, setForm] = useState(() =>
    editing
      ? {
          titleEn: editing.title.en,
          titleAr: editing.title.ar,
          detailEn: editing.detail.en,
          detailAr: editing.detail.ar,
        }
      : empty,
  )
  const [kind, setKind] = useState<AnnouncementKind>(editing?.kind ?? 'general')
  // An existing expiry is shown as a date: the original duration is not
  // recoverable from it, and guessing one would be a fiction.
  const [duration, setDuration] = useState<DurationValue>(editing?.expiresAt ? 'custom' : 'none')
  const [customDate, setCustomDate] = useState(editing?.expiresAt?.slice(0, 10) ?? '')
  const [sending, setSending] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const hasTitle = form.titleEn.trim() || form.titleAr.trim()
  const hasDetail = form.detailEn.trim() || form.detailAr.trim()
  const durationOk = duration !== 'custom' || customDate !== ''
  const canSend = Boolean(hasTitle && hasDetail) && durationOk && !sending

  function expiryFromForm(): string | null {
    if (duration === 'none') return null
    if (duration === 'custom') return customDate ? endOfDay(customDate) : null
    return daysFromNow(DURATIONS.find((d) => d.value === duration)!.days!)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    onError(null)
    try {
      /**
       * Either language alone is enough to post; the empty one takes the text of
       * the other. A reader then always sees words rather than a blank card, and
       * nobody is blocked from announcing a holiday because they had not
       * translated it yet.
       */
      const pick = (a: string, b: string) => a.trim() || b.trim()
      const body = {
        title: { en: pick(form.titleEn, form.titleAr), ar: pick(form.titleAr, form.titleEn) },
        detail: { en: pick(form.detailEn, form.detailAr), ar: pick(form.detailAr, form.detailEn) },
        kind,
        expiresAt: expiryFromForm(),
      }

      if (editing) await api.patch(`/feed/announcements/${editing.id}`, body)
      else await api.post('/feed/announcements', body)

      setForm(empty)
      setKind('general')
      setDuration('none')
      setCustomDate('')
      onDone()
    } catch (err) {
      onError(errorText(t, err))
    } finally {
      setSending(false)
    }
  }

  const preview = (() => {
    const at = expiryFromForm()
    return at ? t('hrAnn.untilDate', { date: fmt.date(at) }) : t('hrAnn.staysUp')
  })()

  return (
    <Card
      title={editing ? t('hrAnn.editTitle') : t('hrAnn.composeTitle')}
      icon={editing ? Save : Send}
      className="rounded-2xl"
      action={
        editing && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition hover:bg-brand-50 hover:text-brand"
          >
            <X className="size-3.5" aria-hidden="true" />
            {t('hrAnn.cancelEdit')}
          </button>
        ) : null
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">{t('hrAnn.kindLegend')}</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  kind === value
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-paper text-muted hover:border-brand/40 hover:text-brand'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(`announcements.kind.${value}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label={t('hrAnn.titleAr')} value={form.titleAr} onChange={set('titleAr')} dir="rtl" />
          <Input label={t('hrAnn.titleEn')} value={form.titleEn} onChange={set('titleEn')} dir="ltr" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-detail-ar" className="text-sm font-medium text-ink">
              {t('hrAnn.detailAr')}
            </label>
            <textarea
              id="ann-detail-ar"
              dir="rtl"
              rows={4}
              value={form.detailAr}
              onChange={(e) => setForm((f) => ({ ...f, detailAr: e.target.value }))}
              className="rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-detail-en" className="text-sm font-medium text-ink">
              {t('hrAnn.detailEn')}
            </label>
            <textarea
              id="ann-detail-en"
              dir="ltr"
              rows={4}
              value={form.detailEn}
              onChange={(e) => setForm((f) => ({ ...f, detailEn: e.target.value }))}
              className="rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-line bg-paper p-3 sm:grid-cols-[auto_1fr] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-duration" className="text-sm font-medium text-ink">
              {t('hrAnn.durationLabel')}
            </label>
            <select
              id="ann-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value as DurationValue)}
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink"
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {t(`hrAnn.duration.${d.value}`)}
                </option>
              ))}
            </select>
          </div>

          {duration === 'custom' ? (
            <Input
              label={t('hrAnn.untilLabel')}
              type="date"
              value={customDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setCustomDate(e.target.value)}
              required
            />
          ) : (
            // States the consequence in the same words the reader will see later.
            <p className="text-sm text-muted sm:pb-2.5">{preview}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">{t('hrAnn.oneLanguageIsEnough')}</p>
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_20px_rgba(var(--shadow-tint),0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            {editing ? <Save className="size-4" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {sending ? t('common.loading') : editing ? t('hrAnn.saveEdit') : t('hrAnn.publish')}
          </button>
        </div>
      </form>
    </Card>
  )
}
