import type { CopilotAction, Role } from '@hr/shared'
import { CAPABILITIES, type CapabilityName } from '../permissions.js'

/**
 * Who may tell the assistant to do what.
 *
 * Every action points at a capability in `permissions.ts` — the same table the
 * routes are gated by. That is the whole design: there is no second list of
 * who may do what, so "HR cannot decide leave" is one fact enforced in one
 * place, and the assistant inherits it rather than restating it.
 *
 * `null` means the action is not gated by role because it is about the asker
 * themselves — anyone may check themselves in or request their own leave, and
 * the scoping is to their own record inside the handler, not to a role.
 */
export const ACTION_CAPABILITY: Record<CopilotAction, CapabilityName | null> = {
  /* your own working day — everyone, scoped to themselves in the handler */
  checkIn: 'recordOwnAttendance',
  checkOut: 'recordOwnAttendance',
  requestLeave: null,
  requestDocument: null,
  cancelRequest: null,
  /* this browser's own display preference — no record, no role */
  /* going to a screen you can already reach from the menu */
  openScreen: null,
  filterScreen: null,
  scrollPage: null,
  openEmployeeFile: 'lookUpEmployeeFile',
  setLanguage: null,
  /* leaving is always yours to do */
  signOut: null,
  markAllNotificationsRead: null,

  /* somebody else's */
  decideRequest: 'decideRequests',
  postAnnouncement: 'postAnnouncements',
  updateAnnouncement: 'postAnnouncements',
  deleteAnnouncement: 'postAnnouncements',
  addCalendarEvent: 'manageCalendar',
  remindCheckout: 'remindCheckout',
  resetPassword: 'resetPassword',
  addEmployee: 'manageEmployees',
  setSalary: 'setSalary',
  createPayrollAdjustment: 'runPayroll',
  approvePayrollAdjustment: 'runPayroll',
  reviewPayrollFinding: 'runPayroll',
  updateEmployeeDetails: 'manageEmployees',
  generateJobDescription: 'manageJobDescriptions',
  regenerateJobDescriptionSection: 'manageJobDescriptions',
  addKnowledgeText: 'manageKnowledge',
  deleteKnowledgeText: 'manageKnowledge',
  approveJobDescription: 'manageJobDescriptions',
  createOpeningFromJobDescription: 'manageJobDescriptions',
  deleteJobDescription: 'manageJobDescriptions',
  createJob: 'manageRecruitment',
  updateJobOpening: 'manageRecruitment',
  publishOpening: 'manageRecruitment',
  moveApplication: 'manageRecruitment',
  analyseApplication: 'manageRecruitment',
  generateInterview: 'manageRecruitment',
  reviewInterviewQuestion: 'manageRecruitment',
  evaluateInterview: 'manageRecruitment',
  sendInterview: 'manageRecruitment',
  runPayroll: 'runPayroll',
  auditPayroll: 'runPayroll',
  approvePayroll: 'runPayroll',
  deleteCalendarEvent: 'manageCalendar',
  changeEmployeeRole: 'manageEmployees',
  closeOpening: 'manageRecruitment',
  deleteOpening: 'manageRecruitment',
}

/**
 * Harder to undo than to do.
 *
 * Not a judgement about importance — a statement about reversibility. Requesting
 * leave is consequential and reversible; approving a payroll run locks a cycle,
 * and resetting a password invalidates the one somebody is currently using. The
 * confirmation card is worded differently for these.
 */
export const DESTRUCTIVE: ReadonlySet<CopilotAction> = new Set<CopilotAction>([
  'setSalary',
  'createPayrollAdjustment',
  'approvePayrollAdjustment',
  'reviewPayrollFinding',
  'updateAnnouncement',
  'deleteAnnouncement',
  'closeOpening',
  'deleteOpening',
  'changeEmployeeRole',
  'resetPassword',
  'runPayroll',
  'publishOpening',
  'decideRequest',
  'approveJobDescription',
  'regenerateJobDescriptionSection',
  'addKnowledgeText',
  'deleteKnowledgeText',
  'deleteJobDescription',
  'approvePayroll',
  'sendInterview',
  'reviewInterviewQuestion',
  'deleteCalendarEvent',
])

