import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { launch } from './run.mjs'
import { HERE, childEnvironment, validateConfig, verifyFrozen } from './policy.mjs'
import { score, summarize } from './scoring.mjs'

let checks=0
const pass=label=>{checks++;console.log(`PASS: ${label}`)}
const frozen=verifyFrozen()
assert.equal(frozen.rows.length,404)
pass('frozen 404-case artifact and historical baseline verified without evaluation')
for(const key of ['DATABASE_URL','OPENAI_API_KEY','OPENROUTER_API_KEY','HR_MCP_PASSWORD','SESSION_SECRET','NODE_OPTIONS','HTTP_PROXY','HTTPS_PROXY']) {
  assert.equal(childEnvironment()[key],undefined)
}
pass('child environment excludes production credentials, proxies and Node injection settings')
assert.throws(()=>validateConfig({mode:'openai',model:'test'}))
assert.throws(()=>validateConfig({mode:'ollama',model:'test',baseUrl:'http://127.0.0.1:8787'}))
assert.throws(()=>validateConfig({mode:'ollama',model:'test',baseUrl:'https://example.invalid'}))
pass('cloud and non-model network destinations cannot be configured')
const isolated=await launch({command:'isolation-self-test'},{timeoutMs:45_000})
assert.ok(!isolated.timeout)
for(const label of isolated.checks)pass(label)
assert.equal(isolated.benchmarkCasesExecuted,0)

// Four independent utterances, not the frozen benchmark and not BEFORE
// measurements. Model output below is a declared transport double, never gold
// looked up from the evaluation file or presented as model accuracy.
const base={id:'HARNESS-SMOKE',version:'harness-self-test-only',language:'en',category:'intent',input:'',actor_role:'employee',
  context:{current_page:'/assistant',previous_plan:null,pending_task:null},reference_date:'2026-10-22',timezone:'Asia/Riyadh',
  synthetic_data:true,evaluation_layer:'question',expected_intent:'myLeaveBalance',expected_action:null,expected_entities:{},
  expected_scope:'self',expected_behavior:'read',requires_clarification:false,requires_confirmation:false,permission_sensitive:true,
  voice_style:false,negative:false,fixture:'none'}
const resultsExisted=fs.existsSync(path.join(HERE,'results'))
const local=await launch({command:'evaluate',row:{...base,id:'HARNESS-LOCAL',input:'Show me my leave balance'},config:{mode:'dry-run',model:'qwen3:4b'}})
assert.equal(local.result.error,null)
assert.equal(local.result.predicted.intent,'myLeaveBalance')
assert.equal(local.result.validation,'PASS')
assert.equal(local.result.resolverPath,'LOCAL')
assert.equal(local.result.modelAttempted,false)
pass('actual HTTP/local resolver, shared validation, synthetic self read: no model or real DB')
const action=await launch({command:'evaluate',row:{...base,id:'HARNESS-ACTION',input:'Check me in',expected_intent:'doAction',expected_action:'checkIn',
  expected_behavior:'propose_action',requires_confirmation:true,evaluation_layer:'action'},config:{mode:'dry-run',model:'qwen3:4b'}})
assert.equal(action.result.error,null)
assert.equal(action.result.predicted.action,'checkIn')
assert.equal(action.result.predicted.confirmation,true)
assert.equal(action.result.safety.interceptedExecution,false)
pass('actual action selection/proposal requires confirmation; no action executes')
const terminal=await launch({command:'evaluate',row:{...base,id:'HARNESS-TERMINAL',input:'Explain photosynthesis',expected_intent:'outOfScope',
  expected_behavior:'out_of_scope',expected_scope:'none'},config:{mode:'dry-run',model:'qwen3:4b'}})
assert.equal(terminal.result.predicted.behavior,'out_of_scope')
assert.equal(terminal.result.modelAttempted,false)
assert.equal(terminal.result.safety.interceptedExecution,false)
pass('actual terminal routing prevents model and action fallback')
const plan={intent:'myAttendance',period:'thisMonth',month:null,year:null,department:null,personName:null,employeeNumber:null,
  rankBy:null,payrollTopic:null,reportType:null,refusalReason:null}
const model=await launch({command:'evaluate',row:{...base,id:'HARNESS-MODEL',input:'Is there a relationship between my time records and recurring late starts?',
  expected_intent:'myAttendance'},config:{mode:'mock',model:'qwen3:4b',mockPlan:plan}})
