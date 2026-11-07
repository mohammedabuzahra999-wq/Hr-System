import { asc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { interviewOptionSchema } from '@hr/shared'
import { db } from '../db/client.js'
import { interviewAnswers, interviewQuestions, interviews } from '../db/schema.js'

export async function multipleChoiceResults(applicationId: string) {
  const interview = (
    await db.select().from(interviews).where(eq(interviews.applicationId, applicationId)).limit(1)
  )[0]
  if (!interview) throw new HTTPException(404, { message: 'interviewNotFound' })
  if (interview.status !== 'completed') throw new HTTPException(409, { message: 'interviewNotCompleted' })

  const rows = await db
    .select({
      id: interviewQuestions.id,
      ordinal: interviewQuestions.ordinal,
      en: interviewQuestions.textEn,
      ar: interviewQuestions.textAr,
      questionType: interviewQuestions.questionType,
      options: interviewQuestions.options,
      correctOptionId: interviewQuestions.correctOptionId,
      answer: interviewAnswers.text,
    })
    .from(interviewQuestions)
    .leftJoin(interviewAnswers, eq(interviewAnswers.questionId, interviewQuestions.id))
    .where(eq(interviewQuestions.interviewId, interview.id))
    .orderBy(asc(interviewQuestions.ordinal))

  return rows.map((row) => {
    if (row.questionType === 'written') {
      return {
        id: row.id,
        ordinal: row.ordinal,
        en: row.en,
        ar: row.ar,
        questionType: 'written' as const,
        answer: row.answer ?? '',
      }
    }

      const options = z.array(interviewOptionSchema).safeParse(row.options).data ?? []
      const selected = options.find((option) => option.id === row.answer) ?? null
      return {
        id: row.id,
        ordinal: row.ordinal,
        en: row.en,
        ar: row.ar,
        questionType: 'multipleChoice' as const,
        selected,
        correct: selected?.id === row.correctOptionId,
      }
    })
}
