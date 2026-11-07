import { aiInterviewMockRequestSchema, type AiInterviewCommand, type AiInterviewMediaEvent } from '@hr/shared'
import { MockRealtimeProvider } from './providers.js'
import { commandFromMedia } from './harness.js'

/** Closed development observations; never an arbitrary command/score endpoint. */
export function mockObservationCommand(input: unknown): AiInterviewCommand {
  const body = aiInterviewMockRequestSchema.parse(input), commandId = body.commandId
  if (body.action === 'PROCESS') return { type: 'PROCESS_ANSWER', commandId }
  if (body.action === 'TICK') return { type: 'TIMER_TICK', commandId }
  if (body.action === 'FAIL') return { type: 'FAIL_INTERVIEW', code: 'mockProviderFailure', recoverable: true, commandId }
  let event: AiInterviewMediaEvent
  switch (body.action) {
    case 'PLAYBACK_START': event = { type: 'PLAYBACK_STARTED', playbackId: body.playbackId, eventId: commandId }; break
    case 'PLAYBACK_FINISH': event = { type: 'PLAYBACK_FINISHED', playbackId: body.playbackId, eventId: commandId }; break
    case 'INTERRUPT': event = { type: 'INTERRUPTION', playbackId: body.playbackId, eventId: commandId }; break
    default: event = { type: body.action, eventId: commandId }
  }
  const provider = new MockRealtimeProvider()
  let command: AiInterviewCommand | undefined
  provider.subscribe(observation => { command = commandFromMedia(observation) })
  provider.emit(event)
  if (!command) throw new Error('Missing mock observation')
  return command
}
