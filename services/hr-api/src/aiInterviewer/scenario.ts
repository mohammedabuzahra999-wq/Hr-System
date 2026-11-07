import { runPhase1Scenario } from './harness.js'

const result = runPhase1Scenario()
console.log('PHASE 1 — SYNTHETIC MOCK INTERVIEW (no audio, DB or network)')
console.log(result.trace.join('\n'))
console.log(`Interview=${result.pending.status}; evaluation before report=${result.pending.evaluationStatus}`)
console.log(`Evaluation=${result.snapshot.evaluationStatus}; finalized answers=${result.snapshot.answers.length}; overall score=none; hiring decision=none`)
