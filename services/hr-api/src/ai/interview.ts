import OpenAI from 'openai'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { Criterion, CvAnalysisContent } from '@hr/shared'
import { env } from '../env.js'

/**
 * Writing the questions for one candidate and one vacancy.
 *
 * Two things shape them, and the second is what makes this worth doing at all.
 *
 * The first is the job's criteria — the same weighted list the CV was scored
 * against — so an answer can be judged on the same rubric rather than on a
 * second scheme invented for interviews. A question is tagged with the
 * requirement it probes; that tag is how the answer later reaches `scoreFrom`.
 *
 * The second is the candidate's own CV. A written interview is taken alone, in
 * a text box, by somebody who can paste the question into a model — so a
 * question like "what is the difference between SQL join types" measures
 * nothing at all, because that is precisely the question a model answers
 * perfectly. What cannot be pasted is the candidate's own work: what they
 * actually built, which decision they regretted, why they chose one thing over
 * another. So the questions lean on what their CV claims, and ask for the
 * detail only somebody who did it would have.
 *
 * That is also the honest limit of this feature. It is a structured written
 * screening, not a test of ability under observation, and the report says so.
 */

const QUESTIONS_PER_INTERVIEW = 8

const questionSchema = z.object({
  /** The requirement this probes, copied exactly, or empty for an opening question. */
  criterionKey: z.string(),
  en: z.string(),
  ar: z.string(),
})

const generatedSchema = z.object({ questions: z.array(questionSchema) })

const SYSTEM = `You write interview questions for an HR team. One candidate, one vacancy.

WHAT YOU ARE GIVEN
- The requirements this vacancy is judged on, each with a key.
- What the candidate's CV evidenced against each of them, where a CV has been read.

HOW TO WRITE THEM
- Ground every question in what the CV actually says. "Your CV mentions four years of MySQL — describe the hardest query you had to fix and what the fix was" is worth asking. "What is the difference between INNER JOIN and LEFT JOIN" is not: this interview is taken alone in a text box, and that is exactly the question anybody can look up in seconds.
- Ask for specifics only the person who did the work would have: a decision and why, something that went wrong, a trade-off they made, what they would do differently.
- Where a requirement was NOT evidenced in the CV, ask about it plainly and without implying they lack it — people leave things off a page. "The role involves X; tell us about any experience you have with it" is the shape.
- One question per requirement where it earns one. Set criterionKey to that requirement's key, copied exactly.
- Open with one question that is not about a requirement — what the person is looking for, or what drew them to this role. Leave its criterionKey empty.

RULES
- Never ask about age, nationality, marital status, religion, health, pregnancy, or family. Never ask about salary history.
- Never ask a question whose answer is a fact that can be looked up. Ask about their work.
- No trick questions, no puzzles, no riddles.
- One question per entry. No multi-part questions joined by "and also".
- Write each question in BOTH English and Arabic. The Arabic must read as an Arabic speaker would write it, carrying the same question.`

let client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}

export interface GeneratedQuestion {
  criterionKey: string | null
  en: string
  ar: string
}

/**
 * The questions, or null when they could not be written.
 *
 * Null rather than a fallback list: a generic set of questions sent to a real
 * candidate under the company's name is worse than telling HR it did not work.
 */
export async function generateQuestions(
  jobTitle: string,
  criteria: Criterion[],
  cv: CvAnalysisContent | null,
): Promise<GeneratedQuestion[] | null> {
  const openai = getClient()
  if (!openai || criteria.length === 0) return null

  const evidence = new Map((cv?.matches ?? []).map((m) => [m.requirement, m]))
  const lines = criteria.map((c) => {
    const found = evidence.get(c.key)
    const seen = found
      ? found.verdict === 'notEvidenced'
        ? 'the CV does not mention it'
        : `the CV shows: "${found.evidence}"`
      : 'no CV has been read'
    return `- [key: ${c.key}] ${c.key} — ${seen}`
  })

  const user = [
    `Vacancy: ${jobTitle}`,
    '',
    'Requirements, and what this candidate’s CV evidenced for each:',
    ...lines,
    '',
    `Write ${QUESTIONS_PER_INTERVIEW} questions, in the order they should be asked.`,
  ].join('\n')

  try {
    const response = await openai.responses.parse({
      model: env.OPENAI_MODEL,
      temperature: 0,
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      text: { format: zodTextFormat(generatedSchema, 'interview_questions') },
    })
    const parsed = response.output_parsed
    const result = parsed ? generatedSchema.safeParse(parsed) : null
    if (!result?.success) return null

    const keys = new Set(criteria.map((c) => c.key))
    return result.data.questions
      .filter((q) => q.en.trim() && q.ar.trim())
      .map((q) => ({
        /*
         * A key the model invented tags nothing, and a question tagged with a
         * requirement that does not exist would score against nothing later. It
         * becomes an untagged question rather than being dropped — it is still
         * a question worth asking.
         */
        criterionKey: keys.has(q.criterionKey) ? q.criterionKey : null,
        en: q.en.trim(),
        ar: q.ar.trim(),
      }))
      .slice(0, QUESTIONS_PER_INTERVIEW)
  } catch (error) {
    console.error('[interview] generation failed:', String(error).slice(0, 160))
    return null
  }
}
