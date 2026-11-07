import { Button } from '@/components/ui/Button'
import type { InterviewSession, InterviewView } from './session'
import { useInterviewCopy } from './copy'

export function PlaybackPanel({session,view}:{session:InterviewSession;view:InterviewView}){
  const {s}=useInterviewCopy(),p=view.playback
  if(!view.playbackEnabled||!view.state)return null
  const labels={IDLE:s('Question audio is available on request.','صوت السؤال متاح عند الطلب.'),GENERATING:s('Preparing audio…','جارٍ تجهيز الصوت…'),READY:s('Audio ready. Press Play to listen.','الصوت جاهز. اضغط تشغيل للاستماع.'),PLAYING:s('Playing question audio…','جارٍ تشغيل صوت السؤال…'),STOPPED:s('Playback stopped. Resume the interview to prepare fresh audio.','توقف الصوت. استأنف المقابلة لتجهيز صوت جديد.'),COMPLETED:s('Playback completed.','اكتمل التشغيل.'),ERROR:s('Playback needs attention. Reconnect or retry safely.','تعذر التشغيل. أعد الاتصال أو حاول مجدداً.')}
  return <section data-testid="tts-playback" data-playback-phase={p.phase} className="mb-5 rounded-2xl border border-line bg-surface p-5">
    <p role="status" className="text-sm">{labels[p.phase]}</p>
    {p.reason==='autoplayBlocked'&&<p role="alert">{s('The browser blocked audio. Resume, then press Play yourself.','منع المتصفح الصوت. استأنف ثم اضغط تشغيل بنفسك.')}</p>}
    {p.reason==='stopping'&&<p>{s('Stopped on this device; confirming with the server…','توقف الصوت على هذا الجهاز؛ جارٍ التأكيد مع الخادم…')}</p>}
    <div className="mt-3 flex flex-wrap gap-3">
      {p.phase==='IDLE'&&<Button data-testid="tts-prepare" disabled={p.busy||view.state.status!=='ACTIVE'||!view.state.delivery} onClick={()=>void session.playback.prepare()}>{s('Prepare audio','تجهيز الصوت')}</Button>}
      {p.phase==='READY'&&<Button data-testid="tts-play" disabled={p.busy} onClick={()=>void session.playback.play()}>{s('Play audio','تشغيل الصوت')}</Button>}
      {['GENERATING','READY','PLAYING'].includes(p.phase)&&<Button data-testid="tts-stop" variant="secondary" onClick={()=>void session.playback.stop()}>{s('STOP audio','إيقاف الصوت')}</Button>}
      {p.phase==='ERROR'&&<Button data-testid="tts-retry" disabled={p.busy} onClick={()=>void session.playback.retry()}>{s('Check / retry audio','تحقق / أعد محاولة الصوت')}</Button>}
    </div>
  </section>
}
