import { maintainedHelpDecision } from '../guide/helpRouting.js'
import { deterministicRoutingOutcome, terminalAnswer, type TerminalOutcome } from '../copilot/routingOutcome.js'
import { Hono } from 'hono'
import {
  copilotDeclinedSchema,
  copilotDoSchema,
  copilotFillSchema,
  copilotRequestSchema,
  copilotActionPlanSchema,
  type CopilotAnswer,
  type CopilotDoRequest,
  type CopilotActionPlan,
  type CopilotPlan,
  type CopilotDeclinedRequest,
  type CopilotFillRequest,
  type CopilotRequest,
  type CopilotAction,
  type CopilotIntent,
  type Role,
  type VoiceUiContext,
  idSchema,
} from '@hr/shared'
import { deterministicReadDecision, unscopedAttendanceTiming } from '../copilot/readRules.js'
import { emptyAttendanceSentence, resolveReadClarification } from '../copilot/readClarification.js'
import { validateCopilotPlan, type RoutingSource } from '../copilot/validatePlan.js'
import { executeIntent } from '../copilot/execute.js'
import { intentsFor, mayAsk } from '../copilot/intents.js'
import { continueTask, phraseAnswer, resolveAction, resolveQuestion } from '../copilot/resolve.js'
import { proposeAction, runAction } from '../copilot/perform.js'
import { recall, remember } from '../copilot/memory.js'
import {
  clear as clearTask,
  clearQuestion,
  clearReadClarification,
  lastQuestion,
  pendingFor,
  readClarificationFor,
  remember as rememberTask,
  rememberQuestion,
  rememberReadClarification,
} from '../copilot/conversation.js'
import { EMPTY_ACTION_PLAN, EMPTY_PLAN, lookUp } from '../copilot/phrasebook.js'
import { formFor, valuesFrom } from '../copilot/forms.js'
import { suggestFromApproved } from '../ai/retrieval.js'
import { mayDo } from '../copilot/actions.js'
import { dayKey } from '../domain/workdays.js'
import { buildReport } from '../reports/build.js'
import { buildEmployeeFile, buildEmployeePayrollReport } from '../reports/employeeFile.js'
import { answerGuide, isGuideQuestion, suggestionsFor } from '../guide/answer.js'
import { tourFor } from '../guide/tour.js'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { narrate } from '../reports/narrate.js'
import { requireAuth, validateBody, type AppEnv } from '../middleware.js'
import { env } from '../env.js'
import { answerFromKnowledge } from '../knowledge/service.js'
import { rateLimit } from '../rateLimit.js'
import { exactTrainingAction, exactTrainingMatch, isLikelyInstruction } from '../copilot/training.js'
import { auditCopilot } from '../copilot/audit.js'
import { saveUnansweredQuestion } from '../copilot/unanswered.js'
import { isTrustedVoiceAudit } from '../voice/audit.js'
import { capabilitiesFor } from '../copilot/capabilities.js'
import { contextFor, rememberContext, withContextualPayrollPeriod } from '../copilot/context.js'
import { beginActionExecution, completeActionExecution } from '../copilot/idempotency.js'

/**
 * Asking the HR system a question.
 *
 * Open to every signed-in role, because what differs between them is not
 * whether they may ask but which questions exist for them — and that is decided
 * by `INTENT_ROLES`, checked below, not by anything the model produced.
 *
 * The order of the steps is the security property, so it is worth reading in
 * order: classify, then check the role against the classification, then query.
 * Nothing touches the database before that check, and the check does not
 * consult the model.
 */
export const copilotRoutes = new Hono<AppEnv>()

copilotRoutes.use('*', requireAuth)

// Trusted, request-local server metadata. Never read terminal flags from a body
// or a model plan; do not expose them as execution-capable response fields.
const terminalRouting = new WeakMap<object, TerminalOutcome>()

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function requestAction(c: { get: (key: 'body') => unknown }): CopilotAction | null {
  const body = record(c.get('body'))
  const params = record(body?.params)
  return (text(params?.action) ?? text(body?.action)) as CopilotAction | null
}

function auditEventType(intent: CopilotIntent | null, tool: CopilotAction | null) {
  if (tool === 'openScreen') return 'navigation' as const
  if (tool) return 'action' as const
  if (intent === 'generateReport' || intent === 'myReport' || intent === 'employeeFile' || intent === 'departmentAbsenceComparison') return 'report' as const
  if (intent === 'knowledge') return 'policy' as const
  if (intent === 'howDoI') return 'help' as const
  return 'question' as const
}

const ASSISTANT_REFUSALS = new Set<NonNullable<CopilotAnswer['refusal']>>(['notHrData', 'notPermitted', 'unclear', 'noData'])

function isAssistantRefusal(value: string | null): value is NonNullable<CopilotAnswer['refusal']> {
  return value !== null && ASSISTANT_REFUSALS.has(value as NonNullable<CopilotAnswer['refusal']>)
}

/**
 * A single audit point for every assistant response.  It derives only closed
 * server outputs (intent, action, status, reason) and never reads or saves the
 * chat question, returned figures, employee name, target id, or action values.
 */
function auditMeta(c: { req: { header: (name: string) => string | undefined } }) {
  const sessionId = c.req.header('x-voice-session')
  const signature = c.req.header('x-voice-audit')
  if (sessionId && idSchema.safeParse(sessionId).success && isTrustedVoiceAudit(sessionId, signature)) {
    return { channel: 'voice' as const, voiceSessionId: sessionId }
  }
  return { channel: 'text' as const, voiceSessionId: null }
}

