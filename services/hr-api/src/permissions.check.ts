import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Role } from '@hr/shared'
import { CAPABILITIES, allowed, type CapabilityName } from './permissions.js'

/**
 * Who may do what is written once, in `permissions.ts`. This checks the routes
 * are the ones reading it.
 *
 * The value of a single registry is only that — single. The moment a handler
 * writes its own `requireRole('hr', 'admin')` beside itself, there are two
 * answers to "who can approve leave", they can disagree, and nothing says so:
 * both compile, both run, and the wrong one is whichever you did not read.
 *
 * So: every capability must be named by some route, every name a route uses
 * must exist, and no route may carry a role list written out by hand.
 * Deterministic — no database, no model, no network. It reads the route files
 * as text.
 */

const here = dirname(fileURLToPath(import.meta.url))
const routeDir = join(here, 'routes')
const files = readdirSync(routeDir).filter((f) => f.endsWith('.ts'))
const sources = files.map((f) => ({ file: f, text: readFileSync(join(routeDir, f), 'utf8') }))

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
}

const declared = Object.keys(CAPABILITIES) as CapabilityName[]
const used = new Map<string, string[]>()
for (const { file, text } of sources) {
  for (const m of text.matchAll(/allowed\('([a-zA-Z]+)'\)/g)) {
    const name = m[1]
    if (!name) continue
    used.set(name, [...(used.get(name) ?? []), file])
  }
}

console.log('Every capability in the registry is enforced by a route:')
for (const name of declared) {
  check(used.has(name), `${name} — ${(used.get(name) ?? ['nowhere']).join(', ')}`)
}

console.log('\nEvery capability a route names exists:')
for (const name of used.keys()) {
  check((declared as string[]).includes(name), name)
}

/* The registry is only useful while it is the one place a role list is written. */
console.log('\nNo route writes its own role list:')
for (const { file, text } of sources) {
  const inline = [...text.matchAll(/requireRole\((\s*'[^)]*)\)/g)].map((m) => m[0])
  check(inline.length === 0, `${file}${inline.length ? ` — ${inline.join(' ')}` : ''}`)
}

console.log('\nThe roles requireRole receives are the roles declared:')
for (const name of declared) {
  const fromRegistry = allowed(name)
  const asDeclared = [...CAPABILITIES[name].roles] as Role[]
  check(
    fromRegistry.length === asDeclared.length && fromRegistry.every((r, i) => r === asDeclared[i]),
    `${name} → ${fromRegistry.join(', ')}`,
  )
}

/* A capability nobody may use is a mistake, not a strict rule. */
console.log('\nNo capability is closed to everybody:')
for (const name of declared) check(allowed(name).length > 0, name)

console.log(
  failures === 0
    ? `\nthe routes match the registry — ${declared.length} capabilities, all enforced`
    : `\n${failures} mismatch(es)`,
)
process.exit(failures === 0 ? 0 : 1)
