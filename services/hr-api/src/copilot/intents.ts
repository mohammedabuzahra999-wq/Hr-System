import type { CopilotIntent } from '@hr/shared'
import type { Role } from '@hr/shared'

/**
 * Who may ask what.
 *
 * One table, and it is the only place this is decided. The model picks an
 * intent; this decides whether that intent is allowed for the person asking,
 * and the route refuses before any query runs. Nothing about that decision is
 * negotiable in prose, which is the point — a rule expressed in a prompt is a
 * rule a sufficiently determined sentence can talk its way around.
 *
 * The lists mirror the permissions the pages already enforce rather than
 * inventing new ones, because two sources of truth about who sees what is how
 * one of them quietly drifts. `stats.ts` is HR and admin; team data is a
 * manager's own reports; payroll amounts are HR and admin.
 */
export const INTENT_ROLES: Record<CopilotIntent, readonly Role[]> = {
  /* about the asker — everyone has these, including an administrator asking
     about their own attendance, because everyone is also an employee */
  /* a greeting is not a question about data, so everyone may send one */
  greeting: ['employee', 'manager', 'hr', 'admin'],

  /*
   * Every role may instruct — which instructions exist for them is decided
   * per action, in `actions.ts`, against the same capability registry the
   * routes use. Gating the intent itself would be a second, coarser copy of
   * that, and the coarser copy is the one that goes stale.
   */
  doAction: ['employee', 'manager', 'hr', 'admin'],

  myAttendance: ['employee', 'manager', 'hr', 'admin'],
  myLeaveBalance: ['employee', 'manager', 'hr', 'admin'],
  myRequests: ['employee', 'manager', 'hr', 'admin'],
  myPayslips: ['employee', 'manager', 'hr', 'admin'],
  payrollInsights: ['hr', 'admin'],
  /* Payroll Agent answers are company payroll data, never a claimed role in a prompt. */
  payrollReadiness: ['hr', 'admin'],
  payrollRunSummary: ['hr', 'admin'],
  payrollAuditSummary: ['hr', 'admin'],
  payrollFindings: ['hr', 'admin'],

  /* a manager's own direct reports, and nobody else's — the scoping is in the
     SQL, not here; this only decides who may ask at all */
  teamPresentNow: ['manager', 'hr', 'admin'],
  teamAttendance: ['manager', 'hr', 'admin'],
  teamOnLeave: ['manager', 'hr', 'admin'],
  teamPendingApprovals: ['manager', 'hr', 'admin'],
  teamRoster: ['manager', 'hr', 'admin'],

  /* the whole organisation */
  headcount: ['hr', 'admin'],
  departmentBreakdown: ['hr', 'admin'],
  departmentAbsenceComparison: ['hr', 'admin'],
  orgAttendance: ['hr', 'admin'],
  orgLeaveSummary: ['hr', 'admin'],
  recruitmentSummary: ['hr', 'admin'],
  openJobOpenings: ['hr', 'admin'],
  listApplications: ['hr', 'admin'],
  whoIsPresentNow: ['hr', 'admin'],

  /**
   * Available to a manager too, and scoped to their own reports when they ask —
   * the executor decides the population from who is asking, not from the
   * question. "Who has the best attendance" means something different to a
   * manager than to HR, and both meanings are legitimate.
   */
  attendanceRanking: ['manager', 'hr', 'admin'],

  /**
   * A report is a document that leaves the building, so it is HR's and an
   * administrator's — with managers included because a team report is the same
   * query scoped to their own reports, and refusing it would mean a manager
   * exporting their team's attendance by hand from a screen.
   */
  generateReport: ['manager', 'hr', 'admin'],
  /**
   * The same report, about yourself, which everybody may ask for.
   *
   * Separate from `generateReport` rather than a flag on it, and that is the
   * whole point. "تقرير حضوري" routed to the organisation report: an
   * employee was refused outright, and HR asking about their own attendance got
   * the whole company back. Neither was what was asked for.
   *
   * As an intent it is gated here like everything else — no branch reads a
   * boolean and decides to skip a check — and the scope is forced to the asker
   * in code, so nothing the model produces can widen it.
   */
  myReport: ['employee', 'manager', 'hr', 'admin'],

  /**
   * One person's whole file.
   *
   * A manager may ask, and gets only their own reports and no pay — the scoping
   * is in the query, as always. HR and an administrator get anybody, salary
   * included, which is what the employee screens already show them.
   */
  employeeFile: ['manager', 'hr', 'admin'],

  /**
   * Everybody, because it is about the software rather than about data.
   * What differs by role is which screens exist for them, and that is decided
   * by the entries the answer is built from, not by this table.
   */
  howDoI: ['employee', 'manager', 'hr', 'admin'],

  /* The actual document audience is checked in SQL during retrieval. */
  knowledge: ['employee', 'manager', 'hr', 'admin'],

  /* refusal is available to everyone, since everyone can ask something silly */
  outOfScope: ['employee', 'manager', 'hr', 'admin'],
}

export function mayAsk(role: Role, intent: CopilotIntent): boolean {
  return INTENT_ROLES[intent].includes(role)
}

/** The intents a given role may use, for the prompt and for the suggestion chips. */
export function intentsFor(role: Role): CopilotIntent[] {
  return (Object.keys(INTENT_ROLES) as CopilotIntent[]).filter((i) => i !== 'outOfScope' && mayAsk(role, i))
}

/**
 * What each question answers, in one line.
 *
 * Shown to the model so it can choose, and only the lines for intents the asker
 * is allowed to use are included — so a question the asker may not ask is not
 * merely refused afterwards, it is not offered to the model in the first place.
 * Defence in depth: the check in the route is what actually enforces it.
 */
