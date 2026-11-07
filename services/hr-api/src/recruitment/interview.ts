import { randomBytes } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  criterionSchema,
  cvAnalysisContentSchema,
  deriveCriteria,
  jobDescriptionContentSchema,
  scorecardSchema,
  type Criterion,
} from '@hr/shared'
import { db } from '../db/client.js'
import {
  applications,
  cvAnalyses,
  cvFiles,
  interviewQuestions,
  interviews,
  jobDescriptions,
  jobOpenings,
} from '../db/schema.js'
import { generateAssessmentQuestions } from '../ai/interviewReview.js'

/**
 * Creating a written interview for one applicant.
 *
 * The order matters and is the safety of it: the criteria are read and frozen
 * first, the questions are written against those frozen criteria, and only then
 * is anything stored. An interview whose questions were written from one
 * version of a job description and whose answers are scored against another is
 * an assessment nobody actually sat.
 */

const DRAFT_VALID_FOR_DAYS = 30

/**
 * The candidate's only credential.
 *
 * 32 random bytes, because it is not a password anybody chose and not a session
 * anybody can refresh — it is the whole of the access control for one page, and
 * the only defence against guessing it is that it cannot be guessed.
 */
function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export interface CreatedInterview {
  id: string
  token: string
  questions: number
}

export async function createInterview(
  applicationId: string,
  createdBy: string | null,
): Promise<CreatedInterview> {
  const app = (
    await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1)
  )[0]
  if (!app) throw new HTTPException(404, { message: 'applicationNotFound' })

  /*
   * One per application. Sending a second set of questions to somebody who has
   * already answered the first is a confusing thing to do to a person, and the
   * unique constraint means it cannot happen by a double-click either.
   */
  const already = (
    await db.select({ id: interviews.id }).from(interviews).where(eq(interviews.applicationId, applicationId)).limit(1)
  )[0]
  if (already) throw new HTTPException(409, { message: 'interviewAlreadyExists' })

  const jd = (
    await db
      .select()
      .from(jobDescriptions)
      .where(and(eq(jobDescriptions.openingId, app.openingId), eq(jobDescriptions.status, 'approved')))
      .limit(1)
  )[0]
  if (!jd) throw new HTTPException(422, { message: 'openingHasNoDescription' })

  const content = jobDescriptionContentSchema.safeParse(jd.content)
  if (!content.success) throw new HTTPException(422, { message: 'jobDescriptionMalformed' })

  const stored = scorecardSchema.safeParse(jd.scorecard)
  const criteria: Criterion[] = deriveCriteria(content.data, stored.success ? stored.data : null)
  /*
   * No requirements, no interview.
   *
   * Questions would have nothing to probe and answers nothing to be judged
   * against, so this refuses rather than sending somebody eight generic
   * questions over the company's name.
   */
  if (criteria.length === 0) throw new HTTPException(422, { message: 'jobHasNoRequirements' })

  const opening = (
    await db.select().from(jobOpenings).where(eq(jobOpenings.id, app.openingId)).limit(1)
  )[0]!

  /* The CV only calibrates the level; the position and its requirements drive the questions. */
  const row = (
    await db
      .select()
      .from(cvAnalyses)
      .where(and(eq(cvAnalyses.applicationId, applicationId), eq(cvAnalyses.status, 'done')))
      .orderBy(desc(cvAnalyses.createdAt))
      .limit(1)
  )[0]
  const cv = row ? cvAnalysisContentSchema.safeParse(row.content) : null
  if (!cv?.success) {
    throw new HTTPException(422, { message: 'interviewRequiresCvAnalysis' })
  }

  const written = await generateAssessmentQuestions(
    opening.titleEn || opening.titleAr,
    criteria,
    cv.data,
  )
  if (!written || written.length === 0) throw new HTTPException(503, { message: 'aiUnavailable' })

  const expiresAt = new Date(Date.now() + DRAFT_VALID_FOR_DAYS * 24 * 60 * 60 * 1000)
  const token = newToken()

  const created = await db.transaction(async (tx) => {
    const interview = (
      await tx
        .insert(interviews)
        .values({
          applicationId,
          status: 'draft',
          token,
          expiresAt,
          criteria: criteria as unknown as Record<string, unknown>[],
          createdBy,
        })
        .returning({ id: interviews.id })
    )[0]!

    await tx.insert(interviewQuestions).values(
      written.map((q, i) => ({
        interviewId: interview.id,
        ordinal: i + 1,
        textEn: q.en,
        textAr: q.ar,
        questionType: q.questionType,
        options: q.options,
        correctOptionId: q.correctOptionId,
        criterionKey: q.criterionKey,
      })),
    )
    return interview
  })

  return { id: created.id, token, questions: written.length }
}

/**
 * Whether HR has seen or changed a generated question.
 *
 * A pending status alone is not enough: revising a question sends it back to
 * pending, while preserving the review metadata. That metadata is what keeps
 * an arriving CV analysis from overwriting an HR decision.
 */
function isUntouchedDraftQuestion(question: {
  approvalStatus: string
  reviewFeedback: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
}): boolean {
  return (
    question.approvalStatus === 'pending' &&
    question.reviewFeedback === null &&
    question.reviewedBy === null &&
    question.reviewedAt === null
  )
}

/**
 * Re-calibrates a pristine assessment draft after its CV analysis succeeds.
 *
 * The public application has to create a token before the separately uploaded
 * CV can be analysed. This narrowly fills that timing gap: it only replaces a
 * draft whose questions have never been reviewed, and only with an analysis of
 * the candidate's current CV. The candidate-facing token route still omits
 * correctOptionId, so answer keys remain server-side.
 */
