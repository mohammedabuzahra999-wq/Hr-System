import { z } from 'zod'
import { idSchema, localizedSchema } from './primitives.js'
import { payrollAdjustmentKindSchema } from './payroll.js'
import { navigationPageIdSchema } from './navigation.js'
import { jobDescriptionSectionSchema } from './jobDescriptions.js'

/**
 * Things the assistant can do, as opposed to things it can report.
 *
 * The read side of this assistant can afford to be wrong: it picks from a fixed
 * list of questions, the role gate refuses the ones this person may not ask, and
 * the worst a misclassification produces is a different figure they were already
 * allowed to see. Nothing changes.
 *
 * Writing removes that margin. A question routed to the wrong intent shows the
 * wrong number; an instruction routed to the wrong action approves the wrong
 * leave, resets the wrong password, publishes a vacancy that was not ready. So
 * the same closed-list architecture carries two additions:
 *
 *  1. Every action names a capability from the server's permission registry.
 *     There is no separate list of who may do what — the assistant is gated by
 *     exactly the rules the routes are gated by, and a change to those rules
 *     changes both at once.
 *  2. Nothing runs until the person has seen it written out and confirmed. The
 *     model proposes; the human commits. That step is the difference between an
 *     assistant that misunderstood and an assistant that did damage.
 *
 * The confirmation is a safeguard for the user, not a security boundary. The
 * server re-checks the role, the ownership and the state of the record when the
 * confirmation arrives, so a client that skips or forges the step gains nothing.
 */

export const copilotActionSchema = z.enum([
  /* anyone, about their own working day */
  'checkIn',
  'checkOut',
  'requestLeave',
  'requestDocument',
  'cancelRequest',
  'openScreen',
  'filterScreen',
  'scrollPage',
  'openEmployeeFile',
  'setLanguage',
  'signOut',
  'markAllNotificationsRead',

  /* a manager, about their own reports */
  'decideRequest',

  /* whoever may address everyone */
  'postAnnouncement',
  'updateAnnouncement',
  'deleteAnnouncement',
  'addCalendarEvent',

  /* HR and administrators */
  'remindCheckout',
  'resetPassword',
  'addEmployee',
  'setSalary',
  'createPayrollAdjustment',
  'approvePayrollAdjustment',
  'reviewPayrollFinding',
  'updateEmployeeDetails',
  'generateJobDescription',
  'regenerateJobDescriptionSection',
  'addKnowledgeText',
  'deleteKnowledgeText',
  'approveJobDescription',
  'createOpeningFromJobDescription',
  'deleteJobDescription',
  'createJob',
  'updateJobOpening',
  'publishOpening',
  'moveApplication',
  'analyseApplication',
  'generateInterview',
  'reviewInterviewQuestion',
  'evaluateInterview',
  'sendInterview',
  'runPayroll',
  'auditPayroll',
  'approvePayroll',
  'deleteCalendarEvent',
  'changeEmployeeRole',
  'closeOpening',
  'deleteOpening',
])
export type CopilotAction = z.infer<typeof copilotActionSchema>

export const leaveKindSchema = z.enum(['annual', 'sick', 'unpaid'])

/** The stages an application can be moved to. Mirrors `applicationStatusSchema`. */
export const applicationStageSchema = z.enum([
  'new',
  'underReview',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
])
export type ApplicationStage = z.infer<typeof applicationStageSchema>
export type LeaveKind = z.infer<typeof leaveKindSchema>

/** Matches `requestKindSchema` minus leave — the kinds the requests route accepts. */
export const simpleRequestKindSchema = z.enum(['certificate', 'detailsUpdate'])
export type SimpleRequestKind = z.infer<typeof simpleRequestKindSchema>

/**
 * What the model may fill in, and nothing else.
 *
 * Every field is a value, never an identifier the model invented: dates are
 * dates, a decision is approve or reject, a person is named in the asker's own
 * words and resolved by the server against people that asker may already see.
 * The model never produces a row id — it cannot know one, and accepting one
 * would let a sentence reach a record by number.
 */
