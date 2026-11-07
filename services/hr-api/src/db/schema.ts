import { relations, sql } from 'drizzle-orm'
import type { AiInterviewSnapshot, AiInterviewFrozenInputs, AiInterviewEffect, AiInterviewAnswerEvaluation, AiInterviewReportStorage } from '@hr/shared'
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

/**
 * Two kinds of text live here, and they are stored differently on purpose:
 *
 * - Text a *person* wrote (names, departments, announcements) is stored once per
 *   language, so it survives a language switch.
 * - Text the *app* wrote (notifications) is stored as a dictionary key plus
 *   variables, so it is translated at render time and stays correct when the
 *   reader switches language after the row was written.
 */

export const roleEnum = pgEnum('role', ['admin', 'manager', 'hr', 'employee'])
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'late',
  'absent',
  'leave',
  'holiday',
  'weekend',
])
export const leaveTypeEnum = pgEnum('leave_type', ['annual', 'sick', 'unpaid'])
export const requestKindEnum = pgEnum('request_kind', ['leave', 'certificate', 'detailsUpdate'])
export const requestStatusEnum = pgEnum('request_status', [
  'pending',
  'approved',
  'completed',
  'rejected',
  'cancelled',
])
export const documentKindEnum = pgEnum('document_kind', [
  'contract',
  'passport',
  'nationalId',
  'insuranceCard',
  'degree',
])
export const payrollStatusEnum = pgEnum('payroll_status', ['processed', 'underReview', 'onHold'])

/**
 * A payroll run's life.
 *
 * `draft` is a calculation nobody has agreed to yet, and it is the state that
 * matters: payroll is the one thing in this system that moves money, so the
 * figures are always computed and reviewed before anyone approves them. There is
 * no path that pays straight from a calculation.
 */
export const payrollRunStatusEnum = pgEnum('payroll_run_status', ['draft', 'approved', 'paid', 'cancelled'])
export const payrollAuditStatusEnum = pgEnum('payroll_audit_status', ['running', 'completed', 'failed', 'stale'])
export const payrollFindingSeverityEnum = pgEnum('payroll_finding_severity', ['critical', 'high', 'medium', 'low'])
export const payrollFindingStatusEnum = pgEnum('payroll_finding_status', ['open', 'reviewed', 'dismissed'])
export const payrollAdjustmentKindEnum = pgEnum('payroll_adjustment_kind', ['overtime', 'bonus', 'allowance', 'deduction'])
export const payrollAdjustmentStatusEnum = pgEnum('payroll_adjustment_status', ['pending', 'approved', 'rejected'])
/**
 * A vacancy's lifecycle. `draft` is the state before anyone outside the company
 * can see it — publishing is what moves it to `open`, and that transition is the
 * only way `publishedAt` and `publicSlug` get set.
 */
export const openingStatusEnum = pgEnum('opening_status', ['draft', 'open', 'onHold', 'closed'])

/**
 * Where an application stands.
 *
 * This lives on the application, not on the person. The same candidate can be
 * rejected for one role and hired into another, and a status on the candidate
 * row cannot express that — it was the first thing that had to change when
 * applications became their own table.
 */
export const applicationStatusEnum = pgEnum('application_status', [
  'new',
  'underReview',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
])

/** How an application reached us. Useful long before it is interesting. */
export const applicationSourceEnum = pgEnum('application_source', ['careers', 'manual', 'referral'])

/** Where a CV reading stands. `pending` exists because the work happens after the reply. */
export const analysisStatusEnum = pgEnum('analysis_status', ['pending', 'done', 'failed'])

/** Where a vacancy was published, and how that attempt ended. */
export const publicationPlatformEnum = pgEnum('publication_platform', ['careers', 'linkedin'])
export const publicationStatusEnum = pgEnum('publication_status', ['pending', 'published', 'failed'])

/**
 * Moved up from beside the job-description tables: `job_openings` is declared
 * before them and now carries an employment type of its own, and a `const` is
 * not usable above its own declaration.
 */
export const employmentTypeEnum = pgEnum('employment_type', ['fullTime', 'partTime', 'contract', 'temporary'])
/** Leave is not stored here — it is derived from approved requests when the calendar is read. */
export const calendarEventKindEnum = pgEnum('calendar_event_kind', ['meeting', 'training', 'holiday'])
export const announcementKindEnum = pgEnum('announcement_kind', ['general', 'holiday', 'meeting'])

/* ---------- people ---------- */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** scrypt, stored as `scrypt$N$r$p$salt$hash`. Null until the account is given a password. */
    passwordHash: text('password_hash'),
    employeeNumber: text('employee_number').notNull(),
    fullNameEn: text('full_name_en').notNull(),
    fullNameAr: text('full_name_ar').notNull(),
    jobTitleEn: text('job_title_en').notNull().default(''),
    jobTitleAr: text('job_title_ar').notNull().default(''),
    departmentEn: text('department_en').notNull().default(''),
    departmentAr: text('department_ar').notNull().default(''),
    role: roleEnum('role').notNull().default('employee'),
    // Self-reference: losing a manager must null the link, never orphan the row.
    managerId: uuid('manager_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    photoUrl: text('photo_url'),
    /**
     * When this person last opened their notifications.
     *
     * Announcements have no per-reader row — one board notice would otherwise
     * write a record for every employee — so "unread" is derived by comparing
     * an announcement's publish time against this one timestamp.
     */
    announcementsSeenAt: timestamp('announcements_seen_at', { withTimezone: true }),
    /**
     * The last authenticated request from this account.
     *
     * Written at most once a minute, not once a request — presence is worth a
     * trickle of writes, not a write amplification on every page load.
     */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /**
     * When this person finished or skipped the introductory tour.
     *
     * A timestamp rather than a flag, because "has seen it" and "saw it in
     * March, before half these screens existed" are different facts, and only
     * the second one can be acted on later.
     *
     * Null means never. Skipping counts as finished: somebody who dismissed it
     * has made a decision, and re-offering it every login would be the software
     * ignoring them.
     */
    tourCompletedAt: timestamp('tour_completed_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    joinedOn: date('joined_on').notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A functional index, not a constraint: case-insensitive, so "Nada@…" and
    // "nada@…" cannot both be registered.
    uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
    unique('users_employee_number_key').on(t.employeeNumber),
    index('users_manager_idx').on(t.managerId),
    index('users_role_idx').on(t.role),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token. A database leak does not hand over live sessions. */
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expiresAt)],
)