async function auditResponse(c: {
  req: { method: string; path: string; header: (name: string) => string | undefined }
  res: Response
  get: (key: 'user' | 'body') => unknown
}) {
  if (c.req.method !== 'POST' || !c.req.path.includes('/copilot/')) return
  const meta = auditMeta(c)

  let payload: unknown
  try {
    payload = await c.res.clone().json()
  } catch {
    return
  }

  const body = record(payload)
  if (c.req.path.endsWith('/declined')) {
    await auditCopilot(c.get('user') as AppEnv['Variables']['user'], {
      eventType: 'action',
      status: 'declined',
      tool: requestAction(c),
      ...meta,
    })
    return
  }

  const answer = record(body?.answer)
  if (!answer) return

  const intent = text(answer.intent) as CopilotIntent | null
  const result = record(answer.result)
  const resultKind = text(result?.kind)
  const rawRefusal = text(answer.refusal)
  const refusal = isAssistantRefusal(rawRefusal) ? rawRefusal : null
  const proposal = record(result?.proposal)
  const outcome = record(result?.outcome)
  const tool = (requestAction(c) ?? text(proposal?.action)) as CopilotAction | null

  const terminal = terminalRouting.get(c)
  if (terminal) {
    await auditCopilot(c.get('user') as AppEnv['Variables']['user'], {
      eventType: 'question', status: terminal.kind === 'outOfScope' ? 'out_of_scope' : 'invalid',
      intent: 'outOfScope', tool: null, reason: terminal.code, ...meta,
    })
    const question = text(record(c.get('body'))?.question)
    if (question) await saveUnansweredQuestion(c.get('user') as AppEnv['Variables']['user'], question, {
      intent: 'outOfScope', reason: terminal.kind === 'outOfScope' ? 'notHrData' : 'unclear',
    })
    return
  }

  if (refusal) {
    await auditCopilot(c.get('user') as AppEnv['Variables']['user'], {
      eventType: auditEventType(intent, tool),
      status: refusal === 'notPermitted' ? 'denied' : intent === 'outOfScope' ? 'out_of_scope' : 'invalid',
      intent,
      tool,
      reason: refusal,
      ...meta,
    })
    const question = c.req.path.endsWith('/ask') ? text(record(c.get('body'))?.question) : null
    if (question) {
      await saveUnansweredQuestion(c.get('user') as AppEnv['Variables']['user'], question, { intent, reason: refusal })
    }
    return
  }

  if (resultKind === 'confirm' || resultKind === 'choose') {
    await auditCopilot(c.get('user') as AppEnv['Variables']['user'], {
      eventType: auditEventType(intent, tool),
      status: 'proposed',
      intent,
      tool,
      ...meta,
    })
    return
  }

  if (resultKind === 'done') {
    const ok = outcome?.ok === true
    await auditCopilot(c.get('user') as AppEnv['Variables']['user'], {
      eventType: auditEventType(intent, tool),
      status: ok ? 'executed' : 'failed',
      intent,
      tool,
      reason: ok ? null : text(outcome?.messageKey) ?? 'action_failed',
      ...meta,
    })
    return
  }

  await auditCopilot(c.get('user') as AppEnv['Variables']['user'], {
    eventType: auditEventType(intent, tool),
    status: 'answered',
    intent,
    tool,
    reason: null,
    ...meta,
  })
}

copilotRoutes.use('*', async (c, next) => {
  const startedAt = performance.now()
  await next()

  /*
   * Makes a slow turn measurable in the browser's Network panel without
   * exposing a question, a name, a result, or model/provider detail.  The
   * outer voice route forwards this for the one request it makes to Copilot.
   */
  c.header('Server-Timing', `copilot;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`)

  /*
   * A live voice turn has already authenticated the same person before it
   * reaches this in-process route.  The audit write is intentionally
   * best-effort (see auditCopilot), and waiting for its database insert put a
   * full extra round trip after every spoken answer.  Start it now but do not
   * make a spoken response wait for logging. Confirmed writes still run their
   * ordinary `/copilot/do` audit; the deferred event grants no capability and
   * can never allow or skip an action.
   */
  const isVoiceAsk = c.req.path.endsWith('/copilot/ask') && auditMeta(c).channel === 'voice'
  if (isVoiceAsk) {
    void auditResponse(c).catch((error) => console.error('[copilot] deferred voice audit failed:', String(error).slice(0, 120)))
    return
  }

  await auditResponse(c)
})

/** The library service performs its own SQL-level role audience filter. */
async function knowledgeReply(question: string, role: Role): Promise<CopilotAnswer | null> {
  const found = await answerFromKnowledge(question, role)
  if (!found) return null
  return {
    intent: 'knowledge',
    sentence: { en: '', ar: '' },
    result: { kind: 'knowledge', answer: found.answer, sources: found.sources },
    periodLabel: null,
    refusal: null,
    sharingOff: !env.AI_SHARE_DATA,
  }
}

/**
 * A selected employee is UI context, never permission evidence. When the
 * employee page is still visible and the user asks about that person's
 * attendance or payroll, resolve the server-side employee number and run the
 * ordinary employee-file intent. A route change makes this context unusable.
 */
function selectedEmployeeTopic(question: string): 'attendance' | 'payroll' | null {
  const value = question
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
  const refersToEmployee = /\b(?:his|her|their)\b/u.test(value) || /(?:\u062a\u0628\u0639\u0647|\u062a\u0628\u0639\u062a\u0647|\u062d\u0636\u0648\u0631\u0647|\u0631\u0627\u062a\u0628\u0647)/u.test(value)
  if (!refersToEmployee) return null
  if (/\bovertime\b/u.test(value) || value.includes('\u0627\u0636\u0627\u0641\u064a')) return 'payroll'
  if (/\battendance\b/u.test(value) || value.includes('\u062d\u0636\u0648\u0631')) return 'attendance'
  return null
}

async function selectedEmployeePlan(
  question: string,
  actor: AppEnv['Variables']['user'],
  context: VoiceUiContext | null,
): Promise<CopilotPlan | null> {
  const topic = selectedEmployeeTopic(question)
  if (!topic || !context?.selectedEmployeeId || !context.currentPage?.startsWith('/hr/employees')) return null
  if (!mayAsk(actor.role, 'employeeFile')) return null

  const [selected] = await db
    .select({ employeeNumber: users.employeeNumber })
    .from(users)
    .where(eq(users.id, context.selectedEmployeeId))
    .limit(1)
  if (!selected) return null

  return {
    ...EMPTY_PLAN,
    intent: 'employeeFile',
    employeeNumber: selected.employeeNumber,
    reportType: topic === 'payroll' ? 'payroll' : null,
  }
}

/**
 * Twenty questions an hour per person.
 *
 * Each one costs two model calls, and the ceiling is per account rather than
 * per address so that an office behind one address is not rationed collectively
 * — the opposite of the careers form, where the asker is anonymous and the
 * address is all there is.
 */
const askLimit = rateLimit({
  name: 'copilot',
  limit: 20,
  windowMs: 60 * 60 * 1000,
  keyExtra: (c) => c.get('user')?.id ?? null,
})

/** The questions this person can actually ask, for the suggestion chips. */
copilotRoutes.get('/intents', (c) =>
  c.json({
    intents: intentsFor(c.get('user').role),
    /** Questions worth offering on the screen they are on. */
    guide: suggestionsFor(c.get('user').role, c.req.query('path')),
  }),
)

/** The UI, MCP and future voice surfaces can inspect the same derived registry. */
copilotRoutes.get('/capabilities', (c) => c.json(capabilitiesFor(c.get('user').role)))

/**
 * The fields of an instruction, and whatever is already known about them.
 *
 * Sent with a refusal so the panel can show boxes instead of asking for one
 * detail per message. It is an offer, not a redirection: the same refusal still
 * carries its sentence, and an action with nothing to fill in sends no boxes and
 * reads exactly as it did.
 */
