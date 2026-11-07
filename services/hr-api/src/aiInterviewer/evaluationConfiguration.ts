import { parseInterviewLlmConfiguration } from './llmConfiguration.js'
import type { EvaluationProviderSnapshot } from '@hr/shared'
export function parseEvaluationConfiguration(raw:Record<string,unknown>){
  try{
    const prefix='AI_INTERVIEW_EVALUATION_',input:Record<string,unknown>={NODE_ENV:raw.NODE_ENV}
    for(const key of ['ENABLED','PROVIDER','MODEL','API_KEY','BASE_URL','TIMEOUT_MS','MAX_ATTEMPTS'])input['AI_INTERVIEW_LLM_'+key]=raw[prefix+key]
    const c=parseInterviewLlmConfiguration(input)
    return Object.freeze({...c,profile:`report-v1:${c.provider}:${c.model??'none'}`})
  }catch{throw Error('interviewEvaluationConfigurationInvalid')}
}
export type EvaluationConfiguration=ReturnType<typeof parseEvaluationConfiguration>
export function evaluationProviderSnapshot(c:EvaluationConfiguration):EvaluationProviderSnapshot{
  if(!c.enabled||c.provider==='disabled')throw Error('interviewEvaluationDisabled')
  return {format:'llm-report-provider-v1',provider:c.provider,model:c.provider==='synthetic'?'deterministic-fixtures-v1':c.model!,profile:c.profile,timeoutMs:c.timeoutMs,maxAttempts:c.maxAttempts}
}
