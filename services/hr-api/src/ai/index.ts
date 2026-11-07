import { env } from '../env.js'
import { claudeProvider } from './claude.js'
import { openAiProvider } from './openai.js'
import { outlineProvider } from './outline.js'
import type { JobDescriptionProvider } from './provider.js'

/**
 * Which provider is in use, decided once at boot from which key exists.
 *
 * The rest of the server never checks for a key — it asks for a provider and
 * gets one that works. Adding a key to `server/.env` and restarting is the whole
 * of "switching on the AI"; no route, page or table changes.
 *
 * Both model providers are kept because the cost of keeping one is a file that
 * already compiles, and the cost of deleting it is losing a working option. The
 * prompt, the validation and every screen are shared between them.
 */
function choose(): JobDescriptionProvider {
  if (env.OPENAI_API_KEY) return openAiProvider
  if (env.ANTHROPIC_API_KEY) return claudeProvider
  return outlineProvider
}

export const jobDescriptionProvider = choose()

console.log(
  jobDescriptionProvider.isModel
    ? `[ai] job descriptions: ${jobDescriptionProvider.name}`
    : '[ai] job descriptions: no API key — arranging input instead of generating',
)

export { AiFailure } from './provider.js'
export type { AiFailureCode, JobDescriptionProvider } from './provider.js'
export { PROMPT_VERSION } from './prompt.js'
export { embed, embeddableText, findSimilar } from './retrieval.js'
