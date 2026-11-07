import type { z } from 'zod'

export type TextAiProvider = 'openai' | 'ollama'

export interface StructuredGenerationRequest<T> {
  messages: readonly { role: 'system' | 'user' | 'assistant'; content: string }[]
  schema: z.ZodType<T>
  schemaName: string
  temperature?: number
}

export interface StructuredGenerationResult<T> {
  data: T
  model: string
  provider: TextAiProvider
  inputTokens: number | null
  outputTokens: number | null
}

export interface StructuredGenerationProvider {
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>
}

export type StructuredGenerationErrorCode =
  | 'connection' | 'timeout' | 'http' | 'invalidJson' | 'invalidResponse' | 'schemaValidation' | 'invalidSchema'

/** Does not include prompts, model output, or upstream response bodies. */
export class StructuredGenerationError extends Error {
  constructor(readonly code: StructuredGenerationErrorCode, message: string) {
    super(message)
    this.name = 'StructuredGenerationError'
  }
}
