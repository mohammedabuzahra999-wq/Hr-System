import { z } from 'zod'
export function parseInterviewLlmConfiguration(input:unknown){
  const schema=z.object({NODE_ENV:z.string().optional(),AI_INTERVIEW_LLM_ENABLED:z.enum(['true','false']).default('false'),AI_INTERVIEW_LLM_PROVIDER:z.enum(['disabled','synthetic','openai']).default('disabled'),
    AI_INTERVIEW_LLM_MODEL:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/).optional(),AI_INTERVIEW_LLM_API_KEY:z.string().min(16).max(512).regex(/^[\x21-\x7e]+$/).optional(),
    AI_INTERVIEW_LLM_BASE_URL:z.literal('https://api.openai.com/v1').default('https://api.openai.com/v1'),AI_INTERVIEW_LLM_TIMEOUT_MS:z.coerce.number().int().min(1).max(15000).default(15000),AI_INTERVIEW_LLM_MAX_ATTEMPTS:z.coerce.number().int().min(1).max(3).default(2)})
  const r=schema.safeParse(input);if(!r.success)throw Error('interviewLlmConfigurationInvalid');const p=r.data
  if((p.AI_INTERVIEW_LLM_ENABLED==='true'&&p.AI_INTERVIEW_LLM_PROVIDER==='disabled')||(p.NODE_ENV==='production'&&p.AI_INTERVIEW_LLM_PROVIDER==='synthetic')||(p.AI_INTERVIEW_LLM_PROVIDER==='openai'&&(!p.AI_INTERVIEW_LLM_MODEL||!p.AI_INTERVIEW_LLM_API_KEY)))throw Error('interviewLlmConfigurationInvalid')
  const key=p.AI_INTERVIEW_LLM_PROVIDER==='openai'?p.AI_INTERVIEW_LLM_API_KEY:undefined
  return Object.freeze({enabled:p.AI_INTERVIEW_LLM_ENABLED==='true',provider:p.AI_INTERVIEW_LLM_PROVIDER,model:p.AI_INTERVIEW_LLM_MODEL,profile:`interview-v1:${p.AI_INTERVIEW_LLM_PROVIDER}:${p.AI_INTERVIEW_LLM_MODEL??'none'}`,timeoutMs:p.AI_INTERVIEW_LLM_TIMEOUT_MS,maxAttempts:p.AI_INTERVIEW_LLM_MAX_ATTEMPTS,readApiKey:()=>key})
}
export type InterviewLlmConfiguration=ReturnType<typeof parseInterviewLlmConfiguration>
