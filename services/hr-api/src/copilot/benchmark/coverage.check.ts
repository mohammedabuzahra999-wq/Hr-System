import 'dotenv/config'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CASES } from './cases.js'
import { captureCases, score } from './run.js'
import { validateCopilotPlan } from '../validatePlan.js'
import type { CopilotPlan } from '@hr/shared'

// Historical partition identifiers only. No routing logic uses this list.
const previousLocal = new Set(['en-help', 'ar-weather', 'mixed-ambiguous',
  'local-en-leave', 'local-ar-leave', 'local-en-person', 'local-ar-person'])
const original = globalThis.fetch
globalThis.fetch = async () => { throw new Error('Network forbidden in offline coverage measurement') }
try {
  const captured = await captureCases()
  const baseline = CASES.filter(test => !previousLocal.has(test.id))
  assert.equal(baseline.length, 26)
  const rows = baseline.map(test => {
    const local = captured.excluded.find(row => row.id === test.id)
    if (!local) {
      assert.ok(captured.included.some(row => row.test.id === test.id))
      return { id: test.id, input: test.input, expected: test.expected, route: 'model' as const }
    }
    const outcome = local.plan as { ok: boolean; plan: CopilotPlan; routingRule?: string }
    assert.ok(outcome.ok)
    assert.ok(validateCopilotPlan(outcome.plan, 'deterministic').ok)
    const exact = score(JSON.stringify({ plan: outcome.plan }), test.expected).complete
    assert.equal(exact, true, `Incorrect new local route: ${test.id}`)
    return { id: test.id, input: test.input, expected: test.expected, route: 'deterministic' as const,
      actual: outcome.plan, routingRule: outcome.routingRule, exact }
  })
  const local = rows.filter(row => row.route === 'deterministic')
  const report = { mode: 'offline-only', fixtureHash: createHash('sha256').update(JSON.stringify(CASES)).digest('hex'),
    historicalModelCases: baseline.length, nowLocal: local.length, remainingModel: rows.length - local.length,
    incorrectLocal: local.filter(row => !row.exact).length, localAccuracy: local.length ? 1 : null,
    allLocalPlansValidated: true, realProviderCalls: 0,
    byIntent: Object.fromEntries([...new Set(local.map(row => row.expected.intent))]
      .map(intent => [intent, local.filter(row => row.expected.intent === intent).length])), rows }
  writeFileSync('hybrid-phase2-coverage.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { globalThis.fetch = original }
