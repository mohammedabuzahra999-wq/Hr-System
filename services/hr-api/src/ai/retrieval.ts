import OpenAI from 'openai'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm'
import type { GenerateJobDescriptionInput, JobDescriptionContent } from '@hr/shared'
import { db } from '../db/client.js'
import { jobDescriptions } from '../db/schema.js'
import { env } from '../env.js'

/**
 * Finding the company's own previous job descriptions, to write the next one in
 * their voice rather than in the model's default one.
 *
 * Retrieval is advisory, never authoritative. What comes back is shown to the
 * model as *examples of how this company writes* — not as facts about the role
 * being written. That distinction is the whole safety of this feature: a
 * retrieved accountant description must not leak accountant duties into a
 * developer's. The prompt says so explicitly, and only the shape of the writing
 * is meant to carry over.
 *
 * Two deliberate limits:
 *
 *  - Only `approved` documents are retrieved. A draft is unreviewed by
 *    definition, and teaching the model to imitate unreviewed text would defeat
 *    the point of having an approval step at all.
 *  - A similarity floor. Without one the nearest neighbour to "Receptionist" in
 *    a corpus of engineering roles is still *something*, and handing the model
 *    an irrelevant example is worse than handing it none.
 */
const EMBEDDING_MODEL = env.OPENAI_EMBEDDING_MODEL
const NEIGHBOURS = 3

/** Below this cosine similarity, an example is not close enough to be useful. */
const SIMILARITY_FLOOR = 0.3

let client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}

/**
 * The text that stands for a document when it is embedded.
 *
 * Title, summary and responsibilities — the parts that say what the job *is*.
 * Skills lists are deliberately left out: they are mostly proper nouns, and
 * including them pulls "Python" toward "PostgreSQL" on spelling rather than
 * pulling "developer" toward "engineer" on meaning.
 *
 * Both languages go in, so an Arabic request finds an English-titled document
 * and the other way round.
 */
export function embeddableText(content: JobDescriptionContent): string {
  return [
    content.title.en,
    content.title.ar,
    content.summary.en,
    content.summary.ar,
    ...content.responsibilities.en,
    ...content.responsibilities.ar,
  ]
    .filter(Boolean)
    .join('\n')
}

/** What a request to generate looks like as a point in the same space. */
function requestText(input: GenerateJobDescriptionInput): string {
  return [
    input.title,
    input.department,
    input.level,
    input.prompt,
    input.responsibilities,
    input.requiredSkills?.join(' '),
  ]
    .filter(Boolean)
    .join('\n')
}

export async function embed(text: string): Promise<number[] | null> {
  const openai = getClient()
  if (!openai) return null
  try {
    const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text })
    return response.data[0]?.embedding ?? null
  } catch (error) {
    // Embedding is an enhancement. A failure means a generation without
    // examples, which is the behaviour this feature had yesterday — never an
    // error the HR user has to read.
    console.error('[ai] embedding failed:', String(error).slice(0, 120))
    return null
  }
}

/**
 * Embeds one document's passages in a single provider request.
 *
 * A knowledge document is split before this function is called. Batching keeps
 * an upload from becoming dozens of slow sequential requests, while returning
 * null as a whole preserves the same graceful fallback as `embed`.
 */
export async function embedMany(texts: readonly string[]): Promise<number[][] | null> {
  if (texts.length === 0) return []
  const openai = getClient()
  if (!openai) return null
  try {
    const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: [...texts] })
    const vectors = response.data.sort((a, b) => a.index - b.index).map((row) => row.embedding)
    return vectors.length === texts.length ? vectors : null
  } catch (error) {
    console.error('[ai] batch embedding failed:', String(error).slice(0, 120))
    return null
  }
}

export interface RetrievedExample {
  title: string
  similarity: number
  content: JobDescriptionContent
}

/** The closest approved descriptions to what is being asked for. */
export async function findSimilar(input: GenerateJobDescriptionInput): Promise<RetrievedExample[]> {
  const vector = await embed(requestText(input))
  if (!vector) return []

  const similarity = sql<number>`1 - (${cosineDistance(jobDescriptions.embedding, vector)})`

  const rows = await db
    .select({
      titleEn: jobDescriptions.titleEn,
      titleAr: jobDescriptions.titleAr,
      content: jobDescriptions.content,
      similarity,
    })
    .from(jobDescriptions)
    .where(and(eq(jobDescriptions.status, 'approved'), isNotNull(jobDescriptions.embedding)))
    .orderBy((t) => sql`${t.similarity} desc`)
    .limit(NEIGHBOURS)

  return rows
    .filter((r) => Number(r.similarity) >= SIMILARITY_FLOOR)
    .map((r) => ({
      title: `${r.titleEn} / ${r.titleAr}`,
      similarity: Number(r.similarity),
      content: r.content as unknown as JobDescriptionContent,
    }))
}

