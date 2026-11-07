import { useEffect, useState } from 'react'
import { Plus, Scale, Trash2 } from 'lucide-react'
import type { Criterion } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * What each requirement of this role is worth when a CV is scored against it.
 *
 * The score used to be a number the model produced from an instruction that
 * said "weighted toward the required ones over the preferred ones" — a sentence
 * nobody could set, check, or explain to a candidate. This is where the weights
 * come from now, and the score is arithmetic over them.
 *
 * Deliberately shown as the whole list at once. A weight only means something
 * beside the others: "English is 30" is not a fact, "English is 30 and Python is
 * 20" is. Editing one at a time, in a modal, would hide the only thing worth
 * looking at — which is also why every row carries its share of the total.
 */

const MAX = 100

export function ScorecardEditor({ jobDescriptionId }: { jobDescriptionId: string }) {
  const { t, loc } = useI18n()
  const [criteria, setCriteria] = useState<Criterion[] | null>(null)
  const [past, setPast] = useState<{ hired: number; perCriterion: { key: string; evidenced: number }[] }>({
    hired: 0,
    perCriterion: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftWeight, setDraftWeight] = useState(20)

  useEffect(() => {
    let live = true
    setCriteria(null)
    setSaved(false)
    setError(null)
    api
      .get<{
        criteria: Criterion[]
        benchmark?: { hired: number; perCriterion: { key: string; evidenced: number }[] }
      }>(`/job-descriptions/${jobDescriptionId}/scorecard`)
      .then((d) => {
        if (!live) return
        setCriteria(d.criteria)
        setPast(d.benchmark ?? { hired: 0, perCriterion: [] })
      })
      .catch((e) => live && setError(errorText(t, e)))
    return () => {
      live = false
    }
  }, [jobDescriptionId, t])

  const touch = () => setSaved(false)

  const setWeight = (id: string, weight: number) => {
    touch()
    const clamped = Math.max(0, Math.min(MAX, Number.isFinite(weight) ? Math.round(weight) : 0))
    setCriteria((prev) => prev?.map((c) => (c.id === id ? { ...c, weight: clamped } : c)) ?? prev)
  }

  function add() {
    const key = draft.trim()
    if (!key || !criteria) return
    /* Already weighed under this name, so the answer is to edit that row. */
    if (criteria.some((c) => c.key === key)) {
      setError(t('scorecard.alreadyThere', { what: key }))
      return
    }
    touch()
    setError(null)
    setCriteria([
      ...criteria,
      { id: `new-${key}`, key, label: { en: key, ar: key }, kind: 'skill', weight: draftWeight, custom: true },
    ])
    setDraft('')
  }

  const remove = (id: string) => {
    touch()
    setCriteria((prev) => prev?.filter((c) => c.id !== id) ?? prev)
  }

  async function save() {
    if (!criteria) return
    setSaving(true)
    setError(null)
    try {
      const d = await api.put<{ criteria: Criterion[] }>(
        `/job-descriptions/${jobDescriptionId}/scorecard`,
        {
          weights: criteria.filter((c) => !c.custom).map((c) => ({ key: c.key, weight: c.weight })),
          extra: criteria.filter((c) => c.custom).map((c) => ({ key: c.key, kind: c.kind, weight: c.weight })),
        },
      )
      setCriteria(d.criteria)
      setSaved(true)
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setSaving(false)
    }
  }

  const total = criteria?.reduce((sum, c) => sum + c.weight, 0) ?? 0

  return (
    <Card title={t('scorecard.title')} icon={Scale} className="mt-4 rounded-2xl">
      <p className="mb-3 text-sm text-muted">{t('scorecard.intro')}</p>

      {error && <Alert>{error}</Alert>}

      {!criteria ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <ul className="space-y-2">
            {criteria.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{loc(c.label)}</p>
                  <p className="text-xs text-muted">
                    {t(`scorecard.kind.${c.kind}` as never)}
                    {c.custom && ` · ${t('scorecard.added')}`}
                  </p>
                  {/*
                    What the people hired into this role had, on this same
                    requirement. An argument for a weight, put to the person
                    setting it — never a weight applied on their behalf.
                  */}
                  {past.hired > 0 && (
                    <p className="text-xs text-brand">
                      {t('scorecard.pastHires', {
                        n: String(past.perCriterion.find((b) => b.key === c.key)?.evidenced ?? 0),
                        of: String(past.hired),
                      })}
                    </p>
                  )}
                </div>

                {/*
                  Each weight's share of the total, beside it.
                  A 30 means nothing until you know whether the rest adds to 70
                  or to 700, and the person setting it should not have to work
                  that out in their head while they set the next one.
                */}
                <span className="w-14 shrink-0 text-end text-xs text-muted tabular-nums">
                  {total > 0 && c.weight > 0 ? `${Math.round((c.weight / total) * 100)}%` : ''}
                </span>

                <input
                  type="number"
                  min={0}
                  max={MAX}
                  step={1}
                  value={c.weight}
                  onChange={(e) => setWeight(c.id, Number(e.target.value))}
                  aria-label={`${loc(c.label)} — ${t('scorecard.weight')}`}
                  className={`h-9 w-20 shrink-0 rounded-md border bg-surface px-2 text-center text-sm tabular-nums focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 ${
                    c.weight === 0 ? 'border-line text-muted' : 'border-line text-ink'
                  }`}
                />

                {/*
                  Only what HR added can be removed. A requirement the document
                  states belongs to the document, and deleting it here would
                  leave the advert asking for something nothing weighs.
                */}
                {c.custom ? (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    aria-label={t('scorecard.remove', { what: loc(c.label) })}
                    className="rounded-md bg-danger-soft p-2 text-danger transition hover:bg-danger/15"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="w-9 shrink-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>

          {/* Adding one the description does not mention. */}
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-ink">{t('scorecard.addLabel')}</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
                placeholder={t('scorecard.addPlaceholder')}
                className="h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink">{t('scorecard.weight')}</span>
              <input
                type="number"
                min={0}
                max={MAX}
                value={draftWeight}
                onChange={(e) => setDraftWeight(Math.max(0, Math.min(MAX, Number(e.target.value) || 0)))}
                className="h-9 w-20 rounded-md border border-line bg-surface px-2 text-center text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
              <Plus className="size-4" aria-hidden="true" />
              {t('scorecard.add')}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} loading={saving} loadingText={t('scorecard.saving')}>
              {t('scorecard.save')}
            </Button>
            {saved && <span className="text-sm text-success">{t('scorecard.saved')}</span>}
            <span className="ms-auto text-xs text-muted">
              {total === 0 ? t('scorecard.allZero') : t('scorecard.total', { total: String(total) })}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
