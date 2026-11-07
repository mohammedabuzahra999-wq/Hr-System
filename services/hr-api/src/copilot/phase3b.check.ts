import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { deterministicReadDecision } from './readRules.js'
import { maintainedHelpDecision } from '../guide/helpRouting.js'
import { validateCopilotPlan } from './validatePlan.js'
import { deterministicReadPlan } from './training.js'
import { captureCases, score } from './benchmark/run.js'
import { CASES } from './benchmark/cases.js'
import { isGuideQuestion, answerGuide } from '../guide/answer.js'
import { guideAnswerSchema } from '@hr/shared'

const original = globalThis.fetch
globalThis.fetch = async () => { throw new Error('Network forbidden in Phase 3B checks') }
try {
  for (const question of ['Who on my team is connected?', 'List my direct reports online now',
    'Which of my direct reports are online?', 'مين من فريقي متصل الآن؟', 'اعرض المتصلين من فريقي حاليا']) {
    const result = deterministicReadDecision(question)
    assert.equal(result.kind, 'resolved', question)
    if (result.kind === 'resolved') {
      assert.equal(result.plan.intent, 'teamPresentNow')
      assert.ok(validateCopilotPlan(result.plan, 'deterministic').ok)
    }
    assert.equal(deterministicReadPlan(question, 'employee')?.intent, 'outOfScope')
  }
  for (const question of ['Who on my team is present in the office now?', 'Who is online?',
    'Which members of my project team are online?', 'Who on my team is online and absent?',
    'Show my team clocked in now', 'Who on my team was online yesterday?']) {
    assert.equal(deterministicReadDecision(question).kind, 'abstain', question)
  }
  for (const question of ['How can I submit a sick leave request?', 'How to request vacation?',
    'كيف أقدم طلب إجازة؟', 'كيف اقدم طلب اجازه؟', 'كيف أطلب إجازة سنوية؟']) {
    assert.equal(maintainedHelpDecision(question, 'employee').kind, 'resolved', question)
    assert.ok(isGuideQuestion(question, 'employee'))
    const answer = await answerGuide(question, 'employee', undefined)
    assert.ok(guideAnswerSchema.safeParse(answer).success)
  }
  for (const question of ['How do I repair the database?', 'How can I do that?',
    'How do I request leave and submit it?', 'How to request leave for somebody else?']) {
    assert.equal(maintainedHelpDecision(question, 'employee').kind, 'abstain', question)
    assert.equal(isGuideQuestion(question, 'employee', '/me'), false)
  }
  assert.equal(maintainedHelpDecision('Submit my leave request', 'employee').kind, 'unmatched')
  assert.equal(maintainedHelpDecision('How do I request leave?', 'hr').kind, 'abstain')
  const captured = await captureCases()
  const previousLocal = new Set(['en-help', 'ar-weather', 'mixed-ambiguous',
    'local-en-leave', 'local-ar-leave', 'local-en-person', 'local-ar-person'])
  const rows = CASES.filter(c => !previousLocal.has(c.id)).map(test => {
    const local = captured.excluded.find(c => c.id === test.id)
    if (!local) return { id: test.id, route: 'model' }
    const result = local.plan as { ok: boolean; plan: unknown }
    assert.ok(result.ok)
    const validated = validateCopilotPlan(result.plan, 'deterministic')
    assert.ok(validated.ok)
    assert.ok(score(JSON.stringify({ plan: result.plan }), test.expected).complete, test.id)
    return { id: test.id, route: 'local', intent: test.expected.intent }
  })
  const model = rows.filter(r => r.route === 'model').map(r => r.id)
  assert.deepEqual(model.sort(), ['en-pay', 'en-headcount', 'en-requests', 'en-weather',
    'mixed-weather', 'en-science', 'en-ambiguous', 'ar-ambiguous'].sort())
  const report = { total: rows.length, local: rows.length - model.length, model: model.length,
    incorrectLocal: 0, realProviderCalls: 0, rows }
  writeFileSync('hybrid-phase3b-coverage.json', JSON.stringify(report, null, 2))
  console.log('PASS Phase 3B routing, abstention, role visibility, validation and historical coverage', JSON.stringify(report))
} finally { globalThis.fetch = original }
