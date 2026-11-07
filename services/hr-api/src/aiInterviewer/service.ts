import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { aiInterviewCommandSchema, aiInterviewEventSchema, aiInterviewFrozenInputsSchema, candidateAiInterviewRequestSchema,
  candidateAiInterviewUiStateSchema, createAiInterviewSchema, deriveCriteria, jobDescriptionContentSchema, scorecardSchema,
  submitAiInterviewAnswerSchema, type SubmitAiInterviewAnswer, type AiInterviewAnswerResult,
  type AiInterviewCommand, type AiInterviewEvent, type AiInterviewFrozenInputs, type AiInterviewSnapshot } from '@hr/shared'
import { aiInterviews, aiInterviewEvents, aiInterviewEvaluations, applications, jobDescriptions } from '../db/schema.js'
import { InterviewDomainError, InterviewEngine, type InterviewCommandResult } from './engine.js'
import { MockEvaluator } from './evaluator.js'
import { MockInterviewerPolicy,type InterviewerPolicy } from './interviewerPolicy.js'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { interviewModelDecisionSchema,interviewQuestionProposalSchema } from '@hr/shared'
import { llmJobSchema,llmInputSchema,proposalForPlan,validateQuestionProposal,type LlmJob,type InterviewLlmInput } from './llmContracts.js'
import { systemInterviewClock, type InterviewClock } from './clock.js'
import { InterviewRepository, InterviewServiceError, type InterviewRow, type InterviewTransaction } from './repository.js'
import { authorizeInterview, isCredential, newCredential, requireInterviewStaff, tokenHash, type InterviewPrincipal } from './authorization.js'
import { interviewAudit } from './audit.js'
import { canonicalJson, evaluationInputHash, persistedAnswers, verifyPersistedEvidence } from './evaluationInput.js'
import { recoverInterview } from './recovery.js'
import { mockObservationCommand } from './mockRuntime.js'
import { AUDIO_CONSENT, deliveryContextSchema, providerObservationSchema, type DeliveryContext, type DeliveryIntent } from './deliveryContracts.js'
import { admitInterviewProvider, interviewOperations } from './operations.js'
import { beginCandidateAudioSchema, candidateAudioStatusSchema, candidateAudioUploadSchema, CANDIDATE_AUDIO_MAX_MS, type CandidateAudioResult } from '@hr/shared'
import { audioTicketSchema, audioStatusRecordSchema, audioTranscriptSchema, type AudioTicket, type AudioAttempt, type AudioStatusRecord } from './audioContracts.js'
import { preparePlaybackSchema, playbackActionSchema, inspectPlaybackSchema, type PlaybackResult } from '@hr/shared'
import { playbackRecordSchema, type PlaybackRecord } from './playbackContracts.js'

const processOwner = randomUUID()
const developmentObservation = Symbol('development-observation')
type Versioned = { commandId: string; expectedVersion: number }
type Operation = AiInterviewCommand | { type: 'READY' | 'INVITE' | 'REVOKE'; commandId: string } | { type: 'ACCEPT_CONSENT'; commandId: string; policyVersion: 'ai-interview-v1' | typeof AUDIO_CONSENT }
export class InterviewService {
  readonly dependencies = { policy: new MockInterviewerPolicy(), evaluator: new MockEvaluator() }
  constructor(readonly repository: InterviewRepository, readonly clock: InterviewClock = systemInterviewClock, readonly runtimeOwner: string = processOwner,readonly llm:{enabled:boolean;maxAttempts:number;profile?:string}={enabled:false,maxAttempts:2}) {}
  private engine(snapshot?: AiInterviewSnapshot,policy:InterviewerPolicy=this.dependencies.policy) {
    return snapshot ? InterviewEngine.restore(snapshot, { ...this.dependencies,policy, clock: this.clock }) : new InterviewEngine({ ...this.dependencies,policy, clock: this.clock })
  }
  private version(row: InterviewRow) { row.version = row.snapshot.version }
  private bump(row: InterviewRow) { row.snapshot.version++; this.version(row) }
  private async append(tx: InterviewTransaction, row: InterviewRow, events: AiInterviewEvent[], source: string, actorId: string) {
    for (const input of events) {
      const event = aiInterviewEventSchema.parse(input)
      await tx.insert(aiInterviewEvents).values({ interviewId: row.id, sequence: ++row.lastSequence, recordType: 'DOMAIN',
        eventType: event.type, eventId: event.eventId, commandId: event.commandId, stateVersion: row.version,
        source, actorId, payload: event, createdAt: new Date(event.at) })
      const actions: Partial<Record<AiInterviewEvent['type'], Parameters<typeof interviewAudit>[3]>> = {
        INTERVIEW_STARTED: 'INTERVIEW_STARTED', INTERVIEW_PAUSED: 'INTERVIEW_PAUSED', INTERVIEW_RESUMED: 'INTERVIEW_RESUMED', INTERVIEW_COMPLETED: 'INTERVIEW_COMPLETED', INTERVIEW_CANCELLED: 'CANCELLED',
      }
      const action = actions[event.type]
      if (action) await interviewAudit(tx, row, event.commandId, action, actorId, event.at)
    }
  }
  private apply(row: InterviewRow, result: InterviewCommandResult) {
    row.snapshot = result.snapshot
    this.version(row)
    if (row.consent?.policyVersion === AUDIO_CONSENT) {
      const effects = [...row.pendingEffects, ...result.effects]
      const unique = new Map(effects.map(e => [`${e.type}:${e.type === 'PLAY' ? e.playback.id : e.playbackId}`, e]))
      row.pendingEffects = [...unique.values()].filter(e => e.type === 'STOP_PLAYBACK' || e.playback.id === row.snapshot.playback?.id)
    } else row.pendingEffects = result.effects.filter(e => e.type === 'PLAY')
    row.lastObservedAt = new Date(this.clock.now())
    row.updatedAt = new Date(this.clock.now())
    // Draft partials remain ephemeral. Only finalized answer events can retain text.
    if (row.snapshot.draft) {
      row.snapshot.draft.partialText = ''
      if (row.snapshot.draft.latestTextSource === 'partial') row.snapshot.draft.latestTextSource = row.snapshot.draft.finalText ? 'final' : 'none'
    }
  }
  private async receipt(tx: InterviewTransaction, row: InterviewRow, commandId: string, fingerprint: string, source: string, actorId: string, metadata: Record<string, unknown> = {}) {
    const seq = ++row.lastSequence
    await tx.insert(aiInterviewEvents).values({ interviewId: row.id, sequence: seq, recordType: 'COMMAND', eventType: 'COMMAND_COMMITTED',
      eventId: `receipt:${seq}`, commandId, stateVersion: row.version, source, actorId,
      payload: { fingerprint, resultVersion: row.version, ...metadata }, createdAt: new Date(this.clock.now()) })
  }
  private fingerprint(actor: string, value: unknown) { return tokenHash('session', canonicalJson({ actor, value })) }

  async create(principal: InterviewPrincipal, applicationId: string, input: unknown) {
    const body = createAiInterviewSchema.parse(input)
    return this.repository.database.transaction(async tx => {
      await requireInterviewStaff(tx, principal)
      const app = (await tx.select().from(applications).where(eq(applications.id, applicationId)).for('update'))[0]
      if (!app) throw new InterviewServiceError(404, 'applicationNotFound')
      const actor = `staff:${principal.kind === 'staff' ? principal.userId : ''}`
      const fingerprint = this.fingerprint(actor, { applicationId, body })
      const old = (await tx.select({ row: aiInterviews, receipt: aiInterviewEvents }).from(aiInterviews)
        .innerJoin(aiInterviewEvents, and(eq(aiInterviewEvents.interviewId, aiInterviews.id), eq(aiInterviewEvents.recordType, 'COMMAND'), eq(aiInterviewEvents.commandId, body.commandId)))
        .where(eq(aiInterviews.applicationId, applicationId)))[0]
      if (old) {
        if (old.receipt.payload.fingerprint !== fingerprint) throw new InterviewServiceError(409, 'interviewCommandConflict')
        return { interviewId: old.row.id, version: old.row.version, duplicate: true }
      }
      const attempts = await tx.select({ maximum: sql<number>`coalesce(max(${aiInterviews.attempt}), 0)::integer` }).from(aiInterviews).where(eq(aiInterviews.applicationId, applicationId))
      const open = await tx.select({ snapshot: aiInterviews.snapshot }).from(aiInterviews).where(eq(aiInterviews.applicationId, applicationId))
      if (open.some(r => ['CREATED', 'READY', 'ACTIVE', 'PAUSED'].includes(r.snapshot.status)
        || (r.snapshot.status === 'FAILED' && r.snapshot.failure?.recoverable))) throw new InterviewServiceError(409, 'interviewAttemptAlreadyOpen')
      const id = randomUUID(), now = new Date(this.clock.now())
      const result = this.engine().dispatch({ type: 'CREATE_INTERVIEW', commandId: body.commandId, interviewId: id, plan: body.plan })
      const row = (await tx.insert(aiInterviews).values({ id, applicationId, attempt: attempts[0]!.maximum + 1,
        version: result.snapshot.version, snapshot: result.snapshot, proposedRubric: body.rubric,
        runtimeOwner: this.runtimeOwner, lastObservedAt: now, createdAt: now, updatedAt: now,
        createdBy: principal.kind === 'staff' ? principal.userId : null }).returning())[0]!
      await this.append(tx, row, result.events, 'staff', actor)
      await interviewAudit(tx, row, body.commandId, 'CREATED', actor, this.clock.now())
      await this.receipt(tx, row, body.commandId, fingerprint, 'staff', actor)
      await this.repository.save(tx, row, row.version)
      return { interviewId: id, version: row.version, duplicate: false }
    })
  }

