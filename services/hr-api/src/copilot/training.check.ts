import {
  actionTrainingExamples,
  exactTrainingAction,
  exactTrainingMatch,
  localTrainingAction,
  localTrainingPlan,
  isLikelyInstruction,
  questionTrainingExamples,
  trainingStats,
} from './training.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
  console.log(`  âœ“ ${message}`)
}

console.log(`Loaded ${trainingStats.totalRows} labelled rows; ${trainingStats.usableRows} map to existing assistant features.`)
assert(trainingStats.totalRows === 10_000, 'the complete supplied training set is present')
assert(trainingStats.usableRows >= 8_500, 'the great majority maps to a supported feature')

const attendance = questionTrainingExamples('can you generate attendance report', 'admin')
assert(attendance.some((example) => example.intent === 'generateReport' && example.reportType === 'attendance'), 'report wording reaches the report intent')

const exactAttendance = exactTrainingMatch('can you generate attendance report', 'admin')
assert(exactAttendance?.kind === 'intent' && exactAttendance.intent === 'generateReport', 'an exact report example is routed locally')

const employeeReport = localTrainingPlan('\u0627\u0639\u0637\u064a\u0646\u064a \u062a\u0642\u0631\u064a\u0631 \u0639\u0646 \u0627\u0644\u0645\u0648\u0636\u0641\u064a\u0646', 'hr')
assert(employeeReport?.intent === 'generateReport' && employeeReport.reportType === 'employees', 'Arabic employee reports work without an AI key')

const employeePayrollReport = localTrainingPlan('\u0627\u0639\u0637\u064a\u0646\u064a \u062a\u0642\u0631\u064a\u0631 \u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0648\u0636\u0641 \u0623\u062d\u0645\u062f \u0639\u0644\u064a', 'hr')
assert(
  employeePayrollReport?.intent === 'employeeFile' && employeePayrollReport.reportType === 'payroll' && employeePayrollReport.personName === '\u0623\u062d\u0645\u062f \u0639\u0644\u064a',
  'a named employee payroll request never falls back to a company report',
)

const payrollReadiness = localTrainingPlan('\u0647\u0644 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u062c\u0627\u0647\u0632\u0629 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629', 'hr')
assert(payrollReadiness?.intent === 'payrollInsights' && payrollReadiness.payrollTopic === 'readiness', 'Payroll Agent recognises payroll readiness without a model')

const payrollSummary = localTrainingPlan('\u0645\u0644\u062e\u0635 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0644\u0644\u0634\u0647\u0631 9 \u0645\u0646 2026', 'hr')
assert(
  payrollSummary?.intent === 'payrollInsights' && payrollSummary.payrollTopic === 'summary' && payrollSummary.period === 'calendarMonth' && payrollSummary.month === 9 && payrollSummary.year === 2026,
  'Payroll Agent summary keeps the requested calendar month',
)

const payrollDeductions = localTrainingPlan('\u0627\u0639\u0631\u0636 \u0627\u0639\u0644\u0649 \u062e\u0635\u0648\u0645\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631', 'hr')
assert(payrollDeductions?.intent === 'payrollInsights' && payrollDeductions.payrollTopic === 'deductions', 'Payroll Agent recognises payroll deductions')

const payrollVariance = localTrainingPlan('\u0642\u0627\u0631\u0646 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0645\u0639 \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u0627\u0636\u064a', 'hr')
assert(payrollVariance?.intent === 'payrollInsights' && payrollVariance.payrollTopic === 'variance', 'Payroll Agent recognises month-to-month variance')

const shortNamedSalary = localTrainingPlan('\u0643\u0645 \u0631\u0627\u062a\u0628 \u0623\u062d\u0645\u062f \u0639\u0644\u064a', 'hr')
assert(shortNamedSalary?.intent === 'employeeFile' && shortNamedSalary.personName === '\u0623\u062d\u0645\u062f \u0639\u0644\u064a', 'a short named salary question is scoped to the employee file')

const highestPaidEmployee = localTrainingPlan('\u0645\u0646 \u0627\u0644\u0645\u0648\u0636\u0641 \u0635\u0627\u062d\u0628 \u0627\u0639\u0644\u0649 \u0631\u0627\u062a\u0628', 'hr')
assert(highestPaidEmployee?.intent === 'payrollInsights' && highestPaidEmployee.payrollTopic === 'highestNetPay', 'a highest-paid employee question is not mistaken for a person name')