/* ---------- working time ---------- */

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Null is the organisation-wide default. A row with a user overrides it. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  startHour: integer('start_hour').notNull().default(8),
  startMinute: integer('start_minute').notNull().default(30),
  endHour: integer('end_hour').notNull().default(17),
  endMinute: integer('end_minute').notNull().default(30),
  graceMinutes: integer('grace_minutes').notNull().default(10),
})

export const publicHolidays = pgTable(
  'public_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    holidayDate: date('holiday_date').notNull(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
  },
  (t) => [unique('public_holidays_date_key').on(t.holidayDate)],
)

export const attendanceDays = pgTable(
  'attendance_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    /** Stamped by the server when the employee presses check in. Never client-supplied. */
    checkIn: timestamp('check_in', { withTimezone: true }),
    checkOut: timestamp('check_out', { withTimezone: true }),
    status: attendanceStatusEnum('status').notNull().default('absent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One record per employee per day — a double check-in is a constraint error, not a duplicate row.
    unique('attendance_user_date_key').on(t.userId, t.workDate),
    index('attendance_date_idx').on(t.workDate),
  ],
)

/* ---------- leave and requests ---------- */

export const leaveBalances = pgTable('leave_balances', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  annualTotal: integer('annual_total').notNull().default(20),
  annualUsed: integer('annual_used').notNull().default(0),
  sickTotal: integer('sick_total').notNull().default(10),
  sickUsed: integer('sick_used').notNull().default(0),
})

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: requestKindEnum('kind').notNull(),
    status: requestStatusEnum('status').notNull().default('pending'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decisionNote: text('decision_note'),
    reason: text('reason'),
    /* Leave-only columns; null for the other kinds. */
    leaveType: leaveTypeEnum('leave_type'),
    leaveFrom: date('leave_from'),
    leaveTo: date('leave_to'),
    /** Working days, counted on the server against weekends and public holidays. */
    leaveDays: integer('leave_days'),
  },
  (t) => [
    index('requests_user_idx').on(t.userId),
    index('requests_status_idx').on(t.status),
    index('requests_submitted_idx').on(t.submittedAt),
  ],
)

/* ---------- payroll ---------- */

export const payslips = pgTable(
  'payslips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    paidOn: date('paid_on').notNull(),
    currency: text('currency').notNull().default('JOD'),
    basic: numeric('basic', { precision: 12, scale: 2 }).notNull(),
    allowances: numeric('allowances', { precision: 12, scale: 2 }).notNull().default('0'),
    deductions: numeric('deductions', { precision: 12, scale: 2 }).notNull().default('0'),
    status: payrollStatusEnum('status').notNull().default('processed'),

    /** The run that produced it. Null for the rows that predate payroll runs. */
    runId: uuid('run_id').references((): AnyPgColumn => payrollRuns.id, { onDelete: 'cascade' }),

    /**
     * Every line, with its own name and amount.
     *
     * The three totals above are what a list needs; this is what a person needs.
     * "Deductions: 118.50" answers nothing — an employee who has lost money
     * wants to know which part was social security, which was tax, and which was
     * three days of unpaid leave, and an HR officer being asked about it needs
     * the same breakdown to answer.
     *
     * Stored rather than recomputed: rates change, and a payslip must always
     * explain itself with the numbers it was actually paid on.
     */
    lines: jsonb('lines').$type<Record<string, unknown>[]>(),

    /** Worked out from the month's attendance, and kept for the same reason. */
    workingDays: integer('working_days'),
    unpaidDays: numeric('unpaid_days', { precision: 5, scale: 2 }),

    /** What the employer paid on top, for reporting. Never deducted from anyone. */
    employerSocialSecurity: numeric('employer_social_security', { precision: 12, scale: 2 }),
  },
  (t) => [
    unique('payslips_user_month_key').on(t.userId, t.paidOn),
    index('payslips_paid_on_idx').on(t.paidOn),
  ],
)

/* ---------- documents ---------- */

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: documentKindEnum('kind').notNull(),
    issuedOn: date('issued_on').notNull(),
    expiresOn: date('expires_on'),
    fileName: text('file_name').notNull(),
    sizeKb: integer('size_kb').notNull().default(0),
  },
  (t) => [index('documents_user_idx').on(t.userId)],
)

/* ---------- interviews ---------- */

export const interviewStatusEnum = pgEnum('interview_status', [
  'draft',
  'sent',
  'inProgress',
  'completed',
  'expired',
])

/**
 * A written interview, for one applicant and one vacancy.
 *
 * Questions come from the job's own criteria and the candidate's own CV; the
 * answers are judged against those same criteria — the ones HR weighted on the
 * scorecard. There is deliberately no second scoring scheme: a "Technical
 * Knowledge: 8/10" invented for the occasion is a number with nothing behind
 * it, which is the thing the weighted scorecard exists to replace.
 */
