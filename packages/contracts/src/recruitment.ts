import { z } from 'zod'
import { employmentTypeSchema } from './jobDescriptions.js'
import { dateOnlySchema, idSchema, instantSchema, localizedSchema } from './primitives.js'
import { cvAnalysisSchema } from './screening.js'

/**
 * Hiring, and the CV files that hang off it.
 *
 * A CV belongs either to an employee already on the books or to a candidate who
 * applied for an opening — never to both, and never to neither. The API keeps
 * that rule; the database enforces it with a constraint so no code path can
 * write a file nobody owns.
 */

export const openingStatusSchema = z.enum(['draft', 'open', 'onHold', 'closed'])
export type OpeningStatus = z.infer<typeof openingStatusSchema>

/**
 * Where an application stands, in the order HR moves through it.
 *
 * `rejected` is deliberately outside that order: it can happen at any point,
 * and treating it as the step after `offer` would be a lie about the process.
 */
export const applicationStatusSchema = z.enum([
  'new',
  'underReview',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
])
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>

/** The forward path, for rendering a pipeline. `rejected` is not on it. */
export const APPLICATION_PIPELINE = [
  'new',
  'underReview',
  'shortlisted',
  'interview',
  'offer',
  'hired',
] as const satisfies readonly ApplicationStatus[]

export const applicationSourceSchema = z.enum(['careers', 'manual', 'referral'])
export type ApplicationSource = z.infer<typeof applicationSourceSchema>

/** The two assessment formats candidates can receive. */
export const interviewQuestionTypeSchema = z.enum(['written', 'multipleChoice'])
export type InterviewQuestionType = z.infer<typeof interviewQuestionTypeSchema>

export const interviewOptionSchema = z.object({
  id: z.string().min(1).max(12),
  en: z.string().min(1).max(500),
  ar: z.string().min(1).max(500),
})
export type InterviewOption = z.infer<typeof interviewOptionSchema>

export const interviewQuestionApprovalSchema = z.enum(['pending', 'approved'])
export type InterviewQuestionApproval = z.infer<typeof interviewQuestionApprovalSchema>

/** HR chooses both the moment an assessment opens and its fixed answer window. */
export const interviewScheduleSchema = z.object({
  opensAt: instantSchema,
  durationMinutes: z.number().int().min(15).max(240),
})
export type InterviewSchedule = z.infer<typeof interviewScheduleSchema>

export const publicationPlatformSchema = z.enum(['careers', 'linkedin'])
export type PublicationPlatform = z.infer<typeof publicationPlatformSchema>

export const publicationStatusSchema = z.enum(['pending', 'published', 'failed'])
export type PublicationStatus = z.infer<typeof publicationStatusSchema>

/**
 * A URL as people actually type it.
 *
 * Nobody writes `https://` into a form field — they write
 * `linkedin.com/in/name`, which `z.url()` refuses. Rejecting a correct answer
 * because of a missing prefix the form could add itself is the application
 * failing the applicant, so the prefix is added before validating.
 */
const looseUrlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.url())

/* ---------- the uploaded file ---------- */

/**
 * What is safe to show about a stored file.
 *
 * Note what is absent: the path on disk. Where a file physically lives is the
 * server's business, and a client that never learns the path cannot ask for one
 * it was not offered. Downloads go through an id and an authorisation check.
 */
export const cvFileSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: instantSchema,
  uploadedByName: localizedSchema.nullable(),
})
export type CvFile = z.infer<typeof cvFileSchema>

/** Extensions and types accepted on upload. Anything else is refused. */
export const CV_MIME_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
} as const

export const CV_MAX_BYTES = 10 * 1024 * 1024

/* ---------- openings ---------- */

/** One platform's record of a publish attempt, as HR sees it. */
export const jobPublicationSchema = z.object({
  platform: publicationPlatformSchema,
  status: publicationStatusSchema,
  externalJobId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  publishedAt: instantSchema.nullable(),
})
export type JobPublication = z.infer<typeof jobPublicationSchema>

