import { Archive, ArchiveRestore, BriefcaseBusiness, Copy, FileText, Pencil, Plus, Send, Trash2, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  Application,
  ApplicationStatus,
  Candidate,
  JobOpening,
  OpeningStatus,
  ServerEventType,
} from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { CvRow } from '@/features/recruitment/CvRow'
import { CvUploadButton } from '@/features/recruitment/CvUploadButton'
import { CvMatch } from '@/features/recruitment/CvMatch'
import { SendInterview } from '@/features/recruitment/SendInterview'
import { HrAiInterview } from '@/features/aiInterviewer/HrAiInterview'
import { LinkedInPost } from '@/features/recruitment/LinkedInPost'
import { api, query } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/** Declared once: a fresh array each render would re-open the subscription. */
const LIVE_ON: ServerEventType[] = ['recruitment.changed']

const OPENING_TONES: Record<OpeningStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  onHold: 'warning',
  closed: 'neutral',
}

/**
 * The status control is tinted rather than labelled twice: a dropdown already
 * shows the status in words, so a badge beside it repeated the same word. Colour
 * is the part that a badge added, so colour is the part that is kept.
 */
const STATUS_TINT: Record<ApplicationStatus, string> = {
  new: 'border-line text-ink',
  underReview: 'border-brand/40 text-brand',
  shortlisted: 'border-brand/40 text-brand',
  interview: 'border-amber-400 text-amber-700',
  offer: 'border-brand/40 text-brand',
  hired: 'border-emerald-400 text-emerald-700',
  rejected: 'border-danger/40 text-danger',
}

const STATUSES: ApplicationStatus[] = [
  'new',
  'underReview',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
]

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Hiring: the roles that are open, who applied, and their CVs.
 *
 * Both lists refresh on one event, because a candidate, an opening and an upload
 * all change what this page shows and the server does not care which of them the
 * viewer is looking at.
 */
/**
 * A row action: an icon, its name on hover, and the same footprint every time.
 *
 * Uniform size is the whole point. A column of buttons that changes width with
 * the length of its label cannot line up, and a table whose rows do not line up
 * is read one row at a time.
 */
function IconAction({
  label,
  onClick,
  busy,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  busy?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`grid size-8 shrink-0 place-items-center rounded-md border border-line bg-paper transition disabled:opacity-45 ${
        danger ? 'text-danger hover:border-danger hover:bg-danger-soft' : 'text-ink hover:border-brand hover:text-brand'
      }`}
    >
      {children}
    </button>
  )
}