const lowestPaidEmployee = localTrainingPlan('\u0645\u0646 \u0627\u0644\u0645\u0648\u0636\u0641 \u0635\u0627\u062d\u0628 \u0627\u0642\u0644 \u0631\u0627\u062a\u0628', 'hr')
assert(lowestPaidEmployee?.intent === 'payrollInsights' && lowestPaidEmployee.payrollTopic === 'lowestNetPay', 'a lowest-paid employee question is routed to the payroll ranking')

const septemberEmployeePayroll = localTrainingPlan('\u0627\u0639\u0637\u064a\u0646\u064a \u062a\u0642\u0631\u064a\u0631 \u0644\u0631\u0648\u0627\u062a\u062a\u0628 \u0627\u0644\u0645\u0648\u0636\u0641 \u0627\u062d\u0645\u062f \u0639\u0644\u064a \u0644\u0634\u0647\u0631 9', 'hr')
assert(
  septemberEmployeePayroll?.personName === '\u0627\u062d\u0645\u062f \u0639\u0644\u064a' && septemberEmployeePayroll.period === 'calendarMonth' && septemberEmployeePayroll.month === 9,
  'an Arabic month qualifier is not mistaken for part of the employee name',
)

const newHiresReport = localTrainingPlan('\u0627\u0639\u0631\u0636 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0627\u0644\u062c\u062f\u062f \u0644\u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631 \u0648\u0627\u0639\u0645\u0644\u0644\u064a \u062a\u0642\u0631\u064a\u0631', 'hr')
assert(
  newHiresReport?.intent === 'generateReport' && newHiresReport.reportType === 'newHires' && newHiresReport.period === 'thisMonth',
  'new-hire reports keep the requested month without an AI key',
)

const numberedMonth = localTrainingPlan('\u0628\u062f\u064a \u062a\u0642\u0631\u064a\u0631 \u0639\u0646 \u0627\u0644\u0634\u0647\u0631 8 \u0645\u0646 2026', 'hr')
assert(
  numberedMonth?.intent === 'generateReport' && numberedMonth.period === 'calendarMonth' && numberedMonth.month === 8 && numberedMonth.year === 2026,
  'numbered Arabic months retain their month and year instead of falling back to the current month',
)

const departmentComparison = localTrainingPlan('\u0642\u0627\u0631\u0646 \u0646\u0633\u0628\u0629 \u0627\u0644\u063a\u064a\u0627\u0628 \u0628\u064a\u0646 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0622\u062e\u0631 6 \u0623\u0634\u0647\u0631', 'hr')
assert(
  departmentComparison?.intent === 'departmentAbsenceComparison' && departmentComparison.reportType === 'department' && departmentComparison.period === 'lastSixMonths',
  'six-month department comparisons are routed locally with their full period',
)

const employeeOwnReport = localTrainingPlan('\u0627\u0639\u0637\u064a\u0646\u064a \u062a\u0642\u0631\u064a\u0631 \u0639\u0646 \u062d\u0636\u0648\u0631\u064a', 'employee')
assert(employeeOwnReport?.intent === 'myReport' && employeeOwnReport.reportType === 'attendance', 'an employee receives only their own offline report')

const checkIn = actionTrainingExamples('mark me present', 'employee')
assert(checkIn.some((example) => example.action === 'checkIn'), 'attendance instruction reaches check-in')

const localCheckIn = localTrainingAction('mark me present', 'employee')
assert(localCheckIn?.action === 'checkIn', 'familiar actions can work without an AI key')

const spokenDirectoryLookup = localTrainingAction('\u062f\u0648\u0631\u0644\u064a \u0639\u0644\u0649 \u0623\u062d\u0645\u062f', 'hr')
assert(spokenDirectoryLookup?.action === 'openEmployeeFile' && spokenDirectoryLookup.personName === '\u0623\u062d\u0645\u062f', 'a short Arabic employee lookup enters the protected directory flow without an AI key')
assert(localTrainingPlan('\u062f\u0648\u0631\u0644\u064a \u0639\u0644\u0649 \u0623\u062d\u0645\u062f', 'employee')?.refusalReason === 'notPermitted', 'employee lookup wording never bypasses the directory role gate')
const namedAttendance = localTrainingPlan('\u062c\u064a\u0628 attendance \u062a\u0628\u0639 \u0623\u062d\u0645\u062f', 'hr')
assert(namedAttendance?.intent === 'employeeFile' && namedAttendance.personName === '\u0623\u062d\u0645\u062f', 'mixed-language named attendance stays scoped to that employee')

