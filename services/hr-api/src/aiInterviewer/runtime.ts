import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { aiInterviews, aiInterviewEvaluations } from '../db/schema.js'
import { InterviewReportService } from './reportService.js'
import { InterviewRepository } from './repository.js'
import { InterviewService } from './service.js'
import { interviewLlmConfiguration } from '../env.js'
import { diagnose, evaluationDiagnostic, EVALUATOR_CONCURRENCY, type EvaluationDiagnostics } from './execution.js'

export const interviewService = new InterviewService(new InterviewRepository(db),undefined,undefined,interviewLlmConfiguration)
export const INTERVIEW_MAINTENANCE_INTERVAL_MS = 1000
/** One process/owner. Independent passes keep evaluator waits off the timer path. */
export class InterviewMaintenance {
  private stopped = false
  private timerPass?: Promise<void>
  private discoveryPass?: Promise<void>
  private jobs = new Map<string, Promise<void>>()
  private timerHealthyAt = 0
  private discoveryHealthyAt = 0
  constructor(readonly service: InterviewService, readonly reports = new InterviewReportService(service), readonly diagnostic: EvaluationDiagnostics = evaluationDiagnostic) {}
  get activeJobs() { return this.jobs.size }
  health() { const now = Date.now(); return {running: !this.stopped, timersHealthy: this.timerHealthyAt > 0 && now - this.timerHealthyAt < 10000, evaluationsHealthy: this.discoveryHealthyAt > 0 && now - this.discoveryHealthyAt < 10000} }
  tickInterviews(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.timerPass) return this.timerPass
    const database = this.service.repository.database
    const pending = (async () => {
      let healthy = true
      const rows = await database.select({ id: aiInterviews.id }).from(aiInterviews).where(sql`${aiInterviews.snapshot}->>'status' = 'ACTIVE'`)
      for (const item of rows) {
        try {
          const row = await this.service.load({ kind: 'system' }, item.id)
          if (row.snapshot.status !== 'ACTIVE') continue
          if (row.snapshot.phase === 'PROCESSING') {
            if(await this.service.requiresModel(row.id))continue
            await this.service.execute({ kind: 'system' }, row.id, row.version, { type: 'PROCESS_ANSWER', commandId: `process:${row.snapshot.answers.at(-1)!.turnId}` })
          } else if (row.snapshot.phase === 'LISTENING') {
            const now = this.service.clock.now(), t = row.snapshot.timer!, draft = row.snapshot.draft!
            const silenceSec = row.snapshot.plan.questions.find(q => q.id === row.snapshot.currentQuestion!.baseQuestionId)!.silenceThresholdSec
            const due = now >= (t.stage === 'GRACE' ? t.graceDeadlineAt! : t.answerDeadlineAt)
              || (!t.warningEmitted && t.warningAtSec > 0 && now >= t.answerDeadlineAt - t.warningAtSec * 1000)
              || (!draft.speaking && !draft.finalText && silenceSec > 0 && now >= draft.lastActivityAt + silenceSec * 1000)
            if (due) await this.service.execute({ kind: 'system' }, row.id, row.version, { type: 'TIMER_TICK', commandId: `tick:${row.version}:${now}` })
            // Heartbeats preserve the last known healthy point, without changing domain version.
            await database.update(aiInterviews).set({ lastObservedAt: sql`greatest(${aiInterviews.lastObservedAt}, ${new Date(now)})` })
              .where(and(eq(aiInterviews.id, row.id), eq(aiInterviews.version, row.version), sql`${aiInterviews.snapshot}->>'status' = 'ACTIVE'`))
          }
        } catch { healthy = false; diagnose(this.diagnostic, { event: 'runtime_maintenance_failed', interviewId: item.id, code: 'INTERVIEW_SCAN_RETRY' }) }
      }
      this.timerHealthyAt = healthy ? Date.now() : 0
    })().catch(() => {this.timerHealthyAt = 0; diagnose(this.diagnostic, { event: 'runtime_maintenance_failed', code: 'INTERVIEW_SCAN_UNAVAILABLE' })})
      .finally(() => { if (this.timerPass === pending) this.timerPass = undefined })
    this.timerPass = pending; return pending
  }
  dispatchEvaluations(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.discoveryPass) return this.discoveryPass
    const database = this.service.repository.database
    const pending = (async () => {
      const jobs = await database.select({ id: aiInterviewEvaluations.interviewId, version: aiInterviewEvaluations.reportVersion }).from(aiInterviewEvaluations)
        .where(sql`${aiInterviewEvaluations.status} IN ('PENDING','RUNNING') AND ${aiInterviewEvaluations.results}->>'format' = 'phase4-report-v1'`)
        .orderBy(sql`CASE WHEN ${aiInterviewEvaluations.status} = 'PENDING' THEN 0 ELSE 1 END`, asc(aiInterviewEvaluations.createdAt), asc(aiInterviewEvaluations.id)).limit(64)
      for (const job of jobs) {
        if (this.stopped || this.jobs.size >= EVALUATOR_CONCURRENCY) break
        const key = `${job.id}:${job.version}`
        if (this.jobs.has(key)) continue
        const work = this.reports.runJob(job.id, job.version)
          .catch(() => diagnose(this.diagnostic, { event: 'runtime_maintenance_failed', interviewId: job.id, reportVersion: job.version, code: 'EVALUATION_DATABASE_RETRY' }))
          .finally(() => { this.jobs.delete(key) })
        this.jobs.set(key, work)
      }
      this.discoveryHealthyAt = Date.now()
    })().catch(() => {this.discoveryHealthyAt = 0; diagnose(this.diagnostic, { event: 'runtime_maintenance_failed', code: 'JOB_SCAN_UNAVAILABLE' })})
      .finally(() => { if (this.discoveryPass === pending) this.discoveryPass = undefined })
    this.discoveryPass = pending; return pending
  }
  async stop() {
    this.stopped = true
    this.reports.cancelActive()
    await Promise.allSettled([this.timerPass, this.discoveryPass, this.reports.drainOwner(), ...this.jobs.values()].filter((p): p is Promise<void> => !!p))
  }
}
export function startInterviewMaintenance(service: InterviewService = interviewService, reports = new InterviewReportService(service)) {
  const runtime = new InterviewMaintenance(service, reports)
  const timers = setInterval(() => { void runtime.tickInterviews() }, INTERVIEW_MAINTENANCE_INTERVAL_MS)
  const jobs = setInterval(() => { void runtime.dispatchEvaluations() }, INTERVIEW_MAINTENANCE_INTERVAL_MS)
  timers.unref(); jobs.unref()
  const stop = async () => { clearInterval(timers); clearInterval(jobs); await runtime.stop() }
  return Object.assign(stop, {health: () => runtime.health(), shutdown: async () => {reports.preventNewWork(); await stop()}})
}
