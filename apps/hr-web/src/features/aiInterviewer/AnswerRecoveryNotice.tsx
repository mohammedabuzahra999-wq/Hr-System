import type { InterviewSession, InterviewView } from './session'
import { Button } from '@/components/ui/Button'
import { useInterviewCopy } from './copy'

export function AnswerRecoveryNotice({ session, view }: { session: InterviewSession; view: InterviewView }) {
  const { s } = useInterviewCopy(), answer = view.answer
  if (answer.phase === 'EMPTY' && !['expired','storage'].includes(answer.reason ?? '')) return null
  const message = answer.phase === 'COMMITTED' ? s('Your answer was received and saved by the interview server.', 'تم استلام إجابتك وحفظها على خادم المقابلة.')
    : answer.phase === 'EMPTY' && answer.reason === 'storage' ? s('Browser recovery is unavailable. We cannot check an existing local copy. Reconnect before entering a new answer.', 'استعادة المتصفح غير متاحة ولا يمكن فحص النسخة المحلية. أعد الاتصال قبل إدخال إجابة جديدة.')
    : answer.phase === 'SUBMITTING' ? s('Submitting your answer. Waiting for server confirmation…', 'جارٍ إرسال إجابتك. ننتظر تأكيد الخادم…')
      : answer.phase === 'DRAFT' ? answer.persisted
        ? s('Local draft in this tab. It has not been submitted to the interview server.', 'مسودة محلية في هذا التبويب. لم تُرسل إلى خادم المقابلة.')
        : s('This draft is only in memory. Browser recovery is unavailable; submission has not been sent. Keep a copy before refreshing.', 'المسودة في الذاكرة فقط. استعادة المتصفح غير متاحة ولم يُرسل الطلب. احتفظ بنسخة قبل التحديث.')
        : answer.reason === 'conflict' ? s('A different answer was committed for this turn. Your local answer has not replaced it. Keep a copy or contact your recruiter.', 'حُفظت إجابة مختلفة لهذا الدور. لم تستبدلها إجابتك المحلية. احتفظ بنسخة أو تواصل مع مسؤول التوظيف.')
          : answer.reason === 'closed' ? s('This turn has ended. This local answer is not confirmed as committed. Keep a copy or contact your recruiter.', 'انتهى هذا الدور. لم نتأكد من حفظ الإجابة المحلية. احتفظ بنسخة أو تواصل مع مسؤول التوظيف.')
            : answer.reason === 'review' ? s('This submission is not committed. The interview changed; review your answer before submitting a new attempt.', 'لم يُحفظ هذا الطلب وتغيّرت حالة المقابلة. راجع إجابتك قبل محاولة جديدة.')
              : answer.reason === 'retry' ? s('This submission is not committed yet. You can retry the same answer.', 'لم يُحفظ هذا الطلب بعد. يمكنك إعادة محاولة إرسال الإجابة نفسها.')
                : answer.reason === 'expired' ? s('The local recovery copy expired. No answer has been marked saved based on that copy.', 'انتهت صلاحية النسخة المحلية للاستعادة. لم نعتبر الإجابة محفوظة اعتماداً على تلك النسخة.')
                  : s('Answer delivery is unconfirmed. Check with the server before retrying. Your local copy is preserved.', 'لم يتأكد وصول الإجابة. تحقق من الخادم قبل إعادة المحاولة. النسخة المحلية محفوظة.')
  return <section data-testid="answer-recovery" data-answer-phase={answer.phase} role="status" className="mb-5 rounded-xl border border-brand/20 bg-brand-50 p-4 text-sm text-ink">
    <p>{message}</p>
    {answer.phase === 'EMPTY' && answer.reason === 'storage' && <Button variant="secondary" className="mt-3" onClick={() => void session.reconnect()}>{s('Reconnect', 'إعادة الاتصال')}</Button>}
    {answer.phase === 'RECOVERY_REQUIRED' && <>
      {answer.text && <textarea data-testid="recovery-answer" aria-label={s('Your local recovery copy', 'نسختك المحلية للاستعادة')} dir="auto" readOnly value={answer.text} rows={3} className="mt-3 w-full rounded-lg border border-line bg-surface p-3 text-ink" />}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void session.answers.reconcile()}>{s('Check submission', 'التحقق من الإرسال')}</Button>
        {answer.canRetry && <Button data-testid="retry-answer" onClick={() => void session.answers.retry()}>{s('Retry same answer', 'إعادة محاولة الإجابة نفسها')}</Button>}
        {answer.canReview && <Button data-testid="review-answer" onClick={() => void session.answers.reviewAsDraft()}>{s('Review as draft', 'المراجعة كمسودة')}</Button>}
        {answer.canDiscard && <Button data-testid="discard-answer" variant="secondary" onClick={() => {
          if (window.confirm(s('Discard this local copy? This does not cancel any request already sent.', 'حذف النسخة المحلية؟ لن يلغي ذلك أي طلب أُرسل بالفعل.'))) session.answers.discard()
        }}>{s('Discard local copy', 'حذف النسخة المحلية')}</Button>}
      </div>
    </>}
  </section>
}
