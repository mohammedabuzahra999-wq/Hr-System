import { z } from 'zod'
import type { Captured } from './run.js'

export class OpenRouterBenchmarkError extends Error {
  constructor(readonly kind: 'configuration' | 'http' | 'timeout' | 'connection' | 'invalidResponse',
    message: string, readonly status: number | null = null, readonly parameters: string[] = []) {
    super(message)
    this.name = 'OpenRouterBenchmarkError'
  }
}
const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable(), reasoning: z.string().nullable().optional() }),
    finish_reason: z.string().nullable() })).min(1),
  usage: z.object({ prompt_tokens: z.number().nonnegative().optional(), completion_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
    completion_tokens_details: z.object({ reasoning_tokens: z.number().nonnegative().optional() }).nullable().optional(),
  }).optional(),
})

/** Benchmark-only native fetch client. Never registered with any production factory. */
export function createOpenRouterBenchmarkClient(config: { apiKey: string; model: string; structured?: boolean }) {
  if (!config.apiKey.trim() || !config.model.endsWith(':free')) {
    throw new OpenRouterBenchmarkError('configuration', 'A non-empty OPENROUTER_API_KEY and explicit :free OPENROUTER_MODEL are required')
  }
  return {
    async generate(request: Captured['request']) {
      const signal = AbortSignal.timeout(120_000)
      const start = performance.now()
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.model, messages: request.messages, temperature: request.temperature ?? 0,
            stream: false, reasoning: { enabled: false, exclude: true },
            ...(config.structured !== false ? { response_format: { type: 'json_schema', json_schema: {
              name: request.schemaName, strict: true, schema: request.schema.toJSONSchema({ io: 'input' }),
            } } } : {}),
            provider: { require_parameters: true, allow_fallbacks: false },
          }),
        })
        const firstResponseSeconds = (performance.now() - start) / 1000
        if (!response.ok) {
          // Never log raw upstream errors, headers, bodies or credentials. Report
          // only HTTP status and recognized parameter names for rejection diagnosis.
          const body = await response.text()
          const parameters = [...new Set(body.match(/\b(?:response_format|json_schema|reasoning|temperature|provider|strict)\b/g) ?? [])]
          throw new OpenRouterBenchmarkError('http', `OpenRouter HTTP ${response.status}`, response.status, parameters)
        }
        const raw = responseSchema.safeParse(await response.json())
        if (!raw.success) throw new OpenRouterBenchmarkError('invalidResponse', 'Invalid OpenRouter response envelope')
        const first = raw.data.choices[0]!
        const content = first.message.content ?? ''
        if (content.includes(config.apiKey)) throw new OpenRouterBenchmarkError('invalidResponse', 'Unsafe upstream content suppressed')
        let parsed: unknown = null
        try { parsed = JSON.parse(content) } catch { /* Scored as failed JSON/Zod, with usage retained. */ }
        const valid = request.schema.safeParse(parsed)
        return { content, schemaValid: valid.success, finishReason: first.finish_reason,
          firstResponseSeconds, seconds: (performance.now() - start) / 1000,
          promptTokens: raw.data.usage?.prompt_tokens ?? null, completionTokens: raw.data.usage?.completion_tokens ?? null,
          totalTokens: raw.data.usage?.total_tokens ?? null,
          reasoningTokens: raw.data.usage?.completion_tokens_details?.reasoning_tokens ?? null,
          reasoningCharacters: first.message.reasoning?.length ?? 0 }
      } catch (error) {
        if (error instanceof OpenRouterBenchmarkError) throw error
        throw new OpenRouterBenchmarkError(signal.aborted ? 'timeout' : 'connection',
          signal.aborted ? 'OpenRouter 120-second timeout' : 'OpenRouter connection or JSON-response error')
      }
    },
  }
}