export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' })
      .unique(),
    status: interviewStatusEnum('status').notNull().default('draft'),

    /**
     * The candidate's way in.
     *
     * There is no account behind it, so this is the whole of the access
     * control: long, random, checked against one interview, and expiring. It is
     * never a session and grants nothing but this one page.
     */
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** When the candidate may first see the questions. Null keeps legacy links usable. */
    opensAt: timestamp('opens_at', { withTimezone: true }),
    /** The fixed window HR gives the candidate once the exam opens. */
    durationMinutes: integer('duration_minutes').notNull().default(60),

    /**
     * The criteria as they stood when the interview was created.
     *
     * Copied rather than looked up later. A job description can be edited after
     * somebody has answered, and an assessment that silently re-reads today's
     * requirements is not the assessment they sat.
     */
    criteria: jsonb('criteria').$type<Record<string, unknown>[]>().notNull(),
    evaluation: jsonb('evaluation').$type<Record<string, unknown>>(),

    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('interviews_application_idx').on(t.applicationId)],
)

export const interviewQuestions = pgTable(
  'interview_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    interviewId: uuid('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    textEn: text('text_en').notNull(),
    textAr: text('text_ar').notNull(),
    /** Written responses and single-select questions are intentionally explicit. */
    questionType: text('question_type').notNull().default('written'),
    /** Four bilingual choices for a single-select question; empty for written questions. */
    options: jsonb('options').$type<{ id: string; en: string; ar: string }[]>().notNull().default([]),
    /** Kept server-side only; it must never reach the candidate's browser. */
    correctOptionId: text('correct_option_id'),
    /** Which requirement this probes, so the answer scores on the same rubric as the CV. */
    criterionKey: text('criterion_key'),
    /** Every generated question remains internal until an HR reviewer approves it. */
    approvalStatus: text('approval_status').notNull().default('pending'),
    reviewFeedback: text('review_feedback'),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Set when this was written in response to an answer rather than generated up front. */
    followUpTo: uuid('follow_up_to').references((): AnyPgColumn => interviewQuestions.id, {
      onDelete: 'cascade',
    }),
    askedAt: timestamp('asked_at', { withTimezone: true }),
  },
  (t) => [
    index('interview_questions_interview_idx').on(t.interviewId),
    unique('interview_questions_order').on(t.interviewId, t.ordinal),
  ],
)

export const interviewAnswers = pgTable('interview_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .unique()
    .references(() => interviewQuestions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ---------- recruitment ---------- */

export const jobOpenings = pgTable(
  'job_openings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titleEn: text('title_en').notNull(),
    titleAr: text('title_ar').notNull(),
    departmentEn: text('department_en').notNull(),
    departmentAr: text('department_ar').notNull(),
    status: openingStatusEnum('status').notNull().default('draft'),
    openedOn: date('opened_on').notNull(),
    closedOn: date('closed_on'),

    /* ---- what a public job page has to show ---- */
    locationEn: text('location_en').notNull().default(''),
    locationAr: text('location_ar').notNull().default(''),
    employmentType: employmentTypeEnum('employment_type'),
    /** Past this date the vacancy stops accepting applications. Null means open-ended. */
    deadline: date('deadline'),

    /**
     * The public address, e.g. `/careers/jobs/senior-backend-engineer-4f2a`.
     *
     * A slug rather than the uuid because this URL gets pasted into LinkedIn
     * posts and emails, where `?id=8c1f…` reads like something to distrust. It
     * is written once, when the vacancy is first published, and never
     * regenerated — a link that has been shared has to keep working even after
     * someone renames the job.
     */
    publicSlug: text('public_slug').unique(),
    /** Null until the first publish. Set once; re-publishing does not move it. */
    publishedAt: timestamp('published_at', { withTimezone: true }),

    /** Kept when the account that opened it is removed — the role outlives the person. */
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('job_openings_status_idx').on(t.status), index('job_openings_slug_idx').on(t.publicSlug)],
)

/**
 * Where a vacancy was published and what happened.
 *
 * One row per platform per attempt, because "published" is not one fact: the
 * careers page can be live while LinkedIn refused, and HR needs to see which is
 * which rather than a single flag that averages them into a lie.
 */
export const jobPublications = pgTable(
  'job_publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    openingId: uuid('opening_id')
      .notNull()
      .references((): AnyPgColumn => jobOpenings.id, { onDelete: 'cascade' }),
    platform: publicationPlatformEnum('platform').notNull(),
    status: publicationStatusEnum('status').notNull().default('pending'),
    /** The id the other side gave us, when there is one. Null for our own careers page. */
    externalJobId: text('external_job_id'),
    /** What to show HR when it failed — a short reason, never a raw API dump. */
    errorMessage: text('error_message'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('job_publications_opening_idx').on(t.openingId),
    unique('job_publications_one_per_platform').on(t.openingId, t.platform),
  ],
)

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** One string: an applicant is not a system user — see the shared contract. */
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),

    /**
     * What the person told us about themselves, as they wrote it.
     *
     * Free text rather than parsed structure: a CV is not a form, and every
     * attempt to make applicants fit fixed fields loses the detail that made
     * them worth reading. HR reads these; nothing computes on them.
     */
    education: text('education'),
    experience: text('experience'),
    skills: text('skills'),
    linkedinUrl: text('linkedin_url'),

    /** HR's own notes about the person, across every role they applied to. */
    notes: text('notes'),
    /** Null when the person applied through the careers page — nobody entered them. */
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One person, one record — matched on email, which is how a returning
     * applicant is recognised instead of being duplicated.
     *
     * Partial, because email is optional: a candidate HR typed in from a paper
     * CV may have no address, and several of those must still be allowed.
     */
    uniqueIndex('candidates_email_key').on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),
  ],
)

