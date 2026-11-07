import { useEffect } from 'react'
import { PRESENCE_PING_MS } from '@hr/shared'
import { api } from '@/lib/api'

/**
 * Tells the server this app is open, for as long as it is.
 *
 * Presence used to be read from the live event stream, on the reasoning that an
 * open socket means an open app. It does — but a *closed* socket turned out not
 * to mean a closed app reliably: a browser that went away left the server
 * holding a connection it never noticed had died, and the person stayed "online"
 * indefinitely. Detecting absence by waiting for something to break is the wrong
 * way round.
 *
 * So the app says so instead, and stops saying so when it is closed. Nothing has
 * to be detected: the pings just stop arriving, and the window on the server
 * elapses.
 *
 * It also stops while the tab is hidden, which is the honest reading of "has the
 * app open" — a minimised browser or a phone in a pocket is not someone at work
 * in the system. They fall back to "just been here" rather than disappearing.
 */
export function usePresencePing(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const ping = () => {
      // A failed ping is not worth reporting: the reading goes stale for a
      // minute and the next one corrects it.
      if (!cancelled && document.visibilityState === 'visible') void api.post('/feed/ping').catch(() => {})
    }

    ping()
    const timer = setInterval(ping, PRESENCE_PING_MS)
    // Coming back to the tab should show up immediately, not at the next tick.
    document.addEventListener('visibilitychange', ping)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [enabled])
}
