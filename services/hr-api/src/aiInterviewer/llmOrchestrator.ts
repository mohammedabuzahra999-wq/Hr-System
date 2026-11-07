import { sql } from 'drizzle-orm'
import { aiInterviews } from '../db/schema.js'
import type { InterviewService } from './service.js'
import { InterviewServiceError } from './repository.js'
import { InterviewLlmError,type InterviewLlmProvider,type LlmJob } from './llmContracts.js'
export class InterviewLlmOrchestrator {
  private closed=false
  private pass?:Promise<void>
  private calls=new Set<AbortController>()
  private jobs=new Map<string,Promise<void>>()
  private contexts=new Map<AbortController,{id:string;job:LlmJob}>()
  private cursor:string|undefined
  private claiming=0
  private interval?:ReturnType<typeof setInterval>
  constructor(readonly service:InterviewService,private readonly provider:InterviewLlmProvider,readonly timeoutMs=15000){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('modelTimeoutInvalid')}
  get physicalCalls(){return this.calls.size}
  get activeJobs(){return this.jobs.size}
  start(){if(!this.service.llm.enabled||this.interval)return;this.interval=setInterval(()=>{void this.tick()},1000);this.interval.unref();void this.tick()}
  tick():Promise<void>{
    if(this.closed||!this.service.llm.enabled)return Promise.resolve()
    if(this.pass)return this.pass
    this.pass=(async()=>{
      for(const [c,context]of this.contexts)if(!await this.service.currentModelAttempt(context.id,context.job).catch(()=>false))c.abort()
      if(this.calls.size+this.claiming>=2||this.jobs.size>=2)return
      const rows=await this.service.repository.database.select({id:aiInterviews.id}).from(aiInterviews).where(sql`((${aiInterviews.snapshot}->>'status'='ACTIVE' AND ${aiInterviews.snapshot}->>'phase'='PROCESSING') OR (${aiInterviews.snapshot}->>'status'='CREATED' AND (SELECT payload->>'status' FROM ai_interview_events WHERE interview_id=${aiInterviews.id} AND event_type='MODEL_JOB_STATUS' ORDER BY sequence DESC LIMIT 1) IN ('QUEUED','RUNNING','FAILED'))) AND ${this.cursor?sql`${aiInterviews.id}>${this.cursor}`:sql`true`}`).orderBy(aiInterviews.id).limit(64)
      if(!rows.length){this.cursor=undefined;return}
      for(let n=0;n<rows.length&&this.calls.size+this.claiming<2&&this.jobs.size<2;n++){
        const id=rows[n]!.id;this.cursor=id;if(this.jobs.has(id))continue
        const work=this.run(id).catch(()=>{}).finally(()=>{this.jobs.delete(id)});this.jobs.set(id,work)
      }
    })().catch(()=>{}).finally(()=>{this.pass=undefined})
    return this.pass
  }
  async run(id:string){
    if(this.closed||this.calls.size+this.claiming>=2)return
    this.claiming++;let claim:Awaited<ReturnType<InterviewService['claimModelJob']>>
    try{claim=await this.service.claimModelJob(id,this.timeoutMs)}finally{this.claiming--}
    if(!claim)return
    const {job,input}=claim,controller=new AbortController();this.calls.add(controller)
    this.contexts.set(controller,{id,job})
    const deadline=Date.now()+this.timeoutMs
    try{
      const output=await new Promise<unknown>((resolve,reject)=>{
        let settled=false
        const finish=(v?:unknown,e?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);controller.signal.removeEventListener('abort',abort);if(e){controller.abort();reject(e)}else resolve(v)}
        const abort=()=>finish(undefined,new InterviewLlmError('modelCancelled')),timer=setTimeout(()=>finish(undefined,new InterviewLlmError('modelTimeout')),this.timeoutMs)
        controller.signal.addEventListener('abort',abort,{once:true})
        Promise.resolve().then(()=>{if(controller.signal.aborted||this.closed)throw new InterviewLlmError('modelCancelled');return this.provider.generate(structuredClone(input),controller.signal)}).then(v=>{this.calls.delete(controller);this.contexts.delete(controller);finish(v)},e=>{this.calls.delete(controller);this.contexts.delete(controller);finish(undefined,e instanceof InterviewLlmError?e:new InterviewLlmError('modelUnavailable'))})
      })
      if(this.closed||Date.now()>=deadline)throw new InterviewLlmError('modelTimeout')
      await this.service.finishModelJob(id,job,output)
    }catch(error){await this.failure(id,job,error)}
  }
  cancel(id:string){for(const [c,context]of this.contexts)if(context.id===id)c.abort()}
  private failure(id:string,job:LlmJob,error:unknown){
    const invalid=error instanceof InterviewLlmError&&error.code==='modelInvalid'||error instanceof InterviewServiceError&&error.status===422||error instanceof Error&&error.name==='ZodError'
    const timeout=error instanceof InterviewLlmError&&error.code==='modelTimeout'
    return this.service.failModelJob(id,job,invalid?'MODEL_INVALID':timeout?'MODEL_TIMEOUT':this.closed?'MODEL_CANCELLED':'MODEL_UNAVAILABLE',!invalid).catch(()=>{})
  }
  async close(){this.closed=true;if(this.interval)clearInterval(this.interval);for(const c of this.calls)c.abort();await Promise.allSettled([this.pass,...this.jobs.values()].filter((p):p is Promise<void>=>!!p))}
}
