import { desc } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/client.js'
import { assistantUnansweredQuestions } from '../db/schema.js'
import { requireAuth, requireRole, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'

/**
 * The improvement inbox is deliberately separate from the assistant endpoint:
 * only HR and administrators may read the raw questions people asked.
 */
export const assistantReviewRoutes = new Hono<AppEnv>()

assistantReviewRoutes.use('*', requireAuth, requireRole(...allowed('reviewAssistantQuestions')))

assistantReviewRoutes.get('/unanswered', async (c) => {
  const rows = await db
    .select({
      id: assistantUnansweredQuestions.id,
      question: assistantUnansweredQuestions.question,
      role: assistantUnansweredQuestions.role,
      intent: assistantUnansweredQuestions.intent,
      reason: assistantUnansweredQuestions.reason,
      createdAt: assistantUnansweredQuestions.createdAt,
    })
    .from(assistantUnansweredQuestions)
    .orderBy(desc(assistantUnansweredQuestions.createdAt))
    .limit(200)

  return c.json({
    questions: rows.map((row) => ({
      ...row,
      reason: row.reason as 'notHrData' | 'notPermitted' | 'unclear' | 'noData',
      createdAt: row.createdAt.toISOString(),
    })),
  })
})
