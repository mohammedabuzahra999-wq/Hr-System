import { z } from 'zod'
import type { CopilotAction, CopilotActionPlan, CopilotIntent, CopilotPlan } from '@hr/shared'
import { jobDescriptionSectionSchema } from '@hr/shared'

/**
 * Each capability as its own tool signature.
 *
 * The first version of this server exposed four tools and asked the caller to
 * write a sentence, which a model then classified. That is the right shape for
 * a person typing into a panel and the wrong one for a machine: an MCP client
 * is already an agent with a model of its own, so routing through a second one
 * costs a round trip, adds a place to be misunderstood, and turns a parameter
 * that could have been a date into a phrase that has to be resolved into one.
 *
 * A named tool with typed parameters removes all three. The caller states what
 * it wants directly; the schema tells it what is required before it calls
 * rather than after; and nothing has to be guessed from prose.
 *
 * `hr_ask` stays for the case these do not cover — a question nobody thought to
 * name — but it is the fallback now, not the front door.
 *
 * Nothing here decides permissions. These are shapes; who may call which is
 * still `ACTION_CAPABILITY` and `INTENT_ROLES`, checked per call.
 */

const person = {
  employeeNumber: z.string().optional().describe('Exact employee number, e.g. EMP-1001. Preferred over a name.'),
  personName: z.string().optional().describe('Their name, if you do not have the number. Refused if it matches more than one person.'),
}

