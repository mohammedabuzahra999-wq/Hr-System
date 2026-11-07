import {
  aiInterviewCommandSchema, aiInterviewEventSchema, aiInterviewSnapshotSchema,
  type AiInterviewAnswer, type AiInterviewCommand, type AiInterviewEffect, type AiInterviewEvent,
  type AiInterviewPlayback, type AiInterviewQuestion, type AiInterviewSelectedQuestion, type AiInterviewSnapshot,
} from '@hr/shared'
import { systemInterviewClock, type InterviewClock } from './clock.js'
import { verifyAnswerEvaluation, type AnswerEvaluator } from './evaluator.js'
import type { InterviewerDecision, InterviewerPolicy } from './interviewerPolicy.js'

export class InterviewDomainError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'InterviewDomainError' }
}
export interface InterviewCommandResult {
  duplicate: boolean
  snapshot: AiInterviewSnapshot
  events: AiInterviewEvent[]
  effects: AiInterviewEffect[]
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Synchronous domain boundary. No DB, environment, transport, HR tools or SDKs. */
export class InterviewEngine {
  private state: AiInterviewSnapshot | null = null
  private receipts = new Map<string, string>()
  private history: AiInterviewEvent[] = []
  private pendingEvents: AiInterviewEvent[] = []
  private pendingEffects: AiInterviewEffect[] = []
  private commandId = ''
  private at = 0

  constructor(private dependencies: { policy: InterviewerPolicy; evaluator: AnswerEvaluator; clock?: InterviewClock }) {}
  /** Hydration only; SQL, durable receipts and authorization stay in the service. */
  static restore(snapshot: AiInterviewSnapshot, dependencies: ConstructorParameters<typeof InterviewEngine>[0]) {
    const engine = new InterviewEngine(dependencies)
    engine.state = aiInterviewSnapshotSchema.parse(snapshot)
    return engine
  }
  get snapshot(): AiInterviewSnapshot {
    if (!this.state) throw new InterviewDomainError('INTERVIEW_NOT_CREATED')
    return structuredClone(this.state)
  }
  get events() { return structuredClone(this.history) }
  private get s(): AiInterviewSnapshot {
    if (!this.state) throw new InterviewDomainError('INTERVIEW_NOT_CREATED')
    return this.state
  }
  private require(condition: unknown, code = 'ILLEGAL_TRANSITION'): asserts condition {
    if (!condition) throw new InterviewDomainError(code)
  }

  dispatch(input: AiInterviewCommand): InterviewCommandResult {
    const command = aiInterviewCommandSchema.parse(input)
    const signature = canonical(command)
    const previous = this.receipts.get(command.commandId)
    if (previous) {
      this.require(previous === signature, 'COMMAND_ID_CONFLICT')
      return { duplicate: true, snapshot: this.snapshot, events: [], effects: [] }
    }
    const original = this.state
    this.state = original ? structuredClone(original) : null
    this.pendingEvents = []
    this.pendingEffects = []
    this.commandId = command.commandId
    this.at = (this.dependencies.clock ?? systemInterviewClock).now()
    this.require(Number.isSafeInteger(this.at) && this.at >= 0, 'INVALID_CLOCK')
    try {
      this.apply(command)
      this.s.version++
      this.state = aiInterviewSnapshotSchema.parse(this.s)
      this.history.push(...this.pendingEvents)
      this.receipts.set(command.commandId, signature)
      return structuredClone({ duplicate: false, snapshot: this.s, events: this.pendingEvents, effects: this.pendingEffects })
    } catch (error) {
      this.state = original
      throw error
    } finally {
      this.pendingEvents = []
      this.pendingEffects = []
    }
  }

