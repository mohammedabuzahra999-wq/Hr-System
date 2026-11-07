import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { jobDescriptionContentSchema, type JobDescriptionContent } from '@hr/shared'
import { z } from 'zod'
import { env } from '../env.js'
import { buildRegeneratePrompt, buildUserPrompt, SYSTEM_PROMPT } from './prompt.js'
import { findSimilar, renderExamples } from './retrieval.js'
import { AiFailure, type GenerationResult, type JobDescriptionProvider } from './provider.js'

/**
 * OpenAI, asked for the document shape directly.
 *
 * `responses.parse` with `zodTextFormat` rather than "please reply in JSON":
 * the schema is enforced by the API, so a well-formed document is the only
 * thing that can come back. It is validated again here against the same zod
 * schema, because enforcement guarantees shape and this codebase's rule is that
 * nothing enters the database unvalidated — two cheap checks on the boundary of
 * a document a candidate will read.
 *
 * The prompt, the validation, the routes and the pages are shared with every
 * other provider. Only this file knows which company is behind the model.
 */
const responseSchema = z.object({ jobDescription: jobDescriptionContentSchema })

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!env.OPENAI_API_KEY) throw new AiFailure('aiNotConfigured')
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}

/** Turns anything the SDK throws into a code the web app can translate. */
function toFailure(error: unknown): AiFailure {
  if (error instanceof AiFailure) return error
  if (error instanceof OpenAI.AuthenticationError) return new AiFailure('aiNotConfigured', error.message)
  if (error instanceof OpenAI.RateLimitError) return new AiFailure('aiRateLimited', error.message)
  if (error instanceof OpenAI.APIError) return new AiFailure('aiUnavailable', `${error.status}: ${error.message}`)
  return new AiFailure('aiUnavailable', String(error))
}

async function ask(userPrompt: string): Promise<GenerationResult> {
  const openai = getClient()

  try {
    const response = await openai.responses.parse({
      model: env.OPENAI_MODEL,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      text: { format: zodTextFormat(responseSchema, 'job_description') },
    })

    // A refusal is an answer, not an outage, and gets its own code.
    if (response.status === 'incomplete') {
      throw new AiFailure('aiInvalidOutput', response.incomplete_details?.reason ?? 'incomplete response')
    }

    const parsed = response.output_parsed
    if (!parsed) throw new AiFailure('aiRefused', 'model returned no parsed output')

    // Validated again on our side: `parse` checks the wire format, this checks
    // that what arrived is a document this application can actually render.
    const result = responseSchema.safeParse(parsed)
    if (!result.success) {
      throw new AiFailure('aiInvalidOutput', result.error.issues.map((i) => i.path.join('.')).join(', '))
    }

    return {
      content: result.data.jobDescription,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    }
  } catch (error) {
    throw toFailure(error)
  }
}

export const openAiProvider: JobDescriptionProvider = {
  name: env.OPENAI_MODEL,
  isModel: true,

  /**
   * Retrieval first, then generation. If nothing close enough is in the
   * library — or embedding fails — the examples are empty and this behaves
   * exactly as it did before retrieval existed.
   */
  async generate(input) {
    const examples = await findSimilar(input)
    return ask(buildUserPrompt(input, renderExamples(examples)))
  },

  regenerate: (section, current: JobDescriptionContent, instruction) =>
    ask(buildRegeneratePrompt(section, current, instruction)),
}
