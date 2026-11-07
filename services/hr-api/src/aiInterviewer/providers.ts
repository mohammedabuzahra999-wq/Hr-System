import { aiInterviewMediaEventSchema, type AiInterviewConnectionState, type AiInterviewMediaEvent, type AiInterviewPlayback } from '@hr/shared'

export interface InterviewRealtimeProvider {
  subscribe(listener: (event: AiInterviewMediaEvent) => void): () => void
  play(playback: Readonly<AiInterviewPlayback>): void
  stop(playbackId: string): void
}

/** No timers, audio devices, SDKs or I/O. The caller controls the entire timeline. */
export class MockRealtimeProvider implements InterviewRealtimeProvider {
  private listeners = new Set<(event: AiInterviewMediaEvent) => void>()
  private requests = new Map<string, AiInterviewPlayback>()
  private stopped = new Set<string>()
  connectionState: AiInterviewConnectionState = 'CONNECTED'

  subscribe(listener: (event: AiInterviewMediaEvent) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  play(playback: Readonly<AiInterviewPlayback>) { this.requests.set(playback.id, structuredClone(playback)) }
  stop(playbackId: string) { this.stopped.add(playbackId) }
  requestedPlaybacks() { return [...this.requests.values()].map(p => structuredClone(p)) }
  wasStopped(playbackId: string) { return this.stopped.has(playbackId) }

  /** Explicit observations, including silence and faults; never an engine transition. */
  emit(input: AiInterviewMediaEvent) {
    const event = aiInterviewMediaEventSchema.parse(input)
    if (event.type === 'DISCONNECT' || event.type === 'TIMEOUT') this.connectionState = 'DISCONNECTED'
    if (event.type === 'RECONNECT') this.connectionState = 'CONNECTED'
    for (const listener of this.listeners) listener(structuredClone(event))
  }
}
