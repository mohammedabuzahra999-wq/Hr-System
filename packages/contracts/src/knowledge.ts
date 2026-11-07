import { z } from 'zod'
import { idSchema, instantSchema, localizedSchema, roleSchema } from './primitives.js'

/**
 * Company knowledge that the assistant may retrieve.
 *
 * This is deliberately a document library, not a "training" switch. Entries
 * can be corrected or deleted immediately, and their audience is checked on
 * every query before any text is returned to the assistant.
 */
export const knowledgeAudienceSchema = z.array(roleSchema).min(1).max(4)
export type KnowledgeAudience = z.infer<typeof knowledgeAudienceSchema>

export const knowledgeDocumentSchema = z.object({
  id: idSchema,
  title: z.string(),
  sourceFileName: z.string().nullable(),
  sourceType: z.enum(['text', 'file']),
  visibleTo: knowledgeAudienceSchema,
  chunkCount: z.number().int().nonnegative(),
  createdByName: localizedSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
})
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>

export const createKnowledgeTextSchema = z.object({
  title: z.string().trim().min(2).max(180),
  content: z.string().trim().min(40).max(80_000),
  visibleTo: knowledgeAudienceSchema.default(['admin', 'hr', 'manager', 'employee']),
})
export type CreateKnowledgeTextInput = z.infer<typeof createKnowledgeTextSchema>

export const knowledgeSourceSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
})
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>