const employeeApproval = actionTrainingExamples('approve the leave request', 'employee')
assert(!employeeApproval.some((example) => example.action === 'decideRequest'), 'a labelled example cannot grant an employee leave approval')

const hrApproval = actionTrainingExamples('approve the leave request', 'hr')
assert(!hrApproval.some((example) => example.action === 'decideRequest'), 'a labelled example cannot grant HR leave approval')

const managerApproval = actionTrainingExamples('approve the leave request', 'manager')
assert(managerApproval.some((example) => example.action === 'decideRequest'), 'a manager may receive relevant approval examples')

const approvalText = '\u0645\u0645\u0643\u0646 approve the leave request please'
const exactManagerApproval = exactTrainingMatch(approvalText, 'manager')
assert(exactManagerApproval?.kind === 'action' && exactManagerApproval.action === 'decideRequest', 'an exact approval example is useful to a manager')

const exactEmployeeApproval = exactTrainingMatch(approvalText, 'employee')
assert(exactEmployeeApproval === null, 'an exact action example still cannot grant an employee approval')
assert(exactTrainingAction(approvalText) === 'decideRequest', 'the same forbidden instruction can receive a clear refusal')

const exactHrApproval = exactTrainingMatch(approvalText, 'hr')
assert(exactHrApproval === null, 'an exact action example still cannot grant HR leave approval')

const salaryContract = localTrainingPlan('\u0627\u0639\u0645\u0644\u064a \u0639\u0642\u062f \u0631\u0627\u062a\u0628', 'hr')
assert(salaryContract?.intent === 'doAction', 'a salary contract request starts the protected action flow')
assert(localTrainingAction('\u0627\u0639\u0645\u0644\u064a \u0639\u0642\u062f \u0631\u0627\u0628', 'hr') === null, 'a misspelled contract phrase is not guessed into a payroll write')
assert(localTrainingAction('\u0627\u0639\u0645\u0644\u064a \u0639\u0642\u062f \u0631\u0627\u062a\u0628', 'hr')?.action === 'setSalary', 'a salary contract request resolves to setSalary')
assert(localTrainingPlan('\u0627\u0639\u0645\u0644\u064a \u0639\u0642\u062f \u0631\u0627\u062a\u0628', 'employee')?.intent === 'outOfScope', 'an employee cannot start a salary contract')

const bonusInstruction = localTrainingAction('\u0623\u0636\u0641 \u0645\u0643\u0627\u0641\u0623\u0629 100 \u0644\u0623\u062d\u0645\u062f \u0628\u0633\u0628\u0628 \u0627\u0644\u0623\u062f\u0627\u0621', 'hr')
assert(bonusInstruction?.action === 'createPayrollAdjustment' && bonusInstruction.payrollAdjustmentKind === 'bonus', 'a bonus instruction creates a pending payroll adjustment plan')
assert(localTrainingPlan('\u0623\u0636\u0641 \u0645\u0643\u0627\u0641\u0623\u0629 100 \u0644\u0623\u062d\u0645\u062f', 'employee')?.intent === 'outOfScope', 'an employee cannot create a payroll adjustment')
const octoberPayrollRun = localTrainingAction('\u062c\u0647\u0632 \u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0634\u0647\u0631 10 \u0645\u0646 2026', 'hr')
assert(octoberPayrollRun?.action === 'runPayroll' && octoberPayrollRun.startDate === '2026-10-01', 'a requested payroll month is retained for the protected calculation action')
assert(localTrainingPlan('\u062c\u0647\u0632 \u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0634\u0647\u0631 10', 'employee')?.intent === 'outOfScope', 'an employee cannot calculate payroll')
const colloquialBonus = localTrainingAction('\u0636\u064a\u0641 100 \u0644\u0645\u062d\u0645\u062f \u0645\u0643\u0627\u0641\u0627\u0629', 'hr')
assert(colloquialBonus?.action === 'createPayrollAdjustment' && colloquialBonus.payrollAdjustmentKind === 'bonus', 'colloquial Arabic add-bonus wording starts the protected action instead of a bonus query')
const numberedBonus = localTrainingAction('\u0636\u064a\u0641 100 \u0645\u0643\u0627\u0641\u0627\u0629 \u0644\u0644\u0645\u0648\u0638\u0641 EMP-1003', 'hr')
assert(
  numberedBonus?.action === 'createPayrollAdjustment' && numberedBonus.employeeNumber === 'EMP-1003' && numberedBonus.personName === null,
  'a payroll adjustment can identify the employee by employee number instead of a name',
)