export const jobOpeningSchema = z.object({
  id: idSchema,
  title: localizedSchema,
  department: localizedSchema,
  location: localizedSchema,
  employmentType: employmentTypeSchema.nullable(),
  status: openingStatusSchema,
  openedOn: dateOnlySchema,
  closedOn: dateOnlySchema.nullable(),
  deadline: dateOnlySchema.nullable(),
  /** Null until the vacancy has been published at least once. */
  publicSlug: z.string().nullable(),
  publishedAt: instantSchema.nullable(),
  /** True when it is published, in date, and still `open`. */
  acceptingApplications: z.boolean(),
  /** Where it was published and how each attempt ended. Empty before the first publish. */
  publications: z.array(jobPublicationSchema),
  /** The approved description this vacancy publishes, when one is attached. */
  jobDescriptionId: idSchema.nullable(),
  /** Applications received, counted by the API. */
  applicationCount: z.number().int(),
})
export type JobOpening = z.infer<typeof jobOpeningSchema>

export const createJobOpeningSchema = z.object({
  title: localizedSchema,
  department: localizedSchema,
  openedOn: dateOnlySchema,
  location: localizedSchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  deadline: dateOnlySchema.optional(),
})
export type CreateJobOpeningInput = z.infer<typeof createJobOpeningSchema>

/**
 * `deadline` is nullable here and only optional on create.
 *
 * The difference matters: omitting it means "leave it alone", and `null` means
 * "there is no deadline any more". Without the second, a date once set could
 * never be cleared — the form would send an empty field and the API would read
 * it as no change.
 */
export const updateJobOpeningSchema = createJobOpeningSchema
  .partial()
  .extend({
    status: openingStatusSchema.optional(),
    deadline: dateOnlySchema.nullable().optional(),
  })
export type UpdateJobOpeningInput = z.infer<typeof updateJobOpeningSchema>

/* ---------- candidates ---------- */

/**
 * A candidate's name is one string, not a `Localized` pair.
 *
 * Employees carry both languages because the whole interface renders their name
 * beside app text that switches. An applicant is typed in once by whoever opens
 * the record, from whatever their CV says, and asking HR to transliterate every
 * name twice buys nothing. It is rendered inside `<bdi>` so a Latin name in an
 * Arabic table still reads correctly.
 */
export const candidateSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  education: z.string().nullable(),
  experience: z.string().nullable(),
  skills: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: instantSchema,
  cv: cvFileSchema.nullable(),
  /** How many roles this person has applied to. The reason the split exists. */
  applicationCount: z.number().int(),
})
export type Candidate = z.infer<typeof candidateSchema>

/**
 * Editing a candidate. There is no create shape any more.
 *
 * Applicants arrive through the careers page, which matches a returning one on
 * email and attaches their CV. A second way of creating the same record is a
 * second source of truth about a person, and the two drift.
 */
export const updateCandidateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    email: z.email().trim().toLowerCase(),
    phone: z.string().trim().max(40),
    education: z.string().trim().max(2000),
    experience: z.string().trim().max(4000),
    skills: z.string().trim().max(2000),
    linkedinUrl: looseUrlSchema,
    /** HR's own notes about the person, which the public form never writes. */
    notes: z.string().trim().max(2000),
  })
  .partial()
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>

/* ---------- applications ---------- */

/**
 * A candidate's application to one vacancy, flattened for the dashboard.
 *
 * It carries the person's details rather than only their id because the
 * applications table is what HR reads all day, and a row that needs a second
 * request to say who applied is a row nobody can scan.
 */
/**
 * The interview attached to an application, as HR sees it.
 *
 * The token is here, and that was a decision reversed rather than made once.
 * It was shown only at creation, on the reasoning that a list of tokens is a
 * list of credentials — which is true and was the wrong trade: an interview
 * whose link nobody kept is an interview that exists and cannot be reached, and
 * the person looking at this screen can already see the candidate's file, their
 * CV and their answers. Hiding the link from them protected nothing and broke
 * the feature.
 */
export const interviewSummarySchema = z.object({
  status: z.enum(['draft', 'sent', 'inProgress', 'completed', 'expired']),
  token: z.string(),
  questions: z.number().int().min(0),
  answered: z.number().int().min(0),
  /** Null only for interviews sent before timed scheduling was introduced. */
  opensAt: instantSchema.nullable(),
  durationMinutes: z.number().int().min(15).max(240),
  expiresAt: instantSchema,
  /**
   * The assessment, once the answers have been read.
   *
   * Null while an interview is unfinished, and also when a reading failed — the
   * two are told apart by the status beside it, not by inventing a placeholder
   * score for either.
   */
  evaluation: z
    .object({
      score: z.number().int().min(0).max(100).nullable(),
      summary: localizedSchema,
      concerns: z.array(localizedSchema),
      matches: z.array(
        z.object({
          requirement: z.string(),
          verdict: z.enum(['met', 'partial', 'notEvidenced']),
          evidence: z.string(),
          gap: z.string(),
        }),
      ),
    })
    .nullable(),
})
export type InterviewSummary = z.infer<typeof interviewSummarySchema>

