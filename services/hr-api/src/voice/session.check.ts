import type { ActionProposal, SessionUser } from '@hr/shared'
import {
  beginConfirmation,
  beginTurn,
  cachedTurn,
  closeVoiceSession,
  createVoiceSession,
  rememberChoice,
  rememberConfirmation,
  resolveChoiceOrdinal,
  reviewConfirmation,
  sessionFor,
} from './session.js'
import { voiceEvaluationFixtures } from './evaluation.fixtures.js'

const L = (value: string) => ({ en: value, ar: value })
const actor = (id: string): SessionUser => ({
  id,
  email: `${id}@example.test`,
  fullName: L('Test user'),
  role: 'employee',
  employeeNumber: 'TEST-1',
  jobTitle: L('Tester'),
  department: L('Test'),
  managerId: null,
  managerName: null,
  photoUrl: null,
})

const params = {
  action: 'checkIn' as const,
  targetId: null,
  leaveKind: null,
  documentKind: null,
  startDate: null,
  endDate: null,
  text: null,
  title: null,
  decision: null,
  stage: null,
  role: null,
  email: null,
  location: null,
  employmentType: null,
  language: null,
  screen: null,
  scrollTarget: null,
  amount: null,
  opensAt: null,
  durationMinutes: null,
  questionNumber: null,
  payrollAdjustmentKind: null,
  jobDescriptionSection: null,
  employeeNumberNew: null,
  jobTitle: null,
  department: null,
}

const proposal: ActionProposal = { action: 'checkIn', summary: L('Check in'), details: [], destructive: false, caution: null, params }

let failures = 0
function check(ok: boolean, label: string) {
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
}

const first = actor('11111111-1111-4111-8111-111111111111')
const second = actor('22222222-2222-4222-8222-222222222222')
const ownedSession = createVoiceSession(first)

console.log('Voice sessions belong to the signed-in person:')
check(sessionFor(ownedSession.id, first) === ownedSession, 'owner can read the session')
check(sessionFor(ownedSession.id, second) === null, 'another account cannot read the session')
closeVoiceSession(ownedSession.id, first)
check(sessionFor(ownedSession.id, first) === null, 'a closed session is removed before another turn')

const expiring = createVoiceSession(first)
expiring.expiresAt = Date.now() - 1
check(sessionFor(expiring.id, first) === null, 'an expired session is removed safely')

const session = createVoiceSession(first)

console.log('\nFinal transcript ids are held while a turn is running:')
beginTurn(session, 'realtime-item-1')
check(cachedTurn(session, 'realtime-item-1') === 'processing', 'duplicate event cannot start another turn')

console.log('\nA voice action needs visible review and an exact phrase:')
const confirmation = rememberConfirmation(session, proposal, 'check me in', 'en')
check(beginConfirmation(session, confirmation.id, confirmation.phrase).kind === 'reviewRequired', 'speech alone is refused before review')
reviewConfirmation(session, confirmation.id)
check(beginConfirmation(session, confirmation.id, 'yes').kind === 'phraseRequired', 'ambiguous confirmation is refused')
check(beginConfirmation(session, confirmation.id, confirmation.phrase).kind === 'run', 'reviewed exact phrase can proceed to the existing Copilot action route')

console.log('\nOrdinals only resolve an active clarification:')
const firstChoice = rememberConfirmation(session, proposal, 'check me in', 'ar')
const secondChoice = rememberConfirmation(session, { ...proposal, action: 'checkOut', summary: L('Check out') }, 'check me out', 'ar')
const thirdChoice = rememberConfirmation(session, proposal, 'check me in', 'ar')
rememberChoice(session, [firstChoice, secondChoice, thirdChoice])
check(resolveChoiceOrdinal(session, 'الثاني')?.confirmation.id === secondChoice.id, 'Arabic الثاني selects the second active option')
check(resolveChoiceOrdinal(session, 'second') === null, 'a consumed clarification cannot be selected again')
rememberChoice(session, [firstChoice, secondChoice, thirdChoice])
check(resolveChoiceOrdinal(session, 'الأول')?.confirmation.id === firstChoice.id, 'Arabic الأول selects the first active option')
rememberChoice(session, [firstChoice, secondChoice, thirdChoice])
check(resolveChoiceOrdinal(session, 'third')?.confirmation.id === thirdChoice.id, 'English third selects the third active option')
rememberChoice(session, [firstChoice, secondChoice, thirdChoice])
check(resolveChoiceOrdinal(session, 'choose first')?.confirmation.id === firstChoice.id, 'English first selects only when a choice is active')
rememberChoice(session, [firstChoice, secondChoice, thirdChoice])
check(resolveChoiceOrdinal(session, 'the second') === null, 'ambiguous ordinal phrasing is not treated as a selection')
rememberChoice(session, [firstChoice, secondChoice, thirdChoice])
if (session.choice) session.choice = { ...session.choice, createdAt: Date.now() - 6 * 60 * 1000 }
check(resolveChoiceOrdinal(session, 'first') === null, 'a stale clarification cannot be selected')

console.log('\nDevelopment evaluation fixtures are final transcripts only:')
check(voiceEvaluationFixtures.length >= 6, 'Arabic, English-mixed, clarification, context, and follow-up fixtures are defined')
check(voiceEvaluationFixtures.every((fixture) => fixture.transcript.trim().length > 1), 'fixtures contain no audio or provider events')

console.log(`\n${failures === 0 ? 'voice session guard holds' : `${failures} FAILURES`}`)
process.exit(failures === 0 ? 0 : 1)
