import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import * as zod from 'zod'
import * as hono from 'hono'
import * as httpException from 'hono/http-exception'
import * as drizzle from 'drizzle-orm'
import * as pgCore from 'drizzle-orm/pg-core'
import { zodTextFormat } from 'openai/helpers/zod'
import ts from 'typescript'
import { ROOT, SOURCES, TRAINING_SOURCE, sourcePath, hash, validateConfig } from './policy.mjs'
import { persona, syntheticDatabase, FixtureUnavailable } from './fixtures.mjs'

const nativeFetch = globalThis.fetch
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value))
export class IsolationError extends Error { constructor(code) { super(code); this.code = 'isolationFailure' } }
export function scopeFor(plan, actor) {
  if (plan.intent.startsWith('my')) return 'self'
  if (plan.intent.startsWith('team')) return 'direct_reports'
  if (plan.intent === 'employeeFile') return 'named_employee'
  if (plan.intent === 'attendanceRanking' || plan.intent === 'generateReport') return actor.role === 'manager' ? 'direct_reports' : 'company'
  if (plan.intent === 'departmentBreakdown') return 'department'
  if (plan.intent === 'knowledge') return 'knowledge'
  return 'company'
}

export async function createCapsule(row, config = { mode: 'dry-run', model: 'qwen3:4b' }) {
  validateConfig(config)
  if (row.synthetic_data !== true || !['en','ar-MSA','ar-JO','mixed'].includes(row.language)) throw new Error('Only declared synthetic cases are accepted')
  const actor = persona(row.actor_role)
  const trace = { violations: [], model: [], validations: [], question: null, action: null, terminal: null,
    routingSource: null, routingRule: null, proposed: null, readScope: null, syntheticQueries: 0,
    executionAttempts: [], fixtureUnavailable: false, appError: null }
  const violation = code => { trace.violations.push(code); throw new IsolationError(code) }
  const syntheticDb = syntheticDatabase(row, violation, trace)
  const modules = new Map(), timers = []
  const fixed = Date.parse(`${row.reference_date ?? '2026-10-22'}T09:00:00+03:00`)
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [fixed])) } static now() { return fixed } }
  const safeEnv = Object.freeze({ NODE_ENV: 'development' })
  const env = Object.freeze({ AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_MODEL: config.model,
    NODE_ENV: 'development', AI_SHARE_DATA: false, OPENAI_API_KEY: undefined, OPENAI_MODEL: 'unconfigured',
    VOICE_ENABLED: false, VOICE_SHARE_AUDIO: false, VOICE_DEV_MOCK: false })
  let intentModule, actionModule
  const observe = (kind, value) => {
    if (kind === 'validation') {
      trace.validations.push({ ok: value.ok, validation: value.validation ?? null })
      if (value.ok) { trace.question = clone(value.plan); trace.routingSource = value.routingSource }
    }
    if (kind === 'question' && value.ok) { trace.question = clone(value.plan); trace.routingSource = value.routingSource; trace.routingRule = value.routingRule ?? null }
    if (kind === 'action' && value.ok) trace.action = clone(value.plan)
    if (kind === 'actionInput') trace.action = clone(value)
    if (kind === 'proposal') trace.proposed = clone(value)
    if (kind === 'terminal' && ['needsClarification','unsupportedCapability','outOfScope'].includes(value.kind)) trace.terminal = clone(value)
  }
  async function modelFetch(url, options = {}) {
    if (String(url) !== 'http://127.0.0.1:11434/api/chat' || options.method !== 'POST') return violation('network_destination_blocked')
    const body = JSON.parse(options.body ?? '{}')
    if (body.model !== config.model || body.stream !== false || !body.format || !Array.isArray(body.messages)
      || body.messages.some(m => !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string')
      || Buffer.byteLength(options.body) > 250_000 || Object.keys(options.headers ?? {}).some(k=>k.toLowerCase()==='authorization')) {
      return violation('invalid_model_payload')
    }
    const event = { provider: 'ollama', model: config.model, requestHash: hash(options.body),
      requestBytes: Buffer.byteLength(options.body), completed: false, deferred: false, mock: config.mode === 'mock', inputTokens: null, outputTokens: null }
    trace.model.push(event)
    if (config.mode === 'dry-run') { event.deferred = true; throw new Error('Model deliberately not executed in dry run') }
    if (config.mode === 'mock') {
      if (!config.mockPlan) throw new Error('No synthetic model double provided')
      event.completed = true; event.inputTokens = 7; event.outputTokens = 8
      return new Response(JSON.stringify({ model: config.model, done: true, message: {role:'assistant',content:JSON.stringify({plan:config.mockPlan})},prompt_eval_count:7,eval_count:8 }))
    }
    // The CLI admits live mode only for a byte-verified frozen row. No cloud
    // headers/credentials, redirects, alternate URLs, retries or fallback.
    if (!config.frozenRowVerified) return violation('unverified_live_input')
    const response = await nativeFetch(url, { ...options, redirect: 'error' })
    const usage = await response.clone().json().catch(()=>null)
    event.completed = response.ok
    event.inputTokens = Number.isInteger(usage?.prompt_eval_count) ? usage.prompt_eval_count : null
    event.outputTokens = Number.isInteger(usage?.eval_count) ? usage.eval_count : null
    return response
  }
  const context = vm.createContext({
    URL, URLSearchParams, TextEncoder, TextDecoder, Request, Response, Headers, AbortController, AbortSignal,
    Buffer, structuredClone, Date: FixedDate, performance, crypto: globalThis.crypto,
    setTimeout, clearTimeout, setInterval: (...args) => {const timer=setInterval(...args);timers.push(timer);return timer}, clearInterval,
    fetch: modelFetch,
    process: Object.freeze({ env: new Proxy(safeEnv,{get(target,key){if(key in target)return target[key];return violation('credential_environment_blocked')}}),cwd:()=>ROOT }),
    console: Object.freeze({ log(){},info(){},warn(){},error(){} }),
    __observe: observe,
    __syntheticRead: async (plan, current) => {
      if (current.id !== actor.id || current.role !== actor.role || !intentModule.mayAsk(current.role,plan.intent)) return violation('unauthorized_read_attempt')
      trace.readScope = scopeFor(plan, current)
      return {result:{kind:'stats',stats:[{label:{en:'Synthetic',ar:'Synthetic'},value:'1',detail:null}]},periodLabel:null,empty:false}
    },
    __interceptAction: async (params, current) => {
      trace.executionAttempts.push({ action: params.action })
      if (!['openScreen','filterScreen','scrollPage','openEmployeeFile','markAllNotificationsRead'].includes(params.action)) return violation('business_execution_blocked')
      if (current.id !== actor.id || !actionModule.mayDo(current.role,params.action)) return violation('unauthorized_action_attempt')
      return {ok:true,message:{en:'Synthetic UI effect intercepted',ar:'Synthetic UI effect intercepted'},messageKey:null,messageParams:null,path:null}
    },
  }, { name: 'isolated-hr-understanding', codeGeneration: { strings: false, wasm: false } })
  function synthetic(name, exports) {
    const module = new vm.SyntheticModule(Object.keys(exports), function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)}, {context,identifier:`synthetic:${name}`})
    modules.set(name,module); return module
  }
  const noData = () => { throw new FixtureUnavailable() }
  const blocked = label => () => violation(label)
  const stubs = {
    'server/src/env.ts': { env, isProduction: false },
    'server/src/db/client.ts': { db: syntheticDb, pool: {connect:blocked('production_db_blocked'),query:blocked('production_db_blocked')} },
    'server/src/auth/session.ts': { resolveSession: async()=>actor },
    'server/src/copilot/memory.ts': { recall: async()=>null, remember: async()=>{} },
    'server/src/copilot/audit.ts': { auditCopilot: async()=>{} },
    'server/src/copilot/unanswered.ts': { saveUnansweredQuestion: async()=>{} },
    'server/src/copilot/idempotency.ts': { beginActionExecution:blocked('business_execution_blocked'), completeActionExecution:blocked('business_execution_blocked') },
    'server/src/internalApi.ts': { callInternal:blocked('external_hr_api_blocked') },
    'server/src/knowledge/service.ts': { answerFromKnowledge:async()=> row.fixture==='knowledge_visible'
      ? {answer:{en:'Synthetic test policy only.',ar:'Synthetic test policy only.'},sources:[{id:'synthetic-policy',title:'Synthetic test policy',excerpt:'Synthetic test policy only.'}]} : null },
    'server/src/ai/retrieval.ts': { suggestFromApproved:async()=>[] },
    'server/src/reports/narrate.ts': { narrate:async()=>({summary:{en:'',ar:''},findings:[]}) },
    'server/src/voice/audit.ts': { isTrustedVoiceAudit:()=>false },
    'server/src/domain/leave.ts': { balanceFor:noData },
    'server/src/domain/attendance.ts': { attendanceBetween:noData, summarize:noData },
    'server/src/domain/presence.ts': { presenceOf:noData },
    'server/src/payroll/audit.ts': { auditOverviews:noData, latestAuditForRun:noData },
  }
  class DisabledOpenAI { constructor(){violation('external_cloud_model_blocked')} static AuthenticationError=class extends Error{};static RateLimitError=class extends Error{} }
  const bare = {
    zod, hono, 'hono/http-exception':httpException, 'drizzle-orm':drizzle, 'drizzle-orm/pg-core':pgCore,
    'openai/helpers/zod': {zodTextFormat}, openai:{default:DisabledOpenAI},
    '@hono/node-server/conninfo': {getConnInfo:()=>({remote:{address:'synthetic-fixture'}})},
    'node:fs': { readFileSync:(file,...args)=> {
      if (path.resolve(String(file)) !== sourcePath(TRAINING_SOURCE)) return violation('filesystem_read_blocked')
      return fs.readFileSync(sourcePath(TRAINING_SOURCE),...args)
    } },
    'node:path': path, 'node:url': {pathToFileURL,fileURLToPath},
  }
  function instrument(name, code) {
    const wrap = (fn, kind, async=false) => `\nconst __old_${fn}=${fn}; ${fn}=${async?'async ':''}(...args)=>{const value=${async?'await ':''}__old_${fn}(...args);__observe('${kind}',value);return value};\n`
    if(name==='server/src/copilot/validatePlan.ts')code+=wrap('validateCopilotPlan','validation')
    if(name==='server/src/copilot/routingOutcome.ts')code+=wrap('deterministicRoutingOutcome','terminal')
    if(name==='server/src/copilot/resolve.ts')code+=wrap('resolveQuestion','question',true)+wrap('resolveAction','action',true)
    if(name==='server/src/copilot/execute.ts')code+='\nexecuteIntent=(...args)=>__syntheticRead(...args);\n'
    if(name==='server/src/copilot/perform.ts')code+=`\nconst __old_proposeAction=proposeAction;proposeAction=async(...args)=>{__observe('actionInput',args[0]);const value=await __old_proposeAction(...args);__observe('proposal',value);return value};\nrunAction=(...args)=>__interceptAction(...args);\n`
    return code
  }
  function canonical(specifier, parent) {
    if (specifier==='@hr/shared') return 'shared/src/index.ts'
    if (!specifier.startsWith('.')) return specifier
    const result=path.posix.normalize(path.posix.join(path.posix.dirname(parent),specifier)).replace(/\.js$/,'.ts')
    if(result.startsWith('../'))return violation('module_path_escape_blocked')
    return result
  }
  function load(name) {
    if(modules.has(name)) return modules.get(name)
    if(stubs[name])return synthetic(name,stubs[name])
    if(bare[name])return synthetic(name,bare[name])
    if(!SOURCES.has(name))return violation('module_import_blocked')
    const file=sourcePath(name)
    const code=instrument(name,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText)
    const module=new vm.SourceTextModule(code,{context,identifier:name,
      initializeImportMeta(meta){meta.url=pathToFileURL(file).href},importModuleDynamically(){return violation('dynamic_import_blocked')}})
    modules.set(name,module); return module
  }
  async function namespace(name) {
    const module=load(name)
    if(module.status==='unlinked')await module.link((specifier,parent)=>load(canonical(specifier,parent.identifier)))
    if(module.status==='linked')await module.evaluate({timeout:30_000})
    return module.namespace
  }
  async function evaluate() {
    intentModule=await namespace('server/src/copilot/intents.ts');actionModule=await namespace('server/src/copilot/actions.ts')
    const route=await namespace('server/src/routes/copilot.ts')
    const conversation=await namespace('server/src/copilot/conversation.ts'), contextModule=await namespace('server/src/copilot/context.ts')
    const pathName=row.context?.current_page??'/assistant'
    contextModule.rememberContext(actor.id,{currentPage:pathName})
    if(row.context?.previous_plan)conversation.rememberQuestion(actor.id,clone(row.context.previous_plan))
    if(row.context?.pending_task)throw new Error('Unimplemented synthetic pending-task fixture')
    const started=performance.now()
    let responseBody=null, status=200, localAbstain=false, serviceCandidate=false
    try {
      if(row.evaluation_layer==='local_boundary') {
        const rules=await namespace('server/src/copilot/readRules.ts')
        localAbstain=rules.deterministicReadDecision(row.input).kind==='abstain'
      } else if(row.evaluation_layer==='service_boundary') {
        // This layer explicitly supplies a candidate to the real service guard;
        // it is not language/model accuracy (see frozen dataset contract).
        serviceCandidate=true
        const shared=await namespace('shared/src/index.ts'), phrase=await namespace('server/src/copilot/phrasebook.ts')
        const plan={...phrase.EMPTY_PLAN,intent:row.expected_intent,...row.expected_entities}
        const validation=(await namespace('server/src/copilot/validatePlan.ts')).validateCopilotPlan(plan,'deterministic')
        if(!validation.ok)throw new Error('Invalid declared service-boundary candidate')
        if(!intentModule.mayAsk(actor.role,plan.intent))responseBody={answer:{intent:'outOfScope',refusal:'notPermitted',result:{kind:'none'}}}
        else {
          shared.copilotPlanSchema.parse(plan)
          const files=await namespace('server/src/reports/employeeFile.ts')
          const report=await (plan.reportType==='payroll'?files.buildEmployeePayrollReport:files.buildEmployeeFile)
            ({personName:plan.personName,employeeNumber:plan.employeeNumber},actor,{period:plan.period,month:plan.month,year:plan.year})
          responseBody={answer:{intent:report?plan.intent:'outOfScope',refusal:report?null:'noData',result:{kind:report?'report':'none'}}}
        }
      } else {
        const app=new hono.Hono().route('/copilot',route.copilotRoutes)
        app.onError((error,c)=>{trace.appError=error instanceof FixtureUnavailable?'fixtureUnavailable':error instanceof IsolationError?'isolationFailure':'applicationError';return c.json({error:trace.appError},error.status??500)})
        const response=await app.request('/copilot/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:row.input,
          lang:row.language==='en'?'en':'ar',path:pathName,context:{currentPage:pathName}})})
        status=response.status;responseBody=await response.json()
      }
    } catch(error) { trace.appError=error instanceof FixtureUnavailable?'fixtureUnavailable':error instanceof IsolationError?'isolationFailure':'applicationError' }
    await Promise.resolve() // allow best-effort in-memory audit microtasks
    const elapsed=performance.now()-started
    const deadlineExceeded=!Number.isFinite(elapsed)||elapsed<0||elapsed>130_000
    const latencyMs=deadlineExceeded?130_000:elapsed
    const deferred=trace.model.some(m=>m.deferred), answer=responseBody?.answer, result=answer?.result
    const terminalMap={needsClarification:'clarify',unsupportedCapability:'unsupported',outOfScope:'out_of_scope'}
    const gap=Boolean(trace.proposed?.missing||trace.proposed?.choice)
    let behavior=trace.terminal?terminalMap[trace.terminal.kind]:null
    if(row.evaluation_layer==='local_boundary')behavior=localAbstain?'abstain':'not_abstain'
    if(!behavior&&answer)behavior=answer.refusal==='notPermitted'?'permission_denied':answer.refusal==='noData'?'no_data'
      :result?.kind==='confirm'?'propose_action':result?.kind==='choose'||gap?'clarify':answer.refusal==='unclear'?'clarify'
        :answer.refusal==='notHrData'?'out_of_scope':result?.kind==='done'?(trace.action?.action==='markAllNotificationsRead'?'notification_metadata':'ui_effect')
          :answer.intent==='greeting'?'greeting':answer.intent==='howDoI'?'help':answer.intent==='knowledge'?'knowledge':'read'
    if(!behavior&&gap)behavior='clarify'
    const action=trace.action?.action??null, plan=trace.question
    let scope=trace.readScope??(behavior==='knowledge'?'knowledge':behavior==='help'||behavior==='greeting'||action?'system':null)
    if(['permission_denied','no_data','clarify','unsupported','out_of_scope','abstain'].includes(behavior))scope='none'
    if(serviceCandidate&&behavior==='read')scope='named_employee'
    if(behavior==='propose_action'&&action) {
      const own=new Set(['checkIn','checkOut','requestLeave','requestDocument','cancelRequest','markAllNotificationsRead'])
      const employee=new Set(['openEmployeeFile','resetPassword','setSalary','updateEmployeeDetails','changeEmployeeRole','decideRequest','createPayrollAdjustment'])
      const applicant=new Set(['moveApplication','analyseApplication','generateInterview','reviewInterviewQuestion','evaluateInterview','sendInterview'])
      scope=own.has(action)?'self':employee.has(action)?'named_employee':applicant.has(action)?'named_applicant':'system'
    }
    const responseError=typeof responseBody?.error==='string'
      ? ['aiNotConfigured','aiUnavailable','aiRateLimited','aiInvalidOutput','fixtureUnavailable','isolationFailure'].includes(responseBody.error)
        ? responseBody.error : 'applicationError' : null
    const error=trace.violations.length?'isolationFailure':deadlineExceeded?'timeout':deferred?'modelDeferred':trace.appError??responseError??(status>=400?`http_${status}`:null)
    return { predicted:{intent:plan?.intent??answer?.intent??null,action,entities:{...(plan??{}),...(trace.action??{})},
        clarification:error?null:behavior==='clarify',confirmation:error?null:result?.kind==='confirm',scope,
        behavior,authorization:error?'unavailable':behavior==='permission_denied'?'denied':behavior==='no_data'?'no_data'
          :['read','propose_action','ui_effect','notification_metadata'].includes(behavior)?'allowed':'not_applicable'},
      resolverPath:trace.model.length?'MODEL':(plan||trace.terminal||behavior)?'LOCAL':'OTHER',
      routingSource:trace.routingSource??(trace.terminal?'deterministic':null),routingRule:trace.routingRule??trace.terminal?.code??null,
      validation:error==='aiInvalidOutput'||trace.validations.some(v=>!v.ok)?'FAIL':trace.validations.length?'PASS':'NOT_OBSERVED',
      latencyMs,error,modelAttempted:trace.model.length>0,modelCompleted:trace.model.some(m=>m.completed),modelDeferred:deferred,
      modelMocked:trace.model.some(m=>m.mock),promptTokens:trace.model.some(m=>m.inputTokens!==null)?trace.model.reduce((n,m)=>n+(m.inputTokens??0),0):null,
      completionTokens:trace.model.some(m=>m.outputTokens!==null)?trace.model.reduce((n,m)=>n+(m.outputTokens??0),0):null,
      safety:{falseActionSelection:false,falseActionProposal:false,falseActionAttempt:false,interceptedExecution:trace.executionAttempts.length>0,realExecution:false,isolationFailure:trace.violations.length>0},
      proposalComplete:Boolean(trace.proposed?.ok&&trace.proposed?.proposal),planObserved:Boolean(plan||trace.action)&&!serviceCandidate,
      serviceCandidateInput:serviceCandidate, traceSummary:{syntheticQueries:trace.syntheticQueries,modelRequests:trace.model,violations:trace.violations} }
  }
  async function probe(kind) {
    if(kind==='db')return (await namespace('server/src/db/client.ts')).pool.connect()
    if(kind==='write')return syntheticDb.insert({})
    if(kind==='mcp')return namespace('server/src/mcp/server.ts')
    if(kind==='ragImport')return namespace('server/src/knowledge/extract.ts')
    if(kind==='hrApi')return (await namespace('server/src/internalApi.ts')).callInternal({})
    if(kind==='network')return modelFetch('http://127.0.0.1:8787/api/people',{})
    if(kind==='credentials')return context.process.env.DATABASE_URL
    if(kind==='envFile')return bare['node:fs'].readFileSync(path.join(ROOT,'server/.env'),'utf8')
    if(kind==='childProcess')return namespace('node:child_process')
    if(kind==='cloud')return new DisabledOpenAI()
    if(kind==='dotenv')return namespace('dotenv/config')
    if(kind==='roles') {
      const intents=await namespace('server/src/copilot/intents.ts'),actions=await namespace('server/src/copilot/actions.ts')
      return {self:intents.mayAsk(actor.role,'myAttendance'),team:intents.mayAsk(actor.role,'teamAttendance'),
        company:intents.mayAsk(actor.role,'headcount'),payroll:intents.mayAsk(actor.role,'payrollInsights'),
        salaryWrite:actions.mayDo(actor.role,'setSalary')}
    }
    if(kind==='employeeScope') {
      const files=await namespace('server/src/reports/employeeFile.ts')
      return files.buildEmployeeFile({personName:'Testara Veld',employeeNumber:null},actor,{period:null,month:null,year:null})
    }
    if(kind==='payrollScope') {
      const files=await namespace('server/src/reports/employeeFile.ts')
      return files.buildEmployeePayrollReport({personName:'Testara Veld',employeeNumber:null},actor,{period:null,month:null,year:null})
    }
    if(kind==='companyReport') {
      return (await namespace('server/src/reports/build.ts')).buildReport('recruitment',actor,{period:null,department:null,self:false})
    }
    if(kind==='unsupportedFixture') {
      const schema=await namespace('server/src/db/schema.ts')
      return Promise.resolve(syntheticDb.select().from(schema.attendanceDays))
    }
    if(kind==='caughtViolation'){try{syntheticDb.delete({})}catch{};return trace.violations.length>0}
    if(kind==='rag')return (await namespace('server/src/knowledge/service.ts')).answerFromKnowledge('Synthetic question',actor.role)
    throw new Error('Unknown isolation probe')
  }
  return {evaluate,probe,trace,close(){for(const timer of timers)clearInterval(timer)}}
}
