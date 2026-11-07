import { useEffect } from 'react'
import { Beaker, Send, MessageSquare, Play, Square, WifiOff, RefreshCw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { InterviewSession, InterviewView } from './session'
import { useInterviewCopy } from './copy'

const samples = [
  ['RAG experience', 'I used RAG in an HR assistant.'],
  ['Incomplete measurement', 'I checked some results.'],
  ['Detailed measurement', 'I measured recall@5 on labeled queries and reviewed incorrect retrievals.'],
  ['Engineering decision', 'I compared alternatives, tested the change, and documented the trade-offs.'],
]

/** Imported only by the development branch; never asks for a media device. */
export default function MockControls({ session, view, autoPlay, setAutoPlay }: {
  session: InterviewSession; view: InterviewView; autoPlay: boolean; setAutoPlay: (value: boolean) => void
}) {
  const { s } = useInterviewCopy()
  const text = view.answer.turnId === view.state?.currentTurnId ? view.answer.text : ''
  const setText = (value: string) => session.answers.edit(value)
  const state = view.state!
  const listening = state.status === 'ACTIVE' && state.phase === 'LISTENING'
  const turnId = state.currentTurnId
  const answerBusy = view.answer.phase === 'SUBMITTING' || view.answer.phase === 'RECOVERY_REQUIRED'
  const editingBlocked = !state.answerRecovery || (view.answer.phase === 'EMPTY' && view.answer.reason === 'storage') || answerBusy || (!!view.answer.text && view.answer.turnId !== turnId)
  const deliveryId = state.delivery?.id, playbackStarted = state.delivery?.started
  useEffect(() => {
    if (!autoPlay || !deliveryId || view.busy || view.connection !== 'connected' || state.status !== 'ACTIVE') return
    const action = playbackStarted ? 'PLAYBACK_FINISH' : 'PLAYBACK_START'
    const id = window.setTimeout(() => { void session.mock(action, false) }, playbackStarted ? 3200 : 250)
    return () => window.clearTimeout(id)
  }, [autoPlay, deliveryId, playbackStarted, state.status, view.busy, view.connection, session])

  async function submit() {
    if (!turnId || !text.trim() || view.busy) return
    await session.answers.submit()
  }
  return <section data-testid="mock-controls" className="mt-6 rounded-2xl border border-line bg-surface p-5 text-start sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold text-ink"><MessageSquare className="size-4 text-brand" />{s('Your answer', 'إجابتك')}</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{s('Development mock · no microphone', 'محاكاة للتطوير · دون ميكروفون')}</span></div>
    <label htmlFor="mock-answer" className="sr-only">{s('Candidate mock response', 'إجابة المرشح التجريبية')}</label>
    <textarea id="mock-answer" data-testid="mock-answer" dir="auto" value={text} onChange={e => setText(e.target.value)} disabled={!listening || view.busy || editingBlocked} maxLength={16000} rows={4}
      placeholder={listening ? s('Type your simulated response here…', 'اكتب إجابتك التجريبية هنا…') : s('Your answer area opens when the interviewer finishes.', 'تتاح الإجابة بعد انتهاء حديث المحاور.')}
      className="w-full resize-y rounded-xl border border-line bg-paper p-4 text-sm leading-7 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60" />
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button data-testid="submit-answer" disabled={!listening || !text.trim() || editingBlocked} loading={view.busy || view.answer.phase === 'SUBMITTING'} onClick={() => void submit()}><Send className="size-4" />{s('Submit mock answer', 'إرسال الإجابة التجريبية')}</Button>
      <Button variant="secondary" disabled={!listening || state.speaking || view.busy} onClick={() => void session.send({ type: 'CANDIDATE_SPEECH_STARTED', turnId: turnId!, commandId: crypto.randomUUID() })}><Play className="size-3.5" />{s('Start speaking', 'بدء الكلام')}</Button>
      <span className="text-xs text-muted">{state.speaking ? s('Speaking · the server controls the deadline', 'جارٍ الكلام · الخادم يحدد المهلة') : s('Only your finalized answer is submitted.', 'تُرسل الإجابة عند تأكيدها فقط.')}</span>
    </div>
    <details className="mt-5 border-t border-line pt-4">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted"><Beaker className="size-4" />{s('Mock scenario tools', 'أدوات سيناريوهات المحاكاة')}</summary>
      <div className="mt-4 space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoPlay} onChange={e => setAutoPlay(e.target.checked)} />{s('Automatically play mock messages', 'تشغيل رسائل المحاكاة تلقائياً')}</label>
        <div className="flex flex-wrap gap-2">{samples.map(([label, value]) => <button type="button" key={label} onClick={() => setText(value!)} disabled={!listening} className="rounded-lg border border-line px-3 py-2 text-xs text-ink hover:bg-brand-50 disabled:opacity-40">{label}</button>)}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!state.delivery || view.busy} onClick={() => void session.mock(state.delivery!.started ? 'PLAYBACK_FINISH' : 'PLAYBACK_START')}><Play className="size-3.5" />{s('Advance playback', 'متابعة الرسالة')}</Button>
          <Button variant="secondary" disabled={state.phase !== 'AI_SPEAKING' || state.delivery?.kind !== 'QUESTION' || view.busy} onClick={() => void session.mock('INTERRUPT')}><Square className="size-3.5" />{s('Interrupt AI', 'مقاطعة المحاور')}</Button>
          <Button variant="secondary" disabled={state.status !== 'ACTIVE' || view.busy} onClick={() => void session.mock('DISCONNECT')}><WifiOff className="size-3.5" />{s('Simulate disconnect', 'محاكاة انقطاع الاتصال')}</Button>
          <Button variant="secondary" disabled={state.status !== 'ACTIVE' || view.busy} onClick={() => void session.mock('FAIL')}>{s('Simulate provider failure', 'محاكاة تعطل المزوّد')}</Button>
          <Button variant="secondary" disabled={state.phase !== 'PROCESSING' || view.busy || view.modelEnabled} onClick={() => void session.mock('PROCESS')}>{s('Process answer now', 'معالجة الإجابة الآن')}</Button>
          <Button variant="secondary" disabled={!listening || view.busy} onClick={() => void session.mock('TICK')}>{s('Check server deadline', 'فحص مهلة الخادم')}</Button>
          <Button variant="secondary" disabled={view.busy} onClick={() => void session.retryLast()}><Undo2 className="size-3.5" />{s('Retry last command', 'إعادة آخر طلب')}</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}><RefreshCw className="size-3.5" />{s('Refresh / recovery', 'تحديث / استعادة')}</Button>
        </div>
        <p className="text-xs leading-6 text-muted">{s('Silence: leave the answer empty. To test grace, start speaking and wait for the server deadline. Timers are never advanced in the browser. Use short, explicit HR settings for a quick demo.', 'للصمت اترك الإجابة فارغة. لاختبار المهلة الإضافية ابدأ الكلام وانتظر مهلة الخادم. المتصفح لا يقدّم الوقت؛ استخدم إعدادات قصيرة وواضحة من مسؤول التوظيف لتجربة سريعة.')}</p>
      </div>
    </details>
  </section>
}
