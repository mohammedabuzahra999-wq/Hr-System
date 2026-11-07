import { z } from 'zod'
import { interviewQuestionProposalSchema,interviewModelDecisionSchema,type InterviewPlan } from '@hr/shared'
export const LLM_TIMEOUT_MS=15000,LLM_MAX_BYTES=128000
export const llmInputSchema=z.object({kind:z.enum(['PLAN','DECISION']),language:z.enum(['en','ar','mixed']),
  questions:interviewQuestionProposalSchema.shape.questions,
  criteria:z.array(z.object({questionId:z.string().max(160),criterionKey:z.string().max(300)}).strict()).min(1).max(30),
  answer:z.object({text:z.string().max(16000),uncertain:z.boolean()}).strict().nullable(),
  currentQuestion:z.object({kind:z.enum(['BASE','FOLLOW_UP','CLARIFICATION']),prompt:z.string().min(1).max(4000)}).strict().nullable(),
  choices:z.array(interviewModelDecisionSchema).min(1).max(9),
}).strict()
export type InterviewLlmInput=z.infer<typeof llmInputSchema>
export interface InterviewLlmProvider {generate(input:Readonly<InterviewLlmInput>,signal:AbortSignal):Promise<unknown>}
export class InterviewLlmError extends Error {constructor(readonly code:'modelUnavailable'|'modelInvalid'|'modelTimeout'|'modelCapacity'|'modelCancelled'){super(code)}}
export const llmJobSchema=z.object({jobId:z.uuid(),key:z.string().max(160),modelProfile:z.string().max(200),kind:z.enum(['PLAN','DECISION']),status:z.enum(['QUEUED','RUNNING','PROPOSED','COMMITTED','APPLIED','FAILED','STALE']),
  staffId:z.uuid().nullable(),owner:z.string(),sessionVersion:z.number().int().nonnegative(),turnId:z.string().nullable(),expectedVersion:z.number(),inputHash:z.string(),attempt:z.number().int().nonnegative(),attemptId:z.uuid().nullable(),deadline:z.number().nullable(),retryAt:z.number(),failure:z.string().nullable(),proposal:interviewQuestionProposalSchema.nullable()}).strict()
export type LlmJob=z.infer<typeof llmJobSchema>
export function proposalForPlan(plan:InterviewPlan){return {questions:plan.questions.map(q=>({questionId:q.id,prompt:q.prompt,followUps:q.followUps,clarifications:q.clarifications}))}}
/** A quarantine filter, not a semantic/prompt-injection proof. HR review remains mandatory. */
export function validateQuestionProposal(input:unknown,plan:InterviewPlan){
  const p=interviewQuestionProposalSchema.parse(input),expected=proposalForPlan(plan).questions
  if(p.questions.length!==expected.length||new Set(p.questions.map(q=>q.questionId)).size!==p.questions.length)throw new InterviewLlmError('modelInvalid')
  for(const q of p.questions){const old=expected.find(v=>v.questionId===q.questionId);if(!old)throw new InterviewLlmError('modelInvalid')
    for(const k of ['followUps','clarifications'] as const)if(q[k].length!==old[k].length||new Set(q[k].map(v=>v.id)).size!==q[k].length||q[k].some(v=>!old[k].some(e=>e.id===v.id)))throw new InterviewLlmError('modelInvalid')
    for(const t of [q.prompt,...q.followUps.map(v=>v.prompt),...q.clarifications.map(v=>v.prompt)])if(/[<>\x00-\x08\x0b\x0c\x0e-\x1f\u202a-\u202e\u2066-\u2069]|(?:https?|javascript|data):|www\.|\b(?:password|credentials?|api.?key|access.?token|session.?secret|credit.?card|bank.?account|ignore.{0,30}instructions|system.?prompt|protected.?characteristic|religion|pregnan[a-z]*|marital.?status|sexual.?orientation|your.?age|your.?race)\b/i.test(t))throw new InterviewLlmError('modelInvalid')
  }
  return p
}
