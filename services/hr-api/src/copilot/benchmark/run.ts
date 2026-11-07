import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { cpus, totalmem, freemem } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { copilotPlanSchema, type CopilotPlan } from '@hr/shared'
import type { StructuredGenerationRequest } from '../../ai/structured.js'
import { CASES, type BenchmarkCase } from './cases.js'
import { createOllamaProvider } from '../../ai/ollama.js'
import { StructuredGenerationError } from '../../ai/structured.js'

export const TARGETS = Object.freeze({ intentAccuracy: 0.90, completePlanAccuracy: 0.85,
  zodRate: 1, timeouts: 0, averageLatencySeconds: 10 })
const args = process.argv.slice(2)
const value = (key: string, fallback: string) => {
  const i = args.indexOf(key)
  if (i < 0) return fallback
  if (!args[i + 1] || args[i + 1]!.startsWith('--')) throw new Error(`Missing value for ${key}`)
  return args[i + 1]!
}
const models = [...new Set(value('--models', 'qwen3:4b,qwen2.5:1.5b,qwen2.5:3b').split(',').map(s => s.trim()).filter(Boolean))]
const base = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '')
const timeoutMs = 120_000
// Timers can pause during host suspension. Reject late results after resume and
// account deadline failures at the deadline, never as multi-hour inference.
export function requestTiming(start: number, now = performance.now()) {
  const elapsedMs = Math.max(0, now - start)
  return { seconds: Math.min(elapsedMs, timeoutMs) / 1000, deadlineExceeded: elapsedMs >= timeoutMs }
}
async function withDeadline<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new StructuredGenerationError('timeout', 'Benchmark request deadline exceeded')), timeoutMs)
    })])
  } finally { clearTimeout(timer) }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type Captured = { test: BenchmarkCase; request: StructuredGenerationRequest<{ plan: CopilotPlan }> }

// Capture the current resolver's exact request in an in-memory copy. Only its
// provider lookup is replaced, AFTER all real deterministic routing. No env/provider
// settings or production files are changed, and no OpenAI client is initialized.
export async function captureCases() {
  const file = new URL('../resolve.ts', import.meta.url)
  const original = readFileSync(file, 'utf8')
  const hook = 'questionGenerationProvider(getClient)'
  assert.equal(original.split(hook).length, 2, 'Resolver capture hook changed; review benchmark')
  let code = ts.transpileModule(original.replace(hook, "globalThis[Symbol.for('hr.benchmark.provider')]"), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText
  code = code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote: string, specifier: string) =>
    `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier))}`)
  const slots = globalThis as unknown as Record<symbol, unknown>
  const key = Symbol.for('hr.benchmark.provider')
  assert.equal(slots[key], undefined)
  const included: Captured[] = [], excluded: { id: string; input: string; plan: unknown }[] = []
  let request: Captured['request'] | null = null
  slots[key] = { generateStructured: async (incoming: Captured['request']) => {
    request = incoming
    return { data: { plan: CASES[0]!.expected }, provider: 'ollama', model: 'capture-only', inputTokens: null, outputTokens: null }
  } }
  try {
    const resolver = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')) as {
      resolveQuestion: (input: string, role: BenchmarkCase['role']) => Promise<unknown>
    }
    for (const test of CASES) {
      request = null
      const result = await resolver.resolveQuestion(test.input, test.role)
      if (request) included.push({ test, request })
      else excluded.push({ id: test.id, input: test.input, plan: result })
    }
  } finally { delete slots[key] }
  assert.equal(included.length + excluded.length, CASES.length, 'Every fixture must be accounted for')
  assert.ok(included.length > 0, 'No unresolved model workload remains')
  for (const language of ['en', 'ar', 'mixed']) assert.ok(included.some(c => c.test.language === language))
  for (const category of ['employee-payroll', 'calendar-period', 'out-of-scope', 'ambiguous']) assert.ok(CASES.some(c => c.category === category))
  for (const item of excluded) {
    const outcome = item.plan as { ok: boolean; plan?: CopilotPlan }
    assert.ok(outcome.ok && outcome.plan, `Invalid local result: ${item.id}`)
    // Strict new reads have exact goldens. Historical resolver-only exclusions
    // also include guide/action shortcuts whose HTTP path supplies extra context.
    if ('routingRule' in outcome) assert.equal(score(JSON.stringify({ plan: outcome.plan }), CASES.find(c => c.id === item.id)!.expected).complete,
      true, `Incorrect local result: ${item.id}`)
  }
  for (const test of CASES.filter(c => c.category === 'local-control')) assert.ok(excluded.some(c => c.id === test.id))
  return { included, excluded, resolverHash: hash(original) }
}

