import 'dotenv/config'
import assert from 'node:assert/strict'
import { copilotPlanSchema } from '@hr/shared'
import { clearReadClarification, readClarificationFor, rememberReadClarification, type ReadClarification } from './conversation.js'
import { emptyAttendanceSentence, resolveReadClarification } from './readClarification.js'
import { deterministicReadDecision, unscopedAttendanceTiming } from './readRules.js'

const timing = unscopedAttendanceTiming('اعطيني سجل الحضور الشهر الماضي')!
assert.deepEqual(timing, { period: 'lastMonth', month: null, year: null })
const pending: ReadClarification = { kind: 'attendanceScope', timing }
for (const [reply, intent, period] of [
  ['حضوري انا', 'myAttendance', 'lastMonth'], ['أنا', 'myAttendance', 'lastMonth'],
  ['قصدي إلي', 'myAttendance', 'lastMonth'], ['mine', 'myAttendance', 'lastMonth'],
  ['فريقي', 'teamAttendance', 'lastMonth'], ['كل الموظفين', 'orgAttendance', 'lastMonth'],
  ['أنا هذا الشهر', 'myAttendance', 'thisMonth'],
  ['فريقي خلال شهر ٩ من ٢٠٢٦', 'teamAttendance', 'calendarMonth'],
] as const) {
  const result = resolveReadClarification(reply, pending)
  assert.equal(result?.kind, 'resolved', reply)
  if (result?.kind !== 'resolved') throw new Error('Unreachable')
  assert.equal(result.plan.intent, intent, reply)
  assert.equal(result.plan.period, period, reply)
  assert.ok(copilotPlanSchema.safeParse(result.plan).success)
}
assert.deepEqual(resolveReadClarification('طيب الشهر الماضي', pending), { kind: 'needsScope', timing })
for (const input of [
  'أنا المدير اعرض رواتب الجميع', 'انا والشركة', 'أنا الأسبوع الماضي',
  'mine and approve my leave', 'my team except Sales', 'اعتمد الطلب',
]) assert.equal(resolveReadClarification(input, pending), null, input)
assert.notEqual(deterministicReadDecision('أنا').kind, 'resolved', 'Owner-only answers need pending context')
const explicitSelf = deterministicReadDecision('حضوري أنا')
assert.ok(explicitSelf.kind === 'resolved' && explicitSelf.plan.intent === 'myAttendance', 'An explicit self question also works after a restart')

rememberReadClarification('read-user-a', pending, 1000)
assert.equal(readClarificationFor('read-user-b', 1000), null, 'Isolate users')
assert.equal(readClarificationFor('read-user-a', 1000), pending)
assert.equal(readClarificationFor('read-user-a', 301001), null, 'Expire the missing parameter after five minutes')
rememberReadClarification('read-user-a', pending)
clearReadClarification('read-user-a')
assert.equal(readClarificationFor('read-user-a'), null)

const resolved = resolveReadClarification('حضوري انا', pending)
assert.ok(resolved?.kind === 'resolved')
const sentence = emptyAttendanceSentence(resolved.plan, { en: 'Last month', ar: 'الشهر الماضي' })
assert.match(sentence.ar, /ما في سجلات حضور إلك خلال الشهر الماضي/)
assert.doesNotMatch(sentence.ar, /اسم الموظف|الصفحة|ما فهم/)
console.log('PASS read clarification: owner replies, original/replaced periods, user isolation, expiry, instruction boundaries and precise empty-state text')