  private async frozen(tx: InterviewTransaction, row: InterviewRow): Promise<AiInterviewFrozenInputs> {
    const { jdId, criteria } = await this.approvedCriteria(tx, row.applicationId)
    if (row.snapshot.plan.questions.some(q => !criteria.some(c => c.key === q.criterionKey))) throw new InterviewServiceError(422, 'interviewCriterionNotInJob')
    return aiInterviewFrozenInputsSchema.parse({ rubric: row.proposedRubric, criteria, weights: criteria.map(({ key, weight }) => ({ key, weight })),
      jobDescriptionId: jdId, configVersion: 'phase2-mock-v1', evaluatorVersion: 'mock-v1' })
  }
  private async approvedCriteria(tx: InterviewTransaction, applicationId: string) {
    const jd = (await tx.select({ jd: jobDescriptions }).from(applications).innerJoin(jobDescriptions,
      and(eq(jobDescriptions.openingId, applications.openingId), eq(jobDescriptions.status, 'approved')))
      .where(eq(applications.id, applicationId)).orderBy(sql`${jobDescriptions.approvedAt} desc nulls last`).limit(1))[0]?.jd
    if (!jd) throw new InterviewServiceError(422, 'approvedJobDescriptionRequired')
    const content = jobDescriptionContentSchema.parse(jd.content)
    const scorecard = scorecardSchema.safeParse(jd.scorecard)
    const criteria = deriveCriteria(content, scorecard.success ? scorecard.data : null)
    return { jdId: jd.id, criteria }
  }
  async configuration(principal: InterviewPrincipal, applicationId: string) {
    return this.repository.database.transaction(async tx => {
      await requireInterviewStaff(tx, principal)
      const { criteria } = await this.approvedCriteria(tx, applicationId)
      return { criteria: criteria.map(({ key, label }) => ({ key, label })) }
    })
  }
  async list(principal: InterviewPrincipal, applicationId: string) {
    return this.repository.database.transaction(async tx => {
      await requireInterviewStaff(tx, principal)
      const rows = await tx.select().from(aiInterviews).where(eq(aiInterviews.applicationId, applicationId)).orderBy(sql`${aiInterviews.attempt} desc`)
      return { interviews: rows.map(row => ({ interviewId: row.id, attempt: row.attempt, version: row.version,
        status: row.snapshot.status, phase: row.snapshot.phase, language: row.snapshot.plan.language, evaluationStatus: row.snapshot.evaluationStatus,
        invitationStatus: row.inviteRevokedAt ? 'REVOKED' : !row.inviteTokenHash ? 'NONE' : row.inviteExpiresAt!.getTime() <= this.clock.now() ? 'EXPIRED' : row.inviteConsumedAt ? 'CONSUMED' : 'INVITED' })) }
    })
  }
  private async recover(tx: InterviewTransaction, row: InterviewRow) {
    if (row.runtimeOwner === this.runtimeOwner) return false
    const before = row.version
    await interviewAudit(tx, row, `recovery:${before}`, 'RUNTIME_RECOVERY_STARTED', 'system', this.clock.now())
    if (row.snapshot.status === 'ACTIVE') {
      const result = recoverInterview(row, this.dependencies)
      this.apply(row, result)
      row.pauseReason = 'SERVER_RESTART'
      await this.append(tx, row, result.events, 'system', 'system')
      await this.receipt(tx, row, `restart:${before}`, this.fingerprint('system', { before, owner: this.runtimeOwner }), 'system', 'system')
    }
    row.runtimeOwner = this.runtimeOwner
    await interviewAudit(tx, row, `recovery:${before}`, 'RUNTIME_RECOVERY_COMPLETED', 'system', this.clock.now())
    await this.repository.save(tx, row, before)
    return row.snapshot.status === 'PAUSED'
  }
  async load(principal: InterviewPrincipal, id: string, applicationId?: string) {
    return this.repository.locked(id, async (tx, row) => {
      await authorizeInterview(tx, row, principal, this.clock.now())
      if (applicationId && row.applicationId !== applicationId) throw new InterviewServiceError(404, 'interviewNotFound')
      await this.recover(tx, row)
      return row
    })
  }
  async execute(principal: InterviewPrincipal, id: string, expectedVersion: number, operation: Operation, applicationId?: string) {
    return this.executeOperation(principal, id, expectedVersion, operation, applicationId)
  }
  /** Called only by the explicitly enabled, non-production development router. */
  async executeMock(principal: InterviewPrincipal, input: unknown) {
    const { aiInterviewMockRequestSchema } = await import('@hr/shared')
    const body = aiInterviewMockRequestSchema.parse(input)
    if (principal.kind !== 'candidate') throw new InterviewServiceError(403, 'candidateSessionInvalid')
    return this.executeOperation(principal, body.interviewId, body.expectedVersion, mockObservationCommand(body), undefined, developmentObservation)
  }
  private async executeOperation(principal: InterviewPrincipal, id: string, expectedVersion: number, operation: Operation, applicationId?: string, capability?: symbol) {
    if (principal.kind === 'candidate' && capability !== developmentObservation) candidateAiInterviewRequestSchema.parse({ interviewId: id, expectedVersion, command: operation })
    const result = await this.repository.locked(id, async (tx, row) => {
      const actor = await authorizeInterview(tx, row, principal, this.clock.now())
      if(operation.type==='PROCESS_ANSWER'&&await this.repository.receipt(tx,row.id,'model:mode'))throw new InterviewServiceError(409,'interviewModelOrchestrationRequired')
      if (applicationId && row.applicationId !== applicationId) throw new InterviewServiceError(404, 'interviewNotFound')
      if (principal.kind === 'candidate' && row.consent?.policyVersion === AUDIO_CONSENT &&
        !['PAUSE_INTERVIEW', 'CANCEL_INTERVIEW'].includes(operation.type)) throw new InterviewServiceError(403, 'trustedInterviewDeliveryRequired')
      if (principal.kind === 'candidate' && capability !== developmentObservation && ['CANDIDATE_SPEECH_STARTED', 'CANDIDATE_SPEECH_FINISHED', 'CANDIDATE_TRANSCRIPT_FINAL'].includes(operation.type)) {
        const audio = await this.audioLatest(tx, row)
        if (audio && audio.turnId === row.snapshot.draft?.turnId && !['CANCELLED', 'COMMITTED'].includes(audio.status)) throw new InterviewServiceError(403, 'trustedAudioRequired')
      }
      const signature = this.fingerprint(actor, { expectedVersion, operation })
      const receipt = await this.repository.receipt(tx, id, operation.commandId)
      if (receipt) {
        if (receipt.payload.fingerprint !== signature) throw new InterviewServiceError(409, 'interviewCommandConflict')
        return { row, duplicate: true, effects: [] as InterviewCommandResult['effects'], recoveryNeeded: false, token: null as string | null }
      }
      if (row.snapshot.status === 'ACTIVE' && row.runtimeOwner !== this.runtimeOwner) {
        await this.recover(tx, row)
        return { row, duplicate: false, effects: [], recoveryNeeded: true, token: null }
      }
      if (row.version !== expectedVersion) throw new InterviewServiceError(409, 'interviewVersionConflict')
      if (principal.kind !== 'system' && principal.kind !== 'candidate') await requireInterviewStaff(tx, principal)
      const before = row.version, now = this.clock.now()
      let token: string | null = null, effects: InterviewCommandResult['effects'] = []
      if (operation.type === 'READY') {
        await requireInterviewStaff(tx, principal)
        if (row.frozenInputs) throw new InterviewServiceError(409, 'interviewAlreadyFrozen')
        row.frozenInputs = await this.frozen(tx, row)
        const applied = this.engine(row.snapshot).dispatch({ type: 'MARK_READY', commandId: operation.commandId })
        this.apply(row, applied); effects = applied.effects
        row.readyAt = new Date(now)
        if(this.llm.enabled)await this.receipt(tx,row,'model:mode',this.modelHash({profile:this.llm.profile??'injected-v1'}),'interview-model','system',{modelProfile:this.llm.profile??'injected-v1'})
        await this.append(tx, row, applied.events, 'staff', actor)
        await interviewAudit(tx, row, operation.commandId, 'PLAN_FROZEN', actor, now)
      } else if (operation.type === 'INVITE') {
        await requireInterviewStaff(tx, principal)
        if (!['READY', 'PAUSED'].includes(row.snapshot.status) || !row.frozenInputs) throw new InterviewServiceError(409, 'interviewNotInvitable')
        const replaced = !!row.inviteTokenHash
        token = newCredential(); row.inviteTokenHash = tokenHash('invite', token)
        row.inviteExpiresAt = new Date(now + 24 * 60 * 60 * 1000); row.inviteRevokedAt = null; row.inviteConsumedAt = null
        row.candidateSessionHash = null; row.candidateSessionExpiresAt = null; row.candidateSessionVersion++
        this.bump(row)
        await interviewAudit(tx, row, operation.commandId, 'INVITATION_GENERATED', actor, now)
        if (replaced) await interviewAudit(tx, row, operation.commandId, 'INVITATION_REPLACED', actor, now)
      } else if (operation.type === 'REVOKE') {
        await requireInterviewStaff(tx, principal)
        if (row.snapshot.status === 'ACTIVE') {
          const engine = this.engine(row.snapshot)
          let preceding: InterviewCommandResult['events'] = []
          let paused: InterviewCommandResult
          try { paused = engine.dispatch({ type: 'PAUSE_INTERVIEW', reason: 'USER', commandId: operation.commandId }) }
          catch (error) {
            if (!(error instanceof InterviewDomainError) || error.code !== 'ANSWER_DEADLINE_PASSED_TICK_REQUIRED') throw error
            preceding = engine.dispatch({ type: 'TIMER_TICK', commandId: `revoke-tick:${row.version}` }).events
            paused = engine.dispatch({ type: 'PAUSE_INTERVIEW', reason: 'USER', commandId: operation.commandId })
          }
          this.apply(row, paused); effects = paused.effects
          await this.append(tx, row, [...preceding, ...paused.events], 'staff', actor)
        } else this.bump(row)
        row.inviteRevokedAt = new Date(now); row.candidateSessionHash = null; row.candidateSessionExpiresAt = null; row.candidateSessionVersion++
        row.pauseReason = 'INVITATION_REVOKED'
        await interviewAudit(tx, row, operation.commandId, 'INVITATION_REVOKED', actor, now)
      } else if (operation.type === 'ACCEPT_CONSENT') {
        if (principal.kind !== 'candidate' || row.snapshot.status !== 'READY') throw new InterviewServiceError(409, 'consentNotAcceptable')
        row.consent = { acceptedAt: now, policyVersion: operation.policyVersion }; this.bump(row)
      } else {
        const command = aiInterviewCommandSchema.parse(operation)
        if (['CREATE_INTERVIEW', 'MARK_READY', 'CANDIDATE_TRANSCRIPT_PARTIAL','REVISE_QUESTION_TEXT'].includes(command.type)) throw new InterviewServiceError(403, 'internalInterviewCommandDenied')
        if (command.type === 'START_INTERVIEW' && (!row.consent || row.consent.policyVersion !== 'ai-interview-v1' || !row.frozenInputs)) throw new InterviewServiceError(409, 'interviewConsentRequired')
        if (command.type === 'GENERATE_EVALUATION') {
          const report = await this.repository.evaluation(tx, row.id)
          if (report?.results && !Array.isArray(report.results)) throw new InterviewServiceError(409, 'useVersionedEvaluationJob')
          await verifyPersistedEvidence(this.repository, tx, row)
        }
        const applied = this.engine(row.snapshot).dispatch(command)
        this.apply(row, applied); effects = applied.effects
        if (command.type === 'PAUSE_INTERVIEW') row.pauseReason = command.reason
        if (command.type === 'RESUME_INTERVIEW') { row.pauseReason = null; row.runtimeOwner = this.runtimeOwner }
        await this.append(tx, row, applied.events, principal.kind, actor)
      }
      row.updatedAt = new Date(now)
      await this.receipt(tx, row, operation.commandId, signature, principal.kind, actor)
      if (row.snapshot.status === 'COMPLETED') await this.persistEvaluation(tx, row)
      await this.repository.save(tx, row, before)
      return { row, duplicate: false, effects, recoveryNeeded: false, token }
    })
    if (result.recoveryNeeded) throw new InterviewServiceError(409, 'interviewRecoveryRequired')
    return result
  }
  async ready(p: InterviewPrincipal, id: string, request: Versioned, applicationId?: string) { return this.execute(p, id, request.expectedVersion, { type: 'READY', commandId: request.commandId }, applicationId) }
  async invite(p: InterviewPrincipal, id: string, request: Versioned, applicationId?: string) { return this.execute(p, id, request.expectedVersion, { type: 'INVITE', commandId: request.commandId }, applicationId) }
  async revoke(p: InterviewPrincipal, id: string, request: Versioned, applicationId?: string) { return this.execute(p, id, request.expectedVersion, { type: 'REVOKE', commandId: request.commandId }, applicationId) }

