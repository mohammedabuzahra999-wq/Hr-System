import { z } from 'zod'
import { idSchema, instantSchema, localizedSchema } from './primitives.js'

/**
 * Job descriptions, drafted with help from a model and signed off by a person.
 *
 * Two rules shape everything here:
 *
 *  1. Nothing generated is official until HR approves it. The status and the
 *     provenance fields below exist so the difference is visible in the data,
 *     not just in someone's memory of where a paragraph came from.
 *  2. The model is given the requirements and told to write from them. It is not
 *     asked to supply facts about the company — salaries, benefits, policies and
 *     named certifications are exactly the things a plausible-sounding invention
 *     does real damage with, in a document a candidate will rely on.
 */

/** A bilingual list, e.g. responsibilities. The client's `loc()` reads it like any other pair. */
export const localizedListSchema = z.object({
  en: z.array(z.string()),
  ar: z.array(z.string()),
})
export type LocalizedList = z.infer<typeof localizedListSchema>

export const jobLevelSchema = z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'manager'])
export type JobLevel = z.infer<typeof jobLevelSchema>

export const employmentTypeSchema = z.enum(['fullTime', 'partTime', 'contract', 'temporary'])
export type EmploymentType = z.infer<typeof employmentTypeSchema>

/**
 * `draft` is anything not yet signed off, whether it came from the model a second
 * ago or an editor an hour ago. `approved` means a named person accepted it.
 * `archived` keeps a superseded version readable without it competing with the
 * current one.
 */
export const jobDescriptionStatusSchema = z.enum(['draft', 'approved', 'archived'])
export type JobDescriptionStatus = z.infer<typeof jobDescriptionStatusSchema>

/* ---------- the document itself ---------- */

/**
 * The sections a description carries, in both languages.
 *
 * This is also the schema handed to the model as its required output shape, so
 * the sections it must fill and the sections the app can render are the same
 * list by construction — a section cannot be generated that nothing displays,
 * and none can be displayed that the model was never asked for.
 */
export const jobDescriptionContentSchema = z.object({
  title: localizedSchema,
  summary: localizedSchema,
  responsibilities: localizedListSchema,
  requiredQualifications: localizedListSchema,
  requiredSkills: localizedListSchema,
  preferredSkills: localizedListSchema,
  softSkills: localizedListSchema,
  experience: localizedSchema,
  education: localizedSchema,
  /** Optional: only written when the request actually said something about it. */
  workingConditions: localizedSchema.nullable(),
})
export type JobDescriptionContent = z.infer<typeof jobDescriptionContentSchema>

/** The section names, for the regenerate-one-part flow and for iterating the UI. */
export const jobDescriptionSectionSchema = jobDescriptionContentSchema.keyof()
export type JobDescriptionSection = z.infer<typeof jobDescriptionSectionSchema>

export const JOB_DESCRIPTION_SECTIONS = [
  'title',
  'summary',
  'responsibilities',
  'requiredQualifications',
  'requiredSkills',
  'preferredSkills',
  'softSkills',
  'experience',
  'education',
  'workingConditions',
] as const satisfies readonly JobDescriptionSection[]

/* ---------- the stored record ---------- */

export const jobDescriptionSchema = z.object({
  id: idSchema,
  status: jobDescriptionStatusSchema,
  content: jobDescriptionContentSchema,
  department: localizedSchema,
  level: jobLevelSchema.nullable(),
  employmentType: employmentTypeSchema.nullable(),
  /** Linked to a vacancy, or standing on its own in the library. */
  openingId: idSchema.nullable(),
  openingTitle: localizedSchema.nullable(),

  /**
   * Provenance. A reader is entitled to know whether they are looking at
   * something a model wrote and nobody has touched, or at something a person
   * has been through — so both facts are recorded rather than inferred.
   */
  model: z.string().nullable(),
  generatedByName: localizedSchema.nullable(),
  generatedAt: instantSchema.nullable(),
  editedByHuman: z.boolean(),
  approvedByName: localizedSchema.nullable(),
  approvedAt: instantSchema.nullable(),

  createdAt: instantSchema,
  updatedAt: instantSchema,
})
export type JobDescription = z.infer<typeof jobDescriptionSchema>

/* ---------- asking for one ---------- */

/**
 * What HR supplies. Every field is optional on its own, but the request must
 * carry *something* to write from: either a sentence describing the role, or at
 * least a job title. Generating from an empty form would mean the model
 * inventing the entire role, which is the one thing it must not do.
 */
export const generateJobDescriptionSchema = z
  .object({
    /** Free text: "backend developer, 3 years, Python and Postgres". */
    prompt: z.string().trim().max(4000).optional(),

    title: z.string().trim().max(160).optional(),
    department: z.string().trim().max(160).optional(),
    level: jobLevelSchema.optional(),
    employmentType: employmentTypeSchema.optional(),
    location: z.string().trim().max(160).optional(),
    yearsExperience: z.number().int().min(0).max(50).optional(),
    education: z.string().trim().max(300).optional(),
    requiredSkills: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    preferredSkills: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    responsibilities: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),

    /** Attach to a vacancy at generation time, or leave it in the library. */
    openingId: idSchema.optional(),
  })
  .refine((input) => Boolean(input.prompt?.trim() || input.title?.trim()), {
    message: 'Provide a job title or describe the role.',
    path: ['title'],
  })
export type GenerateJobDescriptionInput = z.infer<typeof generateJobDescriptionSchema>

/**
 * Rewriting one part.
 *
 * `instruction` is the HR user's own words — "make the responsibilities more
 * specific", "aim this at a senior hire". The rest of the document travels with
 * the request so the new section is written to fit what is already there rather
 * than in isolation.
 */
export const regenerateSectionSchema = z.object({
  section: jobDescriptionSectionSchema,
  instruction: z.string().trim().max(500).optional(),
})
export type RegenerateSectionInput = z.infer<typeof regenerateSectionSchema>

/** Editing by hand. Any subset; touching any of it marks the document human-edited. */
export const updateJobDescriptionSchema = z.object({
  content: jobDescriptionContentSchema.partial().optional(),
  department: localizedSchema.optional(),
  level: jobLevelSchema.nullable().optional(),
  employmentType: employmentTypeSchema.nullable().optional(),
  openingId: idSchema.nullable().optional(),
  status: jobDescriptionStatusSchema.optional(),
})
export type UpdateJobDescriptionInput = z.infer<typeof updateJobDescriptionSchema>

export const jobDescriptionFilterSchema = z.object({
  status: jobDescriptionStatusSchema.optional(),
  openingId: idSchema.optional(),
})
export type JobDescriptionFilter = z.infer<typeof jobDescriptionFilterSchema>
