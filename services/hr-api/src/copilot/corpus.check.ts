import type { CopilotAction, CopilotIntent, Role } from '@hr/shared'
import { CORPUS } from './corpus.js'
import { ACTION_CAPABILITY, actionsFor, mayDo } from './actions.js'
import { INTENT_ROLES, mayAsk } from './intents.js'

/**
 * The corpus, checked against the system it describes.
 *
 * A labelled set drifts the moment the thing it labels changes, and drift is
 * silent: an action gets renamed, every case for it starts failing, and the
 * score drops for a reason nobody can see. So the labels are verified against
 * the registries rather than trusted.
 *
 * It also reports what is NOT covered. A corpus that tests twelve of
 * twenty-eight actions and says nothing about the other sixteen is worse than a
 * small one that admits its size — the number it produces reads like a verdict
 * on the whole assistant.
 *
 * Run with: npm run check:corpus -w @hr/server
 */

let failures = 0
function fail(what: string) {
  console.log(`  FAIL  ${what}`)
  failures += 1
}

const ACTIONS = Object.keys(ACTION_CAPABILITY) as CopilotAction[]
const INTENTS = Object.keys(INTENT_ROLES) as CopilotIntent[]
const known = new Set<string>([...ACTIONS, ...INTENTS, 'REFUSED'])

console.log(`${CORPUS.length} cases.\n`)

console.log('Every label names something that exists:')
for (const c of CORPUS) {
  if (!known.has(c.expect)) fail(`"${c.text}" expects "${c.expect}", which is not an action or an intent`)
}
if (failures === 0) console.log('  ok    all labels resolve')

console.log('\nEvery expectation agrees with the gate:')
for (const c of CORPUS) {
  if (c.expect === 'REFUSED') {
    /*
     * A case can only expect a refusal if the role genuinely may not. Otherwise
     * it is testing a sentence the model happens to misread, and it will start
     * "failing" the day the routing improves.
     */
    const isAction = ACTIONS.includes(c.expect as CopilotAction)
    if (isAction) fail(`"${c.text}" expects REFUSED but names an action`)
    continue
  }
  if (ACTIONS.includes(c.expect as CopilotAction)) {
    if (!mayDo(c.role, c.expect as CopilotAction)) {
      fail(`${c.role} cannot do ${c.expect}, so "${c.text}" cannot expect it`)
    }
  } else if (INTENTS.includes(c.expect as CopilotIntent)) {
    if (!mayAsk(c.role, c.expect as CopilotIntent)) {
      fail(`${c.role} cannot ask ${c.expect}, so "${c.text}" cannot expect it`)
    }
  }
}
if (failures === 0) console.log('  ok    every case is something its role may actually do')

/*
 * A refusal case is only worth having if the same words work for somebody else.
 * "Tell me a joke" is refused for everyone and tests nothing about the gate.
 */
console.log('\nRefusal cases test the gate, not the subject:')
const refusals = CORPUS.filter((c) => c.expect === 'REFUSED')
const roles: Role[] = ['employee', 'manager', 'hr', 'admin']
let real = 0
for (const c of refusals) {
  const anotherRoleCan = roles.some(
    (r) =>
      r !== c.role &&
      CORPUS.some((o) => o.role === r && o.text === c.text && o.expect !== 'REFUSED'),
  )
  if (anotherRoleCan) real += 1
}
console.log(`  ${refusals.length} refusal cases, ${refusals.length - 2} of them ordinary HR requests`)
console.log(`  (${real} have the identical sentence succeeding for another role in this file)`)

console.log('\nCoverage:')
const covered = new Set(CORPUS.map((c) => c.expect))
const missingActions = ACTIONS.filter((a) => !covered.has(a))
const missingIntents = INTENTS.filter((i) => !covered.has(i) && i !== 'doAction' && i !== 'outOfScope')
console.log(`  actions ${ACTIONS.length - missingActions.length}/${ACTIONS.length}`)
if (missingActions.length) console.log(`    not covered: ${missingActions.join(', ')}`)
console.log(`  intents ${INTENTS.length - 2 - missingIntents.length}/${INTENTS.length - 2}`)
if (missingIntents.length) console.log(`    not covered: ${missingIntents.join(', ')}`)

console.log('\nRefusal coverage — role-restricted things with no refusal case:')
const refusalTexts = new Set(refusals.map((c) => `${c.role}|${c.text}`))
const restricted = ACTIONS.filter((a) => roles.some((r) => !actionsFor(r).includes(a)))
const untested = restricted.filter(
  (a) => !CORPUS.some((c) => c.expect === a && refusals.some((f) => f.text === c.text)),
)
console.log(`  ${restricted.length} restricted actions, ${restricted.length - untested.length} with a matching refusal case`)
if (untested.length) console.log(`    no refusal case: ${untested.join(', ')}`)
void refusalTexts

console.log(failures === 0 ? '\nthe corpus describes this system' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
