import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { localVoiceHealth, localOllamaReachable, LocalVoiceError, MAX_LOCAL_AUDIO_BYTES, transcribeLocalWav, synthesizeLocalSpeech } from '../voice/local.js'
import { HTTPException } from 'hono/http-exception'
import {
  copilotAnswerSchema,
  idSchema,
  navigationPathFor,
  voiceConfirmSchema,
  voiceReviewSchema,
  voiceTurnSchema,
  type CopilotAnswer,
  type ActionProposal,
  type NavigationPageId,
  type SessionUser,
  type VoiceUiContext,
  type VoiceTurn,
} from '@hr/shared'
import { callInternal } from '../internalApi.js'
import { env, isProduction } from '../env.js'
import { requireAuth, validateBody, type AppEnv } from '../middleware.js'
import { rateLimit } from '../rateLimit.js'
import { auditCopilot } from '../copilot/audit.js'
import { GUIDE_PAGES } from '../guide/pages.js'
import { VoiceRealtimeError, createRealtimeCall, createRealtimeClientSecret } from '../voice/realtime.js'
import { voiceAuditSignature } from '../voice/audit.js'
import {
  beginConfirmation,
  beginTurn,
  cachedTurn,
  closeVoiceSession,
  completeConfirmation,
  completeTurn,
  clearChoice,
  createVoiceSession,
  releaseConfirmation,
  releaseTurn,
  rememberConfirmation,
  rememberChoice,
  resolveChoiceOrdinal,
  reviewConfirmation,
  sessionFor,
  type VoiceConfirmationPublic,
  type VoiceSession,
  type VoiceTurnResult,
} from '../voice/session.js'

/**
 * Voice is a transport around the existing assistant, not another assistant.
 *
 * The only paths this router calls are `/copilot/ask` and `/copilot/do`, with
 * the same signed-in cookie as the person. Those routes retain all intent,
 * RAG, scope, role and action checks. This router has no database import and
 * no access to the MCP server by design.
 */
export const voiceRoutes = new Hono<AppEnv>()

voiceRoutes.use('*', requireAuth)

const connectLimit = rateLimit({
  name: 'voice-connect',
  limit: 20,
  windowMs: 60 * 60 * 1000,
  keyExtra: (c) => c.get('user')?.id ?? null,
})

const turnLimit = rateLimit({
  name: 'voice-turn',
  limit: 80,
  windowMs: 60 * 60 * 1000,
  keyExtra: (c) => c.get('user')?.id ?? null,
})

function voiceReady() {
  return env.VOICE_PROVIDER === 'openai' && env.VOICE_ENABLED && env.VOICE_SHARE_AUDIO && Boolean(env.OPENAI_API_KEY)
}

function voiceUnavailable(c: { json: (body: unknown, status: 503) => Response }) {
  const error = !env.VOICE_ENABLED ? 'voiceDisabled' : !env.VOICE_SHARE_AUDIO ? 'voiceDataSharingRequired' : 'voiceUnavailable'
  return c.json({ error, message: error }, 503)
}

function devMockReady() {
  return !isProduction && env.VOICE_DEV_MOCK
}

function validSession(c: { req: { param: (name: string) => string }; get: (key: 'user') => AppEnv['Variables']['user'] }): VoiceSession {
  const id = c.req.param('sessionId')
  if (!idSchema.safeParse(id).success) throw new HTTPException(404, { message: 'voiceSessionNotFound' })
  const session = sessionFor(id, c.get('user'))
  if (!session) throw new HTTPException(404, { message: 'voiceSessionNotFound' })
  return session
}

function internalHeaders(session: VoiceSession) {
  return {
    'x-copilot-channel': 'voice',
    'x-voice-session': session.id,
    'x-voice-audit': voiceAuditSignature(session.id),
  }
}

function answerFrom(data: unknown): CopilotAnswer | null {
  if (!data || typeof data !== 'object') return null
  const answer = (data as { answer?: unknown }).answer
  const parsed = copilotAnswerSchema.safeParse(answer)
  return parsed.success ? parsed.data : null
}

function answerFromChoice(proposal: ActionProposal): CopilotAnswer {
  return {
    intent: 'doAction',
    sentence: proposal.summary,
    result: { kind: 'confirm', proposal },
    periodLabel: null,
    refusal: null,
    sharingOff: false,
  }
}

function local(value: { en: string; ar: string }, lang: 'en' | 'ar') {
  return (lang === 'ar' ? value.ar || value.en : value.en || value.ar).trim()
}

/**
 * A coarse split between the voice transport and the Copilot route.  It is
 * deliberately timing-only: the header names no people, data, prompts, or
 * provider calls, but lets us tell a slow transcription hand-off from a slow
 * HR request in the browser's Network panel.
 */
function setVoiceTiming(
  c: { header: (name: string, value: string) => void },
  startedAt: number,
  copilotTiming: string | null = null,
) {
  const own = `voice;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`
  c.header('Server-Timing', copilotTiming ? `${own}, ${copilotTiming}` : own)
}

/**
 * Connection setup has two independent network legs: this endpoint issues the
 * short-lived credential and the browser then performs its WebRTC exchange.
 * Report only the first duration, without any identity or transcript data, so
 * a slow network path is visible in DevTools rather than looking like a slow
 * HR request.
 */
function setVoiceConnectTiming(c: { header: (name: string, value: string) => void }, startedAt: number, metric: 'voice-prepare' | 'voice-connect') {
  c.header('Server-Timing', `${metric};dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`)
}

type VoiceNavigation = {
  page: NavigationPageId
  aliases: readonly string[]
  tab?: 'requests' | 'calendar'
}

