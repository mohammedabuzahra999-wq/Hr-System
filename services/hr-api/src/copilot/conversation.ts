import type { CopilotAction, CopilotActionPlan, CopilotPlan } from '@hr/shared'
import type { Gap } from './perform.js'

/**
 * What the assistant is in the middle of.
 *
 * Every message has been independent until now: "submit leave for me" was
 * answered with "which dates?", and "from Sunday" arrived as a fresh sentence
 * with nothing to attach itself to. The person had understood the exchange as a
 * conversation and the system had not, which is the difference between an
 * assistant and a search box that talks.
 *
 * So a question the assistant asks is recorded with the half-finished
 * instruction behind it. The next message is read as the answer first, and
 * only treated as something new if it plainly is not one.
 *
 * Held in memory rather than in the database, deliberately. This is the state
 * of a conversation happening now: it is worthless after a few minutes, it
 * belongs to one person, and writing it down would mean deciding when to
 * delete it. A restart loses it, and losing it costs one re-asked question.
 */

export interface Pending {
  /** The instruction being assembled. */
  action: CopilotAction
  /** What has been worked out so far. */
  collected: CopilotActionPlan
  /**
   * What was asked for: the wording, and the fields it was asked about.
   *
   * Both halves are needed. The wording is what the reply has to be read
   * against — "which kind of leave" and "leaveKind" are the same thing to the
   * server and not to a model reading a one-word answer. The fields are where
   * the answer goes once it is understood, which is not guessable from the
   * wording when a plan holds several fields that a question could plausibly
   * mean.
   */
  asked: Gap
  /**
   * Optional details already asked about and turned down.
   *
   * Carried forward so a declined question is not asked again on the next
   * message, which is the difference between an assistant that takes an answer
   * and one that nags.
   */
  declined: readonly (keyof CopilotActionPlan)[]
  at: number
}

/**
 * Five minutes, then it is not a conversation any more.
 *
 * Somebody who answers "Sunday" a minute after being asked is continuing.
 * Somebody who types it half an hour later has moved on and is starting
 * something — treating that as an answer would file leave they never asked
 * for, from a question they have forgotten.
 */
const TTL_MS = 5 * 60 * 1000

/** A missing read parameter, separate from an action that may later write data. */
export interface ReadClarification {
  kind: 'attendanceScope'
  timing: Pick<CopilotPlan, 'period' | 'month' | 'year'>
}

const readClarifications = new Map<string, { value: ReadClarification; at: number }>()

export function rememberReadClarification(userId: string, value: ReadClarification, now = Date.now()): void {
  for (const [key, entry] of readClarifications) {
    if (now - entry.at > TTL_MS) readClarifications.delete(key)
  }
  readClarifications.set(userId, { value, at: now })
}

export function readClarificationFor(userId: string, now = Date.now()): ReadClarification | null {
  const entry = readClarifications.get(userId)
  if (!entry) return null
  if (now - entry.at > TTL_MS) {
    readClarifications.delete(userId)
    return null
  }
  return entry.value
}

export function clearReadClarification(userId: string): void {
  readClarifications.delete(userId)
}

const pending = new Map<string, Pending>()

export function remember(userId: string, state: Omit<Pending, 'at'>): void {
  sweep()
  pending.set(userId, { ...state, at: Date.now() })
}

export function pendingFor(userId: string): Pending | null {
  const found = pending.get(userId)
  if (!found) return null
  if (Date.now() - found.at > TTL_MS) {
    pending.delete(userId)
    return null
  }
  return found
}

/**
 * Cleared whenever anything completes, is refused, or is abandoned.
 *
 * Called on every path that ends a turn rather than only on success: a stale
 * pending task is worse than none, because the next unrelated message gets
 * read as an answer to a question nobody remembers being asked.
 */
export function clear(userId: string): void {
  pending.delete(userId)
}

/** Old entries, dropped on write so the map cannot grow without bound. */
function sweep(): void {
  const now = Date.now()
  for (const [key, state] of pending) {
    if (now - state.at > TTL_MS) pending.delete(key)
  }
}

/* ------------------------------------------------- the question just asked */

/**
 * The last question this person got an answer to.
 *
 * Separate from a pending task, because it is a different kind of thing: a task
 * is waiting for something, this is only context. Nothing is owed and nothing
 * is blocked — it exists so that a message which cannot stand on its own has
 * something to stand on.
 *
 * "وشو عن الشهر الي قبل" is the case. On its own it names no subject and
 * classified as an instruction, which then failed — the person had asked a
 * follow-up and been told the system did not understand. Read after "how was
 * my attendance this month" it is obvious, and obvious is what it should be.
 */
const asked = new Map<string, { plan: CopilotPlan; at: number }>()

export function rememberQuestion(userId: string, plan: CopilotPlan): void {
  const now = Date.now()
  for (const [key, state] of asked) {
    if (now - state.at > TTL_MS) asked.delete(key)
  }
  asked.set(userId, { plan, at: now })
}

/**
 * Null once it is old enough that a follow-up is unlikely to be one.
 *
 * The same five minutes as a pending task, for the same reason: a message half
 * an hour later is a new subject, and attaching it to a forgotten question
 * answers something nobody asked.
 */
export function lastQuestion(userId: string): CopilotPlan | null {
  const found = asked.get(userId)
  if (!found) return null
  if (Date.now() - found.at > TTL_MS) {
    asked.delete(userId)
    return null
  }
  return found.plan
}

/** A route change ends a UI-bound reference such as "show their attendance". */
export function clearQuestion(userId: string): void {
  asked.delete(userId)
}
