import { createContext, useContext } from 'react'
import type { ServerEvent, ServerEventType } from '@hr/shared'

export type LiveStatus = 'connecting' | 'open' | 'offline'

export interface LiveContextValue {
  status: LiveStatus
  /**
   * Listen for server events. Returns an unsubscribe function.
   * Passing no types listens to everything.
   */
  subscribe: (types: ServerEventType[] | null, handler: (event: ServerEvent) => void) => () => void
}

export const LiveContext = createContext<LiveContextValue | null>(null)

export function useLive() {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>')
  return ctx
}