/**
 * The examples, rendered for the prompt.
 *
 * Trimmed to the sections that carry house style — how long a summary runs, how
 * a responsibility is phrased — and explicitly framed so the model treats them
 * as form rather than content.
 */
export function renderExamples(examples: RetrievedExample[]): string {
  if (examples.length === 0) return ''

  const blocks = examples.map((ex) =>
    [
      `--- ${ex.title} ---`,
      `Summary (en): ${ex.content.summary.en}`,
      `Summary (ar): ${ex.content.summary.ar}`,
      `Responsibilities (en):\n${ex.content.responsibilities.en.map((r) => `  - ${r}`).join('\n')}`,
      `Responsibilities (ar):\n${ex.content.responsibilities.ar.map((r) => `  - ${r}`).join('\n')}`,
    ].join('\n'),
  )

  return [
    'For reference, here is how this company has written job descriptions before.',
    '',
    'Use these ONLY as a guide to house style: sentence length, tone, how a responsibility is phrased, how the Arabic reads.',
    'They describe DIFFERENT roles. Do not copy a duty, a skill, a qualification or a requirement from them into the description you are writing — take only the manner of writing.',
    '',
    ...blocks,
  ].join('\n')
}

/* --------------------------------------------- filling the boxes from evidence */

/**
 * What the company already wrote down for this exact role.
 *
 * Distinct from `findSimilar` above, and the distinction is the point. That one
 * feeds the model examples of *how this company writes*, and the prompt forbids
 * copying a single requirement out of them \u2014 at that distance the nearest
 * neighbour to a receptionist is an engineer, and a duty carried across would be
 * fiction with a citation.
 *
 * This one fills in a form before a person looks at it, which needs a far higher
 * bar. It does NOT use the embeddings, and measuring is why:
 *
 *   query "\u0645\u0647\u0646\u062f\u0633 \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064a" against the approved library
 *     0.497  \u0645\u0647\u0646\u062f\u0633 \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064a      \u2190 the same role, word for word
 *     0.413  \u0645\u062f\u064a\u0631 \u0647\u0646\u062f\u0633\u0629               \u2190 a different job entirely
 *
 * An identical title scores 0.497 because the stored vector is a whole document
 * \u2014 title, summary, every responsibility \u2014 and the query is three words. The
 * margin between "the same role" and "not the same role" is 0.08, and no
 * threshold inside that gap is one to trust with somebody's job advert.
 *
 * So the test is the title, folded and compared. Exact only: "\u0645\u0647\u0646\u062f\u0633 \u0630\u0643\u0627\u0621
 * \u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0623\u0648\u0644" is a different role with different requirements and must not
 * answer for the junior one. That makes this fire rarely and be right when it
 * does, which is the correct trade for filling in a form nobody asked to have
 * filled.
 *
 * And nothing is used regardless. It is suggested, into boxes, named with the
 * document it came from, and a person decides. The generator still never
 * invents: by the time it runs, everything in front of it was accepted by
 * somebody who could see where it came from.
 */
export interface Suggestion {
  /** The document it came from, so the person can judge it at a glance. */
  from: string
  /** Form field name to the value it already holds, in both languages. */
  values: Record<string, { en: string; ar: string }>
}