/**
 * One person applying to one vacancy.
 *
 * This table is the whole reason the recruitment model was reshaped. Before it,
 * a candidate row *was* an application — it carried `opening_id` and a stage —
 * which made a second application by the same person a second person. Their
 * history vanished, and "have we seen this applicant before?" had no answer.
 *
 * Now the person is durable and the application is the event. Status lives here
 * because it belongs to the pairing, not to either side: rejected for one role
 * and hired into another is an ordinary outcome, not a contradiction.
 */
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    openingId: uuid('opening_id')
      .notNull()
      .references((): AnyPgColumn => jobOpenings.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references((): AnyPgColumn => candidates.id, { onDelete: 'cascade' }),
    status: applicationStatusEnum('status').notNull().default('new'),
    source: applicationSourceEnum('source').notNull().default('careers'),
    coverLetter: text('cover_letter'),
    /** Why HR moved it to where it is. Written on the decision, not after it. */
    decisionNote: text('decision_note'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('applications_opening_idx').on(t.openingId),
    index('applications_candidate_idx').on(t.candidateId),
    index('applications_status_idx').on(t.status),
    /** Applying twice to the same job is a double-click, not a second application. */
    unique('applications_one_per_opening').on(t.openingId, t.candidateId),
  ],
)

/**
 * An uploaded CV.
 *
 * `storedPath` is where the bytes live under the uploads root and is never sent
 * to a client — a download names the row, and the server resolves the path after
 * it has checked who is asking.
 *
 * The check constraint is the real guarantee that a file has exactly one owner:
 * validation in a route can be forgotten by the next route, a constraint cannot.
 */
export const cvFiles = pgTable(
  'cv_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id').references((): AnyPgColumn => candidates.id, { onDelete: 'cascade' }),
    /** The name as uploaded, for display and for the download filename. */
    fileName: text('file_name').notNull(),
    /**
     * Where the bytes were written on disk, for files stored before they moved
     * into the database. Kept so those rows still resolve; new uploads leave it
     * empty and put the bytes in `content` instead.
     */
    storedPath: text('stored_path').notNull().default(''),
    /**
     * The file itself.
     *
     * On disk originally, which is correct on a machine with a disk and wrong
     * on the free hosting this is going to. Those instances restart whenever
     * they have been idle for a quarter of an hour and come back with an empty
     * filesystem — so a CV uploaded on Monday would simply be gone on Tuesday,
     * silently, with the row still there pointing at nothing.
     *
     * Postgres keeps them instead. At a ten-megabyte ceiling and a few hundred
     * applicants this costs nothing and removes a whole class of failure. It is
     * the wrong answer at tens of thousands of files — that is when this column
     * becomes a key into object storage — but it is the right one now, and the
     * read path already goes through one function either way.
     */
    content: customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })('content'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: uuid('uploaded_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cv_files_user_idx').on(t.userId),
    index('cv_files_candidate_idx').on(t.candidateId),
    check('cv_files_one_owner', sql`(${t.userId} IS NULL) <> (${t.candidateId} IS NULL)`),
  ],
)

/* ---------- job descriptions ---------- */

export const jobDescriptionStatusEnum = pgEnum('job_description_status', ['draft', 'approved', 'archived'])
export const jobLevelEnum = pgEnum('job_level', ['intern', 'junior', 'mid', 'senior', 'lead', 'manager'])

/**
 * A job description, drafted with a model and owned by a person.
 *
 * The sections live in one `content` column rather than twenty text columns.
 * They are a document with nested bilingual lists, validated by the shared zod
 * schema on the way in and on the way out, and the set of sections is expected
 * to grow — columns would mean a migration for each one. Title and department
 * are also kept as plain columns because the library lists and filters on them,
 * and reaching into JSON for that is slower for no benefit.
 */
