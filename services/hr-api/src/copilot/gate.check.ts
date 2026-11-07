import type { CopilotAction, CopilotIntent, Role } from '@hr/shared'
import { ACTION_CAPABILITY, mayDo } from './actions.js'
import { INTENT_ROLES, intentsFor, mayAsk } from './intents.js'
import { CAPABILITIES } from '../permissions.js'

/**
 * The gate, checked directly — no model involved.
 *
 * Everything else about this feature has been tested by asking the assistant
 * questions, which tests the classifier. This tests the thing the classifier is
 * not trusted with: what happens when an intent the asker may not use arrives
 * at the door anyway. It never calls a model, so its answer does not depend on
 * one behaving.
 */
const ROLES: Role[] = ['employee', 'manager', 'hr', 'admin']
const ALL = Object.keys(INTENT_ROLES) as CopilotIntent[]
const ALL_ACTIONS = Object.keys(ACTION_CAPABILITY) as CopilotAction[]

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
}

/*
 * Not about anyone else, so not covered by the rule below: `my*` is the asker's
 * own record, `outOfScope` is the refusal itself, `howDoI` asks how the system
 * works — "how do I book leave" reads no one's data and is answered from the
 * written guide — and `greeting` is somebody saying hello, which reads nothing
 * at all. An employee is right to be allowed every one of them.
 */
const ABOUT_NOBODY = (intent: CopilotIntent) =>
  intent.startsWith('my') ||
  intent === 'outOfScope' ||
  intent === 'howDoI' ||
  // A source is filtered by its explicit audience in the retrieval query.
  intent === 'knowledge' ||
  intent === 'greeting' ||
  /*
   * `doAction` reads nothing. It says "this sentence is an instruction", and
   * which instruction — and whether this person may give it — is settled
   * afterwards, per action, against the capability registry. Those are asserted
   * further down, and that is where an employee is held to their own record.
   */
  intent === 'doAction'

console.log('An employee is refused every question about anyone else:')
for (const intent of ALL) {
  if (ABOUT_NOBODY(intent)) continue
  check(!mayAsk('employee', intent), `employee → ${intent}`)
}

/* And is allowed the ones that are about nobody. */
console.log('\nAn employee may still ask about their own record and how things work:')
for (const intent of ALL.filter(ABOUT_NOBODY)) {
  check(mayAsk('employee', intent), `employee → ${intent}`)
}

console.log('\nA manager is refused every organisation-wide question:')
for (const intent of ['headcount', 'departmentBreakdown', 'orgAttendance', 'orgLeaveSummary', 'recruitmentSummary', 'whoIsPresentNow'] as CopilotIntent[]) {
  check(!mayAsk('manager', intent), `manager → ${intent}`)
}

console.log('\nEveryone can ask about themselves:')
for (const role of ROLES) {
  for (const intent of ['myAttendance', 'myLeaveBalance', 'myRequests', 'myPayslips'] as CopilotIntent[]) {
    check(mayAsk(role, intent), `${role} → ${intent}`)
  }
}

console.log('\nEvery intent is listed — none defaults to allowed by being forgotten:')
for (const intent of ALL) {
  check(Array.isArray(INTENT_ROLES[intent]) && INTENT_ROLES[intent].length > 0, `${intent} has an explicit role list`)
}

console.log('\nWhat is offered matches what is allowed:')
for (const role of ROLES) {
  const offered = intentsFor(role)
  check(
    offered.every((i) => mayAsk(role, i)),
    `${role}: every suggested question is one they may ask (${offered.length})`,
  )
}

/* ----------------------------------------------------------- doing things */

/*
 * The write side, which is where being wrong costs something.
 *
 * Reading the wrong thing shows a figure this person could already see. Writing
 * the wrong thing approves leave nobody approved. So these assert the property
 * the design rests on: the assistant's action gate is not a second opinion
 * about permissions, it is the same registry the routes are gated by.
 */
/*
 * An ungated capability is one about the asker themselves — that is what `null`
 * means in the registry. So the assertion is: an employee may do exactly those
 * and nothing else, which is the same as saying no gated capability quietly
 * includes them.
 *
 * Derived rather than listed. The list here was written out by hand and went
 * stale the first time an action was added, which is the failure it exists to
 * catch happening to itself.
 */
console.log('\nAn employee may only act on themselves:')
for (const action of ALL_ACTIONS) {
  const selfOnly = ACTION_CAPABILITY[action] === null || ACTION_CAPABILITY[action] === 'recordOwnAttendance'
  check(mayDo('employee', action) === selfOnly, `employee → ${action} ${selfOnly ? 'allowed' : 'refused'}`)
}

console.log('\nDeciding a request is the manager’s alone — through the assistant too:')
check(mayDo('manager', 'decideRequest'), 'manager may decide')
for (const role of ['employee', 'hr', 'admin'] as Role[]) {
  check(!mayDo(role, 'decideRequest'), `${role} may not decide`)
}

console.log('\nPay and passwords stay with HR and administrators:')
for (const action of ['runPayroll', 'resetPassword'] as CopilotAction[]) {
  check(mayDo('hr', action) && mayDo('admin', action), `hr and admin may ${action}`)
  check(!mayDo('employee', action) && !mayDo('manager', action), `employee and manager may not ${action}`)
}

/*
 * The one that would rot silently.
 *
 * Every gated action must agree with the capability it names, for every role.
 * If somebody narrows `runPayroll` in `permissions.ts` and the assistant keeps
 * offering it, this is what says so — the two cannot drift, because this reads
 * both and compares them.
 */
console.log('\nEvery action agrees with the capability it names, for every role:')
for (const action of ALL_ACTIONS) {
  const capability = ACTION_CAPABILITY[action]
  if (capability === null) {
    check(
      ROLES.every((r) => mayDo(r, action)),
      `${action} is about the asker themselves — open to every role`,
    )
    continue
  }
  const expected = CAPABILITIES[capability].roles as readonly Role[]
  check(
    ROLES.every((r) => mayDo(r, action) === expected.includes(r)),
    `${action} → ${capability} (${expected.join(', ')})`,
  )
}

console.log(`\n${failures === 0 ? 'the gate holds' : `${failures} FAILURES`}`)
process.exit(failures === 0 ? 0 : 1)
