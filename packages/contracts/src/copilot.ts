import { z } from 'zod'
import { actionChoiceSchema, actionOutcomeSchema, actionProposalSchema } from './actions.js'
import { knowledgeSourceSchema } from './knowledge.js'
import { localizedSchema } from './primitives.js'
import { hrReportSchema, reportTypeSchema } from './reports.js'
import { voiceUiContextSchema } from './voice.js'

/**
 * Asking the HR system a question in plain language.
 *
 * The shape here is the security design, so it is worth stating plainly what it
 * refuses to do.
 *
 * The obvious way to build this is to let the model write a query and run it.
 * That would be wrong in a way no amount of prompting fixes: the model would
 * become the thing deciding who may see what, and a model can be talked out of
 * a rule. An employee asking "what does my manager earn" is one persuasive
 * sentence away from an answer.
 *
 * So the model never touches data. It does one job — turn a sentence into one
 * of a fixed list of questions, with its parameters — and the server does the
 * rest: checks the asker's role against that question, runs a query written by
 * hand and scoped in SQL, and renders the result. If the model picks a question
 * the asker may not ask, code refuses it. The model is not consulted about that
 * and cannot overrule it.
 *
 * What the model writes is one sentence of phrasing. Every number on the screen
 * comes from the database, never from the model's output — so a model that
 * hallucinates a figure cannot put it in front of anyone.
 */

/**
 * Every question the assistant can answer. Nothing outside this list is
 * reachable, whatever anyone types.
 *
 * Grouped by who the answer is about, because that is also who may ask it:
 * `my*` is about the asker, `team*` about a manager's own reports, and the rest
 * is company-wide and therefore HR's and an administrator's.
 */
export const copilotIntentSchema = z.enum([
  // anyone, about themselves
  'myAttendance',
  'myLeaveBalance',
  'myRequests',
  'myPayslips',
  /** Payroll Agent: controlled analysis across approved payroll sources. */
  'payrollInsights',
  /** Payroll Agent: controlled, company-wide payroll-cycle readiness. */
  'payrollReadiness',
  /** Payroll Agent: totals for one payroll run/month. */
  'payrollRunSummary',
  'payrollAuditSummary',
  'payrollFindings',
  // a manager, about their own direct reports
  'teamPresentNow',
  'teamAttendance',
  'teamOnLeave',
  'teamPendingApprovals',
  'teamRoster',
  // HR and administrators, about the organisation
  'headcount',
  'departmentBreakdown',
  /** A department-level absence comparison with a server-calculated chart. */
  'departmentAbsenceComparison',
  'orgAttendance',
  'orgLeaveSummary',
  'recruitmentSummary',
  /** Open vacancies by title, for HR recruiting work. */
  'openJobOpenings',
  /** The applicants themselves, not just how many. */
  'listApplications',
  'whoIsPresentNow',
  'attendanceRanking',
  'generateReport',
  /** The same report, about the asker. Scoped to them in code, never by the model. */
  'myReport',
  'employeeFile',
  /** Answered from a company-approved, role-scoped knowledge source. */
  'knowledge',
  /** How to use the system, as opposed to what is in it. */
  'howDoI',
  /**
   * Do something, rather than report something.
   *
   * One intent covers every action. Which action it is, and whether this person
   * may take it, is decided afterwards against the permission registry — not
   * here, and not by the model, which only gets as far as saying "this is an
   * instruction".
   */
  'doAction',
  /**
   * Hello, and nothing else yet.
   *
   * Without this, "السلام عليكم" was classified as a question about the world and
   * refused — which is technically correct and socially wrong. Someone opening
   * an assistant and saying hello is asking what it can do.
   */
  'greeting',
  // the answer to everything else
  'outOfScope',
])
export type CopilotIntent = z.infer<typeof copilotIntentSchema>

/**
 * A period, resolved by the server rather than the model.
 *
 * The model says "thisMonth"; it does not say "2026-09-01 to 2026-09-30". Dates
 * computed by a language model drift — off-by-one at month boundaries, the
 * wrong year in January — and a wrong range produces a confident answer about
 * the wrong month, which is worse than an error.
 */
/**
 * What an attendance ranking is ordered by.
 *
 * Its own field rather than three near-identical intents: the permission story
 * is the same for all three — whoever may see attendance may see it sorted —
 * and three entries in the role table that must never disagree is three chances
 * for them to.
 */
export const copilotRankBySchema = z.enum(['present', 'absent', 'late'])
export type CopilotRankBy = z.infer<typeof copilotRankBySchema>

/** The Payroll Agent may choose a view, never arbitrary SQL or a write operation. */
export const payrollTopicSchema = z.enum([
  'summary',
  'readiness',
  'adjustments',
  'overtime',
  'bonuses',
  'deductions',
  'highestNetPay',
  'lowestNetPay',
  'contracts',
  'variance',
  'findings',
])
export type PayrollTopic = z.infer<typeof payrollTopicSchema>

export const copilotPeriodSchema = z.enum([
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'lastSixMonths',
  'thisYear',
  /** A numbered calendar month; `month` and optional `year` carry its values. */
  'calendarMonth',
])
export type CopilotPeriod = z.infer<typeof copilotPeriodSchema>

export const copilotRequestSchema = z.object({
  /** Which language the answer is being read in, for anything quoted back. */
  lang: z.enum(['en', 'ar']).optional(),
  question: z.string().trim().min(2).max(500),
  /**
   * The route the person is looking at.
   *
   * Sent so help can be about the screen in front of them — "explain this page"
   * is a question that cannot be answered without it. Advisory only: nothing
   * about permissions reads this, so a client that lies about it gains nothing.
   */
  path: z.string().trim().max(200).optional(),
  /** Advisory UI context; the backend never treats it as permission evidence. */
  context: voiceUiContextSchema.optional(),
})
export type CopilotRequest = z.infer<typeof copilotRequestSchema>

