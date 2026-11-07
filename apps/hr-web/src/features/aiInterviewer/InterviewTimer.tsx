import { useEffect, useState } from 'react'
import { Clock3, AlertCircle } from 'lucide-react'
import type { CandidateAiInterviewUiState } from '@hr/shared'
import { interviewTime, remainingInterviewMs } from './timer'
import { useInterviewCopy } from './copy'

export function InterviewTimer({ state, receivedAt }: { state: CandidateAiInterviewUiState; receivedAt: number }) {
  const { s } = useInterviewCopy()
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => { const id = window.setInterval(() => setNow(performance.now()), 250); return () => window.clearInterval(id) }, [])
  const remaining = remainingInterviewMs(state, receivedAt, now)
  if (remaining === null || !state.timer) return <p className="mt-6 text-sm text-muted">{s('Your answer time starts after this message finishes.', 'يبدأ وقت الإجابة بعد انتهاء هذه الرسالة.')}</p>
  const grace = state.timer.stage === 'GRACE'
  const warning = !grace && state.timer.warningAtSec > 0 && remaining <= state.timer.warningAtSec * 1000
  return <div data-testid="answer-timer" data-stage={state.timer.stage} className={`mt-7 inline-flex flex-col items-center rounded-2xl border px-8 py-4 ${warning || grace ? 'border-amber-300 bg-amber-50/70 text-amber-800' : 'border-line bg-paper text-ink'}`}>
    <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Clock3 className="size-3.5" />{grace ? s('Finishing answer · grace', 'إنهاء الإجابة · المهلة الإضافية') : s('Answer time', 'وقت الإجابة')}</span>
    <span role="timer" aria-live="off" dir="ltr" className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{interviewTime(remaining)}</span>
    {(warning || grace || remaining === 0) && <span role="status" className="mt-2 flex items-center gap-1 text-xs"><AlertCircle className="size-3.5" />{remaining === 0 ? s('Waiting for the interview to continue…', 'بانتظار متابعة المقابلة…') : grace ? s('Please finish your thought.', 'يرجى إنهاء فكرتك.') : s('Time is nearly up.', 'اقترب انتهاء الوقت.')}</span>}
    {state.status !== 'ACTIVE' && <span className="mt-2 text-xs">{s('Time preserved while paused', 'الوقت المتبقي محفوظ أثناء التوقف')}</span>}
  </div>
}
