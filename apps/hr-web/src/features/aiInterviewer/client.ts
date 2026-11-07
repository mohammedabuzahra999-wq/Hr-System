import { candidateAiInterviewUiStateSchema, aiInterviewReplayPageSchema, aiInterviewAnswerResultSchema, type SubmitAiInterviewAnswer, type CandidateAiInterviewUiState, type AiInterviewReplayPage } from '@hr/shared'
import { candidateAudioResultSchema, type BeginCandidateAudio, type CandidateAudioStatusRequest, type CandidateAudioUploadRequest } from '@hr/shared'
import { playbackResultSchema, validPlaybackWav } from '@hr/shared'

export class InterviewRequestError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}
/** Candidate-only paths and cookie; no employee auth redirect, token header or storage. */
export class CandidateInterviewClient {
  private fetcher: typeof fetch
  private base: string
  constructor(fetcher: typeof fetch = globalThis.fetch.bind(globalThis), base = `${import.meta.env.VITE_API_URL ?? '/api'}/ai-interview`) { this.fetcher = fetcher; this.base = base }
  private async request(path: string, body?: unknown, timeoutMs?: number): Promise<unknown> {
    let response: Response
    try {
      const send = this.fetcher
      response = await send(`${this.base}${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include',
        ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
        cache: 'no-store', referrerPolicy: 'no-referrer', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
    } catch { throw new InterviewRequestError(0, 'networkUnavailable') }
    const value = await response.json().catch(() => null)
    if (!response.ok) throw new InterviewRequestError(response.status, typeof value?.error === 'string' ? value.error : 'requestFailed')
    return value
  }
  exchange(token: string) { return this.request('/session/exchange', { token }) as Promise<{ interviewId: string }> }
  config() { return this.request('/config') as Promise<{ mockControlsEnabled: boolean; audioCaptureEnabled?: boolean; playbackEnabled?: boolean;modelEnabled?:boolean }> }
  async modelStatus(interviewId:string){const r=await this.request(`/orchestration/status?interviewId=${encodeURIComponent(interviewId)}`) as {status?:unknown};if(!['IDLE','PROCESSING','RETRYING','RECOVERY_REQUIRED'].includes(String(r.status)))throw new InterviewRequestError(0,'requestFailed');return r.status as 'IDLE'|'PROCESSING'|'RETRYING'|'RECOVERY_REQUIRED'}
  async playback(action:'prepare'|'status'|'start'|'pulse'|'end'|'stop'|'cancel',body:unknown){return playbackResultSchema.parse(await this.request(`/playback/${action}`,body,25000))}
  async playbackAudio(body:unknown,signal:AbortSignal){
    let response:Response
    try{response=await this.fetcher(`${this.base}/playback/audio`,{method:'POST',credentials:'include',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})}catch{throw new InterviewRequestError(0,'networkUnavailable')}
    if(!response.ok)throw new InterviewRequestError(response.status,'playbackUnavailable')
    if(response.headers.get('content-type')!=='audio/wav'||Number(response.headers.get('content-length'))>2000000||!response.body)throw Error('playbackInvalid')
    const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0
    try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2000000)throw Error('playbackInvalid');parts.push(value)}}catch(error){void reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
    const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
    if(!validPlaybackWav(bytes))throw Error('playbackInvalid')
    return new Blob([bytes],{type:'audio/wav'})
  }
  async audio(action: 'begin' | 'status' | 'cancel', body: BeginCandidateAudio | CandidateAudioStatusRequest) {return candidateAudioResultSchema.parse(await this.request(`/audio/${action}`, body, 25000))}
  async audioUpload(body: CandidateAudioUploadRequest, blob: Blob, signal: AbortSignal) {
    let response: Response
    try {response = await this.fetcher(`${this.base}/audio/upload?${new URLSearchParams(body)}`, {method: 'POST', credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: {'Content-Type': 'audio/wav'}, body: blob, signal: AbortSignal.any([signal, AbortSignal.timeout(25000)])})} catch {throw new InterviewRequestError(0, 'networkUnavailable')}
    const value = await response.json().catch(() => null)
    if (!response.ok) throw new InterviewRequestError(response.status, typeof value?.error === 'string' ? value.error : 'requestFailed')
    return candidateAudioResultSchema.parse(value)
  }
  async state(id?: string): Promise<CandidateAiInterviewUiState> {
    return candidateAiInterviewUiStateSchema.parse(await this.request(`/state${id ? `?interviewId=${encodeURIComponent(id)}` : ''}`))
  }
  async events(id: string, after: number): Promise<AiInterviewReplayPage> {
    return aiInterviewReplayPageSchema.parse(await this.request(`/events?interviewId=${encodeURIComponent(id)}&afterSequence=${after}`))
  }
  async action(path: '/commands' | '/dev/mock', body: unknown) {
    const value = await this.request(path, body) as { duplicate: boolean; state: unknown }
    return { duplicate: value.duplicate, state: candidateAiInterviewUiStateSchema.parse(value.state) }
  }
  async answer(action: 'submit' | 'status', body: SubmitAiInterviewAnswer) {
    return aiInterviewAnswerResultSchema.parse(await this.request(`/answers/${action}`, body, 15000))
  }
}