export const INTENT_DESCRIPTIONS: Record<CopilotIntent, string> = {
  doAction:
    'an instruction to DO something rather than a question about something: check me in, submit leave for me, approve Ahmad’s request, publish the vacancy, post an announcement, take an announcement down, put something on the calendar, switch the interface to English or Arabic, take me to a screen (“ودّيني على…”, “افتحلي…”, “open…”, or just the name of a screen on its own), write a job description, move an applicant to interview, make somebody a manager, delete a vacancy, reset somebody’s password, run payroll. Anything phrased as a command or a request to change the system. Choose this whenever they want an action taken; which action it is, and whether they may take it, is worked out afterwards.',
  greeting:
    'a greeting or an opening pleasantry with no question attached — "hello", "hi", "مرحبا", "السلام عليكم", "good morning", "are you there". Choose this rather than outOfScope: they are starting a conversation, not asking about the world.',
  myAttendance: "the asker's own attendance record — days present, late, absent",
  myLeaveBalance: "the asker's own remaining annual and sick leave",
  myRequests: "the status of the asker's own requests (leave, certificates, detail changes)",
  myPayslips: "the asker's OWN salary, pay and recent payslips — what they earn, what they were paid, their net pay",
  payrollInsights:
    'Payroll Agent: answer a company payroll question through one controlled, read-only view. Use payrollTopic: summary for totals; readiness for cycle status; adjustments for pending/approved inputs; overtime, bonuses or deductions for those amounts; highestNetPay or lowestNetPay for a pay ranking; contracts for active salary agreements; variance for month-to-month payroll change; findings for open audit findings. HR and administrators only. For one named employee’s salary, payslip or pay change, choose employeeFile with reportType payroll instead.',
  payrollReadiness:
    'Payroll Agent: whether a payroll cycle is ready for HR review, including its run status, pending adjustments, open high/critical audit findings and whether the applied payroll settings are confirmed. HR and administrators only.',
  payrollRunSummary:
    'Payroll Agent: a company payroll run summary for the requested month — employee count, gross pay, deductions and net pay. HR and administrators only. Use a calendarMonth when one is mentioned.',
  payrollAuditSummary:
    'the latest payroll audit summary: the counts of critical, high, medium and low findings. HR and administrators only.',
  payrollFindings:
    'the payroll audit findings still requiring review before a run can be approved. HR and administrators only.',

  teamPresentNow: 'which of the asker’s direct reports are in the system right now',
  teamAttendance: 'attendance for the asker’s direct reports over a period',
  teamOnLeave: 'which of the asker’s direct reports are on leave, now or approved for later',
  teamPendingApprovals: 'leave and other requests waiting for the asker to decide',
  teamRoster: 'who reports to the asker, with their job titles',

  headcount: 'how many people work here, in total and by department',
  departmentBreakdown: 'a breakdown by department — headcount, and attendance if asked',
  departmentAbsenceComparison:
    'compare absence rates between departments over a period, often asking for a chart. Use this for questions such as "compare absence between departments over the last 6 months" or "قارن نسبة الغياب بين الأقسام آخر 6 أشهر". It reports recorded figures only and never guesses why a department differs.',
  orgAttendance: 'attendance across the whole company over a period',
  orgLeaveSummary: 'leave across the whole company — who is off, how much is used',
  recruitmentSummary: 'open vacancies and the applications received',
  openJobOpenings: 'the open job vacancies themselves: their titles, departments and locations. Use this when they ask which jobs are open or available to apply for, not when they ask about applicants.',
  listApplications:
    'the applicants themselves — who applied, to which vacancy, what stage they are at. Use this when they want the people, not the counts.',
  whoIsPresentNow: 'who across the company is in the system right now',
  attendanceRanking:
    'people ranked by their attendance over a period — who is present most, absent most, or late most. Set rankBy to present, absent or late',
  howDoI:
    'how to use the system itself — where a screen is, what it does, the steps to complete a task, why something was refused. Choose this for "how do I…", "where is…", "what does this page do", "explain this screen". It is about the software, never about data. It is also never an instruction: "switch to English" and "ودّيني على الإجازات" are things to DO, not questions about how to do them. "How do I get to the leave screen" is this; "take me to the leave screen" is not.',
  knowledge:
    'a question about a company policy, procedure, handbook, benefit, onboarding, or other reference document in the assistant knowledge base. The source itself decides whether this role may read it. Do not use this for live employee, payroll, attendance, leave, hiring, or applicant data; use their specific intent instead.',
  employeeFile:
    'everything about one named employee — their attendance, leave balance, requests, documents, CV and pay. Choose this whenever the question is about a specific person, by name or by employee number like EMP-1001. Put the number in employeeNumber and any name in personName. For a report specifically about that employee’s salary or payslips, set reportType to payroll; it is never a company report.',
  generateReport:
    'a full written report about OTHER PEOPLE — the company, a department, or their team. Attendance, leave, employees, recruitment or departments. Choose this when they ask for a "report" that is not about themselves. Set reportType to attendance, leave, employees, recruitment or department',
  myReport:
    'a full written report about THE ASKER THEMSELVES. Any request for a report that says "my", "mine", "حضوري", "إجازاتي", "عني" — "give me a report on my attendance", "تقرير عن حضوري". The difference from generateReport is only whose record it covers, and it is the whole difference. Set reportType the same way',

  outOfScope:
    'the QUESTION is not about this HR system, or the asker may not ask it, or it is too vague to act on. Never choose this for an instruction: a command missing a detail is still doAction, and the step after this one says which detail is missing.',
}