export const jobDescriptions = pgTable(
  'job_descriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: jobDescriptionStatusEnum('status').notNull().default('draft'),

    titleEn: text('title_en').notNull(),
    titleAr: text('title_ar').notNull(),
    departmentEn: text('department_en').notNull().default(''),
    departmentAr: text('department_ar').notNull().default(''),
    level: jobLevelEnum('level'),
    employmentType: employmentTypeEnum('employment_type'),

    /** The full structured document. Shape enforced by `jobDescriptionContentSchema`. */
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),

    /**
     * What each requirement is worth when a CV is scored against this role.
     *
     * Weights only, keyed by the requirement's wording. The criteria themselves
     * are derived from `content` every time, so editing the document cannot
     * leave a scorecard weighing something it no longer asks for. Null means
     * nobody has set any, and the defaults per kind apply.
     */
    scorecard: jsonb('scorecard').$type<Record<string, unknown>>(),

    /** Null keeps it in the library, unattached to any vacancy. */
    openingId: uuid('opening_id').references((): AnyPgColumn => jobOpenings.id, { onDelete: 'set null' }),

    /**
     * Provenance, so the difference between "a model wrote this" and "a person
     * stands behind this" is a fact in the row rather than an assumption.
     */
    model: text('model'),
    promptVersion: text('prompt_version'),
    generatedBy: uuid('generated_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    /** Set the first time a human changes any of it. Never cleared. */
    editedByHuman: boolean('edited_by_human').notNull().default(false),
    approvedBy: uuid('approved_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    /**
     * The document as a point in meaning-space, for finding the nearest
     * previous descriptions when a new one is written.
     *
     * Null until embedded: a row can be written without one, and the backfill
     * fills it in. Retrieval simply skips rows that have none rather than
     * failing, so an embedding outage degrades quality, never availability.
     */
    embedding: vector('embedding', { dimensions: 1536 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('job_descriptions_status_idx').on(t.status),
    // HNSW over cosine distance: the corpus is small now and will not stay
    // small, and rebuilding an index later is more disruptive than having one.
    index('job_descriptions_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('job_descriptions_opening_idx').on(t.openingId),
  ],
)

/**
 * Every call made to the model, kept whether it succeeded or not.
 *
 * Written for three reasons that all turn out to need the same row: an audit
 * trail for a document a candidate will act on, a bill nobody can explain
 * without token counts, and a way to answer "why did it write that" months
 * later. The prompt inputs are stored; the generated content is not duplicated
 * here — it is on the description itself.
 */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    jobDescriptionId: uuid('job_description_id').references((): AnyPgColumn => jobDescriptions.id, {
      onDelete: 'cascade',
    }),
    requestedBy: uuid('requested_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    /** What HR asked for. Not the rendered prompt — the inputs it was built from. */
    input: jsonb('input').$type<Record<string, unknown>>(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms'),
    ok: boolean('ok').notNull(),
    /** A short code on failure — never a raw provider message. */
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_generations_created_idx').on(t.createdAt)],
)

/* ---------- assistant knowledge base ---------- */

/**
 * A company-owned source that may answer a question in the assistant.
 *
 * The original upload is intentionally not retained here. The assistant needs
 * searchable text, and keeping the text alone means a file cannot later be
 * downloaded by mistake from an unrelated screen. The source name remains so
 * an answer can say where it came from.
 */
export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    sourceFileName: text('source_file_name'),
    sourceType: text('source_type').notNull(),
    /** Roles that may use this source in an assistant answer. */
    visibleTo: text('visible_to')
      .array()
      .notNull()
      .default(sql`ARRAY['admin', 'hr', 'manager', 'employee']::text[]`),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('knowledge_documents_visible_to_idx').using('gin', t.visibleTo)],
)

/**
 * Documents are split before embedding. Searching short passages is more
 * precise than embedding a whole policy and avoids handing an AI provider an
 * entire handbook for a one-line answer.
 */
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('knowledge_chunks_document_ordinal_idx').on(t.documentId, t.ordinal),
    index('knowledge_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
)

/* ---------- feed ---------- */

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A dictionary key, translated when it is rendered rather than when it is written. */
    messageKey: text('message_key').notNull(),
    messageVars: jsonb('message_vars').$type<Record<string, string | number>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
)

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titleEn: text('title_en').notNull(),
    titleAr: text('title_ar').notNull(),
    detailEn: text('detail_en').notNull(),
    detailAr: text('detail_ar').notNull(),
    kind: announcementKindEnum('kind').notNull().default('general'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Null reaches everyone, which is now every new row: posting is HR's and the
     * administrator's, and both address the whole company. The column stays for
     * the team posts already in the table, which are still read correctly.
     */
    teamOfId: uuid('team_of_id').references(() => users.id, { onDelete: 'cascade' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null means it stays up until withdrawn; otherwise the moment it lapses. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('announcements_published_idx').on(t.publishedAt)],
)

/* ---------- calendar ---------- */

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: calendarEventKindEnum('kind').notNull().default('meeting'),
    titleEn: text('title_en').notNull(),
    titleAr: text('title_ar').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Spans whole days, so the clock time carries no meaning. */
    allDay: boolean('all_day').notNull().default(false),
    location: text('location'),
    /** Null reaches everyone; set means only that manager's direct reports. */
    teamOfId: uuid('team_of_id').references(() => users.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('calendar_starts_idx').on(t.startsAt), index('calendar_team_idx').on(t.teamOfId)],
)

/* ---------- relations ---------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, { fields: [users.managerId], references: [users.id], relationName: 'reports' }),
  reports: many(users, { relationName: 'reports' }),
  attendance: many(attendanceDays),
  requests: many(requests),
  payslips: many(payslips),
  documents: many(documents),
  notifications: many(notifications),
  leaveBalance: one(leaveBalances),
}))

export const attendanceRelations = relations(attendanceDays, ({ one }) => ({
  user: one(users, { fields: [attendanceDays.userId], references: [users.id] }),
}))

export const requestsRelations = relations(requests, ({ one }) => ({
  user: one(users, { fields: [requests.userId], references: [users.id] }),
  decider: one(users, { fields: [requests.decidedBy], references: [users.id] }),
}))

export const payslipsRelations = relations(payslips, ({ one }) => ({
  user: one(users, { fields: [payslips.userId], references: [users.id] }),
}))

export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

export const announcementsRelations = relations(announcements, ({ one }) => ({
  author: one(users, { fields: [announcements.authorId], references: [users.id] }),
}))

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  user: one(users, { fields: [leaveBalances.userId], references: [users.id] }),
}))

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  author: one(users, { fields: [calendarEvents.createdBy], references: [users.id] }),
}))

/**
 * One reading of one CV against one vacancy.
 *
 * Kept as a row rather than computed on demand, because a score that changes
 * when you refresh the page is a score nobody can act on — and because "what
 * did the system say about this applicant, and which prompt said it" is a
 * question that gets asked months later, by someone who was not there.
 *
 * `content` holds the full working: every requirement, its verdict, and the
 * line of the CV behind it. The percentage on the screen is one field of it,
 * never the whole record.
 */
export const cvAnalyses = pgTable(
  'cv_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references((): AnyPgColumn => applications.id, { onDelete: 'cascade' }),
    /** The exact file that was read. A replaced CV gets its own analysis. */
    cvFileId: uuid('cv_file_id').references((): AnyPgColumn => cvFiles.id, { onDelete: 'set null' }),

    status: analysisStatusEnum('status').notNull().default('pending'),
    /** The structured result. Shape enforced by `cvAnalysisContentSchema`. */
    content: jsonb('content').$type<Record<string, unknown>>(),
    /** Why it could not be produced — a code, never a provider message. */
    failure: text('failure'),

    model: text('model'),
    promptVersion: text('prompt_version'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms'),
    /** How much of the CV was actually readable, for explaining a low score. */
    cvCharacters: integer('cv_characters'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cv_analyses_application_idx').on(t.applicationId),
    /** One current analysis per application; a re-run replaces it. */
    unique('cv_analyses_one_per_application').on(t.applicationId),
  ],
)

/**
 * What a person is contracted to be paid.
 *
 * Separate from the payslip, because they answer different questions: this is
 * the agreement, a payslip is what happened in one month. Changing a salary must
 * not rewrite history, and recalculating March must not need today's contract.
 *
 * Amounts are `numeric`, never floating point. Money in a float is money that
 * is occasionally a hundredth of a dinar wrong, and payroll is the one place
 * where that is noticed, by everybody, every month.
 */
export const salaryStructures = pgTable(
  'salary_structures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),

    basic: numeric('basic', { precision: 12, scale: 2 }).notNull(),
    /**
     * Named allowances, not one total.
     *
     * Their names are on the payslip and some of them are treated differently
     * by social security and tax, so a single "allowances" figure cannot be
     * calculated from — it can only be displayed.
     */
    transport: numeric('transport', { precision: 12, scale: 2 }).notNull().default('0'),
    housing: numeric('housing', { precision: 12, scale: 2 }).notNull().default('0'),
    other: numeric('other', { precision: 12, scale: 2 }).notNull().default('0'),

    currency: text('currency').notNull().default('JOD'),
    /**
     * From when this agreement applies. A raise is a new row, not an edit —
     * so a payslip from before it still recalculates to what was actually paid.
     */
    effectiveFrom: date('effective_from').notNull(),
    /** Null while it is the current one. */
    effectiveTo: date('effective_to'),

    /** Some people are outside the scheme — expatriates on certain contracts. */
    socialSecurityExempt: boolean('social_security_exempt').notNull().default(false),
    /** Dependants claimed, which the tax exemption depends on. */
    dependants: integer('dependants').notNull().default(0),

    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('salary_structures_user_idx').on(t.userId),
    index('salary_structures_from_idx').on(t.effectiveFrom),
  ],
)

/**
 * The rates payroll is calculated with.
 *
 * In a table rather than in the code, and this is the most important decision in
 * this feature. Jordan's social security rates, its contribution ceiling and its
 * income tax brackets are set by law and they change. A rate compiled into a
 * build is a rate that is wrong the month after it changes, silently, on every
 * payslip — and nobody discovers it from the software.
 *
 * Here, the company's accountant sets them, the row is dated, and every payslip
 * records which row it used. When a rate changes, a new row is added and old
 * payslips still explain themselves.
 *
 * The seeded values are a starting point and are marked as unconfirmed until
 * somebody who knows has said so.
 */
export const payrollSettings = pgTable('payroll_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  effectiveFrom: date('effective_from').notNull(),

  /** The employee's share, as a percentage of the contribution base. */
  socialSecurityEmployeeRate: numeric('ss_employee_rate', { precision: 6, scale: 4 }).notNull(),
  /** The employer's share. Not deducted from anyone, but it is a real cost to report. */
  socialSecurityEmployerRate: numeric('ss_employer_rate', { precision: 6, scale: 4 }).notNull(),
  /** Monthly earnings above this are not contributed on. */
  socialSecurityCeiling: numeric('ss_ceiling', { precision: 12, scale: 2 }).notNull(),

  /** Annual personal exemption, before tax applies. */
  taxPersonalExemption: numeric('tax_personal_exemption', { precision: 12, scale: 2 }).notNull(),
  /** Additional annual exemption per dependant. */
  taxDependantExemption: numeric('tax_dependant_exemption', { precision: 12, scale: 2 }).notNull(),
  /**
   * The progressive bands, as `[{ upTo: number | null, rate: number }]`.
   * `upTo: null` is the top band. Validated by `taxBandsSchema` on the way in.
   */
  taxBands: jsonb('tax_bands').$type<Record<string, unknown>[]>().notNull(),

  /**
   * False until the company's accountant has confirmed these against the law.
   * Every payslip calculated with an unconfirmed row says so on its face.
   */
  confirmed: boolean('confirmed').notNull().default(false),
  note: text('note'),

  createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One month's payroll, as a thing that is run, reviewed and approved.
 *
 * The run exists so that "March was paid" is a fact with a date and a name on
 * it, rather than a property inferred from a pile of payslips. It is also what
 * makes recalculation safe: a draft run can be thrown away and computed again;
 * an approved one cannot be touched.
 */
export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    status: payrollRunStatusEnum('status').notNull().default('draft'),

    /** The rates this run was calculated with, so it can always be explained. */
    settingsId: uuid('settings_id').references((): AnyPgColumn => payrollSettings.id, { onDelete: 'restrict' }),

    calculatedBy: uuid('calculated_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    paidOn: date('paid_on'),

    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('payroll_runs_period_key').on(t.periodYear, t.periodMonth)],
)

/**
 * A controlled one-off input to payroll.  Overtime, bonuses and deductions
 * cannot arrive as an untraceable number in a spreadsheet: each has an author,
 * a date and an approval state before it can affect a payslip.
 */
export const payrollAdjustments = pgTable(
  'payroll_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: payrollAdjustmentKindEnum('kind').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    effectiveOn: date('effective_on').notNull(),
    note: text('note').notNull(),
    status: payrollAdjustmentStatusEnum('status').notNull().default('pending'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (t) => [
    index('payroll_adjustments_user_date_idx').on(t.userId, t.effectiveOn),
    index('payroll_adjustments_status_idx').on(t.status),
  ],
)

/**
 * A dated audit configuration.  There is one company in the current data
 * model, so this is global by design; if tenancy is added it must gain the same
 * tenant key as every payroll source before data is shared between companies.
 */
export const payrollAuditSettings = pgTable('payroll_audit_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  effectiveFrom: date('effective_from').notNull(),
  salaryChangePercent: numeric('salary_change_percent', { precision: 6, scale: 4 }).notNull().default('0.25'),
  deductionChangePercent: numeric('deduction_change_percent', { precision: 6, scale: 4 }).notNull().default('0.35'),
  overtimeMonthlyThreshold: numeric('overtime_monthly_threshold', { precision: 12, scale: 2 }).notNull().default('250.00'),
  minHistoryMonths: integer('min_history_months').notNull().default(4),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A new row is written for every analysis; older runs remain explainable. */
export const payrollAudits = pgTable(
  'payroll_audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
    /** The calculation timestamp the audit inspected. */
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    status: payrollAuditStatusEnum('status').notNull().default('running'),
    settingsSnapshot: jsonb('settings_snapshot').$type<Record<string, unknown>>().notNull(),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failure: text('failure'),
  },
  (t) => [
    index('payroll_audits_run_started_idx').on(t.runId, t.startedAt),
    index('payroll_audits_status_idx').on(t.status),
  ],
)

/** A finding is evidence plus workflow state, never a change to a payslip. */
export const payrollFindings = pgTable(
  'payroll_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id').notNull().references(() => payrollAudits.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    severity: payrollFindingSeverityEnum('severity').notNull(),
    status: payrollFindingStatusEnum('status').notNull().default('open'),
    facts: jsonb('facts').$type<Record<string, unknown>>().notNull(),
    explanation: jsonb('explanation').$type<{ en: string; ar: string }>().notNull(),
    aiExplanation: jsonb('ai_explanation').$type<{ en: string; ar: string }>(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payroll_findings_audit_idx').on(t.auditId),
    index('payroll_findings_open_severity_idx').on(t.status, t.severity),
    index('payroll_findings_user_idx').on(t.userId),
  ],
)

/** Compact append-only record, intentionally without payroll amounts or prompts. */
export const payrollAuditEvents = pgTable(
  'payroll_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').references(() => payrollRuns.id, { onDelete: 'set null' }),
    auditId: uuid('audit_id').references(() => payrollAudits.id, { onDelete: 'set null' }),
    findingId: uuid('finding_id').references(() => payrollFindings.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    status: text('status').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payroll_audit_events_run_created_idx').on(t.runId, t.createdAt)],
)

/**
 * What the assistant has been asked, and how it was routed.
 *
 * The system does not train on this and must not. Employee data going into a
 * training process cannot be taken back out, and a model taught from past
 * decisions learns the biases in them along with the rules — the same argument
 * that keeps CV screening comparing a document to a list rather than to people
 * who were hired before.
 *
 * What it does instead is remember the *routing*: this exact sentence, from
 * this role, was understood as this intent, and a human accepted the result.
 * Two things fall out of that.
 *
 *  1. **It becomes deterministic.** Classification at temperature zero is
 *     nearly stable, not stable: the same instruction has been observed to
 *     resolve and then not resolve a minute later. A remembered routing settles
 *     it, so a sentence that worked once keeps working.
 *
 *  2. **The failures become a list.** Every refusal recorded here is somebody
 *     who wanted something and did not get it, in their own words. That is a
 *     better account of what to build next than anyone's guess.
 *
 * Only the sentence and the routing are kept. No answer, no figures, no names
 * that came back from a query — the question "how much do I earn" is stored;
 * what it returned is not.
 */
export const assistantMemory = pgTable(
  'assistant_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The sentence, trimmed and lowercased, which is what it is matched on. */
    normalised: text('normalised').notNull(),
    /**
     * Role is part of the key, not a detail.
     *
     * The model is shown a different list of possibilities per role, so the
     * same words legitimately route differently for a manager and for HR. One
     * shared memory would teach one of them the other's answer.
     */
    role: roleEnum('role').notNull(),

    /** `question` or `instruction`. */
    kind: text('kind').notNull(),
    /** The intent, for a question. */
    intent: text('intent'),
    /**
     * The action, for an instruction \u2014 and only the action.
     *
     * Never the parameters. "Leave tomorrow" meant one pair of dates when it
     * was said and means another today; remembering them would file last
     * week's request. The routing is stable, the specifics are not, so the
     * specifics are worked out fresh every time.
     */
    action: text('action'),

    /** Times a person saw the result and accepted it. */
    acceptedCount: integer('accepted_count').notNull().default(0),
    /**
     * Times a person saw the proposal and backed out.
     *
     * A rejection is the clearest signal available that the routing was wrong,
     * and one of them is enough to stop this memory being reused. Learning
     * from something a human declined is learning the opposite of what they
     * told you.
     */
    rejectedCount: integer('rejected_count').notNull().default(0),
    /** Times it was refused \u2014 unclear, not found, not permitted. */
    refusedCount: integer('refused_count').notNull().default(0),
    /** Why, the last time it was refused. Read to decide what to build. */
    lastRefusal: text('last_refusal'),

    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assistant_memory_key_idx').on(t.normalised, t.role),
    index('assistant_memory_refused_idx').on(t.refusedCount),
  ],
)

/**
 * An append-only account of what the assistant attempted and how the backend
 * decided it.  This is deliberately separate from assistant memory: memory
 * improves phrasing and is grouped by sentence, while this table answers who
 * did what, when, and whether the security gate allowed it.
 *
 * No chat text, employee names, parameters, records, or generated answers are
 * stored here.  The event is enough to investigate an access decision without
 * turning the audit log into another source of sensitive HR data.
 */
export const assistantAuditEvents = pgTable(
  'assistant_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    role: roleEnum('role').notNull(),
    /** question, policy, help, report, navigation, or action */
    eventType: text('event_type').notNull(),
    /** The closed intent chosen by the server, when there is one. */
    intent: text('intent'),
    /** The closed action/tool chosen by the server, when there is one. */
    tool: text('tool'),
    /** answered, proposed, executed, denied, out_of_scope, invalid, declined, or failed */
    status: text('status').notNull(),
    /** A short system code such as notPermitted; never user-supplied text. */
    reason: text('reason'),
    /** Whether the signed-in person used the text panel or Voice Mode. */
    channel: text('channel').notNull().default('text'),
    /** Ephemeral app voice-session id; no provider id and never audio. */
    voiceSessionId: uuid('voice_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assistant_audit_user_created_idx').on(t.userId, t.createdAt),
    index('assistant_audit_created_idx').on(t.createdAt),
    index('assistant_audit_status_idx').on(t.status),
    index('assistant_audit_voice_session_idx').on(t.voiceSessionId, t.createdAt),
  ],
)

