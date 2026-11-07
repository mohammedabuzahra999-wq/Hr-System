import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerEvent, ServerEventType } from '@hr/shared'
import { ApiError } from '@/lib/api'
import { useLive } from './LiveContext'

export interface LiveQuery<T> {
  data: T | null
  /** True only on the first load; a live refresh keeps the previous data on screen. */
  loading: boolean
  error: ApiError | null
  /** Refetch now. Also what the event subscription calls. */
  refresh: () => void
}

interface Options {
  /** Event types that make this data stale. Omit for a fetch that never refreshes. */
  on?: ServerEventType[]
  /** Narrow the trigger further, e.g. only my own attendance. */
  when?: (event: ServerEvent) => boolean
  /** Skip fetching entirely, e.g. before a session exists. */
  enabled?: boolean
}

/**
 * Fetches once, then refetches whenever the server says the data changed.
 *
 * The server pushes only "this changed" — never the row — so this refetches
 * through the same authorised endpoint rather than patching state from the
 * event. That keeps one source of truth and means an event a client should not
 * have received still cannot show it anything.
 *
 * A refresh keeps the previous data rendered until the new data lands, so a live
 * update never blanks the screen.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options: Options = {},
): LiveQuery<T> {
  const { on, when, enabled = true } = options
  const { subscribe } = useLive()

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<ApiError | null>(null)

  // Kept in refs so the effects below do not re-run when the caller passes a new
  // inline function on every render.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const whenRef = useRef(when)
  whenRef.current = when

  const requestId = useRef(0)

  const run = useCallback(async () => {
    if (!enabled) return
    const id = ++requestId.current
    try {
      const next = await fetcherRef.current()
      // A slower earlier request must not overwrite a newer result.
      if (id === requestId.current) {
        setData(next)
        setError(null)
      }
    } catch (e) {
      if (id === requestId.current) {
        setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e)))
      }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading((current) => (data === null ? true : current))
    void run()
    // The caller's deps decide when the query itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled])

  useEffect(() => {
    if (!enabled || !on || on.length === 0) return
    return subscribe(on, (event) => {
      if (whenRef.current && !whenRef.current(event)) return
      void run()
    })
  }, [subscribe, on, run, enabled])

  return { data, loading, error, refresh: run }
}