/* Page ids, never URLs. Fast navigation is still checked against the signed-in role. */
const FAST_VOICE_NAVIGATION: readonly VoiceNavigation[] = [
  { page: 'assistant', aliases: ['mena chat', 'menachat', '\u0645\u064a\u0646\u0627 \u0634\u0627\u062a', '\u0627\u0644\u0634\u0627\u062a'] },
  {
    page: 'payroll',
    aliases: [
      'payroll',
      '\u0627\u0644\u0631\u0648\u0627\u062a\u0628',
      '\u0631\u0648\u0627\u062a\u0628',
      '\u0627\u0644\u0631\u0627\u062a\u0628',
      '\u0631\u0627\u062a\u0628',
      '\u0627\u0644\u0631\u0648\u0627\u062a',
    ],
  },
  { page: 'payrollOverview', aliases: ['payroll overview', '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0631\u0648\u0627\u062a\u0628'] },
  { page: 'payrollRuns', aliases: ['payroll runs', '\u062f\u0648\u0631\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628'] },
  { page: 'payrollSalaries', aliases: ['employee salaries', '\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646'] },
  { page: 'payrollEarnings', aliases: ['earnings and deductions', '\u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642\u0627\u062a \u0648\u0627\u0644\u062e\u0635\u0648\u0645\u0627\u062a'] },
  { page: 'payrollOvertime', aliases: ['payroll overtime', 'overtime', '\u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0627\u0636\u0627\u0641\u064a'] },
  { page: 'payrollBonuses', aliases: ['payroll bonuses', 'bonuses', '\u0645\u0643\u0627\u0641\u0622\u062a', '\u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062a'] },
  { page: 'payrollAdjustments', aliases: ['payroll adjustments', '\u062a\u0639\u062f\u064a\u0644\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628'] },
  { page: 'payrollReview', aliases: ['payroll review', '\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0631\u0648\u0627\u062a\u0628'] },
  { page: 'payrollPayslips', aliases: ['payroll payslips', '\u0643\u0634\u0648\u0641 \u0627\u0644\u0631\u0648\u0627\u062a\u0628'] },
  { page: 'payrollReports', aliases: ['payroll reports', '\u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628'] },
  { page: 'employees', aliases: ['employees', 'employee records', '\u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646', '\u0633\u062c\u0644\u0627\u062a \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646'] },
  { page: 'attendance', aliases: ['attendance', '\u0627\u0644\u062d\u0636\u0648\u0631'] },
  { page: 'leaves', tab: 'calendar', aliases: ['leave calendar', 'leaves calendar', '\u062a\u0642\u0648\u064a\u0645 \u0627\u0644\u0627\u062c\u0627\u0632\u0627\u062a', '\u062a\u0642\u0648\u064a\u0645 \u0627\u0644\u0627\u062c\u0627\u0632\u0629'] },
  { page: 'leaves', tab: 'requests', aliases: ['leave requests', '\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0627\u062c\u0627\u0632\u0627\u062a'] },
  { page: 'leaves', aliases: ['leaves', 'leave management', '\u0627\u0644\u0627\u062c\u0627\u0632\u0627\u062a', '\u0627\u0644\u0627\u062c\u0627\u0632\u0629'] },
  {
    page: 'recruitment',
    /* Arabic speech recognition commonly substitutes ض for ظ in "التوظيف".
       These are page aliases only; the role check below still decides whether
       this account can navigate there. */
    aliases: [
      'recruitment',
      '\u0627\u0644\u062a\u0648\u0638\u064a\u0641',
      '\u0627\u0644\u062a\u0648\u0636\u064a\u0641',
      '\u062a\u0648\u0638\u064a\u0641',
      '\u062a\u0648\u0636\u064a\u0641',
    ],
  },
  { page: 'jobDescriptions', aliases: ['job descriptions', 'job description', '\u0627\u0644\u0627\u0648\u0635\u0627\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a\u0629'] },
  { page: 'reports', aliases: ['reports', '\u0627\u0644\u062a\u0642\u0627\u0631\u064a\u0631'] },
  { page: 'attention', aliases: ['attention centre', 'attention center', '\u0645\u0631\u0643\u0632 \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a'] },
  { page: 'hrCalendar', aliases: ['team calendar', 'calendar', '\u062a\u0642\u0648\u064a\u0645 \u0627\u0644\u0641\u0631\u064a\u0642', '\u0627\u0644\u062a\u0642\u0648\u064a\u0645'] },
  { page: 'knowledge', aliases: ['knowledge base', '\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629'] },
  { page: 'assistantQuestions', aliases: ['assistant questions', '\u0627\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0633\u0627\u0639\u062f'] },
  { page: 'hrAnnouncements', aliases: ['announcements', '\u0627\u0644\u0627\u0639\u0644\u0627\u0646\u0627\u062a'] },
  { page: 'hrCenter', aliases: ['hr centre', 'hr center', '\u0645\u0631\u0643\u0632 \u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0627\u0644\u0628\u0634\u0631\u064a\u0629'] },
  { page: 'managerDashboard', aliases: ['manager dashboard', '\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u062f\u064a\u0631'] },
  { page: 'managerTeam', aliases: ['my team', 'team', '\u0641\u0631\u064a\u0642\u064a'] },
  { page: 'managerAttendance', aliases: ['team attendance', '\u062d\u0636\u0648\u0631 \u0627\u0644\u0641\u0631\u064a\u0642'] },
  { page: 'managerLeaves', aliases: ['team leave', '\u0627\u062c\u0627\u0632\u0627\u062a \u0627\u0644\u0641\u0631\u064a\u0642'] },
  { page: 'managerApprovals', aliases: ['approvals', '\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062a'] },
  { page: 'managerCalendar', aliases: ['team calendar', '\u062a\u0642\u0648\u064a\u0645 \u0627\u0644\u0641\u0631\u064a\u0642'] },
  { page: 'managerReports', aliases: ['team reports', '\u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0641\u0631\u064a\u0642'] },
  { page: 'managerAnnouncements', aliases: ['announcements', '\u0627\u0644\u0627\u0639\u0644\u0627\u0646\u0627\u062a'] },
  { page: 'managerProfile', aliases: ['my profile', 'profile', '\u0645\u0644\u0641\u064a \u0627\u0644\u0634\u062e\u0635\u064a'] },
  { page: 'managerSettings', aliases: ['settings', '\u0627\u0644\u0627\u0639\u062f\u0627\u062f\u0627\u062a'] },
  { page: 'adminDashboard', aliases: ['dashboard', '\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a'] },
  { page: 'adminOverview', aliases: ['admin overview', '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0627\u062f\u0627\u0631\u0629'] },
  { page: 'adminUsers', aliases: ['user roles', 'users', '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646', '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646'] },
  { page: 'adminApprovals', aliases: ['approvals', '\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062a'] },
  { page: 'adminAnnouncements', aliases: ['announcements', '\u0627\u0644\u0627\u0639\u0644\u0627\u0646\u0627\u062a'] },
  { page: 'employeeOverview', aliases: ['my page', 'overview', '\u0635\u0641\u062d\u062a\u064a', '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629'] },
  { page: 'employeeAttendance', aliases: ['my attendance', '\u062d\u0636\u0648\u0631\u064a'] },
  { page: 'employeeLeave', aliases: ['my leave', 'leave balance', '\u0627\u062c\u0627\u0632\u0627\u062a\u064a', '\u0631\u0635\u064a\u062f \u0627\u0644\u0627\u062c\u0627\u0632\u0627\u062a'] },
  { page: 'employeeRequests', aliases: ['my requests', '\u0637\u0644\u0628\u0627\u062a\u064a'] },
  { page: 'employeePayslips', aliases: ['my payslips', 'payslips', '\u0643\u0634\u0648\u0641 \u0631\u0648\u0627\u062a\u0628\u064a', '\u0631\u0648\u0627\u062a\u0628\u064a'] },
  { page: 'employeeNotifications', aliases: ['my notifications', 'notifications', '\u0627\u0634\u0639\u0627\u0631\u0627\u062a\u064a', '\u0627\u0644\u0627\u0634\u0639\u0627\u0631\u0627\u062a'] },
]

