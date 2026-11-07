import { randomUUID } from 'node:crypto'
import type { ActionProposal, CopilotAnswer, SessionUser } from '@hr/shared'

/**
 * Ephemeral state for a live voice call.
 *
 * Audio is never received or retained by this server. A session holds only the
 * narrow state needed to deduplicate final transcripts and to bind a spoken
 * confirmation to the exact server-created action card. Restarting the server
 * safely ends these calls; it can never execute a pending action afterwards.
 */
const SESSION_TTL_MS = 20 * 60 * 1000
const CONFIRMATION_TTL_MS = 5 * 60 * 1000

export type VoiceConfirmationPublic = {
  id: string
  action: ActionProposal['action']
  destructive: boolean
  phrase: string
}

type VoiceConfirmation = VoiceConfirmationPublic & {
  /** The original server-created proposal; never supplied by an ordinal utterance. */
  proposal: ActionProposal
  lang: 'en' | 'ar'
  params: ActionProposal['params']
  question: string
  reviewed: boolean
  state: 'pending' | 'executing' | 'completed'
  createdAt: number
  completed: VoiceTurnResult | null
}

export type VoiceTurnResult = {
  answer: CopilotAnswer
  transcript: string
  spokenText: string
  confirmations?: VoiceConfirmationPublic[]
}

type CachedTurn =
  | { state: 'processing'; at: number }
  | { state: 'completed'; at: number; result: VoiceTurnResult }

type VoiceChoice = {
  confirmationIds: readonly string[]
  createdAt: number
}

export interface VoiceSession {
  id: string
  userId: string
  createdAt: number
  expiresAt: number
  turns: Map<string, CachedTurn>
  confirmations: Map<string, VoiceConfirmation>
  /** The only clarification whose ordinal words may be interpreted. */
  choice: VoiceChoice | null
}

const live = new Map<string, VoiceSession>()

function sweep() {
  const now = Date.now()
  for (const [id, session] of live) {
    if (session.expiresAt <= now) {
      live.delete(id)
      continue
    }
    for (const [turnId, turn] of session.turns) {
      if (now - turn.at > CONFIRMATION_TTL_MS) session.turns.delete(turnId)
    }
    for (const [id, confirmation] of session.confirmations) {
      if (confirmation.createdAt + CONFIRMATION_TTL_MS <= now) session.confirmations.delete(id)
    }
    if (session.choice && session.choice.confirmationIds.some((id) => !session.confirmations.has(id))) session.choice = null
  }
}

export function createVoiceSession(actor: SessionUser): VoiceSession {
  sweep()
  const now = Date.now()
  const session: VoiceSession = {
    id: randomUUID(),
    userId: actor.id,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    turns: new Map(),
    confirmations: new Map(),
    choice: null,
  }
  live.set(session.id, session)
  return session
}

/** The caller must own the session; ids alone never authorize a voice call. */
export function sessionFor(id: string, actor: SessionUser): VoiceSession | null {
  sweep()
  const session = live.get(id)
  return session?.userId === actor.id ? session : null
}

export function closeVoiceSession(id: string, actor: SessionUser): void {
  const session = live.get(id)
  if (session?.userId === actor.id) live.delete(id)
}

export function cachedTurn(session: VoiceSession, turnId: string): VoiceTurnResult | 'processing' | null {
  const found = session.turns.get(turnId)
  if (!found) return null
  return found.state === 'completed' ? found.result : 'processing'
}

export function beginTurn(session: VoiceSession, turnId: string): void {
  session.turns.set(turnId, { state: 'processing', at: Date.now() })
}

export function completeTurn(session: VoiceSession, turnId: string, result: VoiceTurnResult): void {
  session.turns.set(turnId, { state: 'completed', at: Date.now(), result })
}

export function releaseTurn(session: VoiceSession, turnId: string): void {
  const found = session.turns.get(turnId)
  if (found?.state === 'processing') session.turns.delete(turnId)
}

function phraseFor(lang: 'ar' | 'en') {
  return lang === 'ar' ? 'أؤكد تنفيذ الإجراء' : 'I confirm this action'
}

export function rememberConfirmation(
  session: VoiceSession,
  proposal: ActionProposal,
  question: string,
  lang: 'ar' | 'en',
): VoiceConfirmationPublic {
  const confirmation: VoiceConfirmation = {
    id: randomUUID(),
    action: proposal.action,
    destructive: proposal.destructive,
    phrase: phraseFor(lang),
    proposal,
    lang,
    params: proposal.params,
    question,
    reviewed: false,
    state: 'pending',
    createdAt: Date.now(),
    completed: null,
  }
  session.confirmations.set(confirmation.id, confirmation)
  return publicConfirmation(confirmation)
}

