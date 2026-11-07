import type { CandidateAiInterviewUiState } from '@hr/shared'

export function remainingInterviewMs(state: CandidateAiInterviewUiState, receivedAt: number, now: number) {
  if (!state.timer) return null
  if (state.status !== 'ACTIVE' || state.phase !== 'LISTENING') return state.timer.remainingMs
  return Math.max(0, state.timer.remainingMs - Math.max(0, now - receivedAt))
}
export function interviewTime(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
