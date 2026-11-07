import type { Role, Tour, TourStop } from '@hr/shared'
import { GUIDE_PAGES } from './pages.js'

/**
 * The introductory tour, built from the page entries.
 *
 * Not a second hand-written script. The assistant already knows what every
 * screen is for; the tour is that knowledge walked through in order, so the two
 * cannot describe the same screen differently — which two hand-maintained lists
 * would, within a month.
 *
 * Ordered as the sidebar is, because that is the order the person will meet
 * these screens afterwards.
 */


/** The order each role's sidebar lists things in. */
/**
 * Which screens the tour walks, in the order they make sense.
 *
 * Every role starts at the assistant, because that is where their session
 * starts and it is the one screen whose purpose is not obvious from its name.
 * After that the order follows the work: the overview, then the things done
 * daily, then the ones reached occasionally.
 *
 * Kept complete deliberately. A tour that covers five of a manager's nine
 * screens teaches them that four of them do not matter, which is worse than
 * no tour — they will not go looking for what they were not shown.
 */
const ORDER: Record<Role, string[]> = {
  employee: ['/assistant', '/home'],
  manager: [
    '/assistant',
    '/manager',
    '/manager/team',
    '/manager/attendance',
    '/manager/leaves',
    '/manager/approvals',
    '/manager/calendar',
    '/manager/reports',
    '/manager/announcements',
    '/manager/profile',
  ],
  hr: [
    '/assistant',
    '/hr',
    '/hr/employees',
    '/hr/attendance',
    '/hr/leaves',
    '/hr/payroll',
    '/hr/job-descriptions',
    '/hr/recruitment',
    '/hr/reports',
    '/hr/announcements',
  ],
  admin: ['/assistant', '/admin', '/dashboard', '/admin/users', '/admin/approvals', '/admin/announcements'],
}


export function tourFor(role: Role, completedAt: Date | null): Tour {
  const stops: TourStop[] = ORDER[role]
    .map((path) => GUIDE_PAGES.find((p) => p.path === path && p.roles.includes(role)))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      path: p.path,
      title: p.title,
      /**
       * Purpose, then the first thing they can do.
       *
       * A tour that only says what a screen is for is a list of nouns. One
       * concrete action per stop is what makes it usable afterwards.
       */
      body: {
        en: p.actions[0] ? `${p.purpose.en} ${p.actions[0].en}` : p.purpose.en,
        ar: p.actions[0] ? `${p.purpose.ar} ${p.actions[0].ar}` : p.purpose.ar,
      },
      highlight: `a[href="${p.path}"]`,
    }))

  return { shouldOffer: completedAt === null, stops }
}
