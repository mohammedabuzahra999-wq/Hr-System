import type { TKey } from '@/features/i18n/dictionary'
import { ApiError } from './api'

/**
 * Turns an API failure into a dictionary key.
 *
 * The server sends a machine-readable code, never a sentence, so the message the
 * user reads is translated on the client like every other string — and a code
 * with no entry yet falls back to a generic message instead of showing the raw
 * code to a customer.
 */
const KNOWN = new Set<string>([
  'invalidCredentials',
  'accountDisabled',
  'networkUnavailable',
  'notAuthenticated',
  'forbidden',
  'alreadyCheckedIn',
  'alreadyCheckedOut',
  'notCheckedIn',
  'requestNotPending',
  'requestNotFound',
  'currentPasswordWrong',
  'tooShort',
  'tooCommon',
  'emailTaken',
  'validationFailed',
  'cannotChangeOwnRole',
  'useChangePassword',
  'eventNotFound',
  'fileTooLarge',
  'fileTypeNotAllowed',
  'fileEmpty',
  'fileMissing',
  'invalidUpload',
  'cvNeedsOneOwner',
  'cvNotFound',
  'cvFileMissing',
  'candidateNotFound',
  'openingNotFound',
  'employeeNotFound',
  'openingIncomplete',
  'openingHasNoDescription',
  'descriptionNotApproved',
  'applicationNotFound',
  'openingHasApplications',
  'descriptionAlreadyLinked',
  'tooManyRequests',
  'jobNotFound',
  'emailRequired',
  'fileRequired',
  'interviewNotFound',
  'interviewExpired',
  'alreadyAnswered',
  'interviewAlreadyExists',
  'interviewNotOpen',
  'interviewRequiresCvAnalysis',
  'interviewScheduleInPast',
  'jobHasNoRequirements',
  'knowledgeFileEmpty',
  'knowledgeFileTooLarge',
  'knowledgeFileType',
  'knowledgeFileUnreadable',
  'knowledgeAudienceInvalid',
  'knowledgeTitleInvalid',
  'knowledgeNotFound',
  'payrollAuditRequired',
  'payrollFindingsNeedReview',
  'payrollAuditRunning',
  'payrollRunNotCalculated',
  'payrollAuditNotFound',
  'payrollFindingNotFound',
  'payrollAdjustmentNotFound',
  'payrollAdjustmentNotPending',
  'runAlreadyApproved',
])

/**
 * The variables a translated error needs, if any.
 *
 * Kept beside `errorKey` so the two cannot disagree: a key that takes
 * `{minutes}` is only ever returned when the minutes are available here.
 */
export function errorVars(error: unknown): Record<string, string | number> | undefined {
  if (error instanceof ApiError && error.status === 429 && error.retryAfter) {
    return { minutes: Math.max(1, Math.ceil(error.retryAfter / 60)) }
  }
  return undefined
}

export function errorKey(error: unknown): TKey {
  /**
   * A rate-limit refusal says how long to wait when the server told us.
   *
   * The first version said "wait a few minutes" for a window that was an hour.
   * A message that is confidently wrong is worse than a vague one — the next
   * time it says anything, nobody believes it.
   */
  if (error instanceof ApiError && error.status === 429) {
    return error.retryAfter ? ('err.tooManyRequestsIn' as TKey) : ('err.tooManyRequests' as TKey)
  }

  if (error instanceof ApiError) {
    // Some endpoints put the code in `message` (Hono's HTTPException) rather
    // than in `error`; check both before giving up.
    for (const candidate of [error.code, error.message]) {
      if (KNOWN.has(candidate)) return `err.${candidate}` as TKey
    }
  }
  return 'err.unknown'
}

/**
 * The field names a validation failure named, if any.
 *
 * The server already sends `details` — which field, and why — and the app was
 * throwing it away to show "some of what you entered is invalid". That sentence
 * tells someone their application was refused and leaves them to guess which of
 * nine fields to change, which is how a form gets abandoned.
 */
export function errorFields(error: unknown): string[] {
  if (error instanceof ApiError && error.details) return Object.keys(error.details)
  return []
}

/**
 * The message and the numbers in it, together.
 *
 * `errorKey` and `errorVars` were two calls, and eight of the nine places that
 * needed them called only the first — so a rate-limit refusal rendered
 * "try again in about {minutes} minutes", with the braces. The wording was
 * right, the variables were sitting in a function nobody remembered to call.
 *
 * One function instead, because a pair that must be used together and can be
 * used apart will be used apart.
 */
/**
 * What a vacancy's missing fields are called, on the screen they are edited on.
 *
 * Reusing the recruitment page's own labels rather than inventing wording, so
 * the refusal names the boxes using the words printed above them.
 */
const FIELD_LABEL: Record<string, TKey> = {
  title: 'recruit.title' as TKey,
  department: 'recruit.department' as TKey,
  location: 'recruit.location' as TKey,
  employmentType: 'recruit.employmentType' as TKey,
}

export function errorText(
  t: (key: TKey, vars?: Record<string, string | number>) => string,
  error: unknown,
): string {
  /*
   * When the server said which fields, say which fields.
   *
   * The generic sentence lists all four whatever is actually empty, which sends
   * somebody to check boxes that are already filled in. The list was in the
   * response the whole time.
   */
  const key = errorKey(error)
  if (key === 'err.openingIncomplete' && error instanceof ApiError && error.missing?.length) {
    const named = error.missing.filter((f) => FIELD_LABEL[f]).map((f) => t(FIELD_LABEL[f]!))
    if (named.length > 0) {
      return t('err.openingIncompleteFields' as TKey, { what: named.join(t('common.listJoin')) })
    }
  }
  return t(key, errorVars(error))
}
