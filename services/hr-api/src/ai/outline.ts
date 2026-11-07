import type {
  GenerateJobDescriptionInput,
  JobDescriptionContent,
  JobDescriptionSection,
  LocalizedList,
} from '@hr/shared'
import type { GenerationResult, JobDescriptionProvider } from './provider.js'

/**
 * The provider used when no model is configured.
 *
 * It does not pretend to be one. It takes exactly what HR typed and puts each
 * piece in the section it belongs to — nothing is written that was not entered.
 * An empty field produces an empty section, which is the honest result and also
 * what the real model is instructed to do.
 *
 * That makes it useful rather than a placeholder: the whole flow — form,
 * preview, edit, approve, save — can be built and tested against it, and every
 * record it writes is stamped `outline` so nobody can later mistake one of its
 * documents for generated prose.
 */
const LEVEL_AR: Record<string, string> = {
  intern: 'متدرّب',
  junior: 'مبتدئ',
  mid: 'متوسط الخبرة',
  senior: 'خبير',
  lead: 'قائد فريق',
  manager: 'مدير',
}

const EMPLOYMENT_AR: Record<string, string> = {
  fullTime: 'دوام كامل',
  partTime: 'دوام جزئي',
  contract: 'بعقد',
  temporary: 'مؤقت',
}

/** Free text into list items: one per line, or split on commas when it is one line. */
function toItems(text: string | undefined): string[] {
  if (!text?.trim()) return []
  const byLine = text
    .split('\n')
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
  if (byLine.length > 1) return byLine
  return (byLine[0] ?? '')
    .split(/[,،;؛]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** The same items in both languages: they are the user's own words, untranslated. */
const mirrored = (items: string[]): LocalizedList => ({ en: items, ar: items })

const EMPTY: LocalizedList = { en: [], ar: [] }

function summarise(input: GenerateJobDescriptionInput): { en: string; ar: string } {
  const title = input.title?.trim() || input.prompt?.trim().slice(0, 80) || ''
  const dept = input.department?.trim()
  const level = input.level

  const en = [
    level ? `${level} ` : '',
    title,
    dept ? ` in the ${dept} department` : '',
    input.employmentType ? ` (${input.employmentType})` : '',
    '.',
  ].join('')

  const ar = [
    title,
    level ? ` — ${LEVEL_AR[level] ?? level}` : '',
    dept ? ` في قسم ${dept}` : '',
    input.employmentType ? ` (${EMPLOYMENT_AR[input.employmentType] ?? input.employmentType})` : '',
    '.',
  ].join('')

  return { en: en.trim(), ar: ar.trim() }
}

function build(input: GenerateJobDescriptionInput): JobDescriptionContent {
  const title = input.title?.trim() || input.prompt?.trim().slice(0, 80) || ''
  const experience =
    input.yearsExperience === undefined
      ? { en: '', ar: '' }
      : { en: `${input.yearsExperience}+ years`, ar: `${input.yearsExperience}+ سنوات` }

  return {
    title: { en: title, ar: title },
    summary: summarise(input),
    responsibilities: mirrored(toItems(input.responsibilities)),
    // Nobody typed qualifications separately, and inferring them is the one
    // thing this provider must not do.
    requiredQualifications: EMPTY,
    requiredSkills: mirrored(input.requiredSkills ?? []),
    preferredSkills: mirrored(input.preferredSkills ?? []),
    softSkills: EMPTY,
    experience,
    education: { en: input.education?.trim() ?? '', ar: input.education?.trim() ?? '' },
    workingConditions: input.location?.trim()
      ? { en: input.location.trim(), ar: input.location.trim() }
      : null,
  }
}

export const outlineProvider: JobDescriptionProvider = {
  name: 'outline',
  isModel: false,

  async generate(input) {
    return { content: build(input), inputTokens: null, outputTokens: null } satisfies GenerationResult
  },

  /**
   * There is nothing to regenerate without a model — rewriting a section means
   * writing something new, and this provider only arranges what it was given.
   * The document comes back untouched rather than shuffled to look busy.
   */
  async regenerate(_section: JobDescriptionSection, current: JobDescriptionContent) {
    return { content: current, inputTokens: null, outputTokens: null } satisfies GenerationResult
  },
}
