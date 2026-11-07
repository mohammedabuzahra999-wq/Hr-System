import { z } from 'zod'
import { env } from '../env.js'
import {
  StructuredGenerationError,
  type StructuredGenerationProvider,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from './structured.js'

const envelopeSchema = z.object({
  model: z.string().min(1),
  message: z.object({ role: z.literal('assistant'), content: z.string() }),
  done: z.literal(true),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
})

/** Explicitly constructed, never registered with existing AI features. No cloud fallback. */
export function createOllamaProvider(config: {
  baseUrl: string
  model: string
  timeoutMs?: number
  keepAlive?: string
}): StructuredGenerationProvider {
  const endpoint = new URL(`${config.baseUrl.replace(/\/+$/, '')}/api/chat`)
  const timeoutMs = config.timeoutMs ?? 120_000 // Includes cold model loading and reading the body.
  if (!['http:', 'https:'].includes(endpoint.protocol) || !config.model.trim()
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid Ollama configuration')
  }

  return {
    async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
      let format: unknown
      try {
        format = z.toJSONSchema(request.schema, { io: 'input' })
      } catch {
        throw new StructuredGenerationError('invalidSchema', `Cannot convert ${request.schemaName} to JSON Schema`)
      }
      // Structured generation only. The installed Qwen3 template needs its soft
      // control as well as think:false; do not reuse this policy for free-form chat.
      const lastUserIndex = request.messages.findLastIndex((message) => message.role === 'user')
      const messages = /^qwen3(?::|$)/i.test(config.model)
        ? request.messages.map((message, index) => index === lastUserIndex
          ? { ...message, content: `${message.content} /no_think` }
          : message)
        : request.messages
      const signal = AbortSignal.timeout(timeoutMs)
      let raw: unknown
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model: config.model,
            messages,
            think: false,
            stream: false,
            ...(config.keepAlive ? { keep_alive: config.keepAlive } : {}),
            format,
            ...(request.temperature === undefined ? {} : { options: { temperature: request.temperature } }),
          }),
        })
        if (!response.ok) {
          await response.body?.cancel()
          throw new StructuredGenerationError('http',
            `Ollama returned HTTP ${response.status}${response.status === 404 ? '; verify the model is installed and the base URL is correct' : ''}`)
        }
        const text = await response.text()
        try {
          raw = JSON.parse(text)
        } catch {
          throw new StructuredGenerationError('invalidJson', 'Ollama returned an invalid JSON response body')
        }
      } catch (error) {
        if (error instanceof StructuredGenerationError) throw error
        if (signal.aborted) throw new StructuredGenerationError('timeout', `Ollama request timed out after ${timeoutMs}ms`)
        throw new StructuredGenerationError('connection', 'Cannot communicate with Ollama; verify Ollama is running and OLLAMA_BASE_URL is reachable')
      }
      const envelope = envelopeSchema.safeParse(raw)
      if (!envelope.success || envelope.data.done_reason === 'length') {
        throw new StructuredGenerationError('invalidResponse', 'Ollama returned an invalid or incomplete chat response')
      }
      let content: unknown
      try {
        content = JSON.parse(envelope.data.message.content)
      } catch {
        throw new StructuredGenerationError('invalidJson', `Ollama output for ${request.schemaName} is not valid JSON`)
      }
      const parsed = await request.schema.safeParseAsync(content)
      if (!parsed.success) {
        const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ')
        throw new StructuredGenerationError('schemaValidation', `Ollama output failed ${request.schemaName} validation at: ${paths}`)
      }
      return {
        data: parsed.data,
        model: envelope.data.model,
        provider: 'ollama',
        inputTokens: envelope.data.prompt_eval_count ?? null,
        outputTokens: envelope.data.eval_count ?? null,
      }
    },
  }
}

// Available for future integration; importing this module does not send a request.
export const ollamaProvider = createOllamaProvider({
  baseUrl: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  // Residency only: preserve prompts, model/options and production defaults.
  ...(env.NODE_ENV === 'development' ? { keepAlive: '30m' } : {}),
})