function normaliseVoiceNavigation(text: string) {
  return text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064b-\u065f]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Speech recognition often finishes a page name one or two characters early
 * (for example, "الروات" instead of "الرواتب").  Accept that narrow case
 * only at the end of a known alias; the command verb, role check and page-id
 * allowlist still run before navigation is returned.
 */
function voiceAliasMatchLength(spoken: string, rawAlias: string) {
  const alias = normaliseVoiceNavigation(rawAlias)
  if (!alias) return 0
  if (spoken.includes(alias)) return alias.length

  const aliasWords = alias.split(' ')
  const spokenWords = spoken.split(' ')
  for (let start = 0; start <= spokenWords.length - aliasWords.length; start += 1) {
    const matches = aliasWords.every((aliasWord, index) => {
      const spokenWord = spokenWords[start + index]
      if (!spokenWord) return false
      if (spokenWord === aliasWord) return true

      const finalAliasWord = index === aliasWords.length - 1
      return finalAliasWord && spokenWord.length >= 4 && aliasWord.startsWith(spokenWord) && aliasWord.length - spokenWord.length <= 2
    })
    if (matches) return Math.max(1, alias.length - 1)
  }
  return 0
}

const PAYROLL_MONTHS: ReadonlyArray<readonly [string, string]> = [
  ['january', '01'], ['february', '02'], ['march', '03'], ['april', '04'], ['may', '05'], ['june', '06'],
  ['july', '07'], ['august', '08'], ['september', '09'], ['october', '10'], ['november', '11'], ['december', '12'],
  ['كانون الثاني', '01'], ['شباط', '02'], ['آذار', '03'], ['نيسان', '04'], ['أيار', '05'], ['حزيران', '06'],
  ['تموز', '07'], ['آب', '08'], ['ايلول', '09'], ['أيلول', '09'], ['تشرين الاول', '10'], ['تشرين الأول', '10'], ['تشرين الثاني', '11'], ['كانون الاول', '12'], ['كانون الأول', '12'],
]

/** A month-selection command is valid only inside the authorised payroll workspace. */
function payrollPeriodFromVoice(question: string, actor: SessionUser, context?: VoiceUiContext) {
  if (!context?.currentPage?.startsWith('/hr/payroll')) return null
  if (!GUIDE_PAGES.some((page) => page.path === '/hr/payroll' && page.roles.includes(actor.role))) return null
  const spoken = normaliseVoiceNavigation(question)
  const matched = PAYROLL_MONTHS.find(([name]) => spoken.includes(normaliseVoiceNavigation(name)))
  if (!matched) return null
  const suppliedYear = spoken.match(/\b(20\d{2})\b/)?.[1]
  const selectedYear = suppliedYear ?? context.selectedPayrollPeriod?.slice(0, 4) ?? String(new Date().getFullYear())
  return `${selectedYear}-${matched[1]}`
}

