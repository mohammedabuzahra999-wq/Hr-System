import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { serverEventSchema, type ServerEvent, type ServerEventType } from '@hr/shared'
import { LiveContext, type LiveContextValue, type LiveStatus } from './LiveContext'

const STREAM_URL = `${import.meta.env.VITE_API_URL ?? '/api'}/stream`

type Handler = (event: ServerEvent) => void

/**
 * One event stream for the whole app.
 *
 * Every screen that wants live data subscribes here instead of opening its own
 * connection: browsers cap concurrent connections per origin, and a dashboard
 * with eight live cards would spend that budget on eight copies of the same
 * feed. EventSource reconnects by itself, so there is no retry loop to write.
 */
export function LiveProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  // Derived from `enabled` at first render rather than set inside the effect,
  // which would cost an extra render before anything could connect.
  const [status, setStatus] = useState<LiveStatus>(enabled ? 'connecting' : 'offline')
  const handlers = useRef(new Map<symbol, { types: ServerEventType[] | null; handler: Handler }>())

  const subscribe = useCallback<LiveContextValue['subscribe']>((types, handler) => {
    const key = Symbol('subscriber')
    handlers.current.set(key, { types, handler })
    return () => {
      handlers.current.delete(key)
    }
  }, [])

  useEffect(() => {
    // No session, no stream: the endpoint would only answer 401. The status for
    // this case is derived below rather than stored, so nothing is set here.
    if (!enabled) return

    const source = new EventSource(STREAM_URL, { withCredentials: true })

    const onMessage = (raw: MessageEvent<string>) => {
      // Events are re-validated here: the client trusts its own contract, not
      // whatever happens to arrive on the socket.
      const parsed = serverEventSchema.safeParse(safeJson(raw.data))
      if (!parsed.success) return

      const event = parsed.data
      if (event.type === 'stream.ready') setStatus('open')

      for (const { types, handler } of handlers.current.values()) {
        if (types === null || types.includes(event.type)) handler(event)
      }
    }

    // Each event name is dispatched separately by EventSource, so every type the
    // contract knows about has to be registered.
    const types = serverEventSchema.options.map((option) => option.shape.type.value as ServerEventType)
    for (const type of types) source.addEventListener(type, onMessage as EventListener)

    source.onopen = () => setStatus('open')
    source.onerror = () => {
      // EventSource retries on its own; this only reflects the current state.
      setStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting')
    }

    return () => {
      for (const type of types) source.removeEventListener(type, onMessage as EventListener)
      source.close()
    }
  }, [enabled])

  const value = useMemo<LiveContextValue>(
    () => ({ status: enabled ? status : 'offline', subscribe }),
    [enabled, status, subscribe],
  )
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