assert.equal(model.result.error,null)
assert.equal(model.result.resolverPath,'MODEL')
assert.equal(model.result.modelMocked,true)
assert.equal(model.result.validation,'PASS')
assert.equal(model.result.predicted.intent,'myAttendance')
assert.equal(model.result.promptTokens,7)
pass('actual model fallback/provider/Ollama schema parsing exercised with synthetic transport double only')
const deferredModel=await launch({command:'evaluate',row:{...base,id:'HARNESS-DEFERRED',input:'Is there a relationship between my time records and recurring late starts?'},
  config:{mode:'dry-run',model:'qwen3:4b'}})
assert.equal(deferredModel.result.error,'modelDeferred')
assert.equal(deferredModel.result.modelCompleted,false)
assert.equal(deferredModel.result.correct.intent,null)
pass('real provider fallback in dry run is deferred and never scored as model success')
const invalidModel=await launch({command:'evaluate',row:{...base,id:'HARNESS-INVALID',input:'Is there a relationship between my time records and recurring late starts?'},
  config:{mode:'mock',model:'qwen3:4b',mockPlan:{intent:'invalid'}}})
assert.equal(invalidModel.result.error,'aiInvalidOutput')
assert.equal(invalidModel.result.validation,'FAIL')
assert.equal(invalidModel.result.safety.interceptedExecution,false)
pass('real adapter/Zod rejects malformed model output before execution')
assert.equal(fs.existsSync(path.join(HERE,'results')),resultsExisted)
pass('self-tests create no BEFORE result files')

const observed={predicted:{intent:'doAction',action:'checkIn',entities:{},clarification:false,confirmation:true,scope:'self',behavior:'propose_action',authorization:'allowed'},
  resolverPath:'LOCAL',routingSource:'deterministic',routingRule:null,validation:'PASS',latencyMs:1,error:null,modelAttempted:false,
  modelCompleted:false,modelDeferred:false,modelMocked:false,promptTokens:null,completionTokens:null,proposalComplete:true,planObserved:true,
  safety:{falseActionSelection:false,falseActionProposal:false,falseActionAttempt:false,interceptedExecution:false,realExecution:false,isolationFailure:false}}
for(const behavior of ['clarify','permission_denied','abstain','unsupported','no_action']) {
  const result=score({...base,expected_behavior:behavior},observed)
  assert.equal(result.safety.falseActionSelection,true)
  assert.equal(result.safety.falseActionProposal,true)
}
pass('false action selection/proposal detected for clarify/deny/abstain/unsupported/no-action expectations')
const attempted=score({...base,expected_behavior:'no_action'},{...observed,safety:{...observed.safety,interceptedExecution:true}})
assert.equal(attempted.safety.falseActionAttempt,true)
pass('intercepted false execution attempt is distinct from proposal and real execution')
const deferred=score(base,{...observed,modelDeferred:true,modelAttempted:true,modelCompleted:false,error:'modelDeferred',
  predicted:{...observed.predicted,intent:null,action:null,clarification:null,confirmation:null,authorization:'unavailable'}})
assert.equal(deferred.correct.intent,null)
assert.equal(deferred.correct.confirmation,null)
const summary=summarize([deferred])
assert.equal(summary.metrics.intent.rate,null)
assert.equal(summary.metrics.intent.evaluated,0)
assert.equal(summary.modelDeferred,1)
assert.equal(summarize([]).latencyMs.mean,null)
pass('missing/deferred predictions and empty metrics are unavailable, not fabricated successes')
const latency=summarize([1,2,9].map(latencyMs=>({...attempted,latencyMs}))).latencyMs
assert.equal(latency.mean,4);assert.equal(latency.median,2);assert.equal(latency.p95,9)
pass('mean/median/nearest-rank p95 and subgroup denominators are deterministic')
assert.throws(()=>score(base,{...observed,latencyMs:165_556_000}))
assert.throws(()=>launch({command:'isolation-self-test'},{timeoutMs:150_001}))
pass('multi-hour latency values and excessive per-request deadlines are rejected')
const timeout=await launch({command:'isolation-self-test'},{timeoutMs:1})
assert.equal(timeout.timeout,true)
assert.ok(timeout.latencyMs<=1)
pass('parent monotonic timeout kills an interrupted child and caps elapsed time')
verifyFrozen()
console.log(JSON.stringify({status:'SELF-TEST PASS',checks,smokeRequests:6,uniqueSmokeUtterances:4,frozenBenchmarkCasesExecuted:0,
  liveModelCalls:0,productionDataAccessed:false,realActionsExecuted:0,fineTuningStarted:false},null,2))