export const applicationSchema = z.object({
  /** Null until HR sends one. */
  interview: interviewSummarySchema.nullable(),
  id: idSchema,
  openingId: idSchema,
  openingTitle: localizedSchema,
  candidateId: idSchema,
  candidateName: z.string(),
  candidateEmail: z.string().nullable(),
  candidatePhone: z.string().nullable(),
  status: applicationStatusSchema,
  source: applicationSourceSchema,
  coverLetter: z.string().nullable(),
  decisionNote: z.string().nullable(),
  appliedAt: instantSchema,
  updatedAt: instantSchema,
  cv: cvFileSchema.nullable(),
  /**
   * The CV read against this vacancy's requirements, when there is one.
   *
   * Null means not read — no CV, no approved description, or the file could not
   * be opened — and the screen says which. It never means "scored zero".
   */
  analysis: cvAnalysisSchema.nullable(),
})
export type Application = z.infer<typeof applicationSchema>

export const updateApplicationSchema = z.object({
  status: applicationStatusSchema.optional(),
  decisionNote: z.string().trim().max(2000).optional(),
})
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>

export const applicationFilterSchema = z.object({
  openingId: idSchema.optional(),
  candidateId: idSchema.optional(),
  status: applicationStatusSchema.optional(),
  /** Matches a name or an email, case-insensitively. */
  search: z.string().trim().max(160).optional(),
})
export type ApplicationFilter = z.infer<typeof applicationFilterSchema>

export const candidateFilterSchema = z.object({
  search: z.string().trim().max(160).optional(),
})
export type CandidateFilter = z.infer<typeof candidateFilterSchema>

/* ---------- the public careers page ---------- */

/**
 * What a visitor to the careers page is allowed to see.
 *
 * Deliberately not `JobOpening` with fields stripped at render time. This is a
 * separate shape built for people who are not signed in, so nothing internal
 * can reach them by being added to the HR type later and forgotten here — no
 * application counts, no publication errors, no author, not even the uuid.
 * The slug is the only identifier that leaves the building.
 */
export const publicJobSchema = z.object({
  slug: z.string(),
  title: localizedSchema,
  department: localizedSchema,
  location: localizedSchema,
  employmentType: employmentTypeSchema.nullable(),
  deadline: dateOnlySchema.nullable(),
  publishedAt: instantSchema,
})
export type PublicJob = z.infer<typeof publicJobSchema>

/** One vacancy in full, with the approved description attached. */
export const publicJobDetailSchema = publicJobSchema.extend({
  /** The approved `JobDescriptionContent`, or null when the vacancy has none. */
  description: z.unknown().nullable(),
})
export type PublicJobDetail = z.infer<typeof publicJobDetailSchema>

/**
 * An application arriving from the open internet.
 *
 * Every bound here is a refusal, not a preference. This endpoint takes
 * unauthenticated input from anyone who finds the URL, so the schema is the
 * first thing standing between a stranger and the database.
 */
export const submitApplicationSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.email().trim().toLowerCase().max(200),
  phone: z.string().trim().min(6).max(40).optional(),
  education: z.string().trim().max(2000).optional(),
  experience: z.string().trim().max(4000).optional(),
  skills: z.string().trim().max(2000).optional(),
  linkedinUrl: looseUrlSchema.optional(),
  coverLetter: z.string().trim().max(5000).optional(),
})
export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>

/**
 * What the careers page gets back after applying.
 *
 * A confirmation and nothing else. It does not say whether the candidate was
 * already known, or return an id — an applicant who could learn that an email
 * is already on file has been handed a way to test whether someone applied.
 */
export const applicationReceiptSchema = z.object({
  received: z.literal(true),
  jobTitle: localizedSchema,
})
export type ApplicationReceipt = z.infer<typeof applicationReceiptSchema>
