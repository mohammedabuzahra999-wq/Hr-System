import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Role } from '@hr/shared'
import { GUIDE_PAGES } from './pages.js'
import { tourFor } from './tour.js'

/**
 * The tour shows every screen a role has, and drops none of them quietly.
 *
 * `tourFor` builds its stops by looking each path up in `GUIDE_PAGES` and
 * filtering out what it does not find. That filter is why the tour was short
 * without anybody noticing: a screen with no description was skipped, and a
 * skipped screen looks exactly like a screen nobody listed.
 *
 * So two things are asserted. Every path the tour asks for exists — a typo or
 * an undescribed screen fails here instead of vanishing. And every screen in
 * the sidebar is reached, because a tour that covers most of somebody's work
 * teaches them the rest does not matter.
 */

const here = dirname(fileURLToPath(import.meta.url))
const nav = readFileSync(join(here, '../../../../apps/hr-web/src/config/navigation.ts'), 'utf8')
const tourSource = readFileSync(join(here, 'tour.ts'), 'utf8')

const ROLES: Role[] = ['employee', 'manager', 'hr', 'admin']

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
}

/* Every path the tour names has something to say about it. */
const order = tourSource.slice(tourSource.indexOf('const ORDER'), tourSource.indexOf('\n}\n', tourSource.indexOf('const ORDER')))
const wanted = [...new Set([...order.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]!))]

console.log('Every screen the tour walks to is described:')
for (const path of wanted) {
  check(
    GUIDE_PAGES.some((g) => g.path === path),
    `${path}${GUIDE_PAGES.some((g) => g.path === path) ? '' : ' — no guide entry, so the stop is dropped in silence'}`,
  )
}

/* And nothing in the sidebar is left out. */
const links = [...nav.matchAll(/to: '([^']+)',[^}]*roles: \[([^\]]+)\]/g)].map((m) => ({
  to: m[1]!,
  roles: m[2]!.replace(/'/g, '').split(',').map((s) => s.trim()),
}))

console.log('\nEvery screen in the menu is a stop:')
for (const role of ROLES) {
  const stops = tourFor(role, null).stops.map((s) => s.path)
  const screens = [...new Set(links.filter((l) => l.roles.includes(role) && l.to !== '/logout').map((l) => l.to))]
  const missed = screens.filter((s) => !stops.includes(s))
  check(missed.length === 0, `${role}: ${stops.length} stops for ${screens.length} screens${missed.length ? ` — missing ${missed.join(', ')}` : ''}`)
}

/* A stop shown twice reads as the tour losing its place. */
console.log('\nNo screen is visited twice:')
for (const role of ROLES) {
  const stops = tourFor(role, null).stops.map((s) => s.path)
  const dupes = stops.filter((s, i) => stops.indexOf(s) !== i)
  check(dupes.length === 0, `${role}${dupes.length ? ` — repeats ${[...new Set(dupes)].join(', ')}` : ''}`)
}

console.log(failures === 0 ? '\nthe tour is complete' : `\n${failures} problem(s)`)
process.exit(failures === 0 ? 0 : 1)
