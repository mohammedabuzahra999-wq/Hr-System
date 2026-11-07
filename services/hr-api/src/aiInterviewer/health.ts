import { Hono } from 'hono'
import { rateLimit } from '../rateLimit.js'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'

/** One physical DB probe maximum. Timed-out probes are quarantined until actual settlement. */
export class DatabaseReadinessProbe {
  private pending?: Promise<boolean>
  private cached = {at: 0, value: false}
  constructor(private probe: () => Promise<unknown>, private timeoutMs = 1500) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1500) throw Error('invalidHealthTimeout')
  }
  check(): Promise<boolean> {
    if (this.pending) return this.pending
    if (this.cached.at && Date.now() - this.cached.at < 1000) return Promise.resolve(this.cached.value)
    this.pending = new Promise(resolve => {
      let settled = false
      const finish = (value: boolean) => {if (settled) return; settled = true; clearTimeout(timer); this.cached = {at: Date.now(), value}; resolve(value)}
      const timer = setTimeout(() => finish(false), this.timeoutMs)
      Promise.resolve().then(this.probe).then(() => finish(true), () => finish(false)).finally(() => {this.pending = undefined})
    })
    return this.pending
  }
}
type RuntimeHealth = {running: boolean; timersHealthy: boolean; evaluationsHealthy: boolean}
type ProviderHealth = {status: 'configured' | 'ready' | 'unavailable' | 'unhealthy'; mode: 'disabled' | 'synthetic' | 'real'; liveValidated: boolean}
const runtimeSchema = z.object({running: z.boolean(), timersHealthy: z.boolean(), evaluationsHealthy: z.boolean()}).strict()
const providerSchema = z.object({status: z.enum(['configured', 'ready', 'unavailable', 'unhealthy']), mode: z.enum(['disabled', 'synthetic', 'real']), liveValidated: z.boolean()}).strict()
  .refine(p => p.mode !== 'disabled' || p.status === 'unavailable')
export function createInterviewHealthRoutes(dependencies: {database: DatabaseReadinessProbe; runtime: () => RuntimeHealth; provider: () => ProviderHealth; draining: () => boolean}) {
  const router = new Hono()
  router.use('*', async (c, next) => {c.header('Cache-Control', 'no-store'); c.header('Pragma', 'no-cache'); c.header('X-Content-Type-Options', 'nosniff'); await next()})
  router.get('/live', c => c.json({alive: true}))
  router.use('*', rateLimit({name: 'interview-health', limit: 120, windowMs: 60000}))
  router.get('/', async c => {const available = await dependencies.database.check(); return c.json({ok: available && !dependencies.draining()}, available && !dependencies.draining() ? 200 : 503)})
  router.get('/ready', async c => {
    const available = await dependencies.database.check(), runtime = runtimeSchema.parse(dependencies.runtime()), provider = providerSchema.parse(dependencies.provider()), draining = dependencies.draining()
    return c.json({process: draining ? 'draining' : 'alive', database: available ? 'available' : 'unavailable',
      interviewRuntime: draining || !runtime.running ? 'unavailable' : runtime.timersHealthy && runtime.evaluationsHealthy ? 'ready' : 'starting-or-unhealthy',
      provider: {configured: provider.status !== 'unavailable', status: provider.status, scope: provider.mode, liveValidated: provider.liveValidated},
      productionGate: 'blocked', releaseValidation: {migrationChain: 'blocked', liveVoice: 'blocked'}}, 503)
  })
  router.onError((error, c) => error instanceof HTTPException && error.status === 429 ? c.json({error: 'tooManyRequests'}, 429) : c.json({error: 'healthUnavailable'}, 503))
  return router
}
