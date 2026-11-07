import type { AiInterviewReplayPage, CandidateAiInterviewRequest, CandidateAiInterviewUiState, AiInterviewMockRequest } from '@hr/shared'
import { CandidateInterviewClient, InterviewRequestError } from './client'
import { AnswerRecovery, type AnswerView } from './answerRecovery'
import { CandidateAudioRecovery, type AudioView } from './audioRecovery'
import { CandidatePlayback, type PlaybackView } from './playback'

export type InterviewView = {
  modelEnabled:boolean;modelStatus:'IDLE'|'PROCESSING'|'RETRYING'|'RECOVERY_REQUIRED';
  state: CandidateAiInterviewUiState | null; receivedAt: number; loading: boolean; busy: boolean;
  error: string | null; notice: string | null; connection: 'connecting' | 'connected' | 'reconnecting' | 'expired';
  mockEnabled: boolean; events: AiInterviewReplayPage['events']; lastSeenSequence: number;
  answer: AnswerView;
  audioEnabled: boolean; audio: AudioView; playbackEnabled: boolean; playback: PlaybackView;
}
export function orderedReplay(previous: number, page: AiInterviewReplayPage) {
  const seen = new Set<number>()
  return { cursor: Math.max(previous, page.nextAfterSequence), events: [...page.events].sort((a,b) => a.sequence-b.sequence)
    .filter(e => e.sequence > previous && !seen.has(e.sequence) && !!seen.add(e.sequence)) }
}

