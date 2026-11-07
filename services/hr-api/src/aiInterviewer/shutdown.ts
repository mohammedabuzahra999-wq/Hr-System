import { interviewOperations } from './operations.js'

/** One process: stop admission, drain HTTP/runtime/provider, then close persistence. */
export class InterviewShutdown {
  draining = false
  private pending?: Promise<{complete: boolean}>
  run(steps: {http: () => Promise<unknown>; runtime: () => Promise<unknown>; provider: () => Promise<unknown>; database: () => Promise<unknown>; forceConnections: () => void}, timeoutMs = 10000) {
    if (this.pending) return this.pending
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error('invalidShutdownTimeout')
    this.draining = true; interviewOperations.record({event: 'shutdown_started'})
    this.pending = new Promise(resolve => {
      let finished = false
      const finish = (complete: boolean) => {
        if (finished) return; finished = true; clearTimeout(timer)
        if (!complete) {try {steps.forceConnections()} catch { /* Exit remains unsuccessful. */ }}
        interviewOperations.record({event: complete ? 'shutdown_completed' : 'shutdown_incomplete'}); resolve({complete})
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      Promise.all([Promise.resolve().then(steps.http), Promise.resolve().then(steps.runtime), Promise.resolve().then(steps.provider)])
        .then(() => {if (!finished) return steps.database()}).then(() => finish(true), () => finish(false))
    })
    return this.pending
  }
}
