import {readFileSync,writeFileSync} from 'node:fs'
const root=new URL('../../../',import.meta.url),path=new URL('services/hr-api/src/aiInterviewer/runtime.check.ts',root)
let prefix=readFileSync(path,'utf8').split("  await check('PENDING input/hash is durable")[0]
prefix=prefix.replaceAll('ai_interview_phase53_','ai_interview_eval_')
prefix=prefix.replace("  const {InterviewService}=", "  const {createRegisteredEvaluationProvider}=await import('./evaluationProviders.js'),{syntheticEvaluationConfig}=await import('./evaluationTestSupport.js'),{buildProviderReport,syntheticEvaluationSelection}=await import('./evaluationReport.js')\n  const synthetic=createRegisteredEvaluationProvider(syntheticEvaluationConfig())\n  const {InterviewService}=")
prefix=prefix.replace('evaluator:ReportEvaluator=mock','evaluator:ReportEvaluator=synthetic').replace("operation:'RUN',commandId:randomUUID(),expectedVersion:(await row(target)).version","operation:'RUN',evaluatorVersion:'llm-report-v1',commandId:randomUUID(),expectedVersion:(await row(target)).version")
prefix=prefix.replace('MockReportEvaluator,reportInputHash','MockReportEvaluator').replace('InterviewMaintenance,startInterviewMaintenance','InterviewMaintenance')
prefix=prefix.replace('answers:structuredClone((await row(target)).snapshot.answers)','answers:structuredClone((await row(target)).snapshot.answers),frozen:structuredClone((await row(target)).frozenInputs),domain:(await database.select().from(aiInterviewEvents).where(eq(aiInterviewEvents.interviewId,target.id))).filter(e=>e.recordType===\'DOMAIN\').sort((a,b)=>a.sequence-b.sequence)')
// Retain only shared setup helpers; new acceptance cases are independent below.
const start=prefix.indexOf('  async function record('),end=prefix.indexOf('  async function check(',start)
prefix=prefix.slice(0,start)+prefix.slice(end)
prefix=prefix.replace(/  const until=async[^\n]+\n/,'')
prefix=prefix.replace("  const cancel=async(f:F)=>{const r=await row(f);if(['ACTIVE','PAUSED'].includes(r.snapshot.status))await send(f,{type:'CANCEL_INTERVIEW',commandId:randomUUID()})}\n",'')
writeFileSync(new URL('services/hr-api/src/aiInterviewer/evaluationIntegration.check.ts',root),prefix+readFileSync(new URL('database-cases.txt',import.meta.url),'utf8'))
