import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { CASES } from './cases.js'
import { captureCases, score, summarize, TARGETS, type Row } from './run.js'
import { createOpenRouterBenchmarkClient, OpenRouterBenchmarkError } from './openrouter.js'

const output = 'openrouter-nemotron-shared-prompt.json'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * values.length) - 1)]! : null
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

async function main() {
  // Sequential pacing only, never retries. The delay is outside measured latency.
  const configuredDelay = process.env.BENCHMARK_DELAY_MS?.trim() ?? '3200'
  if (!/^\d+$/.test(configuredDelay) || !Number.isSafeInteger(Number(configuredDelay))
    || Number(configuredDelay) > 2_147_483_647) {
    throw new OpenRouterBenchmarkError('configuration', 'BENCHMARK_DELAY_MS must be an integer from 0 to 2147483647')
  }
  const benchmarkDelayMs = Number(configuredDelay)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Unexpected network during synthetic capture') }
  let captured: Awaited<ReturnType<typeof captureCases>>
  try { captured = await captureCases() } finally { globalThis.fetch = originalFetch }
  assert.equal(captured.included.length, 26, 'Workload changed: review before sending any requests')
  const workload = captured.included
  const model = process.env.OPENROUTER_MODEL?.trim()
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!model || !apiKey) {
    writeFileSync(output, JSON.stringify({ status: 'blocked', provider: 'openrouter-benchmark-only', model: model ?? null,
      reason: 'Missing or blank OPENROUTER_API_KEY / OPENROUTER_MODEL in the saved server/.env',
      plannedCases: 26, attemptedCases: 0, excludedLocalCases: captured.excluded.length,
      resolverHash: captured.resolverHash, fixtureHash: hash(CASES), targets: TARGETS, rows: [], summary: null }, null, 2))
    throw new OpenRouterBenchmarkError('configuration', 'Missing or blank OPENROUTER_API_KEY / OPENROUTER_MODEL in the saved server/.env')
  }

  const metadataResponse = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) })
  if (!metadataResponse.ok) throw new OpenRouterBenchmarkError('http', 'OpenRouter public model metadata unavailable', metadataResponse.status)
  const metadata = z.object({ data: z.array(z.object({ id: z.string(), supported_parameters: z.array(z.string()).optional(),
    pricing: z.object({ prompt: z.string(), completion: z.string() }) })) }).parse(await metadataResponse.json())
  const selected = metadata.data.find(m => m.id === model)
  if (!selected || Number(selected.pricing.prompt) !== 0 || Number(selected.pricing.completion) !== 0) {
    throw new OpenRouterBenchmarkError('configuration', 'Configured model is unavailable or not advertised as free; no substitution made')
  }
  const structured = selected.supported_parameters?.includes('structured_outputs') ?? false
  const client = createOpenRouterBenchmarkClient({ apiKey, model, structured })
  const manifest = { startedAt: new Date().toISOString(), provider: 'openrouter-benchmark-only', model, targets: TARGETS,
    promptSource: 'shared-resolveQuestion', benchmarkPromptInjection: false,
    resolverHash: captured.resolverHash, fixtureHash: hash(CASES), structured, reasoningEnabled: false,
    timeoutMs: 120000, minimumRequestIntervalMs: benchmarkDelayMs,
    benchmarkDelayMs, delayPlacement: 'after previous case completes; before next case starts',
    included: workload.map(({ test, request }, index) => ({ ...test, promptHash: hash(request.messages),
      basePromptHash: hash(captured.included[index]!.request.messages), schemaHash: hash(request.schema.toJSONSchema({ io: 'input' })) })),
    excluded: captured.excluded, supportedParameters: selected.supported_parameters }
  const rows: Row[] = []
  const summary = () => {
    const base = summarize(model, rows)
    const seconds = rows.map(r => r.seconds)
    const responses = rows.filter(r => r.firstResponseSeconds !== null && !r.timeout && !r.httpStatus)
    const successfulResponseZodRate = responses.length ? responses.filter(r => r.zod).length / responses.length : null
    const byLanguage = Object.fromEntries(['en', 'ar', 'mixed'].map(language => {
      const subset = rows.filter(r => r.language === language)
      return [language, { cases: subset.length, intentAccuracy: subset.length ? subset.filter(r => r.intent).length / subset.length : null,
        completePlanAccuracy: subset.length ? subset.filter(r => r.complete).length / subset.length : null }]
    }))
    return { ...base, plannedCases: 26, completedAllCases: rows.length === 26,
      successfulModelResponses: responses.length, successfulResponseZodRate,
      accepted: rows.length === 26 && base.intentAccuracy >= TARGETS.intentAccuracy
        && base.completePlanAccuracy >= TARGETS.completePlanAccuracy && successfulResponseZodRate === 1
        && base.timeouts === 0 && base.averageLatencySeconds !== null && base.averageLatencySeconds <= TARGETS.averageLatencySeconds,
      medianSeconds: median(seconds),
      p95Seconds: seconds.length >= 20 ? percentile(seconds, .95) : null,
      slowestSeconds: seconds.length ? Math.max(...seconds) : null,
      slowestCase: rows.length ? rows.reduce((slowest, row) => row.seconds > slowest.seconds ? row : slowest).id : null,
      nonTimeoutErrors: rows.filter(r => r.error && !r.timeout).length, byLanguage,
      criteria: { intentAccuracy: base.intentAccuracy >= TARGETS.intentAccuracy,
        completePlanAccuracy: base.completePlanAccuracy >= TARGETS.completePlanAccuracy,
        zod: successfulResponseZodRate === TARGETS.zodRate, noTimeouts: base.timeouts === 0,
        averageLatency: base.averageLatencySeconds !== null && base.averageLatencySeconds <= TARGETS.averageLatencySeconds },
      tokenUsageSamples: rows.filter(r => r.inputTokens !== null).length,
      promptTokens: rows.some(r => r.inputTokens !== null) ? rows.reduce((n, r) => n + (r.inputTokens ?? 0), 0) : null,
      completionTokens: rows.some(r => r.outputTokens !== null) ? rows.reduce((n, r) => n + (r.outputTokens ?? 0), 0) : null,
      totalTokens: rows.some(r => r.totalTokens !== null) ? rows.reduce((n, r) => n + Number(r.totalTokens ?? 0), 0) : null }
  }
  const persist = () => writeFileSync(output, JSON.stringify({ ...manifest, rows, summary: summary() }, null, 2))
  persist()
  console.log(JSON.stringify({ model, syntheticModelCases: 26, excludedLocalCases: captured.excluded.length, structured, reasoningEnabled: false }))
  for (const { test, request } of workload) {
    if (rows.length > 0) await delay(benchmarkDelayMs)
    const start = performance.now()
    const row: Row = { model, id: test.id, language: test.language, input: test.input, role: test.role,
      expected: test.expected, expectedIntent: test.expected.intent, actualIntent: null, actual: null,
      seconds: 0, firstResponseSeconds: null, inputTokens: null, outputTokens: null, totalTokens: null,
      timeout: false, zod: false, intent: false, complete: false }
    try {
      const result = await client.generate(request)
      const evaluated = score(result.content, test.expected)
      const finished = result.finishReason === 'stop'
      Object.assign(row, evaluated, { zod: result.schemaValid && evaluated.zod,
        intent: finished && evaluated.intent, complete: finished && evaluated.complete,
        actualIntent: evaluated.actual?.intent ?? null, firstResponseSeconds: result.firstResponseSeconds,
        inputTokens: result.promptTokens, outputTokens: result.completionTokens, totalTokens: result.totalTokens,
        reasoningTokens: result.reasoningTokens, reasoningCharacters: result.reasoningCharacters, finishReason: result.finishReason })
      row.mismatchedFields = evaluated.actual ? Object.keys(test.expected).filter(key =>
        test.expected[key as keyof typeof test.expected] !== evaluated.actual![key as keyof typeof test.expected]) : []
      if (!finished) row.error = 'Incomplete/refused generation'
      else if (!evaluated.zod) row.error = 'Invalid JSON or CopilotPlan schema validation failure'
    } catch (error) {
      const safe = error instanceof OpenRouterBenchmarkError ? error : null
      row.timeout = safe?.kind === 'timeout'
      row.error = safe?.message ?? 'Benchmark request failed'
      row.httpStatus = safe?.status ?? null
      row.rejectedParameters = safe?.parameters ?? []
    }
    row.seconds = (performance.now() - start) / 1000
    rows.push(row)
    persist()
    console.log(JSON.stringify(row))
    if ([400, 401, 402, 403, 404].includes(Number(row.httpStatus))) {
      console.log('Stopped after a configuration/authentication/parameter rejection; remaining cases not attempted.')
      break
    }
  }
  const result = summary()
  console.log(JSON.stringify(result))
  console.log('Model | Intent Accuracy | Complete Plan | Avg Latency | Zod | Timeouts | Verdict')
  console.log(`${model} | ${(result.intentAccuracy * 100).toFixed(1)}% | ${(result.completePlanAccuracy * 100).toFixed(1)}% | ${result.averageLatencySeconds?.toFixed(3)}s | ${(result.zodRate * 100).toFixed(1)}% | ${result.timeouts} | ${result.accepted ? 'PASS' : 'FAIL / incomplete'}`)
  if (!result.accepted) process.exitCode = 1
}
main().catch(error => {
  console.error(error instanceof OpenRouterBenchmarkError ? error.message : 'OpenRouter benchmark preparation failed; no secret details logged')
  process.exitCode = 1
})
