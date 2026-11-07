import { z } from 'zod'
import type { JobDescriptionContent } from './jobDescriptions.js'
import type { RequirementKind, RequirementMatch, RequirementVerdict } from './screening.js'

/**
 * What a vacancy is actually weighing, and how heavily.
 *
 * The score used to be the model's arithmetic. Its instruction was "the
 * proportion of the stated requirements this CV evidences, weighted toward the
 * required ones over the preferred ones" — which is a sentence, not a rule.
 * Nobody could say what a 74 meant, two runs of the same CV could disagree, and
 * an applicant asking why they ranked below someone else could not be answered
 * from anything written down.
 *
 * So the work is split at the seam where each side is good:
 *
 *   the model  judges one requirement at a time, against the CV, with a quote
 *   the code   adds the judgements up, with weights somebody chose
 *
 * The model never sees a weight and never produces a number. The number is
 * arithmetic over its verdicts, so the same verdicts always give the same score,
 * and the reason for a score is a row of criteria anybody can read.
 */

/** How much of a criterion a verdict counts for. */
export const VERDICT_VALUE: Record<RequirementVerdict, number> = {
  met: 1,
  /**
   * Half, deliberately and not by measurement.
   *
   * "Postgres, evidenced by four years of MySQL" is genuinely between the two,
   * and no split is defensible on evidence. A half says that plainly; anything
   * more precise would be a made-up number wearing a decimal point.
   */
  partial: 0.5,
  notEvidenced: 0,
}

/**
 * Nothing is worth anything until somebody says so.
 *
 * There were defaults here — required things at 3, preferred at 1 — so a
 * vacancy nobody had weighted still produced a number. That is the friendlier
 * behaviour and the wrong one: the figure looked identical to a considered one,
 * and nobody reading it could tell whether the weights behind it were a
 * decision or a shipped guess.
 *
 * So an unweighted requirement is worth zero, an unweighted vacancy has no
 * score at all, and the screen says so. A score now means somebody chose what
 * this role is judged on.
 */
export const UNSET_WEIGHT = 0

export const criterionSchema = z.object({
  /** Stable within one analysis, so a verdict can name what it judged. */
  id: z.string(),
  /**
   * What this requirement is, for everything that is not a person reading.
   *
   * One language, chosen once and never varying: it is the key a weight is
   * stored against and the text the model echoes back to say which requirement
   * it judged. If it followed the interface language, switching to English
   * would orphan every weight set in Arabic and every verdict would stop
   * matching \u2014 the scores would not break loudly, they would quietly become
   * zero.
   */
  key: z.string(),
  /** The same requirement in both languages, for reading. */
  label: z.object({ en: z.string(), ar: z.string() }),
  kind: z.enum(['qualification', 'skill', 'preferred', 'experience', 'education']),
  /**
   * 0 to 100. Zero excludes it from the score entirely; the model still judges it.
   *
   * The range is 100 rather than 10 so the numbers can be read as shares: put
   * 30 on Python and 20 on English and the rest adds to 50, and each weight is
   * the percentage it contributes. Nothing forces the total to 100 \u2014 the score
   * is normalised either way \u2014 but the range makes that the natural way to fill
   * it in, which is how a scorecard is meant to be read.
   */
  weight: z.number().int().min(0).max(100),
  /**
   * True when HR added this requirement rather than the document stating it.
   *
   * It changes nothing about how it is scored and everything about whether it
   * can be deleted: a derived criterion belongs to the job description and
   * disappears when that changes, an added one belongs to the scorecard.
   */
  custom: z.boolean(),
})
export type Criterion = z.infer<typeof criterionSchema>

/**
 * A requirement HR added that the job description does not state.
 *
 * The document is written for candidates to read; the scorecard is what the
 * company actually weighs, and those are not always the same list. "Python" may
 * matter without the advert naming it, and a sales role may be judged on selling
 * whatever the write-up says.
 *
 * Written in one language, the one it was typed in, and shown in both. Nothing
 * here translates it: a transliteration nobody chose would put words in HR's
 * mouth on a document that decides who gets interviewed.
 */
export const extraCriterionSchema = z.object({
  key: z.string().trim().min(1).max(120),
  kind: z.enum(['qualification', 'skill', 'preferred', 'experience', 'education']),
  weight: z.number().int().min(0).max(100),
})
export type ExtraCriterion = z.infer<typeof extraCriterionSchema>

/** What HR stores against a job description. */
export const scorecardSchema = z.object({
  /** Weights for the requirements the document states. */
  weights: z.array(z.object({ key: z.string(), weight: z.number().int().min(0).max(100) })),
  /** Requirements HR added. Optional so every scorecard written before this still parses. */
  extra: z.array(extraCriterionSchema).max(40).optional(),
})
export type Scorecard = z.infer<typeof scorecardSchema>

/**
 * The criteria of a vacancy, in a fixed order, from the document itself.
 *
 * Derived rather than stored, so editing a job description cannot leave a
 * scorecard judging requirements the document no longer has. A stored weight is
 * matched back on by key; a requirement nobody has weighted comes back at zero,
 * waiting for somebody to say what it is worth.
 */
