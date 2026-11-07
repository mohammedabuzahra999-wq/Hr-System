import { createHash } from 'node:crypto'
import { aiInterviewEventSchema, type AiInterviewAnswer, type AiInterviewFrozenInputs } from '@hr/shared'
import { verifyAnswerEvaluation } from './evaluator.js'
import { InterviewServiceError, type InterviewRepository, type InterviewTransaction, type InterviewRow } from './repository.js'

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export function evaluationInputHash(frozen: AiInterviewFrozenInputs, answers: AiInterviewAnswer[], sequence: number, stateVersion: number) {
  return createHash('sha256').update(canonicalJson({ frozen, sequence, stateVersion,
    answers: answers.map(({ finalizedAt: _time, ...answer }) => answer) })).digest('hex')
}
export async function persistedAnswers(repository: InterviewRepository, tx: InterviewTransaction, row: InterviewRow) {
  const records = await repository.finalizedAnswers(tx, row.id)
  return records.map(record => {
    const event = aiInterviewEventSchema.parse(record.payload)
    if (event.type !== 'CANDIDATE_ANSWER_FINALIZED') throw new InterviewServiceError(409, 'invalidPersistedAnswer')
    return event.answer
  })
}
export async function verifyPersistedEvidence(repository: InterviewRepository, tx: InterviewTransaction, row: InterviewRow) {
  const answers = await persistedAnswers(repository, tx, row)
  if (answers.length !== row.snapshot.answers.length || row.snapshot.evaluations.length !== answers.length
    || new Set(row.snapshot.evaluations.map(e => e.turnId)).size !== answers.length) throw new InterviewServiceError(409, 'evaluationEvidenceIncomplete')
  for (const evaluation of row.snapshot.evaluations) {
    const answer = answers.find(a => a.turnId === evaluation.turnId)
    if (!answer) throw new InterviewServiceError(409, 'invalidEvaluationEvidence')
    try { verifyAnswerEvaluation(evaluation, answer) } catch { throw new InterviewServiceError(409, 'invalidEvaluationEvidence') }
  }
  return answers
}
