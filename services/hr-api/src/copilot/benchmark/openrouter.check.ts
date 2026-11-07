import 'dotenv/config'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { copilotPlanSchema } from '@hr/shared'
import { CASES } from './cases.js'
import { intentsFor, mayAsk } from '../intents.js'
import { captureCases, score } from './run.js'
import { createOpenRouterBenchmarkClient, OpenRouterBenchmarkError } from './openrouter.js'

const original = globalThis.fetch
const syntheticCredential = 'benchmark-placeholder-not-a-real-credential'
try {
  globalThis.fetch = async () => { throw new Error('No real network in self-test') }
  const { included, excluded } = await captureCases()
  assert.equal(included.length + excluded.length, CASES.length)
  assert.ok(excluded.length >= 7, 'Existing deterministic controls must remain local')
  for (const role of ['employee', 'manager', 'hr', 'admin'] as const) {
    assert.equal(mayAsk(role, 'employeeFile'), role !== 'employee')
    assert.equal(mayAsk(role, 'payrollInsights'), role === 'hr' || role === 'admin')
    assert.equal(intentsFor(role).includes('employeeFile'), role !== 'employee')
    assert.equal(intentsFor(role).includes('payrollInsights'), role === 'hr' || role === 'admin')
  }
  for (const { request } of included) {
    const system = request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
    assert.equal(system.split("For a named or numbered employee's payroll-related question").length - 1, 1)
    assert.ok(system.includes('including overtime hours or overtime pay, use employeeFile with reportType="payroll"'))
    assert.ok(system.includes('General or company-wide payroll analytics remain payrollInsights'))
  }
  const request = { messages: included[0]!.request.messages, schema: z.object({ plan: copilotPlanSchema }), schemaName: 'copilot_plan', temperature: 0 }
  const client = createOpenRouterBenchmarkClient({ apiKey: syntheticCredential, model: 'test/model:free' })
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.messages, request.messages)
    assert.deepEqual(body.reasoning, { enabled: false, exclude: true })
    assert.equal(body.response_format.type, 'json_schema')
    assert.deepEqual(body.response_format.json_schema.schema, request.schema.toJSONSchema({ io: 'input' }))
    assert.equal(body.provider.allow_fallbacks, false)
    return Response.json({ choices: [{ message: { content: JSON.stringify({ plan: CASES[0]!.expected }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 90, total_tokens: 190 } })
  }
  const result = await client.generate(request)
  assert.ok(result.schemaValid && score(result.content, CASES[0]!.expected).complete)
  assert.equal(result.totalTokens, 190)
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{invalid' }, finish_reason: 'stop' }] })
  assert.equal((await client.generate(request)).schemaValid, false)
  globalThis.fetch = async () => Response.json({ error: { message: `Rejected response_format ${syntheticCredential}` } }, { status: 400 })
  await assert.rejects(client.generate(request), (e: unknown) => e instanceof OpenRouterBenchmarkError
    && e.status === 400 && e.parameters.includes('response_format') && !JSON.stringify(e).includes(syntheticCredential))
  globalThis.fetch = async () => { throw new Error(syntheticCredential) }
  await assert.rejects(client.generate(request), (e: unknown) => e instanceof OpenRouterBenchmarkError && !e.message.includes(syntheticCredential))
  console.log(`PASS: unchanged fixtures; ${included.length} unresolved / ${excluded.length} local exclusions; unchanged prompts/schema; structured requests; reasoning disabled; usage; Zod; sanitized errors; no real network`)
} finally { globalThis.fetch = original }