async function boxes(plan: CopilotActionPlan, lang: 'en' | 'ar' = 'ar', only?: readonly string[]) {
  const allFields = formFor(plan.action)
  if (!allFields) return {}
  /* Salary contracts deliberately move one required decision at a time. */
  const fields = only?.length ? allFields.filter((field) => only.includes(field.field)) : allFields
  /* Keep known values even when their box was on the previous step. */
  const values = valuesFrom(plan, allFields)

  /*
   * Boxes nobody filled in, filled in from a role the company already wrote up.
   *
   * The complaint that produced this: leave the skills empty and the draft comes
   * back saying "not specified" for section after section \u2014 when there is an
   * approved description for very nearly the same role sitting in the library
   * with all of it written down. Refusing to look at it is not caution, it is
   * ignoring the evidence.
   *
   * Only ever into an empty box, and only from a near-identical role. The
   * document it came from is named beside it, so a suggestion that does not
   * belong is obvious before it is used rather than after it is published.
   */
  let suggested: Record<string, string> | undefined
  if (plan.action === 'generateJobDescription' && plan.title?.trim()) {
    const hit = await suggestFromApproved(plan.title.trim(), plan.department?.trim() ?? null)
    if (hit) {
      suggested = {}
      for (const box of fields) {
        if (values[box.field]) continue
        const found = hit.values[box.field]
        if (!found) continue
        const text = lang === 'ar' ? found.ar || found.en : found.en || found.ar
        if (!text.trim()) continue
        /*
         * A box that only accepts certain answers cannot be pre-filled with
         * prose. Education used to be free text and is now a level, so a
         * neighbouring role's "bachelor's in telecommunications engineering"
         * matches no option — it would leave an empty select wearing a note
         * saying where its value came from.
         */
        if (box.kind === 'choice' && !box.options?.some((o) => o.value === text)) continue
        values[box.field] = text
        suggested[box.field] = hit.from
      }
      if (Object.keys(suggested).length === 0) suggested = undefined
    }
  }

  return { form: fields, values, ...(suggested ? { suggested } : {}) }
}