export async function refreshDraftInterviewFromCvAnalysis(applicationId: string, cvFileId: string): Promise<boolean> {
  const context = (
    await db
      .select({
        interviewId: interviews.id,
        status: interviews.status,
        criteria: interviews.criteria,
        candidateId: applications.candidateId,
        titleEn: jobOpenings.titleEn,
        titleAr: jobOpenings.titleAr,
      })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .where(eq(interviews.applicationId, applicationId))
      .limit(1)
  )[0]
  if (!context || context.status !== 'draft') return false

  const criteria = z.array(criterionSchema).safeParse(context.criteria)
  if (!criteria.success || criteria.data.length === 0) return false

  const latestCv = (
    await db
      .select({ id: cvFiles.id })
      .from(cvFiles)
      .where(eq(cvFiles.candidateId, context.candidateId))
      .orderBy(desc(cvFiles.uploadedAt))
      .limit(1)
  )[0]
  if (!latestCv || latestCv.id !== cvFileId) return false

  const analysis = (
    await db
      .select({ content: cvAnalyses.content })
      .from(cvAnalyses)
      .where(
        and(
          eq(cvAnalyses.applicationId, applicationId),
          eq(cvAnalyses.cvFileId, cvFileId),
          eq(cvAnalyses.status, 'done'),
        ),
      )
      .orderBy(desc(cvAnalyses.createdAt))
      .limit(1)
  )[0]
  const cv = analysis ? cvAnalysisContentSchema.safeParse(analysis.content) : null
  if (!cv?.success) return false

  const existing = await db
    .select({
      approvalStatus: interviewQuestions.approvalStatus,
      reviewFeedback: interviewQuestions.reviewFeedback,
      reviewedBy: interviewQuestions.reviewedBy,
      reviewedAt: interviewQuestions.reviewedAt,
    })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.interviewId, context.interviewId))
  if (existing.length === 0 || existing.some((question) => !isUntouchedDraftQuestion(question))) return false

  const written = await generateAssessmentQuestions(
    context.titleEn || context.titleAr,
    criteria.data as Criterion[],
    cv.data,
  )
  if (!written || written.length === 0) return false

  return db.transaction(async (tx) => {
    const lockedInterview = (
      await tx
        .select({ id: interviews.id })
        .from(interviews)
        .where(and(eq(interviews.id, context.interviewId), eq(interviews.status, 'draft')))
        .limit(1)
        .for('update')
    )[0]
    if (!lockedInterview) return false

    const lockedQuestions = await tx
      .select({
        approvalStatus: interviewQuestions.approvalStatus,
        reviewFeedback: interviewQuestions.reviewFeedback,
        reviewedBy: interviewQuestions.reviewedBy,
        reviewedAt: interviewQuestions.reviewedAt,
      })
      .from(interviewQuestions)
      .where(eq(interviewQuestions.interviewId, context.interviewId))
      .for('update')
    if (lockedQuestions.length === 0 || lockedQuestions.some((question) => !isUntouchedDraftQuestion(question))) {
      return false
    }

    const currentCv = (
      await tx
        .select({ id: cvFiles.id })
        .from(cvFiles)
        .where(eq(cvFiles.candidateId, context.candidateId))
        .orderBy(desc(cvFiles.uploadedAt))
        .limit(1)
    )[0]
    if (!currentCv || currentCv.id !== cvFileId) return false

    await tx.delete(interviewQuestions).where(eq(interviewQuestions.interviewId, context.interviewId))
    await tx.insert(interviewQuestions).values(
      written.map((question, index) => ({
        interviewId: context.interviewId,
        ordinal: index + 1,
        textEn: question.en,
        textAr: question.ar,
        questionType: question.questionType,
        options: question.options,
        correctOptionId: question.correctOptionId,
        criterionKey: question.criterionKey,
      })),
    )
    return true
  })
}
/**
 * The interview behind a token, for the candidate's page.
 *
 * Everything the page needs and nothing else: no candidate record, no other
 * application, no criteria and no weights. The token identifies one interview,
 * so it reads one interview — a link that could be walked into a list is a link
 * that leaks a hiring pipeline.
 */
export async function interviewByToken(token: string) {
  const row = (await db.select().from(interviews).where(eq(interviews.token, token)).limit(1))[0]
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) return { expired: true as const }

  const opening = (
    await db
      .select({ en: jobOpenings.titleEn, ar: jobOpenings.titleAr })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .where(eq(interviews.id, row.id))
      .limit(1)
  )[0]

  if (row.status === 'draft') {
    return {
      expired: false as const,
      pendingApproval: true as const,
      id: row.id,
      status: 'awaitingApproval' as const,
      position: { en: opening?.en ?? '', ar: opening?.ar ?? '' },
      questions: [],
    }
  }

  if (row.opensAt && row.opensAt.getTime() > Date.now()) {
    return {
      expired: false as const,
      notOpen: true as const,
      id: row.id,
      status: 'scheduled' as const,
      opensAt: row.opensAt,
      durationMinutes: row.durationMinutes,
      position: { en: opening?.en ?? '', ar: opening?.ar ?? '' },
      questions: [],
    }
  }

  const questions = await db
    .select({
      id: interviewQuestions.id,
      ordinal: interviewQuestions.ordinal,
      en: interviewQuestions.textEn,
      ar: interviewQuestions.textAr,
      questionType: interviewQuestions.questionType,
      options: interviewQuestions.options,
    })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.interviewId, row.id))
    .orderBy(asc(interviewQuestions.ordinal))

  return {
    expired: false as const,
    id: row.id,
    status: row.status,
    position: { en: opening?.en ?? '', ar: opening?.ar ?? '' },
    questions,
  }
}
