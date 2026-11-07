import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { navigationPathFor, pageIdForPath } from '@hr/shared'
import type {
  ActionDetail,
  ActionOutcome,
  ActionParams,
  ActionChoice,
  ActionProposal,
  CopilotActionPlan,
  SessionUser,
} from '@hr/shared'
import { db } from '../db/client.js'
import {
  announcements,
  applications,
  calendarEvents,
  candidates,
  jobDescriptions,
  jobOpenings,
  knowledgeDocuments,
  interviewQuestions,
  interviews,
  payrollAdjustments,
  payrollFindings,
  payrollRuns,
  requests,
  users,
} from '../db/schema.js'
import { callInternal } from '../internalApi.js'
import { dayKey } from '../domain/workdays.js'
import { DESTRUCTIVE, mayDo } from './actions.js'
import { GUIDE_PAGES } from '../guide/pages.js'

/**
 * Turning an instruction into something specific, then carrying it out.
 *
 * Two halves, and the split matters. `propose` resolves everything the model
 * left vague â€” which person, which request, which vacancy â€” and hands back a
 * description of what would happen. `run` does it, and only runs against a
 * request the person has confirmed.
 *
 * Resolution is where a careless assistant does damage, so every lookup here
 * is scoped before it searches rather than filtered afterwards: a manager
 * naming "Ahmad" searches their own reports, not the company. A name that
 * matches nobody within that scope is not found â€” never widened, never guessed
 * at, and never reported differently from a name that exists outside the scope,
 * because the difference between those two answers is itself information.
 */

const L = (en: string, ar: string) => ({ en, ar })

type Proposed =
  | { ok: true; proposal: ActionProposal }
  /** More than one record fits, so the person picks rather than the server guessing. */
  | { ok: true; choice: ActionChoice }
  /** `detail` names the candidates when more than one person matched. */
  | { ok: false; reason: Refusal; detail?: string; missing?: Gap }

/**
 * A detail the instruction is short of.
 *
 * `en`/`ar` are for the person. `fields` is for the resolver that reads their
 * reply: it names the plan fields the answer belongs in. Without it the reply
 * was read correctly and then dropped â€” asked â€œthe job titleâ€ and told
 * â€œPayroll Officerâ€, the model agreed it was an answer and filled in nothing,
 * because a plan has both `title` and `jobTitle` and the question named
 * neither. The guard above each gap already knows which field it tested, so it
 * says which rather than leaving a model to infer it from the wording.
 */
export type Gap = {
  en: string
  ar: string
  fields: readonly (keyof CopilotActionPlan)[]
  /**
   * Whether the instruction can go ahead without it.
   *
   * A required gap is a wall: there is no leave request without dates. An
   * optional one is a question worth asking that must not become an
   * interrogation â€” a job description is better for knowing the seniority and
   * the skills, and somebody who just wants the draft has to be able to say so
   * and get it. Asking without a way past is how an assistant ends up worse
   * than the form it replaced.
   */
  optional: boolean
}
export type Refusal = 'notPermitted' | 'unclear' | 'notFound' | 'notApplicable' | 'ambiguous'

const STAGE_LABEL: Record<string, { en: string; ar: string }> = {
  new: L('New', 'Ø¬Ø¯ÙŠØ¯'),
  underReview: L('Under review', 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©'),
  shortlisted: L('Shortlisted', 'Ù‚Ø§Ø¦Ù…Ø© Ù…Ø®ØªØµØ±Ø©'),
  interview: L('Interview', 'Ù…Ù‚Ø§Ø¨Ù„Ø©'),
  offer: L('Offer', 'Ø¹Ø±Ø¶'),
  hired: L('Hired', 'ØªÙ… Ø§Ù„ØªÙˆØ¸ÙŠÙ'),
  rejected: L('Rejected', 'Ù…Ø±ÙÙˆØ¶'),
}

const LEAVE_LABEL: Record<string, { en: string; ar: string }> = {
  annual: L('Annual leave', 'Ø¥Ø¬Ø§Ø²Ø© Ø³Ù†ÙˆÙŠØ©'),
  sick: L('Sick leave', 'Ø¥Ø¬Ø§Ø²Ø© Ù…Ø±Ø¶ÙŠØ©'),
  unpaid: L('Unpaid leave', 'Ø¥Ø¬Ø§Ø²Ø© Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨'),
}

const PAYROLL_ADJUSTMENT_LABEL: Record<string, { en: string; ar: string }> = {
  overtime: L('Overtime', '\u0639\u0645\u0644 \u0625\u0636\u0627\u0641\u064a'),
  bonus: L('Bonus', '\u0645\u0643\u0627\u0641\u0623\u0629'),
  allowance: L('Allowance', '\u0628\u062f\u0644'),
  deduction: L('Deduction', '\u062e\u0635\u0645'),
}
const ROLE_LABEL: Record<string, { en: string; ar: string }> = {
  employee: L('Employee', 'Ù…ÙˆØ¸Ù'),
  manager: L('Manager', 'Ù…Ø¯ÙŠØ±'),
  hr: L('HR', 'Ù…ÙˆØ§Ø±Ø¯ Ø¨Ø´Ø±ÙŠØ©'),
  admin: L('Administrator', 'Ù…Ø¯ÙŠØ± Ù†Ø¸Ø§Ù…'),
}

/** Vacancy fields, named as a person would say them rather than as columns. */
const FIELD_LABEL: Record<string, { en: string; ar: string }> = {
  title: L('a title', 'Ø¹Ù†ÙˆØ§Ù†'),
  department: L('a department', 'Ù‚Ø³Ù…'),
  location: L('a location', 'Ù…ÙˆÙ‚Ø¹'),
  employmentType: L('an employment type', 'Ù†ÙˆØ¹ Ø§Ù„ØªÙˆØ¸ÙŠÙ'),
}

const DOC_LABEL: Record<string, { en: string; ar: string }> = {
  certificate: L('Employment certificate', 'Ø´Ù‡Ø§Ø¯Ø© Ø¹Ù…Ù„'),
  detailsUpdate: L('Change to my details', 'ØªØ¹Ø¯ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§ØªÙŠ'),
}

const JOB_DESCRIPTION_SECTION_LABEL: Record<string, { en: string; ar: string }> = {
  title: L('Title', 'المسمّى'),
  summary: L('Summary', 'الملخص'),
  responsibilities: L('Responsibilities', 'المسؤوليات'),
  requiredQualifications: L('Required qualifications', 'المؤهلات المطلوبة'),
  requiredSkills: L('Required skills', 'المهارات المطلوبة'),
  preferredSkills: L('Preferred skills', 'المهارات المفضلة'),
  softSkills: L('Soft skills', 'المهارات الشخصية'),
  experience: L('Experience', 'الخبرة'),
  education: L('Education', 'التعليم'),
  workingConditions: L('Working conditions', 'ظروف العمل'),
}

/**
 * A refusal that says what it needed.
 *
 * "I did not understand" sends somebody away to rephrase with no idea what to
 * change. Naming the one missing piece â€” the event has no name, the date could
 * not be worked out â€” turns a dead end into a question they can answer.
 */
/**
 * A detail is missing, and this is the field it is missing from.
 *
 * At least one field is required by the signature, not by a convention. A gap
 * with no field named is the bug this exists to prevent: the person answers,
 * the answer is understood, and it is written nowhere. Forgetting it now fails
 * the build instead of failing quietly at the third message of a conversation.
 */
const needs = (
  en: string,
  ar: string,
  ...fields: [keyof CopilotActionPlan, ...(keyof CopilotActionPlan)[]]
) => ({ ok: false as const, reason: 'unclear' as const, missing: { en, ar, fields, optional: false } })

/**
 * Worth asking for, and not worth blocking on.
 *
 * Same shape as `needs`, so the question reaches the person the same way. The
 * difference is the way out: a reply that declines it is recorded as declined
 * and the instruction goes ahead without it, rather than asking again forever.
 */
const wants = (
  en: string,
  ar: string,
  ...fields: [keyof CopilotActionPlan, ...(keyof CopilotActionPlan)[]]
) => ({ ok: false as const, reason: 'unclear' as const, missing: { en, ar, fields, optional: true } })

const blank: ActionParams = {
  action: 'checkIn',
  targetId: null,
  leaveKind: null,
  documentKind: null,
  startDate: null,
  endDate: null,
  text: null,
  title: null,
  decision: null,
  stage: null,
  role: null,
  email: null,
  employeeNumberNew: null,
  jobTitle: null,
  department: null,
  jobDescriptionSection: null,
  amount: null,
  opensAt: null,
  durationMinutes: null,
  questionNumber: null,
  payrollAdjustmentKind: null,
  location: null,
  employmentType: null,
  language: null,
  screen: null,
  scrollTarget: null,
}

/**
 * The people this person is allowed to name.
 *
 * A manager's scope is their own reports; HR and an administrator see everyone.
 * An employee names nobody â€” every action available to them is about
 * themselves, so there is no path here for them at all.
 */
type DirectoryPerson = { id: string; en: string; ar: string; number: string }

async function findPerson(actor: SessionUser, name: string | null, employeeNumber: string | null) {
  const scope =
    actor.role === 'manager'
      ? eq(users.managerId, actor.id)
      : actor.role === 'hr' || actor.role === 'admin'
        ? undefined
        : eq(users.id, actor.id)

  const match = employeeNumber
    ? eq(users.employeeNumber, employeeNumber.trim())
    : name
      ? or(ilike(users.fullNameEn, `%${name.trim()}%`), ilike(users.fullNameAr, `%${name.trim()}%`))
      : undefined
  if (!match) return { kind: 'unclear' as const }

  const rows = await db
    .select({ id: users.id, en: users.fullNameEn, ar: users.fullNameAr, number: users.employeeNumber })
    .from(users)
    .where(scope ? and(scope, match) : match)
    .limit(5)

  if (rows.length === 0) return { kind: 'notFound' as const }
  /*
   * Two Ahmads is a question, not a coin toss. The alternative â€” picking the
   * first â€” resets the wrong person's password eventually, and does it quietly.
   */
  if (rows.length > 1) return { kind: 'ambiguous' as const, people: rows as DirectoryPerson[], names: rows.map((row) => row.en) }
  return { kind: 'one' as const, person: rows[0]! }
}

/** Their pending request, which is the only kind that can be decided or cancelled. */
async function pendingRequestFor(userId: string) {
  const rows = await db
    .select()
    .from(requests)
    .where(and(eq(requests.userId, userId), eq(requests.status, 'pending')))
    .orderBy(desc(requests.submittedAt))
    .limit(5)
  return rows
}

function describeRequest(row: typeof requests.$inferSelect): ActionDetail[] {
  const out: ActionDetail[] = []
  if (row.kind === 'leave' && row.leaveType) {
    out.push({ label: L('Type', 'Ø§Ù„Ù†ÙˆØ¹'), value: LEAVE_LABEL[row.leaveType] ?? L(row.leaveType, row.leaveType) })
    if (row.leaveFrom && row.leaveTo) {
      const range = `${row.leaveFrom} â†’ ${row.leaveTo}`
      out.push({ label: L('Dates', 'Ø§Ù„ØªÙˆØ§Ø±ÙŠØ®'), value: L(range, range) })
    }
    if (row.leaveDays != null) {
      out.push({
        label: L('Working days', 'Ø£ÙŠØ§Ù… Ø§Ù„Ø¹Ù…Ù„'),
        value: L(`${row.leaveDays}`, `${row.leaveDays}`),
      })
    }
  } else {
    out.push({
      label: L('Type', 'Ø§Ù„Ù†ÙˆØ¹'),
      value: DOC_LABEL[row.kind] ?? L(row.kind, row.kind),
    })
  }
  if (row.reason) out.push({ label: L('Reason', 'Ø§Ù„Ø³Ø¨Ø¨'), value: L(row.reason, row.reason) })
  return out
}

/**
 * A title lookup that fails usefully.
 *
 * Matching a vacancy by name depends on the model having pulled the right words
 * out of a sentence, and at temperature zero that is *nearly* deterministic
 * rather than deterministic â€” the same instruction has been seen to resolve
 * and then not resolve. Tuning the prompt against that is chasing weather.
 *
 * So the failure carries the answer instead: told which vacancies exist, the
 * person names one exactly and the next attempt cannot miss. The same shape
 * works whether the model extracted nothing, extracted the wrong thing, or the
 * vacancy genuinely is not there.
 */
function couldNotFind(available: string[]): { ok: false; reason: Refusal; detail?: string } {
  if (available.length === 0) return { ok: false, reason: 'notFound' }
  /*
   * The names only. This is appended to a sentence the web app has already
   * written in the reader's language, so a prefix of my own would land in the
   * middle of an Arabic sentence in English.
   */
  return { ok: false, reason: 'notFound', detail: available.join('\u060c ') }
}

/** The vacancies, for a lookup that has nothing to go on or found nothing. */
async function vacancyNames(): Promise<string[]> {
  const rows = await db
    .select({ en: jobOpenings.titleEn, ar: jobOpenings.titleAr })
    .from(jobOpenings)
    .limit(10)
  return rows.map((o) => o.ar || o.en)
}

/**
 * Matching a title the way a person means it, not the way it is stored.
 *
 * `ilike '%Ù…Ø³Ø¤ÙˆÙ„ Ø±ÙˆØ§ØªØ¨%'` does not match "Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ø±ÙˆØ§ØªØ¨", because of two
 * letters nobody thinks about when they type. Arabic attaches its definite
 * article to the word, so the difference between "a payroll officer" and "the
 * payroll officer" is inside the token rather than beside it, and a substring
 * search is defeated by it. The same goes for the alef forms â€” Ø£, Ø¥ and Ø¢ are
 * the same letter to a reader and three different characters to a database.
 *
 * So both sides are flattened before they are compared, and the comparison is
 * on words rather than on a substring: every word the person typed has to
 * appear, in any order. "Ø±ÙˆØ§ØªØ¨ Ù…Ø³Ø¤ÙˆÙ„" finds it too, which is how people type
 * when they are in a hurry.
 */
function normaliseTitle(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/(^|\s)\u0627\u0644/g, '$1')
    /*
     * The sound masculine plural has two endings for one word: Ù…ÙˆØ¸ÙÙˆÙ† and
     * Ù…ÙˆØ¸ÙÙŠÙ† are "employees" in two grammatical cases, and Arabic chooses
     * between them by the word's position in the sentence. Somebody typing a
     * screen's name from memory uses whichever came to mind, and the screen is
     * filed under the other. Folded to one form so both find it.
     */
    .replace(/\u0648\u0646(\s|$)/g, '\u064a\u0646$1')
    /* Ø© and Ù‡ are the same sound and are typed interchangeably. */
    .replace(/\u0629(\s|$)/g, '\u0647$1')
    .replace(/\s+/g, ' ')
}

interface Titled {
  id: string
  en: string
  ar: string
}

/**
 * Which of these the person meant.
 *
 * An exact match after flattening wins outright â€” otherwise "Ù…Ù‡Ù†Ø¯Ø³" would be
 * ambiguous between three engineering roles when somebody typed one of them in
 * full. Only when nothing matches exactly does it fall back to "contains every
 * word", and only then can the answer be more than one.
 */
function pickByTitle(rows: Titled[], query: string): Titled[] {
  const want = normaliseTitle(query)
  if (!want) return []

  const exact = rows.filter((r) => normaliseTitle(r.ar) === want || normaliseTitle(r.en) === want)
  if (exact.length > 0) return exact

  const words = want.split(' ').filter(Boolean)
  const hayOf = (r: Titled) => `${normaliseTitle(r.ar)} ${normaliseTitle(r.en)}`

  const all = rows.filter((r) => words.every((w) => hayOf(r).includes(w)))
  if (all.length > 0) return all

  /**
   * One word wrong should not mean not found.
   *
   * People remember a role approximately â€” "Ù…Ø³Ø¤ÙˆÙ„ Ø°ÙƒØ§Ø¡ Ø§ØµØ·Ù†Ø§Ø¹ÙŠ" for what is
   * filed as "Ù…Ù‡Ù†Ø¯Ø³ Ø°ÙƒØ§Ø¡ Ø§ØµØ·Ù†Ø§Ø¹ÙŠ". Requiring every word turns a near miss into
   * nothing, which is unhelpful when one candidate is obviously the one meant.
   *
   * So a near miss is allowed â€” but only when it is unambiguous and only on
   * most of the words. Two candidates scoring the same is still a question, not
   * a coin toss, and the confirmation card names the title it settled on, so a
   * wrong guess is visible before anything happens rather than after.
   */
  if (words.length < 2) return []
  const scored = rows
    .map((r) => ({ row: r, hits: words.filter((w) => hayOf(r).includes(w)).length }))
    .filter((x) => x.hits >= Math.ceil(words.length * 0.6))
  if (scored.length === 0) return []

  const best = Math.max(...scored.map((x) => x.hits))
  const winners = scored.filter((x) => x.hits === best)
  return winners.length === 1 ? [winners[0]!.row] : []
}

/** Every vacancy, for matching against. There are never many. */
async function allOpenings(): Promise<Titled[]> {
  return db
    .select({ id: jobOpenings.id, en: jobOpenings.titleEn, ar: jobOpenings.titleAr })
    .from(jobOpenings)
}

/** Every job description, for matching an instruction to the document it names. */
async function allJobDescriptions(): Promise<Titled[]> {
  return db
    .select({ id: jobDescriptions.id, en: jobDescriptions.titleEn, ar: jobDescriptions.titleAr })
    .from(jobDescriptions)
}

/** A payroll month is an existing run, not something the assistant is allowed to invent. */
async function payrollRunFor(monthStart: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(monthStart)) return null
  const year = Number(monthStart.slice(0, 4))
  const month = Number(monthStart.slice(5, 7))
  const rows = await db
    .select({ id: payrollRuns.id, status: payrollRuns.status, year: payrollRuns.periodYear, month: payrollRuns.periodMonth })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.periodYear, year), eq(payrollRuns.periodMonth, month)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Every refusal an action can actually run into, in words.
 *
 * The routes raise forty-three distinct codes; twelve were named here and the
 * rest fell through to "that could not be done". Most of the remainder are
 * unreachable from an assistant action â€” login failures, file uploads, ids it
 * resolves itself â€” but the ones below are not, and each of them was a person
 * being told the system had a fault when it had a rule.
 *
 * Anything still missing falls back to the generic sentence, which is correct
 * for a genuine fault. The distinction is the point: a rule gets explained, a
 * fault gets apologised for.
 */
