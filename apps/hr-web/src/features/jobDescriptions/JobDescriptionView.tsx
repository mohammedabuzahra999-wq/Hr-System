import { Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import {
  JOB_DESCRIPTION_SECTIONS,
  type JobDescription,
  type JobDescriptionContent,
  type JobDescriptionSection,
} from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/** Which sections are lists and which are a single paragraph. */
const LIST_SECTIONS = new Set<JobDescriptionSection>([
  'responsibilities',
  'requiredQualifications',
  'requiredSkills',
  'preferredSkills',
  'softSkills',
])

interface Props {
  doc: JobDescription
  /** Omitted for a read-only view. */
  onEditSection?: (section: JobDescriptionSection, value: unknown) => void
  busySection?: JobDescriptionSection | null
}

/**
 * The document, section by section, editable in place.
 *
 * Sections are rendered from the shared list rather than written out one by
 * one, so adding a section to the contract adds it here — the two cannot drift
 * into disagreeing about what a job description contains.
 *
 * An empty section is shown, not hidden. The model is instructed to leave a
 * section empty rather than invent content for it, so an empty one is a real
 * answer — "nothing was specified about education" — and hiding it would turn
 * that answer into silence, which reads like an oversight.
 */
export function JobDescriptionView({ doc, onEditSection, busySection }: Props) {
  const { t, loc } = useI18n()
  const [editing, setEditing] = useState<JobDescriptionSection | null>(null)
  const [draft, setDraft] = useState('')

  const content = doc.content

  function startEdit(section: JobDescriptionSection) {
    const value = content[section as keyof JobDescriptionContent]
    if (value === null) setDraft('')
    else if (LIST_SECTIONS.has(section)) setDraft((loc(value as { en: string[]; ar: string[] })).join('\n'))
    else setDraft(loc(value as { en: string; ar: string }))
    setEditing(section)
  }

  function commit(section: JobDescriptionSection) {
    if (!onEditSection) return
    const existing = content[section as keyof JobDescriptionContent]
    const lang = loc({ en: 'en' as const, ar: 'ar' as const })

    if (LIST_SECTIONS.has(section)) {
      const items = draft.split('\n').map((s) => s.trim()).filter(Boolean)
      const base = (existing as { en: string[]; ar: string[] } | null) ?? { en: [], ar: [] }
      onEditSection(section, { ...base, [lang]: items })
    } else {
      const base = (existing as { en: string; ar: string } | null) ?? { en: '', ar: '' }
      onEditSection(section, { ...base, [lang]: draft.trim() })
    }
    setEditing(null)
  }

  return (
    <div className="space-y-5">
      {JOB_DESCRIPTION_SECTIONS.map((section) => {
        const value = content[section as keyof JobDescriptionContent]
        const isList = LIST_SECTIONS.has(section)
        const items = isList ? loc((value as { en: string[]; ar: string[] } | null) ?? { en: [], ar: [] }) : []
        const text = isList ? '' : value === null ? '' : loc(value as { en: string; ar: string })
        const isEmpty = isList ? items.length === 0 : text.trim() === ''

        return (
          <section key={section} className="border-b border-line pb-4 last:border-0 last:pb-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {t(`jd.section.${section}`)}
              </h4>
              {onEditSection && editing !== section && (
                <button
                  type="button"
                  onClick={() => startEdit(section)}
                  disabled={busySection === section}
                  aria-label={t('jd.editSection')}
                  title={t('jd.editSection')}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-muted transition hover:border-brand hover:text-brand disabled:opacity-45"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {editing === section ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  rows={isList ? Math.max(3, items.length + 1) : 3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={isList ? t('jd.onePerLine') : undefined}
                  className="rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-brand-50 hover:text-brand"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(section)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    {t('common.confirm')}
                  </button>
                </div>
              </div>
            ) : isEmpty ? (
              // Said plainly: nothing was specified, and nothing was invented.
              <p className="text-sm italic text-muted">{t('jd.emptySection')}</p>
            ) : isList ? (
              <ul className="list-inside list-disc space-y-1 text-sm text-ink marker:text-brand">
                {items.map((item, i) => (
                  <li key={`${section}-${i}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="whitespace-pre-line text-sm text-ink">{text}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