/**
 * Durable completion state for a confirmed assistant action.
 *
 * This is intentionally compact: it holds no question, transcript, person
 * name, or action parameters. The user-bound operation id prevents a retried
 * voice confirmation from issuing the same protected request twice after a
 * process restart.
 */
export const assistantActionExecutions = pgTable(
  'assistant_action_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    operationId: uuid('operation_id').notNull(),
    action: text('action').notNull(),
    /** processing is deliberately retained if completion is uncertain. */
    status: text('status').notNull().default('processing'),
    outcome: jsonb('outcome').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('assistant_action_execution_user_operation_idx').on(t.userId, t.operationId),
    index('assistant_action_execution_status_idx').on(t.status, t.createdAt),
  ],
)

/**
 * Original questions that the assistant did not answer.
 *
 * This is a deliberate HR/Admin improvement inbox, separate from the compact
 * audit trail above. It keeps the wording exactly as the signed-in person sent
 * it, together with the controlled refusal reason, so the team can decide what
 * knowledge or capability should be added next.
 */
export const assistantUnansweredQuestions = pgTable(
  'assistant_unanswered_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    role: roleEnum('role').notNull(),
    question: text('question').notNull(),
    intent: text('intent'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assistant_unanswered_created_idx').on(t.createdAt),
    index('assistant_unanswered_reason_idx').on(t.reason),
  ],
)

