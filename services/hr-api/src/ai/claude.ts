import Anthropic from '@anthropic-ai/sdk'
import { jobDescriptionContentSchema, type JobDescriptionContent } from '@hr/shared'
import { z } from 'zod'
import { env } from '../env.js'
import { buildRegeneratePrompt, buildUserPrompt, SYSTEM_PROMPT } from './prompt.js'
import { AiFailure, type GenerationResult, type JobDescriptionProvider } from './provider.js'

/**
 * Claude Opus 5, asked for the document shape directly.
 *
 * Structured outputs rather than "please reply in JSON": the schema is enforced
 * by the API, so a well-formed document is the only thing that can come back.
 * It is then validated again here against the same zod schema, because the
 * enforcement guarantees shape and this codebase's rule is that nothing enters
 * the database unvalidated — two cheap checks on the boundary of a document a
 * candidate will read.
 */
const MODEL = 'claude-opus-5'

/**
 * `.parse()` needs a schema object it can turn into JSON Schema. The shared
 * content schema is exactly that, wrapped so the model has a named object to
 * fill rather than a bare top-level union.
 */
const responseSchema = z.object({ jobDescription: jobDescriptionContentSchema })

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new AiFailure('aiNotConfigured')
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

/** Turns anything the SDK throws into a code the web app can translate. */
function toFailure(error: unknown): AiFailure {
  if (error instanceof AiFailure) return error
  if (error instanceof Anthropic.AuthenticationError) return new AiFailure('aiNotConfigured', error.message)
  if (error instanceof Anthropic.RateLimitError) return new AiFailure('aiRateLimited', error.message)
  if (error instanceof Anthropic.APIError) return new AiFailure('aiUnavailable', `${error.status}: ${error.message}`)
  return new AiFailure('aiUnavailable', String(error))
}

async function ask(userPrompt: string): Promise<GenerationResult> {
  const anthropic = getClient()

  try {
    /**
     * Streamed because a full description at this effort can run past the
     * SDK's non-streaming timeout; `finalMessage()` waits for the whole thing,
     * so the call site still gets one object.
     */
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      // The instructions are long, identical on every call and sit first — so
      // they are cached, and only the requirements are billed at full rate.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: z.toJSONSchema(responseSchema) },
      },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const message = await stream.finalMessage()

    // A safety decline is not an outage — it is an answer, and it gets its own code.
    if (message.stop_reason === 'refusal') {
      throw new AiFailure('aiRefused', message.stop_details?.explanation ?? undefined)
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiFailure('aiInvalidOutput', 'response hit max_tokens')
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new AiFailure('aiInvalidOutput', 'response was not JSON')
    }

    const result = responseSchema.safeParse(parsed)
    if (!result.success) {
      throw new AiFailure('aiInvalidOutput', result.error.issues.map((i) => i.path.join('.')).join(', '))
    }

    return {
      content: result.data.jobDescription,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    }
  } catch (error) {
    throw toFailure(error)
  }
}

export const claudeProvider: JobDescriptionProvider = {
  name: MODEL,
  isModel: true,

  generate: (input) => ask(buildUserPrompt(input)),

  regenerate: (section, current: JobDescriptionContent, instruction) =>
    ask(buildRegeneratePrompt(section, current, instruction)),
}
