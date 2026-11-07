import { z } from 'zod'
import { idSchema, instantSchema, localizedSchema } from './primitives.js'

/**
 * Reading a CV against a vacancy.
 *
 * The shape is the safety feature. A single number would be easy to store and
 * impossible to defend: an applicant who asks why they were passed over, or a
 * regulator who asks how candidates were ranked, needs the working, and a score
 * with no working cannot produce it afterwards.
 *
 * So every requirement judged appears here by name, with its verdict and the
 * line of the CV that justifies it. The percentage is derived from those rows
 * and shown beside them, never alone.
 */

/**
 * `notEvidenced` rather than `missing`, and the distinction is the point: the
 * CV not mentioning something is a fact about the document, not about the
 * person. Plenty of people leave their strongest skill off the page.
 */
export const requirementVerdictSchema = z.enum(['met', 'partial', 'notEvidenced'])
export type RequirementVerdict = z.infer<typeof requirementVerdictSchema>

export const requirementKindSchema = z.enum(['qualification', 'skill', 'preferred', 'experience', 'education'])
export type RequirementKind = z.infer<typeof requirementKindSchema>

export const requirementMatchSchema = z.object({
  /** The requirement, as the job description words it. */
  requirement: z.string(),
  kind: requirementKindSchema,
  verdict: requirementVerdictSchema,
  /**
   * The line of the CV that supports the verdict, copied exactly.
   *
   * Empty for `notEvidenced` — there is nothing to quote — and required
   * otherwise, so a verdict can always be checked against the document rather
   * than taken on trust.
   */
  evidence: z.string(),
  /** What is still missing, for a partial match. */
  gap: z.string(),
})
export type RequirementMatch = z.infer<typeof requirementMatchSchema>

export const cvAnalysisContentSchema = z.object({
  /**
   * 0-100, counted from the verdicts below and the weights HR set.
   *
   * Null when this role has no weights yet, and null is the honest answer there,
   * not zero. A zero is a score, and it reads as the worst candidate anybody has
   * seen; the absence of a rubric is not a verdict on anyone.
   *
   * Never written by the model: it is removed from the schema the model fills,
   * so it cannot produce one even by accident.
   */
  score: z.number().int().min(0).max(100).nullable(),
  /**
   * The same verdicts, weighted by what past hires evidenced instead.
   *
   * Null until this role has been filled enough times for the pattern to be one
   * (see MIN_HIRES_FOR_HISTORY). Shown beside the weighted score rather than
   * merged into it: where the two disagree, the disagreement is the point.
   */
  historyScore: z.number().int().min(0).max(100).nullable().default(null),
  /**
   * How many hires that second figure is drawn from, so it can be judged.
   *
   * Defaulted, like `historyScore`, because these two were added to a shape that
   * already had rows stored against it. Without a default every analysis written
   * before them stopped parsing on read, and an analysis that fails to parse is
   * indistinguishable from one that failed to run — three finished analyses
   * showed up on screen as "the CV could not be read".
   */
  historyFrom: z.number().int().min(0).default(0),
  matches: z.array(requirementMatchSchema),
  /** What the CV shows that the vacancy asked for, in the reviewer's words. */
  summary: localizedSchema,
  /** Things a reviewer should look at — gaps, ambiguities, anything odd in the file. */
  concerns: z.array(localizedSchema),
  /** Only when the CV states it or dated roles imply it. Null when it does not. */
  yearsOfExperience: z.number().nullable(),
})
export type CvAnalysisContent = z.infer<typeof cvAnalysisContentSchema>

/** Why an analysis could not be produced. Shown to HR as a reason, not a score. */
export const analysisFailureSchema = z.enum([
  'noCv',
  'unsupportedFormat',
  'noTextFound',
  'extractionFailed',
  'noJobDescription',
  'aiUnavailable',
  'aiNotConfigured',
  'aiRateLimited',
  'aiInvalidOutput',
  /** Turned off by policy: no CV text may leave for a third party. */
  'sharingDisabled',
])
export type AnalysisFailure = z.infer<typeof analysisFailureSchema>

export const cvAnalysisSchema = z.object({
  id: idSchema,
  applicationId: idSchema,
  status: z.enum(['pending', 'done', 'failed']),
  /** Null until it succeeds. */
  content: cvAnalysisContentSchema.nullable(),
  failure: analysisFailureSchema.nullable(),
  /** Which model and which prompt produced this, so an old result can be traced. */
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  createdAt: instantSchema,
})
export type CvAnalysis = z.infer<typeof cvAnalysisSchema>
