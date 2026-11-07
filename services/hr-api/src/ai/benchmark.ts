import { and, eq, inArray } from 'drizzle-orm'
import type { Criterion, CvAnalysisContent } from '@hr/shared'
import { db } from '../db/client.js'
import { applications, cvAnalyses, jobDescriptions } from '../db/schema.js'

/**
 * What the people actually hired into this role had evidenced.
 *
 * The request behind this was to judge a CV partly against who has been hired
 * before. There are two ways to do that and they are not variations of one
 * idea:
 *
 *   By resemblance — embed the CVs of past hires, score how close this one
 *   sits. This is the one that reads as obvious and the one that must not be
 *   built. It has no way to learn "good engineer" separately from the things
 *   that happened to travel with the people who were hired: their universities,
 *   their previous employers, the phrasing of their CVs, their names. Amazon
 *   built exactly this and withdrew it after it taught itself to mark down CVs
 *   containing the word "women's". Nothing about the method prevents that; the
 *   proxies are in the data and similarity is how you find proxies.
 *
 *   By the same criteria — for the people hired into this role, look up what
 *   their analyses said about the requirements HR is weighing now. That gives
 *   "three of the four people hired for this evidenced Git", which is a fact
 *   about the requirement rather than a resemblance to a person.
 *
 * This is the second one. It cannot carry a proxy, because it only ever reads
 * verdicts on requirements somebody wrote down on purpose. And it can be said
 * out loud: a candidate can be told which requirement they lacked that the
 * people hired had. Nobody can be told they scored 0.62 against the shape of
 * previous employees.
 *
 * It informs. It does not score — the score stays the weights HR set, because a
 * hiring history that quietly reweighted the rubric would be the same failure
 * wearing a different number.
 */

export interface CriterionBenchmark {
  key: string
  /** How many of the hired evidenced it, fully or partly. */
  evidenced: number
}

export interface Benchmark {
  /** How many past hires this is drawn from. Zero means there is no history yet. */
  hired: number
  perCriterion: CriterionBenchmark[]
}

/** The same folding the scorecard and the suggestions use, so one role is one role. */
function foldTitle(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة(\s|$)/g, 'ه$1')
    .replace(/[؟?!.,،/–-]/g, ' ')
    .replace(/(^|\s)ال/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Hires of the same role, however many vacancies it has been advertised under.
 *
 * Matched on the job description's title rather than on the opening, because a
 * role advertised three times is one role and its history is one history. The
 * title is folded the same way everywhere else folds it, so a definite article
 * or a stray diacritic does not split the record in two.
 */
export async function benchmarkFor(
  jobDescriptionId: string,
  criteria: Criterion[],
): Promise<Benchmark> {
  if (criteria.length === 0) return { hired: 0, perCriterion: [] }

  const self = await db
    .select({ en: jobDescriptions.titleEn, ar: jobDescriptions.titleAr })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.id, jobDescriptionId))
    .limit(1)
  if (!self[0]) return { hired: 0, perCriterion: [] }
  const want = foldTitle(self[0].ar || self[0].en)

  /* Every description for this role, and the vacancies they belong to. */
  const siblings = await db
    .select({ openingId: jobDescriptions.openingId, en: jobDescriptions.titleEn, ar: jobDescriptions.titleAr })
    .from(jobDescriptions)
  const openingIds = siblings
    .filter((r) => r.openingId && (foldTitle(r.ar) === want || foldTitle(r.en) === want))
    .map((r) => r.openingId!)
  if (openingIds.length === 0) return { hired: 0, perCriterion: [] }

  const rows = await db
    .select({ content: cvAnalyses.content })
    .from(cvAnalyses)
    .innerJoin(applications, eq(applications.id, cvAnalyses.applicationId))
    .where(
      and(
        inArray(applications.openingId, openingIds),
        eq(applications.status, 'hired'),
        eq(cvAnalyses.status, 'done'),
      ),
    )

  const evidencedBy = new Map<string, number>()
  let hired = 0
  for (const row of rows) {
    const content = row.content as unknown as CvAnalysisContent | null
    if (!content?.matches) continue
    hired += 1
    for (const m of content.matches) {
      /* Partly evidenced still counts as having shown something for it. */
      if (m.verdict === 'notEvidenced') continue
      evidencedBy.set(m.requirement, (evidencedBy.get(m.requirement) ?? 0) + 1)
    }
  }

  return {
    hired,
    perCriterion: criteria.map((c) => ({ key: c.key, evidenced: evidencedBy.get(c.key) ?? 0 })),
  }
}