/** What the model is asked to produce: which question, and its parameters. */
export const copilotPlanSchema = z.object({
  intent: copilotIntentSchema,
  period: copilotPeriodSchema.nullable(),
  /** Month number for `calendarMonth`; never a date range supplied by the model. */
  month: z.number().int().min(1).max(12).nullable(),
  /** Year for `calendarMonth`; absent means the current calendar year. */
  year: z.number().int().min(2000).max(2100).nullable(),
  /**
   * A department name the asker mentioned, as they wrote it.
   *
   * Matched against real departments by the server, case-insensitively and in
   * both languages. A name that matches nothing is reported as not found rather
   * than silently widened to the whole company.
   */
  department: z.string().nullable(),
  /** A person's name the asker mentioned. Only ever resolved within what they may see. */
  personName: z.string().nullable(),
  /**
   * An employee number the asker quoted, e.g. `EMP-1001`.
   *
   * Separate from `personName` because it is exact: a number either matches
   * somebody or it does not, and guessing at a near miss would hand over the
   * wrong person's file.
   */
  employeeNumber: z.string().nullable(),
  /** For `attendanceRanking`: what to order by. Defaults to `present`. */
  rankBy: copilotRankBySchema.nullable(),
  /** For the Payroll Agent: which fixed, read-only payroll view to run. */
  payrollTopic: payrollTopicSchema.nullable().default(null),
  /** For `generateReport`: which report. Null means the asker did not say. */
  reportType: reportTypeSchema.nullable(),
  /** Why the question cannot be answered. Only set for `outOfScope`. */
  refusalReason: z.enum(['notHrData', 'notPermitted', 'unclear']).nullable(),
})
export type CopilotPlan = z.infer<typeof copilotPlanSchema>

/* ---------- what comes back ---------- */

/** A labelled figure. The value is rendered as sent; the model never writes it. */
export const copilotStatSchema = z.object({
  label: localizedSchema,
  value: z.string(),
  /** Optional context under the figure, e.g. "of 20 days". */
  detail: localizedSchema.nullable(),
})
export type CopilotStat = z.infer<typeof copilotStatSchema>

/** One person in a list, with the one fact the question was about. */
export const copilotPersonSchema = z.object({
  name: localizedSchema,
  /**
   * Localised, not a bare string.
   *
   * The first version sent the raw status — "online", "offline" — which read as
   * an English word sitting in an otherwise Arabic list. Anything a person
   * reads goes through the same treatment as the rest of the interface.
   */
  detail: localizedSchema,
  /** Drives the dot beside the name. */
  tone: z.enum(['good', 'warning', 'bad', 'neutral']),
})
export type CopilotPerson = z.infer<typeof copilotPersonSchema>

export const copilotResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('stats'), stats: z.array(copilotStatSchema) }),
  z.object({ kind: z.literal('people'), people: z.array(copilotPersonSchema) }),
  z.object({
    kind: z.literal('table'),
    columns: z.array(localizedSchema),
    rows: z.array(z.array(z.string())),
  }),
  /** A whole document, not an answer. Rendered differently and printable. */
  z.object({ kind: z.literal('report'), report: hrReportSchema }),
  /**
   * Not an answer — a proposal awaiting a press.
   *
   * The assistant has understood an instruction and written out what it would
   * do. Nothing has happened yet, and nothing will until the person confirms.
   */
  z.object({ kind: z.literal('confirm'), proposal: actionProposalSchema }),
  /** More than one record fits. The person picks; nothing runs until they do. */
  z.object({ kind: z.literal('choose'), choice: actionChoiceSchema }),
  /** What happened after they confirmed. */
  z.object({ kind: z.literal('done'), outcome: actionOutcomeSchema }),
  /** Instructions for using the system, with the screens they happen on. */
  z.object({
    kind: z.literal('guide'),
    steps: z.array(z.object({ path: z.string().nullable(), text: localizedSchema })),
    links: z.array(z.object({ path: z.string(), label: localizedSchema })),
  }),
  /** A grounded answer from the company knowledge library, with its sources. */
  z.object({
    kind: z.literal('knowledge'),
    answer: localizedSchema,
    sources: z.array(knowledgeSourceSchema).min(1).max(3),
  }),
])
export type CopilotResult = z.infer<typeof copilotResultSchema>

export const copilotAnswerSchema = z.object({
  intent: copilotIntentSchema,
  /**
   * One sentence of context, written by the model from the data it was given.
   *
   * Deliberately separate from `result`: the sentence is prose and may be
   * imperfect, the figures are the database's and are rendered exactly. Nothing
   * numeric in the interface comes from this field.
   */
  sentence: localizedSchema,
  result: copilotResultSchema,
  /** The period the answer actually covers, for the caption under it. */
  periodLabel: localizedSchema.nullable(),
  /** Set when the question was refused, so the interface can say why plainly. */
  refusal: z.enum(['notHrData', 'notPermitted', 'unclear', 'noData']).nullable(),
  /**
   * True when a written summary is absent because the company has turned off
   * sending data to the AI provider — as opposed to absent because the model
   * failed. A blank space with no explanation reads as a bug.
   */
  sharingOff: z.boolean().default(false),
})
export type CopilotAnswer = z.infer<typeof copilotAnswerSchema>