export function mayDo(role: Role, action: CopilotAction): boolean {
  const capability = ACTION_CAPABILITY[action]
  if (capability === null) return true
  return (CAPABILITIES[capability].roles as readonly Role[]).includes(role)
}

/** The actions this role may take, for the model's list and for the panel. */
export function actionsFor(role: Role): CopilotAction[] {
  return (Object.keys(ACTION_CAPABILITY) as CopilotAction[]).filter((a) => mayDo(role, a))
}

/**
 * What each action does, in one line, for the model to choose between.
 *
 * Written as instructions a person would actually give, because that is what
 * the model is matching against. "Approve Ahmad's leave" and "reject it" are
 * both `decideRequest`; which of the two is a parameter, not a separate action.
 */
export const ACTION_DESCRIPTIONS: Record<CopilotAction, string> = {
  checkIn: 'record the asker’s own arrival for today — "check me in", "I’m here", "سجّل حضوري"',
  /**
   * Worded against `signOut`, because Arabic does not separate them.
   *
   * "سجّل خروج" is both "check out of work" and "sign out of the system", and
   * both were landing here — so asking to leave the application recorded the
   * end of somebody's working day instead. The distinction has to be drawn in
   * the descriptions, since the words themselves do not draw it.
   */
  checkOut:
    'record the end of the asker’s WORKING DAY on their attendance sheet — "check me out", "سجّل مغادرتي", "خلصت دوامي". They stay signed in. If they want to LEAVE THE APPLICATION, that is signOut, not this — "سجّل خروج من النظام" and "log me out" are signOut.',
  requestLeave:
    'submit a leave request for the asker themselves. Set leaveKind (annual, sick, unpaid), startDate and endDate as ISO dates, and text for the reason if they gave one.',
  requestDocument:
    'submit one of exactly TWO requests for the asker themselves: an employment certificate, or a change to their own recorded details. Set documentKind to certificate or detailsUpdate, and text for any note. This is NOT a catch-all — if what they asked for is neither of those two, it is not this action.',
  cancelRequest: 'withdraw a request the asker submitted and that is still pending',
  signOut:
    'END THE SESSION \u2014 sign the asker out of the application entirely. Choose this for "log me out", "sign out", "\u0633\u062c\u0651\u0644 \u062e\u0631\u0648\u062c \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645", "\u0627\u0637\u0644\u0639\u0646\u064a \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645", "\u062e\u0631\u0648\u062c". NOT the same as checkOut, which records the end of a working day and leaves them signed in.',
  openScreen:
    'take them to a screen. Choose this when they name a part of the system with no verb attached \u2014 "\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646", "\u0627\u0644\u0631\u0648\u0627\u062a\u0628", "recruitment", "my leave" \u2014 or say "open", "go to", "\u0648\u062f\u0651\u064a\u0646\u064a", "\u0627\u0641\u062a\u062d", "\u0627\u0636\u063a\u0637 \u0632\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628", or "\u0627\u0643\u0628\u0633 \u0639\u0644\u0649 \u0627\u0644\u062a\u0648\u0638\u064a\u0641". Set screen to the named screen, ignoring words such as button/\u0632\u0631. A bare noun is almost always this and almost never an instruction to DO something to it.',
  filterScreen:
    'open a supported list with a real URL-backed filter. Use for searching/filtering employees or users, or filtering recruitment applications by stage. Set screen, and at least one of text (search), role, or stage. Examples: "search Ahmad in employees", "show HR employees", "show interview-stage applicants". This changes only the visible list and never changes a record.',
  scrollPage:
    'move the current page viewport. Choose this for "scroll down", "go to the bottom", "page up", "انزل لتحت", "اطلع لفوق", "أول الصفحة", or "آخر الصفحة". Set scrollTarget to up, down, top, or bottom. This never clicks a control or changes a record.',
  openEmployeeFile:
    'open one employee\'s HR file in the employee directory. Choose this when they say "open Ahmad\'s file", "\u0627\u0641\u062a\u062d \u0645\u0644\u0641 \u0623\u062d\u0645\u062f", or give an employee number. Set personName or employeeNumber. This is only for HR and administrators and reads the same protected employee-file view used by the directory.',
  setLanguage:
    'switch the interface between Arabic and English. Set language to "ar" or "en". Choose this for "\u063a\u064a\u0651\u0631 \u0627\u0644\u0644\u063a\u0629", "switch to English", "\u062e\u0644\u0651\u064a\u0647\u0627 \u0639\u0631\u0628\u064a" \u2014 it changes what they see, not any record.',
  decideRequest:
    'approve or reject a leave or other request belonging to one of the asker’s own reports. Set decision, and personName for whose request.',
  postAnnouncement:
    'prepare or publish a GENERAL INTERNAL announcement for everyone in the company. Set title and text. Choose this for an ordinary company notice or a request to prepare an announcement. This is NOT a vacancy, recruitment advertisement, or job description; those require words such as job, vacancy, hiring, recruitment, or a specific role.',
  updateAnnouncement:
    'replace the body of one existing internal announcement. Set title to identify the announcement and text to the new message. The same ownership rule as the normal announcement editor applies, and the change is shown for confirmation before it is published.',
  deleteAnnouncement: 'take down an announcement. Set title for which one.',
  addCalendarEvent:
    'put an event on the calendar. Set title, and startDate (and endDate if it runs more than a day) as ISO dates.',
  remindCheckout: 'send a reminder to everyone who is still checked in and has not checked out',
  markAllNotificationsRead: 'mark every notification in the asker\'s own inbox as read. This does not delete anything.',
  setSalary:
    'set or change what one employee earns. Set personName or employeeNumber for who, amount for the basic salary as they said it, and startDate for when it applies from \u2014 default to the first of next month if they did not say. This is the basic figure only; allowances are set on the payroll screen.',
  createPayrollAdjustment:
    'create one pending payroll input for one employee: overtime, bonus, allowance or deduction. Set personName or employeeNumber, payrollAdjustmentKind, amount, text for the documented reason, and startDate when supplied. It is created pending review and never changes a payslip until a reviewer approves it.',
  approvePayrollAdjustment:
    'approve one pending payroll input for an employee. Set personName or employeeNumber, and payrollAdjustmentKind when they named bonus, allowance, overtime or deduction. Choose this only when they explicitly ask to approve the pending payroll item; it affects the next payroll calculation and always requires confirmation.',
  reviewPayrollFinding:
    'resolve one open payroll audit finding for an employee. Set personName or employeeNumber and decision: approve means mark reviewed, reject means dismiss. Set text to a review note if one was given. Always show the exact finding and require confirmation before recording the review.',
  addEmployee:
    'create an account for a new person. Needs their full name, email, employee number, job title, department and role \u2014 set personName, email, employeeNumberNew, jobTitle, department and role from whatever they said. Leave any they did not say as null.',
  updateEmployeeDetails:
    'change one employee\u2019s job title, department, or both. Set personName or employeeNumber for who, and jobTitle and/or department for what changes. This cannot change pay.',
  resetPassword:
    'issue a new temporary password for one employee. Set personName or employeeNumber. Nobody can read an existing password; this replaces it.',
  generateJobDescription:
    'write a new job description. Set title to the role they named, and text to everything else they said about it — years of experience, skills, department, level. If they only named a role, title alone is enough.',
  regenerateJobDescriptionSection:
    'rewrite one section of an existing job description with the existing AI service. Set title to identify the job description, jobDescriptionSection to one of title, summary, responsibilities, requiredQualifications, requiredSkills, preferredSkills, softSkills, experience, education, or workingConditions, and text to any rewrite instruction. Always show the exact document and section for confirmation.',
  addKnowledgeText:
    'add a company knowledge-base article from text. Set title and text. It is shared with every role by default, so always show that audience and require confirmation. Use this for a policy, procedure, FAQ, onboarding or system reference, not live employee data.',
  deleteKnowledgeText:
    'permanently remove one company knowledge-base article. Set title to identify it. Always show the exact article selected and require confirmation before deleting it.',
  approveJobDescription:
    'approve a drafted job description, which also opens the vacancy as a draft. Set title for which one.',
  createOpeningFromJobDescription:
    'create a draft vacancy from an approved job description that is not yet linked to a vacancy. Set title for which description.',
  deleteJobDescription:
    'permanently delete a job description. Set title for which one. This is only for an explicit delete request, never for approval or editing.',
  createJob:
    'open a vacancy directly, without going through a job description. Set title and department; location and employmentType if they said. It is created as a draft \u2014 publishing it is a separate step.',
  updateJobOpening:
    'fill in or change a vacancy\u2019s details \u2014 its location, employment type or deadline. Set title for which vacancy, and whichever of location, employmentType, startDate (as the deadline) they gave. Use this when publishing was refused for a missing field.',
  publishOpening: 'publish a vacancy to the public careers page. Set title for which vacancy.',
  moveApplication:
    'move a job application to another stage (screening, interview, offer, hired, rejected). Set personName for the applicant and stage for where it goes.',
  analyseApplication: 'read an applicant’s CV against the vacancy again. Set personName for the applicant.',
  generateInterview: 'generate the private 10-question interview draft for one applicant from the approved job description and their CV. Set personName. It does not send anything to the candidate.',
  reviewInterviewQuestion:
    'review one question in an applicant interview draft. Set personName, questionNumber from 1 to 10, and decision: approve accepts it; reject regenerates it and requires text explaining what to improve. Always show the exact question and require confirmation.',
  evaluateInterview: 'evaluate one applicant\'s completed interview again with the existing interview evaluation service. Set personName. It never makes a hiring decision.',
  sendInterview: 'send an already reviewed interview to one applicant. Set personName, opensAt as an exact ISO 8601 date-time with timezone, and durationMinutes between 15 and 240. It only sends a draft whose questions HR already approved and always requires confirmation.',
  runPayroll: 'calculate one payroll month. Set startDate to the first day of the requested month as YYYY-MM-01; use the current month only when no month was named. This calculates only: it never approves or finalizes payroll.',
  auditPayroll:
    'run the payroll audit for an already calculated month. Set startDate to the first day of that month as YYYY-MM-01. This analyzes findings only and does not change any payslip.',
  approvePayroll:
    'approve an already calculated payroll month. Set startDate to the first day of that month as YYYY-MM-01. Approval locks the run and makes processed payslips available, so it always requires confirmation.',
  deleteCalendarEvent:
    'delete a calendar event the asker is allowed to manage. Set title to the event name. This is only for an explicit delete or remove request.',
  changeEmployeeRole:
    'change what one employee is in the system: make them a manager, move them to HR, make them an administrator, or back to employee. Set personName or employeeNumber, and role.',
  closeOpening:
    'STOP a vacancy accepting applications, keeping it and everything sent to it \u2014 "\u0627\u063a\u0644\u0642 \u0627\u0644\u0648\u0638\u064a\u0641\u0629", "\u0633\u0643\u0651\u0631 \u0627\u0644\u0648\u0638\u064a\u0641\u0629", "close the vacancy", "stop accepting applications". Set title. This is what people almost always mean; deleteOpening destroys the record and is a different, rarer instruction.',
  deleteOpening:
    'DESTROY a vacancy and every application sent to it, permanently. Only for "\u0627\u062d\u0630\u0641", "\u0627\u0645\u0633\u062d", "delete", "remove" \u2014 never for "close" or "\u0627\u063a\u0644\u0642", which is closeOpening. Set title.',
}