/** The title, reduced to what two spellings of the same role have in common. */
function foldTitle(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629(\s|$)/g, '\u0647$1')
    .replace(/[\u061f?!.,\u060c\/\u2013-]/g, ' ')
    /* "\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0631\u0648\u0627\u062a\u0628" and "\u0645\u0633\u0624\u0648\u0644 \u0631\u0648\u0627\u062a\u0628" are one role written two ways. */
    .replace(/(^|\s)\u0627\u0644/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Close enough to be the same family of role.
 *
 * Measured against this library rather than picked. Comparing the request's
 * title to each stored *title* \u2014 not to the stored document, which is where the
 * first attempt went wrong \u2014 the scale comes out legible:
 *
 *   \u0645\u0633\u0624\u0648\u0644 \u0631\u0648\u0627\u062a\u0628       \u2192 0.883  \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0631\u0648\u0627\u062a\u0628      the same role
 *   \u0645\u0647\u0646\u062f\u0633 \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0623\u0648\u0644 \u2192 0.794  \u0645\u0647\u0646\u062f\u0633 \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064a  the junior of it
 *   \u0645\u062d\u0627\u0633\u0628 \u0623\u0648\u0644          \u2192 0.663  \u0645\u062d\u0627\u0633\u0628            the junior of it
 *   \u0645\u0647\u0646\u062f\u0633 \u0634\u0628\u0643\u0627\u062a        \u2192 0.532  \u0645\u0647\u0646\u062f\u0633 \u0636\u0645\u0627\u0646 \u0627\u0644\u062c\u0648\u062f\u0629   shares a word, nothing else
 *   \u0645\u062f\u0631\u0628 \u0633\u0628\u0627\u062d\u0629         \u2192 0.450  \u0645\u062a\u062f\u0631\u0628 \u062a\u0637\u0648\u064a\u0631 \u0628\u0631\u0645\u062c\u064a\u0627\u062a  shares letters
 *
 * Related sits at 0.66 and up, unrelated at 0.54 and down. The floor goes in
 * the gap, which is wide enough to be a decision rather than a coin toss.
 */
const RELATED_FLOOR = 0.65

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

/** One call for the request and every approved title, then compared here. */
async function nearestTitle(
  want: string,
  titles: string[],
): Promise<{ index: number; score: number } | null> {
  const openai = getClient()
  if (!openai || titles.length === 0) return null
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [want, ...titles],
    })
    const vectors = res.data.map((d) => d.embedding)
    const query = vectors[0]
    if (!query) return null
    let best = { index: -1, score: 0 }
    for (let i = 0; i < titles.length; i += 1) {
      const score = cosine(query, vectors[i + 1] ?? [])
      if (score > best.score) best = { index: i, score }
    }
    return best.index >= 0 ? best : null
  } catch (error) {
    /* A suggestion is an extra. Failing to make one is not something to report. */
    console.error('[ai] title similarity failed:', String(error).slice(0, 120))
    return null
  }
}

export async function suggestFromApproved(
  title: string,
  _department: string | null,
): Promise<Suggestion | null> {
  const want = foldTitle(title)
  if (!want) return null

  const rows = await db
    .select({
      titleEn: jobDescriptions.titleEn,
      titleAr: jobDescriptions.titleAr,
      content: jobDescriptions.content,
    })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.status, 'approved'))

  let hit = rows.find((r) => foldTitle(r.titleAr) === want || foldTitle(r.titleEn) === want)
  /**
   * Whether the source is the role itself or only a relative of it.
   *
   * It decides what may be carried over. A senior accountant and an accountant
   * want the same skills and emphatically not the same years of experience \u2014
   * "3 years" copied onto a senior post is a worse advert than an empty field,
   * because it is wrong rather than missing.
   */
  let sameRole = Boolean(hit)

  if (!hit && rows.length > 0) {
    const near = await nearestTitle(title, rows.map((r) => r.titleAr || r.titleEn))
    if (near && near.score >= RELATED_FLOOR) {
      hit = rows[near.index]
      sameRole = false
    }
  }
  if (!hit) return null

  const content = hit.content as unknown as JobDescriptionContent
  const values: Record<string, { en: string; ar: string }> = {}
  const list = (field: string, v: { en: string[]; ar: string[] }) => {
    if (v?.en?.length || v?.ar?.length) {
      values[field] = { en: (v.en ?? []).join(', '), ar: (v.ar ?? []).join('\u060c ') }
    }
  }
  const one = (field: string, v: { en: string; ar: string } | null) => {
    if (v && (v.en?.trim() || v.ar?.trim())) values[field] = v
  }

  list('requiredSkills', content.requiredSkills)
  list('preferredSkills', content.preferredSkills)
  list('softSkills', content.softSkills)
  one('education', content.education)
  /* Only from the role itself. See `sameRole`. */
  if (sameRole) one('yearsExperience', content.experience)

  if (Object.keys(values).length === 0) return null
  return { from: hit.titleAr || hit.titleEn, values }
}
