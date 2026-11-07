import type { CandidateAiInterviewUiState, PlaybackAction, PlaybackResult, PlaybackScope, PreparePlayback } from '@hr/shared'
import { CandidateInterviewClient, InterviewRequestError } from './client'

export type PlaybackView={phase:'IDLE'|'GENERATING'|'READY'|'PLAYING'|'STOPPED'|'COMPLETED'|'ERROR';reason:string|null;busy:boolean}
export class CandidatePlayback {
  private state?:CandidateAiInterviewUiState
  private scope?:PlaybackScope
  private result?:PlaybackResult
  private request?:PreparePlayback
  private documentId=crypto.randomUUID()
  private epoch=0
  private media?:HTMLAudioElement
  private url?:string
  private abort?:AbortController
  private poll?:ReturnType<typeof setInterval>
  private watch?:ReturnType<typeof setInterval>
  private watchdog?:ReturnType<typeof setTimeout>
  private working=false
  private checking=false
  private ended=false
  private enabled=false
  private view:PlaybackView={phase:'IDLE',reason:null,busy:false}
  private client:CandidateInterviewClient
  private changed:(view:PlaybackView)=>void
  private receive:(state:CandidateAiInterviewUiState)=>void
  private denied:(error:unknown)=>void
  private audioFactory:()=>HTMLAudioElement
  constructor(client:CandidateInterviewClient,changed:(view:PlaybackView)=>void,receive:(state:CandidateAiInterviewUiState)=>void,denied:(error:unknown)=>void,audioFactory=()=>new Audio()){this.client=client;this.changed=changed;this.receive=receive;this.denied=denied;this.audioFactory=audioFactory}
  getSnapshot(){return this.view}
  private update(value:Partial<PlaybackView>){this.view={...this.view,...value};this.changed(this.view)}
  private body():PlaybackAction{if(!this.scope||!this.result?.generationId)throw Error('playbackUnavailable');return {...this.scope,generationId:this.result.generationId,documentId:this.documentId}}
  private release(){if(this.poll)clearInterval(this.poll);if(this.watch)clearInterval(this.watch);clearTimeout(this.watchdog);this.poll=this.watch=undefined;this.abort?.abort();this.abort=undefined;if(this.media){this.media.onended=this.media.onerror=null;this.media.pause();this.media.removeAttribute('src');this.media.load();this.media=undefined}if(this.url)URL.revokeObjectURL(this.url);this.url=undefined}
  private apply(result:PlaybackResult){this.result=result;const phase=result.status==='NONE'?'IDLE':result.status==='CLOSED'?'STOPPED':result.status;this.update({phase,reason:result.status==='CLOSED'?'playbackClosed':null,busy:false});if(result.status!=='GENERATING'&&this.watch){clearInterval(this.watch);this.watch=undefined}if(result.status==='GENERATING'&&!this.watch){const epoch=this.epoch;this.watch=setInterval(()=>{void this.checkGeneration(epoch)},1500)}if(['STOPPED','COMPLETED','ERROR','CLOSED'].includes(result.status))this.release();this.receive(result.state)}
  private async checkGeneration(epoch:number){if(epoch!==this.epoch||!this.scope||this.checking)return;this.checking=true;try{const r=await this.client.playback('status',{...this.scope,documentId:this.documentId});if(epoch===this.epoch)this.apply(r)}catch(error){if(epoch===this.epoch)this.failure(error)}finally{if(epoch===this.epoch)this.checking=false}}
  async observe(state:CandidateAiInterviewUiState,enabled:boolean){
    this.state=state;this.enabled=enabled;if(!enabled)return
    if(!state.answerRecovery||!state.delivery||state.status!=='ACTIVE'){if(this.scope)this.detach();this.update({phase:state.status==='COMPLETED'?'COMPLETED':'STOPPED',busy:false});return}
    const scope:PlaybackScope={interviewId:state.interviewId,sessionVersion:state.answerRecovery.sessionVersion,playbackId:state.delivery.id,questionId:state.currentQuestion?.id??null,turnId:state.currentTurnId}
    if(JSON.stringify(scope)===JSON.stringify(this.scope))return
    this.detach();this.scope=scope;this.state=state;const epoch=this.epoch
    this.update({phase:'IDLE',reason:null,busy:true})
    try{const r=await this.client.playback('status',{...scope,documentId:this.documentId});if(epoch===this.epoch)this.apply(r)}catch(error){if(epoch===this.epoch)this.failure(error)}
  }
  private failure(error:unknown){this.release();if(error instanceof InterviewRequestError&&[401,403].includes(error.status)){this.detach();this.denied(error)}else this.update({phase:'ERROR',reason:error instanceof DOMException&&error.name==='NotAllowedError'?'autoplayBlocked':'playbackFailed',busy:false})}
  async prepare(){
    if(!this.scope||!this.state||this.working||!this.enabled||!['IDLE','ERROR'].includes(this.view.phase))return
    this.working=true;const epoch=this.epoch
    this.result=undefined
    this.request={...this.scope,requestId:crypto.randomUUID(),expectedVersion:this.state.version};this.update({phase:'GENERATING',reason:null,busy:true})
    try{const result=await this.client.playback('prepare',this.request);if(epoch===this.epoch)this.apply(result)}catch(error){if(epoch===this.epoch)this.failure(error)}finally{if(epoch===this.epoch)this.working=false}
  }
  async play(){
    if(this.view.phase!=='READY'||this.working)return
    this.working=true;const epoch=this.epoch;this.abort=new AbortController();this.update({busy:true,reason:null})
    try{
      const body=this.body(),blob=await this.client.playbackAudio(body,this.abort.signal)
      if(epoch!==this.epoch)return
      const result=await this.client.playback('start',body)
      if(epoch!==this.epoch)return
      if(result.status!=='PLAYING')throw Error('playbackClosed')
      this.result=result;this.receive(result.state)
      if(epoch!==this.epoch)return
      this.url=URL.createObjectURL(blob);const media=this.audioFactory();this.media=media;media.src=this.url;this.ended=false
      media.onended=()=>{if(epoch!==this.epoch)return;this.ended=true;void this.pulse(epoch)}
      media.onerror=()=>{if(epoch===this.epoch)void this.stop('playbackFailed')}
      this.poll=setInterval(()=>{void this.pulse(epoch)},1500)
      this.watchdog=setTimeout(()=>{if(epoch===this.epoch)void this.stop('playbackFailed')},result.durationMs+10000)
      let timer:ReturnType<typeof setTimeout>|undefined
      try{await Promise.race([media.play(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('playbackStartTimeout')),5000)})])}finally{clearTimeout(timer)}
      if(epoch===this.epoch)this.update({phase:'PLAYING',busy:false})
    }catch(error){if(epoch===this.epoch){const reason=error instanceof DOMException&&error.name==='NotAllowedError'?'autoplayBlocked':'playbackFailed';await this.stop(reason)}}finally{if(epoch===this.epoch)this.working=false}
  }
  private pulsing=false
  private async pulse(epoch:number){
    if(this.pulsing||epoch!==this.epoch||this.result?.status!=='PLAYING')return
    this.pulsing=true
    try{const result=await this.client.playback(this.ended?'end':'pulse',this.body());if(epoch===this.epoch)this.apply(result)}catch(error){if(epoch===this.epoch){if(error instanceof InterviewRequestError&&error.code==='playbackTooEarly')return;this.failure(error)}}finally{if(epoch===this.epoch)this.pulsing=false}
  }
  async stop(reason:string|null=null){
    const request=this.request,body=this.result?.generationId?this.body():undefined;this.epoch++;this.release();this.working=this.pulsing=false;this.update({phase:'STOPPED',reason:'stopping',busy:true})
    const epoch=this.epoch
    try{const result=body?await this.client.playback('stop',body):request?await this.client.playback('cancel',request):null;if(epoch===this.epoch){if(result)this.apply(result);this.update({phase:reason?'ERROR':'STOPPED',reason,busy:false})}}catch(error){if(epoch===this.epoch)this.failure(error)}
  }
  async retry(){
    if(!this.scope)return
    const epoch=this.epoch;this.update({busy:true})
    try{const result=await this.client.playback('status',{...this.scope,documentId:this.documentId});if(epoch!==this.epoch)return;if(result.status==='PLAYING'&&!this.media&&!this.ended){this.result=result;await this.stop('playbackFailed');return}this.apply(result);if(result.status==='NONE'||result.status==='ERROR')await this.prepare();else if(result.status==='PLAYING'&&this.ended)await this.pulse(epoch)}catch(error){if(epoch===this.epoch)this.failure(error)}
  }
  detach(){
    const request=this.result ? undefined : this.request,body=this.scope&&this.result?.generationId&&['GENERATING','READY','PLAYING'].includes(this.result.status)?this.body():undefined
    this.epoch++;this.release();this.scope=undefined;this.result=undefined;this.request=undefined;this.working=this.pulsing=this.checking=false
    if(body)void this.client.playback('stop',body).catch(()=>{});else if(request&&!this.result)void this.client.playback('cancel',request).catch(()=>{})
  }
}
