import { aiInterviewAnswerEvaluationSchema, aiInterviewDimensionSchema, type AiInterviewAnswer, type AiInterviewAnswerEvaluation } from '@hr/shared'

export interface AnswerEvaluator {
  evaluate(answer: Readonly<AiInterviewAnswer>): AiInterviewAnswerEvaluation
}

/** Reject malformed or fabricated evidence before accepting any evaluation. */
export function verifyAnswerEvaluation(value: unknown, answer: AiInterviewAnswer): AiInterviewAnswerEvaluation {
  const result = aiInterviewAnswerEvaluationSchema.parse(value)
  if (result.questionId !== answer.questionId || result.turnId !== answer.turnId || result.criterionKey !== answer.criterionKey) throw new Error('Evaluation answer mismatch')
  for (const assessment of result.dimensions) {
    for (const e of assessment.evidence) {
      if (e.questionId !== answer.questionId || e.turnId !== answer.turnId || e.criterionKey !== answer.criterionKey || e.evaluationDimension !== assessment.dimension
        || e.end > answer.text.length || answer.text.slice(e.start, e.end) !== e.exactQuote) throw new Error('Evaluation evidence mismatch')
    }
  }
  return result
}

const known = new Map<string, readonly [number, number, number, number, number]>([
  ['I used RAG in an HR assistant.', [2, 3, 1, 3, 1]],
  ['I checked some results.', [1, 2, 1, 2, 1]],
  ['I measured recall@5 on labeled queries and reviewed incorrect retrievals.', [4, 4, 4, 3, 4]],
  ['I compared alternatives, tested the change, and documented the trade-offs.', [3, 4, 3, 4, 4]],
])

/** Synthetic fixture scores only. Timing/connection metadata never subtracts points. */
export class MockEvaluator implements AnswerEvaluator {
  evaluate(answer: Readonly<AiInterviewAnswer>): AiInterviewAnswerEvaluation {
    const scores = !answer.transcriptionUncertain && answer.questionDelivery === 'complete' ? known.get(answer.text) : undefined
    const reason = !answer.text ? 'No available answer evidence'
      : answer.transcriptionUncertain ? 'Transcript requires verification'
        : answer.questionDelivery === 'interrupted' ? 'Question delivery was incomplete'
          : 'Outside the synthetic mock scenarios'
    return verifyAnswerEvaluation({
      questionId: answer.questionId, turnId: answer.turnId, criterionKey: answer.criterionKey,
      evaluatorVersion: 'mock-v1',
      dimensions: aiInterviewDimensionSchema.options.map((dimension, index) => scores ? {
        status: 'assessed', dimension, score: scores[index], reason: 'Synthetic scenario rubric anchor; not a real assessment',
        evidence: [{ questionId: answer.questionId, turnId: answer.turnId, criterionKey: answer.criterionKey,
          evaluationDimension: dimension, exactQuote: answer.text, start: 0, end: answer.text.length }],
      } : { status: 'not_assessed', dimension, score: 'not_assessed', reason, evidence: [] }),
    }, answer)
  }
}
