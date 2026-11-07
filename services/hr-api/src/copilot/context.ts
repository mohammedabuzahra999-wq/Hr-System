import type { CopilotPlan, VoiceUiContext } from '@hr/shared'

/**
 * Short-lived structured context for a live Copilot conversation.
 *
 * It contains only UI references, never payroll figures, CV text, or model
 * reasoning. It improves follow-ups such as "analyze it" after a payroll
 * period has been selected, while every read or write remains authorised when
 * it is actually executed.
 */
const TTL_MS = 5 * 60 * 1000
const contexts = new Map<string, { value: VoiceUiContext; at: number }>()

export function rememberContext(userId: string, value: VoiceUiContext | undefined): boolean {
  if (!value || Object.keys(value).length === 0) return false
  const previous = contexts.get(userId)
  const routeChanged = Boolean(
    previous &&
    Date.now() - previous.at <= TTL_MS &&
    previous.value.currentPage &&
    value.currentPage &&
    previous.value.currentPage !== value.currentPage,
  )
  contexts.set(userId, { value, at: Date.now() })
  return routeChanged
}

export function contextFor(userId: string): VoiceUiContext | null {
  const found = contexts.get(userId)
  if (!found) return null
  if (Date.now() - found.at > TTL_MS) {
    contexts.delete(userId)
    return null
  }
  return found.value
}

/** Apply only a selected payroll period to payroll-only read operations. */
export function withContextualPayrollPeriod(plan: CopilotPlan, context: VoiceUiContext | null): CopilotPlan {
  if (plan.period || !context?.selectedPayrollPeriod) return plan
  if (!['payrollInsights', 'payrollReadiness', 'payrollRunSummary', 'payrollAuditSummary', 'payrollFindings'].includes(plan.intent)) return plan

  const [year, month] = context.selectedPayrollPeriod.split('-').map(Number)
  if (!year || !month) return plan
  return { ...plan, period: 'calendarMonth', year, month }
}
