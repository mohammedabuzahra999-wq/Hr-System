import 'dotenv/config'
import assert from 'node:assert/strict'
import { copilotPlanSchema } from '@hr/shared'
import { deterministicReadPlan, localTrainingPlan } from './training.js'
import { resolveQuestion } from './resolve.js'

const cases = [
  { input: 'Show me my leave balance', intent: 'myLeaveBalance', personName: null },
  { input: 'What is my leave balance?', intent: 'myLeaveBalance', personName: null },
  { input: 'ورجيني رصيد إجازاتي', intent: 'myLeaveBalance', personName: null },
  { input: 'كم رصيد إجازاتي؟', intent: 'myLeaveBalance', personName: null },
  { input: "Show Ahmed's employee details", intent: 'employeeFile', personName: 'Ahmed' },
  { input: "Show me Mohammad's employee information", intent: 'employeeFile', personName: 'Mohammad' },
  { input: 'ورجيني معلومات أحمد', intent: 'employeeFile', personName: 'أحمد' },
  { input: 'اعرض ملف محمد', intent: 'employeeFile', personName: 'محمد' },
  { input: "Please display Sara O’Neil’s employee profile.", intent: 'employeeFile', personName: 'Sara O’Neil' },
  { input: 'Show employee information for Lina Haddad', intent: 'employeeFile', personName: 'Lina Haddad' },
  { input: 'اعرض ملف الموظف عبد الرحمن علي', intent: 'employeeFile', personName: 'عبد الرحمن علي' },
  { input: 'Display my remaining annual leave balance', intent: 'myLeaveBalance', personName: null },
] as const

{
  const originalFetch = globalThis.fetch
  let modelCalls = 0
  globalThis.fetch = async () => { modelCalls += 1; throw new Error('Deterministic reads must not call a model') }
  try {
    for (const test of cases) {
      const result = await resolveQuestion(test.input, 'hr')
      assert.ok(result.ok, test.input)
      assert.equal(result.plan.intent, test.intent, test.input)
      assert.equal(result.plan.personName, test.personName, test.input)
      assert.ok(copilotPlanSchema.safeParse(result.plan).success)
      const local = localTrainingPlan(test.input, 'hr')
      assert.equal(local?.intent, test.intent)
      assert.equal(local?.personName, test.personName)
      if (test.intent === 'employeeFile') {
        const denied = await resolveQuestion(test.input, 'employee')
        assert.ok(denied.ok && denied.plan.intent === 'outOfScope' && denied.plan.refusalReason === 'notPermitted')
        for (const role of ['manager', 'admin'] as const) {
          const allowed = await resolveQuestion(test.input, role)
          assert.ok(allowed.ok && allowed.plan.intent === 'employeeFile' && allowed.plan.personName === test.personName)
        }
      } else {
        for (const role of ['employee', 'manager', 'admin'] as const) {
          const own = await resolveQuestion(test.input, role)
          assert.ok(own.ok && own.plan.intent === 'myLeaveBalance')
        }
      }
      console.log(JSON.stringify({ input: test.input, after: result.plan, pass: true }))
    }
    for (const input of ['Request leave for tomorrow', 'افتح ملف محمد', 'find employee Ahmed']) {
      assert.equal(localTrainingPlan(input, 'hr')?.intent, 'doAction', input)
      assert.equal(deterministicReadPlan(input, 'hr'), null, input)
    }
    for (const input of [
      'Show me my leave balance and approve my request',
      'Update my leave balance', 'What is her leave balance?',
      'Show employee information for all employees',
      'اعرض ملف الجميع',
    ]) {
      assert.equal(deterministicReadPlan(input, 'hr'), null, input)
    }
    assert.equal(modelCalls, 0)
    console.log('PASS: deterministic bilingual reads, generic names, RBAC, schema and existing action routing; zero AI calls')
  } finally { globalThis.fetch = originalFetch }
}