export function HrRecruitmentPage() {
  const { t, loc, fmt } = useI18n()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [openingForm, setOpeningForm] = useState(false)
  /** The vacancy being edited, or null when the form is creating a new one. */
  const [editingOpening, setEditingOpening] = useState<JobOpening | null>(null)
  const stageValue = params.get('stage')
  const statusFilter: ApplicationStatus | '' =
    STATUSES.includes(stageValue as ApplicationStatus) ? stageValue as ApplicationStatus : ''
  const openingFilter = params.get('opening') ?? ''
  const setStatusFilter = (value: ApplicationStatus | '') =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('stage', value)
      else next.delete('stage')
      return next
    }, { replace: true })
  const setOpeningFilter = (value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('opening', value)
      else next.delete('opening')
      return next
    }, { replace: true })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const openings = useLiveQuery<{ openings: JobOpening[] }>(() => api.get('/recruitment/openings'), [], {
    on: LIVE_ON,
  })
  const applications = useLiveQuery<{ applications: Application[] }>(
    () => api.get(`/recruitment/applications${query({ openingId: openingFilter, status: statusFilter })}`),
    [openingFilter, statusFilter],
    { on: LIVE_ON },
  )
  const candidates = useLiveQuery<{ candidates: Candidate[] }>(() => api.get('/recruitment/candidates'), [], {
    on: LIVE_ON,
  })

  // Memoised off the query results, not off a `?? []` that is a new array every
  // render — otherwise the lists below it re-derive on every keystroke elsewhere.
  const openingRows = useMemo(() => openings.data?.openings ?? [], [openings.data])
  const applicationRows = useMemo(() => applications.data?.applications ?? [], [applications.data])
  const candidateRows = useMemo(() => candidates.data?.candidates ?? [], [candidates.data])
  const loading = openings.loading || applications.loading || candidates.loading

  const counts = useMemo(
    () => ({
      open: openingRows.filter((o) => o.acceptingApplications).length,
      candidates: candidateRows.length,
      withCv: applicationRows.filter((a) => a.cv).length,
    }),
    [openingRows, applicationRows, candidateRows],
  )

  const figure = (n: number) => (loading ? t('common.dash') : fmt.number(n))

  function refreshAll() {
    openings.refresh()
    applications.refresh()
    candidates.refresh()
  }

  /**
   * The public address, copied rather than shown in full.
   *
   * It is built from the browser's own origin because that is where the careers
   * page is served from — hardcoding a domain would put a link to the wrong
   * host on every deployment but one.
   */
  async function copyLink(row: JobOpening) {
    if (!row.publicSlug) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/careers/jobs/${row.publicSlug}`)
      setCopied(row.id)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setError(t('err.unknown'))
    }
  }

  async function act<T>(id: string, run: () => Promise<T>) {
    setBusyId(id)
    setError(null)
    try {
      await run()
      refreshAll()
    } catch (e) {
      setError(errorText(t, e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand via-brand-700 to-indigo-900 p-6 text-white shadow-[0_18px_55px_rgba(29,78,216,0.2)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">{t('section.hr')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('recruit.title')}</h2>
            <p className="mt-2 max-w-xl text-sm text-sky-100">{t('recruit.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => {
                setEditingOpening(null)
                setOpeningForm(true)
              }} className="gap-1.5">
              <Plus className="size-4" aria-hidden="true" />
              {t('recruit.newOpening')}
            </Button>
          </div>
        </div>
      </div>

      {(error || openings.error || applications.error || candidates.error) && (
        <Alert>
          {error ?? errorText(t, openings.error ?? applications.error ?? candidates.error)}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('recruit.openings')} icon={BriefcaseBusiness} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(counts.open)}</p>
          <p className="mt-2 text-sm text-muted">{t('recruit.openingsSub')}</p>
        </Card>
        <Card title={t('recruit.candidates')} icon={UsersRound} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(counts.candidates)}</p>
          <p className="mt-2 text-sm text-muted">{t('recruit.candidatesSub')}</p>
        </Card>
        <Card title={t('recruit.withCv')} icon={FileText} className="rounded-2xl">
          <p className="text-3xl font-bold">{figure(counts.withCv)}</p>
          <p className="mt-2 text-sm text-muted">{t('recruit.withCvSub')}</p>
        </Card>
      </div>

      <Card title={t('recruit.openingsTitle')} icon={BriefcaseBusiness} className="rounded-2xl">
        <DataTable
          /* Roughly six rows before it scrolls, so what follows stays reachable. */
          maxHeight="max-h-[26rem]"
          rows={openingRows}
          rowKey={(row) => row.id}
          loading={openings.loading}
          empty={t('recruit.noOpenings')}
          columns={[
            {
              key: 'title',
              header: t('table.role'),
              primary: true,
              cell: (row) => (
                <div>
                  <span className="font-medium text-ink">{loc(row.title)}</span>
                  <span className="block text-xs text-muted">{loc(row.department)}</span>
                </div>
              ),
            },
            {
              key: 'status',
              header: t('table.status'),
              /**
               * Status and publication are two facts, and showing only the
               * first misleads: a vacancy can read "open" while nothing of it
               * has ever left the building. Both are shown, so "open" can never
               * be mistaken for "the world can see this".
               */
              cell: (row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={OPENING_TONES[row.status]}>{t(`recruit.openingStatus.${row.status}`)}</Badge>
                  {row.status !== 'draft' && (
                    <Badge tone={row.acceptingApplications ? 'success' : 'neutral'}>
                      {row.publishedAt ? t('recruit.published') : t('recruit.notPublished')}
                    </Badge>
                  )}
                </div>
              ),
            },
            {
              key: 'candidates',
              header: t('recruit.applicationCount'),
              cell: (row) => fmt.number(row.applicationCount),
            },
            { key: 'openedOn', header: t('recruit.openedOn'), cell: (row) => fmt.date(row.openedOn) },
            {
              key: 'public',
              header: t('recruit.publicLink'),
              cell: (row) =>
                row.publicSlug ? (
                  <button
                    type="button"
                    onClick={() => void copyLink(row)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-xs font-medium text-ink transition hover:border-brand hover:text-brand"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    {copied === row.id ? t('recruit.linkCopied') : t('recruit.copyLink')}
                  </button>
                ) : (
                  <span className="text-xs text-muted">{t('recruit.notPublished')}</span>
                ),
            },
            {
              key: 'action',
              header: t('table.action'),
              action: true,
              alignEnd: true,
              cell: (row) => (
                /*
                  One shape per row.

                  These were four buttons carrying words of different lengths,
                  two of them conditional \u2014 so every row wrapped differently and
                  the column came out ragged, with a filled blue button repeated
                  down it shouting louder than anything else on the page.
                  Same-sized icons put every row on one line and let the table be
                  read as a table. The words are still there, on hover and to a
                  screen reader, which is where a per-row action's label belongs.
                */
                <div className="flex justify-end gap-1">
                  <IconAction
                    label={t('recruit.edit')}
                    onClick={() => {
                      setEditingOpening(row)
                      setOpeningForm(true)
                    }}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </IconAction>

                  <IconAction
                    label={row.publishedAt ? t('recruit.republish') : t('recruit.publish')}
                    busy={busyId === row.id}
                    onClick={() => void act(row.id, () => api.post(`/recruitment/openings/${row.id}/publish`, {}))}
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                  </IconAction>

                  {/*
                    Not shown on a draft. A draft is not closed \u2014 it has never
                    been opened \u2014 and offering "reopen" there moved it to `open`
                    without publishing anything, which is how a vacancy ended up
                    reading "open" while no one outside could see it.
                  */}
                  {row.status !== 'draft' && (
                    <IconAction
                      label={row.status === 'open' ? t('recruit.close') : t('recruit.reopen')}
                      busy={busyId === row.id}
                      onClick={() =>
                        void act(row.id, () =>
                          api.patch(`/recruitment/openings/${row.id}`, {
                            status: row.status === 'open' ? 'closed' : 'open',
                          }),
                        )
                      }
                    >
                      {row.status === 'open' ? (
                        <Archive className="size-3.5" aria-hidden="true" />
                      ) : (
                        <ArchiveRestore className="size-3.5" aria-hidden="true" />
                      )}
                    </IconAction>
                  )}

                  {/* Only while nobody has applied; after that it closes, never disappears. */}
                  {row.applicationCount === 0 && (
                    <IconAction
                      label={t('recruit.removeOpening')}
                      busy={busyId === row.id}
                      danger
                      onClick={() => {
                        if (!window.confirm(t('recruit.removeOpeningConfirm'))) return
                        void act(row.id, () => api.delete(`/recruitment/openings/${row.id}`))
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </IconAction>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Card title={t('recruit.candidatesTitle')} icon={UsersRound} className="rounded-2xl">
        <DataTable
          rows={candidateRows}
          rowKey={(row) => row.id}
          loading={candidates.loading}
          empty={t('recruit.noCandidates')}
          columns={[
            {
              key: 'candidate',
              header: t('table.candidate'),
              primary: true,
              cell: (row) => (
                <div>
                  <p className="font-medium text-ink"><bdi>{row.fullName}</bdi></p>
                  {(row.email || row.phone) && (
                    <p className="mt-1 text-xs text-muted">
                      {row.email && <bdi dir="ltr">{row.email}</bdi>}
                      {row.email && row.phone ? ' · ' : ''}
                      {row.phone && <bdi dir="ltr">{row.phone}</bdi>}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'applications',
              header: t('recruit.applicationCount'),
              cell: (row) => <span className="text-muted">{fmt.number(row.applicationCount)}</span>,
            },
            {
              key: 'cv',
              header: t('recruit.withCv'),
              cell: (row) => <span className="text-muted">{row.cv ? row.cv.fileName : t('common.dash')}</span>,
            },
            {
              key: 'added',
              header: t('recruit.appliedOn'),
              cell: (row) => <span className="text-muted">{fmt.date(row.createdAt)}</span>,
            },
          ]}
        />
      </Card>

      {openingRows.some((o) => o.publicSlug) && (
        <Card title={t('recruit.linkedinPost')} icon={Send} className="rounded-2xl">
          <p className="text-sm text-muted">{t('recruit.linkedinManualPublish')}</p>
          {/* Tighter than before: these are rows now, not blocks of text. */}
          <div className="mt-3 space-y-2">
            {openingRows
              .filter((o) => o.publicSlug)
              .map((o) => (
                <LinkedInPost key={o.id} opening={o} />
              ))}
          </div>
        </Card>
      )}

      <Card
        title={t('recruit.applicationsTitle')}
        icon={UsersRound}
        className="rounded-2xl"
        action={
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t('recruit.appliedFor')}
              value={openingFilter}
              onChange={(e) => setOpeningFilter(e.target.value)}
              className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink"
            >
              <option value="">{t('recruit.allOpenings')}</option>
              {openingRows.map((o) => (
                <option key={o.id} value={o.id}>
                  {loc(o.title)}
                </option>
              ))}
            </select>
            <select
              aria-label={t('table.status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | '')}
              className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink"
            >
              <option value="">{t('recruit.allStatuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`recruit.appStatus.${s}`)}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {applications.loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : applicationRows.length === 0 ? (
          <p className="text-sm text-muted">{t('recruit.noApplications')}</p>
        ) : (
          /*
            Scrolls inside its card rather than running down the page.

            Every application is a tall block — name, contact, CV, match,
            actions — so three of them fill a screen and twenty make the section
            below unreachable without a long scroll past people you have already
            read.
          */
          <div className="max-h-[36rem] space-y-3 overflow-y-auto pe-1">
            {applicationRows.map((app) => (
              <div key={app.id} className="rounded-2xl border border-line bg-paper p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      <bdi>{app.candidateName}</bdi>
                    </p>
                    <p className="mt-1 text-sm text-muted">{loc(app.openingTitle)}</p>
                    {(app.candidateEmail || app.candidatePhone) && (
                      <p className="mt-1 text-xs text-muted">
                        {app.candidateEmail && <bdi dir="ltr">{app.candidateEmail}</bdi>}
                        {app.candidateEmail && app.candidatePhone ? ' · ' : ''}
                        {app.candidatePhone && <bdi dir="ltr">{app.candidatePhone}</bdi>}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {t(`recruit.source.${app.source}`)} · {fmt.date(app.appliedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      aria-label={t('table.status')}
                      value={app.status}
                      disabled={busyId === app.id}
                      onChange={(e) =>
                        void act(app.id, () =>
                          api.patch(`/recruitment/applications/${app.id}`, { status: e.target.value }),
                        )
                      }
                      className={`h-9 rounded-md border bg-surface px-2 text-sm font-medium disabled:opacity-45 ${STATUS_TINT[app.status]}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`recruit.appStatus.${s}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {app.coverLetter && (
                  <p className="mt-3 whitespace-pre-line text-sm text-muted">{app.coverLetter}</p>
                )}

                <div className="mt-3">
                  {app.cv ? (
                    <CvRow
                      file={app.cv}
                      onDelete={(file) => {
                        if (!window.confirm(t('recruit.removeCvConfirm', { name: file.fileName }))) return
                        void act(app.id, () => api.delete(`/cv/${file.id}`))
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted">{t('recruit.noCv')}</p>
                  )}
                </div>

                <CvMatch
                  analysis={app.analysis}
                  busy={busyId === app.id}
                  onRerun={() => void act(app.id, () => api.post(`/recruitment/applications/${app.id}/analyse`, {}))}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CvUploadButton
                    candidateId={app.candidateId}
                    label={app.cv ? t('recruit.replaceCv') : t('recruit.uploadCv')}
                    onUploaded={refreshAll}
                    onError={setError}
                  />
                  <SendInterview applicationId={app.id} interview={app.interview} onSent={refreshAll} />
                  <HrAiInterview applicationId={app.id} />
                  <button
                    type="button"
                    disabled={busyId === app.id}
                    onClick={() => {
                      if (!window.confirm(t('recruit.removeApplicationConfirm'))) return
                      void act(app.id, () => api.delete(`/recruitment/applications/${app.id}`))
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-danger-soft px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15 disabled:opacity-45"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t('recruit.removeApplication')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <OpeningModal
        // Remounted per vacancy so the fields start from its values.
        key={editingOpening?.id ?? 'new'}
        open={openingForm}
        editing={editingOpening}
        onClose={() => {
          setOpeningForm(false)
          setEditingOpening(null)
        }}
        onSaved={() => {
          setOpeningForm(false)
          setEditingOpening(null)
          refreshAll()
        }}
        onError={setError}
      />
    </div>
  )
}

/* ---------- forms ---------- */

interface FormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}

/**
 * Creating a vacancy, and editing one.
 *
 * One form for both, because they take the same fields and a second nearly
 * identical component is how two forms drift apart. It is remounted per vacancy
 * with `key`, so the inputs start from that vacancy's values instead of needing
 * an effect to copy them in.
 *
 * Editing exists because vacancies are not always typed here: one created from
 * an approved job description arrives with no location — a description never
 * states where the company is — and publishing refuses without it. Without a way
 * to edit, that vacancy could never be published at all.
 */
function OpeningModal({ open, editing, onClose, onSaved, onError }: FormProps & { editing?: JobOpening | null }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const blank = editing
    ? {
        titleEn: editing.title.en,
        titleAr: editing.title.ar,
        departmentEn: editing.department.en,
        departmentAr: editing.department.ar,
        locationEn: editing.location.en,
        locationAr: editing.location.ar,
        employmentType: editing.employmentType ?? 'fullTime',
        deadline: editing.deadline ?? '',
        openedOn: editing.openedOn,
      }
    : {
    titleEn: '',
    titleAr: '',
    departmentEn: '',
    departmentAr: '',
    locationEn: '',
    locationAr: '',
    employmentType: 'fullTime',
        deadline: '',
        openedOn: today(),
      }
  const [form, setForm] = useState(blank)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = {
        title: { en: form.titleEn, ar: form.titleAr },
        department: { en: form.departmentEn, ar: form.departmentAr },
        location: { en: form.locationEn, ar: form.locationAr },
        employmentType: form.employmentType,
        // An empty date field means "no deadline", which is null rather than
        // omitted — omitting it would leave an old deadline in place on an edit.
        deadline: form.deadline || null,
        openedOn: form.openedOn,
      }
      if (editing) await api.patch(`/recruitment/openings/${editing.id}`, body)
      else await api.post('/recruitment/openings', body)
      setForm(blank)
      onSaved()
    } catch (err) {
      onError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={editing ? t('recruit.editOpening') : t('recruit.newOpening')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label={t('recruit.titleEn')} value={form.titleEn} onChange={set('titleEn')} required dir="ltr" />
        <Input label={t('recruit.titleAr')} value={form.titleAr} onChange={set('titleAr')} required dir="rtl" />
        <Input label={t('recruit.departmentEn')} value={form.departmentEn} onChange={set('departmentEn')} required dir="ltr" />
        <Input label={t('recruit.departmentAr')} value={form.departmentAr} onChange={set('departmentAr')} required dir="rtl" />
        <Input label={t('recruit.locationEn')} value={form.locationEn} onChange={set('locationEn')} required dir="ltr" />
        <Input label={t('recruit.locationAr')} value={form.locationAr} onChange={set('locationAr')} required dir="rtl" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="opening-employment" className="text-sm font-medium text-ink">
            {t('recruit.employmentType')}
          </label>
          <select
            id="opening-employment"
            value={form.employmentType}
            onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="fullTime">{t('jd.type.fullTime')}</option>
            <option value="partTime">{t('jd.type.partTime')}</option>
            <option value="contract">{t('jd.type.contract')}</option>
            <option value="temporary">{t('jd.type.temporary')}</option>
          </select>
        </div>

        <Input label={t('recruit.openedOn')} type="date" value={form.openedOn} onChange={set('openedOn')} required />
        <Input label={t('recruit.deadline')} type="date" value={form.deadline} onChange={set('deadline')} />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy} loadingText={t('common.loading')}>
            {editing ? t('common.save') : t('recruit.newOpening')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
