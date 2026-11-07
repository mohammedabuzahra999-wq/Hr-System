import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessionUser } from '@hr/shared'
import { api, ApiError } from '@/lib/api'
import { LiveProvider } from '@/features/realtime/LiveProvider'
import { AuthContext } from './useAuth'

/**
 * Real authentication against the API.
 *
 * Nothing about the session is stored in the browser: it is an httpOnly cookie
 * the server sets, so a script cannot read it and signing out on the server ends
 * it immediately. On boot the app asks `/auth/me` whether a session exists
 * rather than trusting anything it kept locally.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    api
      .get<{ user: SessionUser }>('/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.user)
      })
      .catch((error: unknown) => {
        // 401 is the ordinary "not signed in" answer, not a failure worth logging.
        if (!(error instanceof ApiError) || !error.isUnauthenticated) {
          console.error('[auth] could not restore the session:', error)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: SessionUser }>('/auth/login', { email, password })
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      // Whatever the server said, this browser is done with the session.
      setUser(null)
    }
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.post('/auth/change-password', { currentPassword, newPassword })
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, changePassword }),
    [user, loading, login, logout, changePassword],
  )

  return (
    <AuthContext.Provider value={value}>
      {/* The stream only runs for a signed-in user; without one it would just 401. */}
      <LiveProvider enabled={user !== null}>{children}</LiveProvider>
    </AuthContext.Provider>
  )
}