copilotRoutes.post('/ask', askLimit, validateBody(copilotRequestSchema), async (c) => {
  const actor = c.get('user')
  const body = c.get('body') as CopilotRequest
  const { question } = body
  if (rememberContext(actor.id, body.context)) {
    clearQuestion(actor.id)
    clearReadClarification(actor.id)
  }
  // Voice already renders a short trusted acknowledgement and the structured
  // answer on screen. Do not make it wait for cosmetic prose from a second
  // model call after the server has already calculated the result.
  const voiceRequest = auditMeta(c).channel === 'voice'

  const refuse = (refusal: CopilotAnswer['refusal']): CopilotAnswer =>
    refuseAs(!env.AI_SHARE_DATA, refusal)

  const waiting = pendingFor(actor.id)
  const greeting = lookUp(question, actor.role)
  const greetingOnly = greeting?.kind === 'question' && greeting.intent === 'greeting'
  const pendingRead = !waiting ? readClarificationFor(actor.id) : null
  const readReply = pendingRead && !greetingOnly ? resolveReadClarification(question, pendingRead) : null
  if (!greetingOnly) clearReadClarification(actor.id)
  const routing = readReply?.kind === 'resolved'
    ? { ...readReply, routingSource: 'deterministic' as const }
    : readReply?.kind === 'needsScope'
    ? { kind: 'needsClarification' as const, code: 'attendance_scope_required' as const }
    : deterministicRoutingOutcome(question, actor.role, {
      ...(waiting ? { pendingFields: waiting.asked.fields } : {}),
      previousPlan: lastQuestion(actor.id), ui: contextFor(actor.id), path: body.path,
    })
  switch (routing.kind) {
    case 'needsClarification': case 'unsupportedCapability': case 'outOfScope':
      if (routing.code === 'attendance_scope_required') {
        const timing = readReply?.kind === 'needsScope' ? readReply.timing : unscopedAttendanceTiming(question)
        if (timing) rememberReadClarification(actor.id, { kind: 'attendanceScope', timing })
      }
      terminalRouting.set(c, routing)
      console.info('[copilot] terminal routing', { routingSource: 'deterministic', routingOutcome: routing.kind, routingRule: routing.code })
      return c.json({ answer: terminalAnswer(routing, actor.role) })
    case 'resolved': case 'unresolved': break
  }

  /**
   * 0. Is this an answer to what was just asked?
   *
   * Checked before classifying, because "من الأحد" classified on its own is
   * nothing at all — and read against "which dates?" it is a date. The
   * assistant asked a question one message ago; the obvious thing to do with
   * the reply is read it as the reply.
   *
   * It can decline. Somebody who changes their mind mid-task and types
   * something else entirely falls through to the ordinary path, and the
   * half-finished instruction is dropped.
   */
  // A standalone hello is not a value for a pending form. Keep the task for
  // the next actual answer and avoid a model call just to greet someone.
  if (waiting && !greetingOnly) {
    const carried = await continueTask(question, waiting.asked, waiting.collected, dayKey(new Date()))

    /*
     * Turning the question down is still continuing.
     *
     * The same instruction goes through with this question added to what has
     * been declined, so the gap that produced it is not produced again. That is
     * the whole of the way out: one list, checked by the action that asked.
     */
    const declined = carried.continues
      ? waiting.declined
      : [...waiting.declined, ...waiting.asked.fields]
    const plan = carried.continues ? carried.plan : waiting.collected
    const goingAhead = carried.continues || (carried.skipped && waiting.asked.optional)

    if (goingAhead) {
      const proposed = await proposeAction(plan, actor, declined)
      /*
       * Enough to act on. A choice counts as finished too — its options each
       * carry their own parameters and are answered by pressing one, so there
       * is no further reply to wait for.
       */
      if (proposed.ok) {
        clearTask(actor.id)
        return c.json({
          answer: {
            intent: 'doAction' as const,
            sentence: 'choice' in proposed ? proposed.choice.question : { en: '', ar: '' },
            result:
              'choice' in proposed
                ? ({ kind: 'choose' as const, choice: proposed.choice })
                : ({ kind: 'confirm' as const, proposal: proposed.proposal }),
            periodLabel: null,
            refusal: null,
            sharingOff: false,
          } satisfies CopilotAnswer,
        })
      }
      /* Still short of something: ask for the next piece and stay in the task. */
      if (proposed.missing?.fields.length) {
        rememberTask(actor.id, {
          action: plan.action,
          collected: plan,
          asked: proposed.missing,
          declined,
        })
        return c.json({
          answer: { ...refuse('unclear'), intent: 'doAction' as const },
          error: 'action.unclear',
          action: plan.action,
          /*
           * They have just answered something, so the next question can say so.
           *
           * The wording differs between the two cases and the difference is not
           * cosmetic: "almost, I still need X" told somebody who had only just
           * typed their first sentence that they had nearly got it right.
           */
          continuing: true,
          ...(await boxes(plan, body.lang, plan.action === 'setSalary' ? proposed.missing.fields : undefined)),
          missing: { en: proposed.missing.en, ar: proposed.missing.ar },
          /* So the wording can ask rather than demand. */
          optional: proposed.missing.optional,
        })
      }

      /*
       * The answer was understood and the thing still cannot be done — there
       * is no pending request to withdraw, the day is already recorded. That
       * reason is the answer. Re-reading “annual” as a fresh sentence would
       * replace it with “I did not understand”, which is not what happened.
       */
      clearTask(actor.id)
      return c.json({
        answer: {
          ...refuse(proposed.reason === 'notPermitted' ? 'notPermitted' : 'unclear'),
          intent: 'doAction' as const,
        },
        error: `action.${proposed.reason}`,
        detail: proposed.detail ?? null,
        /*
         * Sent even here, because a fieldless gap is where the reason lives —
         * “there is already a vacancy for that role” is the answer, and dropping
         * it would leave only “I did not understand”.
         */
        missing: proposed.missing ? { en: proposed.missing.en, ar: proposed.missing.ar } : null,
      })
    }
    /*
     * Called off. This ends the turn rather than falling through, because a
     * withdrawal read as a fresh sentence becomes an instruction: “خلص لا
     * تعمل اشي” classified on its own resolved to checkOut, so calling a
     * leave request off offered to clock the person out. Nothing is proposed.
     */
    if (!carried.continues && (carried.abandoned || carried.skipped)) {
      clearTask(actor.id)
      return c.json({
        answer: {
          intent: 'doAction' as const,
          /*
           * A skip only reaches here when the question it answered was one that
           * could not be skipped — the dates of a leave request, the role of a
           * job description. Saying so is better than carrying out something
           * half-specified, and better than the silence of falling through.
           */
          sentence: carried.abandoned
            ? {
                en: 'Dropped it. Tell me when you want something else.',
                ar: 'تمام، تركتها. قلّي لما تحتاج شي تاني.',
              }
            : {
                en: `I cannot go ahead without ${waiting.asked.en}. Say it and I will, or tell me to drop it.`,
                ar: `ما بقدر أكمّل بلا ${waiting.asked.ar}. قلّي إياه وبكمّل، أو قلّي أتركها.`,
              },
          result: { kind: 'none' as const },
          periodLabel: null,
          refusal: null,
          sharingOff: !env.AI_SHARE_DATA,
        } satisfies CopilotAnswer,
      })
    }

    /* Not an answer at all — the half-finished instruction is dropped. */
    clearTask(actor.id)
  }

  /* 1. Classify. The model sees the question and the list of intents for this
        role, and nothing else. No data has been read at this point. */
  const context = contextFor(actor.id)
  const readDecision = deterministicReadDecision(question)
  const help = maintainedHelpDecision(question, actor.role)
  const readAbstained = help.kind === 'abstain' || (help.kind !== 'resolved' && readDecision.kind === 'abstain')
  const strictRead = routing.kind === 'resolved' && routing.routingRule !== 'maintained_help' ? routing.plan : null
  const contextualEmployee = greetingOnly || help.kind === 'resolved' || readAbstained || strictRead ? null : await selectedEmployeePlan(question, actor, context)
  const booked = greetingOnly ? greeting : help.kind === 'resolved' || contextualEmployee || strictRead || readAbstained ? null : lookUp(question, actor.role)
  const guideQuestion = !booked && !strictRead && !readAbstained && (help.kind === 'resolved' || isGuideQuestion(question, actor.role, body.path))
  const trained = booked || guideQuestion || strictRead || readAbstained ? null : exactTrainingMatch(question, actor.role)
  const blockedTrainingAction = booked || guideQuestion || trained || strictRead || readAbstained ? null : exactTrainingAction(question)
  if (blockedTrainingAction && !mayDo(actor.role, blockedTrainingAction)) {
    return c.json({ answer: refuse('notPermitted') })
  }
  /*
   * An instruction the same role has previously accepted already has a stable
   * action category.  Read that small local record before asking the intent
   * model, then still run the action resolver below so today’s name, amount,
   * date and other values are extracted afresh.  Questions deliberately do
   * not use this shortcut because their period or person can change.
   */
  const known =
    !booked && !guideQuestion && !trained && !strictRead && !readAbstained && isLikelyInstruction(question)
      ? await recall(question, actor.role)
      : null
  const resolved = strictRead
    ? { ok: true as const, plan: strictRead }
    : contextualEmployee
    ? { ok: true as const, plan: contextualEmployee }
    : booked
    ? /**
       * Sentences that do not need classifying.
       *
       * A known phrasing routes by lookup, with no model call at all — same
       * words, same answer, every time. This is the fix for the variance the
       * measurements showed: the paths people repeat stop being a judgement
       * call, and the model is left with the sentences nobody has named, which
       * is what it is actually good at.
       *
       * It grants nothing. `lookUp` already returned null for anything this
       * role may not ask or do, and every gate below still runs.
       */
      ({
        ok: true as const,
        plan: {
          ...EMPTY_PLAN,
          intent: booked.kind === 'question' ? booked.intent : ('doAction' as const),
        },
      })
    : guideQuestion
      ? {
          ok: true as const,
          plan: { ...EMPTY_PLAN, intent: 'howDoI' as const },
        }
      : /*
         * The previous question goes in with this one.
         *
         * Only when the phrasebook did not already settle it, which is the
         * common case for a follow-up: nobody lists "وقبلو" in a phrasebook,
         * because it means nothing until you know what came before.
         */
      trained
        ? {
            ok: true as const,
            plan: {
              ...EMPTY_PLAN,
              intent: trained.kind === 'intent' ? trained.intent : ('doAction' as const),
              reportType: trained.kind === 'intent' ? trained.reportType : null,
              refusalReason: trained.kind === 'intent' ? trained.refusal : null,
            },
          }
        : known?.kind === 'instruction'
          ? {
              ok: true as const,
              plan: { ...EMPTY_PLAN, intent: 'doAction' as const },
            }
        : await resolveQuestion(question, actor.role, lastQuestion(actor.id))
  if (!resolved.ok) {
    if (resolved.reason === 'aiInvalidOutput') {
      if ('routingSource' in resolved && 'validation' in resolved && 'issues' in resolved) console.info('[copilot] plan validation', {
        routingSource: resolved.routingSource, status: resolved.validation, issues: resolved.issues,
      })
      return c.json({ answer: refuse('unclear'), error: resolved.reason }, 200)
    }
    const knowledge = await knowledgeReply(question, actor.role)
    if (knowledge) return c.json({ answer: knowledge })
    return c.json({ answer: refuse('unclear'), error: resolved.reason }, 200)
  }

  const routingSource: RoutingSource = strictRead || contextualEmployee || guideQuestion || known?.kind === 'instruction'
    ? 'deterministic' : booked ? 'phrasebook' : trained ? 'training'
    : ('routingSource' in resolved ? resolved.routingSource : 'deterministic')
  const routingRule = routing.kind === 'resolved' ? routing.routingRule
    : help.kind === 'resolved' ? 'maintained_help' as const : readDecision.kind === 'resolved' ? readDecision.routingRule
    : 'routingRule' in resolved ? resolved.routingRule : undefined
  const incoming = validateCopilotPlan(resolved.plan, routingSource)
  if (!incoming.ok) {
    console.info('[copilot] plan validation', { routingSource, ...(routingRule ? { routingRule } : {}), status: incoming.validation, issues: incoming.issues })
    return c.json({ answer: refuse('unclear'), error: incoming.reason }, 200)
  }
  let plan = withContextualPayrollPeriod(incoming.plan, context)

  /*
   * A follow-up that changed nothing is not a follow-up.
   *
   * Carrying the previous intent over is only worth doing if the new message
   * moved something \u2014 the period, the department, the person. When it comes back
   * identical, one of two things happened: the message asked for something the
   * plan cannot express ("\u0648\u0642\u0628\u0644\u0648" \u2014 there is no value for two months back),
   * or the intent was carried and the change was missed. Either way the honest
   * result is the one from before any of this existed: say it was not understood.
   *
   * The alternative is what was measured while building it: "\u0648\u0634\u0648 \u0639\u0646 \u0627\u0644\u0634\u0647\u0631
   * \u0627\u0644\u064a \u0642\u0628\u0644" answered with this month's figures under a sentence about last
   * month. A refusal costs a rephrase; that costs somebody trusting a number.
   */
  const carriedFrom = booked || contextualEmployee || strictRead || guideQuestion ? null : lastQuestion(actor.id)
  if (carriedFrom && plan.intent === carriedFrom.intent) {
    const moved =
      plan.period !== carriedFrom.period ||
      plan.department !== carriedFrom.department ||
      plan.personName !== carriedFrom.personName ||
      plan.employeeNumber !== carriedFrom.employeeNumber ||
      plan.reportType !== carriedFrom.reportType ||
      plan.rankBy !== carriedFrom.rankBy ||
      plan.payrollTopic !== carriedFrom.payrollTopic ||
      plan.month !== carriedFrom.month ||
      plan.year !== carriedFrom.year
    if (!moved) {
      return c.json({ answer: refuse('unclear'), error: 'copilot.followUpUnchanged' }, 200)
    }
  }

  /** Set when the vague-instruction retry below already worked out the action. */
  let reresolved: CopilotActionPlan | null = null

  /**
   * What this sentence meant last time somebody accepted the answer.
   *
   * Applied over the model's choice, not instead of it: the model still runs
   * and still fills in the specifics, and only the routing is pinned. That is
   * the part that was unstable — the same instruction resolving two ways on
   * consecutive tries — and the part a person has already vouched for.
   *
   * It grants nothing. `mayAsk` and every check after it run unchanged, so a
   * routing remembered from an administrator gives an employee the refusal
   * they would have got anyway.
   */
  /*
   * Skipped when the phrasebook already settled it.
   *
   * The two disagreed and the memory won, which was the wrong way round: the
   * phrasebook is written deliberately, the memory is inferred from what
   * happened. "سجل حضوري" is in the book as an instruction, misrouted to
   * `myAttendance` eight times before the book existed, and was pinned there
   * — a wrong reading made permanent by being repeated.
   */
  /* `known` was read above only for imperative wording, where it can skip the
     intent-model round trip.  It remains a routing hint, never a permission. */
  if (known?.kind === 'question' && known.intent && mayAsk(actor.role, known.intent)) {
    plan.intent = known.intent
  } else if (known?.kind === 'instruction') {
    plan.intent = 'doAction'
  }

  /**
   * A second chance for instructions the first pass called vague.
   *
   * The intent classifier decides question-or-instruction, and it is allowed to
   * say "too vague". That verdict is right for a question and wrong for a
   * command: "add something to the calendar" is not an unanswerable question,
   * it is an instruction with a detail missing, and the action layer can say
   * which detail. Three attempts at wording the prompt out of this did not
   * hold — so it is settled in code instead of asked for in English.
   *
   * Only on the `unclear` path, so it costs a model call exactly where the
   * alternative was a refusal that helped nobody. `notHrData` and
   * `notPermitted` are decisions, not doubt, and are not retried.
   */
  const contextual = validateCopilotPlan(plan, routingSource)
  if (!contextual.ok) {
    console.info('[copilot] plan validation', { routingSource, ...(routingRule ? { routingRule } : {}), status: contextual.validation, issues: contextual.issues })
    return c.json({ answer: refuse('unclear'), error: contextual.reason }, 200)
  }
  plan = contextual.plan
  if (plan.intent === 'outOfScope') {
    console.info('[copilot] plan validation', { routingSource, ...(routingRule ? { routingRule } : {}), status: 'valid' })
    if (strictRead && plan.refusalReason === 'notPermitted') {
      return c.json({ answer: refuse('notPermitted') })
    }
    if (plan.refusalReason !== 'unclear') {
      const knowledge = await knowledgeReply(question, actor.role)
      if (knowledge) return c.json({ answer: knowledge })
      /* Counted, because a refusal is a request for something that does not exist yet. */
      void remember(question, actor.role, { kind: 'question', intent: 'outOfScope' }, {
        kind: 'refused',
        reason: plan.refusalReason ?? 'unclear',
      })
      return c.json({ answer: refuse(plan.refusalReason ?? 'unclear') })
    }
    const retry = await resolveAction(question, actor.role, dayKey(new Date()), body.path)
    if (!retry.ok || retry.plan.refusalReason === 'notPermitted') {
      const knowledge = await knowledgeReply(question, actor.role)
      if (knowledge) return c.json({ answer: knowledge })
      return c.json({ answer: refuse(retry.ok ? 'notPermitted' : 'unclear') })
    }
    /*
     * A chosen action with a detail missing is not a dead end. It goes on to be
     * described, and the description is what names the missing piece — "I still
     * need a name for the event" beats "I did not understand", which is the same
     * refusal with the useful half removed.
     */
    plan.intent = 'doAction'
    plan.refusalReason = null
    reresolved = retry.plan
  }

  // Recheck any post-classification rewrite; validation never authorises it.
  const validated = validateCopilotPlan(plan, routingSource)
  console.info('[copilot] plan validation', { routingSource, ...(routingRule ? { routingRule } : {}), status: validated.ok ? 'valid' : validated.validation })
  if (!validated.ok) return c.json({ answer: refuse('unclear'), error: validated.reason }, 200)
  plan = validated.plan

  /* 2. The check that actually enforces anything.
        The model chose; this decides. A model that picked `orgAttendance` for
        an employee — through confusion, or because the question asked it to —
        stops here, and stops before a single row is read. */
  if (!mayAsk(actor.role, plan.intent)) {
    console.warn(`[copilot] ${actor.role} was routed to ${plan.intent} and refused`)
    return c.json({ answer: refuse('notPermitted') })
  }

  /* A named month without its number must be clarified, never defaulted. */
  if (plan.period === 'calendarMonth' && plan.month === null) {
    return c.json({ answer: refuse('unclear') })
  }

  /**
   * Saying hello back, and saying what this can do.
   *
   * Answered here rather than by the model, for three reasons: a greeting has
   * no facts in it to get wrong, a hand-written sentence costs nothing and
   * cannot drift, and the useful half of the reply is the list of questions
   * this person can actually ask — which the panel already knows and shows.
   *
   * "السلام عليكم" is answered with its own response. Returning a generic
   * "hello" to it is the kind of small wrongness that tells an Arabic speaker
   * the product was translated rather than written.
   */
  if (plan.intent === 'greeting') {
    // with or without the article, and however they spaced it
    const salaam = /(ال)?سلام\s*عليكم/.test(question)
    return c.json({
      answer: {
        intent: plan.intent,
        sentence: {
          en: 'Hello. Ask me about what is in the system, or how to do something in it — here is what you can ask me:',
          ar: salaam
            ? 'وعليكم السلام ورحمة الله. اسألني عن اللي بالنظام، أو كيف تعمل إشي فيه — هاي اللي بتقدر تسألني عنه:'
            : 'أهلاً وسهلاً. اسألني عن اللي بالنظام، أو كيف تعمل إشي فيه — هاي اللي بتقدر تسألني عنه:',
        },
        result: { kind: 'none' },
        periodLabel: null,
        refusal: null,
        sharingOff: false,
      } satisfies CopilotAnswer,
    })
  }

  /** An answer grounded in a source visible to this role, never a live data query. */
  if (plan.intent === 'knowledge') {
    const knowledge = await knowledgeReply(question, actor.role)
    return c.json({ answer: knowledge ?? refuse('noData') })
  }

  /**
   * An instruction rather than a question.
   *
   * Three steps, and the order is again the security property: work out which
   * action, check that this role may take it, then describe it and stop. The
   * description goes back to the person and nothing has happened — the write
   * waits for `/do` below, which re-checks everything before it runs.
   */
  if (plan.intent === 'doAction') {
    let wanted = reresolved
    /* A looked-up instruction skips the second model call as well. */
    if (!wanted && booked?.kind === 'action') {
      wanted = {
        ...EMPTY_ACTION_PLAN,
        action: booked.action,
        screen: booked.screen ?? null,
        title: booked.title ?? null,
      }
    }
    if (!wanted && trained?.kind === 'action') {
      wanted = { ...EMPTY_ACTION_PLAN, action: trained.action }
    }
    if (!wanted) {
      const resolvedAction = await resolveAction(question, actor.role, dayKey(new Date()), body.path)
      if (!resolvedAction.ok) return c.json({ answer: refuse('unclear'), error: resolvedAction.reason }, 200)
      wanted = resolvedAction.plan
    }
    /*
     * A remembered routing normally wins because a person accepted it before.
     * Payroll adjustments are an exception: their action is recognised by a
     * closed local rule and has its own confirmation and permission gate. A
     * past model guess for the same wording must not turn "add a bonus" into
     * another protected action and then make HR look unauthorised for it.
     */
    if (known?.kind === 'instruction' && known.action && wanted.action !== 'createPayrollAdjustment') wanted.action = known.action
    if (wanted.refusalReason === 'notPermitted') return c.json({ answer: refuse('notPermitted') })

    const proposed = await proposeAction(wanted, actor)
    if (!proposed.ok) {
      console.warn(`[copilot] ${actor.role} asked for ${wanted.action}: ${proposed.reason}`)
      void remember(question, actor.role, { kind: 'instruction', action: wanted.action }, {
        kind: 'refused',
        reason: proposed.reason,
      })
      /*
       * A missing detail opens a task rather than ending the turn. The
       * assistant has just asked a question, and the next message is almost
       * always the answer to it.
       */
      if (proposed.missing?.fields.length) {
        rememberTask(actor.id, {
          action: wanted.action,
          collected: wanted,
          asked: proposed.missing,
          /* Nothing has been asked yet, so nothing has been turned down yet. */
          declined: [],
        })
      }
      return c.json({
        answer: {
          ...refuse(proposed.reason === 'notPermitted' ? 'notPermitted' : 'unclear'),
          intent: 'doAction' as const,
        },
        error: `action.${proposed.reason}`,
        /**
         * What it decided to do, when it is still willing to do it.
         *
         * A refusal used to name only its reason, which made two different
         * outcomes look identical from outside: routed to the wrong action, and
         * routed to the right one but short of a detail. The first is a defect
         * and the second is a conversation, and telling them apart is the
         * difference between measuring routing and guessing at it.
         *
         * Withheld when the refusal is one of permission. Somebody who may not
         * run payroll has no use for the name of the thing they may not do, and
         * a refusal that reports an action reads as one that took it.
         */
        action: proposed.reason === 'notPermitted' ? null : wanted.action,
        /** Nothing has been answered yet: this is the first thing asked. */
        continuing: false,
        ...(await boxes(wanted, body.lang, wanted.action === 'setSalary' ? proposed.missing?.fields : undefined)),
        /** The names that matched, so "which one?" is answerable. */
        detail: proposed.detail ?? null,
        /** Or the piece it needed and did not get, named in both languages. */
        missing: proposed.missing ? { en: proposed.missing.en, ar: proposed.missing.ar } : null,
        optional: proposed.missing?.optional ?? false,
      })
    }

    /*
     * Safe interface navigation is the exception to the proposal button. A
     * person already has access to the destination and nothing changes; making
     * them confirm "open Payroll" created an extra step that was neither a
     * safety boundary nor a useful review. The action still runs through the
     * same resolver and permission check, and the client verifies the returned
     * typed UI effect before voice announces it.
     */
    if (
      'proposal' in proposed &&
      (proposed.proposal.action === 'openScreen' ||
        proposed.proposal.action === 'filterScreen' ||
        proposed.proposal.action === 'scrollPage' ||
        proposed.proposal.action === 'openEmployeeFile' ||
        proposed.proposal.action === 'markAllNotificationsRead')
    ) {
      const outcome = await runAction(proposed.proposal.params, actor, c.req.header('cookie') ?? '')
      void remember(
        question,
        actor.role,
        { kind: 'instruction', action: proposed.proposal.action },
        outcome.ok ? { kind: 'accepted' } : { kind: 'refused', reason: outcome.messageKey ?? 'failed' },
      )
      return c.json({
        answer: {
          intent: 'doAction' as const,
          sentence: outcome.message,
          result: { kind: 'done' as const, outcome },
          periodLabel: null,
          refusal: null,
          sharingOff: false,
        } satisfies CopilotAnswer,
      })
    }

    /*
     * Either one thing to confirm, or several to choose between. The second
     * case is what "cancel my request" means when two are pending: asking is
     * the honest answer, and picking the most recent is the one that eventually
     * withdraws the wrong one without anybody noticing.
     */
    const result =
      'choice' in proposed
        ? ({ kind: 'choose' as const, choice: proposed.choice })
        : ({ kind: 'confirm' as const, proposal: proposed.proposal })

    return c.json({
      answer: {
        intent: plan.intent,
        sentence: 'choice' in proposed ? proposed.choice.question : { en: '', ar: '' },
        result,
        periodLabel: null,
        refusal: null,
        sharingOff: false,
      } satisfies CopilotAnswer,
    })
  }

  /**
   * How to use the system. Grounded in the guide entries, not in the model's
   * idea of what an HR system usually looks like — see `guide/answer.ts`.
   */
  if (plan.intent === 'howDoI') {
    const guide = await answerGuide(question, actor.role, body.path)
    if (!guide) return c.json({ answer: refuse('unclear') })
    return c.json({
      answer: {
        intent: plan.intent,
        sentence: guide.explanation,
        result: { kind: 'guide', steps: guide.steps, links: guide.links },
        periodLabel: null,
        refusal: null,
        sharingOff: false,
      } satisfies CopilotAnswer,
    })
  }

  /**
   * One person's file, which is a report about somebody rather than about a
   * period. Returning null means either no such employee, or one this asker may
   * not see — and the two are deliberately the same answer, because a different
   * one would confirm that a person exists.
   */
  if (plan.intent === 'employeeFile') {
    const identifier = { employeeNumber: plan.employeeNumber, personName: plan.personName }
    const built = plan.reportType === 'payroll'
      ? await buildEmployeePayrollReport(identifier, actor, { period: plan.period, month: plan.month, year: plan.year })
      : await buildEmployeeFile(identifier, actor, { period: plan.period, month: plan.month, year: plan.year })
    if (!built) return c.json({ answer: refuse('noData') })
    const prose = voiceRequest ? { summary: { en: '', ar: '' }, findings: [] } : await narrate(built)
    /* Employee-file answers are valid conversational subjects too: a later
       "their overtime" or "last month" must retain this authorised person. */
    rememberQuestion(actor.id, plan)
    return c.json({
      answer: {
        intent: plan.intent,
        sentence: { en: '', ar: '' },
        result: { kind: 'report', report: { ...built, ...prose } },
        periodLabel: built.period,
        refusal: null,
        sharingOff: !env.AI_SHARE_DATA,
      } satisfies CopilotAnswer,
    })
  }

  /**
   * A report takes its own path: it is a document rather than an answer, its
   * figures come from `buildReport`, and the prose is written afterwards from
   * those figures by a step that can reach nothing else.
   */
  if (plan.intent === 'generateReport' || plan.intent === 'myReport' || plan.intent === 'departmentAbsenceComparison') {
    /*
     * Whose report it is comes from the intent, which the gate above already
     * checked, and not from a field. `myReport` is open to everybody because it
     * can only ever cover the person asking; `generateReport` is manager and up
     * because it covers other people. One flag, decided here, passed to a
     * function that reads it before it reads anything else.
     */
    const self = plan.intent === 'myReport'
    const reportType = plan.intent === 'departmentAbsenceComparison' ? 'department' : plan.reportType ?? 'attendance'
    const built = await buildReport(reportType, actor, {
      period: plan.period,
      month: plan.month,
      year: plan.year,
      department: plan.department,
      self,
    })
    const prose = voiceRequest ? { summary: { en: '', ar: '' }, findings: [] } : await narrate(built)
    const report = { ...built, ...prose }
    return c.json({
      answer: {
        intent: plan.intent,
        sentence: { en: '', ar: '' },
        result: { kind: 'report' as const, report },
        periodLabel: report.period,
        refusal: null,
        sharingOff: !env.AI_SHARE_DATA,
      } satisfies CopilotAnswer,
    })
  }

  /*
   * A question that reached a query was routed correctly enough to answer, and
   * the person saw the answer. That is the acceptance — there is no button to
   * press on a figure, so the absence of a refusal is the signal available.
   */
  /*
   * Not recorded when the phrasebook knows it: the book is already the answer,
   * and a memory beside it can only ever agree or contradict.
   *
   * The signal is weak even so. For a question, "accepted" means it reached a
   * query without being refused — not that it answered what was asked. A
   * question that lands on a different but valid intent still returns
   * something, and is recorded as a success. It is the best signal available
   * without asking people to rate answers, and it is worth knowing that it
   * over-counts.
   */
  if (!booked && !strictRead) {
    void remember(question, actor.role, { kind: 'question', intent: plan.intent }, { kind: 'accepted' })
  }

  /* 3. Only now, a query — written by hand and scoped in SQL to this person. */
  const { result, periodLabel, empty } = await executeIntent(plan, actor)

  // Attendance supports period changes even when the first read has no rows.
  // Do not lose its subject when the next reply is "last month".
  if (!empty || ['myAttendance', 'teamAttendance', 'orgAttendance'].includes(plan.intent)) {
    rememberQuestion(actor.id, plan)
  }

  if (empty) {
    return c.json({
      answer: {
        intent: plan.intent,
        sentence: emptyAttendanceSentence(plan, periodLabel),
        result,
        periodLabel,
        refusal: 'noData' as const,
        sharingOff: !env.AI_SHARE_DATA,
      },
    })
  }

  /* Local reads already render labelled facts. Do not make a complete answer
     wait for optional model prose after resolving it without a model. */
  const sentence = voiceRequest || routingSource !== 'model'
    ? { en: '', ar: '' }
    : (await phraseAnswer(question, plan.intent, result)) ?? { en: '', ar: '' }

  const answer: CopilotAnswer = {
    intent: plan.intent,
    sentence,
    result,
    periodLabel,
    refusal: null,
    sharingOff: !env.AI_SHARE_DATA,
  }

  return c.json({ answer })
})