/* Common imperative/resource pairs skip the intent-model round trip.  The
   action resolver still runs afterwards to collect the title/name/date, so
   these assertions intentionally only verify the closed doAction boundary. */
const approveDescription = localTrainingPlan('\u0627\u0639\u062a\u0645\u062f \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0644\u0645\u062d\u0627\u0633\u0628', 'hr')
assert(approveDescription?.intent === 'doAction', 'an Arabic job-description approval skips the intent model')
const forbiddenDescriptionApproval = localTrainingPlan('\u0627\u0639\u062a\u0645\u062f \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0644\u0645\u062d\u0627\u0633\u0628', 'employee')
assert(
  forbiddenDescriptionApproval?.intent === 'outOfScope' && forbiddenDescriptionApproval.refusalReason === 'notPermitted',
  'local command routing still refuses a job-description approval outside the role capability',
)
const calendarDelete = localTrainingPlan('\u0627\u062d\u0630\u0641 \u0645\u0648\u0639\u062f \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629', 'manager')
assert(calendarDelete?.intent === 'doAction', 'a calendar delete command skips the intent model before confirmation')
const auditPayroll = localTrainingPlan('\u062f\u0642\u0642 \u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0634\u0647\u0631 10', 'hr')
assert(auditPayroll?.intent === 'doAction', 'a payroll audit command skips the intent model before protected review')
assert(isLikelyInstruction('\u0627\u0646\u0634\u0626 \u0648\u0638\u064a\u0641\u0629 \u0634\u0627\u063a\u0631\u0629'), 'Arabic imperative wording qualifies for accepted-command routing')
assert(!isLikelyInstruction('\u0643\u0645 \u0627\u062c\u0627\u0632\u0629 \u0639\u0646\u062f\u064a'), 'an Arabic question cannot take the accepted-command shortcut')

const colloquialLeaveBalance = exactTrainingMatch('قديش باقيلي إجازات', 'employee')
assert(
  colloquialLeaveBalance?.kind === 'intent' && colloquialLeaveBalance.intent === 'myLeaveBalance',
  'supplemental Jordanian Arabic recognises an employee leave-balance question',
)
const spokenScroll = localTrainingAction('انزلي بالصفحة لتحت', 'employee')
assert(spokenScroll?.action === 'scrollPage' && spokenScroll.scrollTarget === 'down', 'supplemental voice wording recognises page scrolling locally')
const supplementalInterviewReview = exactTrainingMatch('اعد كتابة السؤال رقم سبعة', 'hr')
assert(
  supplementalInterviewReview?.kind === 'action' && supplementalInterviewReview.action === 'reviewInterviewQuestion',
  'supplemental interview wording reaches the registered question-review capability',
)
assert(
  exactTrainingMatch('اعد كتابة السؤال رقم سبعة', 'employee') === null,
  'supplemental wording never grants an interview-review capability to an employee',
)
const supplementalBonus = localTrainingAction('ضيف مية دينار مكافأة لمحمد', 'hr')
assert(
  supplementalBonus?.action === 'createPayrollAdjustment' && supplementalBonus.payrollAdjustmentKind === 'bonus',
  'supplemental colloquial bonus wording reaches the protected payroll adjustment flow',
)
assert(
  localTrainingPlan('ضيف مية دينار مكافأة لمحمد', 'employee')?.intent === 'outOfScope',
  'the same supplemental payroll wording remains unavailable outside the authorised role',
)
console.log('the training set improves language matching without becoming an authority')