const REFUSAL_WORDING: Record<string, { en: string; ar: string }> = {
  cannotChangeOwnRole: L(
    'You cannot change your own role \u2014 somebody else has to.',
    '\u0645\u0627 \u0628\u062a\u0642\u062f\u0631 \u062a\u063a\u064a\u0651\u0631 \u062f\u0648\u0631\u0643 \u0623\u0646\u062a \u2014 \u0644\u0627\u0632\u0645 \u062d\u062f\u0627 \u062a\u0627\u0646\u064a.',
  ),
  openingHasApplications: L(
    'People have applied to it. Close it instead \u2014 that keeps their applications.',
    '\u0641\u064a \u0646\u0627\u0633 \u0642\u062f\u0651\u0645\u0648\u0627 \u0639\u0644\u064a\u0647\u0627. \u0633\u0643\u0651\u0631\u0647\u0627 \u0628\u062f\u0644 \u0645\u0627 \u062a\u062d\u0630\u0641\u0647\u0627 \u2014 \u0647\u064a\u0643 \u0628\u064a\u0636\u0644\u0648\u0627 \u0645\u062d\u0641\u0648\u0638\u064a\u0646.',
  ),
  payrollRunLocked: L(
    'That month is approved and cannot be recalculated.',
    '\u0647\u0627\u0644\u0634\u0647\u0631 \u0645\u0639\u062a\u0645\u062f \u0648\u0645\u0627 \u0628\u064a\u0646\u062d\u0633\u0628 \u0645\u0646 \u062c\u062f\u064a\u062f.',
  ),
  payrollRunEmpty: L(
    'Nobody has a salary set for that month, so there is nothing to calculate.',
    '\u0645\u0627 \u062d\u062f\u0627 \u0625\u0644\u0647 \u0631\u0627\u062a\u0628 \u0645\u062d\u062f\u0651\u062f \u0644\u0647\u0627\u0644\u0634\u0647\u0631\u060c \u0641\u0645\u0627 \u0641\u064a \u0625\u0634\u064a \u064a\u0646\u062d\u0633\u0628.',
  ),
  noPayrollSettings: L(
    'The tax and social security rates have not been confirmed yet. Set those first.',
    '\u0646\u0633\u0628 \u0627\u0644\u0636\u0631\u064a\u0628\u0629 \u0648\u0627\u0644\u0636\u0645\u0627\u0646 \u0645\u0627 \u0627\u0646\u0639\u062a\u0645\u062f\u062a \u0628\u0639\u062f. \u0638\u0628\u0651\u0637\u0647\u0627 \u0623\u0648\u0644.',
  ),
  payrollSettingsNotFound: L(
    'The tax and social security rates have not been confirmed yet. Set those first.',
    '\u0646\u0633\u0628 \u0627\u0644\u0636\u0631\u064a\u0628\u0629 \u0648\u0627\u0644\u0636\u0645\u0627\u0646 \u0645\u0627 \u0627\u0646\u0639\u062a\u0645\u062f\u062a \u0628\u0639\u062f. \u0638\u0628\u0651\u0637\u0647\u0627 \u0623\u0648\u0644.',
  ),
  descriptionAlreadyLinked: L(
    'That description is already attached to a vacancy.',
    '\u0647\u0627\u0644\u0648\u0635\u0641 \u0645\u0631\u0628\u0648\u0637 \u0628\u0648\u0638\u064a\u0641\u0629 \u0623\u0635\u0644\u0627\u064b.',
  ),
  emailRequired: L('An email address is needed.', '\u0644\u0627\u0632\u0645 \u0625\u064a\u0645\u064a\u0644.'),
  employeeNumberRequired: L('An employee number is needed.', '\u0644\u0627\u0632\u0645 \u0631\u0642\u0645 \u0648\u0638\u064a\u0641\u064a.'),
  accountDisabled: L('That account is disabled.', '\u0647\u0627\u0644\u062d\u0633\u0627\u0628 \u0645\u0639\u0637\u0651\u0644.'),
  requestNotPending: L(
    'That request has already been decided.',
    '\u0647\u0627\u0644\u0637\u0644\u0628 \u0627\u0646\u0628\u062a\u0651 \u0641\u064a\u0647 \u0645\u0646 \u0642\u0628\u0644.',
  ),
}

/* ---------------------------------------------------------------- propose */

/**
 * One typo away.
 *
 * "Ø§Ù„ØªÙˆØ¶ÙŠÙ" for "Ø§Ù„ØªÙˆØ¸ÙŠÙ", "Ø§Ù„ÙˆØ¶ÙŠÙÙŠØ©" for "Ø§Ù„ÙˆØ¸ÙŠÙÙŠØ©" â€” Ø¶ and Ø¸ sit next to
 * each other in the ear and on the keyboard, and it is the most common thing to
 * get wrong when typing Arabic quickly. Exact matching turned every one of them
 * into "I could not find that screen", which is a strange thing to be told about
 * a screen that is right there in the menu.
 *
 * Used ONLY for screens, and that limit is deliberate. Opening the wrong screen
 * costs a glance and a click back. Matching a person's name or a vacancy this
 * loosely would mean approving the wrong leave request or closing the wrong
 * vacancy, so those stay exact â€” tolerance is proportional to what being wrong
 * would cost.
 */
function within(a: string, b: string, allowed: number): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > allowed) return false
  /* Levenshtein, two rows, because the strings are a handful of characters. */
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]! <= allowed
}

/**
 * Every word of the request is a word of the title, give or take a letter.
 *
 * Short words must match exactly: at three letters a single edit is a different
 * word, not a slip.
 */
function nearlyTitled<T extends Titled>(rows: T[], want: string): T[] {
  const words = normaliseTitle(want).split(' ').filter(Boolean)
  if (words.length === 0) return []
  return rows.filter((r) => {
    const hay = `${normaliseTitle(r.ar)} ${normaliseTitle(r.en)}`.split(' ').filter(Boolean)
    return words.every((w) => hay.some((h) => within(w, h, w.length >= 5 ? 1 : 0)))
  })
}

