import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  cvAnalysisContentSchema,
  deriveCriteria,
  historyWeighted,
  MIN_HIRES_FOR_HISTORY,
  scorecardSchema,
  scoreFrom,
  type Criterion,
  jobDescriptionContentSchema,
  type AnalysisFailure,
  type JobDescriptionContent,
} from '@hr/shared'
import { db } from '../db/client.js'
import { applications, cvAnalyses, cvFiles, jobDescriptions, jobOpenings } from '../db/schema.js'
import { env } from '../env.js'
import { readUpload } from '../storage/files.js'
import { extractCvText } from './cvText.js'
import { buildScreeningPrompt, SCREENING_PROMPT_VERSION, SCREENING_SYSTEM_PROMPT } from './screening.js'
import { benchmarkFor } from './benchmark.js'
import { refreshDraftInterviewFromCvAnalysis } from '../recruitment/interview.js'
import { publish } from '../realtime/bus.js'

/**
 * Reading one application's CV against the vacancy it was sent to.
 *
 * Runs after the applicant has been told their application arrived, never
 * before: someone applying for a job should not wait on our analysis, and a
 * failure here must never turn a received application into an error they would
 * retry. Every path writes a row — succeeded or failed — so an application with
 * no score can always say why it has none.
 */

/**
 * What the model returns: the analysis without the score.
 *
 * Omitted rather than overwritten. Leaving the field in would have the model
 * spend tokens on a number nobody reads, and leave the shape looking as though
 * its opinion of the total counted for something.
 */
const modelAnalysisSchema = cvAnalysisContentSchema.omit({
  score: true,
  historyScore: true,
  historyFrom: true,
})
const responseSchema = z.object({ analysis: modelAnalysisSchema })

let client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}

/** Records the outcome, replacing any earlier reading of this application. */
async function record(
  applicationId: string,
  row: {
    status: 'done' | 'failed'
    cvFileId?: string | null
    content?: Record<string, unknown> | null
    failure?: AnalysisFailure | null
    model?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
    durationMs?: number | null
    cvCharacters?: number | null
  },
) {
  const values = {
    applicationId,
    cvFileId: row.cvFileId ?? null,
    status: row.status,
    content: row.content ?? null,
    failure: row.failure ?? null,
    model: row.model ?? null,
    promptVersion: SCREENING_PROMPT_VERSION,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    durationMs: row.durationMs ?? null,
    cvCharacters: row.cvCharacters ?? null,
  }
  await db
    .insert(cvAnalyses)
    .values(values)
    .onConflictDoUpdate({ target: cvAnalyses.applicationId, set: { ...values, createdAt: new Date() } })
    .catch((e) => console.error('[screening] could not write the analysis:', e))
}

/**
 * The approved description for the vacancy this application is against.
 *
 * Approved only. Scoring a candidate against text nobody has reviewed would
 * make the approval step decorative, and a draft can say anything.
 */
async function vacancyRequirements(
  openingId: string,
): Promise<{ id: string; content: JobDescriptionContent; criteria: Criterion[] } | null> {
  const rows = await db
    .select({ id: jobDescriptions.id, content: jobDescriptions.content, scorecard: jobDescriptions.scorecard })
    .from(jobDescriptions)
    .where(and(eq(jobDescriptions.openingId, openingId), eq(jobDescriptions.status, 'approved')))
    .limit(1)
  if (!rows[0]) return null
  const parsed = jobDescriptionContentSchema.safeParse(rows[0].content)
  if (!parsed.success) return null

  /*
   * Weights are read leniently on purpose.
   *
   * A scorecard that fails to parse gives the defaults rather than failing the
   * analysis: the requirements are still there and still judgeable, and refusing
   * to screen a candidate because a weight was malformed would be the wrong
   * thing to be strict about.
   */
  const stored = scorecardSchema.safeParse(rows[0].scorecard)
  return {
    id: rows[0].id,
    content: parsed.data,
    criteria: deriveCriteria(parsed.data, stored.success ? stored.data : null),
  }
}

/** The most recent CV belonging to this application's candidate. */
async function latestCv(candidateId: string) {
  const rows = await db
    .select()
    .from(cvFiles)
    .where(eq(cvFiles.candidateId, candidateId))
    .orderBy(desc(cvFiles.uploadedAt))
    .limit(1)
  return rows[0] ?? null
}

