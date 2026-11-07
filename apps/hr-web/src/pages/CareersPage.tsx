import { ArrowLeft, ArrowRight, Briefcase, CalendarClock, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PublicJob } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { useI18n } from '@/features/i18n/useI18n'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * The public list of open roles.
 *
 * Outside `ProtectedRoute` and outside `AppLayout`: whoever reads this is not an
 * employee, has no session, and should see no sidebar, no notification bell and
 * nothing that implies they are inside the system. The language and theme
 * controls stay, because a bilingual audience reads this page too.
 *
 * It talks to `/careers`, which returns a shape built for strangers — the
 * vacancy's internal id is not in it, so there is nothing here to leak.
 */
export function CareersPage() {
  const { t, lang, setLang, loc, fmt, dir } = useI18n()
  const [jobs, setJobs] = useState<PublicJob[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .get<{ jobs: PublicJob[] }>('/careers/jobs')
      .then((data) => alive && setJobs(data.jobs))
      .catch((e) => alive && setError(errorText(t, e)))
    return () => {
      alive = false
    }
  }, [t])

  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-lg font-bold tracking-tight text-ink">{t('careers.company')}</p>
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

      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('careers.title')}</h1>
        <p className="mt-3 max-w-xl text-muted">{t('careers.subtitle')}</p>

        {error && (
          <div className="mt-6">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-8 space-y-3">
          {jobs === null && !error && <p className="text-sm text-muted">{t('common.loading')}</p>}

          {jobs?.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-8 text-center">
              <Briefcase className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium text-ink">{t('careers.noJobs')}</p>
              <p className="mt-1 text-sm text-muted">{t('careers.noJobsHint')}</p>
            </div>
          )}

          {jobs?.map((job) => (
            <Link
              key={job.slug}
              to={`/careers/jobs/${job.slug}`}
              className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 transition hover:border-brand"
            >
              <div className="min-w-0">
                <p className="text-lg font-semibold text-ink group-hover:text-brand">{loc(job.title)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
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
              </div>
              <Arrow className="size-5 shrink-0 text-muted transition group-hover:text-brand" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