const isoDate = (what: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').describe(what)

/**
 * What each action takes.
 *
 * Only what that action reads. The in-app path hands every action the same wide
 * object with most fields null, because a model filling one form is simpler
 * than a model choosing between twenty-two; a caller with types wants the
 * opposite, and gets it here.
 */
export const ACTION_INPUTS: Record<CopilotAction, z.ZodRawShape> = {
  checkIn: {},
  checkOut: {},
  remindCheckout: {},
  cancelRequest: {},
  markAllNotificationsRead: {},

  /*
   * Listed so the registry stays exhaustive, but the MCP server skips it: an
   * interface preference means nothing to an agent that has no interface.
   */
  /* the app's own screens \u2014 an agent has none to open */
  openScreen: { screen: z.string() },
  filterScreen: {
    screen: z.string(),
    text: z.string().min(1).max(120).optional(),
    role: z.enum(['employee', 'manager', 'hr', 'admin']).optional(),
    stage: z.enum(['new', 'underReview', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']).optional(),
  },
  scrollPage: { scrollTarget: z.enum(['up', 'down', 'top', 'bottom']) },
  openEmployeeFile: person,
  setLanguage: { language: z.enum(['en', 'ar']) },
  /* likewise: an agent has no session to end, only the app does */
  signOut: {},
  runPayroll: {
    startDate: isoDate('First day of the payroll month, YYYY-MM-01; defaults to the current month').optional(),
  },
  auditPayroll: {
    startDate: isoDate('First day of the payroll month being audited, YYYY-MM-01'),
  },
  approvePayroll: {
    startDate: isoDate('First day of the payroll month being approved, YYYY-MM-01'),
  },

  requestLeave: {
    leaveKind: z.enum(['annual', 'sick', 'unpaid']).describe('Which kind of leave'),
    startDate: isoDate('First day of leave'),
    endDate: isoDate('Last day of leave, inclusive'),
    reason: z.string().max(500).optional(),
  },

  requestDocument: {
    documentKind: z.enum(['certificate', 'detailsUpdate']).describe('What is being requested'),
    reason: z.string().max(500).optional(),
  },

  decideRequest: {
    decision: z.enum(['approve', 'reject']),
    ...person,
  },

  postAnnouncement: {
    title: z.string().max(160).optional().describe('Defaults to the first line of the body'),
    text: z.string().min(1).max(2000).describe('What the announcement says'),
  },

  updateAnnouncement: {
    title: z.string().min(1).describe('Enough of the announcement title to identify it uniquely'),
    text: z.string().min(1).max(2000).describe('The new announcement message'),
  },

  deleteAnnouncement: {
    title: z.string().min(1).describe('Enough of the title to identify it uniquely'),
  },

  addCalendarEvent: {
    title: z.string().min(1).describe('What the event is called'),
    startDate: isoDate('The day it starts'),
    endDate: isoDate('The day it ends; omit for a single day').optional(),
  },
  deleteCalendarEvent: {
    title: z.string().min(1).describe('Enough of the event title to identify it uniquely'),
  },

  resetPassword: person,

  addEmployee: {
    personName: z.string().min(1).describe('Their full name'),
    email: z.string().describe('Work email address'),
    employeeNumberNew: z.string().min(1).describe('The new employee number, e.g. EMP-3050'),
    jobTitle: z.string().min(1),
    department: z.string().min(1),
    role: z.enum(['employee', 'manager', 'hr', 'admin']).optional().describe('Defaults to employee'),
  },

  setSalary: {
    ...person,
    amount: z.string().describe('Basic salary as a number, e.g. "950" or "1200.50"'),
    startDate: isoDate('When it applies from; defaults to the first of next month').optional(),
  },

  createPayrollAdjustment: {
    ...person,
    payrollAdjustmentKind: z.enum(['overtime', 'bonus', 'allowance', 'deduction']),
    amount: z.string().describe('Amount as a number, e.g. "100" or "45.50"'),
    reason: z.string().min(1).max(500).describe('Why this payroll item is needed'),
    startDate: isoDate('When it applies from; defaults to today').optional(),
  },

  approvePayrollAdjustment: {
    ...person,
    payrollAdjustmentKind: z.enum(['overtime', 'bonus', 'allowance', 'deduction']).optional(),
  },

  reviewPayrollFinding: {
    ...person,
    decision: z.enum(['approve', 'reject']).describe('approve marks the finding reviewed; reject dismisses it'),
    note: z.string().max(500).optional().describe('Optional review note'),
  },

  updateEmployeeDetails: {
    ...person,
    jobTitle: z.string().optional(),
    department: z.string().optional(),
  },

  changeEmployeeRole: {
    ...person,
    role: z.enum(['employee', 'manager', 'hr', 'admin']),
  },

  generateJobDescription: {
    title: z.string().min(1).describe('The role, e.g. "Senior Accountant"'),
    text: z.string().max(2000).optional().describe('Anything else about it: years, skills, department'),
  },

  regenerateJobDescriptionSection: {
    title: z.string().min(1).describe('Enough of the job-description title to identify it uniquely'),
    jobDescriptionSection: jobDescriptionSectionSchema,
    text: z.string().max(500).optional().describe('Optional rewrite instruction'),
  },

  addKnowledgeText: {
    title: z.string().min(2).max(180).describe('A clear knowledge-base article title'),
    text: z.string().min(40).max(80000).describe('The approved policy, procedure, FAQ, onboarding or system reference text'),
  },

  deleteKnowledgeText: {
    title: z.string().min(1).describe('Enough of the knowledge-base article title to identify it uniquely'),
  },

  approveJobDescription: {
    title: z.string().min(1).describe('Enough of the role title to identify the draft'),
  },
  createOpeningFromJobDescription: {
    title: z.string().min(1).describe('Enough of the approved job description title to identify it'),
  },
  deleteJobDescription: {
    title: z.string().min(1).describe('Enough of the job description title to identify it uniquely'),
  },

  createJob: {
    title: z.string().min(1).describe('The role, e.g. "Senior Accountant"'),
    department: z.string().min(1),
    location: z.string().optional().describe('Where it is based'),
  },

  updateJobOpening: {
    title: z.string().min(1).describe('Enough of the vacancy title to identify it'),
    location: z.string().optional().describe('Where the role is based'),
    employmentType: z.enum(['fullTime', 'partTime', 'contract', 'internship']).optional(),
    startDate: z.string().optional().describe('Application deadline, YYYY-MM-DD'),
  },

  publishOpening: {
    title: z.string().min(1).describe('Enough of the vacancy title to identify it'),
  },

  closeOpening: {
    title: z.string().min(1).describe('Enough of the vacancy title to identify it'),
  },

  deleteOpening: {
    title: z.string().min(1).describe('Enough of the vacancy title to identify it'),
  },

  moveApplication: {
    personName: z.string().min(1).describe('The applicant'),
    stage: z.enum(['new', 'underReview', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']),
  },

  analyseApplication: {
    personName: z.string().min(1).describe('The applicant'),
  },
  generateInterview: {
    personName: z.string().min(1).describe('The applicant whose interview draft should be generated'),
  },
  reviewInterviewQuestion: {
    personName: z.string().min(1).describe('The applicant whose draft question is being reviewed'),
    questionNumber: z.number().int().min(1).max(10),
    decision: z.enum(['approve', 'reject']).describe('approve accepts the question; reject regenerates it'),
    text: z.string().min(3).max(1000).optional().describe('Required feedback when decision is reject'),
  },
  evaluateInterview: {
    personName: z.string().min(1).describe('The applicant whose completed interview should be evaluated'),
  },
  sendInterview: {
    personName: z.string().min(1).describe('The applicant whose approved interview should be sent'),
    opensAt: z.string().datetime({ offset: true }).describe('Exact opening time in ISO 8601 including timezone'),
    durationMinutes: z.number().int().min(15).max(240).describe('Answer window in minutes'),
  },
}

/**
 * Turning typed arguments into the plan the existing code expects.
 *
 * The plan shape is wide and mostly null because it was designed for a model to
 * fill. Building it here from named arguments means the action layer, its
 * scoping and its refusals are reached unchanged — the typed tools are a
 * different door into the same room, not a second room.
 */
export function planFor(action: CopilotAction, args: Record<string, unknown>): CopilotActionPlan {
  const str = (k: string) => (typeof args[k] === 'string' && args[k] ? (args[k] as string) : null)
  const number = (k: string) => (typeof args[k] === 'number' && Number.isInteger(args[k]) ? (args[k] as number) : null)
  return {
    action,
    leaveKind: (str('leaveKind') as CopilotActionPlan['leaveKind']) ?? null,
    startDate: str('startDate'),
    endDate: str('endDate'),
    documentKind: (str('documentKind') as CopilotActionPlan['documentKind']) ?? null,
    /* `reason` is what the caller calls it; `text` is what the plan calls it. */
    text: str('text') ?? str('reason') ?? str('note'),
    title: str('title'),
    personName: str('personName'),
    employeeNumber: str('employeeNumber'),
    decision: (str('decision') as CopilotActionPlan['decision']) ?? null,
    stage: (str('stage') as CopilotActionPlan['stage']) ?? null,
    role: (str('role') as CopilotActionPlan['role']) ?? null,
    email: str('email'),
    employeeNumberNew: str('employeeNumberNew'),
    jobTitle: str('jobTitle'),
    department: str('department'),
    jobDescriptionSection: (str('jobDescriptionSection') as CopilotActionPlan['jobDescriptionSection']) ?? null,
    amount: str('amount'),
    opensAt: str('opensAt'),
    durationMinutes: number('durationMinutes'),
    questionNumber: number('questionNumber'),
    payrollAdjustmentKind: (str('payrollAdjustmentKind') as CopilotActionPlan['payrollAdjustmentKind']) ?? null,
    location: str('location'),
    employmentType: (str('employmentType') as CopilotActionPlan['employmentType']) ?? null,
    language: (str('language') as CopilotActionPlan['language']) ?? null,
    screen: str('screen'),
    scrollTarget: (str('scrollTarget') as CopilotActionPlan['scrollTarget']) ?? null,
    refusalReason: null,
  }
}

/* ------------------------------------------------------------- questions */

const period = z
  .enum(['today', 'thisWeek', 'thisMonth', 'lastMonth', 'lastSixMonths', 'thisYear', 'calendarMonth'])
  .optional()
  .describe('Time range. Omit for the default, which is this month for most figures.')
const calendarMonth = z.number().int().min(1).max(12).optional().describe('Required when period is calendarMonth')
const calendarYear = z.number().int().min(2000).max(2100).optional().describe('Optional year for calendarMonth; defaults to the current year')

/** What each question takes. Most take a period and nothing else. */
export const INTENT_INPUTS: Partial<Record<CopilotIntent, z.ZodRawShape>> = {
  myAttendance: { period },
  myLeaveBalance: {},
  myRequests: {},
  myPayslips: {},
  payrollInsights: {
    period,
    month: calendarMonth,
    year: calendarYear,
    payrollTopic: z.enum(['summary', 'readiness', 'adjustments', 'overtime', 'bonuses', 'deductions', 'highestNetPay', 'lowestNetPay', 'contracts', 'variance', 'findings']).optional(),
  },
  payrollAuditSummary: {},
  payrollFindings: {},

  teamPresentNow: {},
  teamAttendance: { period },
  teamOnLeave: {},
  teamPendingApprovals: {},
  teamRoster: {},

  headcount: {},
  departmentBreakdown: {},
  departmentAbsenceComparison: { period, month: calendarMonth, year: calendarYear },
  orgAttendance: { period, department: z.string().optional().describe('Limit to one department') },
  orgLeaveSummary: { period },
  recruitmentSummary: {},
  listApplications: {
    stage: z
      .enum(['new', 'underReview', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'])
      .optional()
      .describe('Only applicants at this stage'),
  },
  whoIsPresentNow: {},
  attendanceRanking: {
    period,
    rankBy: z.enum(['present', 'absent', 'late']).optional().describe('What to order by; defaults to present'),
  },

  employeeFile: person,
  generateReport: {
    reportType: z.enum(['attendance', 'leave', 'employees', 'newHires', 'recruitment', 'department']).optional(),
    period,
    month: calendarMonth,
    year: calendarYear,
    department: z.string().optional(),
  },
}

export function questionPlanFor(intent: CopilotIntent, args: Record<string, unknown>): CopilotPlan {
  const str = (k: string) => (typeof args[k] === 'string' && args[k] ? (args[k] as string) : null)
  return {
    intent,
    period: (str('period') as CopilotPlan['period']) ?? null,
    month: typeof args.month === 'number' && Number.isInteger(args.month) ? args.month : null,
    year: typeof args.year === 'number' && Number.isInteger(args.year) ? args.year : null,
    department: str('department'),
    personName: str('personName'),
    employeeNumber: str('employeeNumber'),
    rankBy: (str('rankBy') as CopilotPlan['rankBy']) ?? null,
    payrollTopic: (str('payrollTopic') as CopilotPlan['payrollTopic']) ?? null,
    reportType: (str('reportType') as CopilotPlan['reportType']) ?? null,
    refusalReason: null,
  }
}
