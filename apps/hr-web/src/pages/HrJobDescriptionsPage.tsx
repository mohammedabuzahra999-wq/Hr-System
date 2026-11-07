import { BadgeCheck, Bot, BriefcaseBusiness, FileText, Sparkles, Trash2, UserPen } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import type {
  EmploymentType,
  JobDescription,
  JobDescriptionSection,
  JobLevel,
  ServerEventType,
} from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { JobDescriptionView } from '@/features/jobDescriptions/JobDescriptionView'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { ScorecardEditor } from '@/features/jobDescriptions/ScorecardEditor'
import { errorText } from '@/lib/apiError'

const LIVE_ON: ServerEventType[] = []

const LEVELS: JobLevel[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'manager']
const TYPES: EmploymentType[] = ['fullTime', 'partTime', 'contract', 'temporary']

const STATUS_TONE: Record<JobDescription['status'], BadgeTone> = {
  draft: 'warning',
  approved: 'success',
  archived: 'neutral',
}

const emptyForm = {
  prompt: '',
  title: '',
  department: '',
  level: '' as JobLevel | '',
  employmentType: '' as EmploymentType | '',
  location: '',
  yearsExperience: '',
  education: '',
  requiredSkills: '',
  preferredSkills: '',
  responsibilities: '',
  notes: '',
}

interface LibraryResponse {
  jobDescriptions: JobDescription[]
  provider: { name: string; isModel: boolean }
}

/**
 * Drafting job descriptions.
 *
 * HR supplies the requirements and reviews what comes back — nothing here
 * becomes an approved description without a person pressing approve, and the
 * card says at all times whether what is on screen was written by a model,
 * arranged from the form, or edited by hand since.
 */
