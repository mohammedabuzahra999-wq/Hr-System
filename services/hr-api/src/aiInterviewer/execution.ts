export const EVALUATOR_TIMEOUT_MS = 30_000
export const EVALUATOR_CONCURRENCY = 2
export const LEGACY_EVALUATION_LEASE_MS = 300_000
export type EvaluationDiagnostic = {
  event: 'evaluation_attempt_started' | 'evaluation_attempt_timed_out' | 'evaluation_attempt_failed' | 'evaluation_attempt_completed' | 'evaluation_attempt_fenced' | 'evaluation_capacity_exhausted' | 'evaluation_retry_scheduled' | 'runtime_maintenance_failed';
  interviewId?: string; evaluationId?: string; reportVersion?: number; attempt?: number; code?: string;
}
export type EvaluationDiagnostics = (event: EvaluationDiagnostic) => void
export const evaluationDiagnostic: EvaluationDiagnostics = event => { console.info('[ai-interview]', JSON.stringify(event)) }
export function diagnose(sink: EvaluationDiagnostics, event: EvaluationDiagnostic) { try { sink(event) } catch { /* Diagnostics never authorize or change an outcome. */ } }
export type TimeoutScheduler = (delayMs: number, callback: () => void) => () => void
export const scheduleEvaluationTimeout: TimeoutScheduler = (delay, callback) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer) }
export type EvaluationExecutionOptions = { timeoutMs?: number; scheduleTimeout?: TimeoutScheduler; diagnostics?: EvaluationDiagnostics }
type Slot = { owner: string; controller: AbortController; release(): void }

class EvaluationCoordinator {
  private slots = new Set<Slot>()
  reserve(owner: string): Slot | null {
    if (this.slots.size >= EVALUATOR_CONCURRENCY) return null
    const slot: Slot = { owner, controller: new AbortController(), release: () => { this.slots.delete(slot) } }
    this.slots.add(slot); return slot
  }
  cancel(owner: string) { for (const slot of this.slots) if (slot.owner === owner) slot.controller.abort() }
  get activeCalls() { return this.slots.size }
}
const coordinators = new WeakMap<object, EvaluationCoordinator>()
export function evaluationCoordinator(database: object) {
  let coordinator = coordinators.get(database)
  if (!coordinator) { coordinator = new EvaluationCoordinator(); coordinators.set(database, coordinator) }
  return coordinator
}
export type BoundedEvaluation = { value: unknown; failureCode: null } | { value: null; failureCode: 'EVALUATOR_TIMEOUT' | 'EVALUATOR_CANCELLED' | 'MOCK_EVALUATOR_FAILED' }

/** Bounds asynchronous/cooperative work. A timed-out uncancellable call keeps its physical slot. */
export function boundedEvaluation(slot: Slot, invoke: (signal: AbortSignal) => unknown | Promise<unknown>, timeoutMs: number,
  schedule: TimeoutScheduler, late: () => void): Promise<BoundedEvaluation> {
  return new Promise(resolve => {
    let settled = false, cancelTimeout: (() => void) | undefined
    const finish = (result: BoundedEvaluation) => {
      if (settled) return
      settled = true; cancelTimeout?.(); slot.controller.signal.removeEventListener('abort', cancelled); resolve(result)
    }
    const cancelled = () => finish({ value: null, failureCode: 'EVALUATOR_CANCELLED' })
    slot.controller.signal.addEventListener('abort', cancelled, { once: true })
    cancelTimeout = schedule(timeoutMs, () => { finish({ value: null, failureCode: 'EVALUATOR_TIMEOUT' }); slot.controller.abort() })
    if (slot.controller.signal.aborted) { cancelled(); slot.release(); return }
    Promise.resolve().then(() => {
      if (slot.controller.signal.aborted) return undefined
      return invoke(slot.controller.signal)
    }).then(value => {
      slot.release()
      if (settled) { late(); return }
      finish({ value, failureCode: null })
    }, () => {
      slot.release()
      if (settled) { late(); return }
      finish({ value: null, failureCode: 'MOCK_EVALUATOR_FAILED' })
    })
  })
}
