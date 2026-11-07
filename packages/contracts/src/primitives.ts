import { z } from 'zod'

/** Free text a human wrote, carried in both languages so it survives a switch. */
export const localizedSchema = z.object({
  en: z.string(),
  ar: z.string(),
})
export type Localized = z.infer<typeof localizedSchema>

export const roleSchema = z.enum(['admin', 'manager', 'hr', 'employee'])
export type Role = z.infer<typeof roleSchema>

/**
 * A dictionary key plus its values, so text the *app* wrote travels as data and
 * is translated at render time. `vars` values are already rendered to strings or
 * ISO dates by the API.
 */
export const messageSchema = z.object({
  key: z.string(),
  vars: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})
export type Message = z.infer<typeof messageSchema>

/** A calendar day with no time or zone attached, as `YYYY-MM-DD`. */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

/** An instant, as ISO 8601. Dates cross the wire as strings and are parsed by the client. */
export const instantSchema = z.string().datetime({ offset: true })

export const idSchema = z.uuid()

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export interface ApiError {
  error: string
  message: string
  /** Field-level problems, keyed by path, when a body failed validation. */
  details?: Record<string, string[]>
}