/** Scroll commands are local UI work and should never wait for a model call. */
function fastSpokenScroll(question: string, lang: 'en' | 'ar'): CopilotAnswer | null {
  const spoken = normaliseVoiceNavigation(question)
  let target: 'up' | 'down' | 'top' | 'bottom' | null = null
  if (/\b(?:top|beginning)\b|(?:\u0627\u0648\u0644|\u0623\u0648\u0644|\u0628\u062f\u0627\u064a\u0629)\s+\u0627\u0644\u0635\u0641\u062d\u0629/u.test(spoken)) target = 'top'
  else if (/\b(?:bottom|end)\b|(?:\u0627\u062e\u0631|\u0622\u062e\u0631|\u0646\u0647\u0627\u064a\u0629)\s+\u0627\u0644\u0635\u0641\u062d\u0629/u.test(spoken)) target = 'bottom'
  else if (/\b(?:scroll\s+up|page\s+up)\b|^(?:\u0627\u0637\u0644\u0639|\u0637\u0644\u0639|\u0627\u0637\u0644\u0639\u064a|\u0637\u0644\u0639\u064a|\u0637\u0644\u0639\u0646\u064a|\u0627\u0637\u0644\u0639\u0646\u064a)(?:\s|$)|(?:\s|^)(?:\u0644\u0641\u0648\u0642|\u0641\u0648\u0642)(?:\s|$)/u.test(spoken)) target = 'up'
  else if (/\b(?:scroll\s+down|page\s+down)\b|^(?:\u0627\u0646\u0632\u0644|\u0646\u0632\u0644|\u0627\u0646\u0632\u0644\u064a|\u0646\u0632\u0644\u064a|\u0646\u0632\u0644\u0646\u064a|\u0627\u0646\u0632\u0644\u0646\u064a)(?:\s|$)|(?:\s|^)(?:\u0644\u062a\u062d\u062a|\u062a\u062d\u062a|\u0644\u0644\u0627\u0633\u0641\u0644|\u0627\u0633\u0641\u0644|\u0623\u0633\u0641\u0644)(?:\s|$)/u.test(spoken)) target = 'down'
  if (!target) return null

  const message = lang === 'ar' ? '\u062a\u0645 \u062a\u062d\u0631\u064a\u0643 \u0627\u0644\u0635\u0641\u062d\u0629.' : 'The page moved.'
  return {
    intent: 'doAction',
    sentence: { en: message, ar: message },
    periodLabel: null,
    refusal: null,
    sharingOff: false,
    result: {
      kind: 'done',
      outcome: {
        ok: true,
        message: { en: message, ar: message },
        messageKey: null,
        messageParams: null,
        path: null,
        uiEffect: { kind: 'scroll', target },
      },
    },
  }
}

/** Exported for the deterministic voice-route check; it has no HTTP surface. */
export function fastSpokenNavigation(question: string, actor: SessionUser, lang: 'en' | 'ar', context?: VoiceUiContext): CopilotAnswer | null {
  const selectedPeriod = payrollPeriodFromVoice(question, actor, context)
  if (selectedPeriod) {
    const page: NavigationPageId = context?.currentPage?.includes('#review') ? 'payrollReview' : 'payroll'
    const path = navigationPathFor(page)
    if (!path) return null
    const message = lang === 'ar' ? 'سأعرض دورة الرواتب للشهر المطلوب.' : 'Opening the requested payroll period.'
    return {
      intent: 'doAction', sentence: { en: message, ar: message }, periodLabel: null, refusal: null, sharingOff: false,
      result: { kind: 'done', outcome: { ok: true, message: { en: message, ar: message }, messageKey: null, messageParams: null, path, uiEffect: { kind: 'navigate', page, period: selectedPeriod } } },
    }
  }
  const spoken = normaliseVoiceNavigation(question)
  const navigationVerb = /\b(open|go|navigate|show|take me|click|press)\b|(?:^|\s)(?:\u0627\u0641\u062a\u062d|\u0627\u0641\u062a\u062d\u0644\u064a|\u0631\u0648\u062d|\u0648\u062f\u064a\u0646\u064a|\u062e\u0630\u0646\u064a|\u0627\u0646\u062a\u0642\u0644|\u0627\u0639\u0631\u0636|\u0648\u0631\u062c\u064a\u0646\u064a|\u0627\u0636\u063a\u0637|\u0636\u063a\u0637|\u0627\u0643\u0628\u0633|\u0643\u0628\u0633)(?:\s|$)/u
  if (!navigationVerb.test(spoken)) return null

  /* "show their overtime" is a contextual employee request, not a command to
     open the company-wide overtime page. Let the existing Copilot context
     resolver decide it, with the normal role and scope checks. */
  if (/\b(?:his|her|their)\b/u.test(spoken) || /(?:\u062a\u0628\u0639\u0647|\u062a\u0628\u0639\u062a\u0647|\u062d\u0636\u0648\u0631\u0647|\u0631\u0627\u062a\u0628\u0647)/u.test(spoken)) return null

  const navigationRefusal = (refusal: CopilotAnswer['refusal']): CopilotAnswer => ({
    intent: 'doAction',
    sentence: { en: '', ar: '' },
    periodLabel: null,
    refusal,
    sharingOff: false,
    result: { kind: 'none' },
  })

  /* Match a named screen before applying its role gate. A denied or unknown
     destination must not fall through to a fuzzy Copilot page match. */
  const matches = FAST_VOICE_NAVIGATION.flatMap((entry) => {
    const path = navigationPathFor(entry.page)
    if (!path) return []
    const matchingAliasLengths = entry.aliases
      .map((alias) => voiceAliasMatchLength(spoken, alias))
      .filter((length) => length > 0)
    const length = Math.max(0, ...matchingAliasLengths)
    return length > 0 ? [{ entry, length }] : []
  })
  const longest = Math.max(0, ...matches.map((match) => match.length))
  const precise = matches.filter((match) => match.length === longest).map((match) => match.entry)
  const unique = [...new Map(precise.map((match) => [`${match.page}:${match.tab ?? ''}`, match])).values()]
  if (unique.length !== 1) return navigationRefusal('unclear')
  const { page, tab } = unique[0]!
  const path = navigationPathFor(page)
  if (!path) return null
  if (!GUIDE_PAGES.some((guide) => guide.path === path && guide.roles.includes(actor.role))) return navigationRefusal('notPermitted')
  const message = lang === 'ar' ? '\u062a\u0645 \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0627\u0646\u062a\u0642\u0627\u0644.' : 'Navigation is ready.'
  return {
    intent: 'doAction',
    sentence: { en: 'Opening the requested page.', ar: '\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629.' },
    periodLabel: null,
    refusal: null,
    sharingOff: false,
    result: { kind: 'done', outcome: { ok: true, message: { en: message, ar: message }, messageKey: null, messageParams: null, path, uiEffect: { kind: 'navigate', page, ...(tab ? { tab } : {}) } } },
  }
}

