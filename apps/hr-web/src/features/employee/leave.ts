import type { EmployeeRequest, LeaveBalance, LeaveType } from '@hr/shared'
import type { Message } from '@/features/i18n/dictionary'
import { parseDay, rangesOverlap, workingDaysBetween } from '@/lib/workdays'

/**
 * The same leave rules the API enforces, run again in the form.
 *
 * This is for the reader, not for safety: it explains the problem while they are
 * still typing instead of after a round trip. The server re-checks everything
 * and is the only decision that counts, so the two agreeing matters more than
 * either being clever — both subtract the pending hold before allowing a day.
 */

/** What the employee can still ask for today: recorded balance minus pending holds. */
export function availableDays(type: LeaveType, balance: LeaveBalance) {
  if (type === 'unpaid') return Number.POSITIVE_INFINITY
  if (type === 'annual') return Math.max(0, balance.annualRemaining - balance.heldAnnual)
  return Math.max(0, balance.sickRemaining - balance.heldSick)
}

/** Leave that still occupies the calendar — submitted or approved, but not cancelled. */
export function blockingLeave(requests: EmployeeRequest[]) {
  return requests.filter(
    (request) => request.leave !== null && (request.status === 'pending' || request.status === 'approved'),
  )
}

export function findOverlap(from: Date, to: Date, requests: EmployeeRequest[]) {
  return blockingLeave(requests).find((request) => {
    const leave = request.leave!
    return rangesOverlap(from, to, parseDay(leave.from)!, parseDay(leave.to)!)
  })
}

export interface LeaveDraft {
  type: LeaveType
  /** `YYYY-MM-DD`, straight from the date inputs. */
  from: string
  to: string
}

export interface LeaveCheck {
  errors: { from?: Message; to?: Message }
  /** Working days in the chosen range, 0 when the range is not usable yet. */
  days: number
  /** Infinity for unpaid leave, which has no balance. */
  available: number
  valid: boolean
  range: { from: Date; to: Date } | null
}

/** Validates a draft against the calendar, the balance, and existing requests. */
export function checkLeave(
  draft: LeaveDraft,
  context: { balance: LeaveBalance; holidays: string[]; requests: EmployeeRequest[] },
): LeaveCheck {
  const { balance, holidays, requests } = context
  const available = availableDays(draft.type, balance)
  const from = parseDay(draft.from)
  const to = parseDay(draft.to)
  const errors: LeaveCheck['errors'] = {}

  if (!from) errors.from = { key: 'leaveForm.errFrom' }
  if (!to) errors.to = { key: 'leaveForm.errTo' }

  if (!from || !to) return { errors, days: 0, available, valid: false, range: null }

  if (to < from) {
    return { errors: { to: { key: 'leaveForm.errOrder' } }, days: 0, available, valid: false, range: null }
  }

  const holidayDates = holidays.map((h) => parseDay(h)).filter((d): d is Date => d !== null)
  const days = workingDaysBetween(from, to, holidayDates)

  if (days === 0) {
    errors.to = { key: 'leaveForm.errNoWorkdays' }
  } else if (days > available) {
    errors.to = {
      key: 'leaveForm.errBalance',
      vars: { days: { key: 'common.days', vars: { count: available } }, type: { key: `leaveType.${draft.type}` } },
    }
  } else {
    const clash = findOverlap(from, to, requests)
    if (clash?.leave) {
      errors.to = {
        key: 'leaveForm.errOverlap',
        vars: { range: { key: 'common.dayRange', vars: { from: clash.leave.from, to: clash.leave.to } } },
      }
    }
  }

  const valid = !errors.from && !errors.to
  return { errors, days, available, valid, range: { from, to } }
}