/**
 * The introductory tour.
 *
 * On `/auth/me` rather than here would have been tidier, but the tour belongs
 * with the guidance it is built from — and a route that returns it separately
 * means the app can ask for it once at startup and never again.
 */
copilotRoutes.get('/tour', async (c) => {
  const actor = c.get('user')
  const [row] = await db
    .select({ at: users.tourCompletedAt })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1)
  return c.json({ tour: tourFor(actor.role, row?.at ?? null) })
})

/**
 * Finishing, or skipping — recorded the same way.
 *
 * Somebody who dismissed the tour has made a decision. Offering it again at
 * every login would be the software ignoring them; they can start it again
 * themselves by asking the assistant.
 */
copilotRoutes.post('/tour/done', async (c) => {
  const actor = c.get('user')
  await db.update(users).set({ tourCompletedAt: new Date() }).where(eq(users.id, actor.id))
  return c.json({ ok: true })
})

/** Starting it again on purpose, which clears the record rather than faking it. */
copilotRoutes.post('/tour/restart', async (c) => {
  const actor = c.get('user')
  await db.update(users).set({ tourCompletedAt: null }).where(eq(users.id, actor.id))
  const [row] = await db.select({ at: users.tourCompletedAt }).from(users).where(eq(users.id, actor.id)).limit(1)
  return c.json({ tour: tourFor(actor.role, row?.at ?? null) })
})