/** The voice provider receives a short, already-authorized sentence only. */
function spokenText(answer: CopilotAnswer, lang: 'en' | 'ar'): string {
  // Voice is a short acknowledgement. The detailed result stays visible on
  // screen, where names and figures can be reviewed accurately.
  const short = (value: string) => (value.length > 140 ? `${value.slice(0, 137).trimEnd()}…` : value)
  if (answer.refusal) {
    if (answer.refusal === 'notPermitted') return lang === 'ar' ? 'لا تملك صلاحية لهذا الطلب.' : 'You do not have access to that request.'
    if (answer.refusal === 'noData') return lang === 'ar' ? 'لا توجد بيانات لعرضها.' : 'There is no data to show.'
    if (answer.refusal === 'unclear') {
      return lang === 'ar'
        ? '\u0645\u0627 \u0641\u0647\u0645\u062a \u0627\u0644\u0633\u0624\u0627\u0644 \u0645\u0646\u064a\u062d. \u0639\u064a\u062f \u0635\u064a\u0627\u063a\u062a\u0647 \u0628\u0634\u0643\u0644 \u0623\u0648\u0636\u062d \u0648\u0627\u0630\u0643\u0631 \u0634\u0648 \u0628\u062f\u0643 \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645.'
        : 'I did not understand the request clearly. Please rephrase it and say what you need from the system.'
    }
    return lang === 'ar'
      ? '\u0645\u0627 \u0642\u062f\u0631\u062a \u0623\u0631\u0628\u0637 \u0647\u0627\u0644\u0637\u0644\u0628 \u0628\u0634\u064a \u0645\u0648\u062c\u0648\u062f \u0628\u0627\u0644\u0646\u0638\u0627\u0645. \u0639\u064a\u062f \u0635\u064a\u0627\u063a\u062a\u0647 \u0628\u0634\u0643\u0644 \u0623\u0648\u0636\u062d \u0648\u0627\u0630\u0643\u0631 \u0627\u0644\u0635\u0641\u062d\u0629 \u0623\u0648 \u0627\u0644\u0645\u0647\u0645\u0629 \u0627\u0644\u0644\u064a \u0628\u062f\u0643 \u0625\u064a\u0627\u0647\u0627.'
      : 'I could not connect that request to a feature in this system. Please rephrase it and name the page or task you need.'
  }

  const result = answer.result
  if (result.kind === 'confirm') return lang === 'ar' ? 'راجِع الإجراء الظاهر على الشاشة، ثم استخدم التأكيد الصوتي.' : 'Review the action shown on screen, then use voice confirmation.'
  if (result.kind === 'choose') return lang === 'ar' ? 'اختر الإجراء الصحيح من الخيارات الظاهرة على الشاشة.' : 'Choose the correct action from the options on screen.'
  if (result.kind === 'done') {
    if (result.outcome.uiEffect?.kind === 'navigate') {
      /* The UI has already completed the validated route change before this
         trusted voice response is spoken. */
      return lang === 'ar' ? '\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629.' : 'The requested page is open.'
    }
    return short(local(result.outcome.message, lang))
  }
  if (result.kind === 'knowledge') {
    return lang === 'ar' ? '\u0639\u0631\u0636\u062a \u0627\u0644\u0625\u062c\u0627\u0628\u0629 \u0648\u0627\u0644\u0645\u0635\u0627\u062f\u0631 \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629.' : 'I displayed the answer and its sources on screen.'
  }

  const sentence = local(answer.sentence, lang)
  if (sentence) return short(sentence)
  if (result.kind === 'report' || result.kind === 'table' || result.kind === 'stats' || result.kind === 'people') {
    return lang === 'ar' ? '\u062c\u0627\u0647\u0632\u060c \u0639\u0631\u0636\u062a \u0627\u0644\u0646\u062a\u064a\u062c\u0629 \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629.' : 'Done. I displayed the result on screen.'
  }
  if (result.kind === 'guide') return lang === 'ar' ? '\u0639\u0631\u0636\u062a \u0627\u0644\u062e\u0637\u0648\u0627\u062a \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629.' : 'I displayed the steps on screen.'
  return lang === 'ar' ? '\u062a\u0645.' : 'Done.'
}

/**
 * Opening a page is reversible, carries no HR data and still goes through the
 * ordinary action route, which resolves the destination from the user's role.
 * A spoken "open …" is therefore enough to navigate immediately; every other
 * action remains a reviewed, explicit confirmation.
 */
async function runSpokenNavigation(answer: CopilotAnswer, session: VoiceSession, cookie: string, question: string) {
  if (answer.result.kind !== 'confirm' || answer.result.proposal.action !== 'openScreen') return answer

  const response = await callInternal({
    method: 'POST',
    path: '/copilot/do',
    cookie,
    headers: internalHeaders(session),
    body: { params: answer.result.proposal.params, question },
  })
  const completed = answerFrom(response.data)
  return response.ok && completed ? completed : answer
}

