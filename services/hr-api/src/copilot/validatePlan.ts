import type { ReadRule } from './readRules.js'
import { copilotPlanSchema, type CopilotPlan } from '@hr/shared'

export type RoutingSource = 'deterministic' | 'phrasebook' | 'training' | 'model'
export type PlanValidation = (
  | { ok: true; plan: CopilotPlan; routingSource: RoutingSource }
  | { ok: false; reason: 'aiInvalidOutput'; routingSource: RoutingSource;
      validation: 'schema' | 'semantic'; issues: readonly string[] }
) & { routingRule?: ReadRule }

/** One candidate-plan boundary. No role decisions, inferred values or rerouting.
 * Failure metadata contains fixed codes only, never input or employee values.
 * Provider schemas stay unchanged; these checks are server-side only.
 */
export function validateCopilotPlan(candidate: unknown, routingSource: RoutingSource): PlanValidation {
  const parsed = copilotPlanSchema.safeParse(candidate)
  if (!parsed.success) return { ok: false, reason: 'aiInvalidOutput', routingSource,
    validation: 'schema', issues: ['invalid_plan_shape'] }
  const plan = parsed.data
  const issues: string[] = []
  if (plan.period === 'calendarMonth' && plan.month === null) issues.push('calendar_month_required')
  if (plan.period !== 'calendarMonth' && (plan.month !== null || plan.year !== null)) issues.push('calendar_fields_without_calendar_period')
  // Refused candidates may retain the parameters that caused the refusal.
  // They never execute, and existing local rules intentionally keep that context.
  if (plan.intent !== 'outOfScope') {
    if (plan.refusalReason !== null) issues.push('refusal_on_executable_intent')
    if (plan.payrollTopic !== null && plan.intent !== 'payrollInsights') issues.push('payroll_topic_on_wrong_intent')
    if (plan.rankBy !== null && plan.intent !== 'attendanceRanking') issues.push('ranking_on_wrong_intent')
    if (plan.reportType !== null && !['generateReport', 'myReport', 'employeeFile', 'departmentAbsenceComparison'].includes(plan.intent)) {
      issues.push('report_type_on_wrong_intent')
    }
    if (plan.reportType === 'payroll' && plan.intent !== 'employeeFile') issues.push('payroll_report_requires_employee_file')
    if (plan.intent === 'payrollInsights' && (plan.personName !== null || plan.employeeNumber !== null)) issues.push('person_scoped_company_payroll')
  }
  return issues.length
    ? { ok: false, reason: 'aiInvalidOutput', routingSource, validation: 'semantic', issues }
    : { ok: true, plan, routingSource }
}