export function deriveCriteria(content: JobDescriptionContent, stored?: Scorecard | null): Criterion[] {
  const byKey = new Map((stored?.weights ?? []).map((w) => [w.key, w.weight]))
  const out: Criterion[] = []

  const add = (kind: RequirementKind, en: string, ar: string) => {
    const label = { en: en.trim(), ar: ar.trim() }
    /* The English is the key where it exists, because the prompt is English. */
    const key = label.en || label.ar
    if (!key) return
    out.push({
      id: `c${out.length + 1}`,
      key,
      /* Never blank on either side: an empty label would render as nothing at all. */
      label: { en: label.en || label.ar, ar: label.ar || label.en },
      kind,
      weight: byKey.get(key) ?? UNSET_WEIGHT,
      custom: false,
    })
  }

  /**
   * The two languages, paired by position.
   *
   * The lists are written together and are the same requirements in the same
   * order, so index n is the same thing in both. Where one list is shorter, the
   * other stands in rather than leaving a blank \u2014 a missing translation should
   * cost a reader the translation, not the requirement.
   */
  const pairs = (v: { en: string[]; ar: string[] }) => {
    const n = Math.max(v.en.length, v.ar.length)
    return Array.from({ length: n }, (_, i) => [v.en[i] ?? '', v.ar[i] ?? ''] as const)
  }

  for (const [en, ar] of pairs(content.requiredQualifications)) add('qualification', en, ar)
  for (const [en, ar] of pairs(content.requiredSkills)) add('skill', en, ar)
  for (const [en, ar] of pairs(content.preferredSkills)) add('preferred', en, ar)
  add('experience', content.experience.en, content.experience.ar)
  add('education', content.education.en, content.education.ar)

  /*
   * Then whatever HR added, after the document's own requirements.
   *
   * Last rather than mixed in, so the list reads as "what the advert says, and
   * then what we are also weighing". One that duplicates a stated requirement is
   * dropped: two rows for the same thing would be scored twice.
   */
  const stated = new Set(out.map((c) => c.key))
  for (const e of stored?.extra ?? []) {
    const key = e.key.trim()
    if (!key || stated.has(key)) continue
    stated.add(key)
    out.push({
      id: `c${out.length + 1}`,
      key,
      label: { en: key, ar: key },
      kind: e.kind,
      weight: e.weight,
      custom: true,
    })
  }

  return out
}

export interface Scored {
  /** 0-100, or null when nothing carries any weight. */
  score: number | null
  /** The sum that produced it, so the figure can be shown with its working. */
  earned: number
  possible: number
}

/**
 * The score, as arithmetic over verdicts the model gave one at a time.
 *
 * A criterion weighted 0 is judged and shown and counts for nothing — that is
 * how "we still want to see it, it just does not decide anything" is expressed.
 * When every weight is 0 there is no score to give, and null says so rather
 * than a 0 that would read as a terrible candidate.
 */
export function scoreFrom(criteria: Criterion[], matches: RequirementMatch[]): Scored {
  const verdictOf = new Map(matches.map((m) => [m.requirement, m.verdict]))
  let earned = 0
  let possible = 0

  for (const c of criteria) {
    if (c.weight === 0) continue
    possible += c.weight
    const verdict = verdictOf.get(c.key)
    /* A criterion the model did not report on is not evidenced, not skipped. */
    earned += c.weight * (verdict ? VERDICT_VALUE[verdict] : 0)
  }

  if (possible === 0) return { score: null, earned: 0, possible: 0 }
  return { score: Math.round((earned / possible) * 100), earned, possible }
}

/* --------------------------------------------- the second opinion: history */

/**
 * Below this many hires, the history is not a pattern.
 *
 * With one hire every criterion is 0% or 100%, and a score built on that says
 * more about one person's CV than about the role. Three is not a large number
 * and it is where a shared requirement starts to look like a shared
 * requirement rather than a coincidence.
 */
export const MIN_HIRES_FOR_HISTORY = 3

/**
 * Weights taken from what the people hired into this role actually evidenced.
 *
 * A criterion every hire showed is one the company selects on in practice,
 * whatever the advert emphasises; one none of them showed is not, whatever
 * weight it was given. So the proportion becomes a weight, and the same
 * verdicts produce a second score.
 *
 * This is the request "let past hires decide too", built the only way it can be
 * built safely. What it reads is verdicts on requirements somebody wrote down.
 * What it never touches is the CVs of past hires \u2014 no resemblance, no
 * embedding of their text, nothing that could carry a university, an employer
 * or a name. That version of this feature is the one Amazon withdrew.
 *
 * It does not replace the weighted score and does not blend into it. Two
 * numbers, from the same verdicts, weighted two ways: what you said matters,
 * and what the hiring record says mattered. Where they disagree, that
 * disagreement is the useful thing on the screen \u2014 averaging it away would
 * hide the only information the second number adds.
 */
export function historyWeighted(
  criteria: Criterion[],
  benchmark: { hired: number; perCriterion: { key: string; evidenced: number }[] },
): Criterion[] {
  const share = new Map(benchmark.perCriterion.map((b) => [b.key, b.evidenced]))
  return criteria.map((c) => ({
    ...c,
    weight: Math.round(((share.get(c.key) ?? 0) / benchmark.hired) * 100),
  }))
}
