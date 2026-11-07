import type { TimeoutScheduler } from './execution.js'

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export class ManualTimeouts {
  now = 0
  private next = 0
  private callbacks = new Map<number, { at: number; callback: () => void }>()
  schedule: TimeoutScheduler = (delay, callback) => {
    const key = ++this.next; this.callbacks.set(key, { at: this.now + delay, callback })
    return () => { this.callbacks.delete(key) }
  }
  advance(ms: number) {
    this.now += ms
    for (const [key, item] of [...this.callbacks].sort((a,b) => a[1].at-b[1].at)) if (item.at <= this.now) {
      this.callbacks.delete(key); item.callback()
    }
  }
  get pending() { return this.callbacks.size }
}
export const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve))
