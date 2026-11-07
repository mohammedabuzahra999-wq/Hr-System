import { interviewPlanSchema } from '@hr/shared'

/** Synthetic, identity-free development scenario. No production candidate data. */
export const phase1Plan = interviewPlanSchema.parse({
  id: 'phase1-demo', version: 1, language: 'mixed', type: 'technical',
  introduction: 'Welcome. This is a simulated interview, and you may answer in Arabic or English.',
  closing: 'Thank you. Your answers have been received for human review.',
  questions: [
    { id: 'q1', criterionKey: 'rag', type: 'technical', order: 1,
      prompt: 'Tell me about your experience with RAG.', answerTimeLimitSec: 120, warningAtSec: 30,
      gracePeriodSec: 15, maxFollowUps: 2, followUpTimeLimitSec: 60, maxClarifications: 1,
      clarificationTimeLimitSec: 30, silenceThresholdSec: 0, silenceAction: 'CLARIFY_OR_NEXT', allowBargeIn: true,
      followUps: [{ id: 'retrieval', prompt: 'How did you evaluate retrieval quality?' }, { id: 'tradeoffs', prompt: 'Which retrieval trade-offs did you test?' }],
      clarifications: [{ id: 'measurement', prompt: 'Please describe a concrete measurement and what you learned from it.' }],
    },
    { id: 'q2', criterionKey: 'problem-solving', type: 'behavioral', order: 2,
      prompt: 'Describe how you approached a difficult engineering decision.', answerTimeLimitSec: 90, warningAtSec: 20,
      gracePeriodSec: 10, maxFollowUps: 0, followUpTimeLimitSec: 45, maxClarifications: 0,
      clarificationTimeLimitSec: 30, silenceThresholdSec: 0, silenceAction: 'NEXT_QUESTION', allowBargeIn: true,
      followUps: [], clarifications: [],
    },
  ],
})

export const phase1Answers = [
  'I used RAG in an HR assistant.',
  'I checked some results.',
  'I measured recall@5 on labeled queries and reviewed incorrect retrievals.',
  'I compared alternatives, tested the change, and documented the trade-offs.',
] as const