export function score(content: string, expected: CopilotPlan) {
  try {
    const envelope = JSON.parse(content)
    const parsed = copilotPlanSchema.safeParse(envelope.plan)
    if (parsed.success) return { zod: true, intent: parsed.data.intent === expected.intent,
      complete: isDeepStrictEqual(parsed.data, expected), actual: parsed.data }
  } catch { /* Invalid output counts as failure, never disappears from denominator. */ }
  return { zod: false, intent: false, complete: false, actual: null }
}
export type Row = { model: string; id: string; seconds: number; firstResponseSeconds: number | null;
  inputTokens: number | null; outputTokens: number | null; timeout: boolean; error?: string;
  zod: boolean; intent: boolean; complete: boolean; [key: string]: unknown }
export function summarize(model: string, rows: Row[]) {
  const n = rows.length
  const ratio = (key: 'intent' | 'complete' | 'zod') => n ? rows.filter(r => r[key]).length / n : 0
  const avg = (numbers: number[]) => numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null
  const result = { model, attempts: n, intentAccuracy: ratio('intent'), completePlanAccuracy: ratio('complete'), zodRate: ratio('zod'),
    averageLatencySeconds: avg(rows.map(r => r.seconds)), averageFirstResponseSeconds: avg(rows.flatMap(r => r.firstResponseSeconds === null ? [] : [r.firstResponseSeconds])),
    averageInputTokens: avg(rows.flatMap(r => r.inputTokens === null ? [] : [r.inputTokens])),
    averageOutputTokens: avg(rows.flatMap(r => r.outputTokens === null ? [] : [r.outputTokens])),
    timeouts: rows.filter(r => r.timeout).length, errors: rows.filter(r => r.error).length }
  return { ...result, accepted: n > 0 && result.intentAccuracy >= TARGETS.intentAccuracy
    && result.completePlanAccuracy >= TARGETS.completePlanAccuracy && result.zodRate === 1
    && result.timeouts === 0 && result.errors === 0 && result.averageLatencySeconds! <= TARGETS.averageLatencySeconds }
}

