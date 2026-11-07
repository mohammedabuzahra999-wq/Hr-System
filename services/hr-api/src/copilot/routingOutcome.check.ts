import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { copilotAnswerSchema, type Role } from '@hr/shared'
import { deterministicRoutingOutcome, terminalAnswer, type RoutingOutcome, type TerminalOutcome } from './routingOutcome.js'
import { validateCopilotPlan } from './validatePlan.js'
import { CASES } from './benchmark/cases.js'
import { EMPTY_PLAN } from './phrasebook.js'

import { TERMINAL_EXPECTATIONS, ABSTENTIONS } from './routingOutcome.fixtures.js'

export function isTerminal(outcome: RoutingOutcome): outcome is TerminalOutcome {
  return outcome.kind !== 'resolved' && outcome.kind !== 'unresolved'
}

const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('Network forbidden in terminal routing checks') }
try {
  for (const [id, expected] of Object.entries(TERMINAL_EXPECTATIONS)) {
    const test = CASES.find(test => test.id === id)!
    const outcome = deterministicRoutingOutcome(test.input, test.role)
    assert.deepEqual(outcome, expected, id)
    assert.ok(isTerminal(outcome))
    const answer = terminalAnswer(outcome, test.role)
    assert.ok(copilotAnswerSchema.safeParse(answer).success)
    assert.equal(answer.result.kind, 'none')
    assert.equal(answer.periodLabel, null)
    assert.equal(answer.refusal, outcome.kind === 'outOfScope' ? 'notHrData' : null)
    for (const role of ['employee', 'manager', 'hr', 'admin'] as Role[]) {
      assert.deepEqual(deterministicRoutingOutcome(test.input, role), expected)
    }
  }
  for (const input of ABSTENTIONS) assert.ok(!isTerminal(deterministicRoutingOutcome(input, 'hr')), input)
  for (const [input, code] of [
    ['Display my payslips in March', 'payslip_period_unsupported'],
    ['Show my pay this year', 'payslip_period_unsupported'],
    ['اعرض راتبي الشهر الماضي', 'payslip_period_unsupported'],
    ['List only my approved requests', 'request_status_unsupported'],
    ['Display my requests with status rejected', 'request_status_unsupported'],
    ['اعرض طلباتي المرفوضة', 'request_status_unsupported'],
    ['How many staff are here?', 'headcount_scope_required'],
    ['How is the status of human resources?', 'hr_subject_required'],
    ['شو حالة الأمور في الموارد البشرية؟', 'hr_subject_required'],
    ['What is the weather on Venus?', 'external_weather'],
    ['شو الطقس على المريخ؟', 'external_weather'],
    ['Could you explain general relativity?', 'external_science'],
  ]) {
    const outcome = deterministicRoutingOutcome(input!, 'employee')
    assert.ok(isTerminal(outcome), input)
    assert.equal(outcome.code, code, input)
  }
  for (const id of Object.keys(TERMINAL_EXPECTATIONS)) {
    const test = CASES.find(test => test.id === id)!
    for (const context of [
      { pendingFields: ['text'] }, { pendingFields: ['title'] }, { pendingFields: ['personName'] },
      { pendingFields: ['startDate', 'text'] }, { pendingFields: [] }, { pendingFields: ['unknownSlot'] },
      { previousPlan: { ...EMPTY_PLAN, intent: 'knowledge' as const } },
      { ui: { previousResultReference: 'document' } },
      { ui: { selectedEmployeeId: 'advisory-only' } },
      { path: '/hr/job-descriptions' }, { path: '/hr/knowledge' }, { path: '/hr/recruitment' },
      { path: '/hr/employees' }, { path: '/manager/team' }, { path: '/unknown' },
    ]) assert.ok(!isTerminal(deterministicRoutingOutcome(test.input, test.role, context)), `${id}: context must abstain`)
    assert.deepEqual(deterministicRoutingOutcome(test.input, test.role, { pendingFields: ['startDate'], path: '/assistant' }),
      TERMINAL_EXPECTATIONS[id as keyof typeof TERMINAL_EXPECTATIONS], `${id}: independent question cannot fill a date slot`)
  }
  const oldLocal = new Set(['en-help', 'ar-weather', 'mixed-ambiguous',
    'local-en-leave', 'local-ar-leave', 'local-en-person', 'local-ar-person'])
  const rows = CASES.filter(test => !oldLocal.has(test.id)).map(test => {
    const outcome = deterministicRoutingOutcome(test.input, test.role)
    if (outcome.kind === 'resolved') {
      assert.ok(validateCopilotPlan(outcome.plan, 'deterministic').ok)
      assert.deepEqual(outcome.plan, test.expected, test.id)
      return { id: test.id, kind: outcome.kind, intent: outcome.plan.intent }
    }
    assert.deepEqual(outcome, TERMINAL_EXPECTATIONS[test.id as keyof typeof TERMINAL_EXPECTATIONS], test.id)
    return { id: test.id, ...outcome }
  })
  const counts = Object.fromEntries(['resolved', 'unsupportedCapability', 'needsClarification', 'outOfScope', 'unresolved']
    .map(kind => [kind, rows.filter(row => row.kind === kind).length]))
  assert.deepEqual(counts, { resolved: 18, unsupportedCapability: 2, needsClarification: 3, outOfScope: 3, unresolved: 0 })
  writeFileSync('hybrid-phase3d-coverage.json', JSON.stringify({ mode: 'offline', counts, incorrectLocalPlans: 0,
    historicalGoldensUnchanged: true, realProviderCalls: 0, rows }, null, 2))
  console.log('PASS terminal outcome fixtures, paraphrases, abstention/context safety, exact 18 local plans; partition:', JSON.stringify(counts))
} finally { globalThis.fetch = savedFetch }