function publicConfirmation(value: VoiceConfirmation): VoiceConfirmationPublic {
  return { id: value.id, action: value.action, destructive: value.destructive, phrase: value.phrase }
}

/** A new clarification replaces the prior one; stale ordinal words mean nothing. */
export function rememberChoice(session: VoiceSession, confirmations: readonly VoiceConfirmationPublic[]): void {
  session.choice = confirmations.length ? { confirmationIds: confirmations.map((confirmation) => confirmation.id), createdAt: Date.now() } : null
}

export function clearChoice(session: VoiceSession): void {
  session.choice = null
}

export type OrdinalChoice = { confirmation: VoiceConfirmationPublic; proposal: ActionProposal }

/**
 * An ordinal is only recognised while an explicit choice card is still active.
 * It selects a server-created proposal; it never reconstructs an action from
 * speech and it still requires review plus the fixed confirmation phrase.
 */
export function resolveChoiceOrdinal(session: VoiceSession, transcript: string): OrdinalChoice | null {
  const choice = session.choice
  if (!choice || choice.createdAt + CONFIRMATION_TTL_MS <= Date.now()) {
    session.choice = null
    return null
  }

  const ordinal = ordinalFromTranscript(transcript)
  if (ordinal === null || ordinal >= choice.confirmationIds.length) return null
  const confirmation = session.confirmations.get(choice.confirmationIds[ordinal] ?? '')
  if (!confirmation || confirmation.state !== 'pending') {
    session.choice = null
    return null
  }

  session.choice = null
  return { confirmation: publicConfirmation(confirmation), proposal: confirmation.proposal }
}

export function reviewConfirmation(session: VoiceSession, confirmationId: string): VoiceConfirmationPublic | null {
  const confirmation = session.confirmations.get(confirmationId)
  if (!confirmation || confirmation.state !== 'pending') return null
  confirmation.reviewed = true
  return publicConfirmation(confirmation)
}

export type BeginConfirmation =
  | { kind: 'missing' }
  | { kind: 'reviewRequired' }
  | { kind: 'phraseRequired'; phrase: string }
  | { kind: 'processing' }
  | { kind: 'completed'; result: VoiceTurnResult }
  | { kind: 'run'; params: ActionProposal['params']; question: string; lang: 'en' | 'ar' }

/** Only a reviewed action and an exact final transcript may reach /copilot/do. */
export function beginConfirmation(
  session: VoiceSession,
  confirmationId: string,
  transcript: string,
): BeginConfirmation {
  const confirmation = session.confirmations.get(confirmationId)
  if (!confirmation) return { kind: 'missing' }
  if (confirmation.state === 'completed' && confirmation.completed) return { kind: 'completed', result: confirmation.completed }
  if (confirmation.state === 'executing') return { kind: 'processing' }
  if (!confirmation.reviewed) return { kind: 'reviewRequired' }
  if (normaliseConfirmation(transcript) !== normaliseConfirmation(confirmation.phrase)) {
    return { kind: 'phraseRequired', phrase: confirmation.phrase }
  }
  confirmation.state = 'executing'
  return { kind: 'run', params: confirmation.params, question: confirmation.question, lang: confirmation.lang }
}

export function completeConfirmation(session: VoiceSession, confirmationId: string, result: VoiceTurnResult): void {
  const confirmation = session.confirmations.get(confirmationId)
  if (!confirmation) return
  confirmation.state = 'completed'
  confirmation.completed = result
}

export function releaseConfirmation(session: VoiceSession, confirmationId: string): void {
  const confirmation = session.confirmations.get(confirmationId)
  if (confirmation?.state === 'executing') confirmation.state = 'pending'
}

function ordinalFromTranscript(transcript: string): number | null {
  const words = normaliseConfirmation(transcript).split(' ').filter(Boolean)
  if (!words.length) return null
  const ordinalWords: Record<string, number> = {
    first: 0,
    '1st': 0,
    اول: 0,
    الاول: 0,
    اولي: 0,
    الاولي: 0,
    second: 1,
    '2nd': 1,
    ثاني: 1,
    الثاني: 1,
    ثانيه: 1,
    الثانيه: 1,
    third: 2,
    '3rd': 2,
    ثالث: 2,
    الثالث: 2,
    ثالثه: 2,
    الثالثه: 2,
  }
  if (words.length === 1) return ordinalWords[words[0]!] ?? null

  const hasSelectionCue = words.some((word) => ['choose', 'option', 'number', 'select', 'اختر', 'الخيار', 'رقم'].includes(word))
  if (!hasSelectionCue) return null
  const matched = words.map((word) => ordinalWords[word]).filter((value): value is number => value !== undefined)
  return matched.length === 1 ? matched[0]! : null
}

/** Case/diacritic folding is only for the fixed server phrase, never for an action. */
function normaliseConfirmation(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
