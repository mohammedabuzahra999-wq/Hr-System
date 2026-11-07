import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const HERE=path.dirname(fileURLToPath(import.meta.url)),BASE=path.dirname(HERE),PARENT=path.dirname(BASE),ROOT=path.resolve(PARENT,'../../..')
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.join(BASE,p)),load=p=>JSON.parse(read(p)),write=(p,v)=>fs.writeFileSync(path.join(BASE,p),JSON.stringify(v,null,2)+'\n',{flag:'wx'})
assert.ok(process.permission&&!process.permission.has('child')&&!process.permission.has('worker'),'RESTRICTED_PROCESS_REQUIRED')
const denied=[]
for(const p of ['server/.env','server/src/copilot/data/hr_agent_intents_10000.jsonl','server/dist/server/src/copilot/data/hr_agent_intents_10000.jsonl','docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl','server/uploads','.local-voice/worker.token','server/src/copilot/training.ts']){assert.equal(process.permission.has('fs.read',path.join(ROOT,p)),false);assert.throws(()=>fs.readFileSync(path.join(ROOT,p)),e=>e.code==='ERR_ACCESS_DENIED');denied.push(p)}
for(const p of ['server/src/copilot/resolve.ts','docs/fine-tuning/pre-finetuning-file-hashes.sha256',path.relative(ROOT,path.join(PARENT,'runtime-reference-v1.jsonl')),path.relative(ROOT,path.join(PARENT,'model-selection-v1.jsonl'))])assert.equal(process.permission.has('fs.write',path.join(ROOT,p)),false)
for(const key of ['DATABASE_URL','OPENAI_API_KEY','OPENROUTER_API_KEY','SESSION_SECRET','NODE_OPTIONS','HTTP_PROXY','HTTPS_PROXY'])assert.equal(process.env[key],undefined)
await assert.rejects(fetch('https://example.invalid/offline-probe'),e=>e.code==='OFFLINE_NETWORK_DENIED');await assert.rejects(import('node:http'),e=>e.code==='OFFLINE_MODULE_DENIED')
const inputs=['generation/remediate.mjs','generation/replacement-catalog.json','generation/remediation-plan.json','validation/exclusion-selectors.json','run-offline.mjs','../generation/offline-guard.mjs','../generation/contracts-v1.json','../runtime-reference-v1.jsonl','../model-selection-v1.jsonl']
const inputHashes=Object.fromEntries(inputs.map(p=>[p,hash(read(p))])),plan=load('generation/remediation-plan.json'),catalog=load('generation/replacement-catalog.json'),selectors=load('validation/exclusion-selectors.json'),C=load('../generation/contracts-v1.json')
assert.equal(inputHashes['../runtime-reference-v1.jsonl'],'342503dd6c810136d8b5ede8dea96005e593a2ee623f849640fcfd357bb826de');assert.equal(inputHashes['../model-selection-v1.jsonl'],'8d50c67b4daa388c9cadcd3e992e0aa8504a08534b1beb4bdc2a022ac62928c6')
assert.deepEqual(Object.keys(catalog.replacements).sort(),selectors.selectors.map(x=>x.candidateRecordId).sort())
write('generation/pre-generation-manifest.json',{version:'CEB-remediation-pre-generation-v1.1',created:new Date().toISOString(),node:process.version,inputHashes,seed:null,quotas:{runtime:320,selection:160},preflight:{deniedReads:denied,protectedWrites:false,credentialsExcluded:true,networkBlockedBeforeTransport:true,childWorkerDenied:true},modelCalls:0,frozenCasesExecuted:0})
const delta=[],outputs={}
for(const [asset,name,count]of[['R','runtime-reference',320],['S','model-selection',160]]){
 const raw=read('../'+name+'-v1.jsonl').toString('utf8').trimEnd().split('\n'),rows=raw.map(JSON.parse),out=raw.slice()
 for(let i=0;i<rows.length;i++){
  const r=rows[i],old=structuredClone(r),id=r.recordId;let reason=null
  if(asset==='R'&&Object.hasOwn(catalog.replacements,id)){
   assert.equal(hash(raw[i]),selectors.selectors.find(s=>s.candidateRecordId===id).candidateRowSha256)
   r.input.text=catalog.replacements[id];r.wireProjection.inputText=Object.entries(r.syntheticRendering).reduce((s,[key,value])=>s.split(key).join(value),r.input.text)
   assert.deepEqual(r.expected,old.expected);reason='replace_previously_excluded_candidate_text_only'
  }
  if(asset==='S'){
   const family=/^CEB-S-QUESTION-(\d{3})-/.exec(id)?.[1],role=plan.selection.questionFamilyRoleAssignments[family]
   if(role){assert.ok(r.expected.questionPlan);assert.ok(C.allowedIntents[role].includes(r.expected.questionPlan.intent));r.input.trustedRole=role;reason='rebalance_role_without_text_or_gold_change';assert.equal(r.input.text,old.input.text);assert.deepEqual(r.expected,old.expected)}
  }
  if(reason){r.assetVersion='v1.1';r.templateId+='-r1.1';r.provenance={...r.provenance,recipe:'remediation-v1.1/generation/remediate.mjs',recipeHash:inputHashes['generation/remediate.mjs'],parentRowSha256:hash(raw[i]),remediationId:'CEB-1C4R-v1.1'};out[i]=JSON.stringify(r);delta.push({asset,recordId:id,reason,oldRowSha256:hash(raw[i]),newRowSha256:hash(out[i]),oldRole:old.input.trustedRole,newRole:r.input.trustedRole})}
 }
 assert.equal(rows.length,count)
 if(asset==='R')assert.equal(delta.filter(d=>d.asset==='R').length,3)
 if(asset==='S')for(const language of ['en','ar-MSA','ar-JO','mixed'])for(const role of C.roles)assert.equal(rows.filter(r=>r.language===language&&r.input.trustedRole===role).length,10)
 const content=out.join('\n')+'\n',file=name+'-v1.1.jsonl';fs.writeFileSync(path.join(BASE,file),content,{flag:'wx'});outputs[file]=hash(content)
}
write('generation/row-deltas.json',{version:'CEB-row-deltas-v1.1',runtimeChanged:delta.filter(d=>d.asset==='R').length,selectionChanged:delta.filter(d=>d.asset==='S').length,selectionTextChanges:0,selectionTargetChanges:0,changes:delta})
write('generation/generation-result.json',{version:'CEB-remediation-v1.1',completed:new Date().toISOString(),inputHashes,outputs,counts:{runtime:320,selection:160},runtimeChanged:3,selectionRoleChanges:delta.filter(d=>d.asset==='S').length,seed:null,modelCalls:0,frozenCasesExecuted:0})
console.log(JSON.stringify({status:'REMEDIATED_CANDIDATES_NOT_ADMITTED',outputs,runtimeChanged:3,selectionRoleChanges:delta.filter(d=>d.asset==='S').length}))
