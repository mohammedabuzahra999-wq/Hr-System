import type { Role } from '@hr/shared'

export type { Role }

export const LANDING_PATH = '/assistant'

/**
 * Where each role lands after signing in.
 *
 * Deriving a role from the email address used to live here. It is gone on
 * purpose: the role now comes from the database with the session, so typing
 * `someone.admin@company.com` no longer grants anything.
 */
export function homePathFor(role: Role) {
  switch (role) {
    case 'admin':
      return '/dashboard'
    case 'manager':
      return '/manager'
    case 'hr':
      return '/hr'
    default:
      return '/home'
  }
}