  private emit(type: AiInterviewEvent['type'], payload: Record<string, unknown> = {}) {
    const seq = ++this.s.eventSeq
    this.pendingEvents.push(aiInterviewEventSchema.parse({ ...payload, type, seq, eventId: `event:${seq}`,
      interviewId: this.s.interviewId, commandId: this.commandId, at: this.at }))
  }
  private base(): AiInterviewQuestion {
    const base = this.s.plan.questions.find(q => q.id === this.s.currentQuestion?.baseQuestionId)
    this.require(base, 'QUESTION_NOT_SELECTED')
    return base
  }
  private requestPlayback(kind: AiInterviewPlayback['kind'], text: string, questionId: string | null) {
    const playback: AiInterviewPlayback = { id: `playback:${this.s.eventSeq + 1}`, kind, text, questionId, started: false, interrupted: false }
    this.s.playback = playback
    this.emit('PLAYBACK_REQUESTED', { playback })
    this.pendingEffects.push({ type: 'PLAY', playback: structuredClone(playback) })
  }
  private select(question: AiInterviewSelectedQuestion) {
    this.s.currentQuestion = question
    this.s.timer = null
    this.s.draft = null
    this.s.phase = question.kind === 'BASE' ? 'NEXT_QUESTION' : question.kind
    this.emit(question.kind === 'BASE' ? 'NEXT_QUESTION_SELECTED' : question.kind === 'FOLLOW_UP' ? 'FOLLOW_UP_SELECTED' : 'CLARIFICATION_SELECTED', { question })
    this.emit('QUESTION_SELECTED', { question })
    this.requestPlayback('QUESTION', question.prompt, question.id)
  }
  private nextBase() {
    const expected = [...this.s.plan.questions].sort((a, b) => a.order - b.order).find(q => !this.s.processedBaseQuestionIds.includes(q.id))
    const selected = this.dependencies.policy.chooseNextBase(structuredClone({ plan: this.s.plan, processedBaseQuestionIds: this.s.processedBaseQuestionIds }))
    this.require(selected === (expected?.id ?? null), 'POLICY_CANNOT_SKIP_BASE_QUESTION')
    if (!expected) {
      this.s.phase = 'CLOSING'
      this.s.currentQuestion = null
      this.emit('CLOSING_STARTED')
      this.requestPlayback('CLOSING', this.s.plan.closing, null)
      return
    }
    this.select({ id: expected.id, baseQuestionId: expected.id, criterionKey: expected.criterionKey,
      kind: 'BASE', prompt: expected.prompt, timeLimitSec: expected.answerTimeLimitSec })
  }
  private beginListening(interrupted = false) {
    const q = this.s.currentQuestion
    this.require(q, 'QUESTION_NOT_SELECTED')
    const base = this.base()
    this.s.phase = 'LISTENING'
    this.s.timer = {
      listeningStartedAt: this.at, answerDeadlineAt: this.at + q.timeLimitSec * 1000, timeLimitSec: q.timeLimitSec,
      warningAtSec: Math.min(base.warningAtSec, q.timeLimitSec), gracePeriodSec: base.gracePeriodSec,
      stage: 'ANSWER', graceDeadlineAt: null, warningEmitted: false, pausedRemainingMs: null,
    }
    this.s.draft = { turnId: `turn:${this.s.answers.length + 1}`, speaking: interrupted, speechStarted: interrupted,
      speechFinished: false, finalForCurrentSpeech: false, latestTextSource: 'none', partialText: '', finalText: '', transcriptionUncertain: false,
      lastActivityAt: this.at, questionDelivery: interrupted ? 'interrupted' : 'complete' }
    // A clamped warning may be due immediately (e.g. a 30s clarification).
    // Persist it with listening, before returning the version used by clients.
    const warningDue = this.s.timer.warningAtSec > 0 && this.s.timer.warningAtSec === q.timeLimitSec
    this.s.timer.warningEmitted = warningDue
    this.emit('ANSWER_LISTENING_STARTED', { questionId: q.id, turnId: this.s.draft.turnId,
      timer: this.s.timer, questionDelivery: this.s.draft.questionDelivery })
    if (warningDue) this.emit('ANSWER_WARNING', { turnId: this.s.draft.turnId, remainingMs: q.timeLimitSec * 1000 })
    if (interrupted) this.emit('CANDIDATE_SPEECH_STARTED', { turnId: this.s.draft.turnId })
  }
  private finalize(endReason: AiInterviewAnswer['endReason'], timedOut: boolean) {
    const draft = this.s.draft, q = this.s.currentQuestion
    this.require(draft && q, 'ANSWER_NOT_LISTENING')
    const source = draft.latestTextSource
    const answer: AiInterviewAnswer = { questionId: q.id, baseQuestionId: q.baseQuestionId, criterionKey: q.criterionKey,
      turnId: draft.turnId, text: source === 'final' ? draft.finalText : source === 'partial' ? draft.partialText : '', textSource: source, endReason, timedOut,
      transcriptionUncertain: draft.transcriptionUncertain || source === 'partial', questionDelivery: draft.questionDelivery,
      finalizedAt: this.at }
    this.s.answers.push(answer)
    this.s.draft = null
    this.s.timer = null
    this.s.phase = 'PROCESSING'
    this.emit('CANDIDATE_ANSWER_FINALIZED', { answer })
  }
  private enterGrace() {
    const timer = this.s.timer, draft = this.s.draft
    this.require(timer && draft)
    timer.stage = 'GRACE'
    timer.graceDeadlineAt = timer.answerDeadlineAt + timer.gracePeriodSec * 1000
    this.emit('ANSWER_GRACE_STARTED', { turnId: draft.turnId, graceDeadlineAt: timer.graceDeadlineAt })
  }
  /** Late media cannot grant grace retroactively or freeze an already expired timer. */
  private guardAnswerTime() {
    const timer = this.s.timer, draft = this.s.draft
    this.require(timer && draft, 'ANSWER_NOT_LISTENING')
    if (timer.stage === 'ANSWER' && this.at >= timer.answerDeadlineAt) {
      this.require(draft.speaking && this.at < timer.answerDeadlineAt + timer.gracePeriodSec * 1000, 'ANSWER_DEADLINE_PASSED_TICK_REQUIRED')
      this.enterGrace()
    }
    if (timer.stage === 'GRACE') this.require(this.at < timer.graceDeadlineAt!, 'ANSWER_DEADLINE_PASSED_TICK_REQUIRED')
  }
  private tick() {
    if (this.s.status !== 'ACTIVE' || this.s.phase !== 'LISTENING') return
    const timer = this.s.timer!, draft = this.s.draft!, base = this.base()
    if (!timer.warningEmitted && timer.warningAtSec > 0 && this.at >= timer.answerDeadlineAt - timer.warningAtSec * 1000) {
      timer.warningEmitted = true
      this.emit('ANSWER_WARNING', { turnId: draft.turnId, remainingMs: Math.max(0, timer.answerDeadlineAt - this.at) })
    }
    if (timer.stage === 'ANSWER' && this.at >= timer.answerDeadlineAt) {
      if (draft.speaking) this.enterGrace()
      else {
        this.emit('ANSWER_TIMEOUT', { turnId: draft.turnId })
        this.finalize(draft.finalText || draft.partialText ? 'TIME_LIMIT' : 'SILENCE', true)
        return
      }
    }
    if (timer.stage === 'GRACE' && this.at >= timer.graceDeadlineAt!) {
      this.finalize('TIME_LIMIT', true)
      return
    }
    if (!draft.speaking && !draft.finalText && !draft.partialText && base.silenceThresholdSec > 0
      && this.at >= draft.lastActivityAt + base.silenceThresholdSec * 1000) {
      this.emit('ANSWER_SILENCE_DETECTED', { turnId: draft.turnId })
      this.finalize('SILENCE', false)
    }
  }
  private freeze() {
    if (this.s.pausedAt !== null) return
    if (this.s.phase === 'LISTENING') {
      this.guardAnswerTime()
      const timer = this.s.timer!
      timer.pausedRemainingMs = (timer.stage === 'GRACE' ? timer.graceDeadlineAt! : timer.answerDeadlineAt) - this.at
      this.s.draft!.speaking = false
    }
    if (this.s.playback) this.pendingEffects.push({ type: 'STOP_PLAYBACK', playbackId: this.s.playback.id })
    this.s.pausedAt = this.at
    this.s.resumeStatus = this.s.status === 'CREATED' ? 'CREATED' : this.s.status === 'READY' ? 'READY' : 'ACTIVE'
  }
  private resume() {
    this.require(this.s.status === 'PAUSED' || (this.s.status === 'FAILED' && this.s.failure?.recoverable))
    const status = this.s.resumeStatus
    this.require(status && this.s.pausedAt !== null)
    if (this.s.timer) {
      const remaining = this.s.timer.pausedRemainingMs!
      if (this.s.timer.stage === 'ANSWER') this.s.timer.answerDeadlineAt = this.at + remaining
      else {
        this.s.timer.answerDeadlineAt = this.at
        this.s.timer.graceDeadlineAt = this.at + remaining
      }
      this.s.timer.pausedRemainingMs = null
      this.s.draft!.lastActivityAt += this.at - this.s.pausedAt
    }
    this.s.status = status
    this.s.pausedAt = null
    this.s.resumeStatus = null
    this.s.failure = null
    this.emit('INTERVIEW_RESUMED', { status, timer: this.s.timer })
    // An interrupted delivery is replayed with a NEW id; stale finish events cannot start a timer.
    if (this.s.playback) {
      const previous = this.s.playback
      this.s.phase = previous.kind === 'QUESTION'
        ? this.s.currentQuestion!.kind === 'BASE' ? 'NEXT_QUESTION' : this.s.currentQuestion!.kind
        : previous.kind
      this.requestPlayback(previous.kind, previous.text, previous.questionId)
    }
  }
  private processAnswer() {
    this.require(this.s.phase === 'PROCESSING')
    const answer = this.s.answers.at(-1)!
    const base = this.base()
    const evaluation = verifyAnswerEvaluation(this.dependencies.evaluator.evaluate(structuredClone(answer)), answer)
    this.s.evaluations.push(evaluation)
    this.emit('ANSWER_EVALUATED', { evaluation })
    const decision: InterviewerDecision = this.dependencies.policy.afterAnswer(structuredClone({ state: this.s, baseQuestion: base, answer }))
    this.require(['NEXT_QUESTION', 'FOLLOW_UP', 'CLARIFICATION'].includes(decision.type), 'INVALID_POLICY_DECISION')
    if (decision.type !== 'NEXT_QUESTION') {
      const isFollowUp = decision.type === 'FOLLOW_UP'
      const field = isFollowUp ? 'followUps' : 'clarifications'
      const count = this.s.counts[base.id]!
      const maximum = isFollowUp ? base.maxFollowUps : base.maxClarifications
      const prompt = base[field].find(p => p.id === decision.promptId)
      const usedKey = `${base.id}:${field}:${decision.promptId}`
      if (count[field] < maximum && prompt && !this.s.usedPromptIds.includes(usedKey)) {
        count[field]++
        this.s.usedPromptIds.push(usedKey)
        this.select({ id: `${base.id}:${field}:${count[field]}`, baseQuestionId: base.id, criterionKey: base.criterionKey,
          kind: decision.type, prompt: prompt.prompt, timeLimitSec: isFollowUp ? base.followUpTimeLimitSec : base.clarificationTimeLimitSec })
        return
      }
      this.emit('POLICY_LIMIT_ENFORCED', { decision: decision.type, baseQuestionId: base.id })
    }
    this.s.processedBaseQuestionIds.push(base.id)
    this.nextBase()
  }