/** AI interviews are independent of the existing written-interview aggregate. */
export const aiInterviews = pgTable('ai_interviews', {
  id: uuid('id').primaryKey(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  attempt: integer('attempt').notNull(),
  version: integer('version').notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  /** Authoritative domain state; version is a constraint-checked query projection. */
  snapshot: jsonb('snapshot').$type<AiInterviewSnapshot>().notNull(),
  proposedRubric: jsonb('proposed_rubric').$type<AiInterviewFrozenInputs['rubric']>().notNull(),
  frozenInputs: jsonb('frozen_inputs').$type<AiInterviewFrozenInputs>(),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  consent: jsonb('consent').$type<{ acceptedAt: number; policyVersion: string }>(),
  inviteTokenHash: text('invite_token_hash'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  inviteRevokedAt: timestamp('invite_revoked_at', { withTimezone: true }),
  inviteConsumedAt: timestamp('invite_consumed_at', { withTimezone: true }),
  candidateSessionHash: text('candidate_session_hash'),
  candidateSessionExpiresAt: timestamp('candidate_session_expires_at', { withTimezone: true }),
  candidateSessionVersion: integer('candidate_session_version').notNull().default(0),
  runtimeOwner: text('runtime_owner').notNull(),
  lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull(),
  pauseReason: text('pause_reason'),
  pendingEffects: jsonb('pending_effects').$type<AiInterviewEffect[]>().notNull().default([]),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('ai_interviews_application_attempt').on(t.applicationId, t.attempt),
  uniqueIndex('ai_interviews_one_open_attempt').on(t.applicationId).where(sql`${t.snapshot}->>'status' IN ('CREATED','READY','ACTIVE','PAUSED')`),
  uniqueIndex('ai_interviews_invite_hash').on(t.inviteTokenHash),
  uniqueIndex('ai_interviews_session_hash').on(t.candidateSessionHash),
  check('ai_interviews_version_matches_snapshot', sql`${t.version} = (${t.snapshot}->>'version')::integer`),
  check('ai_interviews_valid_counters', sql`${t.version} >= 0 AND ${t.lastSequence} >= 0 AND ${t.attempt} > 0`),
])

export const aiInterviewEvents = pgTable('ai_interview_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  interviewId: uuid('interview_id').notNull().references(() => aiInterviews.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  recordType: text('record_type').notNull(),
  eventType: text('event_type').notNull(),
  eventId: text('event_id').notNull(),
  commandId: text('command_id').notNull(),
  stateVersion: integer('state_version').notNull(),
  source: text('source').notNull(),
  actorId: text('actor_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, t => [
  unique('ai_interview_events_sequence').on(t.interviewId, t.sequence),
  unique('ai_interview_events_event_id').on(t.interviewId, t.eventId),
  uniqueIndex('ai_interview_events_command_receipt').on(t.interviewId, t.commandId).where(sql`${t.recordType} = 'COMMAND'`),
  check('ai_interview_events_record_type', sql`${t.recordType} IN ('DOMAIN','COMMAND','AUDIT')`),
])

export const aiInterviewEvaluations = pgTable('ai_interview_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  interviewId: uuid('interview_id').notNull().references(() => aiInterviews.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  reportVersion: integer('report_version').notNull(),
  lastIncludedSequence: integer('last_included_sequence').notNull(),
  inputHash: text('input_hash').notNull(),
  evaluatorVersion: text('evaluator_version').notNull(),
  rubricVersion: text('rubric_version').notNull(),
  results: jsonb('results').$type<AiInterviewAnswerEvaluation[] | AiInterviewReportStorage>(),
  coverage: jsonb('coverage').$type<{ assessedTurns: number; totalTurns: number }>(),
  failureCode: text('failure_code'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [
  unique('ai_interview_evaluations_version').on(t.interviewId, t.reportVersion),
  check('ai_interview_evaluations_status', sql`${t.status} IN ('PENDING','RUNNING','COMPLETED','FAILED')`),
])
