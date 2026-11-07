import 'dotenv/config'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { z } from 'zod'
import { env } from '../env.js'
import { questionGenerationProvider } from './structuredProvider.js'
import { StructuredGenerationError } from './structured.js'

const originalProvider = env.AI_PROVIDER
const originalFetch = globalThis.fetch
try {
  env.AI_PROVIDER = 'ollama'
  assert.ok(questionGenerationProvider(() => { throw new Error('Must not initialize OpenAI') }))
  console.log('PASS: Ollama selection never initializes or falls back to OpenAI')
  const warmSchema = z.object({ answer: z.string() })
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.model, env.OLLAMA_MODEL)
    assert.equal(body.keep_alive, env.NODE_ENV === 'development' ? '30m' : undefined)
    assert.equal(body.stream, false); assert.equal(body.think, false)
    assert.equal(body.options.temperature, 0)
    assert.deepEqual(body.format, z.toJSONSchema(warmSchema, { io: 'input' }))
    assert.equal(body.messages[0].content, 'Preserved instructions')
    assert.equal(body.messages[1].content, /^qwen3(?::|$)/i.test(env.OLLAMA_MODEL) ? 'Preserved question /no_think' : 'Preserved question')
    return new Response(JSON.stringify({ model: env.OLLAMA_MODEL, done: true, message: { role: 'assistant', content: '{"answer":"ok"}' } }))
  }
  assert.deepEqual((await questionGenerationProvider(() => { throw Error('No OpenAI') })!.generateStructured({
    schema: warmSchema, schemaName: 'residency_check', temperature: 0,
    messages: [{ role: 'system', content: 'Preserved instructions' }, { role: 'user', content: 'Preserved question' }],
  })).data, { answer: 'ok' })
  console.log('PASS: development Ollama residency changes only keep_alive; model, prompts, schema, non-thinking and stream:false preserved (offline)')
  env.AI_PROVIDER = 'openai'
  assert.equal(questionGenerationProvider(() => null), null)
  console.log('PASS: missing OpenAI client does not select Ollama')
  const schema = z.object({ answer: z.string() })
  const messages = [{ role: 'system' as const, content: 'Preserved instructions' }, { role: 'user' as const, content: 'Preserved question' }]
  let malformed = false
  const fakeClient = { responses: { parse: async (request: Record<string, unknown>) => {
    assert.equal(request.model, env.OPENAI_MODEL)
    assert.equal(request.temperature, 0)
    assert.deepEqual(request.input, messages)
    assert.ok(request.text)
    return { output_parsed: malformed ? null : { answer: 'ok' }, usage: { input_tokens: 2, output_tokens: 1 } }
  } } } as unknown as OpenAI
  const provider = questionGenerationProvider(() => fakeClient)!
  const request = { schema, schemaName: 'test', messages, temperature: 0 }
  assert.deepEqual(await provider.generateStructured(request), {
    data: { answer: 'ok' }, model: env.OPENAI_MODEL, provider: 'openai', inputTokens: 2, outputTokens: 1,
  })
  malformed = true
  await assert.rejects(provider.generateStructured(request), (error: unknown) => error instanceof StructuredGenerationError && error.code === 'schemaValidation')
  console.log('PASS: OpenAI request, parsed result, usage and invalid-output semantics preserved (mock; no cloud calls)')
} finally {
  env.AI_PROVIDER = originalProvider
  globalThis.fetch = originalFetch
}