/**
 * Carrying out what was confirmed.
 *
 * Deliberately a separate endpoint from `/ask`, and deliberately not trusting
 * anything about the proposal it is answering. The confirmation card is a
 * safeguard for the person, not a token: this re-reads the role, re-resolves
 * the record, and calls the same route a browser would, which performs its own
 * permission check on the way in. A client that fabricated a proposal and
 * posted it here gets exactly what it would get by calling that route directly,
 * which is a refusal.
 *
 * Rate-limited harder than asking. A question costs two model calls; this
 * changes records, and twenty of those an hour is already generous for
 * something a person is confirming one press at a time.
 */
/**
 * A refusal, with nothing else attached.
 *
 * Lifted out of the `/ask` handler when a second handler needed the same shape.
 * Two copies of this would be two places for the sharing flag to be forgotten.
 */
function refuseAs(sharingOff: boolean, refusal: CopilotAnswer['refusal']): CopilotAnswer {
  return {
    intent: 'outOfScope',
    sentence: { en: '', ar: '' },
    result: { kind: 'none' },
    periodLabel: null,
    refusal,
    sharingOff,
  }
}

const doLimit = rateLimit({
  name: 'copilot-do',
  limit: 20,
  windowMs: 60 * 60 * 1000,
  keyExtra: (c) => c.get('user')?.id ?? null,
})

