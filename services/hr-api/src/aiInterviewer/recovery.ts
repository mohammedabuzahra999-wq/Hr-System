import { InterviewEngine, type InterviewCommandResult } from './engine.js'
import type { InterviewRow } from './repository.js'
import type { InterviewClock } from './clock.js'
import type { InterviewerPolicy } from './interviewerPolicy.js'
import type { AnswerEvaluator } from './evaluator.js'

/** Freeze at the last durable observation, never charge unknown offline time. */
export function recoverInterview(row: InterviewRow, dependencies: { policy: InterviewerPolicy; evaluator: AnswerEvaluator }): InterviewCommandResult {
  const clock: InterviewClock = { now: () => row.lastObservedAt.getTime() }
  const engine = InterviewEngine.restore(row.snapshot, { ...dependencies, clock })
  const events: InterviewCommandResult['events'] = [], effects: InterviewCommandResult['effects'] = []
  if (row.snapshot.phase === 'LISTENING') {
    const tick = engine.dispatch({ type: 'TIMER_TICK', commandId: `recovery-tick:${row.version}` })
    events.push(...tick.events); effects.push(...tick.effects)
  }
  const pause = engine.dispatch({ type: 'PAUSE_INTERVIEW', reason: 'DISCONNECT', commandId: `recovery-pause:${row.version}` })
  return { ...pause, events: [...events, ...pause.events], effects: [...effects, ...pause.effects] }
}