export function HrJobDescriptionsPage() {
  const { t, loc, fmt } = useI18n()
  const navigate = useNavigate()
  /**
   * Shown once, right after approving.
   *
   * Approval now has a consequence somewhere else — a draft vacancy appears on
   * the recruitment page — and a consequence the user cannot see is a
   * consequence they will not believe. Cleared when another document is opened.
   */
  const [justApproved, setJustApproved] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busySection, setBusySection] = useState<JobDescriptionSection | null>(null)

  const library = useLiveQuery<LibraryResponse>(() => api.get('/job-descriptions'), [], { on: LIVE_ON })

  const docs = library.data?.jobDescriptions ?? []
  const provider = library.data?.provider
  const selected = docs.find((d) => d.id === selectedId) ?? docs[0] ?? null

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const canGenerate = Boolean(form.prompt.trim() || form.title.trim()) && !busy

  /** Commas or newlines — HR should not have to care which. */
  const toList = (text: string) =>
    text
      .split(/[\n,،]/)
      .map((s) => s.trim())
      .filter(Boolean)

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    if (!canGenerate) return
    setBusy(true)
    setError(null)
    try {
      const body = {
        ...(form.prompt.trim() ? { prompt: form.prompt.trim() } : {}),
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.department.trim() ? { department: form.department.trim() } : {}),
        ...(form.level ? { level: form.level } : {}),
        ...(form.employmentType ? { employmentType: form.employmentType } : {}),
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
        ...(form.yearsExperience ? { yearsExperience: Number(form.yearsExperience) } : {}),
        ...(form.education.trim() ? { education: form.education.trim() } : {}),
        ...(form.requiredSkills.trim() ? { requiredSkills: toList(form.requiredSkills) } : {}),
        ...(form.preferredSkills.trim() ? { preferredSkills: toList(form.preferredSkills) } : {}),
        ...(form.responsibilities.trim() ? { responsibilities: form.responsibilities.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      }
      const created = await api.post<{ jobDescription: JobDescription }>('/job-descriptions/generate', body)
      setForm(emptyForm)
      setSelectedId(created.jobDescription.id)
      library.refresh()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  async function editSection(section: JobDescriptionSection, value: unknown) {
    if (!selected) return
    setBusySection(section)
    setError(null)
    try {
      await api.patch(`/job-descriptions/${selected.id}`, { content: { [section]: value } })
      library.refresh()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusySection(null)
    }
  }

  async function act(run: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await run()
      library.refresh()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand via-brand-700 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(var(--shadow-tint),0.2)] sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.hr')}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('jd.title')}</h2>
        <p className="mt-2 max-w-xl text-sm text-sky-100">{t('jd.subtitle')}</p>
      </div>

      {/*
        Said once, at the top, plainly: whether a model is behind this at all.
        Without a key the feature still works — it arranges the form into the
        right sections — and calling that "AI" would be a lie a buyer deserves
        not to be told.
      */}
      {provider && !provider.isModel && (
        <Alert tone="warning">{t('jd.noModelNotice')}</Alert>
      )}

      {error && <Alert>{error}</Alert>}

      <Card title={t('jd.composeTitle')} icon={Sparkles} className="rounded-2xl">
        <form onSubmit={generate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jd-prompt" className="text-sm font-medium text-ink">
              {t('jd.promptLabel')}
            </label>
            <textarea
              id="jd-prompt"
              rows={3}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder={t('jd.promptPlaceholder')}
              className="rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
            <p className="text-xs text-muted">{t('jd.promptHint')}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input label={t('jd.jobTitle')} value={form.title} onChange={set('title')} />
            <Input label={t('jd.department')} value={form.department} onChange={set('department')} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="jd-level" className="text-sm font-medium text-ink">
                {t('jd.level')}
              </label>
              <select
                id="jd-level"
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as JobLevel | '' }))}
                className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t('jd.unspecified')}</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`jd.level.${l}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jd-type" className="text-sm font-medium text-ink">
                {t('jd.employmentType')}
              </label>
              <select
                id="jd-type"
                value={form.employmentType}
                onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value as EmploymentType | '' }))}
                className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t('jd.unspecified')}</option>
                {TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`jd.type.${v}`)}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label={t('jd.years')}
              type="number"
              min={0}
              max={50}
              value={form.yearsExperience}
              onChange={set('yearsExperience')}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input label={t('jd.requiredSkills')} value={form.requiredSkills} onChange={set('requiredSkills')} />
            <Input label={t('jd.preferredSkills')} value={form.preferredSkills} onChange={set('preferredSkills')} />
            <Input label={t('jd.education')} value={form.education} onChange={set('education')} />
            <Input label={t('jd.location')} value={form.location} onChange={set('location')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="jd-resp" className="text-sm font-medium text-ink">
              {t('jd.responsibilities')}
            </label>
            <textarea
              id="jd-resp"
              rows={3}
              value={form.responsibilities}
              onChange={(e) => setForm((f) => ({ ...f, responsibilities: e.target.value }))}
              placeholder={t('jd.onePerLine')}
              className="rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{t('jd.nothingInvented')}</p>
            <button
              type="submit"
              disabled={!canGenerate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_20px_rgba(var(--shadow-tint),0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {busy ? t('jd.working') : t('jd.generate')}
            </button>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <Card title={t('jd.libraryTitle')} icon={FileText} className="rounded-2xl">
          {library.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted">{t('jd.libraryEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(doc.id)
                      setJustApproved(false)
                    }}
                    aria-current={selected?.id === doc.id}
                    className={`w-full rounded-xl border p-3 text-start transition ${
                      selected?.id === doc.id
                        ? 'border-brand bg-brand-50'
                        : 'border-line bg-paper hover:border-brand/40'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium text-ink">{loc(doc.content.title)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[doc.status]}>{t(`jd.status.${doc.status}`)}</Badge>
                      <span className="text-xs text-muted">{fmt.date(doc.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card
            title={loc(selected.content.title) || t('jd.untitled')}
            icon={FileText}
            className="rounded-2xl"
            action={
              <div className="flex flex-wrap items-center gap-2">
                {selected.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api.post(`/job-descriptions/${selected.id}/approve`)
                        setJustApproved(true)
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-45"
                  >
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {t('jd.approve')}
                  </button>
                )}

                {/*
                  Approving is what moves a role into hiring, so there is
                  normally nothing to press here — the vacancy already exists
                  and this is a link to it.

                  The button is the fallback for descriptions approved before
                  that was true, which have no vacancy attached and would
                  otherwise be stranded.
                */}
                {selected.status === 'approved' &&
                  (selected.openingId ? (
                    <Link
                      to="/hr/recruitment"
                      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
                    >
                      <BriefcaseBusiness className="size-3.5" aria-hidden="true" />
                      {t('jd.goToOpening')}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api.post(`/job-descriptions/${selected.id}/create-opening`)
                          navigate('/hr/recruitment')
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-45"
                    >
                      <BriefcaseBusiness className="size-3.5" aria-hidden="true" />
                      {t('jd.createOpening')}
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t('jd.deleteConfirm'))) return
                    void act(async () => {
                      await api.delete(`/job-descriptions/${selected.id}`)
                      setSelectedId(null)
                    })
                  }}
                  aria-label={t('jd.delete')}
                  className="rounded-md bg-danger-soft px-2 py-1.5 text-danger transition hover:bg-danger/15 disabled:opacity-45"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            }
          >
            {/*
              Approval has a consequence on another screen — a draft vacancy now
              exists — and a consequence nobody can see is one nobody believes.
              Said once, here, with a way to go and look.
            */}
            {justApproved && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft p-3">
                <p className="text-sm font-medium text-ink">{t('jd.approvedMovedToHiring')}</p>
                <button
                  type="button"
                  onClick={() => navigate('/hr/recruitment')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
                >
                  <BriefcaseBusiness className="size-3.5" aria-hidden="true" />
                  {t('jd.goToOpening')}
                </button>
              </div>
            )}

            {/*
              Provenance, stated on the document itself. A reader should never
              have to guess whether a person has been through this.
            */}
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
              <Badge tone={STATUS_TONE[selected.status]}>{t(`jd.status.${selected.status}`)}</Badge>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Bot className="size-3.5" aria-hidden="true" />
                {selected.model ?? t('jd.unknownSource')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <UserPen className="size-3.5" aria-hidden="true" />
                {selected.editedByHuman ? t('jd.humanEdited') : t('jd.notEdited')}
              </span>
              {selected.approvedByName && (
                <span className="text-xs text-muted">
                  {t('jd.approvedBy', { name: loc(selected.approvedByName) })}
                </span>
              )}
            </div>

            <JobDescriptionView doc={selected} onEditSection={editSection} busySection={busySection} />

            {/*
              Below the document, because the weights are about it and cannot be
              read without it. Keyed by id so switching to another description
              loads that one's weights rather than showing the last one's.
            */}
            <ScorecardEditor key={selected.id} jobDescriptionId={selected.id} />
          </Card>
        ) : (
          <Card title={t('jd.previewTitle')} icon={FileText} className="rounded-2xl">
            <p className="text-sm text-muted">{t('jd.previewEmpty')}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