copilotRoutes.post('/do', doLimit, validateBody(copilotDoSchema), async (c) => {
  const actor = c.get('user')
  const body = c.get('body') as CopilotDoRequest
  const { params } = body

  /*
   * The asker's own session, forwarded. The action runs as them, so it can do
   * what they could do by hand and nothing more.
   */
  const cookie = c.req.header('cookie') ?? ''
  let outcome
  if (body.operationId) {
    const execution = await beginActionExecution(actor, body.operationId, params.action)
    if (execution.kind === 'processing') return c.json({ error: 'actionProcessing', message: 'actionProcessing' }, 409)
    if (execution.kind === 'conflict') return c.json({ error: 'actionOperationConflict', message: 'actionOperationConflict' }, 409)
    if (execution.kind === 'completed') {
      outcome = execution.outcome
    } else {
      outcome = await runAction(params, actor, cookie)
      await completeActionExecution(actor, body.operationId, params.action, outcome)
    }
  } else {
    outcome = await runAction(params, actor, cookie)
  }

  console.log(`[copilot] ${actor.role} ${params.action}: ${outcome.ok ? 'done' : 'refused'}`)

  /*
   * Learned only on success. A person confirmed it AND the backend carried it
   * out — anything less is not evidence the sentence was understood. A failure
   * here is recorded as a refusal instead, since the routing may have been the
   * reason it could not run.
   */
  if (body.question) {
    void remember(
      body.question,
      actor.role,
      { kind: 'instruction', action: params.action },
      outcome.ok ? { kind: 'accepted' } : { kind: 'refused', reason: outcome.messageKey ?? 'failed' },
    )
  }

  return c.json({
    answer: {
      intent: 'doAction' as const,
      sentence: outcome.message,
      result: { kind: 'done' as const, outcome },
      periodLabel: null,
      refusal: null,
      sharingOff: false,
    } satisfies CopilotAnswer,
  })
})

