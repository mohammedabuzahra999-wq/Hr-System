import { createHash } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { playbackActionSchema, preparePlaybackSchema, validPlaybackWav } from '@hr/shared'
import type { InterviewPrincipal } from './authorization.js'
import type { InterviewService } from './service.js'
import type { TextToSpeechProvider } from './speechContracts.js'
import type { PlaybackRecord } from './playbackContracts.js'

/** Bounded complete WAV downlink. Browser observations never become provider receipts. */
export class CandidateTtsDelivery {
  private closed=false
  private calls=new Map<string,{controller:AbortController;record:PlaybackRecord}>()
  private cache=new Map<string,{bytes:Uint8Array;record:PlaybackRecord}>()
  private timer:ReturnType<typeof setInterval>
  private ticking=false
  private admissions=0
  constructor(readonly service:InterviewService,private readonly tts:TextToSpeechProvider,readonly timeoutMs=15000){
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('playbackTimeoutInvalid')
    this.timer=setInterval(()=>{void this.expire()},1000);this.timer.unref()
  }
  get physicalCalls(){return this.calls.size}
  get cachedAudio(){return this.cache.size}
  private available(){if(this.closed)throw new HTTPException(503,{message:'playbackUnavailable'})}
  async prepare(principal:InterviewPrincipal,input:unknown){
    this.available()
    // Authenticate before revealing capacity/configuration or accepting provider work.
    const body=preparePlaybackSchema.parse(input)
    await this.service.load(principal,body.interviewId)
    if(this.calls.size+this.admissions>=2||this.cache.size+this.calls.size+this.admissions>=8)throw new HTTPException(429,{message:'playbackCapacity'})
    this.admissions++
    let claim:Awaited<ReturnType<InterviewService['preparePlayback']>>
    try{claim=await this.service.preparePlayback(principal,body)}finally{this.admissions--}
    if(!claim.record||claim.text===null)return claim.result
    const record=claim.record,controller=new AbortController(),deadline=Date.now()+this.timeoutMs;this.calls.set(record.generationId,{controller,record})
    try{
      const speech=await new Promise<Awaited<ReturnType<TextToSpeechProvider['synthesize']>>>((resolve,reject)=>{
        let settled=false
        const finish=(value?:Awaited<ReturnType<TextToSpeechProvider['synthesize']>>,error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);controller.signal.removeEventListener('abort',abort);if(error){controller.abort();reject(error)}else resolve(value!)}
        const abort=()=>finish(undefined,Error('playbackUnavailable')),timer=setTimeout(()=>finish(undefined,Error('playbackTimeout')),this.timeoutMs)
        controller.signal.addEventListener('abort',abort,{once:true})
        Promise.resolve().then(()=>{if(this.closed||controller.signal.aborted)throw Error();return this.tts.synthesize({text:claim.text!},controller.signal)}).then(v=>{this.calls.delete(record.generationId);finish(v)},()=>{this.calls.delete(record.generationId);finish(undefined,Error('playbackProviderFailed'))})
      })
      if(Date.now()>=deadline)throw Error('playbackTimeout')
      if(this.closed||!speech||Object.keys(speech).some(k=>!['bytes','mimeType'].includes(k))||speech.mimeType!=='audio/wav'||!validPlaybackWav(speech.bytes))throw Error('playbackInvalid')
      const bytes=Uint8Array.from(speech.bytes),hash=createHash('sha256').update(bytes).digest('hex')
      const result=await this.service.readyPlayback(principal,record,(bytes.length-44)/32,hash)
      if(this.closed||controller.signal.aborted)throw Error('playbackUnavailable')
      this.cache.set(record.generationId,{bytes,record});return result
    }catch(error){await this.service.playbackFailure(record.interviewId,record.generationId).catch(()=>{});throw new HTTPException(503,{message:error instanceof Error&&error.message==='playbackTimeout'?'playbackTimeout':'playbackUnavailable'})}
  }
  status(principal:InterviewPrincipal,input:unknown){return this.service.inspectPlayback(principal,input)}
  async cancel(principal:InterviewPrincipal,input:unknown){const result=await this.service.cancelPlaybackRequest(principal,input);if(result.generationId){this.calls.get(result.generationId)?.controller.abort();this.cache.delete(result.generationId)}return result}
  async action(principal:InterviewPrincipal,action:'start'|'pulse'|'end'|'stop',input:unknown){
    if(action!=='stop')this.available()
    const body=playbackActionSchema.parse(input),result=await this.service.playbackAction(principal,action,body)
    if(['STOPPED','COMPLETED'].includes(result.status)){this.calls.get(body.generationId)?.controller.abort();this.cache.delete(body.generationId)}
    return result
  }
  async audio(principal:InterviewPrincipal,input:unknown){
    this.available();const body=playbackActionSchema.parse(input)
    await this.service.playbackAction(principal,'audio',body)
    const value=this.cache.get(body.generationId)
    if(!value){await this.service.playbackFailure(body.interviewId,body.generationId);throw new HTTPException(503,{message:'playbackAudioUnavailable'})}
    return value.bytes.slice()
  }
  private async expire(){
    if(this.ticking||this.closed)return;this.ticking=true
    try{for(const [id,c]of this.cache){const result=await this.service.expirePlayback(c.record.interviewId,id).catch(()=>null);if(result||c.record.expiresAt<=this.service.clock.now())this.cache.delete(id)}}finally{this.ticking=false}
  }
  async close(){this.closed=true;clearInterval(this.timer);for(const call of this.calls.values())call.controller.abort();await Promise.allSettled([...this.cache.values(),...this.calls.values()].map(c=>this.service.invalidatePlayback(c.record.interviewId,c.record.generationId)));this.cache.clear()}
}
