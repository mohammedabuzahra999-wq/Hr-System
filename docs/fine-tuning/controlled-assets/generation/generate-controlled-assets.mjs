import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {runtimeQuestions,runtimeActions,selectionQuestions,selectionChallenges} from './templates-v1.mjs'
const HERE=path.dirname(fileURLToPath(import.meta.url)),BASE=path.dirname(HERE),ROOT=path.resolve(BASE,'../../..')
const hash=b=>createHash('sha256').update(b).digest('hex')
const normalize=t=>t.toLocaleLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/موضف/g,'موظف').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
if(!process.permission||process.permission.has('child')||process.permission.has('worker'))throw new Error('RESTRICTED_PROCESS_REQUIRED')
const checks=[]
for(const file of ['server/.env','server/src/copilot/data/hr_agent_intents_10000.jsonl','server/dist/server/src/copilot/data/hr_agent_intents_10000.jsonl','docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl','.local-voice/worker.token','server/uploads']){
 const p=path.join(ROOT,file);assert.equal(process.permission.has('fs.read',p),false);assert.throws(()=>fs.readFileSync(p),e=>e.code==='ERR_ACCESS_DENIED');checks.push({boundary:file,result:'READ_DENIED_BEFORE_BYTES'})
}
for(const file of ['server/src/copilot/resolve.ts','docs/fine-tuning/pre-finetuning-file-hashes.sha256'])assert.equal(process.permission.has('fs.write',path.join(ROOT,file)),false)
for(const key of ['DATABASE_URL','OPENAI_API_KEY','OPENROUTER_API_KEY','SESSION_SECRET','NODE_OPTIONS','HTTP_PROXY','HTTPS_PROXY'])assert.equal(process.env[key],undefined)
await assert.rejects(fetch('https://example.invalid/offline-probe'),e=>e.code==='OFFLINE_NETWORK_DENIED')
await assert.rejects(import('node:http'),e=>e.code==='OFFLINE_MODULE_DENIED')
checks.push({boundary:'credentials/network/modules/writes/processes',result:'BLOCKED'})
const C=JSON.parse(fs.readFileSync(path.join(HERE,'contracts-v1.json'),'utf8')),langs=['en','ar-MSA','ar-JO','mixed']
const inputs=['generate-controlled-assets.mjs','templates-v1.mjs','contracts-v1.json','offline-guard.mjs']
const inputHashes=Object.fromEntries(inputs.map(n=>[n,hash(fs.readFileSync(path.join(HERE,n)))]))
const manifest={version:'CEB-generation-v1',timestamp:new Date().toISOString(),method:'deterministic fixed literal templates and typed placeholders',randomness:'none; no PRNG or seed used',node:process.version,sourceInputs:inputHashes,quotas:{runtime:320,selection:160},preflight:checks,modelCalls:0,productionData:false,legacyOrFinalSourceUsed:false}
fs.writeFileSync(path.join(HERE,'pre-generation-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
const plan=(intent,params={})=>Object.assign(Object.fromEntries(C.questionFields.map(k=>[k,null])),{intent},params)
const action=(name,params={})=>Object.assign(Object.fromEntries(C.actionFields.map(k=>[k,null])),{action:name},params)
const wireValues={DATE_A:'2027-07-12',DATE_B:'2027-07-14',MONEY:'742.50',ADJUSTMENT:'18.75',TIME:'2027-07-12T09:00:00Z'}
const tokenTypes={NAME:'EMPLOYEE_NAME',APPLICANT:'APPLICANT_NAME',ID:'EMPLOYEE_ID',DEPT:'DEPARTMENT',DATE_A:'DATE',DATE_B:'DATE',MONEY:'SALARY_AMOUNT',ADJUSTMENT:'ADJUSTMENT_AMOUNT',TITLE:'TITLE',BODY:'TEXT',JOB:'JOB_TITLE',LOCATION:'LOCATION',TIME:'DATETIME',EMAIL:'EMAIL',EMP_NEW:'EMPLOYEE_ID_NEW'}
function realize(value,index,wire=false){if(typeof value==='string')return value.replace(/\$([A-Z_]+)/g,(_,key)=>{assert.ok(tokenTypes[key],'UNKNOWN_SLOT');return wire&&key in wireValues?wireValues[key]:`<${tokenTypes[key]}_${index+(key==='DATE_B'?1:0)}>`});if(Array.isArray(value))return value.map(v=>realize(v,index,wire));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,realize(v,index,wire)]));return value}
function rows(defs,asset,kind,start){return defs.flatMap((d,i)=>{
 assert.equal(d.text.length,4);const intent=kind==='action'?'doAction':d.intent;assert.ok(C.intents.includes(intent));if(kind==='action')assert.ok(C.actions.includes(d.action))
 const allowed=C.roles.filter(r=>(intent==='outOfScope'||C.allowedIntents[r].includes(intent))&&(kind!=='action'||C.allowedActions[r].includes(d.action))),role=d.role??allowed[0];assert.ok(allowed.includes(role),'ROLE_NOT_ALLOWED')
 for(const k of Object.keys(d.params??{}))assert.ok((kind==='action'?C.actionFields:C.questionFields).includes(k),'UNKNOWN_FIELD')
 const q=d.noPlan?null:plan(intent,kind==='action'?{}:d.params),a=kind==='action'?action(d.action,d.params):null
 return langs.map((language,j)=>{
  const index=start+i*10,expected={questionPlan:q,actionPlan:a,orchestration:{behavior:d.behavior??(kind==='action'?'action':'read'),clarification:d.clarification??'notRequired',confirmation:kind==='action'?(['openScreen','filterScreen','scrollPage','openEmployeeFile','markAllNotificationsRead'].includes(d.action)?'safeUiExceptionIfValid':'reviewIfProposalComplete'):'notApplicable',scope:d.scope??'system',executionPermitted:false}}
  const raw={schemaVersion:'CEB-assets-v1',assetVersion:'v1',recordId:`CEB-${asset}-${kind.toUpperCase()}-${String(i+1).padStart(3,'0')}-${language}`,purpose:asset==='R'?'runtime-reference-only':'base-model-selection-only-never-training',task:kind==='action'?'action-reference':'question-reference',familyId:`CEB-${asset}-${kind}-${d.key??intent}-${i+1}`,templateId:`CEB-${asset}-${kind}-${i+1}-${language}`,episodeId:`CEB-${asset}-${kind}-${i+1}`,language,styleTags:d.tags??[],synthetic:true,origin:'independently authored fixed templates; no external generation call',input:{text:d.text[j],trustedRole:role,context:{currentPage:'/assistant'},referenceDate:'2027-06-15'},expected,
   modelEligibility:'UNASSESSED_REQUIRES_ADMITTED_CONTROLLED_ROUTER',provenance:{recipe:'generation/templates-v1.mjs',recipeHash:inputHashes['templates-v1.mjs'],constructionIndex:i+1,split:asset,creator:'Codex assistant template author; not independent reviewer',reviewStatus:'PENDING_INDEPENDENT_REVIEW'}}
  const symbolic=realize(raw,index),wire=realize({inputText:d.text[j],questionPlan:q,actionPlan:a},index,true)
  const rendering=Object.fromEntries(Object.entries(wireValues).filter(([key])=>JSON.stringify(raw).includes('$'+key)).map(([key,v])=>[`<${tokenTypes[key]}_${index+(key==='DATE_B'?1:0)}>`,v]))
  return {...symbolic,wireProjection:wire,syntheticRendering:rendering,representation:'symbolic-master-with-declared-wire-projection'}
 })
})}
const R=[...rows(runtimeQuestions,'R','question',10000),...rows(runtimeActions,'R','action',11000)]
const S=[...rows(selectionQuestions,'S','question',20000),...rows(selectionChallenges,'S','challenge',21000)]
for(const [asset,data,count]of[['R',R,320],['S',S,160]]){assert.equal(data.length,count);assert.equal(new Set(data.map(r=>normalize(r.input.text))).size,count);assert.equal(new Set(data.map(r=>r.recordId)).size,count);for(const lang of langs)assert.equal(data.filter(r=>r.language===lang).length,count/4)}
assert.equal(runtimeQuestions.length,32);assert.equal(runtimeActions.length,48);assert.equal(selectionQuestions.length,32);assert.equal(selectionChallenges.length,8)
const outputs={}
for(const [name,data]of[['runtime-reference-v1.jsonl',R],['model-selection-v1.jsonl',S]]){const bytes=data.map(r=>JSON.stringify(r)).join('\n')+'\n';fs.writeFileSync(path.join(BASE,name),bytes,{flag:'wx'});outputs[name]=hash(bytes)}
fs.writeFileSync(path.join(HERE,'generation-result.json'),JSON.stringify({completed:new Date().toISOString(),inputHashes,outputs,counts:{R:R.length,S:S.length},preflightPass:true,modelCalls:0,seed:null},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({status:'CANDIDATES_GENERATED_NOT_ADMITTED',counts:{runtime:R.length,selection:S.length},outputs,preflightChecks:checks.length}))
