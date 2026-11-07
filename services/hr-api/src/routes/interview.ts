import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { interviewOptionSchema } from '@hr/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { interviewAnswers, interviewQuestions, interviews } from '../db/schema.js'
import { interviewByToken } from '../recruitment/interview.js'
import { evaluateInterview } from '../ai/evaluateInterview.js'
import { validateBody, type AppEnv } from '../middleware.js'
import { rateLimit } from '../rateLimit.js'

/**
 * The candidate's side of a written interview.
 *
 * Like the careers page, these routes are not behind `requireAuth` — the person
 * answering has no account and never will. The token in the URL is the entire
 * credential, so the rules here are the same ones that apply there, stated
 * rather than assumed:
 *
 *  - The token identifies exactly one interview and is looked up as such. It is
 *    never a session, never carries a role, and grants nothing beyond this page.
 *  - Nothing about the candidate, the vacancy's requirements, the weights, or
 *    any other application is returned. The page needs the job title and the
 *    questions; it gets the job title and the questions.
 *  - Answers can be written once. A question already answered is refused rather
 *    than overwritten, because an assessment somebody can go back and revise
 *    after seeing later questions is a different exercise from the one HR sent.
 *  - Rate limited by token, so a leaked link cannot be used to hammer the
 *    server, and expiry is checked on every request rather than at the start.
 */
export const interviewRoutes = new Hono<AppEnv>()

const limit = rateLimit({ name: 'interview', limit: 120, windowMs: 60 * 60 * 1000 })
interviewRoutes.use('*', limit)

const answerSchema = z.object({
  questionId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
})

/** The interview behind a token: the position and the questions, nothing else. */
interviewRoutes.get('/:token', async (c) => {
  const found = await interviewByToken(c.req.param('token'))
  if (!found) throw new HTTPException(404, { message: 'interviewNotFound' })
  if (found.expired) throw new HTTPException(410, { message: 'interviewExpired' })

  c.header('Cache-Control', 'private, no-store')
  c.header('Referrer-Policy', 'no-referrer')
  if ('pendingApproval' in found) {
    return c.json({
      position: found.position,
      status: found.status,
      questions: [],
    })
  }
  if ('notOpen' in found) {
    return c.json({
      position: found.position,
      status: found.status,
      opensAt: found.opensAt!.toISOString(),
      durationMinutes: found.durationMinutes,
      questions: [],
    })
  }

  const answered = await db
    .select({ questionId: interviewAnswers.questionId })
    .from(interviewAnswers)
    .innerJoin(interviewQuestions, eq(interviewQuestions.id, interviewAnswers.questionId))
    .where(eq(interviewQuestions.interviewId, found.id))

  const done = new Set(answered.map((a) => a.questionId))
  return c.json({
    position: found.position,
    status: found.status,
    /* Answered questions come back without their text: this is not a transcript to re-read. */
    questions: found.questions.map((q) => ({
      id: q.id,
      ordinal: q.ordinal,
      en: q.en,
      ar: q.ar,
      questionType: q.questionType,
      options: q.options,
      answered: done.has(q.id),
    })),
  })
})

/**
 * One answer.
 *
 * The question is looked up through the interview the token names, so a
 * question id from somebody else's interview reaches nothing — the id is not
 * trusted on its own.
 */
interviewRoutes.post('/:token/answer', validateBody(answerSchema), async (c) => {
  const token = c.req.param('token')
  const { questionId, text } = c.get('body') as z.infer<typeof answerSchema>

  const row = (await db.select().from(interviews).where(eq(interviews.token, token)).limit(1))[0]
  if (!row) throw new HTTPException(404, { message: 'interviewNotFound' })
  if (row.status === 'draft') throw new HTTPException(404, { message: 'interviewNotFound' })
  if (row.opensAt && row.opensAt.getTime() > Date.now()) throw new HTTPException(409, { message: 'interviewNotOpen' })
  if (row.expiresAt.getTime() < Date.now()) throw new HTTPException(410, { message: 'interviewExpired' })
  if (row.status === 'completed') throw new HTTPException(409, { message: 'interviewCompleted' })

  const question = (
    await db
      .select({ id: interviewQuestions.id, questionType: interviewQuestions.questionType, options: interviewQuestions.options })
      .from(interviewQuestions)
      .where(and(eq(interviewQuestions.id, questionId), eq(interviewQuestions.interviewId, row.id)))
      .limit(1)
  )[0]
  if (!question) throw new HTTPException(404, { message: 'questionNotFound' })

  const options = interviewOptionSchema.array().safeParse(question.options)
  if (question.questionType === 'multipleChoice' && !options.data?.some((option) => option.id === text)) {
    throw new HTTPException(422, { message: 'invalidInterviewOption' })
  }

  const already = (
    await db.select({ id: interviewAnswers.id }).from(interviewAnswers).where(eq(interviewAnswers.questionId, questionId)).limit(1)
  )[0]
  if (already) throw new HTTPException(409, { message: 'alreadyAnswered' })

  await db.insert(interviewAnswers).values({ questionId, text })

  /* First answer starts it; the last one finishes it. Both are facts, not clicks. */
  if (row.status === 'sent') {
    await db.update(interviews).set({ status: 'inProgress', startedAt: new Date() }).where(eq(interviews.id, row.id))
  }

  const remaining = await db
    .select({ id: interviewQuestions.id })
    .from(interviewQuestions)
    .leftJoin(interviewAnswers, eq(interviewAnswers.questionId, interviewQuestions.id))
    .where(and(eq(interviewQuestions.interviewId, row.id), isNull(interviewAnswers.id)))
    .orderBy(asc(interviewQuestions.ordinal))

  if (remaining.length === 0) {
    await db.update(interviews).set({ status: 'completed', completedAt: new Date() }).where(eq(interviews.id, row.id))
    /*
     * Read afterwards, not in this request.
     *
     * The candidate has finished and is owed a reply now; making them wait on a
     * model call to hear that their answers arrived would be charging them for
     * HR's convenience. A failure here shows up as an interview with no
     * assessment yet, which HR can ask for again.
     */
    void evaluateInterview(row.id)
  }

  return c.json({ remaining: remaining.length, completed: remaining.length === 0 })
})