export const copilotActionPlanSchema = z.object({
  action: copilotActionSchema,

  /** For `requestLeave`. */
  leaveKind: leaveKindSchema.nullable(),
  /** ISO dates, resolved by the server from relative phrasing before it gets here. */
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),

  /** For `requestDocument`. */
  documentKind: simpleRequestKindSchema.nullable(),

  /** Free text the person dictated: a leave reason, an announcement body. */
  text: z.string().nullable(),
  /** A title, where the thing being created has one. */
  title: z.string().nullable(),

  /** Who they named, in their own words. Resolved against people they may see. */
  personName: z.string().nullable(),
  /** An exact employee number, when they quoted one. */
  employeeNumber: z.string().nullable(),

  /** For `decideRequest`. */
  decision: z.enum(['approve', 'reject']).nullable(),
  /** For `moveApplication`: which stage it goes to. */
  stage: applicationStageSchema.nullable(),
  /** For `changeEmployeeRole` and `addEmployee`. */
  role: z.enum(['employee', 'manager', 'hr', 'admin']).nullable(),

  /** For `addEmployee` and `updateEmployeeDetails`. */
  email: z.string().nullable(),
  /** For `createJob` and `updateJobOpening`: where the role is based. */
  location: z.string().nullable(),
  /** For `updateJobOpening`. */
  employmentType: z.enum(['fullTime', 'partTime', 'contract', 'internship']).nullable(),
  /** For `setLanguage`. */
  language: z.enum(['en', 'ar']).nullable(),
  /** For `openScreen`: the screen they named, in their own words. */
  screen: z.string().nullable(),
  /** A browser-side page movement requested by voice or text. */
  scrollTarget: z.enum(['up', 'down', 'top', 'bottom']).nullable(),
  /**
   * For `setSalary`, as the person said it: "900", "1200.50".
   *
   * A string, not a number. It reaches the payroll table as `numeric`, and
   * putting it through a binary float on the way is how 1234.15 stops being
   * 1234.15. Nothing here does arithmetic on it.
   */
  amount: z.string().nullable(),
  /** Exact ISO time for a scheduled applicant assessment. */
  opensAt: z.string().nullable(),
  /** The fixed answer window for a scheduled applicant assessment. */
  durationMinutes: z.number().int().min(15).max(240).nullable(),
  /** One of the fixed ten applicant-assessment questions. */
  questionNumber: z.number().int().min(1).max(10).nullable(),
  payrollAdjustmentKind: payrollAdjustmentKindSchema.nullable(),
  employeeNumberNew: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  /** For rewriting one part of an existing job description. */
  jobDescriptionSection: jobDescriptionSectionSchema.nullable(),

  /** Set when the instruction cannot be carried out as asked. */
  refusalReason: z.enum(['notPermitted', 'unclear', 'notFound', 'notApplicable']).nullable(),
})
export type CopilotActionPlan = z.infer<typeof copilotActionPlanSchema>

/**
 * One line of "this is what will happen", for the confirmation card.
 *
 * Separate rows rather than a sentence, because a sentence is skimmed and a
 * labelled list is read. The person about to approve three days of leave should
 * see whose, which days, and how many, each on its own line.
 */
export const actionDetailSchema = z.object({
  label: localizedSchema,
  value: localizedSchema,
})
export type ActionDetail = z.infer<typeof actionDetailSchema>

export const actionProposalSchema = z.object({
  action: copilotActionSchema,
  /** What is about to happen, in one line. */
  summary: localizedSchema,
  /** The specifics, so nothing is taken on trust. */
  details: z.array(actionDetailSchema),
  /**
   * Harder to undo than to do.
   *
   * Approving payroll locks a cycle; resetting a password invalidates the one
   * somebody is using. The confirmation is worded and coloured differently for
   * these, and the wording says what cannot be taken back.
   */
  destructive: z.boolean(),
  /** Said where the action has a consequence beyond the obvious one. */
  caution: localizedSchema.nullable(),
  /**
   * The resolved instruction, echoed back on confirmation.
   *
   * Carries ids the server resolved, not ones the model produced. It is still
   * re-validated and re-authorised on the way back in: this is a convenience so
   * the server need not remember the proposal, not a token that grants anything.
   */
  params: z.object({
    action: copilotActionSchema,
    targetId: idSchema.nullable(),
    leaveKind: leaveKindSchema.nullable(),
    documentKind: simpleRequestKindSchema.nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    text: z.string().nullable(),
    title: z.string().nullable(),
    decision: z.enum(['approve', 'reject']).nullable(),
    stage: applicationStageSchema.nullable(),
    /** For `changeEmployeeRole` and `addEmployee`. */
    role: z.enum(['employee', 'manager', 'hr', 'admin']).nullable(),
    email: z.string().nullable(),
    location: z.string().nullable(),
    employmentType: z.enum(['fullTime', 'partTime', 'contract', 'internship']).nullable(),
    language: z.enum(['en', 'ar']).nullable(),
    screen: z.string().nullable(),
    scrollTarget: z.enum(['up', 'down', 'top', 'bottom']).nullable(),
    amount: z.string().nullable(),
    opensAt: z.string().nullable(),
    durationMinutes: z.number().int().min(15).max(240).nullable(),
    questionNumber: z.number().int().min(1).max(10).nullable(),
    payrollAdjustmentKind: payrollAdjustmentKindSchema.nullable(),
    employeeNumberNew: z.string().nullable(),
    jobTitle: z.string().nullable(),
    department: z.string().nullable(),
    jobDescriptionSection: jobDescriptionSectionSchema.nullable(),
  }),
})
export type ActionProposal = z.infer<typeof actionProposalSchema>
export type ActionParams = ActionProposal['params']

/** Sent when the person presses confirm. */
export const copilotDoSchema = z.object({
  params: actionProposalSchema.shape.params,
  /**
   * A server-created action-card id, when a transport has one. It deduplicates
   * retries without turning the id into an authorization credential.
   */
  operationId: idSchema.optional(),
  /**
   * What they originally typed, echoed back.
   *
   * Only so the assistant can remember that this sentence, routed this way,
   * was accepted by a person. It is not read for anything else — the action
   * about to run comes from `params`, which the server resolved.
   */
  question: z.string().max(500).optional(),
})
export type CopilotDoRequest = z.infer<typeof copilotDoSchema>