  private async answerActor(tx: InterviewTransaction, row: InterviewRow, principal: InterviewPrincipal, body: SubmitAiInterviewAnswer) {
    if (principal.kind !== 'candidate') throw new InterviewServiceError(403, 'candidateSessionInvalid')
    const actor = await authorizeInterview(tx, row, principal, this.clock.now())
    if (row.consent?.policyVersion === AUDIO_CONSENT) throw new InterviewServiceError(403, 'trustedInterviewDeliveryRequired')
    if (body.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'answerSessionChanged')
    return actor
  }
  private answerSignature(actor: string, body: SubmitAiInterviewAnswer) {
    return this.fingerprint(actor, { type: 'SUBMIT_TYPED_ANSWER', ...body })
  }
  private async answerOutcome(tx: InterviewTransaction, row: InterviewRow, body: SubmitAiInterviewAnswer, actor: string): Promise<AiInterviewAnswerResult> {
    const receipt = await this.repository.receipt(tx, row.id, body.commandId)
    if (receipt && receipt.payload.fingerprint !== this.answerSignature(actor, body)) throw new InterviewServiceError(409, 'interviewCommandConflict')
    const records = await this.repository.finalizedAnswers(tx, row.id)
    const finalized = records.map(r => aiInterviewEventSchema.parse(r.payload)).find(e => e.type === 'CANDIDATE_ANSWER_FINALIZED' && e.answer.turnId === body.turnId)
    const answer = finalized?.type === 'CANDIDATE_ANSWER_FINALIZED' ? finalized.answer : undefined
    const snapshotAnswer = row.snapshot.answers.find(a => a.turnId === body.turnId)
    const matches = !!answer && answer.questionId === body.questionId && answer.textSource === 'final' && answer.text === body.text
      && snapshotAnswer?.questionId === body.questionId && snapshotAnswer.text === body.text && snapshotAnswer.textSource === 'final'
    if (receipt && !matches) throw new InterviewServiceError(409, 'answerCommitInconsistent')
    const open = ['ACTIVE', 'PAUSED', 'FAILED'].includes(row.snapshot.status) && row.snapshot.draft?.turnId === body.turnId && row.snapshot.currentQuestion?.id === body.questionId
    return { outcome: matches ? 'COMMITTED' : answer ? answer.textSource === 'final' && answer.text ? 'CONFLICT' : 'CLOSED' : open ? 'OPEN' : 'CLOSED',
      submissionId: body.commandId, questionId: body.questionId, turnId: body.turnId,
      duplicate: !!receipt || matches, state: this.candidateState(row) }
  }
  /** Read-only, authenticated reconciliation. Receipt lookup never authorizes a candidate. */
  async answerStatus(principal: InterviewPrincipal, input: unknown) {
    const body = submitAiInterviewAnswerSchema.parse(input)
    return this.repository.locked(body.interviewId, async (tx, row) => {
      const actor = await this.answerActor(tx, row, principal, body)
      return this.answerOutcome(tx, row, body, actor)
    })
  }
  /** One logical typed answer, one row lock and transaction, one existing durable receipt. */
  async submitAnswer(principal: InterviewPrincipal, input: unknown): Promise<AiInterviewAnswerResult> {
    const body = submitAiInterviewAnswerSchema.parse(input)
    const result = await this.repository.locked(body.interviewId, async (tx, row) => {
      const actor = await this.answerActor(tx, row, principal, body)
      const receipt = await this.repository.receipt(tx, row.id, body.commandId)
      if (receipt) return this.answerOutcome(tx, row, body, actor)
      const audio = await this.audioLatest(tx, row)
      if (audio && audio.turnId === body.turnId && !['CANCELLED', 'COMMITTED'].includes(audio.status)) throw new InterviewServiceError(403, 'trustedAudioRequired')
      if (row.snapshot.status === 'ACTIVE' && row.runtimeOwner !== this.runtimeOwner) {
        await this.recover(tx, row)
        return null // Recovery must commit; a subsequent explicit resume is required.
      }
      if (row.version !== body.expectedVersion) throw new InterviewServiceError(409, 'interviewVersionConflict')
      if (row.snapshot.status !== 'ACTIVE' || row.snapshot.phase !== 'LISTENING' || row.snapshot.draft?.turnId !== body.turnId || row.snapshot.currentQuestion?.id !== body.questionId) throw new InterviewServiceError(409, 'answerTurnClosed')
      const previous = row.version, engine = this.engine(row.snapshot)
      const events: AiInterviewEvent[] = [], effects: InterviewCommandResult['effects'] = []
      const dispatch = (command: AiInterviewCommand) => {
        const r = engine.dispatch(command); events.push(...r.events); effects.push(...r.effects); return r
      }
      if (!engine.snapshot.draft!.speaking) dispatch({ type: 'CANDIDATE_SPEECH_STARTED', commandId: `answer:${body.commandId}:start`, turnId: body.turnId })
      dispatch({ type: 'CANDIDATE_TRANSCRIPT_FINAL', commandId: `answer:${body.commandId}:final`, turnId: body.turnId, text: body.text, uncertain: false })
      const finished = dispatch({ type: 'CANDIDATE_SPEECH_FINISHED', commandId: `answer:${body.commandId}:finish`, turnId: body.turnId })
      if (!finished.snapshot.answers.some(a => a.turnId === body.turnId && a.questionId === body.questionId && a.text === body.text)) throw new InterviewServiceError(409, 'answerCommitInconsistent')
      this.apply(row, { ...finished, events, effects })
      await this.append(tx, row, events, 'candidate', actor)
      await this.receipt(tx, row, body.commandId, this.answerSignature(actor, body), 'candidate', actor)
      await this.repository.save(tx, row, previous)
      return { outcome: 'COMMITTED' as const, duplicate: false, submissionId: body.commandId, questionId: body.questionId, turnId: body.turnId, state: this.candidateState(row) }
    })
    if (!result) throw new InterviewServiceError(409, 'interviewRecoveryRequired')
    return result
  }