function confirmationFor(answer: CopilotAnswer, session: VoiceSession, question: string, lang: 'en' | 'ar'): VoiceConfirmationPublic[] | undefined {
  if (answer.result.kind === 'confirm') {
    clearChoice(session)
    return [rememberConfirmation(session, answer.result.proposal, question, lang)]
  }
  if (answer.result.kind === 'choose') {
    const confirmations = answer.result.choice.options.map((proposal) => rememberConfirmation(session, proposal, question, lang))
    rememberChoice(session, confirmations)
    return confirmations
  }
  return undefined
}

/** Audio provider status only; never includes credentials or HR data. */
voiceRoutes.get('/config', async (c) => {
  c.header('Cache-Control', 'no-store')
  if (env.VOICE_PROVIDER === 'openai') return c.json({ provider: 'openai', enabled: env.VOICE_ENABLED, ready: voiceReady() })
  const [local, ollamaReachable] = await Promise.all([localVoiceHealth(), localOllamaReachable()])
  return c.json({ provider: 'local', enabled: env.VOICE_ENABLED, ready: env.VOICE_ENABLED && local.stt.ready && local.tts.ready,
    local, ollamaReachable })
})

voiceRoutes.post('/local/session', connectLimit, async (c) => {
  if (env.VOICE_PROVIDER !== 'local' || !env.VOICE_ENABLED) return c.json({ error: 'localVoiceUnavailable' }, 503)
  const health = await localVoiceHealth()
  if (!health.stt.ready || !health.tts.ready) return c.json({ error: 'localVoiceUnavailable' }, 503)
  const actor = c.get('user'), session = createVoiceSession(actor)
  void auditCopilot(actor, { eventType: 'request', status: 'answered', reason: 'voice_session_started_local', channel: 'voice', voiceSessionId: session.id })
  return c.json({ sessionId: session.id, sessionExpiresAt: new Date(session.expiresAt).toISOString() })
})

function localError(error: unknown) {
  return error instanceof LocalVoiceError ? error.code : 'localVoiceUnavailable'
}
voiceRoutes.post('/local/session/:sessionId/stt', turnLimit,
  bodyLimit({ maxSize: MAX_LOCAL_AUDIO_BYTES, onError: c => c.json({ error: 'localVoiceInvalidAudio' }, 413) }), async (c) => {
    if (env.VOICE_PROVIDER !== 'local' || !env.VOICE_ENABLED) return c.json({ error: 'localVoiceUnavailable' }, 503)
    validSession(c)
    if (c.req.header('content-type')?.split(';')[0] !== 'audio/wav') return c.json({ error: 'localVoiceInvalidAudio' }, 415)
    const started = performance.now()
    try {
      const result = await transcribeLocalWav(new Uint8Array(await c.req.arrayBuffer()))
      c.header('Server-Timing', `stt;dur=${(performance.now() - started).toFixed(1)}`)
      return c.json(result)
    } catch (error) { const code = localError(error); return c.json({ error: code }, code === 'localVoiceInvalidAudio' || code === 'localVoiceNoSpeech' ? 422 : code === 'localVoiceBusy' ? 429 : 503) }
  })

const localTtsSchema = z.object({ text: z.string().trim().min(1).max(500), lang: z.enum(['ar', 'en']) })
voiceRoutes.post('/local/session/:sessionId/tts', turnLimit,
  bodyLimit({ maxSize: 8192, onError: c => c.json({ error: 'localVoiceUnavailable' }, 413) }), validateBody(localTtsSchema), async (c) => {
  if (env.VOICE_PROVIDER !== 'local' || !env.VOICE_ENABLED) return c.json({ error: 'localVoiceUnavailable' }, 503)
  validSession(c)
  const started = performance.now()
  try {
    const { text, lang } = c.get('body')
    const result = await synthesizeLocalSpeech(text, lang)
    c.header('Content-Type', 'audio/wav'); c.header('Cache-Control', 'no-store')
    c.header('Server-Timing', `tts;dur=${(performance.now() - started).toFixed(1)}`)
    return c.body(result.bytes)
  } catch (error) { const code = localError(error); return c.json({ error: code }, code === 'localVoiceBusy' ? 429 : 503) }
})

/** Test adapter: typed final transcripts, no microphone or cloud connection. */
voiceRoutes.post('/dev/mock-session', connectLimit, async (c) => {
  if (!devMockReady()) throw new HTTPException(404, { message: 'notFound' })
  const actor = c.get('user')
  const session = createVoiceSession(actor)
  void auditCopilot(actor, {
    eventType: 'request',
    status: 'answered',
    reason: 'voice_dev_mock_session_started',
    channel: 'voice',
    voiceSessionId: session.id,
  })
  return c.json({ sessionId: session.id, sessionExpiresAt: new Date(session.expiresAt).toISOString() })
})

/**
 * Starts the short-lived Realtime credential while the browser is asking for
 * the microphone.  A token contains no HR access and expires in a minute; the
 * actual transcript still comes back through this server with the signed-in
 * cookie.  Running these two independent waits together removes one network
 * round trip from the visible "connecting" state on the normal ephemeral
 * transport.
 */
voiceRoutes.post('/prepare', connectLimit, async (c) => {
  const startedAt = performance.now()
  if (!voiceReady()) return voiceUnavailable(c)
  if (env.VOICE_REALTIME_TRANSPORT !== 'ephemeral') {
    return c.json({ error: 'voicePreparationUnavailable', message: 'voicePreparationUnavailable' }, 409)
  }

  const actor = c.get('user')
  const session = createVoiceSession(actor)
  const safetyIdentifier = createHash('sha256').update(actor.id).digest('hex')
  try {
    const secret = await createRealtimeClientSecret(safetyIdentifier)
    void auditCopilot(actor, {
      eventType: 'request',
      status: 'answered',
      reason: 'voice_session_started_ephemeral',
      channel: 'voice',
      voiceSessionId: session.id,
    })
    setVoiceConnectTiming(c, startedAt, 'voice-prepare')
    return c.json({
      sessionId: session.id,
      clientSecret: secret.value,
      expiresAt: new Date(secret.expiresAt * 1000).toISOString(),
      sessionExpiresAt: new Date(session.expiresAt).toISOString(),
      model: env.OPENAI_REALTIME_MODEL,
    })
  } catch (error) {
    closeVoiceSession(session.id, actor)
    const code = error instanceof VoiceRealtimeError ? error.code : 'voiceConnectionFailed'
    setVoiceConnectTiming(c, startedAt, 'voice-prepare')
    return c.json({ error: code, message: code }, 502)
  }
})

