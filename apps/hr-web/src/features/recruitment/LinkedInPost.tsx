import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { useState } from 'react'
import type { JobOpening } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * The LinkedIn post, written for HR to paste.
 *
 * Posting to LinkedIn from code needs Talent Solutions partner access, which is
 * granted to a company after review rather than obtained with a key — an
 * ordinary LinkedIn account does not unlock it. So this does the part that
 * actually takes HR's time: composing the text. Posting it is one paste.
 *
 * Deliberately short. A LinkedIn post that reproduces the whole description is
 * a post nobody finishes; the job of these few lines is to get someone to the
 * careers page, where the full text already lives.
 *
 * The link is built from the browser's own origin, so it points at whichever
 * host this app is actually served from rather than a domain hardcoded once and
 * wrong everywhere else.
 */
export function LinkedInPost({ opening }: { opening: JobOpening }) {
  const { t, loc, lang } = useI18n()
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(false)

  if (!opening.publicSlug) {
    return <p className="text-xs text-muted">{t('recruit.publishFirst')}</p>
  }

  const link = `${window.location.origin}/careers/jobs/${opening.publicSlug}`
  const title = loc(opening.title)
  const place = loc(opening.location)
  const type = opening.employmentType ? t(`jd.type.${opening.employmentType}`) : ''

  const text =
    lang === 'ar'
      ? [
          `نحن نوظّف: ${title}`,
          '',
          [loc(opening.department), place, type].filter(Boolean).join(' · '),
          '',
          'التفاصيل الكاملة والتقديم من هنا:',
          link,
        ].join('\n')
      : [
          `We're hiring: ${title}`,
          '',
          [loc(opening.department), place, type].filter(Boolean).join(' · '),
          '',
          'Full details and how to apply:',
          link,
        ].join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the text is on screen and selectable,
      // so there is nothing to recover from and nothing worth alarming HR about.
    }
  }

  return (
    <div className="rounded-xl border border-line bg-paper">
      {/*
        One line per vacancy, closed.

        Every published vacancy used to render its whole post expanded, so four
        vacancies were four blocks of text stacked down the page and the thing
        you came to do \u2014 copy one of them \u2014 was somewhere in the middle of it.
        The text is the same; it is just not all on screen at once.
      */}
      <div className="flex flex-wrap items-center gap-2 p-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</p>

        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-expanded={shown}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition hover:text-brand"
        >
          {shown ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
          {t(shown ? 'recruit.hidePost' : 'recruit.showPost')}
        </button>

        {/* The reason this list exists, so it is the button that looks like one. */}
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? t('recruit.copied') : t('recruit.copyForLinkedin')}
        </button>
      </div>

      {shown && (
        <pre className="mx-3 mb-3 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-sans text-sm text-ink">
          {text}
        </pre>
      )}
    </div>
  )
}
