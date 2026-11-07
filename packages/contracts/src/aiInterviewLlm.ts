import { z } from 'zod'
const id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)
const prompt=z.string().trim().min(1).max(4000)
export const interviewQuestionTextSchema=z.object({questionId:id,prompt,followUps:z.array(z.object({id,prompt}).strict()).max(5),clarifications:z.array(z.object({id,prompt}).strict()).max(3)}).strict()
export const interviewQuestionProposalSchema=z.object({questions:z.array(interviewQuestionTextSchema).min(1).max(30)}).strict()
export const interviewModelDecisionSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('NEXT_QUESTION')}).strict(),
  z.object({type:z.literal('FOLLOW_UP'),promptId:id}).strict(),
  z.object({type:z.literal('CLARIFICATION'),promptId:id}).strict(),
])
export type InterviewQuestionProposal=z.infer<typeof interviewQuestionProposalSchema>
export type InterviewModelDecision=z.infer<typeof interviewModelDecisionSchema>
