import {readFileSync,writeFileSync} from 'node:fs'
const directory=new URL('./',import.meta.url)
for(const file of ['manifest.mjs','run.mjs','guard.cjs','migrations.mjs','secret-check.mjs','cleanup.mjs']){
 let text=readFileSync(new URL(file,directory),'utf8')
 if(file==='manifest.mjs')text=text.replace('tts-playback|llm-orchestration)','tts-playback|llm-orchestration|evaluation-integration)')
 else text=text.replaceAll('docs/ai-interviewer/llm-orchestration/','docs/ai-interviewer/evaluation-integration/').replaceAll('llmorchestration-temp','evaluationintegration-temp').replaceAll('LLM_ORCHESTRATION_','EVALUATION_INTEGRATION_').replaceAll('ai_interview_llmprobe_','ai_interview_evalprobe_')
 if(file==='run.mjs'){
  text=text.replace('const definitions = [',`const definitions = [
  ['evaluation-contract','Synthetic evaluation configuration/SDK/schema/evidence/rubric','npm.cmd run check:ai-interviewer:evaluation:contract -w @hr/server',api,ts('src/aiInterviewer/evaluationProviders.check.ts')],
  ['evaluation-db','Frozen provider evaluation/attempt/restart/RBAC/privacy','npm.cmd run check:ai-interviewer:evaluation -w @hr/server',api,ts('src/aiInterviewer/evaluationIntegration.check.ts'),'55442'],`)
  text=text.replace('env.CANDIDATE_AUDIO_OUTPUT=output','env.LLM_ORCHESTRATION_OUTPUT=output\n  env.CANDIDATE_AUDIO_OUTPUT=output')
  text=text.replace("AI_INTERVIEW_LLM_API_KEY:'interview-llm-synthetic-bundle-canary-not-a-key'","AI_INTERVIEW_LLM_API_KEY:'interview-llm-synthetic-bundle-canary-not-a-key',AI_INTERVIEW_EVALUATION_API_KEY:'interview-evaluation-synthetic-bundle-canary-not-a-key'")
 }
 writeFileSync(new URL(file,directory),text)
}
