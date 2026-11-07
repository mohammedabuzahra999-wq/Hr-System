import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, MapPin, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ApplicationReceipt, JobDescriptionContent, PublicJobDetail } from '@hr/shared'
import { CV_MAX_BYTES, CV_MIME_TYPES, jobDescriptionContentSchema } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useI18n } from '@/features/i18n/useI18n'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { api } from '@/lib/api'
import { errorKey, errorVars, errorText } from '@/lib/apiError'

const ACCEPT = Object.values(CV_MIME_TYPES).join(',')

/**
 * One vacancy, and the form to apply to it.
 *
 * The description is whatever the AI generator produced and HR approved — it is
 * parsed here rather than trusted, because it arrives as jsonb and a document
 * written against an older shape would otherwise render as blanks.
 *
 * The CV is uploaded after the form is accepted, not with it. Two requests
 * rather than one, so a file the server refuses does not throw away everything
 * the applicant typed — they are told which of the two failed and only redo
 * that part.
 */
export function CareerJobPage() {
  const { slug = '' } = useParams()
  const { t, lang, setLang, loc, fmt, dir } = useI18n()
  const [job, setJob] = useState<PublicJobDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .get<{ job: PublicJobDetail }>(`/careers/jobs/${slug}`)
      .then((data) => alive && setJob(data.job))
      .catch((e) => {
        if (!alive) return
        if ((e as { status?: number }).status === 404) setNotFound(true)
        else setError(errorText(t, e))
      })
    return () => {
      alive = false
    }
  }, [slug, t])

  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft
  const content = job?.description ? jobDescriptionContentSchema.safeParse(job.description) : null
  const described = content?.success ? content.data : null

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link to="/careers" className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-brand">
            <Back className="size-4" aria-hidden="true" />
            {t('careers.allJobs')}
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <ThemeToggle className="size-8 rounded-full border border-line" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        {notFound && (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-medium text-ink">{t('careers.jobGone')}</p>
            <p className="mt-1 text-sm text-muted">{t('careers.jobGoneHint')}</p>
            <Link to="/careers" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
              {t('careers.allJobs')}
            </Link>
          </div>
        )}

        {error && <Alert>{error}</Alert>}
        {!job && !notFound && !error && <p className="text-sm text-muted">{t('common.loading')}</p>}

        {job && (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{loc(job.title)}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>{loc(job.department)}</span>
              {loc(job.location) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {loc(job.location)}
                </span>
              )}
              {job.employmentType && <span>{t(`jd.type.${job.employmentType}`)}</span>}
              {job.deadline && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  {t('careers.until', { date: fmt.date(job.deadline) })}
                </span>
              )}
            </p>

            {described && <Description content={described} />}

            <div id="apply" className="mt-10 rounded-2xl border border-line bg-surface p-6">
              {sent ? (
                <div className="text-center">
                  <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
                  <p className="mt-3 text-lg font-semibold text-ink">{t('careers.thanks')}</p>
                  <p className="mt-1 text-sm text-muted">{t('careers.thanksHint')}</p>
                </div>
              ) : (
                <ApplyForm slug={slug} onSent={() => setSent(true)} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

/* ---------- the description ---------- */

/**
 * The approved job description, rendered.
 *
 * `loc` is generic over what it picks, so it returns the string array for a
 * list and the string for a paragraph — no casting, and an empty section simply
 * renders nothing, which is what the generator is instructed to produce when it
 * has nothing honest to say.
 */
function Description({ content }: { content: JobDescriptionContent }) {
  const { t, loc } = useI18n()

  const lists = [
    ['careers.responsibilities', content.responsibilities],
    ['careers.requiredQualifications', content.requiredQualifications],
    ['careers.requiredSkills', content.requiredSkills],
    ['careers.preferredSkills', content.preferredSkills],
    ['careers.softSkills', content.softSkills],
  ] as const

  const paragraphs = [
    ['careers.experience', content.experience],
    ['careers.education', content.education],
    ['careers.workingConditions', content.workingConditions],
  ] as const

  return (
    <div className="mt-8 space-y-8">
      <p className="whitespace-pre-line leading-relaxed text-ink">{loc(content.summary)}</p>

      {lists.map(([key, value]) => {
        const items = loc(value)
        if (items.length === 0) return null
        return (
          <section key={key}>
            <h2 className="text-lg font-semibold text-ink">{t(key)}</h2>
            <ul className="mt-3 space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {paragraphs.map(([key, value]) => {
        const text = value ? loc(value) : ''
        if (!text) return null
        return (
          <section key={key}>
            <h2 className="text-lg font-semibold text-ink">{t(key)}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{text}</p>
          </section>
        )
      })}
    </div>
  )
}

/* ---------- the form ---------- */

function ApplyForm({ slug, onSent }: { slug: string; onSent: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    education: '',
    experience: '',
    skills: '',
    linkedinUrl: '',
    coverLetter: '',
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const setArea = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const file = fileRef.current?.files?.[0] ?? null
    if (file && file.size > CV_MAX_BYTES) {
      setError(t('err.fileTooLarge'))
      setBusy(false)
      return
    }

    try {
      // Empty optional fields are omitted rather than sent as "", which the
      // schema would reject as an invalid email or URL.
      const optional = (['phone', 'education', 'experience', 'skills', 'linkedinUrl', 'coverLetter'] as const)
        .filter((k) => form[k].trim())
        .reduce<Record<string, string>>((acc, k) => ({ ...acc, [k]: form[k].trim() }), {})

      await api.post<ApplicationReceipt>(`/careers/jobs/${slug}/apply`, {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        ...optional,
      })

      /**
       * The CV goes second, and its failure does not undo the application.
       *
       * Somebody who applied but whose PDF was refused is still an applicant HR
       * should see — losing them because of a file format would be the worse
       * outcome of the two.
       */
      if (file) {
        const body = new FormData()
        body.append('file', file)
        try {
          await api.upload(`/careers/jobs/${slug}/cv?email=${encodeURIComponent(form.email.trim().toLowerCase())}`, body)
        } catch (cvError) {
          setError(t(errorKey(cvError), errorVars(cvError)))
          return
        }
      }

      onSent()
    } catch (err) {
      setError(t(errorKey(err), errorVars(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">{t('careers.applyTitle')}</h2>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('careers.fullName')} value={form.fullName} onChange={set('fullName')} required />
        <Input label={t('careers.email')} type="email" value={form.email} onChange={set('email')} required dir="ltr" />
        <Input label={t('careers.phone')} value={form.phone} onChange={set('phone')} dir="ltr" />
        <Input label={t('careers.linkedinUrl')} value={form.linkedinUrl} onChange={set('linkedinUrl')} dir="ltr" />
      </div>

      {(['education', 'experience', 'skills', 'coverLetter'] as const).map((key) => (
        <div key={key} className="flex flex-col gap-1.5">
          <label htmlFor={`apply-${key}`} className="text-sm font-medium text-ink">
            {t(`careers.${key}` as never)}
          </label>
          <textarea
            id={`apply-${key}`}
            rows={key === 'coverLetter' ? 5 : 3}
            value={form[key]}
            onChange={setArea(key)}
            className="rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          />
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="apply-cv" className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          <Upload className="size-4" aria-hidden="true" />
          {t('careers.cv')}
        </label>
        <input
          id="apply-cv"
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="rounded-md border border-line bg-surface p-2 text-sm text-ink file:me-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
        />
        <p className="text-xs text-muted">{t('careers.cvHint')}</p>
      </div>

      <Button type="submit" loading={busy} loadingText={t('common.loading')} className="self-start">
        {t('careers.submit')}
      </Button>
      <p className="text-xs text-muted">{t('careers.privacy')}</p>
    </form>
  )
}