export async function analyseApplication(applicationId: string): Promise<void> {
  const started = Date.now()

  const rows = await db
    .select({ app: applications, opening: jobOpenings })
    .from(applications)
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
    .where(eq(applications.id, applicationId))
    .limit(1)
  if (!rows[0]) return

  const { app, opening } = rows[0]

  const requirements = await vacancyRequirements(opening.id)
  if (!requirements) return record(applicationId, { status: 'failed', failure: 'noJobDescription' })

  const cv = await latestCv(app.candidateId)
  if (!cv) return record(applicationId, { status: 'failed', failure: 'noCv' })

  let bytes: Buffer
  try {
    bytes = await readUpload(cv)
  } catch {
    return record(applicationId, { status: 'failed', cvFileId: cv.id, failure: 'extractionFailed' })
  }

  const extracted = await extractCvText(bytes, cv.mimeType)
  if (!extracted.ok) {
    console.warn(`[screening] ${cv.fileName}: ${extracted.reason}${extracted.detail ? ` (${extracted.detail})` : ''}`)
    return record(applicationId, { status: 'failed', cvFileId: cv.id, failure: extracted.reason })
  }

  /**
   * Screening sends the whole CV, which is the most personal document this
   * system holds. With sharing off it does not run at all — and says so on the
   * application, rather than failing in a way that reads like a fault.
   */
  if (!env.AI_SHARE_DATA) {
    return record(applicationId, {
      status: 'failed',
      cvFileId: cv.id,
      failure: 'sharingDisabled',
      cvCharacters: extracted.characters,
    })
  }

  const openai = getClient()
  if (!openai) {
    return record(applicationId, {
      status: 'failed',
      cvFileId: cv.id,
      failure: 'aiNotConfigured',
      cvCharacters: extracted.characters,
    })
  }

  /*
   * Read once, used twice: the prompt mentions it, and the second score is
   * counted from it. Two reads could disagree if somebody were hired between
   * them, and a figure that does not match the sentence beside it is worse than
   * either.
   */
  const benchmark = await benchmarkFor(requirements.id, requirements.criteria)

  try {
    const response = await openai.responses.parse({
      model: env.OPENAI_MODEL,
      input: [
        { role: 'system', content: SCREENING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildScreeningPrompt(
            requirements.content,
            requirements.criteria,
            extracted.text,
            /*
             * Read now rather than cached: a role's history changes the moment
             * somebody is hired, and an analysis run afterwards should know it.
             * Empty until the role has been filled once, which is the honest
             * state rather than a default.
             */
            benchmark,
          ),
        },
      ],
      text: { format: zodTextFormat(responseSchema, 'cv_analysis') },
    })

    const parsed = response.output_parsed
    const result = parsed ? responseSchema.safeParse(parsed) : null
    if (!result?.success) {
      return record(applicationId, {
        status: 'failed',
        cvFileId: cv.id,
        failure: 'aiInvalidOutput',
        model: env.OPENAI_MODEL,
        cvCharacters: extracted.characters,
        durationMs: Date.now() - started,
      })
    }

    /*
     * The score, replaced with one that was counted.
     *
     * Whatever number the model put in the field is discarded and recomputed
     * from its own verdicts and the weights HR set. It is not a correction of a
     * bad guess \u2014 the model was told not to produce one \u2014 it is where the
     * number is actually decided, in arithmetic that gives the same answer every
     * time and can be shown to somebody who asks why they ranked where they did.
     */
    const counted = scoreFrom(requirements.criteria, result.data.analysis.matches)
    /*
     * The second figure: the same verdicts, weighted by the hiring record.
     *
     * Null until there are enough hires for it to mean anything, because a
     * number drawn from one person would be read as a pattern.
     */
    const byHistory =
      benchmark.hired >= MIN_HIRES_FOR_HISTORY
        ? scoreFrom(historyWeighted(requirements.criteria, benchmark), result.data.analysis.matches)
        : null

    /* Null where there are no weights, so the screen can say that instead of showing a zero. */
    const analysis = {
      ...result.data.analysis,
      score: counted.score,
      historyScore: byHistory?.score ?? null,
      historyFrom: benchmark.hired,
    }

    await record(applicationId, {
      status: 'done',
      cvFileId: cv.id,
      content: analysis as unknown as Record<string, unknown>,
      model: env.OPENAI_MODEL,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      durationMs: Date.now() - started,
      cvCharacters: extracted.characters,
    })

    /*
     * The draft may have been created before the separately uploaded CV was
     * analysed. Rebuild only a pristine draft in the background: failures here
     * must not turn a completed CV analysis into an error for HR or the applicant.
     */
    void refreshDraftInterviewFromCvAnalysis(applicationId, cv.id)
      .then(() => {
        publish(
          { type: 'recruitment.changed', at: new Date().toISOString() },
          { kind: 'roles', roles: ['hr', 'admin'] },
        )
      })
      .catch((error) => console.error('[interview] could not re-calibrate draft from CV analysis:', String(error).slice(0, 160)))
  } catch (error) {
    const failure: AnalysisFailure =
      error instanceof OpenAI.AuthenticationError
        ? 'aiNotConfigured'
        : error instanceof OpenAI.RateLimitError
          ? 'aiRateLimited'
          : 'aiUnavailable'
    console.error(`[screening] ${failure}:`, String(error).slice(0, 160))
    await record(applicationId, {
      status: 'failed',
      cvFileId: cv.id,
      failure,
      model: env.OPENAI_MODEL,
      cvCharacters: extracted.characters,
      durationMs: Date.now() - started,
    })
  }
}

/**
 * Fire-and-forget, for the paths that must not wait on it.
 *
 * An applicant pressing Send, and HR uploading a CV, both get their reply
 * immediately; the reading lands a few seconds later and the list updates when
 * it does.
 */
export function analyseInBackground(applicationId: string): void {
  void analyseApplication(applicationId).catch((e) =>
    console.error('[screening] unexpected failure:', e),
  )
}
