import { aiInterviewAnswerRecoveryEnvelopeSchema, type AiInterviewAnswerRecoveryEnvelope, type AiInterviewAnswerResult, type CandidateAiInterviewUiState, type SubmitAiInterviewAnswer } from '@hr/shared'
import { CandidateInterviewClient, InterviewRequestError } from './client'

export const ANSWER_STORAGE_KEY = 'ai-interview:answer:v1'
export type AnswerView = {
  phase: 'EMPTY' | 'DRAFT' | 'SUBMITTING' | 'COMMITTED' | 'RECOVERY_REQUIRED';
  text: string; turnId: string | null; persisted: boolean;
  reason: 'checking' | 'retry' | 'review' | 'conflict' | 'closed' | 'storage' | 'expired' | null;
  canRetry: boolean; canReview: boolean; canDiscard: boolean;
}
const empty = (): AnswerView => ({ phase: 'EMPTY', text: '', turnId: null, persisted: false, reason: null, canRetry: false, canReview: false, canDiscard: false })
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** A tab-scoped local recovery copy. Only the authenticated server proves commit. */
export class AnswerRecovery {
  private record?: AiInterviewAnswerRecoveryEnvelope
  private state?: CandidateAiInterviewUiState
  private scope?: string
  private generation = 0
  private scopeExpiresAt = 0
  private storageReadBlocked = false
  private checking?: Promise<void>
  private outcome?: AiInterviewAnswerResult['outcome']
  private view: AnswerView = empty()
  private client: CandidateInterviewClient
  private changed: (view: AnswerView) => void
  private receive: (state: CandidateAiInterviewUiState) => void
  private denied: (error: unknown) => void
  private storage: () => Store
  private now: () => number
  constructor(client: CandidateInterviewClient, changed: (view: AnswerView) => void,
    receive: (state: CandidateAiInterviewUiState) => void, denied: (error: unknown) => void,
    storage: () => Store = () => window.sessionStorage, now: () => number = () => Date.now()) {
    this.client = client; this.changed = changed; this.receive = receive; this.denied = denied; this.storage = storage; this.now = now
  }
  getSnapshot = () => this.view
  private update(change: Partial<AnswerView>) { this.view = { ...this.view, ...change }; this.changed(this.view) }
  private remove() { try { this.storage().removeItem(ANSWER_STORAGE_KEY) } catch { /* Recheck scope/expiry before any future display. */ } }
  clear() { this.generation++; this.record = undefined; this.outcome = undefined; this.remove(); this.view = empty(); this.changed(this.view) }
  expire() { this.clear(); this.state = undefined; this.scope = undefined; this.scopeExpiresAt = 0 }
  detach() { this.generation++; this.state = undefined; this.scope = undefined; this.scopeExpiresAt = 0 }
  tick() {
    if ((this.record && this.record.expiresAt <= this.now()) || (this.scopeExpiresAt > 0 && this.scopeExpiresAt <= this.now())) {
      this.clear(); this.state = undefined; this.update({ reason: 'expired' })
    }
  }
  observe(state: CandidateAiInterviewUiState) {
    const recovery = state.answerRecovery
    if (!recovery) return // Older test doubles expose no recovery capability.
    const scope = `${state.interviewId}:${recovery.sessionVersion}`
    const deadline = this.now() + Math.max(0, recovery.expiresAt - state.serverNow)
    if (scope !== this.scope || this.storageReadBlocked) {
      const first = this.scope === undefined || this.storageReadBlocked
      this.generation++; this.record = undefined; this.outcome = undefined; this.view = empty(); this.scope = scope
      this.scopeExpiresAt = deadline
      if (!first) this.remove()
      let raw: string | null = null
      try {
        raw = this.storage().getItem(ANSWER_STORAGE_KEY)
        this.storageReadBlocked = false
      } catch { this.storageReadBlocked = true; this.update({ reason: 'storage' }) }
      if (!this.storageReadBlocked) try {
        const parsed = raw && raw.length <= 100000 ? aiInterviewAnswerRecoveryEnvelopeSchema.safeParse(JSON.parse(raw)) : null
        if (parsed?.success && `${parsed.data.interviewId}:${parsed.data.sessionVersion}` === scope && parsed.data.expiresAt > this.now()) this.record = parsed.data
        else if (raw) this.remove()
      } catch { this.remove() }
      if (this.record) this.update({ phase: this.record.submission ? 'RECOVERY_REQUIRED' : 'DRAFT', text: this.record.text,
        turnId: this.record.turnId, persisted: true, reason: this.record.submission ? 'checking' : null, canDiscard: !this.record.submission })
    }
    this.scopeExpiresAt = Math.min(this.scopeExpiresAt, deadline)
    this.state = state
    if (this.record) {
      this.record.expiresAt = Math.min(this.record.expiresAt, this.scopeExpiresAt)
      this.tick()
      if (this.record && !this.record.submission && !this.currentTurn()) this.update({ phase: 'RECOVERY_REQUIRED', reason: 'closed' })
    }
    this.changed(this.view)
  }
  private currentTurn() { return !!this.state && this.state.currentTurnId === this.record?.turnId && this.state.currentQuestion?.id === this.record?.questionId }
  private persist() {
    try {
      const bytes = JSON.stringify(this.record)
      this.storage().setItem(ANSWER_STORAGE_KEY, bytes)
      if (this.storage().getItem(ANSWER_STORAGE_KEY) !== bytes) throw Error('storage')
      this.update({ persisted: true }); return true
    } catch { this.update({ persisted: false, reason: 'storage' }); return false }
  }
  edit(text: string) {
    const state = this.state
    if (!state?.answerRecovery || state.status !== 'ACTIVE' || state.phase !== 'LISTENING' || !state.currentTurnId || !state.currentQuestion
      || this.storageReadBlocked || this.scopeExpiresAt <= this.now() || this.record?.submission || (this.record && !this.currentTurn())) return
    if (!text) { this.clear(); return }
    if (!this.record) this.record = { format: 'ai-interview-answer-v1', interviewId: state.interviewId, sessionVersion: state.answerRecovery.sessionVersion,
      questionId: state.currentQuestion.id, turnId: state.currentTurnId, text: '', expiresAt: Math.min(this.now() + 7200000, this.scopeExpiresAt) }
    this.record.text = text.slice(0,16000)
    this.update({ phase: 'DRAFT', text: this.record.text, turnId: this.record.turnId, reason: null, canRetry: false, canReview: false, canDiscard: true })
    this.persist()
  }
  private request(): SubmitAiInterviewAnswer {
    const r = this.record!
    return { interviewId: r.interviewId, sessionVersion: r.sessionVersion, questionId: r.questionId, turnId: r.turnId, text: r.text, ...r.submission! }
  }
  private accept(result: AiInterviewAnswerResult, body: SubmitAiInterviewAnswer, generation: number) {
    if (generation !== this.generation || this.record?.submission?.commandId !== body.commandId) return false
    if (result.submissionId !== body.commandId || result.turnId !== body.turnId || result.questionId !== body.questionId || result.state.interviewId !== body.interviewId
      || result.state.answerRecovery?.sessionVersion !== body.sessionVersion) throw Error('invalidAnswerAcknowledgement')
    this.receive(result.state)
    if (generation !== this.generation) return false
    this.outcome = result.outcome
    if (result.outcome === 'COMMITTED') {
      this.generation++ // Retire every older in-flight outcome before a new draft can be edited.
      this.remove(); this.record = undefined
      this.update({ phase: 'COMMITTED', text: '', turnId: body.turnId, persisted: false, reason: null, canRetry: false, canReview: false, canDiscard: false })
    } else {
      const active = this.state?.status === 'ACTIVE' && this.state.phase === 'LISTENING' && this.currentTurn()
      const sameVersion = this.state?.version === body.expectedVersion
      this.update({ phase: 'RECOVERY_REQUIRED', reason: result.outcome === 'OPEN' ? sameVersion && active ? 'retry' : 'review' : result.outcome === 'CONFLICT' ? 'conflict' : 'closed',
        canRetry: result.outcome === 'OPEN' && sameVersion && active, canReview: result.outcome === 'OPEN' && !sameVersion && active, canDiscard: true })
    }
    return true
  }
  private failure(error: unknown, generation: number) {
    if (generation !== this.generation) return
    if (error instanceof InterviewRequestError && [401,403].includes(error.status)) { this.expire(); this.denied(error); return }
    this.update({ phase: 'RECOVERY_REQUIRED', reason: 'checking', canRetry: false, canReview: false, canDiscard: false })
  }
  async reconcile() {
    if (this.checking) return this.checking
    if (!this.record?.submission || this.view.phase === 'SUBMITTING') return
    const body = this.request(), generation = this.generation
    const pending = (async () => {
      try { this.accept(await this.client.answer('status', body), body, generation) }
      catch (error) { this.failure(error, generation) }
    })().finally(() => { if (this.checking === pending) this.checking = undefined })
    this.checking = pending
    return pending
  }
  async submit() {
    const state = this.state
    this.tick()
    if (!this.record || this.record.submission || !state || this.scopeExpiresAt <= this.now() || state.status !== 'ACTIVE' || state.phase !== 'LISTENING' || !this.currentTurn() || !this.record.text.trim()) return false
    this.record.text = this.record.text.trim()
    this.record.submission = { commandId: crypto.randomUUID(), expectedVersion: state.version }
    if (!this.persist()) { this.record.submission = undefined; return false }
    return this.transmit()
  }
  private async transmit() {
    if (!this.record?.submission || this.view.phase === 'SUBMITTING') return false
    const body = this.request(), generation = ++this.generation
    this.update({ phase: 'SUBMITTING', text: body.text, canRetry: false, canReview: false, canDiscard: false, reason: null })
    try {
      const result = await this.client.answer('submit', body)
      return this.accept(result, body, generation) && result.outcome === 'COMMITTED'
    } catch (error) {
      this.failure(error, generation)
      if (generation === this.generation) await this.reconcile()
      return false
    }
  }
  async retry() {
    if (this.view.phase === 'SUBMITTING') return false
    await this.reconcile()
    if (this.view.phase === 'COMMITTED') return true
    return this.view.canRetry ? this.transmit() : false
  }
  async reviewAsDraft() {
    await this.reconcile()
    if (!this.record || !this.view.canReview || this.outcome !== 'OPEN') return
    this.generation++
    this.record.submission = undefined; this.outcome = undefined
    this.update({ phase: 'DRAFT', reason: null, canRetry: false, canReview: false, canDiscard: true })
    this.persist() // Explicitly reviewed new attempt; never rebase an uncertain request.
  }
  discard() { if (this.view.canDiscard) this.clear() }
}