/**
 * A filled-in form, turned into the same proposal a sentence would produce.
 *
 * There is no model call anywhere in this handler, and that is the point of it:
 * a form has already answered the question a classifier exists to answer, so
 * running one would be spending latency and money to re-derive what was typed
 * into labelled boxes. It is also why this is deterministic where `/ask` is not.
 *
 * What it does NOT skip is any check. The plan it builds goes through
 * `proposeAction` exactly as a spoken one does, so the gap checks, the name
 * resolution and the permission gate all run, and confirmation still happens
 * afterwards through `/do`. The form decides what is asked for, never what is
 * allowed.
 */
copilotRoutes.post('/fill', doLimit, validateBody(copilotFillSchema), async (c) => {
  const actor = c.get('user')
  const { action, values } = c.get('body') as CopilotFillRequest

  /*
   * Refused here as well as inside `proposeAction`.
   *
   * Not redundancy for its own sake: this endpoint takes an action name straight
   * from the client, which is the one place in the assistant where that happens.
   * A caller naming something they may not do is turned away before a row is
   * read, and the refusal says nothing about whether the action exists.
   */
  if (!mayDo(actor.role, action)) {
    return c.json({ answer: refuseAs(!env.AI_SHARE_DATA, 'notPermitted') }, 200)
  }

  const fields = formFor(action)
  if (!fields) return c.json({ answer: refuseAs(!env.AI_SHARE_DATA, 'unclear') }, 200)

  /*
   * Only the fields this action declared, and nothing else in the body.
   *
   * The plan has twenty-odd fields and a form names a handful of them. Reading
   * the body wholesale would let a request for leave arrive carrying a
   * `personName`, which is somebody else's leave — so the declaration is the
   * whitelist, and anything not on it never reaches the plan.
   */
  const draft: Record<string, unknown> = { ...EMPTY_ACTION_PLAN, action }
  const declined: (keyof CopilotActionPlan)[] = []
  /* Boxes that have no field of their own, written out as labelled lines. */
  const folded: string[] = []

  for (const box of fields) {
    const typed = (values[box.field] ?? '').trim()
    if (!typed) {
      /* An optional box left empty is an answer, and is not asked about again. */
      if (!box.required && !box.into) declined.push(box.field as keyof CopilotActionPlan)
      continue
    }
    /* A choice may only be one of the values that were offered for it. */
    if (box.kind === 'choice' && !box.options?.some((o) => o.value === typed)) continue

    if (box.into) {
      /*
       * Labelled in English, which is what the generator reads its prompt in.
       * A choice is written as the value, not the Arabic the person picked, so
       * "senior" arrives as "senior".
       */
      folded.push(`${box.label.en}: ${typed}`)
      continue
    }
    draft[box.field] = typed
  }

  if (folded.length) {
    const existing = typeof draft.text === 'string' && draft.text ? `${draft.text}\n` : ''
    draft.text = `${existing}${folded.join('\n')}`
  } else if (fields.some((f) => f.into)) {
    /* Every composed box was left empty, so the brief was declined as a whole. */
    declined.push('text')
  }

  const parsed = copilotActionPlanSchema.safeParse(draft)
  if (!parsed.success) return c.json({ answer: refuseAs(!env.AI_SHARE_DATA, 'unclear') }, 200)
  const plan = parsed.data

  const proposed = await proposeAction(plan, actor, declined)
  if (!proposed.ok) {
    return c.json({
      answer: { ...refuseAs(!env.AI_SHARE_DATA, proposed.reason === 'notPermitted' ? 'notPermitted' : 'unclear'), intent: 'doAction' as const },
      error: `action.${proposed.reason}`,
      action: proposed.reason === 'notPermitted' ? null : action,
      detail: proposed.detail ?? null,
      /* The boxes again, holding what was typed, with the problem named. */
      ...(await boxes(plan, 'ar', action === 'setSalary' ? proposed.missing?.fields : undefined)),
      missing: proposed.missing ? { en: proposed.missing.en, ar: proposed.missing.ar } : null,
      optional: proposed.missing?.optional ?? false,
      continuing: true,
    })
  }

  return c.json({
    answer: {
      intent: 'doAction' as const,
      sentence: 'choice' in proposed ? proposed.choice.question : { en: '', ar: '' },
      result:
        'choice' in proposed
          ? ({ kind: 'choose' as const, choice: proposed.choice })
          : ({ kind: 'confirm' as const, proposal: proposed.proposal }),
      periodLabel: null,
      refusal: null,
      sharingOff: !env.AI_SHARE_DATA,
    } satisfies CopilotAnswer,
  })
})

/**
 * Somebody read the proposal and said no.
 *
 * The most valuable signal the assistant gets, and the only one it cannot
 * infer: a person who understood what was about to happen decided it was not
 * what they asked for. One of these stops the routing being reused, which is
 * the point — a wrong reading that keeps being confidently repeated is worse
 * than one that was never learned.
 *
 * Fire-and-forget from the client's side; it returns ok whatever happens,
 * because a person cancelling something must never see an error for it.
 */
copilotRoutes.post('/declined', validateBody(copilotDeclinedSchema), async (c) => {
  const actor = c.get('user')
  const { question, action } = c.get('body') as CopilotDeclinedRequest
  await remember(question, actor.role, { kind: 'instruction', action }, { kind: 'rejected' })
  return c.json({ ok: true })
})