/**
 * A form, filled in.
 *
 * Boxes rather than a sentence, so nothing has to be guessed — which is why this
 * reaches the server without a model call anywhere in it. The values are raw
 * strings as typed; the server decides which of them it is willing to read,
 * from the fields it declared for that action, and drops the rest.
 */
export const copilotFillSchema = z.object({
  action: copilotActionSchema,
  /**
   * Keys are field names, values are what was typed. An empty string means the
   * box was left alone, which for an optional field is an answer.
   */
  values: z.record(z.string(), z.string().max(2000)),
  /** Echoed back only so an accepted routing can be remembered, as `/do` does. */
  question: z.string().max(500).optional(),
})
export type CopilotFillRequest = z.infer<typeof copilotFillSchema>

/**
 * What happened.
 *
 * `outcome` is written by the server from what it did, never by the model — a
 * model that reports its own success is reporting its intention.
 */
export const actionOutcomeSchema = z.object({
  ok: z.boolean(),
  message: localizedSchema,
  /**
   * A wording the web app already has, used in preference to `message`.
   *
   * The leave rules refuse for reasons the leave form already explains — no
   * working days in the range, not enough balance, an overlap with a request
   * already in. Writing those sentences again here would give the same refusal
   * two wordings that drift apart, and the assistant's copy is the one nobody
   * would notice going stale. `message` stays as the fallback for a client that
   * does not know the key.
   */
  messageKey: z.string().nullable(),
  messageParams: z.record(z.string(), z.string()).nullable(),
  /** Where to go to see the result, when there is somewhere. */
  path: z.string().nullable(),
  /**
   * Something for the interface to do, rather than something a record changed.
   *
   * Almost every action here writes to the database through a route. Switching
   * the interface language does not — it is this browser's preference, held in
   * this browser. Saying so with its own field rather than pretending it went
   * through the backend keeps "the backend confirmed it" meaning what it says
   * everywhere else.
   */
  uiEffect: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('setLanguage'), language: z.enum(['en', 'ar']) }),
      /**
       * The session is already gone by the time this arrives; the interface
       * still has to notice. Without it the person sits on a page whose every
       * request will now be refused, which reads as the app breaking rather
       * than as them being signed out.
       */
      z.object({ kind: z.literal('signedOut') }),
      z.object({ kind: z.literal('scroll'), target: z.enum(['up', 'down', 'top', 'bottom']) }),
      /**
       * Go there, rather than offer a button that goes there.
       *
       * Opening a screen is the whole of what `openScreen` does, so finishing
       * with "here you go" and a link is finishing with nothing: the person
       * already confirmed, and confirming is the press. It was read as the
       * assistant claiming to have done something it had not.
       */
      z.object({
        kind: z.literal('navigate'),
        page: navigationPageIdSchema,
        /** A validated payroll month, used only by the payroll workspace. */
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
        /** An employee number accepted by the protected employee-file lookup. */
        employeeNumber: z.string().trim().min(1).max(40).optional(),
        /** A server-validated tab on a destination that exposes tab state in its URL. */
        tab: z.enum(['requests', 'calendar']).optional(),
        /** A bounded search value consumed only by pages with URL-backed search. */
        query: z.string().trim().min(1).max(120).optional(),
        /** A role filter consumed only by employee/user directory pages. */
        role: z.enum(['employee', 'manager', 'hr', 'admin']).optional(),
        /** An application-stage filter consumed only by Recruitment. */
        stage: applicationStageSchema.optional(),
      }),
    ])
    .nullish(),
})
export type ActionOutcome = z.infer<typeof actionOutcomeSchema>

/**
 * When the instruction fits more than one record.
 *
 * "Cancel my request" is unambiguous until somebody has two pending. Refusing
 * there is technically safe and practically useless — the person is left to
 * work out a phrasing that narrows it, with no idea what the options were. So
 * the assistant asks, with the candidates written out the same way a single
 * proposal is, and each one carries the instruction that would run.
 *
 * Deliberately not "pick the most recent". Guessing right most of the time is
 * how a system eventually approves the wrong leave, quietly.
 */
/**
 * What a refusal could not work out, said in words rather than a code.
 *
 * "I did not understand" is true and useless. "Which event? give it a name" is
 * the same refusal with the one thing the person needs to fix it. Localised,
 * because it is read by whoever asked and they did not necessarily ask in
 * English.
 */
export const actionGapSchema = z.object({
  /** What is missing or unresolved, named. */
  missing: localizedSchema,
})
export type ActionGap = z.infer<typeof actionGapSchema>

export const actionChoiceSchema = z.object({
  question: localizedSchema,
  options: z.array(actionProposalSchema).min(2).max(5),
})
export type ActionChoice = z.infer<typeof actionChoiceSchema>

/** Sent when somebody backs out of a proposal, so the routing is not learned. */
export const copilotDeclinedSchema = z.object({
  question: z.string().max(500),
  action: copilotActionSchema,
})
export type CopilotDeclinedRequest = z.infer<typeof copilotDeclinedSchema>
