/** Local audio admission only. No retries, HR decisions or external services. */
export class LocalVoiceBusyError extends Error {}

type Waiter = { grant: () => void; timer: ReturnType<typeof setTimeout> }

export class LocalVoiceQueue {
  private active = false
  private waiting: Waiter[] = []
  private readonly waitMs: number
  private readonly maxPending: number
  private readonly pollMs: number

  constructor({ waitMs = 45_000, maxPending = 3, pollMs = 250 } = {}) {
    this.waitMs = waitMs; this.maxPending = maxPending; this.pollMs = pollMs
  }

  private release() {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next) next.grant()
      else this.active = false
    }
  }

  private acquire(): Promise<() => void> {
    if (!this.active) { this.active = true; return Promise.resolve(this.release()) }
    if (this.waiting.length >= this.maxPending) return Promise.reject(new LocalVoiceBusyError('Local audio queue full'))
    return new Promise((resolve, reject) => {
      const entry: Waiter = {
        grant: () => { clearTimeout(entry.timer); resolve(this.release()) },
        timer: setTimeout(() => {
          this.waiting = this.waiting.filter(item => item !== entry)
          reject(new LocalVoiceBusyError('Local audio admission timed out'))
        }, this.waitMs),
      }
      this.waiting.push(entry)
    })
  }

  async run<T>(operation: () => Promise<T>, isWorkerBusy: () => Promise<boolean> = async () => false): Promise<T> {
    const started = performance.now(), release = await this.acquire()
    try {
      // Also respect native work left by a previous dev-server process. Poll
      // metadata only; the user's audio/text POST is submitted exactly once.
      while (await isWorkerBusy()) {
        const remaining = this.waitMs - (performance.now() - started)
        if (remaining <= 0) throw new LocalVoiceBusyError('Local worker remained busy')
        await new Promise(resolve => setTimeout(resolve, Math.min(this.pollMs, remaining)))
      }
      if (performance.now() - started >= this.waitMs) throw new LocalVoiceBusyError('Local audio admission timed out')
      return await operation()
    } finally { release() }
  }
}