voiceRoutes.post('/connect', connectLimit, async (c) => {
  const startedAt = performance.now()
  if (!voiceReady()) return voiceUnavailable(c)
  if (c.req.header('content-type')?.split(';')[0]?.trim() !== 'application/sdp') {
    return c.json({ error: 'voiceInvalidOffer', message: 'voiceInvalidOffer' }, 415)
  }

  const sdp = await c.req.text()
  if (!sdp.startsWith('v=0') || sdp.length > 100_000) {
    return c.json({ error: 'voiceInvalidOffer', message: 'voiceInvalidOffer' }, 422)
  }

  const actor = c.get('user')
  const session = createVoiceSession(actor)
  const safetyIdentifier = createHash('sha256').update(actor.id).digest('hex')
  const recordStart = (reason: 'voice_session_started' | 'voice_session_started_ephemeral' | 'voice_session_started_fallback') => {
    void auditCopilot(actor, {
      eventType: 'request',
      status: 'answered',
      reason,
      channel: 'voice',
      voiceSessionId: session.id,
    })
  }
  const issueClientSecret = async (reason: 'voice_session_started_ephemeral' | 'voice_session_started_fallback') => {
    const secret = await createRealtimeClientSecret(safetyIdentifier)
    recordStart(reason)
    // `value` is intentionally returned only to the signed-in requester, never logged.
    setVoiceConnectTiming(c, startedAt, 'voice-connect')
    return c.json({
      sessionId: session.id,
      clientSecret: secret.value,
      expiresAt: new Date(secret.expiresAt * 1000).toISOString(),
      sessionExpiresAt: new Date(session.expiresAt).toISOString(),
      model: env.OPENAI_REALTIME_MODEL,
    })
  }

  try {
    if (env.VOICE_REALTIME_TRANSPORT === 'ephemeral') {
      return await issueClientSecret('voice_session_started_ephemeral')
    }

    const answerSdp = await createRealtimeCall(sdp, safetyIdentifier)
    recordStart('voice_session_started')
    setVoiceConnectTiming(c, startedAt, 'voice-connect')
    return c.json({
      sessionId: session.id,
      sdp: answerSdp,
      expiresAt: new Date(session.expiresAt).toISOString(),
      sessionExpiresAt: new Date(session.expiresAt).toISOString(),
      model: env.OPENAI_REALTIME_MODEL,
    })
  } catch (error) {
    // A gateway timeout is a network path failure, not a permission decision.
    // Fall back to OpenAI's official short-lived browser token flow. The token
    // remains tool-free and has no HR-system capability.
    if (error instanceof VoiceRealtimeError && error.status !== undefined && error.status >= 500) {
      try {
        return await issueClientSecret('voice_session_started_fallback')
      } catch (fallbackError) {
        console.error('[voice] Realtime fallback failed:', String(fallbackError).slice(0, 160))
      }
    }
    closeVoiceSession(session.id, actor)
    const code = error instanceof VoiceRealtimeError ? error.code : 'voiceConnectionFailed'
    setVoiceConnectTiming(c, startedAt, 'voice-connect')
    return c.json({ error: code, message: code }, 502)
  }
})

