import { createHash } from 'node:crypto'

type Window = {count: number; resetAt: number}
/** Process-local only. Overflow shares a conservative bucket; live identities are never evicted to reset limits. */
export class AbuseBudget {
  private windows = new Map<string, Window>()
  constructor(readonly maximumKeys = 10000, private readonly clock: () => number = Date.now) { if (!Number.isSafeInteger(maximumKeys) || maximumKeys < 1 || maximumKeys > 10000) throw Error('invalidRateLimitCapacity') }
  consume(name: string, identity: string, limit: number, windowMs: number) {
    if (!/^[a-zA-Z0-9_.:-]{1,120}$/.test(name) || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) throw Error('invalidRateLimitConfiguration')
    const now = this.clock()
    let key = name + ':' + createHash('sha256').update(identity.slice(0, 2048)).digest('hex')
    if (!this.windows.has(key) && this.windows.size >= this.maximumKeys) { this.sweep(); if (this.windows.size >= this.maximumKeys) key = `${name}:overflow` }
    const old = this.windows.get(key), window = old && old.resetAt > now ? old : {count: 0, resetAt: now + windowMs}
    window.count = Math.min(window.count + 1, limit + 1); this.windows.set(key, window)
    return {allowed: window.count <= limit, remaining: Math.max(0, limit - window.count), retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000))}
  }
  sweep() { const now = this.clock(); for (const [key, value] of this.windows) if (value.resetAt <= now) this.windows.delete(key) }
  clear() { this.windows.clear() }
  get size() { return this.windows.size }
}