/** A view/cache of server state, never a reducer for interview transitions. */
export class InterviewSession {
  private view: InterviewView = { modelEnabled:false,modelStatus: 'IDLE', state: null, receivedAt: 0, loading: true, busy: false, error: null, notice: null,
    playbackEnabled: false, playback: {phase: 'IDLE', reason: null, busy: false},
    audioEnabled: false, audio: {phase: 'CHECKING', reason: null, pending: false, persisted: false},
    connection: 'connecting', mockEnabled: false, events: [], lastSeenSequence: 0,
    answer: { phase: 'EMPTY', text: '', turnId: null, persisted: false, reason: null, canRetry: false, canReview: false, canDiscard: false } }
  private listeners = new Set<() => void>()
  private initialization?: Promise<void>
  private syncPromise?: Promise<void>
  private pinnedId?: string
  private lastAttempt?: { path: '/commands' | '/dev/mock'; body: unknown }
  private client: CandidateInterviewClient
  private now: () => number
  readonly answers: AnswerRecovery
  readonly audio: CandidateAudioRecovery
  readonly playback: CandidatePlayback
  constructor(client = new CandidateInterviewClient(), now = () => performance.now(), storage?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    this.client = client; this.now = now
    this.answers = new AnswerRecovery(client, answer => this.update({ answer }), state => this.receive(state), error => this.failure(error), storage)
    this.playback = new CandidatePlayback(client, playback => this.update({playback}), state => this.receive(state), error => this.failure(error))
    this.audio = new CandidateAudioRecovery(client, audio => this.update({audio}), state => this.receive(state), error => this.failure(error))
  }
  getSnapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<InterviewView>) { this.view = { ...this.view, ...change }; for (const listener of this.listeners) listener() }
  private receive(state: CandidateAiInterviewUiState) {
    const old = this.view.state
    if (old?.answerRecovery && state.answerRecovery && old.interviewId === state.interviewId && state.answerRecovery.sessionVersion < old.answerRecovery.sessionVersion) return
    if ((this.pinnedId && state.interviewId !== this.pinnedId) || (old && (state.version < old.version || (state.version === old.version && state.serverNow < old.serverNow)))) return
    this.pinnedId = state.interviewId
    if(state.phase!=='PROCESSING')this.update({modelStatus:'IDLE'})
    this.update({ state, receivedAt: this.now(), loading: false, error: null, connection: 'connected' })
    this.answers.observe(state)
    void this.audio.observe(state, this.view.audioEnabled)
    void this.playback.observe(state, this.view.playbackEnabled)
  }
  private failure(error: unknown) {
    const e = error instanceof InterviewRequestError ? error : new InterviewRequestError(0, 'requestFailed')
    if (e.status === 401 || e.status === 403) {
      this.lastAttempt = undefined
      this.answers.expire()
      this.audio.expire()
      this.playback.detach()
      this.update({ state: null, events: [], lastSeenSequence: 0, loading: false, error: e.code, connection: 'expired', busy: false })
    } else this.update({ loading: false, error: e.code, connection: e.status === 0 ? 'reconnecting' : this.view.connection })
  }
  initialize(token: string | null, joinPage: boolean, removeToken: (success: boolean) => void) {
    if (this.initialization) return this.initialization
    this.initialization = (async () => {
      let secret = token
      try {
        if (joinPage && !secret) throw new InterviewRequestError(401, 'invitationInvalid')
        if (secret) {
          this.answers.expire()
          const result = await this.client.exchange(secret)
          this.pinnedId = result.interviewId
          secret = null
          removeToken(true)
        }
        const config = await this.client.config()
        this.update({ mockEnabled: config.mockControlsEnabled, audioEnabled: config.audioCaptureEnabled === true, playbackEnabled: config.playbackEnabled === true,modelEnabled:config.modelEnabled===true })
        await this.sync()
      } catch (error) {
        secret = null
        if (token) removeToken(false)
        // An unconfirmed one-use exchange must never fall back to an older cookie.
        this.failure(joinPage && !this.pinnedId && error instanceof InterviewRequestError && error.status === 0
          ? new InterviewRequestError(401, 'invitationExchangeUncertain') : error)
      }
    })()
    return this.initialization
  }
  sync = () => {
    if (this.syncPromise) return this.syncPromise
    this.syncPromise = (async () => {
      try {
        this.receive(await this.client.state(this.pinnedId))
        if (!this.view.state) return
        // Gaps may be filtered internal records. Reconcile using the snapshot;
        // replay only orders notifications, never invents a state transition.
        for (let n = 0; n < 4; n++) {
          const page = await this.client.events(this.view.state.interviewId, this.view.lastSeenSequence)
          const next = orderedReplay(this.view.lastSeenSequence, page)
          this.update({ events: [...this.view.events, ...next.events].slice(-20), lastSeenSequence: next.cursor })
          if (!page.hasMore || next.events.length === 0 && page.nextAfterSequence === 0) break
        }
        await this.answers.reconcile()
        if(this.view.modelEnabled&&this.view.state?.phase==='PROCESSING')this.update({modelStatus:await this.client.modelStatus(this.view.state.interviewId)})
      } catch (error) { this.failure(error) }
    })().finally(() => { this.syncPromise = undefined })
    return this.syncPromise
  }
  async reconnect() {
    try { const config = await this.client.config(); this.update({ mockEnabled: config.mockControlsEnabled, audioEnabled: config.audioCaptureEnabled === true, playbackEnabled: config.playbackEnabled === true,modelEnabled:config.modelEnabled===true }); await this.sync() }
    catch (error) { this.failure(error) }
  }
  async send(command: CandidateAiInterviewRequest['command']) {
    const state = this.view.state
    if (!state || this.view.busy) return false
    return this.perform('/commands', { interviewId: state.interviewId, expectedVersion: state.version, command }, true)
  }
  async mock(action: AiInterviewMockRequest['action'], remember = true) {
    const state = this.view.state
    if (!state || this.view.busy || !this.view.mockEnabled) return false
    const body = { action, interviewId: state.interviewId, expectedVersion: state.version, commandId: crypto.randomUUID(),
      ...(['PLAYBACK_START', 'PLAYBACK_FINISH', 'INTERRUPT'].includes(action) ? { playbackId: state.delivery?.id } : {}) }
    return this.perform('/dev/mock', body, remember)
  }
  async retryLast() { return this.lastAttempt && !this.view.busy ? this.perform(this.lastAttempt.path, this.lastAttempt.body, false) : false }
  private async perform(path: '/commands' | '/dev/mock', body: unknown, remember: boolean) {
    this.update({ busy: true, error: null, notice: null })
    if (remember) this.lastAttempt = { path, body }
    try {
      const result = await this.client.action(path, body)
      this.receive(result.state)
      this.update({ busy: false, notice: result.duplicate ? 'duplicateAcknowledged' : null })
      return true
    } catch (error) {
      this.update({ busy: false })
      if (error instanceof InterviewRequestError && error.status === 409) {
        this.lastAttempt = undefined
        // A poll started before this conflict may still contain the old version.
        // Drain it, then fetch again; never retry the state-changing command.
        if (this.syncPromise) await this.syncPromise
        await this.sync()
        this.update({ notice: 'stateReconciled' })
      } else this.failure(error)
      return false
    }
  }
}
