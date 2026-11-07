import type {
  GenerateJobDescriptionInput,
  JobDescriptionContent,
  JobDescriptionSection,
} from '@hr/shared'

/**
 * How the rest of the server asks for a job description.
 *
 * One interface, so the difference between "a model wrote this" and "the server
 * arranged what you typed" is a single object swapped at boot — no route, no
 * page and no table knows which one ran. `name` travels with every result and
 * is stored on the row, so the record always says which it was.
 */
export interface JobDescriptionProvider {
  /** Recorded as the `model` on the description and on the generation log. */
  readonly name: string
  /** True when a real model is behind this. The UI says so plainly. */
  readonly isModel: boolean

  generate(input: GenerateJobDescriptionInput): Promise<GenerationResult>
  regenerate(
    section: JobDescriptionSection,
    current: JobDescriptionContent,
    instruction: string | undefined,
  ): Promise<GenerationResult>
}

export interface GenerationResult {
  content: JobDescriptionContent
  inputTokens: number | null
  outputTokens: number | null
}

/**
 * Why a generation failed, as a code the web app can translate.
 *
 * Provider errors never reach the browser as-is: a billing message or a rate
 * limit from upstream is not something to show an HR user, and a raw error
 * string is not something to show anyone.
 */
export type AiFailureCode =
  | 'aiNotConfigured'
  | 'aiUnavailable'
  | 'aiRateLimited'
  | 'aiInvalidOutput'
  | 'aiRefused'

export class AiFailure extends Error {
  constructor(
    readonly code: AiFailureCode,
    /** Logged, never sent. */
    readonly detail?: string,
  ) {
    super(code)
    this.name = 'AiFailure'
  }
}
