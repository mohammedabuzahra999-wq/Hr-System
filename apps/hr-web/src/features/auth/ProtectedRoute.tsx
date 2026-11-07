import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '@hr/shared'
import { homePathFor, LANDING_PATH } from '@/lib/roles'
import { useAuth } from './useAuth'

interface ProtectedRouteProps {
  /** Roles allowed through. Omit to allow any signed-in user. */
  allow?: Role[]
}

/**
 * Signed-out visitors go to /login (and come back afterwards).
 * Signed-in users without the right role go to their own home page.
 *
 * This is convenience, not security: it decides what to render, while the API
 * decides what may be read. A user who edits the URL reaches a page that then
 * fails every request it makes.
 */
export function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Until `/auth/me` answers, a signed-in user reloading the page would
  // otherwise be bounced to the login screen and lose where they were.
  if (loading) return <SessionSplash />

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (allow && !allow.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return <Outlet />
}

/** Sends "/" to the assistant, which is where every session starts. */
export function RoleHomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <SessionSplash />
  return <Navigate to={user ? LANDING_PATH : '/login'} replace />
}

function SessionSplash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper" role="status" aria-live="polite">
      <span className="size-8 animate-spin rounded-full border-2 border-line border-t-brand" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
