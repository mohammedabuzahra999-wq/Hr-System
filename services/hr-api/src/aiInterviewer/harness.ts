import type { AiInterviewCommand, AiInterviewMediaEvent, InterviewPlan } from '@hr/shared'
import { FakeClock } from './clock.js'
import { InterviewEngine, type InterviewCommandResult } from './engine.js'
import { MockEvaluator, type AnswerEvaluator } from './evaluator.js'
import { phase1Answers, phase1Plan } from './fixtures.js'
import { MockInterviewerPolicy, type InterviewerPolicy } from './interviewerPolicy.js'
import { MockRealtimeProvider, type InterviewRealtimeProvider } from './providers.js'

/** Maps observations to commands without giving the provider any domain authority. */
export function commandFromMedia(event: AiInterviewMediaEvent): AiInterviewCommand {
  const commandId = event.eventId
  switch (event.type) {
    case 'PLAYBACK_STARTED': return { type: 'AI_PLAYBACK_STARTED', commandId, playbackId: event.playbackId }
    case 'PLAYBACK_FINISHED': return { type: 'AI_PLAYBACK_FINISHED', commandId, playbackId: event.playbackId }
    case 'INTERRUPTION': return { type: 'CANDIDATE_INTERRUPTED', commandId, playbackId: event.playbackId }
    case 'SPEECH_STARTED': return { type: 'CANDIDATE_SPEECH_STARTED', commandId, turnId: event.turnId }
    case 'SPEECH_FINISHED': return { type: 'CANDIDATE_SPEECH_FINISHED', commandId, turnId: event.turnId }
    case 'TRANSCRIPT_PARTIAL': return { type: 'CANDIDATE_TRANSCRIPT_PARTIAL', commandId, turnId: event.turnId, text: event.text }
    case 'TRANSCRIPT_FINAL': return { type: 'CANDIDATE_TRANSCRIPT_FINAL', commandId, turnId: event.turnId, text: event.text, uncertain: event.uncertain }
    case 'DISCONNECT': return { type: 'PAUSE_INTERVIEW', commandId, reason: 'DISCONNECT' }
    case 'RECONNECT': return { type: 'RESUME_INTERVIEW', commandId }
    case 'TIMEOUT': return { type: 'PAUSE_INTERVIEW', commandId, reason: 'PROVIDER_TIMEOUT' }
    case 'SILENCE': return { type: 'TIMER_TICK', commandId }
  }
}

type WithoutId<T> = T extends unknown ? Omit<T, 'commandId'> : never
type WithoutEventId<T> = T extends unknown ? Omit<T, 'eventId'> : never

export class InterviewHarness {
  readonly clock = new FakeClock()
  readonly engine: InterviewEngine
  readonly provider: InterviewRealtimeProvider
  private commandSeq = 0
  private mediaSeq = 0
  private unsubscribe: () => void

  constructor(options: { policy?: InterviewerPolicy; evaluator?: AnswerEvaluator; provider?: InterviewRealtimeProvider } = {}) {
    this.provider = options.provider ?? new MockRealtimeProvider()
    this.engine = new InterviewEngine({ clock: this.clock, policy: options.policy ?? new MockInterviewerPolicy(), evaluator: options.evaluator ?? new MockEvaluator() })
    this.unsubscribe = this.provider.subscribe(event => { this.send(commandFromMedia(event)) })
  }
  send(command: WithoutId<AiInterviewCommand> & { commandId?: string }): InterviewCommandResult {
    const result = this.engine.dispatch({ ...command, commandId: command.commandId ?? `command:${++this.commandSeq}` } as AiInterviewCommand)
    for (const effect of result.effects) {
      if (effect.type === 'PLAY') this.provider.play(effect.playback)
      else this.provider.stop(effect.playbackId)
    }
    return result
  }
  media(event: WithoutEventId<AiInterviewMediaEvent> & { eventId?: string }) {
    if (!(this.provider instanceof MockRealtimeProvider)) throw new Error('Manual media requires the mock provider')
    this.provider.emit({ ...event, eventId: event.eventId ?? `media:${++this.mediaSeq}` } as AiInterviewMediaEvent)
  }
  create(plan: InterviewPlan = phase1Plan) {
    this.send({ type: 'CREATE_INTERVIEW', interviewId: 'phase1-interview', plan })
    this.send({ type: 'MARK_READY' })
  }
  start() { this.send({ type: 'START_INTERVIEW' }) }
  deliverPlayback() {
    const playback = this.engine.snapshot.playback
    if (!playback) throw new Error('No requested playback')
    if (!playback.started) this.media({ type: 'PLAYBACK_STARTED', playbackId: playback.id })
    this.media({ type: 'PLAYBACK_FINISHED', playbackId: playback.id })
  }
  listenToFirstQuestion(plan: InterviewPlan = phase1Plan) {
    this.create(plan); this.start(); this.deliverPlayback(); this.deliverPlayback()
  }
  answer(text: string, uncertain = false) {
    const turnId = this.engine.snapshot.draft!.turnId
    if (!this.engine.snapshot.draft!.speaking) this.media({ type: 'SPEECH_STARTED', turnId })
    this.media({ type: 'TRANSCRIPT_FINAL', turnId, text, uncertain })
    this.media({ type: 'SPEECH_FINISHED', turnId })
  }
  advance(ms: number) { this.clock.advance(ms); return this.send({ type: 'TIMER_TICK' }) }
  dispose() { this.unsubscribe() }
}

/** Codes and synthetic ids only; no answer text, identity, secrets or prompts. */
export function readableTrace(engine: InterviewEngine): string[] {
  return engine.events.map(e => `${String(e.seq).padStart(3, '0')} ${e.type}${'question' in e ? ` [${e.question.id}]` : 'turnId' in e ? ` [${e.turnId}]` : 'answer' in e ? ` [${e.answer.turnId}; ${e.answer.endReason}]` : ''}`)
}

export function runPhase1Scenario() {
  const harness = new InterviewHarness()
  harness.listenToFirstQuestion()
  for (const answer of phase1Answers) {
    harness.answer(answer)
    harness.send({ type: 'PROCESS_ANSWER' })
    if (harness.engine.snapshot.playback) harness.deliverPlayback()
  }
  const pending = harness.engine.snapshot
  harness.send({ type: 'GENERATE_EVALUATION' })
  harness.dispose()
  return { pending, snapshot: harness.engine.snapshot, trace: readableTrace(harness.engine) }
}