  private apply(command: AiInterviewCommand) {
    if (command.type === 'CREATE_INTERVIEW') {
      this.require(!this.state, 'INTERVIEW_ALREADY_CREATED')
      this.state = { interviewId: command.interviewId, version: 0, eventSeq: 0, status: 'CREATED', phase: null, plan: command.plan,
        currentQuestion: null, processedBaseQuestionIds: [], counts: Object.fromEntries(command.plan.questions.map(q => [q.id, { followUps: 0, clarifications: 0 }])),
        usedPromptIds: [], playback: null, timer: null, draft: null, answers: [], evaluations: [], evaluationStatus: 'NOT_STARTED',
        pausedAt: null, resumeStatus: null, failure: null }
      this.emit('INTERVIEW_CREATED', { plan: command.plan })
      return
    }
    if (command.type === 'GENERATE_EVALUATION') {
      this.require(this.s.status === 'COMPLETED' && this.s.evaluationStatus === 'PENDING')
      this.s.evaluationStatus = 'COMPLETED'
      this.emit('EVALUATION_COMPLETED', { evaluations: this.s.evaluations })
      return
    }
    this.require(!['COMPLETED', 'CANCELLED'].includes(this.s.status) && !(this.s.status === 'FAILED' && !this.s.failure?.recoverable), 'INTERVIEW_TERMINAL')
    switch (command.type) {
      case 'REVISE_QUESTION_TEXT': {
        this.require(this.s.status==='CREATED','QUESTION_PLAN_ALREADY_FROZEN')
        const proposed=command.proposal.questions
        this.require(proposed.length===this.s.plan.questions.length&&new Set(proposed.map(q=>q.questionId)).size===proposed.length,'INVALID_QUESTION_PROPOSAL')
        for(const q of this.s.plan.questions){const p=proposed.find(p=>p.questionId===q.id);this.require(p,'INVALID_QUESTION_PROPOSAL')
          for(const key of ['followUps','clarifications'] as const)this.require(p[key].length===q[key].length&&new Set(p[key].map(v=>v.id)).size===p[key].length&&p[key].every(v=>q[key].some(old=>old.id===v.id)),'INVALID_QUESTION_PROPOSAL')
          q.prompt=p.prompt;q.followUps=structuredClone(p.followUps);q.clarifications=structuredClone(p.clarifications)
        }
        this.s.plan.version++;this.emit('QUESTION_TEXT_REVISED',{questionIds:proposed.map(q=>q.questionId)});return
      }
      case 'MARK_READY':
        this.require(this.s.status === 'CREATED')
        this.s.status = 'READY'
        this.emit('INTERVIEW_READY')
        return
      case 'START_INTERVIEW':
        this.require(this.s.status === 'READY')
        this.s.status = 'ACTIVE'
        this.s.phase = 'INTRO'
        this.emit('INTERVIEW_STARTED')
        this.emit('INTRO_STARTED')
        this.requestPlayback('INTRO', this.s.plan.introduction, null)
        return
      case 'PAUSE_INTERVIEW':
        this.require(this.s.status === 'ACTIVE')
        this.freeze()
        this.s.status = 'PAUSED'
        this.emit('INTERVIEW_PAUSED', { reason: command.reason, remainingMs: this.s.timer?.pausedRemainingMs ?? null })
        return
      case 'RESUME_INTERVIEW': this.resume(); return
      case 'FAIL_INTERVIEW':
        this.require(this.s.status !== 'FAILED')
        this.freeze()
        this.s.status = 'FAILED'
        this.s.failure = { code: command.code, recoverable: command.recoverable }
        this.emit('INTERVIEW_FAILED', this.s.failure)
        return
      case 'CANCEL_INTERVIEW':
        if (this.s.playback) this.pendingEffects.push({ type: 'STOP_PLAYBACK', playbackId: this.s.playback.id })
        this.s.status = 'CANCELLED'
        this.s.timer = null
        this.s.draft = null
        this.s.playback = null
        this.emit('INTERVIEW_CANCELLED')
        return
    }
    this.require(this.s.status === 'ACTIVE')
    switch (command.type) {
      case 'TIMER_TICK': this.tick(); return
      case 'PROCESS_ANSWER': this.processAnswer(); return
      case 'AI_PLAYBACK_STARTED':
      case 'AI_PLAYBACK_FINISHED': {
        const playback = this.s.playback
        this.require(playback && playback.id === command.playbackId, 'STALE_PLAYBACK')
        if (command.type === 'AI_PLAYBACK_STARTED') {
          this.require(!playback.started)
          playback.started = true
          this.s.phase = 'AI_SPEAKING'
          this.emit('QUESTION_PLAYBACK_STARTED', { playbackId: playback.id, questionId: playback.questionId, kind: playback.kind })
        } else {
          this.require(playback.started && this.s.phase === 'AI_SPEAKING')
          this.emit('QUESTION_PLAYBACK_FINISHED', { playbackId: playback.id, questionId: playback.questionId, kind: playback.kind })
          this.s.playback = null
          if (playback.kind === 'INTRO') this.nextBase()
          else if (playback.kind === 'QUESTION') this.beginListening()
          else {
            this.require(this.s.processedBaseQuestionIds.length === this.s.plan.questions.length)
            this.s.status = 'COMPLETED'
            this.s.phase = 'CLOSING'
            this.s.evaluationStatus = 'PENDING'
            this.emit('INTERVIEW_COMPLETED')
            this.emit('EVALUATION_PENDING')
          }
        }
        return
      }
      case 'CANDIDATE_INTERRUPTED': {
        const playback = this.s.playback
        this.require(this.s.phase === 'AI_SPEAKING' && playback?.kind === 'QUESTION' && playback.id === command.playbackId, 'INTERRUPTION_NOT_ALLOWED')
        this.require(this.base().allowBargeIn, 'INTERRUPTION_NOT_ALLOWED')
        this.emit('PLAYBACK_INTERRUPTED', { playbackId: playback.id, questionId: playback.questionId })
        this.pendingEffects.push({ type: 'STOP_PLAYBACK', playbackId: playback.id })
        this.s.playback = null
        this.beginListening(true)
        return
      }
      case 'CANDIDATE_SPEECH_STARTED':
      case 'CANDIDATE_SPEECH_FINISHED':
      case 'CANDIDATE_TRANSCRIPT_PARTIAL':
      case 'CANDIDATE_TRANSCRIPT_FINAL': {
        this.require(this.s.phase === 'LISTENING' && this.s.draft?.turnId === command.turnId, 'STALE_OR_CLOSED_TURN')
        this.guardAnswerTime()
        const draft = this.s.draft!
        draft.lastActivityAt = this.at
        if (command.type === 'CANDIDATE_SPEECH_STARTED') {
          this.require(!draft.speaking)
          draft.speaking = true
          draft.speechStarted = true
          draft.speechFinished = false
          draft.finalForCurrentSpeech = false
          this.emit('CANDIDATE_SPEECH_STARTED', { turnId: draft.turnId })
        } else if (command.type === 'CANDIDATE_SPEECH_FINISHED') {
          this.require(draft.speaking)
          draft.speaking = false
          draft.speechFinished = true
          this.emit('CANDIDATE_SPEECH_FINISHED', { turnId: draft.turnId })
          if (draft.finalForCurrentSpeech) this.finalize('SUBMITTED', false)
        } else {
          this.require(draft.speechStarted, 'SPEECH_NOT_STARTED')
          if (command.type === 'CANDIDATE_TRANSCRIPT_PARTIAL') {
            draft.partialText = command.text
            draft.latestTextSource = command.text ? 'partial' : draft.finalText ? 'final' : 'none'
          }
          else {
            draft.finalText = command.text
            draft.latestTextSource = 'final'
            draft.finalForCurrentSpeech = true
            draft.transcriptionUncertain = command.uncertain
            this.emit('TRANSCRIPT_FINAL_RECEIVED', { turnId: draft.turnId })
            if (draft.speechFinished) this.finalize('SUBMITTED', false)
          }
        }
        return
      }
    }
  }
}
