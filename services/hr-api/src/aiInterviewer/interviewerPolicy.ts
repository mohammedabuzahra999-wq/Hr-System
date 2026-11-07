import type { AiInterviewAnswer, AiInterviewQuestion, AiInterviewSnapshot, InterviewPlan } from '@hr/shared'

export type InterviewerDecision =
  | { type: 'FOLLOW_UP'; promptId: string }
  | { type: 'CLARIFICATION'; promptId: string }
  | { type: 'NEXT_QUESTION' }

export interface InterviewerPolicy {
  chooseNextBase(context: Readonly<{ plan: InterviewPlan; processedBaseQuestionIds: string[] }>): string | null
  afterAnswer(context: Readonly<{ state: AiInterviewSnapshot; baseQuestion: AiInterviewQuestion; answer: AiInterviewAnswer }>): InterviewerDecision
}

/** Scenario fixtures, not a semantic classifier or a real candidate assessor. */
export class MockInterviewerPolicy implements InterviewerPolicy {
  chooseNextBase({ plan, processedBaseQuestionIds }: Parameters<InterviewerPolicy['chooseNextBase']>[0]) {
    return [...plan.questions].sort((a, b) => a.order - b.order).find(q => !processedBaseQuestionIds.includes(q.id))?.id ?? null
  }
  afterAnswer({ state, baseQuestion: base, answer }: Parameters<InterviewerPolicy['afterAnswer']>[0]): InterviewerDecision {
    const unused = (kind: 'followUps' | 'clarifications') => base[kind].find(p => !state.usedPromptIds.includes(`${base.id}:${kind}:${p.id}`))
    if (!answer.text.trim()) {
      const prompt = unused('clarifications')
      return base.silenceAction === 'CLARIFY_OR_NEXT' && prompt
        ? { type: 'CLARIFICATION', promptId: prompt.id } : { type: 'NEXT_QUESTION' }
    }
    if (answer.text === 'I used RAG in an HR assistant.') {
      const prompt = unused('followUps')
      if (prompt) return { type: 'FOLLOW_UP', promptId: prompt.id }
    }
    if (answer.text === 'I checked some results.') {
      const prompt = unused('clarifications')
      if (prompt) return { type: 'CLARIFICATION', promptId: prompt.id }
    }
    return { type: 'NEXT_QUESTION' }
  }
}
