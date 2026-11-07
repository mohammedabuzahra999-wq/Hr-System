import { z } from 'zod'
import { beginCandidateAudioSchema, CANDIDATE_AUDIO_MAX_BYTES, type BeginCandidateAudio, type CandidateAiInterviewUiState, type CandidateAudioResult } from '@hr/shared'
import { CandidateInterviewClient, InterviewRequestError } from './client'
import { CandidateMicrophone, MicrophoneError } from './microphone'

const localSchema = z.object({version: z.literal(1), begin: beginCandidateAudioSchema, generationId: z.uuid().nullable(), expiresAt: z.number(), blobExpiresAt: z.number(),
  maxDurationMs: z.number(), blob: z.instanceof(Blob).nullable(), expired: z.boolean()}).strict()
type LocalAudio = z.infer<typeof localSchema>
type AudioStoreKey = Pick<BeginCandidateAudio,'interviewId'|'sessionVersion'|'submissionId'>
export type AudioView = {phase: 'CHECKING' | 'IDLE' | 'PERMISSION' | 'RECORDING' | 'READY' | 'UPLOADING' | 'PROCESSING' | 'COMMITTED' | 'RETRY_REQUIRED' | 'FAILED' | 'CLOSED'; reason: string | null; pending: boolean; persisted: boolean}
export interface AudioRecoveryStore {read(): Promise<unknown>; write(value: LocalAudio): Promise<void>; remove(expected?: AudioStoreKey): Promise<void>}
export class IndexedAudioStore implements AudioRecoveryStore {
  private tabKey?: string
  private queue: Promise<unknown> = Promise.resolve()
  private key() {if(this.tabKey)return this.tabKey;const name='hr:ai-audio-tab';let id=sessionStorage.getItem(name);if(!id||!z.uuid().safeParse(id).success){id=crypto.randomUUID();sessionStorage.setItem(name,id)}return this.tabKey=`tab:${id}`}
  private serial<T>(work:()=>Promise<T>) {const task=this.queue.then(work);this.queue=task.catch(()=>{});return task}
  private async open() {return new Promise<IDBDatabase>((resolve, reject) => {let settled=false;const fail=()=>{settled=true;clearTimeout(timer);reject(Error('audioStorage'))},timer=setTimeout(fail,5000),request=indexedDB.open('candidate-interview-audio-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('recovery');request.onsuccess=()=>{clearTimeout(timer);if(settled)request.result.close();else{settled=true;resolve(request.result)}};request.onerror=fail;request.onblocked=fail})}
  private async transaction(write: boolean, action: (store: IDBObjectStore) => IDBRequest) {
    const database = await this.open()
    try {return await new Promise<unknown>((resolve, reject) => {const tx=database.transaction('recovery',write?'readwrite':'readonly'),request=action(tx.objectStore('recovery'));const timer=setTimeout(()=>{try{tx.abort()}catch{}reject(Error('audioStorage'))},5000);tx.oncomplete=()=>{clearTimeout(timer);resolve(request.result)};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(Error('audioStorage'))}})}
    finally {database.close()}
  }
  read() {return this.serial(async()=>{
    await this.transaction(true,store=>{const request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const parsed=localSchema.safeParse(cursor.value);if(!parsed.success||parsed.data.expiresAt<=Date.now())cursor.delete();else if(parsed.data.blob&&parsed.data.blobExpiresAt<=Date.now())cursor.update({...parsed.data,blob:null,expired:true});cursor.continue()};return request})
    return this.transaction(false, store => store.get(this.key()))
  })}
  write(value: LocalAudio) {return this.serial(async()=>{await this.transaction(true,store=>store.put(value,this.key()))})}
  remove(expected?: AudioStoreKey) {return this.serial(async()=>{await this.transaction(true,store=>{const key=this.key(),value=store.get(key);value.onsuccess=()=>{const begin=value.result?.begin;if(!expected||(begin?.interviewId===expected.interviewId&&begin?.sessionVersion===expected.sessionVersion&&begin?.submissionId===expected.submissionId))store.delete(key)};return value})})}
}
const initial = (): AudioView => ({phase: 'CHECKING', reason: null, pending: false, persisted: false})
export class CandidateAudioRecovery {
  private view = initial()
  private state?: CandidateAiInterviewUiState
  private record?: LocalAudio
  private scope?: string
  private generation = 0
  private microphone?: CandidateMicrophone
  private permission?: AbortController
  private request?: AbortController
  private reconciliation?: Promise<void>
  private ending = false
  private sending = false
  private poll?: ReturnType<typeof setInterval>
  private client: CandidateInterviewClient
  private changed: (view: AudioView) => void
  private receive: (state: CandidateAiInterviewUiState) => void
  private denied: (error: unknown) => void
  private store: AudioRecoveryStore
  private now: () => number
  constructor(client: CandidateInterviewClient, changed: (view: AudioView) => void, receive: (state: CandidateAiInterviewUiState) => void,
    denied: (error: unknown) => void, store: AudioRecoveryStore = new IndexedAudioStore(), now = () => Date.now()) {
    this.client = client; this.changed = changed; this.receive = receive; this.denied = denied; this.store = store; this.now = now
  }
  getSnapshot() {return this.view}
  private update(value: Partial<AudioView>) {this.view = {...this.view, ...value}; this.changed(this.view)}
  private clearStored(record?: LocalAudio) {if(record)void this.store.remove(record.begin).catch(() => this.update({reason:'audioCleanup'}))}
  private async persist() {if (!this.record) return; try {await this.store.write(this.record); this.update({persisted: true})} catch {this.update({persisted: false, reason: 'audioStorage'}); throw Error('audioStorage')}}
  async observe(state: CandidateAiInterviewUiState, enabled: boolean) {
    this.state = state
    if (!enabled) return
    const scope = `${state.interviewId}:${state.answerRecovery?.sessionVersion}`
    if (this.record && this.record.blobExpiresAt <= this.now() && this.record.blob) {this.record.blob = null; this.record.expired = true; void this.persist().catch(() => {}); this.update({phase: 'CLOSED', reason: 'audioExpired', pending: true})}
    if (this.record && this.record.expiresAt <= this.now()) {this.expire(); this.update({phase: 'CLOSED', pending: true, reason: 'audioExpired'}); return}
    if (scope !== this.scope) {
      this.detach(); this.scope = scope; this.state = state; const generation = this.generation
      this.record = undefined; this.update({...initial(), pending: true})
      try {
        const raw = await this.store.read()
        if (generation !== this.generation) return
        const parsed = localSchema.safeParse(raw)
        if (parsed.success && `${parsed.data.begin.interviewId}:${parsed.data.begin.sessionVersion}` === scope && parsed.data.expiresAt > this.now() && (!parsed.data.blob || parsed.data.blob.size <= CANDIDATE_AUDIO_MAX_BYTES)) this.record = parsed.data
        else if (raw) await this.store.remove(parsed.success ? parsed.data.begin : undefined)
        if (!this.record) {this.update({phase: 'IDLE', pending: false, persisted: false}); return}
        if (this.record.blobExpiresAt <= this.now()) {this.record.blob = null; this.record.expired = true; await this.persist()}
        this.update({phase: 'RETRY_REQUIRED', pending: true, persisted: true, reason: this.record.blob ? 'checking' : 'microphoneInterrupted'})
        await this.reconcile()
      } catch {if (generation === this.generation) this.update({phase: 'FAILED', reason: 'audioStorage', pending: true, persisted: false})}
      return
    }
    if (this.record && !['PERMISSION', 'RECORDING', 'UPLOADING'].includes(this.view.phase)) void this.reconcile()
    if (this.record && (state.currentTurnId !== this.record.begin.turnId || state.status !== 'ACTIVE') && this.view.phase === 'RECORDING') void this.stop()
  }
  private apply(result: CandidateAudioResult) {
    this.receive(result.state)
    if (!this.record) return
    if (result.generationId) this.record.generationId = result.generationId
    if (result.expiresAt) this.record.blobExpiresAt = Math.min(this.record.blobExpiresAt, this.now() + Math.max(0, result.expiresAt - result.state.serverNow))
    this.record.maxDurationMs = result.maxDurationMs || this.record.maxDurationMs
    if (result.outcome === 'COMMITTED') {
      this.clearStored(this.record); this.record = undefined; this.update({phase: 'COMMITTED', reason: null, pending: false, persisted: false}); return
    }
    if (result.outcome === 'CANCELLED') {this.clearStored(this.record); this.record = undefined; this.update({phase: 'IDLE', pending: false, reason: null, persisted: false}); return}
    if (this.record.expired) {this.update({phase: 'CLOSED', reason: 'audioExpired', pending: true}); return}
    if (result.outcome === 'CLOSED') {this.update({phase: 'CLOSED', reason: 'audioCaptureClosed', pending: true}); return}
    if (result.outcome === 'NOT_FOUND') {
      if (!this.record.generationId && !this.record.blob && result.state.status === 'ACTIVE' && result.state.currentTurnId === this.record.begin.turnId && result.state.currentQuestion?.id === this.record.begin.questionId) this.record.begin.expectedVersion = result.state.version
      else {this.update({phase:'CLOSED',reason:'audioCaptureClosed',pending:true});return}
    }
    if (result.outcome === 'PROCESSING') {this.update({phase: 'PROCESSING', reason: null, pending: true}); return}
    this.update({phase: this.record.blob && result.outcome === 'RESERVED' ? 'READY' : 'RETRY_REQUIRED', reason: this.record.blob ? null : 'microphoneInterrupted', pending: true})
  }
  reconcile() {
    if (this.reconciliation || !this.record) return this.reconciliation ?? Promise.resolve()
    const record = this.record, generation = this.generation
    this.reconciliation = this.client.audio('status', {interviewId: record.begin.interviewId, submissionId: record.begin.submissionId}).then(async result => {
      if (generation !== this.generation) return
      this.apply(result); if (this.record) await this.persist()
    }).catch(error => {if (generation === this.generation) this.failure(error)}).finally(() => {if(generation===this.generation)this.reconciliation = undefined})
    return this.reconciliation
  }
  private failure(error: unknown) {
    if (error instanceof InterviewRequestError && [401, 403].includes(error.status)) {this.expire(); this.denied(error); return}
    if (!this.record && this.view.phase === 'COMMITTED') return
    this.update({phase: 'RETRY_REQUIRED', reason: error instanceof MicrophoneError ? error.message : error instanceof InterviewRequestError ? error.code : 'audioStorage', pending: !!this.record})
  }
  async start() {
    if (!this.state || ['PERMISSION', 'RECORDING', 'UPLOADING', 'PROCESSING'].includes(this.view.phase) || this.record?.blob || this.record?.expired) return
    const state = this.state
    if (state.status !== 'ACTIVE' || state.phase !== 'LISTENING' || !state.currentTurnId || !state.currentQuestion || !state.answerRecovery) return
    const generation = this.generation
    this.permission = new AbortController(); this.update({phase: 'PERMISSION', reason: null})
    try {
      const microphone = await CandidateMicrophone.permission(this.permission.signal, () => {void this.stop()})
      if (generation !== this.generation) {microphone.release(); return}
      this.microphone = microphone
      if (!this.record) {
        const begin: BeginCandidateAudio = {interviewId: state.interviewId, submissionId: crypto.randomUUID(), expectedVersion: state.version, sessionVersion: state.answerRecovery.sessionVersion, questionId: state.currentQuestion.id, turnId: state.currentTurnId, consent: 'ai-interview-audio-upload-v1'}
        this.record = {version: 1, begin, generationId: null, expiresAt: this.now() + Math.max(0, state.answerRecovery.expiresAt - state.serverNow), blobExpiresAt: this.now() + 120000, maxDurationMs: 120000, blob: null, expired: false}
      }
      await this.persist()
      const ticket = await this.client.audio('begin', this.record.begin)
      if (generation !== this.generation) {microphone.release(); return}
      this.apply(ticket)
      if (!this.record || ticket.outcome !== 'RESERVED') {microphone.release(); return}
      await this.persist()
      const maximum = Math.min(this.record.maxDurationMs, this.record.blobExpiresAt - this.now())
      if (maximum < 250) throw new MicrophoneError('audioCaptureClosed')
      microphone.start(maximum); this.update({phase: 'RECORDING', pending: true, reason: null})
    } catch (error) {this.microphone?.release(); this.microphone = undefined; if (generation === this.generation) this.failure(error)}
  }
  async stop() {
    if (this.ending || !this.microphone || !this.record || this.view.phase !== 'RECORDING') return
    this.ending = true; const generation = this.generation
    try {const blob = await this.microphone.stop(this.record.maxDurationMs); if (generation !== this.generation || !this.record) return; this.record.blob = blob; await this.persist(); this.update({phase: 'READY', reason: null, pending: true})}
    catch (error) {if (generation === this.generation) this.failure(error)}
    finally {this.microphone?.release(); this.microphone = undefined; this.ending = false}
  }
  async submit() {
    if (this.sending || !this.record?.blob || !this.record.generationId || ['UPLOADING', 'PROCESSING', 'RECORDING'].includes(this.view.phase)) return
    this.sending = true
    const generation = this.generation
    try {
      await this.reconcile()
      if (generation !== this.generation || !this.record?.blob || !this.record.generationId || ['COMMITTED', 'CLOSED', 'PROCESSING'].includes(this.view.phase)) return
      const record = this.record
      await this.persist(); this.request = new AbortController(); this.update({phase: 'UPLOADING', pending: true, reason: null})
      this.poll = setInterval(() => {void this.reconcile()}, 750)
      const result = await this.client.audioUpload({interviewId: record.begin.interviewId, submissionId: record.begin.submissionId, generationId: record.generationId!}, record.blob!, this.request.signal)
      if (generation === this.generation) {this.apply(result); if (this.record) await this.persist()}
    } catch (error) {if (generation === this.generation) {this.failure(error); await this.reconcile()}}
    finally {if (generation === this.generation) {this.sending = false; clearInterval(this.poll); this.poll = undefined}}
  }
  async discard() {
    if (!this.record || this.view.phase === 'RECORDING') return
    try {const result = await this.client.audio('cancel', {interviewId: this.record.begin.interviewId, submissionId: this.record.begin.submissionId}); this.apply(result)
      if (result.outcome === 'CLOSED' || result.outcome === 'NOT_FOUND') {const record=this.record;this.record = undefined; await this.store.remove(record?.begin); this.update({phase: 'IDLE', pending: false, persisted: false, reason: null})}
      this.request?.abort()
    } catch (error) {this.failure(error)}
  }
  detach() {this.generation++; this.scope=undefined;this.sending = false; this.permission?.abort(); this.request?.abort(); clearInterval(this.poll); this.microphone?.release(); this.microphone = undefined; this.reconciliation = undefined
    if (['RECORDING', 'PERMISSION', 'UPLOADING', 'PROCESSING'].includes(this.view.phase)) this.update({phase: 'RETRY_REQUIRED', reason: 'microphoneInterrupted', pending: !!this.record})}
  expire() {this.detach();this.clearStored(this.record); this.record = undefined; this.scope = undefined; this.state = undefined; this.update({phase: 'IDLE', pending: false, persisted: false, reason: null})}
}
