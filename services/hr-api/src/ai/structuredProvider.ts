import type OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { env } from '../env.js'
import { ollamaProvider } from './ollama.js'
import { StructuredGenerationError, type StructuredGenerationProvider } from './structured.js'

/** Explicit selection; a missing/unavailable provider never selects another one. */
export function questionGenerationProvider(getOpenAiClient: () => OpenAI | null): StructuredGenerationProvider | null {
  if (env.AI_PROVIDER === 'ollama') return ollamaProvider
  const client = getOpenAiClient()
  if (!client) return null
  return {
    async generateStructured(request) {
      // Preserve resolveQuestion's OpenAI request and SDK error semantics.
      const response = await client.responses.parse({
        model: env.OPENAI_MODEL,
        temperature: request.temperature,
        input: [...request.messages],
        text: { format: zodTextFormat(request.schema, request.schemaName) },
      })
      const parsed = response.output_parsed ? request.schema.safeParse(response.output_parsed) : null
      if (!parsed?.success) throw new StructuredGenerationError('schemaValidation', 'Invalid structured question plan')
      return {
        data: parsed.data,
        model: env.OPENAI_MODEL,
        provider: 'openai',
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      }
    },
  }
}
