import 'dotenv/config'
import { copilotPlanSchema } from '@hr/shared'
import { env } from '../env.js'
import { resolveQuestion } from './resolve.js'

if (env.AI_PROVIDER !== 'ollama') throw new Error('Run this check with AI_PROVIDER=ollama')

const cases = [
  { input: 'Show me my leave balance', intent: 'myLeaveBalance' },
  { input: "Show Ahmed's overtime last month", intent: 'employeeFile', person: 'Ahmed', period: 'lastMonth' },
  { input: 'ورجيني رصيد إجازاتي', intent: 'myLeaveBalance' },
  { input: 'كم أوفرتايم أحمد الشهر الماضي', intent: 'employeeFile', person: 'أحمد', period: 'lastMonth' },
  { input: 'ورجيني overtime تبع أحمد الشهر الماضي', intent: 'employeeFile', person: 'أحمد', period: 'lastMonth' },
  { input: 'What is the weather on Mars?', intent: 'outOfScope', refusal: 'notHrData' },
  // Classification only: duplicate employee names are resolved by the later, unchanged lookup flow.
  { input: "Show Ahmed's employee details", intent: 'employeeFile', person: 'Ahmed' },
] as const
const originalFetch = globalThis.fetch
let calls = 0
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const expected = new URL(env.OLLAMA_BASE_URL)
  if (url.origin !== expected.origin || !url.pathname.endsWith('/api/chat')) {
    throw new Error('Unexpected provider request')
  }
  calls += 1
  return originalFetch(input, init)
}
let failures = 0
const modelTimings: number[] = []
try {
  for (const test of cases) {
    const start = performance.now()
    const before = calls
    const result = await resolveQuestion(test.input, 'hr')
    const seconds = (performance.now() - start) / 1000
    const modelCalled = calls > before
    if (modelCalled) modelTimings.push(seconds)
    const plan = result.ok ? result.plan : null
    const pass = plan !== null && copilotPlanSchema.safeParse(plan).success
      && plan.intent === test.intent
      && (!('person' in test) || plan.personName?.toLowerCase() === test.person.toLowerCase())
      && (!('period' in test) || plan.period === test.period)
      && (!('refusal' in test) || plan.refusalReason === test.refusal)
    if (!pass) failures += 1
    console.log(JSON.stringify({ input: test.input, role: 'hr', pass, seconds: +seconds.toFixed(3),
      source: modelCalled ? 'ollama' : 'preserved local rules', ...result }))
  }
} finally {
  globalThis.fetch = originalFetch
}
if (!calls) failures += 1
console.log(JSON.stringify({ failures, modelCalls: calls, modelClassifications: modelTimings.length,
  averageOllamaSeconds: modelTimings.length ? +(modelTimings.reduce((a, b) => a + b, 0) / modelTimings.length).toFixed(3) : null }))
if (failures) process.exitCode = 1
