import { createContext, useContext } from 'react'
import type { Formatters } from '@/lib/format'
import type { Dir, Lang, Message, TKey, Var } from './dictionary'

export interface I18nContextValue {
  lang: Lang
  dir: Dir
  setLang: (lang: Lang) => void
  /** Translate a key. `{placeholders}` are filled from `vars`; pass `count` for plural keys. */
  t: (key: TKey, vars?: Record<string, Var>) => string
  /**
   * Translate a key + vars pair that arrived as data (a notification from the
   * API). The key is a plain string because the server chooses it: a key this
   * build does not know yet renders as a neutral fallback rather than crashing
   * the screen it appears on.
   */
  tm: (message: Message | { key: string; vars?: Record<string, Var> }) => string
  /** Read the current language out of free text stored in data (people, job titles). */
  /**
   * Picks the current language out of a bilingual value.
   *
   * Generic over what is carried, not fixed to strings: a job description
   * holds bilingual *lists* too, and the implementation (an index by language)
   * was always type-agnostic — only the signature was narrower than the code.
   */
  loc: <T>(value: { en: T; ar: T }) => T
  /** "3 days" / "3 أيام", with the right Arabic plural form. */
  days: (count: number) => string
  /** Milliseconds as "8h 32m" / "8 س 32 د". */
  duration: (ms: number) => string
  /** "2 hours ago" / "yesterday", or "Just now" under a minute. */
  timeAgo: (d: Date | string) => string
  /** Date, time, money and number formatters bound to the current locale. */
  fmt: Formatters
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
