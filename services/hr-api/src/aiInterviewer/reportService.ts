import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, lte } from 'drizzle-orm'
import { aiInterviewEventSchema, aiInterviewReportStorageSchema, evaluationReportInputSchema, requestInterviewEvaluationSchema, reviewInterviewReportSchema,
  type AiInterviewReportStorage, type EvaluationReportInput } from '@hr/shared'
import { aiInterviewEvaluations, aiInterviewEvents, applications, candidates, jobOpenings } from '../db/schema.js'
import { requireInterviewStaff, type InterviewPrincipal } from './authorization.js'
import { InterviewServiceError, type InterviewRow, type InterviewTransaction } from './repository.js'
import type { InterviewService } from './service.js'
import { interviewAudit } from './audit.js'
import { interviewOperations } from './operations.js'
import { canonicalJson } from './evaluationInput.js'
import { MockReportEvaluator, reportDimension, reportInputHash, verifyInterviewReport, type ReportEvaluator } from './report.js'
import { boundedEvaluation, diagnose, evaluationCoordinator, evaluationDiagnostic, EVALUATOR_TIMEOUT_MS, LEGACY_EVALUATION_LEASE_MS,
  scheduleEvaluationTimeout, type EvaluationExecutionOptions } from './execution.js'

const unreviewed = () => ({ status: 'UNREVIEWED' as const, reviewedBy: null, reviewedAt: null, note: '' })
const ownerJobs = new WeakMap<object, Map<string, {closed: boolean; tasks: Set<Promise<void>>}>>()
export function reportStorage(value: unknown): AiInterviewReportStorage | null {
  const parsed = aiInterviewReportStorageSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
export class InterviewReportService {
  readonly timeoutMs: number
  private readonly coordinator
  private readonly diagnostic
  private readonly scheduleTimeout
  constructor(readonly interviews: InterviewService, readonly evaluator: ReportEvaluator = new MockReportEvaluator(), options: EvaluationExecutionOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? EVALUATOR_TIMEOUT_MS
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > EVALUATOR_TIMEOUT_MS) throw Error('invalidEvaluationTimeout')
    this.coordinator = evaluationCoordinator(interviews.repository.database)
    this.diagnostic = options.diagnostics ?? evaluationDiagnostic
    this.scheduleTimeout = options.scheduleTimeout ?? scheduleEvaluationTimeout
  }
  cancelActive() { this.coordinator.cancel(this.interviews.runtimeOwner) }
  get activeEvaluatorCalls() { return this.coordinator.activeCalls }
  private ownerWork() {
    let owners = ownerJobs.get(this.interviews.repository.database)
    if (!owners) {owners = new Map(); ownerJobs.set(this.interviews.repository.database, owners)}
    let work = owners.get(this.interviews.runtimeOwner)
    if (!work) {work = {closed: false, tasks: new Set()}; owners.set(this.interviews.runtimeOwner, work)}
    return work
  }
  preventNewWork() { this.ownerWork().closed = true }
  async drainOwner() { this.cancelActive(); await Promise.allSettled([...this.ownerWork().tasks]) }
  private async scope(tx: InterviewTransaction, row: InterviewRow, principal: InterviewPrincipal, applicationId: string) {
    await requireInterviewStaff(tx, principal)
    if (row.applicationId !== applicationId) throw new InterviewServiceError(404, 'interviewNotFound')
  }
  private changed(row: InterviewRow, status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED') {
    row.snapshot.evaluationStatus = status; row.snapshot.version++; row.version = row.snapshot.version
    row.updatedAt = new Date(this.interviews.clock.now())
  }
  private async frozenInput(tx: InterviewTransaction, row: InterviewRow, lastSequence: number, evaluatorVersion: EvaluationReportInput['evaluatorVersion']) {
    if (row.snapshot.status !== 'COMPLETED' || !row.frozenInputs) throw new InterviewServiceError(409, 'interviewNotCompleted')
    const events = await tx.select().from(aiInterviewEvents).where(and(eq(aiInterviewEvents.interviewId,row.id),eq(aiInterviewEvents.recordType,'DOMAIN'),lte(aiInterviewEvents.sequence,lastSequence))).orderBy(asc(aiInterviewEvents.sequence))
    const finalized = events.filter(e => e.eventType === 'CANDIDATE_ANSWER_FINALIZED').map(e => ({ sequence:e.sequence,event:aiInterviewEventSchema.parse(e.payload) }))
    const answers = finalized.map(({ sequence,event }) => {
      if (event.type !== 'CANDIDATE_ANSWER_FINALIZED') throw new InterviewServiceError(409,'invalidPersistedAnswer')
      const { finalizedAt: _time, ...answer } = event.answer
      // A persisted partial is not a trusted final transcript and never enters evaluator input.
      return { sequence, answer: answer.textSource === 'final' ? answer : { ...answer,text:'',textSource:'none' as const } }
    })
    if (answers.length !== row.snapshot.answers.length || new Set(answers.map(a=>a.answer.turnId)).size !== answers.length) throw new InterviewServiceError(409,'evaluationEvidenceIncomplete')
    const questions = events.filter(e => e.eventType === 'QUESTION_SELECTED').map(e => {
      const event=aiInterviewEventSchema.parse(e.payload)
      if(event.type!=='QUESTION_SELECTED') throw new InterviewServiceError(409,'invalidQuestionEvent')
      const q=event.question, base=row.snapshot.plan.questions.find(b=>b.id===q.baseQuestionId)
      if(!base || base.criterionKey!==q.criterionKey) throw new InterviewServiceError(409,'invalidQuestionEvent')
      return { questionId:q.id,baseQuestionId:q.baseQuestionId,criterionKey:q.criterionKey,prompt:q.prompt,type:base.type,kind:q.kind,dimension:reportDimension(base.type) }
    })
    const completion=events.find(e=>e.eventType==='INTERVIEW_COMPLETED')
    if(!completion) throw new InterviewServiceError(409,'interviewCompletionMissing')
    return this.versionedInput({format:'ai-interview-report-input-v1',interviewId:row.id,interviewVersion:completion.stateVersion,lastIncludedSequence:lastSequence,evaluatorVersion,frozen:row.frozenInputs,questions,answers},evaluatorVersion)
  }
  private versionedInput(input:EvaluationReportInput,version:EvaluationReportInput['evaluatorVersion']){
    const {provider:_provider,...base}=input
    if(version==='llm-report-v1'&&!this.evaluator.providerSnapshot)throw new InterviewServiceError(409,'evaluationProviderNotConfigured')
    return evaluationReportInputSchema.parse({...base,evaluatorVersion:version,...(version==='llm-report-v1'?{provider:structuredClone(this.evaluator.providerSnapshot)}:{})})
  }
  async request(principal: InterviewPrincipal,id:string,applicationId:string,value:unknown) {
    const body=requestInterviewEvaluationSchema.parse(value), repo=this.interviews.repository
    const result = await repo.locked(id,async(tx,row)=>{
      await this.scope(tx,row,principal,applicationId)
      const signature=createHash('sha256').update(canonicalJson({actor:principal,body,applicationId})).digest('hex')
      const receipt=await repo.receipt(tx,id,body.commandId)
      if(receipt){if(receipt.payload.fingerprint!==signature)throw new InterviewServiceError(409,'interviewCommandConflict');return {reportVersion:Number(receipt.payload.reportVersion),duplicate:true}}
      if(row.version!==body.expectedVersion)throw new InterviewServiceError(409,'interviewVersionConflict')
      if(row.snapshot.status!=='COMPLETED')throw new InterviewServiceError(409,'interviewNotCompleted')
      let job=await repo.evaluation(tx,id)
      if(!job)throw new InterviewServiceError(409,'evaluationMissing')
      let storage=reportStorage(job.results)
      if(storage && job.inputHash!==reportInputHash(storage.input))throw new InterviewServiceError(409,'evaluationInputChanged')
      const frozenAttemptHash=storage?.attempts.find(a=>a.inputHash)?.inputHash
      if(frozenAttemptHash&&frozenAttemptHash!==job.inputHash)throw new InterviewServiceError(409,'evaluationInputChanged')
      if(body.operation==='REEVALUATE'){
        if(job.status!=='COMPLETED')throw new InterviewServiceError(409,'evaluationNotCompleted')
        const evaluatorVersion=body.evaluatorVersion??(storage?.input.evaluatorVersion==='llm-report-v1'?'llm-report-v1':'mock-report-v2')
        const input=storage?this.versionedInput(storage.input,evaluatorVersion):await this.frozenInput(tx,row,job.lastIncludedSequence,evaluatorVersion)
        job=(await tx.insert(aiInterviewEvaluations).values({interviewId:id,status:'PENDING',reportVersion:job.reportVersion+1,lastIncludedSequence:job.lastIncludedSequence,inputHash:reportInputHash(input),evaluatorVersion,rubricVersion:input.frozen.rubric.version,createdAt:new Date(this.interviews.clock.now()),updatedAt:new Date(this.interviews.clock.now())}).returning())[0]!
        storage={format:'phase4-report-v1',input,report:null,review:unreviewed(),attempts:[]}
      }else if(body.operation==='RETRY'){
        if(job.status!=='FAILED'||!storage)throw new InterviewServiceError(409,'evaluationNotRetryable')
        if(body.evaluatorVersion&&body.evaluatorVersion!==storage.input.evaluatorVersion)throw new InterviewServiceError(409,'retryInputMustNotChange')
        if(job.inputHash!==reportInputHash(storage.input))throw new InterviewServiceError(409,'evaluationInputChanged')
        if(storage.input.provider&&(storage.attempts.length>=storage.input.provider.maxAttempts||canonicalJson(storage.input.provider)!==canonicalJson(this.evaluator.providerSnapshot)))throw new InterviewServiceError(409,'evaluationRetryUnavailable')
      }else{
        if(job.status!=='PENDING')throw new InterviewServiceError(409,'evaluationAlreadyStarted')
        if(!storage){const input=await this.frozenInput(tx,row,job.lastIncludedSequence,body.evaluatorVersion??'mock-report-v1');storage={format:'phase4-report-v1',input,report:null,review:unreviewed(),attempts:[]}}
        else if(body.evaluatorVersion&&body.evaluatorVersion!==storage.input.evaluatorVersion)throw new InterviewServiceError(409,'evaluationInputChanged')
      }
      const previous=row.version
      await tx.update(aiInterviewEvaluations).set({status:'PENDING',results:storage,inputHash:reportInputHash(storage.input),evaluatorVersion:storage.input.evaluatorVersion,
        failureCode:null,retryCount:job.retryCount+(body.operation==='RETRY'?1:0),updatedAt:new Date(this.interviews.clock.now())}).where(eq(aiInterviewEvaluations.id,job.id))
      this.changed(row,'PENDING')
      await interviewAudit(tx,row,body.commandId,body.operation==='RETRY'?'EVALUATION_RETRIED':'EVALUATION_REQUESTED',`staff:${principal.kind==='staff'?principal.userId:''}`,this.interviews.clock.now(),{evaluationId:job.id,reportVersion:job.reportVersion})
      if(body.operation==='REEVALUATE')await interviewAudit(tx,row,body.commandId,'REEVALUATION_REQUESTED',`staff:${principal.kind==='staff'?principal.userId:''}`,this.interviews.clock.now(),{evaluationId:job.id,reportVersion:job.reportVersion})
      await tx.insert(aiInterviewEvents).values({interviewId:id,sequence:++row.lastSequence,recordType:'COMMAND',eventType:'REPORT_COMMAND_COMMITTED',eventId:`receipt:${row.lastSequence}`,commandId:body.commandId,stateVersion:row.version,source:'staff',actorId:principal.kind==='staff'?principal.userId:null,payload:{fingerprint:signature,reportVersion:job.reportVersion},createdAt:new Date(this.interviews.clock.now())})
      await repo.save(tx,row,previous)
      return {reportVersion:job.reportVersion,duplicate:false}
    })
    if(body.operation==='RETRY'&&!result.duplicate)diagnose(this.diagnostic,{event:'evaluation_retry_scheduled',interviewId:id,reportVersion:result.reportVersion})
    return result
  }
  /** Claim and commit in separate transactions. Persisted attempts fence stale workers. */
  async runJob(id:string,reportVersion:number){
    const work = this.ownerWork()
    if (work.closed) return // Committed PENDING job remains durable for the next runtime owner.
    const task = this.executeJob(id, reportVersion); work.tasks.add(task)
    try {await task} finally {work.tasks.delete(task)}
  }
  private async executeJob(id:string,reportVersion:number){
    const repo=this.interviews.repository
    const slot=this.coordinator.reserve(this.interviews.runtimeOwner)
    let invoked=false
    try {
    const claim=await repo.locked(id,async(tx,row)=>{
      const job=(await tx.select().from(aiInterviewEvaluations).where(and(eq(aiInterviewEvaluations.interviewId,id),eq(aiInterviewEvaluations.reportVersion,reportVersion))).for('update'))[0]
      const storage=reportStorage(job?.results),now=this.interviews.clock.now()
      if(!job||!['PENDING','RUNNING'].includes(job.status))return null
      if(!storage){
        if((job.results as {format?:unknown}|null)?.format==='phase4-report-v1'){
          const previous=row.version;this.changed(row,'FAILED')
          await tx.update(aiInterviewEvaluations).set({status:'FAILED',failureCode:'EVALUATION_INPUT_INVALID',updatedAt:new Date(now)}).where(eq(aiInterviewEvaluations.id,job.id))
          await interviewAudit(tx,row,`job:${job.id}:invalid`,'EVALUATION_FAILED','system',now,{evaluationId:job.id,reportVersion,failureCode:'EVALUATION_INPUT_INVALID'})
          await repo.save(tx,row,previous)
        }
        return null
      }
      const last=storage.attempts.at(-1)
      const restarted=!!last?.ownerId&&last.ownerId!==this.interviews.runtimeOwner
      const leaseExpired=!last||now-Date.parse(last.startedAt)>=LEGACY_EVALUATION_LEASE_MS
      const deadlineExpired=!!last?.deadlineAt&&now>=Date.parse(last.deadlineAt)
      if(job.status==='RUNNING'&&!restarted&&!leaseExpired&&!deadlineExpired)return null
      if(storage.input.evaluatorVersion==='llm-report-v1'&&(!storage.input.provider||canonicalJson(storage.input.provider)!==canonicalJson(this.evaluator.providerSnapshot)||storage.attempts.length>=storage.input.provider.maxAttempts)){
        const failureCode=storage.input.provider&&storage.attempts.length>=storage.input.provider.maxAttempts?'EVALUATOR_RETRY_EXHAUSTED':'EVALUATOR_CONFIGURATION_CHANGED',previous=row.version
        if(last&&!last.finishedAt){last.finishedAt=new Date(now).toISOString();last.failureCode=failureCode}
        this.changed(row,'FAILED');await tx.update(aiInterviewEvaluations).set({status:'FAILED',results:storage,failureCode,updatedAt:new Date(now)}).where(eq(aiInterviewEvaluations.id,job.id))
        await interviewAudit(tx,row,`job:${job.id}:admission`,'EVALUATION_FAILED','system',now,{evaluationId:job.id,reportVersion,failureCode});await repo.save(tx,row,previous);return null
      }
      if(restarted)await interviewAudit(tx,row,`job:${job.id}:recovery`,'RUNTIME_RECOVERY_STARTED','system',now,{evaluationId:job.id,reportVersion})
      if(last&&!last.finishedAt){last.finishedAt=new Date(now).toISOString();last.failureCode=restarted?'WORKER_RESTARTED':leaseExpired?'WORKER_LEASE_EXPIRED':'EVALUATOR_TIMEOUT'}
      const executionId=randomUUID()
      storage.attempts.push({attempt:storage.attempts.length+1,startedAt:new Date(now).toISOString(),finishedAt:null,failureCode:null,
        ownerId:this.interviews.runtimeOwner,executionId,deadlineAt:new Date(now+Math.min(this.timeoutMs,storage.input.provider?.timeoutMs??this.timeoutMs)).toISOString(),inputHash:job.inputHash})
      const previous=row.version;this.changed(row,'RUNNING')
      await tx.update(aiInterviewEvaluations).set({status:'RUNNING',results:storage,updatedAt:new Date(now)}).where(eq(aiInterviewEvaluations.id,job.id))
      await interviewAudit(tx,row,`job:${job.id}:${storage.attempts.length}`,'EVALUATION_RUNNING','system',now,{evaluationId:job.id,reportVersion,attempt:storage.attempts.length})
      if(restarted)await interviewAudit(tx,row,`job:${job.id}:recovery`,'RUNTIME_RECOVERY_COMPLETED','system',now,{evaluationId:job.id,reportVersion,attempt:storage.attempts.length})
      await repo.save(tx,row,previous)
      return {job,storage,attempt:storage.attempts.length,executionId,inputValid:job.inputHash===reportInputHash(storage.input)&&(storage.attempts.find(a=>a.inputHash)?.inputHash??job.inputHash)===job.inputHash}
    })
    if(!claim)return
    const metadata={interviewId:id,evaluationId:claim.job.id,reportVersion,attempt:claim.attempt}
    diagnose(this.diagnostic,{event:'evaluation_attempt_started',...metadata})
    const identity={evaluationId:claim.job.id,reportVersion,generatedAt:new Date(this.interviews.clock.now()).toISOString()}
    let report: AiInterviewReportStorage['report']=null, failureCode:string|null=null
    if(!claim.inputValid)failureCode='EVALUATION_INPUT_CHANGED'
    else if(!slot){failureCode='EVALUATOR_CAPACITY_EXHAUSTED';diagnose(this.diagnostic,{event:'evaluation_capacity_exhausted',...metadata})}
    else {
      invoked=true
      const output=await boundedEvaluation(slot,signal=>this.evaluator.evaluateReport(structuredClone(claim.storage.input),identity,{signal}),Math.min(this.timeoutMs,claim.storage.input.provider?.timeoutMs??this.timeoutMs),this.scheduleTimeout,
        ()=>diagnose(this.diagnostic,{event:'evaluation_attempt_fenced',...metadata,code:'LATE_SETTLEMENT'}))
      failureCode=output.failureCode
      if(claim.storage.input.provider&&failureCode==='MOCK_EVALUATOR_FAILED')failureCode='EVALUATOR_PROVIDER_FAILED'
      if(!failureCode)try{report=verifyInterviewReport(output.value,claim.storage.input,identity)}catch{failureCode='EVIDENCE_VALIDATION_FAILED'}
    }
    const committed=await repo.locked(id,async(tx,row)=>{
      const job=(await tx.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.id,claim.job.id)).for('update'))[0]!
      const storage=reportStorage(job.results)
      const attempt=storage?.attempts.at(-1)
      if(job.status!=='RUNNING'||!storage||storage.attempts.length!==claim.attempt||attempt?.executionId!==claim.executionId||attempt.ownerId!==this.interviews.runtimeOwner)return false
      if(job.inputHash!==claim.job.inputHash||job.inputHash!==reportInputHash(storage.input)){failureCode='EVALUATION_INPUT_CHANGED';report=null}
      if(!failureCode&&attempt.deadlineAt&&this.interviews.clock.now()>=Date.parse(attempt.deadlineAt)){failureCode='EVALUATOR_TIMEOUT';report=null}
      storage.report=report;storage.attempts.at(-1)!.finishedAt=new Date(this.interviews.clock.now()).toISOString();storage.attempts.at(-1)!.failureCode=failureCode
      const status=report?'COMPLETED':'FAILED',previous=row.version;this.changed(row,status)
      await tx.update(aiInterviewEvaluations).set({status,results:storage,failureCode,completedAt:report?new Date(this.interviews.clock.now()):null,updatedAt:new Date(this.interviews.clock.now())}).where(eq(aiInterviewEvaluations.id,job.id))
      if(failureCode==='EVALUATOR_TIMEOUT')await interviewAudit(tx,row,`job:${job.id}:${claim.attempt}:timeout`,'EVALUATION_ATTEMPT_TIMED_OUT','system',this.interviews.clock.now(),{evaluationId:job.id,reportVersion,attempt:claim.attempt,failureCode})
      await interviewAudit(tx,row,`job:${job.id}:${claim.attempt}`,report?'EVALUATION_COMPLETED':'EVALUATION_FAILED','system',this.interviews.clock.now(),{evaluationId:job.id,reportVersion,attempt:claim.attempt,...(failureCode?{failureCode}:{})})
      await repo.save(tx,row,previous)
      return true
    })
    diagnose(this.diagnostic,{event:!committed?'evaluation_attempt_fenced':failureCode==='EVALUATOR_TIMEOUT'?'evaluation_attempt_timed_out':report?'evaluation_attempt_completed':'evaluation_attempt_failed',...metadata,...(failureCode?{code:failureCode}:{})})
    } finally { if(!invoked)slot?.release() }
  }
  async get(principal:InterviewPrincipal,id:string,applicationId:string,version?:number){
    const result = await this.interviews.repository.locked(id,async(tx,row)=>{
      await this.scope(tx,row,principal,applicationId)
      const jobs=await tx.select().from(aiInterviewEvaluations).where(eq(aiInterviewEvaluations.interviewId,id)).orderBy(asc(aiInterviewEvaluations.reportVersion))
      const selected=version?jobs.find(j=>j.reportVersion===version):jobs.at(-1)
      if(!selected)throw new InterviewServiceError(404,'evaluationNotFound')
      const storage=reportStorage(selected.results)
      const context=(await tx.select({candidateName:candidates.fullName,roleTitle:jobOpenings.titleEn}).from(applications).innerJoin(candidates,eq(candidates.id,applications.candidateId)).innerJoin(jobOpenings,eq(jobOpenings.id,applications.openingId)).where(eq(applications.id,applicationId)))[0]
      return {interviewId:id,applicationId,candidateName:context?.candidateName??'',roleTitle:context?.roleTitle??'',interviewStatus:row.snapshot.status,version:row.version,availableEvaluatorVersion:this.evaluator.providerSnapshot?'llm-report-v1':null,
        versions:jobs.map(j=>({reportVersion:j.reportVersion,status:j.status,evaluatorVersion:j.evaluatorVersion})),
        evaluation:{evaluationId:selected.id,reportVersion:selected.reportVersion,status:selected.status,inputHash:selected.inputHash,evaluatorVersion:selected.evaluatorVersion,rubricVersion:selected.rubricVersion,failureCode:selected.failureCode,retryCount:selected.retryCount,
          report:storage?.report??null,humanReview:storage?.review??unreviewed(),attempts:storage?.attempts??[]},
        trace:storage?.input.answers.map(r=>({sequence:r.sequence,answer:r.answer,question:storage.input.questions.find(q=>q.questionId===r.answer.questionId)}))??[],
        frozenWeights:storage?.input.frozen.weights??row.frozenInputs?.weights??[],rubric:storage?.input.frozen.rubric??row.frozenInputs?.rubric}
    })
    interviewOperations.record({event:'report_accessed',interviewId:id,evaluationId:result.evaluation.evaluationId,reportVersion:result.evaluation.reportVersion,...(principal.kind==='staff'?{actorId:principal.userId}:{})})
    return result
  }
  async review(principal:InterviewPrincipal,id:string,applicationId:string,reportVersion:number,value:unknown){
    const body=reviewInterviewReportSchema.parse(value),repo=this.interviews.repository
    return repo.locked(id,async(tx,row)=>{
      await this.scope(tx,row,principal,applicationId)
      const fingerprint=createHash('sha256').update(canonicalJson({actor:principal,applicationId,reportVersion,body})).digest('hex'),receipt=await repo.receipt(tx,id,body.commandId)
      if(receipt){if(receipt.payload.fingerprint!==fingerprint)throw new InterviewServiceError(409,'interviewCommandConflict');return {duplicate:true}}
      if(row.version!==body.expectedVersion)throw new InterviewServiceError(409,'interviewVersionConflict')
      const job=(await tx.select().from(aiInterviewEvaluations).where(and(eq(aiInterviewEvaluations.interviewId,id),eq(aiInterviewEvaluations.reportVersion,reportVersion))).for('update'))[0],storage=reportStorage(job?.results)
      if(!job||job.status!=='COMPLETED'||!storage?.report)throw new InterviewServiceError(409,'evaluationNotCompleted')
      storage.review={status:body.status,reviewedBy:body.status==='REVIEWED'&&principal.kind==='staff'?principal.userId:null,reviewedAt:body.status==='REVIEWED'?new Date(this.interviews.clock.now()).toISOString():null,note:body.note}
      await tx.update(aiInterviewEvaluations).set({results:storage,updatedAt:new Date(this.interviews.clock.now())}).where(eq(aiInterviewEvaluations.id,job.id))
      const previous=row.version;row.snapshot.version++;row.version=row.snapshot.version
      await interviewAudit(tx,row,body.commandId,'REPORT_REVIEWED',`staff:${principal.kind==='staff'?principal.userId:''}`,this.interviews.clock.now(),{evaluationId:job.id,reportVersion,reviewStatus:body.status})
      await tx.insert(aiInterviewEvents).values({interviewId:id,sequence:++row.lastSequence,recordType:'COMMAND',eventType:'REPORT_REVIEW_COMMITTED',eventId:`receipt:${row.lastSequence}`,commandId:body.commandId,stateVersion:row.version,source:'staff',actorId:principal.kind==='staff'?principal.userId:null,payload:{fingerprint},createdAt:new Date(this.interviews.clock.now())})
      await repo.save(tx,row,previous);return {duplicate:false}
    })
  }
}
