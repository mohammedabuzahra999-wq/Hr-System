// Offline S routing preflight only. Capture provider requests, never send them.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {hash} from '../../controlled-assets/validation/contracts.mjs'
import {loadAdmittedRuntime} from '../../controlled-assets/remediation-v1.1/admission/automated-policy-v1/evaluation/controlled-loader.mjs'
import {createResolverCapsule} from './resolver-capsule.mjs'
import {createScorer} from './scorer.mjs'
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../../..'),lock=JSON.parse(fs.readFileSync(path.join(HERE,'source-lock.json'),'utf8'))
for(const[p,h]of Object.entries({...lock.sourceHashes,...lock.dependencyHashes}))assert.equal(hash(fs.readFileSync(path.join(ROOT,p))),h,'SOURCE_OR_DEPENDENCY_DRIFT')
assert.equal(hash(fs.readFileSync(path.join(HERE,'resolver-capsule.mjs'))),lock.resolverCapsuleSha256)
const bytes=fs.readFileSync(path.join(ROOT,'docs/fine-tuning/controlled-assets/remediation-v1.1/model-selection-v1.1.jsonl'))
assert.equal(hash(bytes),lock.selectionSha256)
const lines=bytes.toString('utf8').trimEnd().split('\n'),rows=lines.map(JSON.parse);assert.equal(rows.length,160);assert.equal(new Set(rows.map(r=>r.recordId)).size,160)
const R=await loadAdmittedRuntime(),capsule=await createResolverCapsule(R),scorer=await createScorer(),entries=[],requests=[],controls=[]
for(let i=0;i<rows.length;i++){
 const row=rows[i],count=capsule.trace.capturedRequests.length,pre=capsule.preflight(row.wireProjection.inputText,row.input.trustedRole,{path:row.input.context.currentPage,ui:row.input.context,previousPlan:null})
 const entry={recordId:row.recordId,rowSha256:hash(lines[i]),familyId:row.familyId,language:row.language,role:row.input.trustedRole,expectedIntent:row.expected.questionPlan?.intent??null,expectedQuestionSha256:hash(JSON.stringify(row.expected.questionPlan)),expectedWireQuestionSha256:hash(JSON.stringify(row.wireProjection.questionPlan)),preflightKind:pre.kind,classification:null,reason:null}
 if(row.expected.questionPlan===null){
  entry.classification='CONTROL_ONLY';entry.reason='NULL_PLAN_ORCHESTRATION_TARGET_NOT_REPRESENTABLE_AS_PROVIDER_PLAN'
  const obs={status:'ok',stage:'terminal',outcome:pre,executionAttempted:false}
  controls.push(scorer.scoreCase(row,obs,{cohort:'control'}))
 }else if(row.expected.actionPlan!==null){entry.classification='RESOURCE_DEPENDENT';entry.reason='SEPARATE_ACTION_STAGE_NOT_APPROVED_FOR_THIS_QUESTION_MODEL_TASK'}
 else if(!['unresolved','resolved'].includes(pre.kind)){
  entry.classification='CONTROL_ONLY';entry.reason='CURRENT_ROUTER_TERMINATES_BEFORE_MODEL';entry.currentOutcome=pre.kind
  controls.push({recordId:row.recordId,targetMismatch:true,reason:'QUESTION_GOLD_VS_TERMINAL_ROUTE'})
 }else if(pre.kind==='resolved'){
  entry.classification='CONTROL_ONLY';entry.reason='CURRENT_DETERMINISTIC_ROUTE_RESOLVES_WITHOUT_MODEL';entry.routingSource=pre.routingSource;entry.routingRule=pre.routingRule
  controls.push(scorer.scoreCase(row,{status:'ok',stage:'question',rawOutput:JSON.stringify({plan:pre.plan}),executionAttempted:false},{cohort:'control'}))
 }else{
  const result=await capsule.resolveQuestion(row.wireProjection.inputText,row.input.trustedRole),captured=capsule.trace.capturedRequests.slice(count)
  assert.ok(captured.length<=1,'MULTIPLE_PROVIDER_BOUNDARIES')
  if(captured.length===1){
   entry.classification='MODEL_ELIGIBLE';entry.reason='UNRESOLVED_AT_ACTUAL_QUESTION_PROVIDER_WITH_COMPLETE_GOLD'
   const req=captured[0];assert.equal(req.temperature,0);assert.equal(req.schemaName,'copilot_plan');assert.equal(req.messages.length,2)
   assert.equal(req.messages[0].role,'system');assert.equal(req.messages[1].role,'user')
   requests.push({recordId:row.recordId,representation:'wire',previousPlan:null,context:row.input.context,referenceDate:row.input.referenceDate,...req,messagesSha256:hash(JSON.stringify(req.messages)),systemSha256:hash(req.messages[0].content),userSha256:hash(req.messages[1].content),schemaSha256:hash(JSON.stringify(req.schema))})
  }else if(result.ok){entry.classification='CONTROL_ONLY';entry.reason='CURRENT_REFERENCE_ROUTE_RESOLVES_WITHOUT_MODEL';entry.routingSource=result.routingSource;entry.routingRule=result.routingRule??null;controls.push(scorer.scoreCase(row,{status:'ok',stage:'question',rawOutput:JSON.stringify({plan:result.plan}),executionAttempted:false},{cohort:'control'}))}
  else{entry.classification='RESOURCE_DEPENDENT';entry.reason='NO_SCORABLE_PLAN_OR_CAPTURED_MODEL_BOUNDARY';entry.failure=result.reason}
 }
 capsule.assertHealthy();entries.push(entry)
}
assert.equal(capsule.trace.modelCalls,0);assert.equal(capsule.trace.hrExecutions,0);assert.equal(capsule.trace.legacyBytesRead,0)
const counts=key=>Object.fromEntries(['MODEL_ELIGIBLE','CONTROL_ONLY','RESOURCE_DEPENDENT'].map(kind=>[kind,entries.filter(x=>x.classification===kind&&(!key||x.language===key)).length]))
const perLanguage=Object.fromEntries(['en','ar-MSA','ar-JO','mixed'].map(l=>[l,counts(l)])),coverage=Object.values(perLanguage).every(c=>c.MODEL_ELIGIBLE>=10)
const manifest={version:'CEB-S-PARTITION-1.0.0',created:new Date().toISOString(),runtimeSha256:lock.runtimeSha256,selectionSha256:lock.selectionSha256,sourceLockSha256:hash(fs.readFileSync(path.join(HERE,'source-lock.json'))),partitionerSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),scorerSha256:hash(fs.readFileSync(path.join(HERE,'scorer.mjs'))),resolverBoundary:'real terminal preflight then real resolveQuestion; provider capture only; R admitted projection; maintained example arrays excluded',classificationRules:['Null question/action targets are CONTROL_ONLY, never fabricated model targets','Resolved or terminal under the fixed target is CONTROL_ONLY even if its plan is wrong','Only captured unresolved question-provider requests with complete representable golds are MODEL_ELIGIBLE','Unavailable/unscorable stages/resources are RESOURCE_DEPENDENT; never guessed'],counts:counts(),perLanguage,perRole:Object.fromEntries(['employee','manager','hr','admin'].map(r=>[r,Object.fromEntries(['MODEL_ELIGIBLE','CONTROL_ONLY','RESOURCE_DEPENDENT'].map(c=>[c,entries.filter(e=>e.role===r&&e.classification===c).length]))])),minimumModelEligiblePerLanguage:10,coverageGate:coverage?'PASS':'INSUFFICIENT_INCONCLUSIVE',entries,modelCalls:0,candidateModelsExecuted:0,frozenCasesExecuted:0}
const diagnostics={version:'CEB-S-PARTITION-1-control-diagnostics',created:manifest.created,status:'OFFLINE_ROUTING_OBSERVATION_NOT_MODEL_EVALUATION',controlsObserved:controls.length,correctControls:controls.filter(x=>x.fullPlanExact===true).length,incorrectOrUnobservedControls:controls.filter(x=>x.fullPlanExact!==true).length,results:controls,trace:{...capsule.trace,capturedRequests:undefined},noProductionAuthorizationClaim:true,noRulesOrGoldsChanged:true,modelCalls:0,frozenCasesExecuted:0}
for(const [p,data]of[['selection-partition.json',manifest],['rendered-model-requests.json',{version:'CEB-S-REQUESTS-1.0.0',selectionSha256:lock.selectionSha256,runtimeSha256:lock.runtimeSha256,promptVersion:'2026-10-11.1',purpose:'sealed model-selection input only; not training',requests}],['partition-diagnostics.json',diagnostics]])fs.writeFileSync(path.join(HERE,p),JSON.stringify(data,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({status:'FROZEN',counts:manifest.counts,perLanguage,coverageGate:manifest.coverageGate,correctControls:diagnostics.correctControls,incorrectOrUnobservedControls:diagnostics.incorrectOrUnobservedControls,modelCalls:0,frozenCasesExecuted:0}))