  private modelHash(input:unknown){const json=canonicalJson(input);if(Buffer.byteLength(json)>512000)throw new InterviewServiceError(422,'modelInputTooLarge');return createHash('sha256').update(json).digest('hex')}
  async requiresModel(id:string){return this.repository.locked(id,async(tx,row)=>!!await this.repository.receipt(tx,row.id,'model:mode'))}
  private async modelLatest(tx:InterviewTransaction,row:InterviewRow,key?:string){
    const records=await tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId,row.id),eq(aiInterviewEvents.eventType,'MODEL_JOB_STATUS'),key?sql`${aiInterviewEvents.payload}->>'key' = ${key}`:sql`true`)).orderBy(sql`${aiInterviewEvents.sequence} desc`).limit(1)
    return records[0]?llmJobSchema.parse(records[0].payload):null
  }
  private async modelRecord(tx:InterviewTransaction,row:InterviewRow,job:LlmJob){
    await tx.insert(aiInterviewEvents).values({interviewId:row.id,sequence:++row.lastSequence,recordType:'AUDIT',eventType:'MODEL_JOB_STATUS',eventId:`model:${row.lastSequence}`,commandId:`model:${job.jobId}:status:${row.lastSequence}`,stateVersion:row.version,source:'interview-model',actorId:'interview-model',payload:job,createdAt:new Date(this.clock.now())})
  }
  private async modelInput(tx:InterviewTransaction,row:InterviewRow,kind:LlmJob['kind']):Promise<InterviewLlmInput>{
    const plan=row.snapshot.plan
    if(kind==='PLAN'){
      if(row.snapshot.status!=='CREATED'||row.frozenInputs)throw new InterviewServiceError(409,'modelPlanFrozen')
      const {criteria}=await this.approvedCriteria(tx,row.applicationId)
      if(plan.questions.some(q=>!criteria.some(c=>c.key===q.criterionKey)))throw new InterviewServiceError(422,'modelCriterionNotApproved')
      return llmInputSchema.parse({kind,language:plan.language,...proposalForPlan(plan),criteria:plan.questions.map(q=>({questionId:q.id,criterionKey:q.criterionKey})),answer:null,currentQuestion:null,choices:[{type:'NEXT_QUESTION'}]})
    }
    if(row.snapshot.status!=='ACTIVE'||row.snapshot.phase!=='PROCESSING'||!row.candidateSessionExpiresAt||row.candidateSessionExpiresAt.getTime()<=this.clock.now())throw new InterviewServiceError(409,'modelInterviewClosed')
    const answer=row.snapshot.answers.at(-1)!,q=plan.questions.find(q=>q.id===answer.baseQuestionId)!,count=row.snapshot.counts[q.id]!
    const choices:InterviewLlmInput['choices']=[{type:'NEXT_QUESTION'}]
    for(const [field,type,maximum]of [['followUps','FOLLOW_UP',q.maxFollowUps],['clarifications','CLARIFICATION',q.maxClarifications]]as const)if(count[field]<maximum)for(const p of q[field])if(!row.snapshot.usedPromptIds.includes(`${q.id}:${field}:${p.id}`)&&(answer.text.trim()||type==='CLARIFICATION'&&q.silenceAction==='CLARIFY_OR_NEXT'))choices.push({type,promptId:p.id})
    return llmInputSchema.parse({kind,language:plan.language,questions:proposalForPlan({...plan,questions:[q]}).questions,criteria:[{questionId:q.id,criterionKey:q.criterionKey}],answer:{text:answer.text,uncertain:answer.transcriptionUncertain},currentQuestion:{kind:row.snapshot.currentQuestion!.kind,prompt:row.snapshot.currentQuestion!.prompt},choices})
  }
  async requestModelPlan(principal:InterviewPrincipal,id:string,applicationId:string,input:unknown){
    const body=z.object({commandId:z.uuid(),expectedVersion:z.number().int().nonnegative()}).strict().parse(input)
    return this.repository.locked(id,async(tx,row)=>{
      await requireInterviewStaff(tx,principal);await authorizeInterview(tx,row,principal,this.clock.now());if(row.applicationId!==applicationId)throw new InterviewServiceError(404,'interviewNotFound');if(!this.llm.enabled)throw new InterviewServiceError(409,'modelDisabled')
      const key=`plan:${body.commandId}`,signature=this.fingerprint(principal.kind==='staff'?principal.userId:'system',body),receipt=await this.repository.receipt(tx,id,`model:${key}:request`)
      if(receipt){if(receipt.payload.fingerprint!==signature)throw new InterviewServiceError(409,'interviewCommandConflict');return this.modelView(row,await this.modelLatest(tx,row,key))}
      if(row.version!==body.expectedVersion)throw new InterviewServiceError(409,'interviewVersionConflict')
      const latest=await this.modelLatest(tx,row);if(latest?.kind==='PLAN'&&['QUEUED','RUNNING','PROPOSED'].includes(latest.status))throw new InterviewServiceError(409,'modelJobInProgress')
      const context=await this.modelInput(tx,row,'PLAN'),before=row.version;this.bump(row)
      const job:LlmJob={jobId:randomUUID(),key,modelProfile:this.llm.profile??'injected-v1',kind:'PLAN',status:'QUEUED',staffId:principal.kind==='staff'?principal.userId:null,owner:this.runtimeOwner,sessionVersion:row.candidateSessionVersion,turnId:null,expectedVersion:row.version,inputHash:this.modelHash(context),attempt:0,attemptId:null,deadline:null,retryAt:this.clock.now(),failure:null,proposal:null}
      await this.modelRecord(tx,row,job);await this.receipt(tx,row,`model:${key}:request`,signature,'staff',job.staffId!);await this.repository.save(tx,row,before);return this.modelView(row,job)
    })
  }
  private modelView(row:InterviewRow,job:LlmJob|null){return {version:row.version,job:job?{jobId:job.jobId,modelProfile:job.modelProfile,kind:job.kind,status:job.status,attempt:job.attempt,maxAttempts:this.llm.maxAttempts,failure:job.failure,proposal:job.kind==='PLAN'&&['PROPOSED','APPLIED'].includes(job.status)?job.proposal:null}:null}}
  async modelStatus(principal:InterviewPrincipal,id:string,applicationId?:string){
    return this.repository.locked(id,async(tx,row)=>{await authorizeInterview(tx,row,principal,this.clock.now());if(principal.kind==='candidate'){
      const mode=await this.repository.receipt(tx,row.id,'model:mode')
      if(!mode)return {status:'IDLE'}
      if(!this.llm.enabled||mode.payload.modelProfile!==(this.llm.profile??'injected-v1'))return {status:row.snapshot.phase==='PROCESSING'?'RECOVERY_REQUIRED':'IDLE'}
      const j=row.snapshot.phase==='PROCESSING'?await this.modelLatest(tx,row,`decision:${row.snapshot.answers.at(-1)!.turnId}`):null
      return {status:!j?row.snapshot.phase==='PROCESSING'?'PROCESSING':'IDLE':j.status==='FAILED'&&j.retryAt===Number.MAX_SAFE_INTEGER||j.status==='STALE'?'RECOVERY_REQUIRED':j.status==='FAILED'?'RETRYING':'PROCESSING'}
    }await requireInterviewStaff(tx,principal);if(row.applicationId!==applicationId)throw new InterviewServiceError(404,'interviewNotFound');return this.modelView(row,await this.modelLatest(tx,row))})
  }
  async approveModelPlan(principal:InterviewPrincipal,id:string,applicationId:string,input:unknown){
    const b=z.object({jobId:z.uuid(),commandId:z.uuid(),expectedVersion:z.number().int().nonnegative()}).strict().parse(input)
    return this.repository.locked(id,async(tx,row)=>{
      await requireInterviewStaff(tx,principal);await authorizeInterview(tx,row,principal,this.clock.now());if(row.applicationId!==applicationId)throw new InterviewServiceError(404,'interviewNotFound')
      const signature=this.fingerprint(principal.kind==='staff'?principal.userId:'system',b),receipt=await this.repository.receipt(tx,id,`model:${b.commandId}:approve`)
      if(receipt){if(receipt.payload.fingerprint!==signature)throw new InterviewServiceError(409,'interviewCommandConflict');return this.modelView(row,await this.modelLatest(tx,row))}
      const j=await this.modelLatest(tx,row)
      if(!j||j.jobId!==b.jobId||j.kind!=='PLAN'||j.status!=='PROPOSED'||row.version!==b.expectedVersion||j.expectedVersion!==row.version||j.inputHash!==this.modelHash(await this.modelInput(tx,row,'PLAN')))throw new InterviewServiceError(409,'modelProposalStale')
      const proposal=validateQuestionProposal(j.proposal,row.snapshot.plan),before=row.version,result=this.engine(row.snapshot).dispatch({type:'REVISE_QUESTION_TEXT',commandId:b.commandId,proposal})
      this.apply(row,result);await this.append(tx,row,result.events,'staff-approved-model',principal.kind==='staff'?principal.userId:'system');const applied={...j,status:'APPLIED' as const,expectedVersion:row.version};await this.modelRecord(tx,row,applied);await this.receipt(tx,row,`model:${b.commandId}:approve`,signature,'staff',principal.kind==='staff'?principal.userId:'system');await this.repository.save(tx,row,before);return this.modelView(row,applied)
    })
  }
  async claimModelJob(id:string,timeoutMs:number){
    if(!this.llm.enabled)return null
    return this.repository.locked(id,async(tx,row)=>{
      await this.recover(tx,row);let j:LlmJob|null
      if(row.snapshot.status==='ACTIVE'&&row.snapshot.phase==='PROCESSING'){
        if(!row.candidateSessionExpiresAt||row.candidateSessionExpiresAt.getTime()<=this.clock.now())return null
        const mode=await this.repository.receipt(tx,row.id,'model:mode');if(!mode||mode.payload.modelProfile!==(this.llm.profile??'injected-v1'))return null
        const key=`decision:${row.snapshot.answers.at(-1)!.turnId}`;j=await this.modelLatest(tx,row,key)
        if(!j){const context=await this.modelInput(tx,row,'DECISION');j={jobId:randomUUID(),key,modelProfile:this.llm.profile??'injected-v1',kind:'DECISION',status:'QUEUED',staffId:null,owner:this.runtimeOwner,sessionVersion:row.candidateSessionVersion,turnId:row.snapshot.answers.at(-1)!.turnId,expectedVersion:row.version,inputHash:this.modelHash(context),attempt:0,attemptId:null,deadline:null,retryAt:this.clock.now(),failure:null,proposal:null}}
      }else j=await this.modelLatest(tx,row)
      if(j?.kind==='DECISION'&&!(row.snapshot.status==='ACTIVE'&&row.snapshot.phase==='PROCESSING'))return null
      if(!j||['PROPOSED','APPLIED','COMMITTED','STALE'].includes(j.status)||j.attempt>=this.llm.maxAttempts||j.retryAt>this.clock.now())return null
      if(j.status==='RUNNING'&&j.owner===this.runtimeOwner&&j.deadline!>this.clock.now())return null
      let context:InterviewLlmInput
      try{if(j.staffId)await requireInterviewStaff(tx,{kind:'staff',userId:j.staffId});context=await this.modelInput(tx,row,j.kind);if(j.modelProfile!==(this.llm.profile??'injected-v1')||j.sessionVersion!==row.candidateSessionVersion||this.modelHash(context)!==j.inputHash||(j.owner===this.runtimeOwner&&j.status==='QUEUED'&&j.expectedVersion!==row.version))throw Error('stale')}catch{
        const before=row.version;this.bump(row);await this.modelRecord(tx,row,{...j,status:'STALE',failure:'MODEL_STALE',expectedVersion:row.version});await this.repository.save(tx,row,before);return null
      }
      const before=row.version;this.bump(row);j={...j,status:'RUNNING',owner:this.runtimeOwner,expectedVersion:row.version,attempt:j.attempt+1,attemptId:randomUUID(),deadline:this.clock.now()+timeoutMs,retryAt:0,failure:null}
      await this.modelRecord(tx,row,j);await this.repository.save(tx,row,before);return {job:j,input:context}
    })
  }
  async finishModelJob(id:string,job:LlmJob,output:unknown){
    const parsed=job.kind==='PLAN'?interviewQuestionProposalSchema.parse(output):z.object({decision:interviewModelDecisionSchema}).strict().parse(output),signature=this.modelHash(parsed)
    return this.repository.locked(id,async(tx,row)=>{
      const receipt=await this.repository.receipt(tx,id,`model:${job.jobId}:commit`)
      if(receipt){if(receipt.payload.fingerprint!==signature)throw new InterviewServiceError(409,'interviewCommandConflict');return {duplicate:true}}
      const latest=await this.modelLatest(tx,row,job.key)
      if(latest?.status!=='RUNNING'||job.modelProfile!==(this.llm.profile??'injected-v1')||latest.attemptId!==job.attemptId||row.runtimeOwner!==this.runtimeOwner||job.owner!==this.runtimeOwner||job.expectedVersion!==row.version||job.sessionVersion!==row.candidateSessionVersion||job.deadline!<=this.clock.now())throw new InterviewServiceError(409,'modelResultStale')
      if(job.staffId)await requireInterviewStaff(tx,{kind:'staff',userId:job.staffId})
      const context=await this.modelInput(tx,row,job.kind);if(this.modelHash(context)!==job.inputHash)throw new InterviewServiceError(409,'modelInputChanged')
      const before=row.version;let completed:LlmJob
      if(job.kind==='PLAN'){const proposal=validateQuestionProposal(parsed,row.snapshot.plan);this.bump(row);completed={...job,status:'PROPOSED',proposal,expectedVersion:row.version}}
      else{
        const decision=z.object({decision:interviewModelDecisionSchema}).strict().parse(parsed).decision
        if(!context.choices.some(c=>canonicalJson(c)===canonicalJson(decision)))throw new InterviewServiceError(422,'modelDecisionOutsidePolicy')
        const policy:InterviewerPolicy={chooseNextBase:c=>this.dependencies.policy.chooseNextBase(c),afterAnswer:()=>decision}
        const result=this.engine(row.snapshot,policy).dispatch({type:'PROCESS_ANSWER',commandId:`process:${job.turnId}`});this.apply(row,result);await this.append(tx,row,result.events,'model-decision','interview-model');completed={...job,status:'COMMITTED',expectedVersion:row.version}
        await this.receipt(tx,row,`process:${job.turnId}`,this.modelHash({inputHash:job.inputHash,decision}),'interview-model','interview-model')
      }
      await this.modelRecord(tx,row,completed);await this.receipt(tx,row,`model:${job.jobId}:commit`,signature,'interview-model','interview-model');await this.repository.save(tx,row,before);return {duplicate:false}
    })
  }
  async failModelJob(id:string,job:LlmJob,code:string,retryable:boolean){
    return this.repository.locked(id,async(tx,row)=>{const latest=await this.modelLatest(tx,row,job.key);if(latest?.attemptId!==job.attemptId||latest.status!=='RUNNING'||row.runtimeOwner!==this.runtimeOwner||latest.owner!==this.runtimeOwner||latest.sessionVersion!==row.candidateSessionVersion)return
      const before=row.version;this.bump(row);await this.modelRecord(tx,row,{...latest,status:'FAILED',failure:['MODEL_TIMEOUT','MODEL_INVALID','MODEL_UNAVAILABLE','MODEL_CANCELLED'].includes(code)?code:'MODEL_UNAVAILABLE',retryAt:retryable&&latest.attempt<this.llm.maxAttempts?this.clock.now()+1000*latest.attempt:Number.MAX_SAFE_INTEGER,expectedVersion:row.version});await this.repository.save(tx,row,before)
    })
  }
  async currentModelAttempt(id:string,job:LlmJob){return this.repository.locked(id,async(_tx,row)=>job.modelProfile===(this.llm.profile??'injected-v1')&&row.runtimeOwner===this.runtimeOwner&&row.version===job.expectedVersion&&row.candidateSessionVersion===job.sessionVersion&&job.deadline!>this.clock.now()&&(job.kind==='PLAN'?row.snapshot.status==='CREATED':row.snapshot.status==='ACTIVE'&&row.snapshot.phase==='PROCESSING'))}
  async controlModelJob(principal:InterviewPrincipal,id:string,applicationId:string,input:unknown){
    const b=z.object({jobId:z.uuid(),commandId:z.uuid(),expectedVersion:z.number().int().nonnegative(),operation:z.enum(['RETRY','CANCEL'])}).strict().parse(input)
    return this.repository.locked(id,async(tx,row)=>{await requireInterviewStaff(tx,principal);await authorizeInterview(tx,row,principal,this.clock.now());if(row.applicationId!==applicationId)throw new InterviewServiceError(404,'interviewNotFound')
      const signature=this.fingerprint(principal.kind==='staff'?principal.userId:'system',b),receipt=await this.repository.receipt(tx,id,`model:${b.commandId}:control`)
      if(receipt){if(receipt.payload.fingerprint!==signature)throw new InterviewServiceError(409,'interviewCommandConflict');return this.modelView(row,await this.modelLatest(tx,row))}
      const j=await this.modelLatest(tx,row)
      if(!j||j.jobId!==b.jobId||row.version!==b.expectedVersion||['APPLIED','COMMITTED','PROPOSED','STALE'].includes(j.status))throw new InterviewServiceError(409,'modelJobClosed')
      if(b.operation==='RETRY'&&(j.status!=='FAILED'||j.attempt>=this.llm.maxAttempts||this.modelHash(await this.modelInput(tx,row,j.kind))!==j.inputHash))throw new InterviewServiceError(409,'modelRetryExhausted')
      const before=row.version;this.bump(row);const changed:LlmJob={...j,status:b.operation==='CANCEL'?'STALE':'FAILED',failure:b.operation==='CANCEL'?'MODEL_CANCELLED':j.failure,retryAt:b.operation==='CANCEL'?Number.MAX_SAFE_INTEGER:this.clock.now(),expectedVersion:row.version};await this.modelRecord(tx,row,changed);await this.receipt(tx,row,`model:${b.commandId}:control`,signature,'staff',principal.kind==='staff'?principal.userId:'system');await this.repository.save(tx,row,before);return this.modelView(row,changed)
    })
  }
  private async playbackLatest(tx: InterviewTransaction, row: InterviewRow, generationId?: string) {
    const records=await tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId,row.id),eq(aiInterviewEvents.eventType,'TTS_PLAYBACK_STATUS'),generationId?sql`${aiInterviewEvents.payload}->>'generationId' = ${generationId}`:sql`true`)).orderBy(sql`${aiInterviewEvents.sequence} desc`).limit(1)
    return records[0]?playbackRecordSchema.parse(records[0].payload):null
  }
  private async playbackRecord(tx: InterviewTransaction,row: InterviewRow,record: PlaybackRecord) {
    await tx.insert(aiInterviewEvents).values({interviewId:row.id,sequence:++row.lastSequence,recordType:'AUDIT',eventType:'TTS_PLAYBACK_STATUS',eventId:`tts-audit:${row.lastSequence}`,commandId:`tts:${record.generationId}:${row.lastSequence}`,stateVersion:row.version,source:'candidate-tts',actorId:'candidate-tts',payload:record,createdAt:new Date(this.clock.now())})
  }
  private async playbackScope(tx: InterviewTransaction,row: InterviewRow,record: PlaybackRecord) {
    if(record.owner!==this.runtimeOwner||row.runtimeOwner!==this.runtimeOwner||record.sessionVersion!==row.candidateSessionVersion||record.expiresAt<=this.clock.now()||row.snapshot.status!=='ACTIVE'||row.snapshot.playback?.id!==record.playbackId||row.snapshot.currentQuestion?.id!== (record.questionId??undefined)|| (row.snapshot.draft?.turnId??null)!==record.turnId)throw new InterviewServiceError(409,'playbackClosed')
    if(record.deliveryGeneration)await this.deliveryScope(tx,row,{kind:'system'},record.deliveryGeneration)
  }
  private playbackResult(row: InterviewRow,record: PlaybackRecord|null,closed=false): PlaybackResult {
    return {generationId:record?.generationId??null,status:closed?'CLOSED':record?.status??'NONE',durationMs:record?.durationMs??0,finishAt:record?.finishAt??null,state:this.candidateState(row)}
  }
  async preparePlayback(principal: InterviewPrincipal,input: unknown) {
    const body=preparePlaybackSchema.parse(input)
    return this.repository.locked(body.interviewId,async(tx,row)=>{
      const actor=await this.audioAuthorize(tx,row,principal),signature=this.fingerprint(actor,body),receipt=await this.repository.receipt(tx,row.id,`tts:${body.requestId}:prepare`)
      if(await this.repository.receipt(tx,row.id,`tts:${body.requestId}:cancel`))throw new InterviewServiceError(409,'playbackCancelled')
      if(receipt){if(receipt.payload.fingerprint!==signature)throw new InterviewServiceError(409,'interviewCommandConflict');const record=await this.playbackLatest(tx,row,String(receipt.payload.generationId));if(record?.sessionVersion!==row.candidateSessionVersion)throw new InterviewServiceError(403,'playbackSessionChanged');let closed=false;if(!['STOPPED','COMPLETED','ERROR'].includes(record.status))try{await this.playbackScope(tx,row,record)}catch{closed=true}return {result:this.playbackResult(row,record,closed),record:null,text:null}}
      if(body.sessionVersion!==row.candidateSessionVersion)throw new InterviewServiceError(403,'playbackSessionChanged')
      if(row.version!==body.expectedVersion)throw new InterviewServiceError(409,'interviewVersionConflict')
      if(row.snapshot.status!=='ACTIVE'||row.snapshot.playback?.id!==body.playbackId||(row.snapshot.currentQuestion?.id??null)!==body.questionId||(row.snapshot.draft?.turnId??null)!==body.turnId)throw new InterviewServiceError(409,'playbackScopeDenied')
      const latest=await this.playbackLatest(tx,row)
      if(latest?.playbackId===body.playbackId&&latest.owner===this.runtimeOwner&&latest.sessionVersion===row.candidateSessionVersion&&['GENERATING','READY','PLAYING'].includes(latest.status)&&latest.expiresAt>this.clock.now())return {result:this.playbackResult(row,latest),record:null,text:null}
      const before=row.version,now=this.clock.now(),record:PlaybackRecord={...body,generationId:randomUUID(),owner:this.runtimeOwner,deliveryGeneration:row.consent?.policyVersion===AUDIO_CONSENT?String((await this.deliveryRecords(tx,row.id)).find(r=>r.eventType==='DELIVERY_BOUND')?.payload.generationId??''):null,status:'GENERATING',expiresAt:Math.min(now+120000,row.candidateSessionExpiresAt!.getTime()),durationMs:0,audioHash:null,documentId:null,finishAt:null,leaseUntil:now+15000}
      await this.playbackScope(tx,row,record)
      if(row.snapshot.playback!.started)throw new InterviewServiceError(409,'playbackAlreadyStarted')
      const text=row.snapshot.playback!.text
      if(!text.trim()||text.length>4096)throw new InterviewServiceError(422,'playbackTextInvalid')
      this.bump(row);record.expectedVersion=row.version
      await this.playbackRecord(tx,row,record);await this.receipt(tx,row,`tts:${body.requestId}:prepare`,signature,'candidate-tts',actor,{generationId:record.generationId});await this.repository.save(tx,row,before)
      return {result:this.playbackResult(row,record),record,text}
    })
  }
  async readyPlayback(principal: InterviewPrincipal,record:PlaybackRecord,durationMs:number,audioHash:string) {
    return this.repository.locked(record.interviewId,async(tx,row)=>{
      await this.audioAuthorize(tx,row,principal);await this.playbackScope(tx,row,record)
      const latest=await this.playbackLatest(tx,row,record.generationId)
      if(latest?.status!=='GENERATING'||latest.expectedVersion!==row.version||latest.leaseUntil!<=this.clock.now())throw new InterviewServiceError(409,'playbackStale')
      const before=row.version;this.bump(row);const ready={...latest,status:'READY' as const,durationMs,audioHash,leaseUntil:null};await this.playbackRecord(tx,row,ready);await this.repository.save(tx,row,before);return this.playbackResult(row,ready)
    })
  }
  private async stopPlaybackRow(tx: InterviewTransaction,row: InterviewRow,record: PlaybackRecord,status:'STOPPED'|'ERROR') {
    const before=row.version
    if(row.snapshot.status==='ACTIVE'&&row.snapshot.playback?.id===record.playbackId&&status==='STOPPED'){
      const result=this.engine(row.snapshot).dispatch({type:'PAUSE_INTERVIEW',reason:'USER',commandId:`tts:${record.generationId}:stop`});this.apply(row,result);row.pauseReason='USER';await this.append(tx,row,result.events,'candidate-tts','candidate-tts')
    }else this.bump(row)
    const stopped={...record,status};await this.playbackRecord(tx,row,stopped);await this.receipt(tx,row,`tts:${record.generationId}:${status}`,this.fingerprint('candidate-tts',{generationId:record.generationId,status}),'candidate-tts','candidate-tts');await this.repository.save(tx,row,before);return this.playbackResult(row,stopped)
  }
  async playbackFailure(interviewId:string,generationId:string) {
    return this.repository.locked(interviewId,async(tx,row)=>{const r=await this.playbackLatest(tx,row,generationId);if(r?.owner===this.runtimeOwner&&row.runtimeOwner===this.runtimeOwner&&['GENERATING','READY'].includes(r.status))return this.stopPlaybackRow(tx,row,r,'ERROR')})
  }
  async invalidatePlayback(interviewId:string,generationId:string){
    return this.repository.locked(interviewId,async(tx,row)=>{const r=await this.playbackLatest(tx,row,generationId);if(r?.owner===this.runtimeOwner&&row.runtimeOwner===this.runtimeOwner&&['GENERATING','READY','PLAYING'].includes(r.status))return this.stopPlaybackRow(tx,row,r,'STOPPED')})
  }
  async cancelPlaybackRequest(principal:InterviewPrincipal,input:unknown){
    const body=preparePlaybackSchema.parse(input)
    return this.repository.locked(body.interviewId,async(tx,row)=>{
      const actor=await this.audioAuthorize(tx,row,principal)
      if(body.sessionVersion!==row.candidateSessionVersion)throw new InterviewServiceError(403,'playbackSessionChanged')
      const receipt=await this.repository.receipt(tx,row.id,`tts:${body.requestId}:prepare`)
      if(receipt){const r=await this.playbackLatest(tx,row,String(receipt.payload.generationId));if(r&&['GENERATING','READY','PLAYING'].includes(r.status))return this.stopPlaybackRow(tx,row,r,'STOPPED');return this.playbackResult(row,r)}
      if(!await this.repository.receipt(tx,row.id,`tts:${body.requestId}:cancel`)){const before=row.version;this.bump(row);await this.receipt(tx,row,`tts:${body.requestId}:cancel`,this.fingerprint(actor,body),'candidate-tts',actor);await this.repository.save(tx,row,before)}
      return {...this.playbackResult(row,null),status:'STOPPED' as const}
    })
  }
  async expirePlayback(interviewId:string,generationId:string) {
    return this.repository.locked(interviewId,async(tx,row)=>{const r=await this.playbackLatest(tx,row,generationId);if(!r||r.owner!==this.runtimeOwner||row.runtimeOwner!==this.runtimeOwner||!['READY','PLAYING'].includes(r.status))return; if(r.expiresAt<=this.clock.now()||(r.status==='PLAYING'&&r.leaseUntil!<=this.clock.now()))return this.stopPlaybackRow(tx,row,r,'STOPPED')})
  }
  async inspectPlayback(principal:InterviewPrincipal,input:unknown) {
    const body=inspectPlaybackSchema.parse(input)
    return this.repository.locked(body.interviewId,async(tx,row)=>{
      await this.audioAuthorize(tx,row,principal);if(body.sessionVersion!==row.candidateSessionVersion)throw new InterviewServiceError(403,'playbackSessionChanged')
      const r=await this.playbackLatest(tx,row)
      if(!r||r.playbackId!==body.playbackId)return this.playbackResult(row,null)
      if(r.sessionVersion!==body.sessionVersion)throw new InterviewServiceError(403,'playbackSessionChanged')
      if(r.questionId!==body.questionId||r.turnId!==body.turnId)throw new InterviewServiceError(409,'playbackScopeDenied')
      if(r.status==='COMPLETED'||r.status==='STOPPED')return this.playbackResult(row,r)
      try{await this.playbackScope(tx,row,r)}catch{return this.playbackResult(row,r,true)}
      if(r.questionId!==body.questionId||r.turnId!==body.turnId)throw new InterviewServiceError(409,'playbackScopeDenied')
      if(r.status==='PLAYING'&&(r.documentId!==body.documentId||r.leaseUntil!<=this.clock.now()))return this.stopPlaybackRow(tx,row,r,'STOPPED')
      return this.playbackResult(row,r)
    })
  }
  async playbackAction(principal:InterviewPrincipal,action:'audio'|'start'|'pulse'|'end'|'stop',input:unknown) {
    const b=playbackActionSchema.parse(input)
    return this.repository.locked(b.interviewId,async(tx,row)=>{
      await this.audioAuthorize(tx,row,principal);const r=await this.playbackLatest(tx,row,b.generationId)
      if(!r||r.sessionVersion!==row.candidateSessionVersion||b.sessionVersion!==r.sessionVersion)throw new InterviewServiceError(403,'playbackScopeDenied')
      if(r.playbackId!==b.playbackId||r.questionId!==b.questionId||r.turnId!==b.turnId)throw new InterviewServiceError(409,'playbackScopeDenied')
      if(r.status==='STOPPED'||r.status==='COMPLETED'){
        if(action==='audio'||action==='start')throw new InterviewServiceError(409,'playbackClosed')
        return this.playbackResult(row,r)
      }
      await this.playbackScope(tx,row,r)
      if(action==='stop')return this.stopPlaybackRow(tx,row,r,'STOPPED')
      if(action==='audio'){if(r.status!=='READY')throw new InterviewServiceError(409,'playbackNotReady');return this.playbackResult(row,r)}
      if(action==='start'&&r.status==='PLAYING'&&r.documentId===b.documentId)return this.playbackResult(row,r)
      if(action==='start'&&r.status!=='READY')throw new InterviewServiceError(409,'playbackNotReady')
      if(action!=='start'&&(r.status!=='PLAYING'||r.documentId!==b.documentId))throw new InterviewServiceError(409,'playbackLeaseDenied')
      if(r.status==='PLAYING'&&r.leaseUntil!<=this.clock.now())return this.stopPlaybackRow(tx,row,r,'STOPPED')
      if(action==='end'&&this.clock.now()<r.finishAt!)throw new InterviewServiceError(409,'playbackTooEarly')
      const before=row.version;let record=r
      if(action==='start'||action==='end'){
        const result=this.engine(row.snapshot).dispatch({type:action==='start'?'AI_PLAYBACK_STARTED':'AI_PLAYBACK_FINISHED',playbackId:r.playbackId,commandId:`tts:${r.generationId}:${action}`});this.apply(row,result);await this.append(tx,row,result.events,'candidate-tts-schedule','candidate-tts')
        record={...r,status:action==='start'?'PLAYING':'COMPLETED',documentId:b.documentId,finishAt:action==='start'?this.clock.now()+r.durationMs:r.finishAt,leaseUntil:this.clock.now()+5000}
        await this.receipt(tx,row,`tts:${r.generationId}:${action}`,this.fingerprint('candidate-tts',{generationId:r.generationId,action}),'candidate-tts','candidate-tts')
        if(row.snapshot.status==='COMPLETED')await this.persistEvaluation(tx,row)
      }else{this.bump(row);record={...r,leaseUntil:this.clock.now()+5000}}
      await this.playbackRecord(tx,row,record);await this.repository.save(tx,row,before);return this.playbackResult(row,record)
    })
  }
  private async audioAuthorize(tx: InterviewTransaction, row: InterviewRow, principal: InterviewPrincipal) {
    if (principal.kind !== 'candidate') throw new InterviewServiceError(403, 'candidateSessionInvalid')
    return authorizeInterview(tx, row, principal, this.clock.now())
  }
  private async audioRecord(tx: InterviewTransaction, row: InterviewRow, value: AudioStatusRecord) {
    const seq = ++row.lastSequence
    await tx.insert(aiInterviewEvents).values({interviewId: row.id, sequence: seq, recordType: 'AUDIT', eventType: 'AUDIO_CAPTURE_STATUS', eventId: `audit:${seq}`,
      commandId: `audio:${value.submissionId}:status:${seq}`, stateVersion: row.version, source: 'candidate-audio', actorId: 'candidate-audio', payload: value, createdAt: new Date(this.clock.now())})
  }
  private async audioLatest(tx: InterviewTransaction, row: InterviewRow, submissionId?: string) {
    const values = await tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId, row.id), eq(aiInterviewEvents.recordType, 'AUDIT'), eq(aiInterviewEvents.eventType, 'AUDIO_CAPTURE_STATUS'),
      submissionId ? sql`${aiInterviewEvents.payload}->>'submissionId' = ${submissionId}` : sql`true`)).orderBy(sql`${aiInterviewEvents.sequence} desc`).limit(1)
    return values[0] ? audioStatusRecordSchema.parse(values[0].payload) : null
  }
  private async audioTicket(tx: InterviewTransaction, row: InterviewRow, submissionId: string) {
    const receipt = await this.repository.receipt(tx, row.id, `audio:${submissionId}:begin`)
    if (!receipt) throw new InterviewServiceError(404, 'audioCaptureNotFound')
    return audioTicketSchema.parse(receipt.payload.audio)
  }
  private async audioScope(tx: InterviewTransaction, row: InterviewRow, principal: InterviewPrincipal, ticket: AudioTicket) {
    await this.audioAuthorize(tx, row, principal)
    if (ticket.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioSessionChanged')
    if (ticket.owner !== this.runtimeOwner || row.runtimeOwner !== this.runtimeOwner || this.clock.now() >= ticket.expiresAt || row.snapshot.status !== 'ACTIVE' || row.snapshot.phase !== 'LISTENING'
      || row.snapshot.currentQuestion?.id !== ticket.questionId || row.snapshot.draft?.turnId !== ticket.turnId || !row.snapshot.draft.speaking || row.snapshot.draft.finalText) throw new InterviewServiceError(409, 'audioCaptureClosed')
    if (ticket.deliveryGeneration) await this.deliveryScope(tx, row, principal, ticket.deliveryGeneration)
  }
  private async audioResult(tx: InterviewTransaction, row: InterviewRow, ticket: AudioTicket, status?: AudioStatusRecord | null): Promise<CandidateAudioResult> {
    const committed = await this.repository.receipt(tx, row.id, `audio:${ticket.submissionId}:commit`)
    const current = status ?? await this.audioLatest(tx, row, ticket.submissionId)
    if (committed) {
      const persisted = (await this.repository.finalizedAnswers(tx, row.id)).map(r => aiInterviewEventSchema.parse(r.payload)).filter(e => e.type === 'CANDIDATE_ANSWER_FINALIZED' && e.answer.turnId === ticket.turnId)
      const snapshot = row.snapshot.answers.find(a => a.turnId === ticket.turnId)
      if (persisted.length !== 1 || persisted[0]?.type !== 'CANDIDATE_ANSWER_FINALIZED' || snapshot?.questionId !== ticket.questionId || persisted[0].answer.text !== snapshot.text || snapshot.textSource !== 'final') throw new InterviewServiceError(409, 'audioCommitInconsistent')
    }
    let outcome: CandidateAudioResult['outcome'] = committed ? 'COMMITTED' : current?.status ?? 'CLOSED'
    if (!committed && outcome !== 'CANCELLED' && (ticket.expiresAt <= this.clock.now() || ticket.owner !== this.runtimeOwner || row.runtimeOwner !== this.runtimeOwner
      || row.snapshot.status !== 'ACTIVE' || row.snapshot.draft?.turnId !== ticket.turnId || row.snapshot.currentQuestion?.id !== ticket.questionId)) outcome = 'CLOSED'
    if (outcome === 'PROCESSING' && (current?.deadlineAt ?? 0) <= this.clock.now()) outcome = 'RETRY_REQUIRED'
    if (!committed && ticket.deliveryGeneration && (await this.deliveryRecords(tx, row.id)).find(r => r.eventType === 'DELIVERY_BOUND')?.payload.generationId !== ticket.deliveryGeneration) outcome = 'CLOSED'
    return {submissionId: ticket.submissionId, generationId: ticket.generationId, outcome, expiresAt: ticket.expiresAt, maxDurationMs: ticket.maxDurationMs, state: this.candidateState(row)}
  }
  async beginAudio(principal: InterviewPrincipal, input: unknown) {
    const body = beginCandidateAudioSchema.parse(input)
    return this.repository.locked(body.interviewId, async (tx, row) => {
      const actor = await this.audioAuthorize(tx, row, principal), signature = this.fingerprint(actor, body)
      if (await this.repository.receipt(tx, row.id, `audio:${body.submissionId}:cancel`)) throw new InterviewServiceError(409, 'audioCaptureClosed')
      const old = await this.repository.receipt(tx, row.id, `audio:${body.submissionId}:begin`)
      if (old) {
        if (old.payload.fingerprint !== signature) throw new InterviewServiceError(409, 'interviewCommandConflict')
        const ticket = audioTicketSchema.parse(old.payload.audio)
        if (ticket.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioSessionChanged')
        return this.audioResult(tx, row, ticket)
      }
      if (body.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioSessionChanged')
      if (row.version !== body.expectedVersion) throw new InterviewServiceError(409, 'interviewVersionConflict')
      if (row.runtimeOwner !== this.runtimeOwner || row.snapshot.status !== 'ACTIVE' || row.snapshot.phase !== 'LISTENING' || row.snapshot.currentQuestion?.id !== body.questionId
        || row.snapshot.draft?.turnId !== body.turnId || !row.consent || row.snapshot.draft.finalText) throw new InterviewServiceError(409, 'audioTurnClosed')
      const latest = await this.audioLatest(tx, row)
      if (latest && latest.turnId === body.turnId && latest.sessionVersion === body.sessionVersion && latest.expiresAt > this.clock.now() && !['CANCELLED', 'COMMITTED'].includes(latest.status)) throw new InterviewServiceError(409, 'audioCaptureInProgress')
      let deliveryGeneration: string | null = null
      if (row.consent.policyVersion === AUDIO_CONSENT) {deliveryGeneration = String((await this.deliveryRecords(tx, row.id)).find(r => r.eventType === 'DELIVERY_BOUND')?.payload.generationId ?? ''); await this.deliveryScope(tx, row, principal, deliveryGeneration)}
      const deadline = row.snapshot.timer!.stage === 'GRACE' ? row.snapshot.timer!.graceDeadlineAt! : row.snapshot.timer!.answerDeadlineAt + row.snapshot.timer!.gracePeriodSec * 1000
      const duration = Math.min(CANDIDATE_AUDIO_MAX_MS, deadline - this.clock.now())
      if (duration < 250) throw new InterviewServiceError(409, 'audioTurnClosed')
      const before = row.version
      if (!row.snapshot.draft.speaking) {
        const result = this.engine(row.snapshot).dispatch({type: 'CANDIDATE_SPEECH_STARTED', commandId: `audio:${body.submissionId}:start`, turnId: body.turnId})
        this.apply(row, result); await this.append(tx, row, result.events, 'candidate-audio', actor)
      } else this.bump(row)
      const ticket: AudioTicket = {submissionId: body.submissionId, generationId: randomUUID(), questionId: body.questionId, turnId: body.turnId, sessionVersion: body.sessionVersion,
        owner: this.runtimeOwner, deliveryGeneration, expiresAt: Math.min(deadline, row.candidateSessionExpiresAt!.getTime()), maxDurationMs: duration}
      await this.audioRecord(tx, row, {...ticket, status: 'RESERVED', audioHash: null, attemptId: null, deadlineAt: null, expectedVersion: null})
      await this.receipt(tx, row, `audio:${body.submissionId}:begin`, signature, 'candidate-audio', actor, {audio: ticket, consent: body.consent})
      await this.repository.save(tx, row, before)
      return this.audioResult(tx, row, ticket)
    })
  }
  async audioStatus(principal: InterviewPrincipal, input: unknown) {
    const body = candidateAudioStatusSchema.parse(input)
    return this.repository.locked(body.interviewId, async (tx, row): Promise<CandidateAudioResult> => {
      await this.audioAuthorize(tx, row, principal)
      const receipt = await this.repository.receipt(tx, row.id, `audio:${body.submissionId}:begin`)
      if (!receipt) return {submissionId: body.submissionId, generationId: null, outcome: await this.repository.receipt(tx,row.id,`audio:${body.submissionId}:cancel`) ? 'CANCELLED' : 'NOT_FOUND', expiresAt: 0, maxDurationMs: 0, state: this.candidateState(row)}
      const ticket = audioTicketSchema.parse(receipt.payload.audio)
      if (ticket.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioSessionChanged')
      return this.audioResult(tx, row, ticket)
    })
  }
  async audioPreflight(principal: InterviewPrincipal, input: unknown) {
    const body = candidateAudioUploadSchema.parse(input)
    return this.repository.locked(body.interviewId, async (tx, row) => {
      await this.audioAuthorize(tx, row, principal)
      const ticket = await this.audioTicket(tx, row, body.submissionId)
      if (body.generationId !== ticket.generationId || ticket.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioScopeDenied')
      const result = await this.audioResult(tx, row, ticket)
      if (result.outcome !== 'COMMITTED') await this.audioScope(tx, row, principal, ticket)
      return result
    })
  }
  async claimAudio(principal: InterviewPrincipal, input: unknown, audioHash: string, durationMs: number, capacity: boolean, timeoutMs: number): Promise<{result: CandidateAudioResult; attempt?: AudioAttempt}> {
    const body = candidateAudioUploadSchema.parse(input)
    return this.repository.locked(body.interviewId, async (tx, row) => {
      await this.audioAuthorize(tx, row, principal)
      const ticket = await this.audioTicket(tx, row, body.submissionId), latest = await this.audioLatest(tx, row, body.submissionId)
      if (ticket.generationId !== body.generationId || ticket.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioScopeDenied')
      if (latest?.audioHash && latest.audioHash !== audioHash) throw new InterviewServiceError(409, 'audioPayloadConflict')
      const result = await this.audioResult(tx, row, ticket, latest)
      if (result.outcome === 'COMMITTED' || result.outcome === 'PROCESSING') return {result}
      await this.audioScope(tx, row, principal, ticket)
      if (latest?.status === 'CANCELLED' || latest?.generationId !== ticket.generationId) throw new InterviewServiceError(409, 'audioCaptureClosed')
      if (durationMs < 250 || durationMs > ticket.maxDurationMs) throw new InterviewServiceError(422, 'audioDurationInvalid')
      if (!capacity) throw new InterviewServiceError(429, 'audioCapacity')
      const before = row.version; this.bump(row)
      const attempt: AudioAttempt = {ticket, attemptId: randomUUID(), expectedVersion: row.version, deadlineAt: Math.min(ticket.expiresAt, this.clock.now() + timeoutMs), audioHash}
      await this.audioRecord(tx, row, {...ticket, status: 'PROCESSING', audioHash, attemptId: attempt.attemptId, expectedVersion: attempt.expectedVersion, deadlineAt: attempt.deadlineAt})
      await this.repository.save(tx, row, before)
      return {result: await this.audioResult(tx, row, ticket), attempt}
    })
  }
  async completeAudio(principal: InterviewPrincipal, interviewId: string, attempt: AudioAttempt, transcript: unknown) {
    const final = audioTranscriptSchema.parse(transcript), {ticket} = attempt
    return this.repository.locked(interviewId, async (tx, row) => {
      const actor = await this.audioAuthorize(tx, row, principal)
      await this.audioScope(tx, row, principal, ticket)
      const latest = await this.audioLatest(tx, row, ticket.submissionId)
      if (latest?.status !== 'PROCESSING' || latest.attemptId !== attempt.attemptId || latest.audioHash !== attempt.audioHash || row.version !== attempt.expectedVersion || this.clock.now() >= attempt.deadlineAt) throw new InterviewServiceError(409, 'audioResultStale')
      const before = row.version, engine = this.engine(row.snapshot)
      const received = engine.dispatch({type: 'CANDIDATE_TRANSCRIPT_FINAL', commandId: `audio:${ticket.submissionId}:final`, turnId: ticket.turnId, ...final})
      const finished = engine.dispatch({type: 'CANDIDATE_SPEECH_FINISHED', commandId: `audio:${ticket.submissionId}:finish`, turnId: ticket.turnId})
      const events = [...received.events, ...finished.events]
      this.apply(row, {...finished, events, effects: [...received.effects, ...finished.effects]})
      await this.append(tx, row, events, 'provider-stt', actor)
      await this.receipt(tx, row, `audio:${ticket.submissionId}:commit`, this.fingerprint(actor, {generationId: ticket.generationId, audioHash: attempt.audioHash}), 'provider-stt', actor)
      await this.audioRecord(tx, row, {...ticket, status: 'COMMITTED', audioHash: attempt.audioHash, attemptId: attempt.attemptId, expectedVersion: row.version, deadlineAt: attempt.deadlineAt})
      await this.repository.save(tx, row, before)
      return this.audioResult(tx, row, ticket)
    })
  }
  async failAudio(principal: InterviewPrincipal, interviewId: string, attempt: AudioAttempt) {
    return this.repository.locked(interviewId, async (tx, row) => {
      await this.audioAuthorize(tx, row, principal)
      const latest = await this.audioLatest(tx, row, attempt.ticket.submissionId)
      if (latest?.status !== 'PROCESSING' || latest.attemptId !== attempt.attemptId || row.runtimeOwner !== this.runtimeOwner || latest.owner !== this.runtimeOwner || latest.sessionVersion !== row.candidateSessionVersion) return
      const before = row.version; this.bump(row)
      await this.audioRecord(tx, row, {...latest, status: 'RETRY_REQUIRED'})
      await this.repository.save(tx, row, before)
    })
  }
  async cancelAudio(principal: InterviewPrincipal, input: unknown) {
    const body = candidateAudioStatusSchema.parse(input)
    return this.repository.locked(body.interviewId, async (tx, row) => {
      const actor = await this.audioAuthorize(tx, row, principal)
      if (!await this.repository.receipt(tx, row.id, `audio:${body.submissionId}:begin`)) {
        if (!await this.repository.receipt(tx, row.id, `audio:${body.submissionId}:cancel`)) {
          const before = row.version; this.bump(row)
          await this.receipt(tx, row, `audio:${body.submissionId}:cancel`, this.fingerprint(actor, body), 'candidate-audio', actor)
          await this.repository.save(tx, row, before)
        }
        return {submissionId: body.submissionId, generationId: null, outcome: 'CANCELLED' as const, expiresAt: 0, maxDurationMs: 0, state: this.candidateState(row)}
      }
      const ticket = await this.audioTicket(tx, row, body.submissionId)
      if (ticket.sessionVersion !== row.candidateSessionVersion) throw new InterviewServiceError(403, 'audioSessionChanged')
      const latest = await this.audioLatest(tx, row, body.submissionId), result = await this.audioResult(tx, row, ticket, latest)
      if (['COMMITTED', 'CANCELLED'].includes(result.outcome)) return result
      const before = row.version
      const deadline = row.snapshot.timer?.stage === 'GRACE' ? row.snapshot.timer.graceDeadlineAt! : row.snapshot.timer?.answerDeadlineAt ?? 0
      if (row.snapshot.status === 'ACTIVE' && row.snapshot.draft?.turnId === ticket.turnId && row.snapshot.draft.speaking && !row.snapshot.draft.finalText && this.clock.now() < deadline) {
        const stopped = this.engine(row.snapshot).dispatch({type: 'CANDIDATE_SPEECH_FINISHED', commandId: `audio:${ticket.submissionId}:cancel`, turnId: ticket.turnId})
        this.apply(row, stopped); await this.append(tx, row, stopped.events, 'candidate-audio', actor)
      } else this.bump(row)
      await this.audioRecord(tx, row, {...ticket, status: 'CANCELLED', audioHash: latest?.audioHash ?? null, attemptId: latest?.attemptId ?? null, expectedVersion: null, deadlineAt: null})
      await this.repository.save(tx, row, before)
      return this.audioResult(tx, row, ticket)
    })
  }

  async exchange(token: string, interviewId?: string) {
    if (!isCredential(token)) { interviewOperations.record({event: 'invite_rejected', code: 'INVALID'}); throw new InterviewServiceError(401, 'invitationInvalid') }
    return this.repository.database.transaction(async tx => {
      const row = (await tx.select().from(aiInterviews).where(eq(aiInterviews.inviteTokenHash, tokenHash('invite', token))).for('update'))[0]
      const now = this.clock.now()
      if (!row || (interviewId && row.id !== interviewId) || row.inviteRevokedAt || row.inviteConsumedAt || !row.inviteExpiresAt || row.inviteExpiresAt.getTime() <= now
        || !['READY', 'PAUSED'].includes(row.snapshot.status)) {
        interviewOperations.record({event: 'invite_rejected', code: row?.inviteRevokedAt ? 'REVOKED' : row?.inviteExpiresAt && row.inviteExpiresAt.getTime() <= now ? 'EXPIRED' : 'AUTH'})
        throw new InterviewServiceError(401, 'invitationInvalid')
      }
      const credential = `${row.id}.${newCredential()}`
      row.inviteConsumedAt = new Date(now); row.candidateSessionHash = tokenHash('session', credential)
      row.candidateSessionExpiresAt = new Date(Math.min(now + 2 * 60 * 60 * 1000, row.inviteExpiresAt.getTime()))
      row.candidateSessionVersion++
      await interviewAudit(tx, row, `exchange:${row.candidateSessionVersion}`, 'INVITATION_EXCHANGED', 'candidate', now)
      await interviewAudit(tx, row, `exchange:${row.candidateSessionVersion}`, 'CANDIDATE_SESSION_ESTABLISHED', 'candidate', now)
      await this.repository.save(tx, row, row.version)
      return { credential, expiresAt: row.candidateSessionExpiresAt, interviewId: row.id }
    })
  }
  private async deliveryRecords(tx: InterviewTransaction, id: string) {
    return tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId, id), eq(aiInterviewEvents.recordType, 'AUDIT'),
      sql`${aiInterviewEvents.eventType} IN ('DELIVERY_BOUND','DELIVERY_OBSERVED','DELIVERY_CLOSED')`)).orderBy(sql`${aiInterviewEvents.sequence} desc`)
  }
  private async deliveryRecord(tx: InterviewTransaction, row: InterviewRow, type: 'DELIVERY_BOUND' | 'DELIVERY_OBSERVED' | 'DELIVERY_CLOSED', commandId: string, payload: Record<string, unknown>) {
    const sequence = ++row.lastSequence
    await tx.insert(aiInterviewEvents).values({ interviewId: row.id, sequence, recordType: 'AUDIT', eventType: type, eventId: `audit:${sequence}`,
      commandId, stateVersion: row.version, source: 'provider', actorId: 'provider', payload, createdAt: new Date(this.clock.now()) })
  }
  private deliveryContext(row: InterviewRow, generationId: string, sequence: number): DeliveryContext {
    return { interviewId: row.id, generationId, sequence, eventId: randomUUID(), expectedVersion: row.version,
      questionId: row.snapshot.currentQuestion?.id ?? null,
      turnId: row.snapshot.draft?.turnId ?? (row.snapshot.currentQuestion ? `turn:${row.snapshot.answers.length + 1}` : null),
      playbackId: row.snapshot.playback?.id ?? null }
  }
  /** Server-only ingress capability. Never serialized or mounted as a provider-event HTTP endpoint. */
  async bindDelivery(principal: InterviewPrincipal, id: string, expectedVersion: number) {
    if (principal.kind !== 'candidate') throw new InterviewServiceError(403, 'candidateSessionInvalid')
    const generationId = randomUUID()
    await this.repository.locked(id, async (tx, row) => {
      await authorizeInterview(tx, row, principal, this.clock.now())
      if (row.version !== expectedVersion) throw new InterviewServiceError(409, 'interviewVersionConflict')
      if (row.runtimeOwner !== this.runtimeOwner || !['READY', 'PAUSED'].includes(row.snapshot.status)) throw new InterviewServiceError(409, 'interviewRecoveryRequired')
      if (row.consent?.policyVersion !== AUDIO_CONSENT || !row.frozenInputs) throw new InterviewServiceError(409, 'interviewConsentRequired')
      const previous = row.version; this.bump(row)
      await this.deliveryRecord(tx, row, 'DELIVERY_BOUND', generationId, { generationId, sessionVersion: row.candidateSessionVersion, owner: this.runtimeOwner })
      await this.repository.save(tx, row, previous)
    })
    return {
      generationId,
      context: (shutdown = false) => {
        if (!shutdown && !admitInterviewProvider(this.repository.database, 'context', id)) return Promise.reject(new InterviewServiceError(429, 'interviewProviderRateLimited'))
        return this.repository.locked(id, async (tx, row) => {
        await this.deliveryScope(tx, row, principal, generationId)
        const records = await this.deliveryRecords(tx, id), last = records.find(r => r.eventType === 'DELIVERY_OBSERVED' && r.payload.generationId === generationId)
        return { context: this.deliveryContext(row, generationId, Number(last?.payload.cursor ?? 0) + 1), state: this.candidateState(row), effects: structuredClone(row.pendingEffects) }
      }) },
      observe: (input: unknown) => this.acceptDelivery(principal, id, generationId, input),
      intent: (type: DeliveryIntent, input: DeliveryContext) => this.acceptDelivery(principal, id, generationId, input, type),
    }
  }
  private async deliveryScope(tx: InterviewTransaction, row: InterviewRow, principal: InterviewPrincipal, generationId: string) {
    await authorizeInterview(tx, row, principal, this.clock.now())
    const records = await this.deliveryRecords(tx, row.id), record = records.find(r => r.eventType === 'DELIVERY_BOUND')
    if (row.consent?.policyVersion !== AUDIO_CONSENT || record?.payload.generationId !== generationId || record.payload.owner !== this.runtimeOwner ||
      row.runtimeOwner !== this.runtimeOwner || record.payload.sessionVersion !== row.candidateSessionVersion || records.some(r => r.eventType === 'DELIVERY_CLOSED' && r.payload.generationId === generationId)) throw new InterviewServiceError(409, 'staleInterviewProvider')
  }
  private async acceptDelivery(principal: InterviewPrincipal, id: string, generationId: string, value: unknown, intent?: DeliveryIntent) {
    try {
    if (!intent && !admitInterviewProvider(this.repository.database, 'observation', id)) throw new InterviewServiceError(429, 'interviewProviderRateLimited')
    const observation = intent ? null : providerObservationSchema.parse(value)
    const body = observation ?? deliveryContextSchema.parse(value)
    if (body.interviewId !== id || body.generationId !== generationId) throw new InterviewServiceError(403, 'interviewProviderScopeDenied')
    return await this.repository.locked(id, async (tx, row) => {
      await this.deliveryScope(tx, row, principal, generationId)
      const actor = `provider:${generationId}`, signature = this.fingerprint(actor, { body, intent: intent ?? null }), commandId = `provider:${body.eventId}`
      const receipt = await this.repository.receipt(tx, id, commandId)
      if (receipt) {
        if (receipt.payload.fingerprint !== signature) throw new InterviewServiceError(409, 'interviewCommandConflict')
        return { duplicate: true, state: this.candidateState(row) }
      }
      const records = await this.deliveryRecords(tx, id), history = records.filter(r => r.eventType === 'DELIVERY_OBSERVED' && r.payload.generationId === generationId)
      if (body.sequence !== Number(history[0]?.payload.cursor ?? 0) + 1) throw new InterviewServiceError(409, 'interviewProviderOrderConflict')
      if (row.version !== body.expectedVersion) throw new InterviewServiceError(409, 'interviewVersionConflict')
      const type = intent ?? observation!.type, connected = type === 'CONNECTED' || (!['CLOSE', 'DISCONNECTED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'PLAYBACK_FAILED'].includes(type) && history[0]?.payload.connected === true)
      if (!['READY', 'ACTIVE', 'PAUSED'].includes(row.snapshot.status)) throw new InterviewServiceError(409, 'interviewProviderClosed')
      if (!['CLOSE', 'CONNECTED', 'DISCONNECTED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'PLAYBACK_FAILED', 'STOPPED'].includes(type) && !connected) throw new InterviewServiceError(409, 'interviewProviderDisconnected')
      const expected = this.deliveryContext(row, generationId, body.sequence)
      if (type !== 'STOPPED' && (body.questionId !== expected.questionId || body.turnId !== expected.turnId || body.playbackId !== expected.playbackId)) throw new InterviewServiceError(409, 'staleInterviewMedia')
      const previous = row.version, engine = this.engine(row.snapshot), events: AiInterviewEvent[] = [], effects: InterviewCommandResult['effects'] = []
      let changed = false
      const dispatch = (command: AiInterviewCommand) => { const result = engine.dispatch(command); events.push(...result.events); effects.push(...result.effects); changed = true; return result }
      const pause = (reason: 'DISCONNECT' | 'PROVIDER_TIMEOUT') => {
        if (row.snapshot.status !== 'ACTIVE') return
        try { dispatch({ type: 'PAUSE_INTERVIEW', reason, commandId }) }
        catch (error) { if (!(error instanceof InterviewDomainError) || error.code !== 'ANSWER_DEADLINE_PASSED_TICK_REQUIRED') throw error
          dispatch({ type: 'TIMER_TICK', commandId: `${commandId}:tick` }); dispatch({ type: 'PAUSE_INTERVIEW', reason, commandId }) }
        row.pauseReason = reason
      }
      if (type === 'START') dispatch({ type: 'START_INTERVIEW', commandId })
      else if (type === 'RESUME') { dispatch({ type: 'RESUME_INTERVIEW', commandId }); row.pauseReason = null }
      else if (type === 'RESERVE_PLAY') {
        if (!row.snapshot.playback || history.some(r => r.payload.observation === 'RESERVE_PLAY' && r.payload.playbackId === body.playbackId)) throw new InterviewServiceError(409, 'playbackAlreadyDispatched')
      } else if (type === 'CONNECTED') { /* Connection readiness never resumes domain state. */ }
      else if (type === 'DISCONNECTED' || type === 'CLOSE') pause('DISCONNECT')
      else if (['PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'PLAYBACK_FAILED'].includes(type)) pause('PROVIDER_TIMEOUT')
      else if (type === 'STOPPED') {
        if (!row.pendingEffects.some(e => e.type === 'STOP_PLAYBACK' && e.playbackId === body.playbackId)) throw new InterviewServiceError(409, 'staleInterviewMedia')
        row.pendingEffects = row.pendingEffects.filter(e => e.type !== 'STOP_PLAYBACK' || e.playbackId !== body.playbackId)
      } else if (type === 'PLAYBACK_STARTED' || type === 'PLAYBACK_FINISHED') {
        if (!history.some(r => r.payload.observation === 'RESERVE_PLAY' && r.payload.playbackId === body.playbackId)) throw new InterviewServiceError(409, 'playbackNotDispatched')
        dispatch({ type: type === 'PLAYBACK_STARTED' ? 'AI_PLAYBACK_STARTED' : 'AI_PLAYBACK_FINISHED', commandId, playbackId: body.playbackId! })
      } else if (type === 'SPEECH_STARTED') {
        dispatch(row.snapshot.phase === 'AI_SPEAKING' ? { type: 'CANDIDATE_INTERRUPTED', commandId, playbackId: body.playbackId! }
          : { type: 'CANDIDATE_SPEECH_STARTED', commandId, turnId: body.turnId! })
      } else if (type === 'SPEECH_FINISHED') dispatch({ type: 'CANDIDATE_SPEECH_FINISHED', commandId, turnId: body.turnId! })
      else if (observation?.type === 'TRANSCRIPT_FINAL') {
        if (row.snapshot.draft?.finalForCurrentSpeech) throw new InterviewServiceError(409, 'transcriptAlreadyAccepted')
        dispatch({ type: 'CANDIDATE_TRANSCRIPT_FINAL', commandId, turnId: body.turnId!, text: observation.text, uncertain: observation.uncertain })
      } else throw new InterviewServiceError(403, 'interviewProviderObservationDenied')
      if (changed) { this.apply(row, { snapshot: engine.snapshot, events, effects, duplicate: false }); await this.append(tx, row, events, 'provider', actor) }
      else this.bump(row)
      await this.deliveryRecord(tx, row, 'DELIVERY_OBSERVED', commandId, { generationId, cursor: body.sequence, observation: type, connected, playbackId: body.playbackId })
      if (type === 'CLOSE') await this.deliveryRecord(tx, row, 'DELIVERY_CLOSED', commandId, { generationId })
      await this.receipt(tx, row, commandId, signature, 'provider', actor)
      if (row.snapshot.status === 'COMPLETED') await this.persistEvaluation(tx, row)
      await this.repository.save(tx, row, previous)
      return { duplicate: false, state: this.candidateState(row) }
    })
    } catch (error) {
      interviewOperations.record({event: 'provider_observation_rejected', interviewId: id, code: error instanceof InterviewServiceError ? error.status === 429 ? 'THROTTLED' : error.status === 401 || error.status === 403 ? 'AUTH' : 'STALE' : 'INVALID'})
      throw error
    }
  }
  candidateState(row: InterviewRow) {
    const state = row.snapshot, timer = state.timer
    return candidateAiInterviewUiStateSchema.parse({ interviewId: row.id, version: row.version, status: state.status, phase: state.phase,
      serverNow: this.clock.now(), speaking: state.draft?.speaking ?? false,
      answerRecovery: row.candidateSessionExpiresAt ? { sessionVersion: row.candidateSessionVersion, expiresAt: row.candidateSessionExpiresAt.getTime() } : undefined,
      canResume: state.status === 'PAUSED' || (state.status === 'FAILED' && state.failure?.recoverable === true),
      pauseReason: row.pauseReason,
      progress: { current: state.status === 'COMPLETED' ? state.plan.questions.length : state.currentQuestion ? [...state.plan.questions].sort((a,b) => a.order-b.order).findIndex(q => q.id === state.currentQuestion!.baseQuestionId) + 1 : 0,
        total: state.plan.questions.length, processed: state.processedBaseQuestionIds.length },
      language: state.plan.language, mock: row.consent?.policyVersion !== AUDIO_CONSENT,
      currentQuestion: state.currentQuestion ? { id: state.currentQuestion.id, prompt: state.currentQuestion.prompt, kind: state.currentQuestion.kind } : null,
      currentTurnId: state.draft?.turnId ?? null,
      delivery: state.playback ? { id: state.playback.id, kind: state.playback.kind, text: state.playback.text, started: state.playback.started } : null,
      timer: timer ? { listeningStartedAt: timer.listeningStartedAt, answerDeadlineAt: timer.answerDeadlineAt,
        remainingMs: timer.pausedRemainingMs ?? Math.max(0, (timer.stage === 'GRACE' ? timer.graceDeadlineAt! : timer.answerDeadlineAt) - this.clock.now()),
        stage: timer.stage, graceDeadlineAt: timer.graceDeadlineAt, warningAtSec: timer.warningAtSec, timeLimitSec: timer.timeLimitSec } : null,
      consent: { requiredPolicyVersion: row.consent?.policyVersion === AUDIO_CONSENT ? AUDIO_CONSENT : 'ai-interview-v1', accepted: ['ai-interview-v1', AUDIO_CONSENT].includes(row.consent?.policyVersion ?? '') },
      recoveryRequired: state.status === 'PAUSED', lastSequence: row.lastSequence })
  }
  async getEventsAfter(principal: InterviewPrincipal, id: string, afterSequence: number) {
    return (await this.getEventsPage(principal, id, afterSequence)).events
  }
  async getEventsPage(principal: InterviewPrincipal, id: string, afterSequence: number) {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new InterviewServiceError(422, 'invalidSequence')
    return this.repository.locked(id, async (tx, row) => {
      await authorizeInterview(tx, row, principal, this.clock.now())
      const records = await this.repository.eventsAfter(tx, id, afterSequence)
      const nextAfterSequence = records.at(-1)?.sequence ?? afterSequence
      const page = { nextAfterSequence, hasMore: nextAfterSequence < row.lastSequence }
      if (principal.kind !== 'candidate') return { events: records, ...page }
      // No raw internal event payload, receipt, audit, rubric or future plan reaches candidates.
      const allowed = new Set(['INTERVIEW_STARTED', 'QUESTION_PLAYBACK_STARTED', 'QUESTION_PLAYBACK_FINISHED', 'ANSWER_LISTENING_STARTED', 'ANSWER_WARNING',
        'CANDIDATE_SPEECH_STARTED', 'CANDIDATE_SPEECH_FINISHED', 'CANDIDATE_ANSWER_FINALIZED', 'ANSWER_TIMEOUT', 'INTERVIEW_PAUSED', 'INTERVIEW_RESUMED', 'INTERVIEW_COMPLETED'])
      return { events: records.filter(r => r.recordType === 'DOMAIN' && allowed.has(r.eventType)).map(r => ({ sequence: r.sequence, type: r.eventType, at: r.createdAt.getTime() })), ...page }
    })
  }
  private async persistEvaluation(tx: InterviewTransaction, row: InterviewRow) {
    const existing = await this.repository.evaluation(tx, row.id)
    if (existing?.results && !Array.isArray(existing.results)) return // Versioned report jobs own this JSON envelope.
    if (!existing) {
      const answers = await persistedAnswers(this.repository, tx, row)
      await tx.insert(aiInterviewEvaluations).values({ interviewId: row.id, status: 'PENDING', reportVersion: 1,
        lastIncludedSequence: row.lastSequence, inputHash: evaluationInputHash(row.frozenInputs!, answers, row.lastSequence, row.version),
        evaluatorVersion: 'mock-v1', rubricVersion: row.frozenInputs!.rubric.version, createdAt: row.updatedAt, updatedAt: row.updatedAt })
    } else if (row.snapshot.evaluationStatus === 'COMPLETED') {
      const answers = await verifyPersistedEvidence(this.repository, tx, row)
      // The input version is the completion receipt's version, not the later report command.
      const anchor = (await tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId, row.id), eq(aiInterviewEvents.sequence, existing.lastIncludedSequence))))[0]!
      if (existing.inputHash !== evaluationInputHash(row.frozenInputs!, answers, existing.lastIncludedSequence, anchor.stateVersion)) throw new InterviewServiceError(409, 'evaluationInputChanged')
      await tx.update(aiInterviewEvaluations).set({ status: 'COMPLETED', results: row.snapshot.evaluations,
        coverage: { totalTurns: answers.length, assessedTurns: row.snapshot.evaluations.filter(e => e.dimensions.some(d => d.status === 'assessed')).length },
        updatedAt: row.updatedAt, completedAt: row.updatedAt }).where(eq(aiInterviewEvaluations.id, existing.id))
    }
  }
}