export async function proposeAction(
  plan: CopilotActionPlan,
  actor: SessionUser,
  /**
   * Fields the person was asked about and chose not to fill in.
   *
   * Passed in rather than stored on the plan, because it is not something
   * anybody said â€” it is something they declined to say, which belongs to the
   * conversation and not to the instruction. Empty for every caller that is not
   * part-way through one, which is the MCP tools and the first message of a
   * chat.
   */
  declined: readonly (keyof CopilotActionPlan)[] = [],
): Promise<Proposed> {
  const action = plan.action

  /*
   * Checked here so the refusal is a sentence rather than a status code. It is
   * not what enforces the rule â€” the route does that when `run` calls it, and
   * would refuse this same action even if this check were wrong.
   */
  if (!mayDo(actor.role, action)) return { ok: false, reason: 'notPermitted' }

  const destructive = DESTRUCTIVE.has(action)
  const base = { action, destructive, caution: null as ActionProposal['caution'] }

  switch (action) {
    case 'checkIn':
    case 'checkOut': {
      const arriving = action === 'checkIn'
      return {
        ok: true,
        proposal: {
          ...base,
          summary: arriving
            ? L('Record your arrival for today', 'ØªØ³Ø¬ÙŠÙ„ Ø­Ø¶ÙˆØ±Ùƒ Ù„Ù„ÙŠÙˆÙ…')
            : L('Record your departure for today', 'ØªØ³Ø¬ÙŠÙ„ Ù…ØºØ§Ø¯Ø±ØªÙƒ Ù„Ù„ÙŠÙˆÙ…'),
          details: [{ label: L('Date', 'Ø§Ù„ØªØ§Ø±ÙŠØ®'), value: L(dayKey(new Date()), dayKey(new Date())) }],
          params: { ...blank, action },
        },
      }
    }

    case 'requestLeave': {
      if (!plan.leaveKind) return needs('which kind of leave', 'Ù†ÙˆØ¹ Ø§Ù„Ø¥Ø¬Ø§Ø²Ø©', 'leaveKind')
      if (!plan.startDate || !plan.endDate) return needs('the dates', 'Ø§Ù„ØªÙˆØ§Ø±ÙŠØ®', 'startDate', 'endDate')
      const range = `${plan.startDate} â†’ ${plan.endDate}`
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Submit a leave request', 'Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ Ø¥Ø¬Ø§Ø²Ø©'),
          details: [
            { label: L('Type', 'Ø§Ù„Ù†ÙˆØ¹'), value: LEAVE_LABEL[plan.leaveKind]! },
            { label: L('Dates', 'Ø§Ù„ØªÙˆØ§Ø±ÙŠØ®'), value: L(range, range) },
            ...(plan.text ? [{ label: L('Reason', 'Ø§Ù„Ø³Ø¨Ø¨'), value: L(plan.text, plan.text) }] : []),
          ],
          params: {
            ...blank,
            action,
            leaveKind: plan.leaveKind,
            startDate: plan.startDate,
            endDate: plan.endDate,
            text: plan.text,
          },
        },
      }
    }

    case 'requestDocument': {
      /*
       * Not defaulted. This used to fall back to `certificate`, which meant a
       * sentence the classifier could not place became a formal request for an
       * employment certificate â€” somebody asking to switch the interface
       * language was one button away from filing one. A default here is the
       * server inventing what was asked for, which is the one thing it must
       * never do.
       */
      const kind = plan.documentKind
      if (!kind) {
        return needs(
          'which request â€” an employment certificate, or a change to your details',
          'Ø£ÙŠ Ø·Ù„Ø¨ â€” Ø´Ù‡Ø§Ø¯Ø© Ø¹Ù…Ù„ØŒ ÙˆÙ„Ø§ ØªØ¹Ø¯ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§ØªÙƒ',
          'documentKind',
        )
      }
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Submit a request', 'Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨'),
          details: [
            { label: L('Type', 'Ø§Ù„Ù†ÙˆØ¹'), value: DOC_LABEL[kind]! },
            ...(plan.text ? [{ label: L('Note', 'Ù…Ù„Ø§Ø­Ø¸Ø©'), value: L(plan.text, plan.text) }] : []),
          ],
          params: { ...blank, action, documentKind: kind, text: plan.text },
        },
      }
    }

    /**
     * The interface language, which is this browser's preference and not a
     * record anywhere. Reversible in one press, so no caution and no
     * confirmation weight â€” but still a proposal, because every action is.
     */
    /**
     * Taking them to a screen, which is what a bare noun usually means.
     *
     * "Ø§Ù„Ù…ÙˆØ¸ÙÙˆÙ†" on its own is not an instruction to do anything to
     * employees â€” it is somebody heading for the employees screen. Without this
     * action the classifier had to pick from a list of things that *change*
     * something, and it did: "Ø§Ù„Ø±ÙˆØ§ØªØ¨" proposed running the month's payroll.
     * One word, and the only options offered were consequential ones.
     *
     * Matched against the same screen registry the guide answers from, filtered
     * by role first â€” so a screen this person cannot open is not a screen they
     * can be sent to.
     */
    case 'openScreen': {
      const wanted = plan.screen?.trim()
      if (!wanted) return needs('which screen', '\u0623\u064a \u0634\u0627\u0634\u0629', 'screen')

      const reachable = GUIDE_PAGES.filter((g) => g.roles.includes(actor.role))
      const choices = reachable.flatMap((g) => {
        const id = pageIdForPath(g.path)
        return id ? [{ id, en: g.title.en, ar: g.title.ar }] : []
      })
      const leaveTab =
        /\b(?:leave|leaves)\s+calendar\b|(?:تقويم|كالندر)\s+(?:ال)?(?:اجازات|إجازات|اجازة|إجازة)/iu.test(wanted)
          ? 'calendar'
          : /\bleave\s+requests?\b|طلبات\s+(?:ال)?(?:اجازات|إجازات)/iu.test(wanted)
            ? 'requests'
            : null

      /*
       * "the leave page" is the leave page.
       *
       * Saying the word for "page" is the most ordinary way to name one, and it
       * was the single phrasing that failed: "ÙˆØ¯Ù‘ÙŠÙ†ÙŠ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†" found the
       * screen and "ÙˆØ¯Ù‘ÙŠÙ†ÙŠ Ø¹Ù„Ù‰ ØµÙØ­Ø© Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†" did not, because the extra word
       * became part of the name being looked up.
       *
       * Tried as given first, then again without it. That order is the whole
       * care in this: one of the screens is genuinely called "ØµÙØ­Ø© Ø§Ù„ÙˆØ¸Ø§Ø¦Ù",
       * and stripping the word before trying the real name would break the one
       * case where it is not noise.
       */
      const hits = (() => {
        if (leaveTab) {
          const leaves = choices.find((choice) => choice.id === 'leaves')
          return leaves ? [leaves] : []
        }
        const direct = pickByTitle(choices, wanted)
        if (direct.length > 0) return direct
        const bare = wanted
          .replace(/^(the|my)\s+/i, '')
          .replace(/\b(page|screen|tab)\b/gi, ' ')
          .replace(/(^|\s)(?:\u0627\u0644)?(?:\u0635\u0641\u062d\u0629|\u0635\u0641\u062d\u0647|\u0634\u0627\u0634\u0629|\u0634\u0627\u0634\u0647)(\s|$)/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const stripped = bare && bare !== wanted ? pickByTitle(choices, bare) : []
        if (stripped.length > 0) return stripped

        /*
         * Last: allow a slip of one letter, and only if it lands on exactly one
         * screen. Two candidates a typo apart is not a typo anybody can resolve
         * for them, so that falls through to the list.
         */
        const near = nearlyTitled(choices, bare || wanted)
        return near.length === 1 ? near : []
      })()

      if (hits.length === 0) {
        return couldNotFind(reachable.map((g) => g.title.ar || g.title.en).slice(0, 12))
      }
      if (hits.length > 1) {
        return { ok: false, reason: 'ambiguous', detail: hits.map((h) => h.ar || h.en).join('\u060c ') }
      }
      const hit = hits[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Open ${hit.en}`, `\u0641\u062a\u062d ${hit.ar}`),
          details: [
            { label: L('Screen', '\u0627\u0644\u0634\u0627\u0634\u0629'), value: L(hit.en, hit.ar) },
            ...(leaveTab
              ? [{ label: L('Tab', 'التبويب'), value: leaveTab === 'calendar' ? L('Calendar', 'التقويم') : L('Requests', 'الطلبات') }]
              : []),
          ],
          params: { ...blank, action, screen: hit.id, text: leaveTab },
        },
      }
    }

    case 'filterScreen': {
      const wanted = plan.screen?.trim().toLocaleLowerCase() ?? ''
      if (!plan.text?.trim() && !plan.role && !plan.stage) {
        return needs('a search term, role, or application stage', 'كلمة بحث أو دور أو مرحلة طلب', 'text')
      }

      const pageId =
        plan.stage
          ? 'recruitment'
          : plan.role
            ? actor.role === 'admin' ? 'adminUsers' : 'employees'
            : /recruit|applicant|candidate|توظيف|متقدم|مرشح/u.test(wanted)
              ? 'recruitment'
              : /user|account|مستخدم|حساب/u.test(wanted)
                ? 'adminUsers'
                : /employee|staff|موظف/u.test(wanted)
                  ? 'employees'
                  : null
      if (!pageId) return needs('which list to filter', 'أي قائمة بدك تفلتر', 'screen')

      const path = navigationPathFor(pageId)
      const permitted = path && GUIDE_PAGES.some((page) => page.path === path && page.roles.includes(actor.role))
      if (!path || !permitted) return { ok: false, reason: 'notPermitted' }
      if (plan.stage && pageId !== 'recruitment') return { ok: false, reason: 'notApplicable' }
      if (plan.role && pageId !== 'employees' && pageId !== 'adminUsers') return { ok: false, reason: 'notApplicable' }
      if (plan.text?.trim() && pageId === 'recruitment') {
        return needs('an application stage for the recruitment filter', 'مرحلة الطلب لفلتر التوظيف', 'stage')
      }

      const page = GUIDE_PAGES.find((candidate) => candidate.path === path)!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Filter ${page.title.en}`, `فلترة ${page.title.ar}`),
          details: [
            ...(plan.text?.trim() ? [{ label: L('Search', 'البحث'), value: L(plan.text.trim(), plan.text.trim()) }] : []),
            ...(plan.role ? [{ label: L('Role', 'الدور'), value: ROLE_LABEL[plan.role]! }] : []),
            ...(plan.stage ? [{ label: L('Application stage', 'مرحلة الطلب'), value: STAGE_LABEL[plan.stage]! }] : []),
          ],
          caution: null,
          params: {
            ...blank,
            action,
            screen: pageId,
            text: plan.text?.trim() || null,
            role: plan.role,
            stage: plan.stage,
          },
        },
      }
    }

    case 'scrollPage': {
      if (!plan.scrollTarget) {
        return needs('where to move the page: up, down, top, or bottom', 'وين تحرّك الصفحة: لفوق، لتحت، لأول الصفحة، أو لآخرها', 'scrollTarget')
      }
      const labels = {
        up: L('Up', 'لفوق'),
        down: L('Down', 'لتحت'),
        top: L('Top of page', 'أول الصفحة'),
        bottom: L('Bottom of page', 'آخر الصفحة'),
      } as const
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Move the page', 'حرّك الصفحة'),
          details: [{ label: L('Direction', 'الاتجاه'), value: labels[plan.scrollTarget] }],
          caution: null,
          params: { ...blank, action, scrollTarget: plan.scrollTarget },
        },
      }
    }

    /**
     * Resolve the person before the client sees any identifier. The browser
     * later uses the same protected directory lookup service; no URL or DOM
     * selector is invented from the spoken name.
     */
    case 'openEmployeeFile': {
      if (!plan.personName && !plan.employeeNumber) {
        return needs('which employee file to open', '\u0645\u0644\u0641 \u0623\u064a \u0645\u0648\u0638\u0641', 'personName')
      }
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      const employeeFileProposal = (person: DirectoryPerson): ActionProposal => ({
          ...base,
          summary: L(`Open ${person.en}'s employee file`, `\u0641\u062a\u062d \u0645\u0644\u0641 \u0627\u0644\u0645\u0648\u0638\u0641 ${person.ar}`),
          details: [
            { label: L('Employee', '\u0627\u0644\u0645\u0648\u0638\u0641'), value: L(person.en, person.ar) },
            { label: L('Number', '\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0648\u0638\u064a\u0641\u064a'), value: L(person.number, person.number) },
          ],
          params: { ...blank, action, targetId: person.id },
        })
      if (found.kind === 'ambiguous') {
        return {
          ok: true,
          choice: {
            question: L('More than one employee matches. Which employee file should I open?', '\u0641\u064a \u0623\u0643\u062b\u0631 \u0645\u0646 \u0645\u0648\u0638\u0641 \u0628\u0646\u0641\u0633 \u0627\u0644\u0627\u0633\u0645. \u0645\u0644\u0641 \u0645\u064a\u0646 \u0628\u062f\u0643 \u0623\u0641\u062a\u062d\u061f'),
            options: found.people.map(employeeFileProposal),
          },
        }
      }
      if (found.kind !== 'one') return { ok: false, reason: found.kind }
      return {
        ok: true,
        proposal: employeeFileProposal(found.person),
      }
    }

    case 'setLanguage': {
      if (!plan.language) return needs('which language', 'Ø£ÙŠ Ù„ØºØ©', 'language')
      const name = plan.language === 'ar' ? L('Arabic', 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©') : L('English', 'Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©')
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Switch the interface to ${name.en}`, `ØªØ­ÙˆÙŠÙ„ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¥Ù„Ù‰ ${name.ar}`),
          details: [{ label: L('Language', 'Ø§Ù„Ù„ØºØ©'), value: name }],
          params: { ...blank, action, language: plan.language },
        },
      }
    }

    /**
     * Leaving the application, which is not the same as leaving work.
     *
     * Confirmed like everything else, and that matters more here than it looks:
     * a misheard "check me out" that signs somebody out costs them their place
     * in whatever they were doing, and the card is what lets them notice before
     * it happens rather than after.
     */
    case 'signOut':
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Sign out of the system', 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬ Ù…Ù† Ø§Ù„Ù†Ø¸Ø§Ù…'),
          details: [],
          caution: L(
            'This ends your session. It does not record the end of your working day â€” that is a separate action.',
            'Ù‡Ø§Ø¯ Ø¨ÙŠÙ†Ù‡ÙŠ Ø¬Ù„Ø³ØªÙƒ. Ù…Ø§ Ø¨ÙŠØ³Ø¬Ù‘Ù„ Ù…ØºØ§Ø¯Ø±ØªÙƒ Ù…Ù† Ø§Ù„Ø¯ÙˆØ§Ù… â€” Ù‡Ø§ÙŠ Ø¥Ø¬Ø±Ø§Ø¡ Ù„Ø­Ø§Ù„Ù‡.',
          ),
          params: { ...blank, action },
        },
      }

    case 'cancelRequest': {
      const rows = await pendingRequestFor(actor.id)
      if (rows.length === 0) return { ok: false, reason: 'notFound' }

      const one = (row: (typeof rows)[number]): ActionProposal => ({
        ...base,
        summary: L('Withdraw your pending request', 'Ø³Ø­Ø¨ Ø·Ù„Ø¨Ùƒ Ø§Ù„Ù…Ø¹Ù„Ù‘Ù‚'),
        details: describeRequest(row),
        params: { ...blank, action, targetId: row.id },
      })
      if (rows.length === 1) return { ok: true, proposal: one(rows[0]!) }
      return {
        ok: true,
        choice: {
          question: L('You have more than one pending. Which?', 'Ø¹Ù†Ø¯Ùƒ Ø£ÙƒØªØ± Ù…Ù† Ø·Ù„Ø¨ Ù…Ø¹Ù„Ù‘Ù‚. Ø£ÙŠ ÙˆØ§Ø­Ø¯ØŸ'),
          options: rows.map(one),
        },
      }
    }

    case 'decideRequest': {
      if (!plan.decision) return needs('whether to approve or reject', 'Ù…ÙˆØ§ÙÙ‚Ø© ÙˆÙ„Ø§ Ø±ÙØ¶', 'decision')
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        /*
         * Saying "more than one matched" without saying which leaves the
         * person guessing at a phrasing. The names are already in hand.
         */
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }

      const rows = await pendingRequestFor(found.person.id)
      if (rows.length === 0) return { ok: false, reason: 'notApplicable' }
      const approving = plan.decision === 'approve'

      const one = (row: (typeof rows)[number]): ActionProposal => ({
        ...base,
        summary: approving
          ? L(`Approve ${found.person.en}â€™s request`, `Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ø·Ù„Ø¨ ${found.person.ar}`)
          : L(`Reject ${found.person.en}â€™s request`, `Ø±ÙØ¶ Ø·Ù„Ø¨ ${found.person.ar}`),
        details: [
          { label: L('Employee', 'Ø§Ù„Ù…ÙˆØ¸Ù'), value: L(found.person.en, found.person.ar) },
          ...describeRequest(row),
        ],
        caution: approving
          ? L(
              'Approving deducts the days from their balance and marks those days as leave.',
              'Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¨ØªØ®ØµÙ… Ø§Ù„Ø£ÙŠØ§Ù… Ù…Ù† Ø±ØµÙŠØ¯Ù‡ ÙˆØ¨ØªØ¹Ù„Ù‘Ù… Ù‡Ø§Ù„Ø£ÙŠØ§Ù… ÙƒØ¥Ø¬Ø§Ø²Ø©.',
            )
          : null,
        params: { ...blank, action, targetId: row.id, decision: plan.decision },
      })

      if (rows.length === 1) return { ok: true, proposal: one(rows[0]!) }
      return {
        ok: true,
        choice: {
          question: L(
            `${found.person.en} has more than one pending. Which?`,
            `${found.person.ar} Ø¹Ù†Ø¯Ù‡ Ø£ÙƒØªØ± Ù…Ù† Ø·Ù„Ø¨ Ù…Ø¹Ù„Ù‘Ù‚. Ø£ÙŠ ÙˆØ§Ø­Ø¯ØŸ`,
          ),
          options: rows.map(one),
        },
      }
    }

    case 'postAnnouncement': {
      if (!plan.text) return needs('what the announcement should say', 'Ù†Øµ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†', 'text')
      const title = plan.title?.trim() || plan.text.trim().slice(0, 60)
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Post an announcement to everyone', 'Ù†Ø´Ø± Ø¥Ø¹Ù„Ø§Ù† Ù„Ù„Ø¬Ù…ÙŠØ¹'),
          details: [
            { label: L('Title', 'Ø§Ù„Ø¹Ù†ÙˆØ§Ù†'), value: L(title, title) },
            { label: L('Body', 'Ø§Ù„Ù†Øµ'), value: L(plan.text, plan.text) },
          ],
          caution: L('Everyone sees it, with your name on it.', 'Ø§Ù„ÙƒÙ„ Ø¨ÙŠØ´ÙˆÙÙ‡ØŒ ÙˆØ¹Ù„ÙŠÙ‡ Ø§Ø³Ù…Ùƒ.'),
          params: { ...blank, action, title, text: plan.text },
        },
      }
    }

    case 'updateAnnouncement': {
      const title = plan.title?.trim() ?? ''
      const body = plan.text?.trim() ?? ''
      if (!title) return needs('the announcement title', 'عنوان الإعلان', 'title')
      if (!body) return needs('the new announcement message', 'النص الجديد للإعلان', 'text')
      const rows = await db
        .select({ id: announcements.id, en: announcements.titleEn, ar: announcements.titleAr })
        .from(announcements)
        .where(
          and(
            or(ilike(announcements.titleEn, `%${title}%`), ilike(announcements.titleAr, `%${title}%`)),
            ...(actor.role === 'manager' ? [eq(announcements.authorId, actor.id)] : []),
          ),
        )
        .limit(12)
      if (rows.length === 0) return couldNotFind([])
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((row) => row.ar || row.en).join('، ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Update the announcement “${row.en}”`, `تعديل الإعلان «${row.ar || row.en}»`),
          details: [
            { label: L('Announcement', 'الإعلان'), value: L(row.en, row.ar || row.en) },
            { label: L('New message', 'النص الجديد'), value: L(body, body) },
          ],
          caution: L('The updated message is immediately visible to its audience.', 'النص المعدّل بيصير ظاهرًا فورًا للجمهور المسموح له.'),
          params: { ...blank, action, targetId: row.id, text: body },
        },
      }
    }

    case 'remindCheckout':
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Remind everyone who has not checked out', 'ØªØ°ÙƒÙŠØ± ÙƒÙ„ Ù…Ù† Ù…Ø§ Ø³Ø¬Ù‘Ù„ Ù…ØºØ§Ø¯Ø±Ø©'),
          details: [],
          params: { ...blank, action },
        },
      }

    case 'markAllNotificationsRead':
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L('Mark all your notifications as read', 'ÙˆØ¶Ø¹ ÙƒÙ„ Ø¥Ø´Ø¹Ø§Ø±Ø§ØªÙƒ ÙƒÙ…Ù‚Ø±ÙˆØ¡Ø©'),
          details: [],
          params: { ...blank, action },
        },
      }

    case 'resetPassword': {
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        /*
         * Saying "more than one matched" without saying which leaves the
         * person guessing at a phrasing. The names are already in hand.
         */
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Reset ${found.person.en}â€™s password`, `ØªØµÙÙŠØ± ÙƒÙ„Ù…Ø© Ø³Ø± ${found.person.ar}`),
          details: [
            { label: L('Employee', 'Ø§Ù„Ù…ÙˆØ¸Ù'), value: L(found.person.en, found.person.ar) },
            { label: L('Number', 'Ø§Ù„Ø±Ù‚Ù…'), value: L(found.person.number, found.person.number) },
          ],
          caution: L(
            'Their current password stops working immediately. A temporary one is shown once.',
            'ÙƒÙ„Ù…Ø© Ø³Ø±Ù‡ Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ø¨ØªÙˆÙ‚Ù ÙÙˆØ±Ø§Ù‹. Ø¨ØªØ¸Ù‡Ø± ÙƒÙ„Ù…Ø© Ù…Ø¤Ù‚ØªØ© Ù…Ø±Ø© ÙˆØ­Ø¯Ø© Ø¨Ø³.',
          ),
          params: { ...blank, action, targetId: found.person.id },
        },
      }
    }

    /**
     * Writing one, which is the only action here that creates something from a
     * sentence rather than acting on a record that already exists.
     *
     * Everything the person said is forwarded as the prompt, and the title they
     * named as the title â€” the route's own rule is that one or the other must
     * be present, so a bare "write me a job description" with no role in it is
     * unclear here rather than a model inventing a job.
     */
    /**
     * Writing a job description.
     *
     * The form on the job-descriptions screen takes twelve fields. Asking those
     * twelve one at a time would be a worse form, not a conversation â€” the
     * whole point of a form is seeing the fields at once. So this asks twice:
     * the role, which nothing can be written without, and then everything else
     * in one question, answered in whatever words the person uses.
     *
     * The second question can be turned down. The generator takes free text as
     * an alternative to the structured fields, so a description written from
     * the title alone is a real draft â€” thinner, and a draft is meant to be
     * edited. Somebody who wants it now says so and gets it.
     */
    case 'generateJobDescription': {
      const title = plan.title?.trim() ?? ''
      const brief = plan.text?.trim() ?? ''
      const dept = plan.department?.trim() ?? ''
      if (!title && !brief) return needs('the job title', 'Ø§Ù„Ù…Ø³Ù…Ù‘Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ', 'title')
      if (title && !brief && !declined.includes('text')) {
        return wants(
          'the seniority, the years of experience, the skills that matter',
          'Ø§Ù„Ù…Ø³ØªÙˆÙ‰ØŒ Ø³Ù†ÙŠÙ† Ø§Ù„Ø®Ø¨Ø±Ø©ØŒ Ø§Ù„Ù…Ù‡Ø§Ø±Ø§Øª Ø§Ù„Ù…Ù‡Ù…Ø©',
          'text',
        )
      }
      return {
        ok: true,
        proposal: {
          ...base,
          summary: title
            ? L(`Write a job description for ${title}`, `ÙƒØªØ§Ø¨Ø© ÙˆØµÙ ÙˆØ¸ÙŠÙÙŠ Ù„Ù€${title}`)
            : L('Write a job description', 'ÙƒØªØ§Ø¨Ø© ÙˆØµÙ ÙˆØ¸ÙŠÙÙŠ'),
          details: [
            ...(title ? [{ label: L('Role', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(title, title) }] : []),
            ...(dept ? [{ label: L('Department', 'Ø§Ù„Ù‚Ø³Ù…'), value: L(dept, dept) }] : []),
            ...(brief ? [{ label: L('What you said', 'Ø§Ù„Ù„ÙŠ Ù‚Ù„ØªÙ‡'), value: L(brief, brief) }] : []),
          ],
          caution: L(
            'It is written as a draft for you to edit, and nothing is published until you approve it.',
            'Ø¨ØªÙ†ÙƒØªØ¨ ÙƒÙ…Ø³ÙˆØ¯Ø© ØªØ¹Ø¯Ù‘Ù„ Ø¹Ù„ÙŠÙ‡Ø§ØŒ ÙˆÙ…Ø§ Ø¨ÙŠÙ†Ù†Ø´Ø± Ø¥Ø´ÙŠ Ù„Ø­Ø¯ Ù…Ø§ ØªØ¹ØªÙ…Ø¯Ù‡Ø§.',
          ),
          params: { ...blank, action, title: title || null, text: brief || null, department: dept || null },
        },
      }
    }

    case 'regenerateJobDescriptionSection': {
      if (!plan.title?.trim()) return needs('the job description title', 'مسمّى الوصف الوظيفي', 'title')
      if (!plan.jobDescriptionSection) return needs('which section to rewrite', 'أي قسم بدك تعيد كتابته', 'jobDescriptionSection')
      const rows = pickByTitle(await allJobDescriptions(), plan.title)
      if (rows.length === 0) return couldNotFind((await allJobDescriptions()).map((row) => row.ar || row.en))
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((row) => row.ar || row.en).join('، ') }
      const row = rows[0]!
      const section = JOB_DESCRIPTION_SECTION_LABEL[plan.jobDescriptionSection]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Rewrite ${section.en} for ${row.en}`, `إعادة كتابة ${section.ar} لوصف ${row.ar}`),
          details: [
            { label: L('Job description', 'الوصف الوظيفي'), value: L(row.en, row.ar) },
            { label: L('Section', 'القسم'), value: section },
            ...(plan.text?.trim()
              ? [{ label: L('Instruction', 'التعليمات'), value: L(plan.text.trim(), plan.text.trim()) }]
              : []),
          ],
          caution: L(
            'Only this section is rewritten. The result stays in the existing document for HR review.',
            'بينعاد كتابة هذا القسم فقط، والنتيجة بتظل داخل الوصف الحالي لمراجعة الموارد البشرية.',
          ),
          params: {
            ...blank,
            action,
            targetId: row.id,
            jobDescriptionSection: plan.jobDescriptionSection,
            text: plan.text?.trim() || null,
          },
        },
      }
    }

    case 'addKnowledgeText': {
      const title = plan.title?.trim() ?? ''
      const content = plan.text?.trim() ?? ''
      if (!title) return needs('a title for the knowledge article', 'عنوان لمقال المعرفة', 'title')
      if (content.length < 40) return needs('the approved policy or procedure text', 'نص السياسة أو الإجراء المعتمد', 'text')
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Add “${title}” to the knowledge base`, `إضافة «${title}» إلى قاعدة المعرفة`),
          details: [
            { label: L('Title', 'العنوان'), value: L(title, title) },
            { label: L('Audience', 'الجمهور'), value: L('All roles', 'كل الأدوار') },
            { label: L('Content', 'المحتوى'), value: L(content, content) },
          ],
          caution: L(
            'This article becomes available to every signed-in role. Do not add personal, payroll or other restricted information here.',
            'هذا المقال بيصير متاحًا لكل دور مسجل. ما تضيف بيانات شخصية أو رواتب أو معلومات مقيدة.'
          ),
          params: { ...blank, action, title, text: content },
        },
      }
    }

    case 'deleteKnowledgeText': {
      const title = plan.title?.trim() ?? ''
      if (!title) return needs('the knowledge article title', 'عنوان مقال المعرفة', 'title')
      const rows = await db
        .select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title })
        .from(knowledgeDocuments)
        .where(ilike(knowledgeDocuments.title, `%${title}%`))
        .limit(12)
      if (rows.length === 0) return couldNotFind([])
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((row) => row.title).join('، ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Remove “${row.title}” from the knowledge base`, `حذف «${row.title}» من قاعدة المعرفة`),
          details: [{ label: L('Knowledge article', 'مقال المعرفة'), value: L(row.title, row.title) }],
          caution: L(
            'This permanently removes the article and its searchable passages for every role that could read it.',
            'هذا بيحذف المقال ومقاطع البحث المرتبطة فيه نهائيًا من كل دور كان مسموح له يقرأه.',
          ),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'approveJobDescription': {
      if (!plan.title) return { ok: false, reason: 'unclear' }
      const drafts = await db
        .select({ id: jobDescriptions.id, en: jobDescriptions.titleEn, ar: jobDescriptions.titleAr })
        .from(jobDescriptions)
        .where(eq(jobDescriptions.status, 'draft'))
      const rows = pickByTitle(drafts, plan.title)
      if (rows.length === 0) {
        const drafts = await db
          .select({ en: jobDescriptions.titleEn, ar: jobDescriptions.titleAr })
          .from(jobDescriptions)
          .where(eq(jobDescriptions.status, 'draft'))
          .limit(10)
        return couldNotFind(drafts.map((d) => d.ar || d.en))
      }
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((r) => r.ar || r.en).join('ØŒ ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Approve the job description for ${row.en}`, `Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ÙˆØµÙ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ Ù„Ù€${row.ar}`),
          details: [{ label: L('Role', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.en, row.ar) }],
          caution: L(
            'Approving also opens the vacancy as a draft, ready to publish.',
            'Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¨ÙŠÙØªØ­ Ø§Ù„ÙˆØ¸ÙŠÙØ© ÙƒÙ…Ø³ÙˆØ¯Ø© Ø¬Ø§Ù‡Ø²Ø© Ù„Ù„Ù†Ø´Ø±.',
          ),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'createOpeningFromJobDescription': {
      if (!plan.title) return needs('the job description title', '\u0645\u0633\u0645\u0651\u0649 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a', 'title')
      const rows = pickByTitle(await allJobDescriptions(), plan.title)
      if (rows.length === 0) return couldNotFind((await allJobDescriptions()).map((row) => row.ar || row.en))
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((row) => row.ar || row.en).join('\u060c ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Create a draft vacancy from ${row.en}`, `\u0625\u0646\u0634\u0627\u0621 \u0648\u0638\u064a\u0641\u0629 \u0645\u0633\u0648\u062f\u0629 \u0645\u0646 \u0648\u0635\u0641 ${row.ar}`),
          details: [{ label: L('Job description', '\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a'), value: L(row.en, row.ar) }],
          caution: L('The vacancy stays a draft until it is published.', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0628\u062a\u0636\u0644 \u0645\u0633\u0648\u062f\u0629 \u0644\u062d\u062f \u0645\u0627 \u062a\u0646\u0634\u0631\u0647\u0627.'),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'deleteJobDescription': {
      if (!plan.title) return needs('the job description title', '\u0645\u0633\u0645\u0651\u0649 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a', 'title')
      const rows = pickByTitle(await allJobDescriptions(), plan.title)
      if (rows.length === 0) return couldNotFind((await allJobDescriptions()).map((row) => row.ar || row.en))
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((row) => row.ar || row.en).join('\u060c ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Delete the job description for ${row.en}`, `\u062d\u0630\u0641 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0644\u0640${row.ar}`),
          details: [{ label: L('Job description', '\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a'), value: L(row.en, row.ar) }],
          caution: L('This permanently removes the description.', '\u0647\u0627\u062f \u0628\u064a\u062d\u0630\u0641 \u0627\u0644\u0648\u0635\u0641 \u0646\u0647\u0627\u0626\u064a\u0627\u064b.'),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    /**
     * Opening a vacancy directly.
     *
     * The usual route is through a job description: approving one opens the
     * vacancy for you. This is for when there is no description to write â€” a
     * role being re-advertised, or a position somebody already agreed. It is a
     * draft either way, so the decision to make it public stays a separate one.
     */
    case 'createJob': {
      if (!plan.title) return needs('the job title', '\u0645\u0633\u0645\u0651\u0649 \u0627\u0644\u0648\u0638\u064a\u0641\u0629', 'title')
      /**
       * The department, worked out rather than asked for.
       *
       * Asking "which department?" for a payroll officer is the assistant
       * making somebody do lookup work it can do itself â€” there is an approved
       * job description for that role and it says Finance.
       *
       * Taken from a record, never invented. If nothing in the library matches
       * the title it still asks, and says why it is asking: a department
       * nobody has written down is not something to guess at.
       */
      /**
       * A vacancy by this name is already open.
       *
       * "Ø§Ù†Ø´Ø±Ù„ÙŠ ÙˆØ¸ÙŠÙØ© Ù…Ø³Ø¤ÙˆÙ„ Ø±ÙˆØ§ØªØ¨" is an instruction to publish the one that
       * exists, and it has been read as an instruction to open another. The
       * difference between those two readings is a duplicate vacancy on a
       * public careers page â€” so it is settled against the database rather
       * than against the wording. If the role is already open, this is not the
       * action, whatever the sentence sounded like.
       */
      const existing = pickByTitle(await allOpenings(), plan.title)
      if (existing.length > 0) {
        const names = existing.map((o) => o.ar || o.en).join('ØŒ ')
        return {
          ok: false,
          reason: 'notApplicable',
          missing: {
            en: `nothing â€” a vacancy for that already exists (${names}). Ask to publish or update it instead of opening another`,
            ar: `ÙˆÙ„Ø§ Ø¥Ø´ÙŠ â€” ÙÙŠ ÙˆØ¸ÙŠÙØ© Ù„Ù‡Ø§Ù„Ø¯ÙˆØ± Ø£ØµÙ„Ø§Ù‹ (${names}). Ø§Ø·Ù„Ø¨ Ù†Ø´Ø±Ù‡Ø§ Ø£Ùˆ ØªØ¹Ø¯ÙŠÙ„Ù‡Ø§ Ø¨Ø¯Ù„ Ù…Ø§ ØªÙØªØ­ ÙˆØ­Ø¯Ø© ØªØ§Ù†ÙŠØ©`,
            /*
             * No field, because this is not a question. It borrows the same
             * slot to say why the instruction does not apply, and there is
             * nothing the person could reply that would fill anything in â€” so
             * no task is left waiting on an answer.
             */
            fields: [],
            optional: false,
          },
        }
      }

      let department = plan.department
      if (!department) {
        const library = await db
          .select({
            id: jobDescriptions.id,
            en: jobDescriptions.titleEn,
            ar: jobDescriptions.titleAr,
            depEn: jobDescriptions.departmentEn,
            depAr: jobDescriptions.departmentAr,
          })
          .from(jobDescriptions)
          .where(eq(jobDescriptions.status, 'approved'))
        const hit = pickByTitle(library, plan.title)[0] as
          | (Titled & { depEn: string; depAr: string })
          | undefined
        department = hit?.depAr || hit?.depEn || null
      }
      if (!department) {
        return needs(
          'the department \u2014 there is no approved job description for that role to take it from',
          '\u0627\u0644\u0642\u0633\u0645 \u2014 \u0645\u0627 \u0641\u064a \u0648\u0635\u0641 \u0648\u0638\u064a\u0641\u064a \u0645\u0639\u062a\u0645\u062f \u0644\u0647\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0622\u062e\u0630\u0647 \u0645\u0646\u0647',
          'department',
        )
      }

      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Open a vacancy for ${plan.title}`, `\u0641\u062a\u062d \u0648\u0638\u064a\u0641\u0629 ${plan.title}`),
          details: [
            { label: L('Role', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629'), value: L(plan.title, plan.title) },
            { label: L('Department', '\u0627\u0644\u0642\u0633\u0645'), value: L(department, department) },
            ...(plan.location
              ? [{ label: L('Location', '\u0627\u0644\u0645\u0648\u0642\u0639'), value: L(plan.location, plan.location) }]
              : []),
          ],
          caution: L(
            'It is created as a draft. Publishing it to the careers page is a separate step.',
            '\u0628\u062a\u0646\u0641\u062a\u062d \u0643\u0645\u0633\u0648\u062f\u0629. \u0646\u0634\u0631\u0647\u0627 \u0639\u0644\u0649 \u0635\u0641\u062d\u0629 \u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u062e\u0637\u0648\u0629 \u0644\u062d\u0627\u0644\u0647\u0627.',
          ),
          params: { ...blank, action, title: plan.title, department, location: plan.location },
        },
      }
    }

    /**
     * Filling in what publishing was refused for.
     *
     * Without this the assistant could open a vacancy, refuse to publish it for
     * a missing location, and then be unable to add the location â€” telling the
     * person to go and do by hand the one thing it had just stopped them doing.
     * A refusal that names a fix should be followed by a way to apply it.
     */
    case 'updateJobOpening': {
      if (!plan.title) return couldNotFind(await vacancyNames())
      if (!plan.location && !plan.employmentType && !plan.startDate) {
        return needs(
          'what to set \u2014 a location, an employment type, or a deadline',
          '\u0634\u0648 \u0628\u062f\u0643 \u062a\u0636\u0628\u0637 \u2014 \u0627\u0644\u0645\u0648\u0642\u0639\u060c \u0646\u0648\u0639 \u0627\u0644\u062a\u0648\u0638\u064a\u0641\u060c \u0648\u0644\u0627 \u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a',
          'location',
          'employmentType',
          'startDate',
        )
      }
      const rows = pickByTitle(await allOpenings(), plan.title)
      if (rows.length === 0) return couldNotFind(await vacancyNames())
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((r) => r.ar || r.en).join('\u060c ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Update the ${row.en} vacancy`, `\u062a\u0639\u062f\u064a\u0644 \u0648\u0638\u064a\u0641\u0629 ${row.ar}`),
          details: [
            { label: L('Vacancy', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629'), value: L(row.en, row.ar) },
            ...(plan.location
              ? [{ label: L('Location', '\u0627\u0644\u0645\u0648\u0642\u0639'), value: L(plan.location, plan.location) }]
              : []),
            ...(plan.employmentType
              ? [{ label: L('Employment type', '\u0646\u0648\u0639 \u0627\u0644\u062a\u0648\u0638\u064a\u0641'), value: L(plan.employmentType, plan.employmentType) }]
              : []),
            ...(plan.startDate
              ? [{ label: L('Deadline', '\u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a'), value: L(plan.startDate, plan.startDate) }]
              : []),
          ],
          params: {
            ...blank,
            action,
            targetId: row.id,
            location: plan.location,
            employmentType: plan.employmentType,
            startDate: plan.startDate,
          },
        },
      }
    }

    case 'publishOpening': {
      /* Nothing to match on: the list is more use than "be clearer". */
      if (!plan.title) return couldNotFind(await vacancyNames())
      const rows = pickByTitle(await allOpenings(), plan.title)
      if (rows.length === 0) {
        return couldNotFind(await vacancyNames())
      }
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((r) => r.ar || r.en).join('ØŒ ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Publish the ${row.en} vacancy`, `Ù†Ø´Ø± ÙˆØ¸ÙŠÙØ© ${row.ar}`),
          details: [{ label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.en, row.ar) }],
          caution: L(
            'It goes on the public careers page, where anyone can read it.',
            'Ø¨ØªØ±ÙˆØ­ Ø¹Ù„Ù‰ ØµÙØ­Ø© Ø§Ù„ÙˆØ¸Ø§Ø¦Ù Ø§Ù„Ø¹Ø§Ù…Ø©ØŒ ÙˆØ£ÙŠ Ø­Ø¯Ø§ Ø¨ÙŠÙ‚Ø¯Ø± ÙŠØ´ÙˆÙÙ‡Ø§.',
          ),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'moveApplication':
    case 'analyseApplication':
    case 'generateInterview':
    case 'reviewInterviewQuestion':
    case 'evaluateInterview':
    case 'sendInterview': {
      if (!plan.personName) return { ok: false, reason: 'unclear' }
      const rows = await db
        .select({
          id: applications.id,
          name: candidates.fullName,
          title: jobOpenings.titleEn,
          titleAr: jobOpenings.titleAr,
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
        .where(ilike(candidates.fullName, `%${plan.personName.trim()}%`))
        .limit(2)
      if (rows.length === 0) return { ok: false, reason: 'notFound' }
      if (rows.length > 1) return { ok: false, reason: 'ambiguous' }
      const row = rows[0]!

      if (action === 'analyseApplication') {
        return {
          ok: true,
          proposal: {
            ...base,
            summary: L(`Read ${row.name}â€™s CV again`, `Ø¥Ø¹Ø§Ø¯Ø© Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø³ÙŠØ±Ø© Ø§Ù„Ø°Ø§ØªÙŠØ© Ù„Ù€${row.name}`),
            details: [
              { label: L('Applicant', 'Ø§Ù„Ù…ØªÙ‚Ø¯Ù…'), value: L(row.name, row.name) },
              { label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.title, row.titleAr) },
            ],
            params: { ...blank, action, targetId: row.id },
          },
        }
      }

      if (action === 'generateInterview') {
        return {
          ok: true,
          proposal: {
            ...base,
            summary: L(`Prepare an interview draft for ${row.name}`, `ØªØ¬Ù‡ÙŠØ² Ù…Ø³ÙˆØ¯Ø© Ø§Ù…ØªØ­Ø§Ù† Ù„Ù€${row.name}`),
            details: [
              { label: L('Applicant', 'Ø§Ù„Ù…ØªÙ‚Ø¯Ù…'), value: L(row.name, row.name) },
              { label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.title, row.titleAr) },
            ],
            caution: L(
              'This creates the existing draft assessment for HR review. It is not sent to the applicant.',
              'Ø¨ÙŠÙ†Ø´Ø¦ Ù…Ø³ÙˆØ¯Ø© Ø§Ù„Ø§Ù…ØªØ­Ø§Ù† Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ© ÙÙ‚Ø·.',
            ),
            params: { ...blank, action, targetId: row.id },
          },
        }
      }

      if (action === 'reviewInterviewQuestion') {
        if (!plan.questionNumber) return needs('the question number from 1 to 10', 'رقم السؤال من 1 إلى 10', 'questionNumber')
        if (!plan.decision) return needs('whether to approve it or rewrite it', 'اعتماد السؤال أو إعادة كتابته', 'decision')
        if (plan.decision === 'reject' && !plan.text?.trim()) {
          return needs('what should be improved in the question', 'شو لازم يتحسن بالسؤال', 'text')
        }
        const [question] = await db
          .select({
            id: interviewQuestions.id,
            en: interviewQuestions.textEn,
            ar: interviewQuestions.textAr,
            status: interviewQuestions.approvalStatus,
          })
          .from(interviewQuestions)
          .innerJoin(interviews, eq(interviews.id, interviewQuestions.interviewId))
          .where(and(eq(interviews.applicationId, row.id), eq(interviewQuestions.ordinal, plan.questionNumber)))
          .limit(1)
        if (!question) return { ok: false, reason: 'notFound' }
        const approving = plan.decision === 'approve'
        return {
          ok: true,
          proposal: {
            ...base,
            summary: approving
              ? L(`Approve question ${plan.questionNumber} for ${row.name}`, `اعتماد السؤال ${plan.questionNumber} لـ${row.name}`)
              : L(`Rewrite question ${plan.questionNumber} for ${row.name}`, `إعادة كتابة السؤال ${plan.questionNumber} لـ${row.name}`),
            details: [
              { label: L('Applicant', 'المتقدم'), value: L(row.name, row.name) },
              { label: L('Vacancy', 'الوظيفة'), value: L(row.title, row.titleAr) },
              { label: L('Question', 'السؤال'), value: L(question.en, question.ar) },
              ...(plan.text?.trim()
                ? [{ label: L('Review feedback', 'ملاحظة المراجعة'), value: L(plan.text.trim(), plan.text.trim()) }]
                : []),
            ],
            caution: approving
              ? L('This marks the question approved for sending.', 'هذا بعتمد السؤال ليكون جاهزًا للإرسال.')
              : L('The existing AI service replaces only this question and leaves it pending for review.', 'خدمة الذكاء الاصطناعي بتستبدل هذا السؤال فقط وبتخليه بانتظار المراجعة.'),
            params: {
              ...blank,
              action,
              targetId: row.id,
              title: question.id,
              questionNumber: plan.questionNumber,
              decision: plan.decision,
              text: plan.text?.trim() || null,
            },
          },
        }
      }

      if (action === 'evaluateInterview') {
        return {
          ok: true,
          proposal: {
            ...base,
            summary: L(`Evaluate ${row.name}'s completed interview`, `ØªÙ‚ÙŠÙŠÙ… Ø§Ù…ØªØ­Ø§Ù† ${row.name} Ø§Ù„Ù…ÙƒØªÙ…Ù„`),
            details: [
              { label: L('Applicant', 'Ø§Ù„Ù…ØªÙ‚Ø¯Ù…'), value: L(row.name, row.name) },
              { label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.title, row.titleAr) },
            ],
            caution: L(
              'This only evaluates completed answers. Hiring remains a human decision.',
              'Ø¨ÙŠÙ‚ÙŠÙ‘Ù… Ø§Ù„Ø¥Ø¬Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙƒØªÙ…Ù„Ø© ÙÙ‚Ø·Ø› ÙˆÙ‚Ø±Ø§Ø± Ø§Ù„ØªÙˆØ¸ÙŠÙ Ù„Ù„Ø¨Ø´Ø±.',
            ),
            params: { ...blank, action, targetId: row.id },
          },
        }
      }

      if (action === 'sendInterview') {
        if (!plan.opensAt || Number.isNaN(new Date(plan.opensAt).getTime())) {
          return needs('the exact opening date and time', 'موعد الفتح باليوم والساعة', 'opensAt')
        }
        if (!plan.durationMinutes) {
          return needs('the answer duration in minutes', 'مدة الامتحان بالدقائق', 'durationMinutes')
        }
        const opensAt = new Date(plan.opensAt)
        return {
          ok: true,
          proposal: {
            ...base,
            summary: L(`Send ${row.name}'s approved interview`, `إرسال امتحان ${row.name} المعتمد`),
            details: [
              { label: L('Applicant', 'المتقدم'), value: L(row.name, row.name) },
              { label: L('Vacancy', 'الوظيفة'), value: L(row.title, row.titleAr) },
              { label: L('Opens', 'يفتح'), value: L(opensAt.toLocaleString('en-GB'), opensAt.toLocaleString('ar-JO')) },
              { label: L('Answer time', 'مدة الإجابة'), value: L(`${plan.durationMinutes} minutes`, `${plan.durationMinutes} دقيقة`) },
            ],
            caution: L(
              'This sends the assessment to the applicant. The existing service refuses it unless every question was approved by HR.',
              'بيرسل الامتحان للمتقدم، والخدمة ترفضه إذا لسا في أسئلة غير معتمدة.',
            ),
            params: { ...blank, action, targetId: row.id, opensAt: plan.opensAt, durationMinutes: plan.durationMinutes },
          },
        }
      }

      if (!plan.stage) return { ok: false, reason: 'unclear' }
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Move ${row.name} to ${STAGE_LABEL[plan.stage]!.en}`, `Ù†Ù‚Ù„ ${row.name} Ø¥Ù„Ù‰ ${STAGE_LABEL[plan.stage]!.ar}`),
          details: [
            { label: L('Applicant', 'Ø§Ù„Ù…ØªÙ‚Ø¯Ù…'), value: L(row.name, row.name) },
            { label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.title, row.titleAr) },
            { label: L('New stage', 'Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©'), value: STAGE_LABEL[plan.stage]! },
          ],
          params: { ...blank, action, targetId: row.id, stage: plan.stage },
        },
      }
    }

    case 'deleteAnnouncement': {
      if (!plan.title) return { ok: false, reason: 'unclear' }
      const rows = await db
        .select({ id: announcements.id, en: announcements.titleEn, ar: announcements.titleAr })
        .from(announcements)
        .where(
          or(
            ilike(announcements.titleEn, `%${plan.title.trim()}%`),
            ilike(announcements.titleAr, `%${plan.title.trim()}%`),
          ),
        )
        .limit(2)
      if (rows.length === 0) return { ok: false, reason: 'notFound' }
      if (rows.length > 1) return { ok: false, reason: 'ambiguous' }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Take down â€œ${row.en}â€`, `Ø³Ø­Ø¨ â€œ${row.ar}â€`),
          details: [{ label: L('Announcement', 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†'), value: L(row.en, row.ar) }],
          caution: L('It disappears for everyone. It cannot be restored.', 'Ø¨ÙŠØ®ØªÙÙŠ Ø¹Ù† Ø§Ù„ÙƒÙ„ØŒ ÙˆÙ…Ø§ Ø¨ÙŠØ±Ø¬Ø¹.'),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'addCalendarEvent': {
      if (!plan.title) return needs('a name for the event', 'Ø§Ø³Ù… Ù„Ù„Ø­Ø¯Ø«', 'title')
      if (!plan.startDate) return needs('a date I can pin down', 'ØªØ§Ø±ÙŠØ® Ù…Ø­Ø¯Ø¯', 'startDate')
      const from = plan.startDate
      const to = plan.endDate ?? plan.startDate
      const range = from === to ? from : `${from} â†’ ${to}`
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Put â€œ${plan.title}â€ on the calendar`, `Ø¥Ø¶Ø§ÙØ© â€œ${plan.title}â€ Ø¹Ù„Ù‰ Ø§Ù„ØªÙ‚ÙˆÙŠÙ…`),
          details: [
            { label: L('Event', 'Ø§Ù„Ø­Ø¯Ø«'), value: L(plan.title, plan.title) },
            { label: L('When', 'Ù…ØªÙ‰'), value: L(range, range) },
          ],
          params: { ...blank, action, title: plan.title, startDate: from, endDate: to },
        },
      }
    }

    case 'deleteCalendarEvent': {
      if (!plan.title) return needs('the event name', '\u0627\u0633\u0645 \u0627\u0644\u062d\u062f\u062b', 'title')
      const scope = actor.role === 'manager' ? eq(calendarEvents.createdBy, actor.id) : undefined
      const rows = await db
        .select({ id: calendarEvents.id, en: calendarEvents.titleEn, ar: calendarEvents.titleAr })
        .from(calendarEvents)
        .where(scope)
        .limit(100)
      const matches = pickByTitle(rows, plan.title)
      if (matches.length === 0) return { ok: false, reason: 'notFound' }
      if (matches.length > 1) return { ok: false, reason: 'ambiguous', detail: matches.map((row) => row.ar || row.en).join('\u060c ') }
      const row = matches[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Delete the event ${row.en}`, `\u062d\u0630\u0641 \u0627\u0644\u062d\u062f\u062b ${row.ar}`),
          details: [{ label: L('Event', '\u0627\u0644\u062d\u062f\u062b'), value: L(row.en, row.ar) }],
          caution: L('This removes the event from the calendar.', '\u0647\u0627\u062f \u0628\u064a\u062d\u0630\u0641 \u0627\u0644\u062d\u062f\u062b \u0645\u0646 \u0627\u0644\u062a\u0642\u0648\u064a\u0645.'),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'changeEmployeeRole': {
      if (!plan.role) return needs('which role', 'Ø§Ù„Ø¯ÙˆØ± Ø§Ù„Ø¬Ø¯ÙŠØ¯', 'role')
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        /*
         * Saying "more than one matched" without saying which leaves the
         * person guessing at a phrasing. The names are already in hand.
         */
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }
      const label = ROLE_LABEL[plan.role]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Make ${found.person.en} ${label.en.toLowerCase()}`, `Ø¬Ø¹Ù„ ${found.person.ar} ${label.ar}`),
          details: [
            { label: L('Employee', 'Ø§Ù„Ù…ÙˆØ¸Ù'), value: L(found.person.en, found.person.ar) },
            { label: L('New role', 'Ø§Ù„Ø¯ÙˆØ± Ø§Ù„Ø¬Ø¯ÙŠØ¯'), value: label },
          ],
          caution: L(
            'This changes what they can see and do across the whole system.',
            'Ù‡Ø§Ø¯ Ø¨ÙŠØºÙŠÙ‘Ø± Ø´Ùˆ Ø¨ÙŠØ´ÙˆÙ ÙˆØ´Ùˆ Ø¨ÙŠØ¹Ù…Ù„ Ø¨Ø§Ù„Ù†Ø¸Ø§Ù… ÙƒÙ„Ù‡.',
          ),
          params: { ...blank, action, targetId: found.person.id, role: plan.role },
        },
      }
    }

    /**
     * Stopping a vacancy, which is what "close it" means and is not deleting.
     *
     * Asking to close one was reaching `deleteOpening`, which destroys the
     * vacancy and every application sent to it. Two words apart in the
     * instruction, unrecoverable apart in effect â€” so closing exists in its own
     * right rather than being a gentler reading of delete.
     */
    case 'closeOpening': {
      if (!plan.title) return couldNotFind(await vacancyNames())
      const rows = pickByTitle(await allOpenings(), plan.title)
      if (rows.length === 0) return couldNotFind(await vacancyNames())
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((r) => r.ar || r.en).join('ØŒ ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Close the ${row.en} vacancy`, `Ø¥ØºÙ„Ø§Ù‚ ÙˆØ¸ÙŠÙØ© ${row.ar}`),
          details: [{ label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.en, row.ar) }],
          caution: L(
            'It stops taking applications and comes off the careers page. Everything already sent to it is kept, and it can be reopened.',
            'Ø¨ØªÙˆÙ‚Ù Ø¹Ù† Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØ¨ØªÙ†Ø´Ø§Ù„ Ù…Ù† ØµÙØ­Ø© Ø§Ù„ÙˆØ¸Ø§Ø¦Ù. ÙƒÙ„ Ø§Ù„Ù„ÙŠ Ø¥Ø¬Ø§ Ø¹Ù„ÙŠÙ‡Ø§ Ø¨ÙŠØ¶Ù„ Ù…Ø­ÙÙˆØ¸ØŒ ÙˆØ¨ØªÙ‚Ø¯Ø± ØªÙØªØ­Ù‡Ø§ Ù…Ù† Ø¬Ø¯ÙŠØ¯.',
          ),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    case 'deleteOpening': {
      /* Nothing to match on: the list is more use than "be clearer". */
      if (!plan.title) return couldNotFind(await vacancyNames())
      const rows = pickByTitle(await allOpenings(), plan.title)
      if (rows.length === 0) return couldNotFind(await vacancyNames())
      if (rows.length > 1) return { ok: false, reason: 'ambiguous', detail: rows.map((r) => r.ar || r.en).join('ØŒ ') }
      const row = rows[0]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Delete the ${row.en} vacancy`, `Ø­Ø°Ù ÙˆØ¸ÙŠÙØ© ${row.ar}`),
          details: [{ label: L('Vacancy', 'Ø§Ù„ÙˆØ¸ÙŠÙØ©'), value: L(row.en, row.ar) }],
          caution: L(
            'Applications sent to it go with it. This cannot be undone.',
            'Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù„ÙŠ Ø¥Ø¬Øª Ø¹Ù„ÙŠÙ‡Ø§ Ø¨ØªØ±ÙˆØ­ Ù…Ø¹Ù‡Ø§. Ù…Ø§ Ø¨ØªØ±Ø¬Ø¹.',
          ),
          params: { ...blank, action, targetId: row.id },
        },
      }
    }

    /**
     * Creating an account, which needs more than one sentence usually carries.
     *
     * So the refusal lists exactly what is still missing rather than saying the
     * instruction was unclear â€” the person can then say the rest in one go
     * instead of guessing at what a complete sentence looks like.
     *
     * The Arabic and English name are set to the same text: the person gave one
     * name, and inventing a transliteration of it would put a spelling in the
     * directory that nobody chose.
     */
    case 'addEmployee': {
      const want: { key: keyof CopilotActionPlan; field: string; en: string; ar: string }[] = [
        { key: 'personName', field: plan.personName ?? '', en: 'their full name', ar: 'Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„' },
        { key: 'email', field: plan.email ?? '', en: 'an email address', ar: 'Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„' },
        { key: 'employeeNumberNew', field: plan.employeeNumberNew ?? '', en: 'an employee number', ar: 'Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ÙˆØ¸ÙŠÙÙŠ' },
        { key: 'jobTitle', field: plan.jobTitle ?? '', en: 'a job title', ar: 'Ø§Ù„Ù…Ø³Ù…Ù‘Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ' },
        { key: 'department', field: plan.department ?? '', en: 'a department', ar: 'Ø§Ù„Ù‚Ø³Ù…' },
      ]
      const gaps = want.filter((w) => !w.field.trim())
      if (gaps.length > 0) {
        return needs(
          gaps.map((g) => g.en).join(', '),
          gaps.map((g) => g.ar).join('ØŒ '),
          /* Split so the type carries what the guard above already proved: there is at least one. */
          gaps[0]!.key,
          ...gaps.slice(1).map((g) => g.key),
        )
      }
      const role = plan.role ?? 'employee'
      const name = plan.personName!.trim()
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Create an account for ${name}`, `Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ù„Ù€${name}`),
          details: [
            { label: L('Name', 'Ø§Ù„Ø§Ø³Ù…'), value: L(name, name) },
            { label: L('Email', 'Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„'), value: L(plan.email!, plan.email!) },
            { label: L('Number', 'Ø§Ù„Ø±Ù‚Ù…'), value: L(plan.employeeNumberNew!, plan.employeeNumberNew!) },
            { label: L('Job title', 'Ø§Ù„Ù…Ø³Ù…Ù‘Ù‰'), value: L(plan.jobTitle!, plan.jobTitle!) },
            { label: L('Department', 'Ø§Ù„Ù‚Ø³Ù…'), value: L(plan.department!, plan.department!) },
            { label: L('Role', 'Ø§Ù„Ø¯ÙˆØ±'), value: ROLE_LABEL[role]! },
          ],
          caution: L(
            'They cannot sign in until a password is set for them â€” use a reset to issue one.',
            'Ù…Ø§ Ø¨ÙŠÙ‚Ø¯Ø± ÙŠØ¯Ø®Ù„ Ù„Ø­Ø¯ Ù…Ø§ ØªÙ†Ø­Ø· Ù„Ù‡ ÙƒÙ„Ù…Ø© Ø³Ø± â€” Ø§Ø¹Ù…Ù„Ù„Ù‡ ØªØµÙÙŠØ±.',
          ),
          params: {
            ...blank,
            action,
            title: name,
            email: plan.email,
            employeeNumberNew: plan.employeeNumberNew,
            jobTitle: plan.jobTitle,
            department: plan.department,
            role,
          },
        },
      }
    }

    case 'updateEmployeeDetails': {
      if (!plan.jobTitle && !plan.department) {
        return needs('what to change â€” job title or department', 'Ø´Ùˆ Ø¨Ø¯Ùƒ ØªØºÙŠÙ‘Ø± â€” Ø§Ù„Ù…Ø³Ù…Ù‘Ù‰ ÙˆÙ„Ø§ Ø§Ù„Ù‚Ø³Ù…', 'jobTitle', 'department')
      }
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('ØŒ ') : undefined }
      }
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Update ${found.person.en}â€™s details`, `ØªØ¹Ø¯ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª ${found.person.ar}`),
          details: [
            { label: L('Employee', 'Ø§Ù„Ù…ÙˆØ¸Ù'), value: L(found.person.en, found.person.ar) },
            ...(plan.jobTitle
              ? [{ label: L('New job title', 'Ø§Ù„Ù…Ø³Ù…Ù‘Ù‰ Ø§Ù„Ø¬Ø¯ÙŠØ¯'), value: L(plan.jobTitle, plan.jobTitle) }]
              : []),
            ...(plan.department
              ? [{ label: L('New department', 'Ø§Ù„Ù‚Ø³Ù… Ø§Ù„Ø¬Ø¯ÙŠØ¯'), value: L(plan.department, plan.department) }]
              : []),
          ],
          params: {
            ...blank,
            action,
            targetId: found.person.id,
            jobTitle: plan.jobTitle,
            department: plan.department,
          },
        },
      }
    }

    /**
     * Setting what somebody earns.
     *
     * The confirmation shows the figure and the date together, because those
     * two are the whole decision: the same number from a different month is a
     * different amount of money. Marked destructive not because it cannot be
     * corrected â€” a correction is another agreement â€” but because it changes
     * what a person is paid, and that deserves a second look.
     */
    case 'setSalary': {
      /* Start with the person: a salary figure without its employee is not a contract. */
      if (!plan.personName && !plan.employeeNumber) {
        return needs('which employee the salary contract is for', '\u0644\u0645\u064a\u0646 \u0639\u0642\u062f \u0627\u0644\u0631\u0627\u062a\u0628', 'personName')
      }

      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }

      /*
       * People say "950 dinars", not "950", and the model passes that through
       * as written â€” correctly, since it was told to copy what they said.
       * Rejecting it would refuse a perfectly clear instruction over a currency
       * word, so the figure is lifted out of whatever it came wrapped in.
       * Anything that is not exactly one number is still refused: "950 or 1000"
       * has no single answer, and picking one would be inventing a salary.
       */
      const figures = plan.amount?.match(/\d+(?:\.\d{1,2})?/g) ?? []
      if (figures.length !== 1) return needs('the amount', '\u0627\u0644\u0645\u0628\u0644\u063a', 'amount')
      const amountText = figures[0]!

      /*
       * The first of next month when they did not say, because that is what a
       * raise usually means and a mid-month start splits a payslip in a way
       * nobody asked for. Said on the card either way, so the default is never
       * silent.
       */
      const now = new Date()
      const from =
        plan.startDate ?? dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 1))
      const amount = amountText

      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(
            `Set ${found.person.en}\u2019s basic salary to ${amount}`,
            `\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0631\u0627\u062a\u0628 \u0627\u0644\u0623\u0633\u0627\u0633\u064a \u0644\u0640${found.person.ar} \u0628\u0640${amount}`,
          ),
          details: [
            { label: L('Employee', '\u0627\u0644\u0645\u0648\u0638\u0641'), value: L(found.person.en, found.person.ar) },
            { label: L('Basic salary', '\u0627\u0644\u0631\u0627\u062a\u0628 \u0627\u0644\u0623\u0633\u0627\u0633\u064a'), value: L(amount, amount) },
            { label: L('Applies from', '\u064a\u0637\u0628\u0651\u0642 \u0645\u0646'), value: L(from, from) },
          ],
          caution: L(
            'This starts a new agreement from that date. Allowances are not changed \u2014 set those on the payroll screen.',
            '\u0647\u0627\u062f \u0628\u064a\u0628\u0644\u0651\u0634 \u0627\u062a\u0641\u0627\u0642 \u062c\u062f\u064a\u062f \u0645\u0646 \u0647\u0627\u0644\u062a\u0627\u0631\u064a\u062e. \u0627\u0644\u0628\u062f\u0644\u0627\u062a \u0645\u0627 \u0628\u062a\u062a\u063a\u064a\u0651\u0631 \u2014 \u0638\u0628\u0651\u0637\u0647\u0627 \u0645\u0646 \u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0648\u0627\u062a\u0628.',
          ),
          params: { ...blank, action, targetId: found.person.id, amount, startDate: from },
        },
      }
    }

    case 'createPayrollAdjustment': {
      if (!plan.personName && !plan.employeeNumber) {
        return needs('which employee this payroll item is for', '\u0644\u0645\u064a\u0646 \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u062a\u0628', 'personName')
      }
      if (plan.personName?.trim() && plan.employeeNumber?.trim()) {
        return needs('either the employee name or the employee number, not both', '\u0627\u0643\u062a\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0623\u0648 \u0631\u0642\u0645\u0647 \u0627\u0644\u0648\u0638\u064a\u0641\u064a\u060c \u0645\u0634 \u0627\u0644\u0627\u062b\u0646\u064a\u0646', 'personName', 'employeeNumber')
      }

      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }
      if (!plan.payrollAdjustmentKind) {
        return needs('the payroll item type: overtime, bonus, allowance or deduction', '\u0646\u0648\u0639 \u0627\u0644\u0625\u0636\u0627\u0641\u0629: \u0639\u0645\u0644 \u0625\u0636\u0627\u0641\u064a \u0623\u0648 \u0645\u0643\u0627\u0641\u0623\u0629 \u0623\u0648 \u0628\u062f\u0644 \u0623\u0648 \u062e\u0635\u0645', 'payrollAdjustmentKind')
      }

      const figures = plan.amount?.match(/\d+(?:\.\d{1,2})?/g) ?? []
      if (figures.length !== 1) return needs('the amount', '\u0627\u0644\u0645\u0628\u0644\u063a', 'amount')
      if (!plan.text?.trim()) return needs('the documented reason', '\u0627\u0644\u0633\u0628\u0628', 'text')

      const kind = plan.payrollAdjustmentKind
      const amount = figures[0]!
      const effectiveOn = plan.startDate ?? dayKey(new Date())
      const label = PAYROLL_ADJUSTMENT_LABEL[kind]!
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Add a pending ${label.en.toLowerCase()} for ${found.person.en}`, `\u0625\u0636\u0627\u0641\u0629 ${label.ar} \u0645\u0639\u0644\u0651\u0642\u0629 \u0644\u0640${found.person.ar}`),
          details: [
            { label: L('Employee', '\u0627\u0644\u0645\u0648\u0638\u0641'), value: L(found.person.en, found.person.ar) },
            { label: L('Type', '\u0627\u0644\u0646\u0648\u0639'), value: label },
            { label: L('Amount', '\u0627\u0644\u0645\u0628\u0644\u063a'), value: L(amount, amount) },
            { label: L('Effective on', '\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0633\u0631\u064a\u0627\u0646'), value: L(effectiveOn, effectiveOn) },
            { label: L('Reason', '\u0627\u0644\u0633\u0628\u0628'), value: L(plan.text.trim(), plan.text.trim()) },
            { label: L('Status', '\u0627\u0644\u062d\u0627\u0644\u0629'), value: L('Pending review', '\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629') },
          ],
          caution: L(
            'This payroll input is pending review and will not affect a payslip until it is approved.',
            '\u0647\u0630\u0647 \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629\u060c \u0648\u0644\u0646 \u062a\u0624\u062b\u0631 \u0639\u0644\u0649 \u0643\u0634\u0641 \u0627\u0644\u0631\u0627\u062a\u0628 \u0642\u0628\u0644 \u0627\u0639\u062a\u0645\u0627\u062f\u0647\u0627.',
          ),
          params: {
            ...blank,
            action,
            targetId: found.person.id,
            payrollAdjustmentKind: kind,
            amount,
            startDate: effectiveOn,
            text: plan.text.trim(),
          },
        },
      }
    }

    case 'approvePayrollAdjustment': {
      if (!plan.personName && !plan.employeeNumber) {
        return needs('which employee has the pending payroll item', '\u0644\u0645\u064a\u0646 \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0639\u0644\u0651\u0642\u0629', 'personName')
      }
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }
      const kind = plan.payrollAdjustmentKind
      const rows = await db
        .select({ id: payrollAdjustments.id, kind: payrollAdjustments.kind, amount: payrollAdjustments.amount, effectiveOn: payrollAdjustments.effectiveOn, note: payrollAdjustments.note })
        .from(payrollAdjustments)
        .where(and(eq(payrollAdjustments.userId, found.person.id), eq(payrollAdjustments.status, 'pending'), ...(kind ? [eq(payrollAdjustments.kind, kind)] : [])))
        .orderBy(desc(payrollAdjustments.createdAt))
        .limit(5)
      if (rows.length === 0) return { ok: false, reason: 'notFound' }
      const proposalFor = (row: (typeof rows)[number]): ActionProposal => {
        const label = PAYROLL_ADJUSTMENT_LABEL[row.kind]!
        return {
          ...base,
          summary: L(`Approve ${label.en.toLowerCase()} for ${found.person.en}`, `\u0627\u0639\u062a\u0645\u0627\u062f ${label.ar} \u0644\u0640${found.person.ar}`),
          details: [
            { label: L('Employee', '\u0627\u0644\u0645\u0648\u0638\u0641'), value: L(found.person.en, found.person.ar) },
            { label: L('Type', '\u0627\u0644\u0646\u0648\u0639'), value: label },
            { label: L('Amount', '\u0627\u0644\u0645\u0628\u0644\u063a'), value: L(String(row.amount), String(row.amount)) },
            { label: L('Effective on', '\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0633\u0631\u064a\u0627\u0646'), value: L(String(row.effectiveOn), String(row.effectiveOn)) },
            { label: L('Reason', '\u0627\u0644\u0633\u0628\u0628'), value: L(row.note, row.note) },
          ],
          caution: L(
            'Approval makes this input eligible for the next payroll calculation.',
            '\u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0628\u062e\u0644\u0651\u064a \u0647\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u062a\u062f\u062e\u0644 \u0628\u062d\u0633\u0627\u0628 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u062c\u0627\u064a.',
          ),
          params: { ...blank, action, targetId: row.id, payrollAdjustmentKind: row.kind },
        }
      }
      if (rows.length === 1) return { ok: true, proposal: proposalFor(rows[0]!) }
      return {
        ok: true,
        choice: {
          question: L('More than one pending payroll item matches. Which one should be approved?', '\u0648\u062c\u062f\u062a \u0623\u0643\u062b\u0631 \u0645\u0646 \u0625\u0636\u0627\u0641\u0629 \u0645\u0639\u0644\u0651\u0642\u0629. \u0623\u064a \u0648\u062d\u062f\u0629 \u0628\u062f\u0643 \u062a\u0639\u062a\u0645\u062f\u061f'),
          options: rows.map(proposalFor),
        },
      }
    }

    case 'reviewPayrollFinding': {
      if (!plan.personName && !plan.employeeNumber) {
        return needs('which employee the payroll finding belongs to', 'لمين ملاحظة الرواتب', 'personName')
      }
      if (!plan.decision) {
        return needs('whether to mark it reviewed or dismiss it', 'هل بدك تراجعها أو تستبعدها', 'decision')
      }
      const found = await findPerson(actor, plan.personName, plan.employeeNumber)
      if (found.kind !== 'one') {
        return { ok: false, reason: found.kind, detail: found.kind === 'ambiguous' ? found.names.join('\u060c ') : undefined }
      }
      const rows = await db
        .select({
          id: payrollFindings.id,
          type: payrollFindings.type,
          severity: payrollFindings.severity,
          explanation: payrollFindings.explanation,
        })
        .from(payrollFindings)
        .where(and(eq(payrollFindings.userId, found.person.id), eq(payrollFindings.status, 'open')))
        .orderBy(desc(payrollFindings.createdAt))
        .limit(5)
      if (rows.length === 0) return { ok: false, reason: 'notFound' }

      const reviewed = plan.decision === 'approve'
      const proposalFor = (row: (typeof rows)[number]): ActionProposal => ({
        ...base,
        summary: reviewed
          ? L(`Mark ${found.person.en}'s payroll finding as reviewed`, `تعليم ملاحظة راتب ${found.person.ar} كمراجَعة`)
          : L(`Dismiss ${found.person.en}'s payroll finding`, `استبعاد ملاحظة راتب ${found.person.ar}`),
        details: [
          { label: L('Employee', 'الموظف'), value: L(found.person.en, found.person.ar) },
          { label: L('Finding', 'الملاحظة'), value: L(row.type, row.type) },
          { label: L('Severity', 'الخطورة'), value: L(row.severity, row.severity) },
          { label: L('Explanation', 'الشرح'), value: row.explanation },
        ],
        caution: reviewed
          ? L('This records that you reviewed the finding. It does not change a payslip.', 'بيسجّل أنك راجعت الملاحظة، وما بيغيّر كشف الراتب.')
          : L('This dismisses the audit finding. It does not change a payslip.', 'بيستبعد الملاحظة وما بيغيّر كشف الراتب.'),
        params: { ...blank, action, targetId: row.id, decision: plan.decision, text: plan.text?.trim() || null },
      })
      if (rows.length === 1) return { ok: true, proposal: proposalFor(rows[0]!) }
      return {
        ok: true,
        choice: {
          question: L(
            `${found.person.en} has several open payroll findings. Which one?`,
            `عند ${found.person.ar} أكثر من ملاحظة رواتب مفتوحة. أي وحدة؟`,
          ),
          options: rows.map(proposalFor),
        },
      }
    }
    case 'runPayroll': {
      const current = new Date()
      const date = plan.startDate ?? `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-01`
      if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(date)) {
        return needs('the payroll month as YYYY-MM-01', '\u0634\u0647\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0628\u0635\u064a\u063a\u0629 YYYY-MM-01', 'startDate')
      }
      const period = date.slice(0, 7)
      return {
        ok: true,
        proposal: {
          ...base,
          summary: L(`Calculate payroll for ${period}`, `\u062d\u0633\u0627\u0628 \u0631\u0648\u0627\u062a\u0628 ${period}`),
          details: [{ label: L('Period', '\u0627\u0644\u0641\u062a\u0631\u0629'), value: L(period, period) }],
          caution: L(
            'This calculates the run. It does not approve or pay it.',
            '\u0647\u0630\u0627 \u0628\u064a\u062d\u0633\u0628 \u0627\u0644\u062f\u0648\u0631\u0629 \u0628\u0633. \u0645\u0627 \u0628\u064a\u0639\u062a\u0645\u062f\u0647\u0627 \u0648\u0644\u0627 \u0628\u064a\u062f\u0641\u0639\u0647\u0627.',
          ),
          params: { ...blank, action, startDate: date },
        },
      }
    }

    case 'auditPayroll':
    case 'approvePayroll': {
      if (!plan.startDate) return needs('the payroll month as YYYY-MM-01', '\u0634\u0647\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0628\u0635\u064a\u063a\u0629 YYYY-MM-01', 'startDate')
      const run = await payrollRunFor(plan.startDate)
      if (!run) return { ok: false, reason: 'notFound' }
      const period = `${run.year}-${String(run.month).padStart(2, '0')}`
      const approving = action === 'approvePayroll'
      if (approving && run.status !== 'draft') return { ok: false, reason: 'notApplicable' }
      return {
        ok: true,
        proposal: {
          ...base,
          summary: approving
            ? L(`Approve payroll for ${period}`, `\u0627\u0639\u062a\u0645\u0627\u062f \u0631\u0648\u0627\u062a\u0628 ${period}`)
            : L(`Audit payroll for ${period}`, `\u062a\u062f\u0642\u064a\u0642 \u0631\u0648\u0627\u062a\u0628 ${period}`),
          details: [{ label: L('Period', '\u0627\u0644\u0641\u062a\u0631\u0629'), value: L(period, period) }],
          caution: approving
            ? L('Approval locks this payroll run and makes processed payslips available.', '\u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0628\u064a\u062b\u0628\u0651\u062a \u0627\u0644\u062f\u0648\u0631\u0629 \u0648\u0628\u064a\u062c\u0647\u0651\u0632 \u0643\u0634\u0648\u0641 \u0627\u0644\u0631\u0648\u0627\u062a\u0628.')
            : L('The audit analyzes the calculated data only. It does not change payroll.', '\u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0628\u064a\u062d\u0644\u0651\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0641\u0642\u0637\u060c \u0648\u0645\u0627 \u0628\u063a\u064a\u0651\u0631 \u0631\u0648\u0627\u062a\u0628.'),
          params: { ...blank, action, targetId: run.id, startDate: plan.startDate },
        },
      }
    }
  }
}

