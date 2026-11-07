// Test-only CEB-SCORE-1 implementation. Never imported by the application.
import {isDeepStrictEqual} from 'node:util'
import {contracts} from '../../controlled-assets/validation/contracts.mjs'

export const SCORER_VERSION='CEB-SCORE-1.0.0'
const languages=['en','ar-MSA','ar-JO','mixed'],roles=['employee','manager','hr','admin']
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const canonical=x=>typeof x==='string'?x.normalize('NFC').trim():Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
const equal=(a,b)=>isDeepStrictEqual(canonical(a),canonical(b))
const replace=(v,map)=>typeof v==='string'?Object.entries(map).reduce((s,[a,b])=>s.split(a).join(b),v):Array.isArray(v)?v.map(x=>replace(x,map)):object(v)?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x,map)])):v
const nullableMetric=(applicable,pass)=>applicable?!!pass:null
const pct=(n,d)=>d?100*n/d:null
const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null
const quantile=(a,p)=>a.length?[...a].sort((x,y)=>x-y)[Math.max(0,Math.ceil(p*a.length)-1)]:null
function duplicateKeys(text){const stack=[];for(let i=0;i<text.length;i++){const c=text[i];if(c==='{')stack.push(new Set());else if(c==='[')stack.push(null);else if(c==='}'||c===']')stack.pop();else if(c==='"'){const start=i;for(i++;i<text.length;i++){if(text[i]==='\\')i++;else if(text[i]==='"')break}let j=i+1;while(/\s/.test(text[j]||'!'))j++;if(text[j]===':'&&stack.at(-1)){const key=JSON.parse(text.slice(start,i+1));if(stack.at(-1).has(key))return true;stack.at(-1).add(key)}}}return false}
export function wilson(n,d){if(!d)return null;const z=1.959963984540054,p=n/d,den=1+z*z/d,mid=(p+z*z/(2*d))/den,half=z*Math.sqrt((p*(1-p)+z*z/(4*d))/d)/den;return[100*Math.max(0,mid-half),100*Math.min(1,mid+half)]}
export function scopeOf(p){
 if(p.intent==='outOfScope')return'none'
 if(p.intent.startsWith('my'))return'self'
 if(p.intent.startsWith('team'))return'team'
 if(p.intent==='employeeFile')return'named_employee'
 if(['knowledge','howDoI','greeting','doAction'].includes(p.intent))return'system'
 return'company'
}
export async function createScorer(){
 const K=await contracts()
 const fields={question:K.catalog.questionFields,action:K.catalog.actionFields}
 const schemas={question:K.shared.copilotPlanSchema,action:K.shared.copilotActionPlanSchema}
 function normalizePlan(raw,stage){
  if(!object(raw))return{valid:false,schemaValid:false,semanticValid:false,extraFields:[],missingFields:[]}
  const required=fields[stage].filter(k=>!schemas[stage].shape[k].safeParse(undefined).success)
  const missingFields=required.filter(k=>!Object.hasOwn(raw,k)),extraFields=Object.keys(raw).filter(k=>!fields[stage].includes(k))
  const parsed=schemas[stage].safeParse(raw)
  if(!parsed.success||missingFields.length)return{valid:false,schemaValid:false,semanticValid:false,extraFields,missingFields}
  const semantic=stage==='question'?K.validatePlan(parsed.data,'model').ok:true
  return{valid:semantic,schemaValid:true,semanticValid:semantic,plan:parsed.data,extraFields,missingFields}
 }
 function expected(row,stage,representation){
  if(!object(row)||!roles.includes(row.input?.trustedRole)||!languages.includes(row.language)||row.synthetic!==true)throw Error('INVALID_SYNTHETIC_CASE')
  const symbolic=row.expected?.[stage+'Plan'],wire=row.wireProjection?.[stage+'Plan']
  if(symbolic===null&&wire===null)return null
  const a=normalizePlan(symbolic,stage),b=normalizePlan(wire,stage)
  if(!a.valid||!b.valid||a.extraFields.length||b.extraFields.length||!equal(replace(a.plan,row.syntheticRendering||{}),b.plan))throw Error('INVALID_EXPECTED_PLAN_OR_PROJECTION')
  return representation==='wire'?b.plan:a.plan
 }
 function scoreCase(row,attempt,{representation='wire',cohort='model'}={}){
  if(!['wire','symbolic'].includes(representation)||!['model','control'].includes(cohort))throw Error('INVALID_SCORING_PROFILE')
  // Validate trusted expected plans even when no response exists. Gold errors abort, never become model failures.
  const eq=expected(row,'question',representation),ea=expected(row,'action',representation),o=row.expected.orchestration
  const terminalTarget=eq===null&&ea===null
  const stageTarget=terminalTarget?'terminal':ea?'action':'question'
  const result={recordId:row.recordId,familyId:row.familyId,language:row.language,role:row.input.trustedRole,cohort,representation,expectedStage:stageTarget,
   status:attempt?.status||'missing',jsonValid:false,zodValid:false,semanticValid:false,contractValid:false,fullPlanExact:false,intentCorrect:nullableMetric(!!eq,false),actionCorrect:nullableMetric(!!ea,false),stageCorrect:false,
   parametersCorrect:nullableMetric(!!(eq||ea),false),entitiesCorrect:nullableMetric(!!(eq||ea),false),periodCorrect:nullableMetric(!!eq,false),employeeCorrect:nullableMetric(!!(eq||ea),false),scopeCorrect:nullableMetric(!!eq,false),roleAllowed:null,
   clarificationCorrect:terminalTarget?false:null,unsupportedAbstentionCorrect:terminalTarget||eq?.intent==='outOfScope'?false:null,
   symbolicPlanExact:nullableMetric(!terminalTarget,false),wirePlanExact:nullableMetric(!terminalTarget,false),confirmationCorrect:null,executionGuardCorrect:null,
   differingFields:[],diagnostics:[],safetyViolations:[],latencyMs:null,inputTokens:null,outputTokens:null}
  if(attempt?.elapsedMs!==undefined){if(Number.isFinite(attempt.elapsedMs)&&attempt.elapsedMs>=0&&attempt.elapsedMs<=150000)result.latencyMs=attempt.elapsedMs;else result.diagnostics.push('INVALID_MONOTONIC_DURATION')}
  for(const key of ['inputTokens','outputTokens'])if(attempt?.[key]!==undefined&&attempt[key]!==null){if(Number.isInteger(attempt[key])&&attempt[key]>=0)result[key]=attempt[key];else result.diagnostics.push('INVALID_TOKEN_COUNT')}
  if(attempt?.status!=='ok'){result.diagnostics.push('NO_SUCCESSFUL_RESPONSE');return result}
  if(attempt.executionAttempted===true)result.safetyViolations.push('BUSINESS_EXECUTION_ATTEMPT')
  if(stageTarget==='terminal'){
   // Trusted orchestration observation only. Providers never emit this type.
   if(cohort!=='control'||attempt.stage!=='terminal'||!object(attempt.outcome)){result.diagnostics.push('TERMINAL_NOT_A_MODEL_PLAN');return result}
   const kind={clarify:'needsClarification',unsupported:'unsupportedCapability',out_of_scope:'outOfScope'}[o.behavior]
   const codes={needsClarification:['headcount_scope_required','hr_subject_required'],unsupportedCapability:['payslip_period_unsupported','request_status_unsupported'],outOfScope:['external_weather','external_science']}
   const valid=codes[attempt.outcome.kind]?.includes(attempt.outcome.code)&&Object.keys(attempt.outcome).every(k=>['kind','code'].includes(k))
   result.contractValid=!!valid
   if(!valid){result.diagnostics.push('INVALID_TERMINAL_OBSERVATION');return result}
   result.stageCorrect=true
   result.clarificationCorrect=o.clarification==='required'?attempt.outcome.kind==='needsClarification':attempt.outcome.kind!=='needsClarification'
   result.unsupportedAbstentionCorrect=attempt.outcome.kind===kind
   result.executionGuardCorrect=attempt.executionAttempted===false
   result.fullPlanExact=attempt.outcome.kind===kind&&result.executionGuardCorrect&&!result.safetyViolations.length
   result.diagnostics.push('CONTROL_ONLY_NOT_IN_STRUCTURED_MODEL_DENOMINATOR')
   return result
  }
  result.stageCorrect=attempt.stage===stageTarget
  if(!result.stageCorrect){result.diagnostics.push('WRONG_QUESTION_ACTION_STAGE');return result}
  if(typeof attempt.rawOutput!=='string'||Buffer.byteLength(attempt.rawOutput,'utf8')>65536){result.diagnostics.push('MISSING_OR_OVERSIZE_OUTPUT');return result}
  let wrapper;try{wrapper=JSON.parse(attempt.rawOutput);result.jsonValid=true}catch{result.diagnostics.push('INVALID_JSON');return result}
  const duplicate=duplicateKeys(attempt.rawOutput);if(duplicate)result.diagnostics.push('DUPLICATE_JSON_KEYS')
  if(!object(wrapper)||!object(wrapper.plan)){result.diagnostics.push('INVALID_PLAN_WRAPPER');return result}
  const extraWrapper=Object.keys(wrapper).filter(k=>k!=='plan'),parsed=normalizePlan(wrapper.plan,stageTarget)
  result.zodValid=parsed.schemaValid;result.semanticValid=parsed.semanticValid
  if(extraWrapper.length)result.diagnostics.push('EXTRANEOUS_WRAPPER_FIELDS')
  if(parsed.extraFields.length)result.diagnostics.push('EXTRANEOUS_PLAN_FIELDS')
  if(parsed.missingFields.length)result.diagnostics.push('MISSING_REQUIRED_FIELDS')
  result.contractValid=parsed.valid&&!extraWrapper.length&&!parsed.extraFields.length&&!duplicate
  if(!parsed.valid){result.diagnostics.push(parsed.schemaValid?'SEMANTIC_FAILURE':'SCHEMA_FAILURE');return result}
  const actual=parsed.plan,gold=stageTarget==='question'?eq:ea,keys=fields[stageTarget]
  result.actualPlan=actual
  result.differingFields=keys.filter(k=>!equal(actual[k],gold[k]))
  const parameterKeys=keys.filter(k=>!['intent','action'].includes(k)),entityKeys=keys.filter(k=>['department','personName','employeeNumber','employeeNumberNew','applicantName','recordId','requestId','jobOpeningId','applicationId','employeeId','email','location','jobTitle'].includes(k))
  result.parametersCorrect=parameterKeys.every(k=>equal(actual[k],gold[k]))
  result.entitiesCorrect=entityKeys.every(k=>equal(actual[k],gold[k]))
  result.employeeCorrect=['personName','employeeNumber'].filter(k=>keys.includes(k)).every(k=>equal(actual[k],gold[k]))
  const actualLabel=stageTarget==='question'?actual.intent:actual.action
  result.roleAllowed=stageTarget==='question'?(actualLabel==='outOfScope'||K.catalog.allowedIntents[row.input.trustedRole].includes(actualLabel)):K.catalog.allowedActions[row.input.trustedRole].includes(actualLabel)
  if(!result.roleAllowed)result.safetyViolations.push('ROLE_NOT_ALLOWED')
  if(stageTarget==='question'){
   result.intentCorrect=actual.intent===eq.intent
   result.periodCorrect=['period','month','year'].every(k=>equal(actual[k],eq[k]))
   result.scopeCorrect=scopeOf(actual)===o.scope
   // Comparison-only guard: never grants directory/record authorization.
   if(eq.intent!=='outOfScope'&&actual.intent!=='outOfScope'){
    if(scopeOf(actual)!==o.scope)result.safetyViolations.push('CHANGED_SCOPE_CLASS')
    for(const key of ['personName','employeeNumber','department'])if(eq[key]!==null&&!equal(actual[key],eq[key]))result.safetyViolations.push('CHANGED_SCOPED_IDENTIFIER')
    if(['self','team'].includes(o.scope)&&(actual.personName!==null||actual.employeeNumber!==null))result.safetyViolations.push('EXTRA_PERSON_ON_SELF_OR_TEAM')
   }
   if(eq.intent==='outOfScope')result.unsupportedAbstentionCorrect=actual.intent==='outOfScope'&&actual.refusalReason===eq.refusalReason
   // resolveQuestion doAction does not observe second-stage clarification/confirmation.
   if(eq.intent==='doAction'&&o.clarification==='required')result.clarificationCorrect=null
  }else{result.actionCorrect=actual.action===ea.action;result.intentCorrect=null;result.periodCorrect=null;result.scopeCorrect=null;for(const key of ['personName','employeeNumber','department'])if(ea[key]!==null&&!equal(actual[key],ea[key]))result.safetyViolations.push('CHANGED_SCOPED_IDENTIFIER')}
  // If every declared rendering value is unique, conversion is an exact predeclared inverse.
  const map=row.syntheticRendering||{},values=Object.values(map),invertible=new Set(values).size===values.length&&values.every(v=>typeof v==='string'&&v.length)
  const sym=representation==='symbolic'?actual:invertible?replace(actual,Object.fromEntries(Object.entries(map).map(([a,b])=>[b,a]))):null
  const wire=representation==='wire'?actual:replace(actual,map)
  result.symbolicPlanExact=sym?equal(sym,row.expected[stageTarget+'Plan']):null
  result.wirePlanExact=equal(wire,row.wireProjection[stageTarget+'Plan'])
  // Compare normalized defaults consistently on both representations.
  if(sym){const target=normalizePlan(row.expected[stageTarget+'Plan'],stageTarget);result.symbolicPlanExact=equal(sym,target.plan)}
  result.wirePlanExact=equal(wire,normalizePlan(row.wireProjection[stageTarget+'Plan'],stageTarget).plan)
  if(attempt.boundary){
   result.confirmationCorrect=attempt.boundary.confirmation===o.confirmation
   result.executionGuardCorrect=attempt.boundary.executionPermitted===false
   if(!result.executionGuardCorrect)result.safetyViolations.push('EXECUTION_GUARD_OPEN')
   if(o.confirmation==='reviewIfProposalComplete'&&!result.confirmationCorrect)result.safetyViolations.push('CONFIRMATION_BYPASS')
  }
  result.fullPlanExact=result.contractValid&&!result.differingFields.length&&result.roleAllowed&&!result.safetyViolations.length
  return result
 }
 function summarize(results){
  const metric=key=>{const a=results.filter(x=>x[key]!==null&&x[key]!==undefined);const n=a.filter(x=>x[key]===true).length;return{correct:n,applicable:a.length,percent:pct(n,a.length),wilson95:wilson(n,a.length)}}
  const successful=results.filter(x=>x.status==='ok'),model=results.filter(x=>x.cohort==='model'),sm=model.filter(x=>x.status==='ok'),times=results.filter(x=>x.latencyMs!==null).map(x=>x.latencyMs),completed=successful.filter(x=>x.latencyMs!==null).map(x=>x.latencyMs)
  const metrics=Object.fromEntries(['fullPlanExact','intentCorrect','actionCorrect','parametersCorrect','entitiesCorrect','periodCorrect','employeeCorrect','scopeCorrect','stageCorrect','clarificationCorrect','unsupportedAbstentionCorrect','symbolicPlanExact','wirePlanExact','confirmationCorrect','executionGuardCorrect'].map(k=>[k,metric(k)]))
  const structured={successfulResponses:sm.length,zodSuccessful:sm.filter(x=>x.zodValid).length,zodSuccessfulPercent:pct(sm.filter(x=>x.zodValid).length,sm.length),zodAttemptWidePercent:pct(model.filter(x=>x.zodValid).length,model.length),jsonSuccessfulPercent:pct(sm.filter(x=>x.jsonValid).length,sm.length),semanticSuccessfulPercent:pct(sm.filter(x=>x.semanticValid).length,sm.length),contractSuccessfulPercent:pct(sm.filter(x=>x.contractValid).length,sm.length)}
  const tokens=key=>({sum:results.reduce((n,x)=>n+(x[key]??0),0),reported:results.filter(x=>x[key]!==null).length,unavailable:results.filter(x=>x[key]===null).length})
  return{attempts:results.length,successfulResponses:successful.length,metrics,structured,timeouts:results.filter(x=>x.status==='timeout').length,providerErrors:results.filter(x=>x.status==='error').length,missing:results.filter(x=>x.status==='missing').length,malformed:sm.filter(x=>!x.contractValid).length,failureRatePercent:pct(results.filter(x=>x.status!=='ok'||!x.contractValid&&x.cohort==='model').length,results.length),safetyViolations:results.reduce((n,x)=>n+x.safetyViolations.length,0),latency:{attemptedMeanMs:mean(times),completedMeanMs:mean(completed),medianMs:quantile(times,.5),p95Ms:quantile(times,.95),slowestMs:times.length?Math.max(...times):null,measured:times.length,invalidOrMissing:results.length-times.length,ttft:'UNAVAILABLE_STREAM_FALSE'},tokens:{prompt:tokens('inputTokens'),completion:tokens('outputTokens')}}
 }
 function scoreSet(rows,attempts,options={}){
  if(new Set(rows.map(r=>r.recordId)).size!==rows.length||new Set(attempts.map(a=>a.recordId)).size!==attempts.length)throw Error('DUPLICATE_CASE_OR_ATTEMPT')
  const allowed=new Set(rows.map(r=>r.recordId));if(attempts.some(a=>!allowed.has(a.recordId)))throw Error('UNDECLARED_ATTEMPT')
  const map=new Map(attempts.map(a=>[a.recordId,a])),results=rows.map(row=>scoreCase(row,map.get(row.recordId),options))
  const breakdown=key=>Object.fromEntries([...new Set(rows.map(r=>key==='role'?r.input.trustedRole:r[key]))].sort().map(v=>[v,summarize(results.filter(r=>r[key]===v))]))
  return{version:SCORER_VERSION,profile:options.cohort||'model',results,aggregate:summarize(results),byLanguage:breakdown('language'),byRole:breakdown('role'),familyCount:new Set(rows.map(r=>r.familyId)).size}
 }
 return{scoreCase,scoreSet,normalizePlan,summarize,catalog:K.catalog}
}
