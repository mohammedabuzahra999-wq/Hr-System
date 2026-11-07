import 'dotenv/config'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { env } from '../env.js'
import { createOllamaProvider } from './ollama.js'
import { StructuredGenerationError } from './structured.js'

// Explicit opt-in smoke check; does not select or change the application's provider.
const schema = z.object({ department: z.literal('HR'), employeeCount: z.literal(3) }).strict()
const provider = createOllamaProvider({ baseUrl: env.OLLAMA_BASE_URL, model: 'qwen3:4b' })

const timings: number[] = []
for (let run = 1; run <= 5; run += 1) {
  const startedAt = performance.now()
  try {
    const result = await provider.generateStructured({
      schema,
      schemaName: 'ollama_smoke_check',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Extract the supplied facts. Return only JSON matching the provided schema.' },
        { role: 'user', content: 'The department is HR and it has exactly 3 employees.' },
      ],
    })
    assert.deepEqual(schema.parse(result.data), { department: 'HR', employeeCount: 3 })
    assert.equal(result.provider, 'ollama')
    const elapsed = (performance.now() - startedAt) / 1000
    timings.push(elapsed)
    console.log(`Run ${run}: PASS; ${elapsed.toFixed(3)}s; generated tokens=${result.outputTokens ?? 'unavailable'}; Zod validation passed`)
  } catch (error) {
    console.error(`Run ${run}: FAIL; ${((performance.now() - startedAt) / 1000).toFixed(3)}s; generated tokens=unavailable`)
    console.error(error instanceof StructuredGenerationError
      ? `${error.code}: ${error.message}`
      : 'Ollama smoke check assertion or validation failed')
    process.exitCode = 1
    break
  }
}
if (timings.length === 5) {
  console.log(`PASS: 5/5 validated; average=${(timings.reduce((sum, seconds) => sum + seconds, 0) / timings.length).toFixed(3)}s; slowest=${Math.max(...timings).toFixed(3)}s`)
}
