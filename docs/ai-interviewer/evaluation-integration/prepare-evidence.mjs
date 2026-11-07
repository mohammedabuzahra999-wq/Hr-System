import {readFileSync,writeFileSync} from 'node:fs'
const here=new URL('./',import.meta.url),previous=new URL('../llm-orchestration/',import.meta.url)
const purposes={
 'packages/contracts/src/aiInterviewEvaluationProvider.ts':'Strict evidence/approved-anchor selection and frozen provider provenance contracts.',
 'packages/contracts/src/aiInterviewReport.ts':'Separate llm-report-v1/modes, optional provider metadata and legacy-compatible storage.',
 'packages/contracts/src/index.ts':'Export new pure evaluation contracts.',
 'services/hr-api/src/aiInterviewer/evaluationConfiguration.ts':'Dedicated server settings, default-off registration, sanitized fail-closed validation.',
 'services/hr-api/src/aiInterviewer/evaluationProviders.ts':'Deterministic synthetic and pinned structured OpenAI SDK evaluator with safe errors and bounded payloads.',
 'services/hr-api/src/aiInterviewer/evaluationReport.ts':'Independent exact-source/rubric validation and server-owned provisional report construction.',
 'services/hr-api/src/aiInterviewer/evaluationRuntime.ts':'Server-only registration without I/O.',
 'services/hr-api/src/aiInterviewer/evaluationTestSupport.ts':'Identity-free synthetic input/configuration fixtures.',
 'services/hr-api/src/aiInterviewer/evaluationProviders.check.ts':'29 configuration/SDK/evidence/rubric/prompt/size/cancellation/blank/mixed-dimension checks.',
 'services/hr-api/src/aiInterviewer/evaluationIntegration.check.ts':'25 real PostgreSQL attempt/restart/isolation/evidence/history/report checks.',
 'services/hr-api/src/aiInterviewer/report.ts':'Reject mode/provenance changes and independently reconstruct provider reports before accepting them.',
 'services/hr-api/src/aiInterviewer/reportService.ts':'Freeze provider profile with inputHash, preserve mock jobs, bound attempts and fail closed on changed configuration.',
 'services/hr-api/src/aiInterviewer/ui.fixture.ts':'Explicit opt-in synthetic evaluation browser registration and failure injection.',
 'services/hr-api/src/env.ts':'Parse dedicated server evaluation settings without printing values.',
 'services/hr-api/src/index.ts':'Use one registered report service for authenticated routes and maintenance/shutdown.',
 'services/hr-api/package.json':'Three new test commands; no dependency changes.',
 'services/hr-api/scripts/checkEvaluationProviderBrowser.mjs':'Derived existing authenticated setup, unchanged first 14 assertions.',
 'services/hr-api/scripts/checkEvaluationProviderBrowserCases.mjs':'Eight new provider report/review/retry/rejection/privacy browser assertions.',
 'apps/hr-web/src/pages/AiInterviewReportPage.tsx':'Truthful mock/synthetic/LLM labels, explicit registered-provider request, retained review and version controls.'
}
let state=readFileSync(new URL('state.mjs',previous),'utf8')
state=state.replace("export const acceptedSource = '55f7d754e37e38b185095b6b5410c0d59bf82fc576567cb3c48203aabfeacf14'","export const acceptedSource = 'f5b6eea089f5ef95f56230f7a087a4d8b5d2f1542175bcb0e64ab520208ce337'")
state=state.replace(/export const expectedChanges = \{[\s\S]*?\n\}/,'export const expectedChanges = '+JSON.stringify(purposes,null,2))
state=state.replace("'runs/final-verified-20261105/source-final.json',acceptedSource],","'runs/final-verified-20261105/source-final.json','55f7d754e37e38b185095b6b5410c0d59bf82fc576567cb3c48203aabfeacf14'],\n  ['llm-orchestration','b372be586444e7a505019c5c875ee1f29474f8cad6b7ab9b3d36dde317a76afa','runs/final-20261105/source-final.json',acceptedSource],")
state=state.replace("docs/ai-interviewer/tts-playback/runs/final-verified-20261105/source-final.json","docs/ai-interviewer/llm-orchestration/runs/final-20261105/source-final.json")
state=state.replace('diff.modified.length===14','diff.modified.length===9').replace('inventory.length===46','inventory.length===49')
state=state.replace('const expectedCounts={',"const expectedCounts={'evaluation-contract':29,'evaluation-db':25,'evaluation-browser':22,").replace("['llm-browser','tts-browser'","['evaluation-browser','llm-browser','tts-browser'")
state=state.replace("  const llmDb=get(","  const evaluationDb=get('evaluation-db-matrix.json'),evaluationContract=get('evaluation-contract-matrix.json');require(evaluationDb.status==='PASS'&&evaluationDb.checks===25&&evaluationDb.externalAttempts===0&&evaluationDb.matrix.length>0&&evaluationDb.matrix.every(r=>r.result==='PASS'&&r.answersUnchanged&&r.frozenEvidenceUnchanged&&r.domainHistoryUnchanged)&&evaluationContract.status==='PASS'&&evaluationContract.checks===29&&evaluationContract.syntheticSdkRequests===14&&evaluationContract.realProviderCalls===0&&evaluationContract.externalAttempts===0,'EVALUATION_NEW_VERIFICATION')\n  const llmDb=get(")
state=state.replace('llmDb,llmContract,transport,','evaluationDb,evaluationContract,llmDb,llmContract,transport,')
state=state.replace("r.result==='PASS'&&r.answersUnchanged","r.result==='PASS'&&r.inputHashPreserved&&r.answersUnchanged")
state=state.replace('secrets.dedicatedLlmCanaryDetected&&oldScan','secrets.dedicatedLlmCanaryDetected&&secrets.dedicatedEvaluationCanaryDetected&&oldScan')
state=state.replace('interview-llm-synthetic-bundle-canary-not-a-key/.test(text)','interview-llm-synthetic-bundle-canary-not-a-key|interview-evaluation-synthetic-bundle-canary-not-a-key/.test(text)')
state=state.replace('evaluationIntegrationImplemented:false','evaluationIntegrationImplemented:true').replaceAll('llmorchestration-temp','evaluationintegration-temp')
state=state.replace("scope:'Asynchronous interview LLM proposals/approved decisions; synthetic verification; supported local single-process'","scope:'LLM report evaluation from frozen evidence/approved rubric; synthetic verification; supported local single-process'")
state=state.replace('  const network={',"  const evaluationSdkRuns=readdirSync(resolve(here,'runs')).map(name=>resolve(here,'runs',name,'evaluation-contract-matrix.json')).filter(existsSync)\n  const network={syntheticEvaluationSdkRequests:evaluationSdkRuns.reduce((n,p)=>n+read(p).syntheticSdkRequests,0),finalRunSyntheticEvaluationSdkRequests:evaluationContract.syntheticSdkRequests,")
writeFileSync(new URL('state.mjs',here),state)
let verify=readFileSync(new URL('verify.mjs',previous),'utf8').replace('summary.evaluationIntegrationImplemented!==false','summary.evaluationIntegrationImplemented!==true')
verify=verify.replace('llmDatabaseChecks:state.llmDb.checks','evaluationDatabaseChecks:state.evaluationDb.checks,evaluationContractChecks:state.evaluationContract.checks,newEvaluationBrowserChecks:state.regression.find(r=>r.id===\'evaluation-browser\').count,llmDatabaseChecks:state.llmDb.checks')
writeFileSync(new URL('verify.mjs',here),verify)