voiceRoutes.post('/session/:sessionId/turn', turnLimit, validateBody(voiceTurnSchema), async (c) => {
  const startedAt = performance.now()
  const session = validSession(c)
  const body = c.get('body') as VoiceTurn
  const known = cachedTurn(session, body.turnId)
  if (known === 'processing') return c.json({ error: 'voiceTurnProcessing', message: 'voiceTurnProcessing' }, 409)
  if (known) {
    setVoiceTiming(c, startedAt)
    return c.json(known)
  }

  beginTurn(session, body.turnId)
  try {
    const actor = c.get('user')
    const ordinalChoice = resolveChoiceOrdinal(session, body.transcript)
    if (ordinalChoice) {
      const answer = answerFromChoice(ordinalChoice.proposal)
      const result: VoiceTurnResult = {
        answer,
        transcript: body.transcript,
        spokenText: spokenText(answer, body.lang),
        confirmations: [ordinalChoice.confirmation],
      }
      void auditCopilot(actor, {
        eventType: 'action',
        status: 'proposed',
        intent: 'doAction',
        tool: ordinalChoice.proposal.action,
        reason: 'voice_ordinal_choice',
        channel: 'voice',
        voiceSessionId: session.id,
      })
      completeTurn(session, body.turnId, result)
      setVoiceTiming(c, startedAt)
      return c.json(result)
    }
    const fastScroll = fastSpokenScroll(body.transcript, body.lang)
    if (fastScroll) {
      void auditCopilot(actor, {
        eventType: 'navigation',
        status: 'executed',
        intent: 'doAction',
        tool: 'scrollPage',
        reason: 'voice_fast_scroll',
        channel: 'voice',
        voiceSessionId: session.id,
      }).catch((error) => console.error('[voice] fast-scroll audit failed:', String(error).slice(0, 120)))
      const result: VoiceTurnResult = { answer: fastScroll, transcript: body.transcript, spokenText: spokenText(fastScroll, body.lang) }
      completeTurn(session, body.turnId, result)
      setVoiceTiming(c, startedAt)
      return c.json(result)
    }
    const fastNavigation = fastSpokenNavigation(body.transcript, actor, body.lang, body.context)
    if (fastNavigation) {
      /* Navigation has no data or write side effect.  Do not keep a spoken
         command waiting on its best-effort audit insert. */
      void auditCopilot(actor, {
        eventType: 'navigation',
        status: 'executed',
        intent: 'doAction',
        tool: 'openScreen',
        reason: 'voice_fast_navigation',
        channel: 'voice',
        voiceSessionId: session.id,
      }).catch((error) => console.error('[voice] fast-navigation audit failed:', String(error).slice(0, 120)))
      const result: VoiceTurnResult = { answer: fastNavigation, transcript: body.transcript, spokenText: spokenText(fastNavigation, body.lang) }
      completeTurn(session, body.turnId, result)
      setVoiceTiming(c, startedAt)
      return c.json(result)
    }
    const response = await callInternal({
      method: 'POST',
      path: '/copilot/ask',
      cookie: c.req.header('cookie') ?? '',
      headers: internalHeaders(session),
      body: {
        question: body.transcript,
        lang: body.lang,
        // It is contextual help only; access is still decided by Copilot/RBAC.
        ...(body.context?.currentPage ? { path: body.context.currentPage } : {}),
        ...(body.context ? { context: body.context } : {}),
      },
    })
    let answer = answerFrom(response.data)
    if (!response.ok || !answer) {
      releaseTurn(session, body.turnId)
      setVoiceTiming(c, startedAt, response.serverTiming)
      return c.json({ error: response.error ?? 'voiceCopilotFailed', message: 'voiceCopilotFailed' }, 502)
    }

    answer = await runSpokenNavigation(answer, session, c.req.header('cookie') ?? '', body.transcript)

    const confirmations = confirmationFor(answer, session, body.transcript, body.lang)
    const result: VoiceTurnResult = {
      answer,
      transcript: body.transcript,
      spokenText: spokenText(answer, body.lang),
      ...(confirmations ? { confirmations } : {}),
    }
    completeTurn(session, body.turnId, result)
    setVoiceTiming(c, startedAt, response.serverTiming)
    return c.json(result)
  } catch (error) {
    releaseTurn(session, body.turnId)
    console.error('[voice] Copilot turn failed:', String(error).slice(0, 160))
    setVoiceTiming(c, startedAt)
    return c.json({ error: 'voiceCopilotFailed', message: 'voiceCopilotFailed' }, 502)
  }
})

voiceRoutes.post('/session/:sessionId/review', validateBody(voiceReviewSchema), (c) => {
  const session = validSession(c)
  const confirmation = reviewConfirmation(session, c.get('body').confirmationId)
  if (!confirmation) return c.json({ error: 'voiceConfirmationNotFound', message: 'voiceConfirmationNotFound' }, 404)
  return c.json({ confirmation })
})

/** Cancelling a visible clarification makes later ordinal words inert. */
voiceRoutes.post('/session/:sessionId/choice/cancel', (c) => {
  clearChoice(validSession(c))
  return c.body(null, 204)
})

voiceRoutes.post('/session/:sessionId/confirm', turnLimit, validateBody(voiceConfirmSchema), async (c) => {
  const session = validSession(c)
  const body = c.get('body')
  const next = beginConfirmation(session, body.confirmationId, body.transcript)
  if (next.kind === 'missing') return c.json({ error: 'voiceConfirmationNotFound', message: 'voiceConfirmationNotFound' }, 404)
  if (next.kind === 'reviewRequired') {
    void auditCopilot(c.get('user'), {
      eventType: 'action',
      status: 'invalid',
      reason: 'voice_review_required',
      channel: 'voice',
      voiceSessionId: session.id,
    })
    return c.json({ error: 'voiceReviewRequired', message: 'voiceReviewRequired' }, 409)
  }
  if (next.kind === 'phraseRequired') {
    void auditCopilot(c.get('user'), {
      eventType: 'action',
      status: 'invalid',
      reason: 'voice_confirmation_required',
      channel: 'voice',
      voiceSessionId: session.id,
    })
    return c.json({ error: 'voiceConfirmationRequired', message: 'voiceConfirmationRequired', phrase: next.phrase }, 422)
  }
  if (next.kind === 'processing') return c.json({ error: 'voiceConfirmationProcessing', message: 'voiceConfirmationProcessing' }, 409)
  if (next.kind === 'completed') return c.json(next.result)

  try {
    const response = await callInternal({
      method: 'POST',
      path: '/copilot/do',
      cookie: c.req.header('cookie') ?? '',
      headers: internalHeaders(session),
      // The confirmation id is generated and bound to this signed-in voice
      // session. `/copilot/do` treats it only as an idempotency key, never as
      // evidence of permission or confirmation.
      body: { params: next.params, question: next.question, operationId: body.confirmationId },
    })
    const answer = answerFrom(response.data)
    if (!response.ok || !answer) {
      releaseConfirmation(session, body.confirmationId)
      return c.json({ error: response.error ?? 'voiceCopilotFailed', message: 'voiceCopilotFailed' }, 502)
    }
    const result: VoiceTurnResult = {
      answer,
      transcript: body.transcript,
      spokenText: spokenText(answer, next.lang),
    }
    completeConfirmation(session, body.confirmationId, result)
    return c.json(result)
  } catch (error) {
    releaseConfirmation(session, body.confirmationId)
    console.error('[voice] confirmation failed:', String(error).slice(0, 160))
    return c.json({ error: 'voiceCopilotFailed', message: 'voiceCopilotFailed' }, 502)
  }
})

voiceRoutes.post('/session/:sessionId/close', (c) => {
  const id = c.req.param('sessionId')
  if (idSchema.safeParse(id).success) closeVoiceSession(id, c.get('user'))
  return c.body(null, 204)
})
