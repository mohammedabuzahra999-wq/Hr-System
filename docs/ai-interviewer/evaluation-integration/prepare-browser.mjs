import {readFileSync,writeFileSync} from 'node:fs'
const base=new URL('../../../services/hr-api/scripts/',import.meta.url)
let text=readFileSync(new URL('checkLlmOrchestrationBrowser.mjs',base),'utf8')
text=text.replace("process.env.LLM_BROWSER_TESTS='true'","process.env.EVALUATION_BROWSER_TESTS='true'")
text=text.replace("import('./checkLlmOrchestrationBrowserCases.mjs')).runModelBrowserCases","import('./checkEvaluationProviderBrowserCases.mjs')).runEvaluationBrowserCases")
text=text.replaceAll('LLM orchestration browser checks','Evaluation provider browser checks').replace('syntheticLlm: true','syntheticEvaluation: true')
writeFileSync(new URL('checkEvaluationProviderBrowser.mjs',base),text)
