import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/features/i18n/useI18n'

/** Mirrors `FormField` on the server. The server declares the boxes; this draws them. */
export interface GapField {
  field: string
  label: { en: string; ar: string }
  kind: 'text' | 'longText' | 'date' | 'choice'
  required: boolean
  options?: { value: string; label: { en: string; ar: string } }[]
  hint?: { en: string; ar: string }
  /** Set when the server folds this box into another field. Nothing to draw differently. */
  into?: string
}

interface GapFormProps {
  fields: GapField[]
  /** What the sentence already said, so nothing has to be typed twice. */
  initial: Record<string, string>
  /**
   * Field name to the approved description its value was taken from.
   *
   * Shown beside the box rather than silently accepted. A value copied from a
   * role that turns out not to be the same role is the failure this feature can
   * have, and it is only catchable by the person if they can see where it came
   * from before they agree to it.
   */
  suggested: Record<string, string>
  busy: boolean
  onSubmit: (values: Record<string, string>) => void
  onCancel: () => void
}

/**
 * The boxes an instruction is still short of.
 *
 * Shown instead of asking for one detail per message. Five messages to add an
 * employee gave no way to see what was coming and no way to fix the second
 * answer after giving the fourth — a form does both, which is the thing forms
 * are for. Anything the sentence already said arrives filled in.
 *
 * Required boxes are checked here before anything is sent, so an empty one is
 * marked in place rather than answered with a round trip. That is not the
 * authority on it: the server checks the same things again, because this runs on
 * the client and nothing that runs on the client decides anything.
 */
export function GapForm({ fields, initial, suggested, busy, onSubmit, onCancel }: GapFormProps) {
  const { t, lang, fmt } = useI18n()
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [showEmpty, setShowEmpty] = useState(false)

  /* A new set of boxes replaces the old ones rather than merging into them. */
  useEffect(() => {
    setValues(initial)
    setShowEmpty(false)
  }, [fields, initial])

  const loc = (v: { en: string; ar: string }) => (lang === 'ar' ? v.ar : v.en)
  const at = (f: string) => values[f] ?? ''
  const set = (f: string, v: string) => setValues((prev) => ({ ...prev, [f]: v }))

  const missing = fields.filter((f) => f.required && !at(f.field).trim())
  /*
   * Offered once there is genuinely something to skip past.
   *
   * Which means: everything required is filled, and something optional is not.
   * Before that it would sit beside the main button doing exactly what the main
   * button does, and two controls with one effect is a question the person has
   * to stop and answer. It sends what is typed and clears nothing — a button
   * that quietly discarded somebody's input would be a trap.
   */
  const somethingToSkip =
    missing.length === 0 && fields.some((f) => !f.required && !at(f.field).trim())

  function submit() {
    if (missing.length) {
      setShowEmpty(true)
      return
    }
    onSubmit(values)
  }

  const box =
    'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 ' +
    'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {fields.map((f) => {
        const empty = showEmpty && f.required && !at(f.field).trim()
        const id = `gap-${f.field}`
        return (
          <div key={f.field} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-ink">
              {loc(f.label)}
              {!f.required && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-normal text-muted">
                  {t('copilot.form.optional')}
                </span>
              )}
            </label>

            {f.kind === 'choice' ? (
              <select
                id={id}
                value={at(f.field)}
                onChange={(e) => set(f.field, e.target.value)}
                className={`${box} ${empty ? 'border-danger' : 'border-line'}`}
              >
                <option value="">{t('copilot.form.pick')}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {loc(o.label)}
                  </option>
                ))}
              </select>
            ) : f.kind === 'longText' ? (
              <textarea
                id={id}
                rows={3}
                value={at(f.field)}
                onChange={(e) => set(f.field, e.target.value)}
                className={`w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 ${
                  empty ? 'border-danger' : 'border-line'
                }`}
              />
            ) : (
              <input
                id={id}
                type={f.kind === 'date' ? 'date' : 'text'}
                value={at(f.field)}
                onChange={(e) => set(f.field, e.target.value)}
                aria-invalid={empty}
                className={`${box} ${empty ? 'border-danger' : 'border-line'}`}
              />
            )}

            {/*
              A date, written out.

              The box itself is the browser's, and the browser formats it in the
              locale of whoever is using it — so the same field reads 05/06 as
              the 5th of June to one person and the 6th of May to another, and
              neither of them can tell which they are looking at. Echoing the
              day in words settles it where it is typed, rather than leaving it
              to be caught at the confirmation.
            */}
            {f.kind === 'date' && at(f.field) && (
              <p className="text-xs text-brand">{fmt.date(at(f.field))}</p>
            )}
            {/* Only while it is still the suggested text; editing it makes it theirs. */}
            {suggested[f.field] && at(f.field) === (initial[f.field] ?? '') && (
              <p className="text-xs text-brand">
                {t('copilot.form.from', { source: suggested[f.field] ?? '' })}
              </p>
            )}
            {f.hint && <p className="text-xs text-muted">{loc(f.hint)}</p>}
            {empty && (
              <p role="alert" className="text-xs text-danger">
                {t('copilot.form.needed')}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" loading={busy} loadingText={t('copilot.form.sending')}>
          {t('copilot.form.submit')}
        </Button>
        {somethingToSkip && (
          <Button type="button" variant="secondary" disabled={busy} onClick={submit}>
            {t('copilot.form.skip')}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
