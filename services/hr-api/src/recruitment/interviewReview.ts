import { and, asc, desc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  criterionSchema,
  cvAnalysisContentSchema,
  interviewOptionSchema,
  interviewQuestionTypeSchema,
  type Criterion,
} from '@hr/shared'
import { db } from '../db/client.js'
import { applications, cvAnalyses, interviewQuestions, interviews, jobOpenings } from '../db/schema.js'
import { generateReplacementQuestion, type AssessmentQuestion } from '../ai/interviewReview.js'

function questionType(value: string): AssessmentQuestion['questionType'] {
  const parsed = interviewQuestionTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : 'written'
}

function questionOptions(value: unknown) {
  const parsed = z.array(interviewOptionSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

async function interviewForApplication(applicationId: string) {
  const interview = (
    await db.select().from(interviews).where(eq(interviews.applicationId, applicationId)).limit(1)
  )[0]
  if (!interview) throw new HTTPException(404, { message: 'interviewNotFound' })
  return interview
}

async function draftForApplication(applicationId: string) {
  const interview = await interviewForApplication(applicationId)
  if (interview.status !== 'draft') throw new HTTPException(409, { message: 'interviewAlreadySent' })
  return interview
}

async function questionInDraft(interviewId: string, questionId: string) {
  const question = (
    await db
      .select()
      .from(interviewQuestions)
      .where(and(eq(interviewQuestions.id, questionId), eq(interviewQuestions.interviewId, interviewId)))
      .limit(1)
  )[0]
  if (!question) throw new HTTPException(404, { message: 'questionNotFound' })
  return question
}

export async function getInterviewReview(applicationId: string) {
  const interview = await interviewForApplication(applicationId)
  const questions = await db
    .select({
      id: interviewQuestions.id,
      ordinal: interviewQuestions.ordinal,
      en: interviewQuestions.textEn,
      ar: interviewQuestions.textAr,
      questionType: interviewQuestions.questionType,
      options: interviewQuestions.options,
      correctOptionId: interviewQuestions.correctOptionId,
      criterionKey: interviewQuestions.criterionKey,
      approvalStatus: interviewQuestions.approvalStatus,
      reviewFeedback: interviewQuestions.reviewFeedback,
    })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.interviewId, interview.id))
    .orderBy(asc(interviewQuestions.ordinal))

  const reviewQuestions = questions.map((question) => ({
    ...question,
    questionType: questionType(question.questionType),
    options: questionOptions(question.options).map((option) => ({ ...option, correct: option.id === question.correctOptionId })),
    approvalStatus: question.approvalStatus === 'approved' ? ('approved' as const) : ('pending' as const),
  }))

  return {
    status: interview.status,
    questions: reviewQuestions,
    allApproved: reviewQuestions.length > 0 && reviewQuestions.every((question) => question.approvalStatus === 'approved'),
  }
}

export async function approveInterviewQuestion(applicationId: string, questionId: string, reviewerId: string) {
  const interview = await draftForApplication(applicationId)
  await questionInDraft(interview.id, questionId)
  await db
    .update(interviewQuestions)
    .set({ approvalStatus: 'approved', reviewFeedback: null, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(and(eq(interviewQuestions.id, questionId), eq(interviewQuestions.interviewId, interview.id)))
  return getInterviewReview(applicationId)
}

async function latestCv(applicationId: string) {
  const row = (
    await db
      .select({ content: cvAnalyses.content })
      .from(cvAnalyses)
      .where(and(eq(cvAnalyses.applicationId, applicationId), eq(cvAnalyses.status, 'done')))
      .orderBy(desc(cvAnalyses.createdAt))
      .limit(1)
  )[0]
  const parsed = row ? cvAnalysisContentSchema.safeParse(row.content) : null
  return parsed?.success ? parsed.data : null
}

async function replacementContext(applicationId: string, interviewId: string) {
  const found = (
    await db
      .select({ titleEn: jobOpenings.titleEn, titleAr: jobOpenings.titleAr, criteria: interviews.criteria })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .where(and(eq(interviews.id, interviewId), eq(interviews.applicationId, applicationId)))
      .limit(1)
  )[0]
  if (!found) throw new HTTPException(404, { message: 'interviewNotFound' })

  const criteria = z.array(criterionSchema).safeParse(found.criteria)
  if (!criteria.success || criteria.data.length === 0) throw new HTTPException(422, { message: 'jobHasNoRequirements' })
  return {
    title: found.titleEn || found.titleAr,
    criteria: criteria.data as Criterion[],
    cv: await latestCv(applicationId),
  }
}

export async function reviseInterviewQuestion(
  applicationId: string,
  questionId: string,
  feedback: string,
  reviewerId: string,
) {
  const interview = await draftForApplication(applicationId)
  const current = await questionInDraft(interview.id, questionId)
  const context = await replacementContext(applicationId, interview.id)
  const replacement = await generateReplacementQuestion(
    context.title,
    context.criteria,
    context.cv,
    {
      criterionKey: current.criterionKey,
      questionType: questionType(current.questionType),
      en: current.textEn,
      ar: current.textAr,
      options: questionOptions(current.options),
      correctOptionId: current.correctOptionId,
    },
    feedback,
  )
  if (!replacement) throw new HTTPException(503, { message: 'aiUnavailable' })

  await db
    .update(interviewQuestions)
    .set({
      textEn: replacement.en,
      textAr: replacement.ar,
      questionType: replacement.questionType,
      options: replacement.options,
      correctOptionId: replacement.correctOptionId,
      criterionKey: replacement.criterionKey,
      approvalStatus: 'pending',
      reviewFeedback: feedback,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    })
    .where(and(eq(interviewQuestions.id, questionId), eq(interviewQuestions.interviewId, interview.id)))

  return getInterviewReview(applicationId)
}

export async function sendApprovedInterview(
  applicationId: string,
  schedule: { opensAt: Date; durationMinutes: number },
) {
  const interview = await draftForApplication(applicationId)
  const questions = await db
    .select({ id: interviewQuestions.id, approvalStatus: interviewQuestions.approvalStatus })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.interviewId, interview.id))

  if (questions.length === 0 || questions.some((question) => question.approvalStatus !== 'approved')) {
    throw new HTTPException(422, { message: 'interviewRequiresApproval' })
  }

  if (schedule.opensAt.getTime() <= Date.now() + 30_000) {
    throw new HTTPException(422, { message: 'interviewScheduleInPast' })
  }

  const expiresAt = new Date(schedule.opensAt.getTime() + schedule.durationMinutes * 60_000)
  await db
    .update(interviews)
    .set({
      status: 'sent',
      opensAt: schedule.opensAt,
      durationMinutes: schedule.durationMinutes,
      expiresAt,
    })
    .where(eq(interviews.id, interview.id))

  return {
    id: interview.id,
    token: interview.token,
    questions: questions.length,
    opensAt: schedule.opensAt,
    durationMinutes: schedule.durationMinutes,
    expiresAt,
  }
}
