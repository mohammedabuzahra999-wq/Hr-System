import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { InterviewSession, InterviewView } from './session'
import { useInterviewCopy } from './copy'

export function AudioAnswerPanel({session, view}: {session: InterviewSession; view: InterviewView}) {
  const {s} = useInterviewCopy(), [consent, setConsent] = useState(false)
  if (!view.audioEnabled || !view.state) return null
  const audio = view.audio, listening = view.state.status === 'ACTIVE' && view.state.phase === 'LISTENING'
  const blocked = ['CHECKING', 'PERMISSION', 'RECORDING', 'UPLOADING', 'PROCESSING'].includes(audio.phase)
  const labels = {
    CHECKING: s('Checking audio recovery…', 'جارٍ فحص استعادة التسجيل…'), IDLE: s('No recording pending.', 'لا يوجد تسجيل معلق.'),
    PERMISSION: s('Preparing microphone permission and secure recording…', 'جارٍ تجهيز إذن الميكروفون والتسجيل الآمن…'), RECORDING: s('Recording. Stop before the question deadline.', 'جارٍ التسجيل. أوقف التسجيل قبل انتهاء وقت السؤال.'),
    READY: s('Recording is only on this device. Send it to submit your answer.', 'التسجيل على هذا الجهاز فقط. أرسله لتقديم إجابتك.'),
    UPLOADING: s('Uploading your recording…', 'جارٍ رفع التسجيل…'), PROCESSING: s('The server is transcribing. Your answer is not committed yet.', 'الخادم يحوّل التسجيل إلى نص. لم تُثبّت الإجابة بعد.'),
    COMMITTED: s('Your audio answer was received and durably committed by the server.', 'استلم الخادم إجابتك الصوتية وثبّتها.'),
    RETRY_REQUIRED: s('Audio needs recovery. Check its status or retry the same recording.', 'التسجيل بحاجة إلى استعادة. تحقق من حالته أو أعد إرسال التسجيل نفسه.'),
    FAILED: s('Audio is unavailable. Your answer has not been confirmed.', 'التسجيل غير متاح. لم يتم تأكيد الإجابة.'),
    CLOSED: s('This recording was not confirmed for the current turn. Contact your recruiter before closing.', 'لم يتم تأكيد هذا التسجيل للدور الحالي. تواصل مع مسؤول التوظيف قبل الإغلاق.'),
  }
  const reason = audio.reason === 'microphoneDenied' ? s('Microphone permission was denied. Allow access in your browser and try again.', 'رُفض إذن الميكروفون. اسمح بالوصول في المتصفح ثم حاول مجدداً.')
    : audio.reason === 'microphoneUnsupported' ? s('This browser cannot record the supported audio format. Use a supported secure browser or contact your recruiter.', 'لا يدعم المتصفح التسجيل المطلوب. استخدم متصفحاً آمناً مدعوماً أو تواصل مع مسؤول التوظيف.')
    : audio.reason === 'audioStorage' ? s('The browser could not retain recovery audio. Keep this page open; sending is blocked until recovery storage works.', 'تعذر حفظ التسجيل للاستعادة. أبق الصفحة مفتوحة؛ يُمنع الإرسال حتى يعمل التخزين.')
    : audio.reason === 'audioCleanup' ? s('Local recovery cleanup failed. Clear this site’s browser data when you are finished.', 'تعذر مسح نسخة الاستعادة المحلية. امسح بيانات هذا الموقع في المتصفح عند الانتهاء.')
    : audio.reason === 'microphoneInterrupted' ? s('Recording was interrupted. It is not a submitted answer. Record again, or retry a retained recording.', 'انقطع التسجيل. لم يتم تقديم إجابة. سجّل مجدداً أو أعد إرسال التسجيل المتاح.')
    : audio.reason === 'audioTooShort' ? s('Record at least a short spoken answer before stopping.', 'سجّل إجابة صوتية قصيرة على الأقل قبل الإيقاف.')
    : audio.reason === 'audioExpired' ? s('The temporary recording expired and was removed. No success is implied.', 'انتهت مدة التسجيل المؤقت وأُزيل. لا يعني ذلك نجاح الإرسال.')
    : audio.reason && !['checking'].includes(audio.reason) ? s('The answer is not confirmed. Reconnect, check the status and retry if available.', 'لم تُؤكد الإجابة. أعد الاتصال وتحقق من الحالة ثم حاول إن أمكن.') : null
  return <section data-testid="audio-panel" className="my-5 space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label={s('Audio answer', 'إجابة صوتية')}>
    <h2 className="font-semibold">{s('Record an audio answer', 'تسجيل إجابة صوتية')}</h2>
    <p data-testid="audio-status" data-phase={audio.phase} role="status" aria-live="polite" className="text-sm leading-6">{labels[audio.phase]}</p>
    {reason && <p data-testid="audio-error" role="alert" className="text-sm text-amber-800">{reason}</p>}
    {listening && !blocked && !['READY','CLOSED'].includes(audio.phase) && <label className="flex items-start gap-2 text-sm leading-6"><input data-testid="audio-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{s('I agree to microphone capture and sending this recording to the interview server and its configured transcription provider. A local recovery copy is cleared after confirmation, cancellation, or when an expired copy is next opened.', 'أوافق على استخدام الميكروفون وإرسال التسجيل إلى خادم المقابلة ومزوّد التحويل إلى نص المهيأ فيه. تُمسح نسخة الاستعادة المحلية بعد التأكيد أو الإلغاء أو عند فتح نسخة منتهية الصلاحية مجدداً.')}</label>}
    <div className="flex flex-wrap gap-3">
      {listening && !blocked && !['READY', 'CLOSED'].includes(audio.phase) && <Button data-testid="audio-start" disabled={!consent || view.busy} onClick={() => void session.audio.start()}>{s('Start recording', 'بدء التسجيل')}</Button>}
      {audio.phase === 'RECORDING' && <Button data-testid="audio-stop" onClick={() => void session.audio.stop()}>{s('Stop recording', 'إيقاف التسجيل')}</Button>}
      {['READY', 'RETRY_REQUIRED'].includes(audio.phase) && <Button data-testid="audio-send" onClick={() => void session.audio.submit()}>{audio.phase === 'READY' ? s('Send recording', 'إرسال التسجيل') : s('Retry retained recording', 'إعادة إرسال التسجيل')}</Button>}
      {audio.pending && audio.phase !== 'RECORDING' && <Button data-testid="audio-check" variant="secondary" onClick={() => void session.audio.reconcile()}>{s('Check submission status', 'التحقق من حالة الإجابة')}</Button>}
      {audio.pending && audio.phase !== 'RECORDING' && <Button data-testid="audio-discard" variant="secondary" onClick={() => {if (window.confirm(s('Cancel this unconfirmed recording? It will not be submitted.', 'إلغاء هذا التسجيل غير المؤكد؟ لن يتم تقديمه.'))) void session.audio.discard()}}>{s('Cancel recording', 'إلغاء التسجيل')}</Button>}
    </div>
    <p className="text-xs leading-6 text-muted">{s('Audio uploads are limited to two minutes and the remaining server-controlled turn time. A local recording is not a saved answer.', 'رفع التسجيل محدود بدقيقتين وبوقت الدور المتبقي الذي يتحكم فيه الخادم. التسجيل المحلي ليس إجابة محفوظة.')}</p>
  </section>
}