/* -------------------------------------------------------------------- run */

/**
 * Carrying out a confirmed action, through the route that already does it.
 *
 * Nothing here writes to a table. Each case builds a request against the same
 * endpoint the browser uses, carrying the asker's own session, so the
 * permission check, the validation, the balance, the notification and the
 * realtime event all happen exactly once and in one place.
 */
export async function runAction(params: ActionParams, actor: SessionUser, cookie: string): Promise<ActionOutcome> {
  if (!mayDo(actor.role, params.action)) {
    return {
      ok: false,
      message: L('Your role does not cover that.', 'Ø¯ÙˆØ±Ùƒ Ù…Ø§ Ø¨ÙŠØºØ·ÙŠ Ù‡Ø§Ù„Ø¥Ø´ÙŠ.'),
      messageKey: null,
      messageParams: null,
      path: null,
    }
  }

  const fail = (en: string, ar: string): ActionOutcome => ({
    ok: false,
    message: L(en, ar),
    messageKey: null,
    messageParams: null,
    path: null,
  })

  /**
   * The route's own reason, where there is wording for it.
   *
   * Called instead of `fail` wherever a refusal might be a rule rather than a
   * fault, so a case nobody thought to handle still says something true.
   */
  const explain = (code: string | null, en: string, ar: string): ActionOutcome => {
    const known = code ? REFUSAL_WORDING[code] : null
    return known
      ? { ok: false, message: known, messageKey: null, messageParams: null, path: null }
      : fail(en, ar)
  }
  const need = (id: string | null) => {
    if (!id) throw new Error('an action that needs a target was confirmed without one')
    return id
  }

  switch (params.action) {
    case 'checkIn':
    case 'checkOut': {
      const arriving = params.action === 'checkIn'
      const r = await callInternal({
        method: 'POST',
        path: arriving ? '/attendance/check-in' : '/attendance/check-out',
        cookie,
      })
      if (!r.ok) {
        /*
         * Every refusal the attendance routes issue, named.
         *
         * `alreadyCheckedOut` was missing, so somebody who had finished their
         * day and asked again was told "I could not record that" â€” which
         * sounds like a fault in the system rather than a day already
         * recorded, and invites them to keep trying.
         */
        switch (r.error) {
          case 'alreadyCheckedIn':
            return fail('You are already checked in for today.', 'Ø£Ù†Øª Ù…Ø³Ø¬Ù‘Ù„ Ø­Ø¶ÙˆØ± Ø§Ù„ÙŠÙˆÙ… Ø£ØµÙ„Ø§Ù‹.')
          case 'alreadyCheckedOut':
            return fail(
              'Your day is already recorded â€” you checked out earlier.',
              'Ø¯ÙˆØ§Ù…Ùƒ Ù…Ø³Ø¬Ù‘Ù„ Ø®Ù„Øµ â€” Ø³Ø¬Ù‘Ù„Øª Ù…ØºØ§Ø¯Ø±ØªÙƒ Ù‚Ø¨Ù„ Ø´ÙˆÙŠ.',
            )
          case 'notCheckedIn':
            return fail(
              'You have not checked in today, so there is no departure to record.',
              'Ù…Ø§ Ø³Ø¬Ù‘Ù„Øª Ø­Ø¶ÙˆØ± Ø§Ù„ÙŠÙˆÙ…ØŒ ÙÙ…Ø§ ÙÙŠ Ù…ØºØ§Ø¯Ø±Ø© ØªÙ†Ø³Ø¬Ù‘Ù„.',
            )
          default:
            return fail('That could not be recorded.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ø³Ø¬Ù‘Ù„Ù‡Ø§.')
        }
      }
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: arriving ? L('Your arrival is recorded.', 'Ø§Ù†Ø³Ø¬Ù‘Ù„ Ø­Ø¶ÙˆØ±Ùƒ.') : L('Your departure is recorded.', 'Ø§Ù†Ø³Ø¬Ù‘Ù„Øª Ù…ØºØ§Ø¯Ø±ØªÙƒ.'),
        path: '/home',
      }
    }

    case 'requestLeave': {
      const r = await callInternal({
        method: 'POST',
        path: '/requests/leave',
        cookie,
        body: {
          type: params.leaveKind,
          from: params.startDate,
          to: params.endDate,
          ...(params.text ? { reason: params.text } : {}),
        },
      })
      if (!r.ok) {
        /*
         * The leave rules refuse for specific reasons â€” the range is all
         * weekend, the balance is short, it overlaps a request already in. The
         * leave form explains each of those already, so the refusal travels as
         * that form's key rather than as a second sentence saying the same
         * thing slightly differently.
         */
        const problem = (r.data as { problem?: Record<string, unknown> } | null)?.problem
        const code = typeof problem?.code === 'string' ? problem.code : null
        if (!code) return fail('The request was refused.', 'Ø§Ù„Ø·Ù„Ø¨ Ø§Ù†Ø±ÙØ¶.')

        const params: Record<string, string> = {}
        if (code === 'errOverlap' && problem?.from && problem?.to) {
          params.range = `${String(problem.from)} â†’ ${String(problem.to)}`
        }
        if (code === 'errBalance') {
          params.days = String(problem?.available ?? 0)
          params.type = params.type ?? ''
        }
        return {
          ok: false,
          message: L('The request was refused.', 'Ø§Ù„Ø·Ù„Ø¨ Ø§Ù†Ø±ÙØ¶.'),
          messageKey: `leaveForm.${code}`,
          messageParams: Object.keys(params).length ? params : null,
          path: null,
        }
      }
      return { ok: true, message: L('Your leave request is submitted.', 'Ø§Ù†Ø¨Ø¹Ø« Ø·Ù„Ø¨ Ø¥Ø¬Ø§Ø²ØªÙƒ.'), messageKey: null, messageParams: null, path: '/home' }
    }

    case 'requestDocument': {
      const r = await callInternal({
        method: 'POST',
        path: '/requests/simple',
        cookie,
        body: { kind: params.documentKind, ...(params.text ? { reason: params.text } : {}) },
      })
      if (!r.ok) return explain(r.error, 'The request was refused.', 'Ø§Ù„Ø·Ù„Ø¨ Ø§Ù†Ø±ÙØ¶.')
      return { ok: true, message: L('Your request is submitted.', 'Ø§Ù†Ø¨Ø¹Ø« Ø·Ù„Ø¨Ùƒ.'), messageKey: null, messageParams: null, path: '/home' }
    }

    case 'signOut': {
      const r = await callInternal({ method: 'POST', path: '/auth/logout', cookie })
      if (!r.ok) return fail('You were not signed out.', 'Ù…Ø§ Ø§Ù†Ø³Ø¬Ù‘Ù„ Ø®Ø±ÙˆØ¬Ùƒ.')
      return {
        ok: true,
        message: L('Signed out.', 'Ø§Ù†Ø³Ø¬Ù‘Ù„ Ø®Ø±ÙˆØ¬Ùƒ.'),
        messageKey: null,
        messageParams: null,
        path: null,
        /* the session is gone; the interface has to stop pretending otherwise */
        uiEffect: { kind: 'signedOut' },
      }
    }

    case 'openScreen': {
      /*
       * Nothing to call â€” but it does have to actually happen.
       *
       * This first returned a path and the sentence "here you go", which the
       * panel rendered as a link. The person had already confirmed, so they
       * were told it was done and then shown a button to do it: the message
       * described an action nobody had taken. Confirming IS the press, so the
       * effect goes back as a navigation the interface performs.
       */
      /*
       * `screen` is now a stable page id chosen by the server during proposal
       * resolution, never a path supplied by the model or a browser client.
       * Resolve it again here so a forged confirmation cannot navigate outside
       * the role-filtered guide registry.
       */
      const requestedPage = params.screen ?? ''
      const to = navigationPathFor(requestedPage)
      const pageId = to ? pageIdForPath(to) : null
      const permitted = to && GUIDE_PAGES.some((page) => page.path === to && page.roles.includes(actor.role))
      if (!to || !pageId || !permitted) return fail('That screen is not available to this account.', '\u0647\u0627\u064a \u0627\u0644\u0634\u0627\u0634\u0629 \u0645\u0634 \u0645\u062a\u0627\u062d\u0629 \u0644\u062d\u0633\u0627\u0628\u0643.')
      const tab =
        pageId === 'leaves' && (params.text === 'calendar' || params.text === 'requests')
          ? params.text
          : undefined
      return {
        ok: true,
        message: L('Opening it.', '\u0639\u0645 \u0623\u0641\u062a\u062d\u0647\u0627.'),
        messageKey: null,
        messageParams: null,
        path: tab ? `${to}?tab=${tab}` : to,
        uiEffect: { kind: 'navigate', page: pageId, ...(tab ? { tab } : {}) },
      }
    }

    case 'filterScreen': {
      const requestedPage = params.screen ?? ''
      const to = navigationPathFor(requestedPage)
      const pageId = to ? pageIdForPath(to) : null
      const permitted = to && GUIDE_PAGES.some((page) => page.path === to && page.roles.includes(actor.role))
      if (!to || !pageId || !permitted) {
        return fail('That filtered list is not available to this account.', 'هاي القائمة المفلترة مش متاحة لحسابك.')
      }
      const query = params.text?.trim() || undefined
      const role = pageId === 'employees' || pageId === 'adminUsers' ? params.role ?? undefined : undefined
      const stage = pageId === 'recruitment' ? params.stage ?? undefined : undefined
      if (!query && !role && !stage) return fail('No valid filter was supplied.', 'ما وصل فلتر صالح.')
      return {
        ok: true,
        message: L('The filtered list is open.', 'انفتحت القائمة بالفلتر المطلوب.'),
        messageKey: null,
        messageParams: null,
        path: to,
        uiEffect: {
          kind: 'navigate',
          page: pageId,
          ...(query ? { query } : {}),
          ...(role ? { role } : {}),
          ...(stage ? { stage } : {}),
        },
      }
    }

    case 'scrollPage': {
      const target = params.scrollTarget
      if (!target) return fail('No scroll direction was supplied.', 'ما وصل اتجاه صالح لتحريك الصفحة.')
      return {
        ok: true,
        message: L('The page moved.', 'تحرّكت الصفحة.'),
        messageKey: null,
        messageParams: null,
        path: null,
        uiEffect: { kind: 'scroll', target },
      }
    }

    case 'openEmployeeFile': {
      /* The route is the final scope check. Its result, rather than a model
       * value, supplies the employee number accepted by the directory lookup. */
      const r = await callInternal({ method: 'GET', path: `/employees/${need(params.targetId)}`, cookie })
      if (!r.ok) return explain(r.error, 'The employee file could not be opened.', '\u0645\u0627 \u0642\u062f\u0631\u062a \u0623\u0641\u062a\u062d \u0645\u0644\u0641 \u0627\u0644\u0645\u0648\u0638\u0641.')
      const employeeNumber =
        typeof r.data === 'object' && r.data !== null &&
        typeof (r.data as { employee?: { employeeNumber?: unknown } }).employee?.employeeNumber === 'string'
          ? (r.data as { employee: { employeeNumber: string } }).employee.employeeNumber
          : null
      if (!employeeNumber) return fail('The employee file returned no employee number.', '\u0645\u0644\u0641 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0627 \u0631\u062c\u0651\u0639 \u0631\u0642\u0645\u0647 \u0627\u0644\u0648\u0638\u064a\u0641\u064a.')
      return {
        ok: true,
        message: L('The employee file is open.', '\u062a\u0645 \u0641\u062a\u062d \u0645\u0644\u0641 \u0627\u0644\u0645\u0648\u0638\u0641.'),
        messageKey: null,
        messageParams: null,
        path: `/hr/employees?open=${encodeURIComponent(employeeNumber)}`,
        uiEffect: { kind: 'navigate', page: 'employees', employeeNumber },
      }
    }

    case 'setLanguage': {
      /*
       * The only action here that does not call a route, because there is no
       * route to call: nothing in the database changes. The interface acts on
       * `uiEffect`, and `ok` is true because the instruction was understood and
       * is being carried out â€” not because a backend confirmed a write, which
       * is what it means everywhere else.
       */
      const language = params.language ?? 'ar'
      return {
        ok: true,
        message:
          language === 'ar'
            ? L('Switched to Arabic.', 'ØªØ­ÙˆÙ‘Ù„Øª Ù„Ù„Ø¹Ø±Ø¨ÙŠØ©.')
            : L('Switched to English.', 'ØªØ­ÙˆÙ‘Ù„Øª Ù„Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©.'),
        messageKey: null,
        messageParams: null,
        path: null,
        uiEffect: { kind: 'setLanguage', language },
      }
    }

    case 'cancelRequest': {
      const r = await callInternal({ method: 'POST', path: `/requests/${need(params.targetId)}/cancel`, cookie })
      if (!r.ok) {
        return r.error === 'requestNotPending'
          ? fail('That request has already been decided.', 'Ù‡Ø§Ù„Ø·Ù„Ø¨ Ø§Ù†Ø¨ØªÙ‘ ÙÙŠÙ‡ Ù…Ù† Ù‚Ø¨Ù„.')
          : fail('That could not be withdrawn.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ø³Ø­Ø¨Ù‡.')
      }
      return { ok: true, message: L('Your request is withdrawn.', 'Ø§Ù†Ø³Ø­Ø¨ Ø·Ù„Ø¨Ùƒ.'), messageKey: null, messageParams: null, path: '/home' }
    }

    case 'decideRequest': {
      const r = await callInternal({
        method: 'POST',
        path: `/requests/${need(params.targetId)}/decide`,
        cookie,
        body: { decision: params.decision === 'approve' ? 'approved' : 'rejected' },
      })
      if (!r.ok) {
        return r.error === 'requestNotPending'
          ? fail('That request has already been decided.', 'Ù‡Ø§Ù„Ø·Ù„Ø¨ Ø§Ù†Ø¨ØªÙ‘ ÙÙŠÙ‡ Ù…Ù† Ù‚Ø¨Ù„.')
          : r.status === 403
            ? fail('That employee does not report to you.', 'Ù‡Ø§Ù„Ù…ÙˆØ¸Ù Ù…Ø´ Ù…Ù† ÙØ±ÙŠÙ‚Ùƒ.')
            : fail('The decision could not be recorded.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ø³Ø¬Ù‘Ù„ Ø§Ù„Ù‚Ø±Ø§Ø±.')
      }
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message:
          params.decision === 'approve'
            ? L('The request is approved.', 'Ø§Ù†ÙˆØ§ÙÙ‚ Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨.')
            : L('The request is rejected.', 'Ø§Ù†Ø±ÙØ¶ Ø§Ù„Ø·Ù„Ø¨.'),
        path: '/manager/approvals',
      }
    }

    case 'postAnnouncement': {
      const r = await callInternal({
        method: 'POST',
        path: '/feed/announcements',
        cookie,
        body: {
          title: { en: params.title ?? '', ar: params.title ?? '' },
          detail: { en: params.text ?? '', ar: params.text ?? '' },
        },
      })
      if (!r.ok) return explain(r.error, 'The announcement was not posted.', 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ù…Ø§ Ø§Ù†Ù†Ø´Ø±.')
      return { ok: true, message: L('Your announcement is posted.', 'Ø§Ù†Ù†Ø´Ø± Ø¥Ø¹Ù„Ø§Ù†Ùƒ.'), messageKey: null, messageParams: null, path: null }
    }

    case 'updateAnnouncement': {
      const r = await callInternal({
        method: 'PATCH',
        path: `/feed/announcements/${need(params.targetId)}`,
        cookie,
        body: { detail: { en: params.text ?? '', ar: params.text ?? '' } },
      })
      if (!r.ok) return explain(r.error, 'The announcement was not updated.', 'الإعلان ما تعدّل.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The announcement is updated.', 'تعدّل الإعلان.'),
        path: null,
      }
    }

    case 'remindCheckout': {
      const r = await callInternal({ method: 'POST', path: '/attendance/remind-checkout', cookie })
      if (!r.ok) return fail('The reminders were not sent.', 'Ø§Ù„ØªØ°ÙƒÙŠØ±Ø§Øª Ù…Ø§ Ø§Ù†Ø¨Ø¹Ø«Øª.')
      const sent = (r.data as { reminded?: number } | null)?.reminded ?? 0
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L(`Reminded ${sent} people.`, `Ø§Ù†Ø¨Ø¹Ø« ØªØ°ÙƒÙŠØ± Ù„Ù€${sent} Ø£Ø´Ø®Ø§Øµ.`),
        path: null,
      }
    }

    case 'markAllNotificationsRead': {
      const r = await callInternal({ method: 'POST', path: '/feed/notifications/read-all', cookie })
      if (!r.ok) return fail('Your notifications could not be marked as read.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ø¹Ù„Ù‘Ù… Ø¥Ø´Ø¹Ø§Ø±Ø§ØªÙƒ ÙƒÙ…Ù‚Ø±ÙˆØ¡Ø©.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('Your notifications are marked as read.', 'Ø§Ù†Ø¹Ù„Ù…Øª Ø¥Ø´Ø¹Ø§Ø±Ø§ØªÙƒ ÙƒÙ…Ù‚Ø±ÙˆØ¡Ø©.'),
        path: null,
      }
    }

    case 'resetPassword': {
      const r = await callInternal({
        method: 'POST',
        path: `/employees/${need(params.targetId)}/reset-password`,
        cookie,
      })
      if (!r.ok) return explain(r.error, 'The password was not reset.', 'ÙƒÙ„Ù…Ø© Ø§Ù„Ø³Ø± Ù…Ø§ Ø§Ù†ØµÙÙ‘Ø±Øª.')
      /*
       * The temporary password is shown on the employee's own screen, not
       * repeated here. A one-time secret read out in a chat transcript is a
       * secret with a copy of itself sitting in a scrollback.
       */
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L(
          'Done. Open the employeeâ€™s record to read the temporary password once.',
          'ØªÙ…. Ø§ÙØªØ­ Ù…Ù„Ù Ø§Ù„Ù…ÙˆØ¸Ù Ø¹Ø´Ø§Ù† ØªÙ‚Ø±Ø£ Ø§Ù„ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ù…Ø±Ø© ÙˆØ­Ø¯Ø©.',
        ),
        path: '/hr/employees',
      }
    }

    case 'generateJobDescription': {
      const r = await callInternal({
        method: 'POST',
        path: '/job-descriptions/generate',
        cookie,
        body: {
          ...(params.title ? { title: params.title } : {}),
          ...(params.text ? { prompt: params.text } : {}),
          /* Collected by the form, so it has to arrive â€” a box that is filled in and dropped is a lie. */
          ...(params.department ? { department: params.department } : {}),
        },
      })
      if (!r.ok) {
        return r.error === 'aiNotConfigured'
          ? fail('No model is configured, so it was arranged from what you said instead.', 'Ù…Ø§ ÙÙŠ Ù†Ù…ÙˆØ°Ø¬ Ù…Ø¶Ø¨ÙˆØ·ØŒ ÙØ§Ù†Ø±ØªÙ‘Ø¨ Ø§Ù„Ù„ÙŠ Ù‚Ù„ØªÙ‡ Ø²ÙŠ Ù…Ø§ Ù‡Ùˆ.')
          : fail('The job description was not written.', 'Ø§Ù„ÙˆØµÙ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ Ù…Ø§ Ø§Ù†ÙƒØªØ¨.')
      }
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L(
          'Written, as a draft. Open it to read and edit before approving.',
          'Ø§Ù†ÙƒØªØ¨ ÙƒÙ…Ø³ÙˆØ¯Ø©. Ø§ÙØªØ­Ù‡ ÙˆØ§Ù‚Ø±Ø£Ù‡ ÙˆØ¹Ø¯Ù‘Ù„ Ø¹Ù„ÙŠÙ‡ Ù‚Ø¨Ù„ Ù…Ø§ ØªØ¹ØªÙ…Ø¯Ù‡.',
        ),
        path: '/hr/job-descriptions',
      }
    }

    case 'regenerateJobDescriptionSection': {
      const r = await callInternal({
        method: 'POST',
        path: `/job-descriptions/${need(params.targetId)}/regenerate`,
        cookie,
        body: {
          section: need(params.jobDescriptionSection),
          ...(params.text ? { instruction: params.text } : {}),
        },
      })
      if (!r.ok) return explain(r.error, 'The job-description section was not rewritten.', 'قسم الوصف الوظيفي ما انعاد كتابته.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The section was rewritten and is ready for review.', 'انكتب القسم من جديد وصار جاهز للمراجعة.'),
        path: '/hr/job-descriptions',
      }
    }

    case 'addKnowledgeText': {
      const r = await callInternal({
        method: 'POST',
        path: '/knowledge/text',
        cookie,
        body: {
          title: params.title ?? '',
          content: params.text ?? '',
          visibleTo: ['admin', 'hr', 'manager', 'employee'],
        },
      })
      if (!r.ok) return explain(r.error, 'The knowledge article was not added.', 'ما انضاف مقال المعرفة.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The knowledge article is now available to the permitted roles.', 'انضاف مقال المعرفة وصار متاحًا للأدوار المسموحة.'),
        path: '/hr/knowledge',
      }
    }

    case 'deleteKnowledgeText': {
      const r = await callInternal({ method: 'DELETE', path: `/knowledge/${need(params.targetId)}`, cookie })
      if (!r.ok) return explain(r.error, 'The knowledge article was not removed.', 'مقال المعرفة ما انحذف.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The knowledge article was removed.', 'انحذف مقال المعرفة.'),
        path: '/hr/knowledge',
      }
    }

    case 'approveJobDescription': {
      const r = await callInternal({
        method: 'POST',
        path: `/job-descriptions/${need(params.targetId)}/approve`,
        cookie,
      })
      if (!r.ok) {
        return r.error === 'alreadyApproved'
          ? fail('That one is already approved.', 'Ù‡Ø§Ø¯ Ù…Ø¹ØªÙ…Ø¯ Ù…Ù† Ù‚Ø¨Ù„.')
          : fail('It was not approved.', 'Ù…Ø§ Ø§Ù†Ø¹ØªÙ…Ø¯.')
      }
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('Approved. The vacancy is open as a draft.', 'Ø§Ù†Ø¹ØªÙ…Ø¯. ÙˆØ§Ù„ÙˆØ¸ÙŠÙØ© Ø§Ù†ÙØªØ­Øª ÙƒÙ…Ø³ÙˆØ¯Ø©.'),
        path: '/hr/recruitment',
      }
    }

    case 'createOpeningFromJobDescription': {
      const r = await callInternal({
        method: 'POST',
        path: `/job-descriptions/${need(params.targetId)}/create-opening`,
        cookie,
      })
      if (!r.ok) return explain(r.error, 'The draft vacancy was not created.', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0645\u0627 \u0627\u0646\u0634\u0623\u062a.')
      return {
        ok: true,
        message: L('The draft vacancy is ready to complete and publish.', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0635\u0627\u0631\u062a \u062c\u0627\u0647\u0632\u0629 \u0644\u062a\u0643\u0645\u0644\u0647\u0627 \u0648\u062a\u0646\u0634\u0631\u0647\u0627.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/recruitment',
      }
    }

    case 'deleteJobDescription': {
      const r = await callInternal({ method: 'DELETE', path: `/job-descriptions/${need(params.targetId)}`, cookie })
      if (!r.ok) return explain(r.error, 'The job description was not deleted.', '\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0645\u0627 \u0627\u0646\u062d\u0630\u0641.')
      return {
        ok: true,
        message: L('The job description is deleted.', '\u0627\u0646\u062d\u0630\u0641 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/job-descriptions',
      }
    }

    case 'createJob': {
      const both = (v: string | null) => ({ en: v ?? '', ar: v ?? '' })
      const r = await callInternal({
        method: 'POST',
        path: '/recruitment/openings',
        cookie,
        body: {
          title: both(params.title),
          department: both(params.department),
          openedOn: dayKey(new Date()),
          ...(params.location ? { location: both(params.location) } : {}),
        },
      })
      if (!r.ok) return fail('The vacancy was not opened.', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0645\u0627 \u0627\u0646\u0641\u062a\u062d\u062a.')
      return {
        ok: true,
        message: L('The vacancy is open, as a draft.', '\u0627\u0646\u0641\u062a\u062d\u062a \u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0643\u0645\u0633\u0648\u062f\u0629.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/recruitment',
      }
    }

    case 'updateJobOpening': {
      const both = (v: string | null) => ({ en: v ?? '', ar: v ?? '' })
      const r = await callInternal({
        method: 'PATCH',
        path: `/recruitment/openings/${need(params.targetId)}`,
        cookie,
        body: {
          ...(params.location ? { location: both(params.location) } : {}),
          ...(params.employmentType ? { employmentType: params.employmentType } : {}),
          ...(params.startDate ? { deadline: params.startDate } : {}),
        },
      })
      if (!r.ok) return explain(r.error, 'The vacancy was not updated.', '\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0645\u0627 \u0627\u0646\u0639\u062f\u0651\u0644\u062a.')
      return {
        ok: true,
        message: L('The vacancy is updated.', '\u0627\u0646\u0639\u062f\u0651\u0644\u062a \u0627\u0644\u0648\u0638\u064a\u0641\u0629.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/recruitment',
      }
    }

    case 'publishOpening': {
      const r = await callInternal({
        method: 'POST',
        path: `/recruitment/openings/${need(params.targetId)}/publish`,
        cookie,
        body: { platforms: ['careers'] },
      })
      if (!r.ok) {
        /*
         * The publish workflow refuses an incomplete vacancy and says which
         * fields are missing. Reporting that as "it was not published" throws
         * away the only part that helps â€” the person is left pressing the same
         * button on the same vacancy, which will refuse for the same reason
         * every time.
         */
        const missing = (r.data as { missing?: string[] } | null)?.missing ?? []
        if (r.error === 'openingIncomplete' && missing.length > 0) {
          const en = missing.map((f) => FIELD_LABEL[f]?.en ?? f).join(', ')
          const ar = missing.map((f) => FIELD_LABEL[f]?.ar ?? f).join('ØŒ ')
          return fail(
            `The vacancy is missing ${en}. Fill that in on the recruitment screen, then publish.`,
            `Ø§Ù„ÙˆØ¸ÙŠÙØ© Ù†Ø§Ù‚ØµÙ‡Ø§ ${ar}. Ø¹Ø¨Ù‘ÙŠÙ‡Ø§ Ù…Ù† Ø´Ø§Ø´Ø© Ø§Ù„ØªÙˆØ¸ÙŠÙ ÙˆØ¨Ø¹Ø¯ÙŠÙ† Ø§Ù†Ø´Ø±.`,
          )
        }
        if (r.error === 'openingHasNoDescription') {
          return fail(
            'It has no job description yet. Write one and approve it first.',
            'Ù…Ø§ Ø¥Ù„Ù‡Ø§ ÙˆØµÙ ÙˆØ¸ÙŠÙÙŠ Ø¨Ø¹Ø¯. Ø§ÙƒØªØ¨ ÙˆØ§Ø­Ø¯ ÙˆØ§Ø¹ØªÙ…Ø¯Ù‡ Ø£ÙˆÙ„.',
          )
        }
        if (r.error === 'descriptionNotApproved') {
          return fail(
            'Its job description is still a draft. Approve that first.',
            'Ø§Ù„ÙˆØµÙ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ Ù„Ø³Ø§ Ù…Ø³ÙˆØ¯Ø©. Ø§Ø¹ØªÙ…Ø¯Ù‡ Ø£ÙˆÙ„.',
          )
        }
        return fail('It was not published.', 'Ù…Ø§ Ø§Ù†Ù†Ø´Ø±Øª.')
      }
      return { ok: true, message: L('The vacancy is live.', 'Ø§Ù„ÙˆØ¸ÙŠÙØ© ØµØ§Ø±Øª Ù…Ù†Ø´ÙˆØ±Ø©.'), messageKey: null, messageParams: null, path: '/hr/recruitment' }
    }

    case 'moveApplication': {
      const r = await callInternal({
        method: 'PATCH',
        path: `/recruitment/applications/${need(params.targetId)}`,
        cookie,
        body: { status: params.stage },
      })
      if (!r.ok) return explain(r.error, 'The application was not moved.', 'Ø§Ù„Ø·Ù„Ø¨ Ù…Ø§ Ø§Ù†ØªÙ‚Ù„.')
      return { ok: true, message: L('The application is moved.', 'Ø§Ù†ØªÙ‚Ù„ Ø§Ù„Ø·Ù„Ø¨.'), messageKey: null, messageParams: null, path: '/hr/recruitment' }
    }

    case 'analyseApplication': {
      const r = await callInternal({
        method: 'POST',
        path: `/recruitment/applications/${need(params.targetId)}/analyse`,
        cookie,
      })
      if (!r.ok) return explain(r.error, 'The CV could not be read again.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ø¹ÙŠØ¯ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø³ÙŠØ±Ø©.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('Reading the CV â€” the score appears shortly.', 'Ø¹Ù… Ø¨Ù‚Ø±Ø£ Ø§Ù„Ø³ÙŠØ±Ø© â€” Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø¨ØªØ¸Ù‡Ø± Ø¨Ø¹Ø¯ Ø´ÙˆÙŠ.'),
        path: '/hr/recruitment',
      }
    }

    case 'generateInterview': {
      const r = await callInternal({
        method: 'POST',
        path: `/recruitment/applications/${need(params.targetId)}/interview`,
        cookie,
      })
      if (!r.ok) return explain(r.error, 'The interview draft could not be prepared.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ø¬Ù‡Ù‘Ø² Ù…Ø³ÙˆØ¯Ø© Ø§Ù„Ø§Ù…ØªØ­Ø§Ù†.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The interview draft is ready for HR review.', 'Ù…Ø³ÙˆØ¯Ø© Ø§Ù„Ø§Ù…ØªØ­Ø§Ù† Ø¬Ø§Ù‡Ø²Ø© Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©.'),
        path: '/hr/recruitment',
      }
    }

    case 'reviewInterviewQuestion': {
      const applicationId = need(params.targetId)
      const questionId = need(params.title)
      const approving = params.decision === 'approve'
      const r = await callInternal({
        method: 'POST',
        path: `/recruitment/applications/${applicationId}/interview/questions/${questionId}/${approving ? 'approve' : 'revise'}`,
        cookie,
        ...(approving ? {} : { body: { feedback: params.text ?? '' } }),
      })
      if (!r.ok) return explain(r.error, 'The interview question review was not saved.', 'مراجعة سؤال الامتحان ما انحفظت.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: approving
          ? L('The interview question is approved.', 'انْعتمد سؤال الامتحان.')
          : L('The question was rewritten and is waiting for review.', 'انكتب السؤال من جديد وصار بانتظار المراجعة.'),
        path: '/hr/recruitment',
      }
    }

    case 'evaluateInterview': {
      const r = await callInternal({
        method: 'POST',
        path: `/recruitment/applications/${need(params.targetId)}/interview/evaluate`,
        cookie,
      })
      if (!r.ok) return explain(r.error, 'The completed interview could not be evaluated.', 'Ù…Ø§ Ù‚Ø¯Ø±Øª Ø£Ù‚ÙŠÙ‘Ù… Ø§Ù„Ø§Ù…ØªØ­Ø§Ù† Ø§Ù„Ù…ÙƒØªÙ…Ù„.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The completed interview was evaluated.', 'Ø§Ù†ØªÙ‚ÙŠÙ‘Ù… Ø§Ù„Ø§Ù…ØªØ­Ø§Ù† Ø§Ù„Ù…ÙƒØªÙ…Ù„.'),
        path: '/hr/recruitment',
      }
    }

    case 'sendInterview': {
      const opensAt = params.opensAt ? new Date(params.opensAt) : null
      if (!opensAt || Number.isNaN(opensAt.getTime()) || !params.durationMinutes) {
        return fail('The interview schedule is incomplete.', 'موعد الامتحان ناقص.')
      }
      const r = await callInternal({
        method: 'POST',
        path: `/recruitment/applications/${need(params.targetId)}/interview/send`,
        cookie,
        body: { opensAt: opensAt.toISOString(), durationMinutes: params.durationMinutes },
      })
      if (!r.ok) {
        return explain(
          r.error,
          'The interview was not sent. Check that every question is approved and the opening time is still in the future.',
          'ما انبعث الامتحان. تأكد أن كل الأسئلة معتمدة وأن موعد الفتح لسا بالمستقبل.',
        )
      }
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message: L('The approved interview was sent.', 'انبعث الامتحان المعتمد.'),
        path: '/hr/recruitment',
      }
    }

    case 'deleteAnnouncement': {
      const r = await callInternal({ method: 'DELETE', path: `/feed/announcements/${need(params.targetId)}`, cookie })
      if (!r.ok) return explain(r.error, 'It was not taken down.', 'Ù…Ø§ Ø§Ù†Ø³Ø­Ø¨.')
      return {
        ok: true,
        message: L('The announcement is down.', 'Ø§Ù†Ø³Ø­Ø¨ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†.'),
        messageKey: null,
        messageParams: null,
        path: null,
      }
    }

    case 'addCalendarEvent': {
      const from = params.startDate!
      const to = params.endDate ?? from
      /*
       * A day, not a moment. Somebody saying "put the team meeting on Monday"
       * has given a date and no time, and inventing 09:00 for them would put a
       * specific hour on the calendar that nobody chose. The event is all-day
       * and they can narrow it on the calendar screen.
       */
      const r = await callInternal({
        method: 'POST',
        path: '/calendar',
        cookie,
        body: {
          kind: 'meeting',
          title: { en: params.title ?? '', ar: params.title ?? '' },
          startsAt: new Date(`${from}T00:00:00`).toISOString(),
          endsAt: new Date(`${to}T23:59:00`).toISOString(),
          allDay: true,
          audience: 'team',
        },
      })
      if (!r.ok) return explain(r.error, 'The event was not added.', 'Ø§Ù„Ø­Ø¯Ø« Ù…Ø§ Ø§Ù†Ø¶Ø§Ù.')
      return {
        ok: true,
        message: L('It is on the calendar.', 'Ø§Ù†Ø¶Ø§Ù Ø¹Ù„Ù‰ Ø§Ù„ØªÙ‚ÙˆÙŠÙ….'),
        messageKey: null,
        messageParams: null,
        path: '/manager/calendar',
      }
    }

    case 'deleteCalendarEvent': {
      const r = await callInternal({ method: 'DELETE', path: `/calendar/${need(params.targetId)}`, cookie })
      if (!r.ok) return explain(r.error, 'The event was not deleted.', '\u0627\u0644\u062d\u062f\u062b \u0645\u0627 \u0627\u0646\u062d\u0630\u0641.')
      return {
        ok: true,
        message: L('The event is deleted.', '\u0627\u0646\u062d\u0630\u0641 \u0627\u0644\u062d\u062f\u062b.'),
        messageKey: null,
        messageParams: null,
        path: '/manager/calendar',
      }
    }

    case 'changeEmployeeRole': {
      const r = await callInternal({
        method: 'PATCH',
        path: `/employees/${need(params.targetId)}`,
        cookie,
        body: { role: params.role },
      })
      if (!r.ok) return explain(r.error, 'The role was not changed.', 'Ø§Ù„Ø¯ÙˆØ± Ù…Ø§ Ø§Ù†ØºÙŠÙ‘Ø±.')
      return {
        ok: true,
        message: L('The role is changed.', 'Ø§Ù†ØºÙŠÙ‘Ø± Ø§Ù„Ø¯ÙˆØ±.'),
        messageKey: null,
        messageParams: null,
        path: '/admin/users',
      }
    }

    case 'closeOpening': {
      const r = await callInternal({
        method: 'PATCH',
        path: `/recruitment/openings/${need(params.targetId)}`,
        cookie,
        body: { status: 'closed' },
      })
      if (!r.ok) return explain(r.error, 'The vacancy was not closed.', 'Ø§Ù„ÙˆØ¸ÙŠÙØ© Ù…Ø§ Ø§Ù†ØºÙ„Ù‚Øª.')
      return {
        ok: true,
        message: L('The vacancy is closed.', 'Ø§Ù†ØºÙ„Ù‚Øª Ø§Ù„ÙˆØ¸ÙŠÙØ©.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/recruitment',
      }
    }

    case 'deleteOpening': {
      const r = await callInternal({
        method: 'DELETE',
        path: `/recruitment/openings/${need(params.targetId)}`,
        cookie,
      })
      if (!r.ok) return explain(r.error, 'The vacancy was not deleted.', 'Ø§Ù„ÙˆØ¸ÙŠÙØ© Ù…Ø§ Ø§Ù†Ø­Ø°ÙØª.')
      return {
        ok: true,
        message: L('The vacancy is deleted.', 'Ø§Ù†Ø­Ø°ÙØª Ø§Ù„ÙˆØ¸ÙŠÙØ©.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/recruitment',
      }
    }

    case 'addEmployee': {
      const both = (v: string | null) => ({ en: v ?? '', ar: v ?? '' })
      const r = await callInternal({
        method: 'POST',
        path: '/employees',
        cookie,
        body: {
          email: params.email,
          employeeNumber: params.employeeNumberNew,
          fullName: both(params.title),
          jobTitle: both(params.jobTitle),
          department: both(params.department),
          role: params.role ?? 'employee',
          joinedOn: dayKey(new Date()),
        },
      })
      if (!r.ok) {
        return r.error === 'emailTaken'
          ? fail('That email already has an account.', 'Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„ Ù‡Ø§Ø¯ Ø¥Ù„Ù‡ Ø­Ø³Ø§Ø¨ Ø£ØµÙ„Ø§Ù‹.')
          : r.error === 'employeeNumberTaken'
            ? fail('That employee number is already used.', 'Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ÙˆØ¸ÙŠÙÙŠ Ù…Ø³ØªØ¹Ù…Ù„.')
            : fail('The account was not created.', 'Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…Ø§ Ø§Ù†Ø´Ø£.')
      }
      return {
        ok: true,
        message: L('The account is created.', 'Ø§Ù†Ø´Ø£ Ø§Ù„Ø­Ø³Ø§Ø¨.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/employees',
      }
    }

    case 'updateEmployeeDetails': {
      const both = (v: string | null) => ({ en: v ?? '', ar: v ?? '' })
      const r = await callInternal({
        method: 'PATCH',
        path: `/employees/${need(params.targetId)}`,
        cookie,
        body: {
          ...(params.jobTitle ? { jobTitle: both(params.jobTitle) } : {}),
          ...(params.department ? { department: both(params.department) } : {}),
        },
      })
      if (!r.ok) return explain(r.error, 'The details were not changed.', 'Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø§ Ø§Ù†ØºÙŠÙ‘Ø±Øª.')
      return {
        ok: true,
        message: L('The details are updated.', 'Ø§Ù†Ø­Ø¯Ù‘Ø«Øª Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/employees',
      }
    }

    case 'setSalary': {
      const r = await callInternal({
        method: 'POST',
        path: `/payroll/salary/${need(params.targetId)}`,
        cookie,
        body: { basic: params.amount, effectiveFrom: params.startDate },
      })
      if (!r.ok) {
        return r.error === 'runAlreadyApproved'
          ? fail(
              'A payroll run covering that date is already approved, so it cannot change.',
              '\u0641\u064a \u062f\u0648\u0631\u0629 \u0631\u0648\u0627\u062a\u0628 \u0645\u0639\u062a\u0645\u062f\u0629 \u0628\u062a\u063a\u0637\u064a \u0647\u0627\u0644\u062a\u0627\u0631\u064a\u062e\u060c \u0641\u0645\u0627 \u0628\u062a\u0642\u062f\u0631 \u062a\u062a\u063a\u064a\u0651\u0631.',
            )
          : fail('The salary was not set.', '\u0627\u0644\u0631\u0627\u062a\u0628 \u0645\u0627 \u0627\u0646\u062d\u062f\u0651\u062f.')
      }
      return {
        ok: true,
        message: L('The salary is set.', '\u0627\u0646\u062d\u062f\u0651\u062f \u0627\u0644\u0631\u0627\u062a\u0628.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/payroll',
      }
    }

    case 'createPayrollAdjustment': {
      const r = await callInternal({
        method: 'POST',
        path: '/payroll/adjustments',
        cookie,
        body: {
          userId: need(params.targetId),
          kind: need(params.payrollAdjustmentKind),
          amount: need(params.amount),
          effectiveOn: need(params.startDate),
          note: need(params.text),
        },
      })
      if (!r.ok) {
        return r.error === 'runAlreadyApproved'
          ? fail(
              'The payroll period is already approved, so this item cannot be added.',
              '\u062f\u0648\u0631\u0629 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0644\u0647\u0630\u0647 \u0627\u0644\u0641\u062a\u0631\u0629 \u0645\u0639\u062a\u0645\u062f\u0629\u060c \u0644\u0630\u0644\u0643 \u0644\u0627 \u064a\u0645\u0643\u0646 \u0625\u0636\u0627\u0641\u0629 \u0647\u0630\u0627 \u0627\u0644\u0628\u0646\u062f.',
            )
          : fail('The payroll item was not created.', '\u0645\u0627 \u0627\u0646\u0636\u0627\u0641 \u0628\u0646\u062f \u0627\u0644\u0631\u0627\u062a\u0628.')
      }
      return {
        ok: true,
        message: L('The payroll item was created and is waiting for approval.', '\u0627\u0646\u0636\u0627\u0641 \u0628\u0646\u062f \u0627\u0644\u0631\u0627\u062a\u0628 \u0648\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/payroll',
      }
    }
    case 'approvePayrollAdjustment': {
      const r = await callInternal({ method: 'POST', path: `/payroll/adjustments/${need(params.targetId)}/approve`, cookie, body: {} })
      if (!r.ok) return explain(r.error, 'The payroll item was not approved.', '\u0645\u0627 \u0627\u0639\u062a\u0645\u062f\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0631\u0627\u062a\u0628.')
      return {
        ok: true,
        message: L('The payroll item is approved.', '\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0631\u0627\u062a\u0628.'),
        messageKey: null,
        messageParams: null,
        path: '/hr/payroll#adjustments',
      }
    }

    case 'reviewPayrollFinding': {
      const r = await callInternal({
        method: 'POST',
        path: `/payroll/findings/${need(params.targetId)}/review`,
        cookie,
        body: {
          status: params.decision === 'approve' ? 'reviewed' : 'dismissed',
          ...(params.text ? { note: params.text } : {}),
        },
      })
      if (!r.ok) return explain(r.error, 'The payroll finding could not be reviewed.', 'ما قدرت أسجّل مراجعة ملاحظة الرواتب.')
      return {
        ok: true,
        messageKey: null,
        messageParams: null,
        message:
          params.decision === 'approve'
            ? L('The payroll finding is marked reviewed.', 'انعلّمت ملاحظة الرواتب كمراجَعة.')
            : L('The payroll finding is dismissed.', 'انستبعدت ملاحظة الرواتب.'),
        path: '/hr/payroll#review',
      }
    }
    case 'runPayroll': {
      const current = new Date()
      const date = params.startDate ?? `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-01`
      if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(date)) {
        return fail('The payroll month is not valid.', '\u0634\u0647\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d.')
      }
      const r = await callInternal({
        method: 'POST',
        path: '/payroll/runs',
        cookie,
        body: { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) },
      })
      if (!r.ok) {
        return r.error === 'runAlreadyApproved'
          ? fail('This month is already approved and cannot be recalculated.', '\u0647\u0627\u0644\u0634\u0647\u0631 \u0645\u0639\u062a\u0645\u062f \u0648\u0645\u0627 \u0628\u064a\u0646\u062d\u0633\u0628 \u0645\u0646 \u062c\u062f\u064a\u062f.')
          : fail('The payroll could not be calculated.', '\u0645\u0627 \u0642\u062f\u0631\u062a \u0623\u062d\u0633\u0628 \u0627\u0644\u0631\u0648\u0627\u062a\u0628.')
      }
      return { ok: true, message: L('The payroll is calculated.', '\u0627\u0646\u062d\u0633\u0628\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628.'), messageKey: null, messageParams: null, path: '/hr/payroll' }
    }
    case 'auditPayroll': {
      const r = await callInternal({ method: 'POST', path: `/payroll/runs/${need(params.targetId)}/audit`, cookie, body: {} })
      if (!r.ok) return explain(r.error, 'The payroll audit could not be started.', '\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0645\u0627 \u0628\u0644\u0634.')
      return { ok: true, message: L('The payroll audit is ready for review.', '\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u062c\u0627\u0647\u0632 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629.'), messageKey: null, messageParams: null, path: '/hr/payroll' }
    }
    case 'approvePayroll': {
      const r = await callInternal({ method: 'POST', path: `/payroll/runs/${need(params.targetId)}/approve`, cookie, body: {} })
      if (!r.ok) return explain(r.error, 'The payroll was not approved.', '\u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0645\u0627 \u0627\u0646\u0639\u062a\u0645\u062f\u062a.')
      return { ok: true, message: L('The payroll is approved and the payslips are processed.', '\u0627\u0646\u0639\u062a\u0645\u062f\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0648\u0635\u0627\u0631\u062a \u0643\u0634\u0648\u0641 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u062c\u0627\u0647\u0632\u0629.'), messageKey: null, messageParams: null, path: '/hr/payroll' }
    }
  }
}
