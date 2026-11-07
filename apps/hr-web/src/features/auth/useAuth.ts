import { createContext, useContext } from 'react'
import type { SessionUser } from '@hr/shared'

/**
 * The signed-in user comes from the API, not from parsing the email.
 *
 * `role` is whatever the database says it is; nothing the browser can type
 * changes it. The session itself lives in an httpOnly cookie, so it is not
 * represented here at all — there is no token for a script to reach.
 */
export type User = SessionUser

export interface AuthContextValue {
  user: User | null
  /** True while the initial `/me` call decides whether a session already exists. */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
