import { and, asc, eq, gt, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { aiInterviews, aiInterviewEvents, aiInterviewEvaluations } from '../db/schema.js'

export type InterviewRow = typeof aiInterviews.$inferSelect
export type InterviewTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]
export class InterviewRepository {
  constructor(readonly database: Db) {}
  async locked<T>(id: string, operation: (tx: InterviewTransaction, row: InterviewRow) => Promise<T>): Promise<T> {
    return this.database.transaction(async tx => {
      const row = (await tx.select().from(aiInterviews).where(eq(aiInterviews.id, id)).for('update'))[0]
      if (!row) throw new InterviewServiceError(404, 'interviewNotFound')
      return operation(tx, row)
    })
  }
  async receipt(tx: InterviewTransaction, id: string, commandId: string) {
    return (await tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId, id), eq(aiInterviewEvents.commandId, commandId), eq(aiInterviewEvents.recordType, 'COMMAND'))))[0]
  }
  async save(tx: InterviewTransaction, row: InterviewRow, previousVersion: number) {
    const updated = await tx.update(aiInterviews).set(row).where(and(eq(aiInterviews.id, row.id), eq(aiInterviews.version, previousVersion))).returning({ id: aiInterviews.id })
    if (!updated.length) throw new InterviewServiceError(409, 'interviewVersionConflict')
  }
  async eventsAfter(tx: InterviewTransaction, id: string, sequence: number, limit = 100) {
    return tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId, id), gt(aiInterviewEvents.sequence, sequence))).orderBy(asc(aiInterviewEvents.sequence)).limit(limit)
  }
  async finalizedAnswers(tx: InterviewTransaction, id: string) {
    return tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId, id), eq(aiInterviewEvents.recordType, 'DOMAIN'), eq(aiInterviewEvents.eventType, 'CANDIDATE_ANSWER_FINALIZED'))).orderBy(asc(aiInterviewEvents.sequence))
  }
  async evaluation(tx: InterviewTransaction, id: string) {
    return (await tx.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId, id)).orderBy(sql`${aiInterviewEvaluations.reportVersion} desc`).limit(1))[0]
  }
}
export class InterviewServiceError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429, readonly code: string) { super(code) }
}
