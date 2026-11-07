import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { InterviewSession } from './session'

export const INTERVIEW_DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_AI_INTERVIEW_DEV_MOCK === 'true'
export function useInterviewSession() {
  const navigate = useNavigate()
  const [session] = useState(() => new InterviewSession())
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => {
    void session.initialize(new URLSearchParams(window.location.search).get('token'), window.location.pathname === '/interview/join',
      success => { void navigate(success ? '/interview/session' : '/interview/join', { replace: true }) })
    let lastIdlePoll = 0
    const interval = window.setInterval(() => {
      session.answers.tick()
      const current = session.getSnapshot()
      if (!current.state || current.connection === 'expired' || ['COMPLETED', 'CANCELLED'].includes(current.state.status)) return
      if (current.state.status === 'READY') {
        if (performance.now() - lastIdlePoll < 5000) return
        lastIdlePoll = performance.now()
      }
      void session.sync()
    }, 1500)
    const protectUnpersisted = (event: BeforeUnloadEvent) => {
      const answer = session.answers.getSnapshot()
      const audio = session.audio.getSnapshot()
      if ((answer.text && !answer.persisted) || ['PERMISSION', 'RECORDING', 'UPLOADING', 'PROCESSING'].includes(audio.phase) || (audio.pending && !audio.persisted)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', protectUnpersisted)
    return () => { window.clearInterval(interval); window.removeEventListener('beforeunload', protectUnpersisted); session.answers.detach(); session.audio.detach(); session.playback.detach() }
  }, [session, navigate])
  return { session, ...view, mockEnabled: INTERVIEW_DEV_MOCK && view.mockEnabled }
}