async function main() {
  // Guard request capture: unexpected network access during preparation is forbidden.
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Network attempted during request capture') }
  let captured: Awaited<ReturnType<typeof captureCases>>
  try { captured = await captureCases() } finally { globalThis.fetch = originalFetch }
  const { included, excluded, resolverHash } = captured
  const manifest = { startedAt: new Date().toISOString(), targets: TARGETS, models, resolverHash, fixtureHash: hash(CASES),
    hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytes: freemem() },
    settings: { timeoutMs, stream: false, temperature: 0, adapter: 'createOllamaProvider', generationOptions: 'existing adapter defaults' },
    included: included.map(({ test, request }) => ({ ...test, promptHash: hash(request.messages),
      schemaHash: hash(request.schema.toJSONSchema({ io: 'input' })),
      promptChars: request.messages.reduce((n, m) => n + m.content.length, 0) })), excluded }

  if (args.includes('--self-test')) {
    const golden = CASES[0]!.expected
    assert.equal(score(JSON.stringify({ plan: golden }), golden).complete, true)
    assert.equal(score(JSON.stringify({ plan: { ...golden, period: 'thisMonth' } }), golden).intent, true)
    assert.equal(score(JSON.stringify({ plan: { ...golden, period: 'thisMonth' } }), golden).complete, false)
    assert.equal(score('{broken', golden).zod, false)
    assert.equal(score(JSON.stringify({ plan: { intent: 'employeeFile' } }), golden).zod, false)
    const failed: Row = { model: 'test', id: 'x', seconds: 120, firstResponseSeconds: null, inputTokens: null, outputTokens: null,
      timeout: true, zod: false, intent: false, complete: false }
    const successful: Row = { ...failed, timeout: false, seconds: 1, zod: true, intent: true, complete: true }
    assert.equal(summarize('test', [failed, successful]).intentAccuracy, 0.5)
    assert.equal(summarize('test', [failed, successful]).accepted, false)
    assert.equal(summarize('test', [successful]).accepted, true)
    assert.equal(summarize('test', []).accepted, false)
    assert.deepEqual(requestTiming(1000, 2500), { seconds: 1.5, deadlineExceeded: false })
    assert.deepEqual(requestTiming(0, 165556000), { seconds: 120, deadlineExceeded: true })
    console.log(JSON.stringify({ pass: true, selfTest: 'capture, coverage, local exclusions, exact scoring, malformed output, timeout denominator, thresholds',
      included: included.length, excluded: excluded.length, modelRequests: 0 }))
    return
  }
  const get = async (path: string) => {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Ollama preflight HTTP ${response.status}`)
    return response.json()
  }
  const version = z.object({ version: z.string() }).parse(await get('/api/version'))
  const tags = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string(), size: z.number() })) }).parse(await get('/api/tags'))
  const missing = models.filter(model => !tags.models.some(m => m.name === model))
  console.log(JSON.stringify({ mode: args.includes('--run') ? 'run' : 'dry-run', targets: TARGETS, included: included.length,
    excluded: excluded.map(c => c.id), includedIds: included.map(c => c.test.id), models, missing, ollamaVersion: version.version }))
  if (!args.includes('--run')) return // Default: no chat requests, loading, pulling or configuration changes.
  if (missing.length) throw new Error(`Not installed: ${missing.join(', ')}. Benchmark will not pull models; no generation started.`)
  if (!models.length) throw new Error('Specify at least one model')
  const output = value('--out', 'ollama-model-benchmark.json')
  const rows: Row[] = []
  const warmups: unknown[] = []
  const persist = () => writeFileSync(output, JSON.stringify({ ...manifest, ollamaVersion: version.version,
    installedModels: tags.models.filter(m => models.includes(m.name)), warmups, rows,
    summaries: models.map(model => summarize(model, rows.filter(r => r.model === model))) }, null, 2))
  for (const model of models) {
    // Load once before scoring; retain cold-load timing separately. Run sequentially on CPU.
    const loadStart = performance.now()
    const load = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify({ model, messages: [], stream: false,
        keep_alive: '5m', options: { num_ctx: 4096, num_gpu: 0 } }) })
    if (!load.ok) throw new Error(`Model warmup failed: HTTP ${load.status}`)
    await load.json()
    warmups.push({ model, seconds: (performance.now() - loadStart) / 1000 })
    try {
      for (const { test, request } of included) {
        const start = performance.now()
        const row: Row = { model, id: test.id, input: test.input, role: test.role, expected: test.expected,
          seconds: 0, firstResponseSeconds: null, firstTokenSeconds: null, inputTokens: null, outputTokens: null,
          timeout: false, zod: false, intent: false, complete: false }
        try {
          const provider = createOllamaProvider({ baseUrl: base, model, timeoutMs })
          const result = await withDeadline(() => provider.generateStructured(request))
          if (requestTiming(start).deadlineExceeded) throw new StructuredGenerationError('timeout', 'Benchmark request deadline exceeded')
          Object.assign(row, score(JSON.stringify(result.data), test.expected), {
            inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            modelResponse: true,
          })
        } catch (error) {
          row.timeout = error instanceof StructuredGenerationError && error.code === 'timeout'
          row.errorCode = error instanceof StructuredGenerationError ? error.code : 'unknown'
          row.modelResponse = error instanceof StructuredGenerationError
            && ['schemaValidation', 'invalidJson', 'invalidResponse'].includes(error.code)
          row.error = row.timeout ? '120-second timeout' : error instanceof Error && /^HTTP \d+$|^Incomplete generation$/.test(error.message)
            ? error.message : 'Connection or invalid response error'
        }
        const timing = requestTiming(start)
        if (timing.deadlineExceeded) {
          Object.assign(row, { timeout: true, zod: false, intent: false, complete: false,
            actual: null, modelResponse: false, error: '120-second timeout', errorCode: 'timeout' })
        }
        row.seconds = timing.seconds
        row.deadlineOverrun = timing.deadlineExceeded
        rows.push(row)
        console.log(JSON.stringify(row))
        persist()
      }
    } finally {
      // Release this benchmark model before the next one; never delete/pull models.
      const release = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000), body: JSON.stringify({ model, messages: [], keep_alive: 0, stream: false }) }).catch(() => null)
      await release?.body?.cancel()
    }
  }
  console.log('Model | Intent Accuracy | Complete Plan Accuracy | Avg Latency | Zod | Timeouts')
  let accepted = false
  for (const model of models) {
    const s = summarize(model, rows.filter(r => r.model === model))
    console.log(`${model} | ${(s.intentAccuracy * 100).toFixed(1)}% | ${(s.completePlanAccuracy * 100).toFixed(1)}% | ${s.averageLatencySeconds?.toFixed(2)}s | ${(s.zodRate * 100).toFixed(1)}% | ${s.timeouts}`)
    accepted ||= s.accepted
  }
  if (!accepted) process.exitCode = 1
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Benchmark failed'); process.exitCode = 1 })
}
