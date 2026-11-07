import {extraChecks,recipeConformance} from './automated-extra.mjs'
// Fixed sealed scan: F/10K are read solely for exclusion. No protected content is reported.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {contracts,hash} from '../../../validation/contracts.mjs'
import {jsonLines,prepare,compare,privacy,quality,patterns,strings} from '../../validation/core.mjs'
import {envelopeQuality} from '../../validation/envelope.mjs'
const OUT=path.dirname(fileURLToPath(import.meta.url)),BASE=path.resolve(OUT,'../..'),PARENT=path.dirname(BASE),ROOT=path.resolve(PARENT,'../../..'),read=p=>fs.readFileSync(path.join(BASE,p)),load=p=>JSON.parse(read(p))
assert.ok(process.permission&&!process.permission.has('child')&&!process.permission.has('worker'))
const policyBytes=fs.readFileSync(path.join(ROOT,'docs/fine-tuning/design/05-protocol-amendment-automated-admission.md'));
const generated=load('generation/generation-result.json'),deltas=load('generation/row-deltas.json'),K=await contracts(),datasets={}
for(const[p,h]of Object.entries(generated.inputHashes))assert.equal(hash(read(p)),h,'GENERATION_INPUT_DRIFT')
for(const [key,name,count]of[['runtime','runtime-reference',320],['selection','model-selection',160]]){
 const b=read(name+'-v1.1.jsonl'),rows=jsonLines(b),oldLines=read('../'+name+'-v1.jsonl').toString('utf8').trimEnd().split('\n'),newLines=b.toString('utf8').trimEnd().split('\n'),old=oldLines.map(JSON.parse),changes=[]
 assert.equal(hash(b),generated.outputs[name+'-v1.1.jsonl']);assert.equal(rows.length,old.length)
 for(let i=0;i<rows.length;i++){
  const r=rows[i],parent=old[i];assert.equal(r.recordId,parent.recordId);assert.deepEqual(r.expected,parent.expected)
  if(key==='runtime')assert.equal(r.input.trustedRole,parent.input.trustedRole)
  else{assert.equal(r.input.text,parent.input.text);assert.deepEqual(r.wireProjection,parent.wireProjection)}
  if(newLines[i]!==oldLines[i]){changes.push(r.recordId);assert.equal(r.provenance.parentRowSha256,hash(oldLines[i]));assert.equal(r.provenance.recipeHash,generated.inputHashes['generation/remediate.mjs'])}
 }
 assert.equal(changes.length,key==='runtime'?3:72);assert.deepEqual(changes.sort(),deltas.changes.filter(d=>d.asset===(key==='runtime'?'R':'S')).map(d=>d.recordId).sort())
 const q=await quality(rows,count,key==='runtime'?'R':'S',K),p=privacy(rows),e=envelopeQuality(rows,K),extra=extraChecks(rows),recipe=recipeConformance(oldLines,newLines,key==='runtime'?'R':'S',load('generation/replacement-catalog.json'),load('generation/remediation-plan.json'),generated.inputHashes['generation/remediate.mjs']);p.independentReview='NOT_PERFORMED_OPTIONAL_UNDER_AMENDMENT';assert.equal(recipe.expectedReleaseSha256,hash(b))
 const metadataFlags=Object.fromEntries(Object.keys(patterns).map(k=>[k,0]));for(const r of rows){const texts=strings({origin:r.origin,tags:r.styleTags,creator:r.provenance.creator,recipe:r.provenance.recipe,context:r.input.context});for(const[k,re]of Object.entries(patterns))if(texts.some(t=>re.test(t)))metadataFlags[k]++}
 const rolesByLanguage={};for(const lang of ['en','ar-MSA','ar-JO','mixed']){rolesByLanguage[lang]=Object.fromEntries(K.catalog.roles.map(role=>[role,rows.filter(r=>r.language===lang&&r.input.trustedRole===role).length]));if(key==='selection')for(const n of Object.values(rolesByLanguage[lang]))assert.equal(n,10)}
 datasets[key]={sha256:hash(b),quality:q,envelope:e,extra,recipe,privacy:p,metadataPrivacy:{status:Object.values(metadataFlags).some(Boolean)?'FAIL':'PASS',flaggedRowsByCategory:metadataFlags},secrets:{status:Object.entries(p.flaggedRowsByCategory).filter(([k])=>['apiKey','bearerJWT','passwordPrivateKey','databaseConnection','opaqueToken'].includes(k)).some(([,n])=>n)?'FAIL':'PASS'},rolesByLanguage,changedRows:changes.length,unchangedRows:count-changes.length,independentReview:'OPTIONAL_NOT_PERFORMED',admission:'PENDING_AUTOMATED_ADMISSION_DECISION'}
}
const fb=fs.readFileSync(path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl')),ob=fs.readFileSync(path.join(ROOT,'server/src/copilot/data/hr_agent_intents_10000.jsonl'))
assert.equal(hash(fb),'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05');assert.equal(hash(ob),'1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b')
const unique=list=>[...new Map(list.map(x=>[x.text,x])).values()],F=unique(jsonLines(fb).map(r=>prepare(r.input,r.expected_entities))),O=unique(jsonLines(ob).map(r=>prepare(r.text))),views=rows=>rows.map(r=>{const v=prepare(r.input.text);v.alternates=r.input.text===r.wireProjection.inputText?[]:[prepare(r.wireProjection.inputText,{...(r.wireProjection.questionPlan??{}),...(r.wireProjection.actionPlan??{})})];return v})
const R=views(jsonLines(read('runtime-reference-v1.1.jsonl'))),S=views(jsonLines(read('model-selection-v1.1.jsonl')))
datasets.runtime.contamination={frozen404:compare(R,F),historical10K:compare(R,O)}
datasets.selection.contamination={frozen404:compare(S,F),historical10K:compare(S,O),runtimeReference:compare(S,unique(R.flatMap(r=>[r,...r.alternates])))}
for(const d of Object.values(datasets)){d.automatedGatesPass=d.quality.status==='PASS'&&d.envelope.status==='PASS'&&d.extra.status==='PASS'&&d.recipe.status==='PASS'&&d.privacy.status!=='FAIL'&&d.metadataPrivacy.status==='PASS'&&d.secrets.status==='PASS'&&Object.values(d.contamination).every(c=>c.flaggedCandidateRows===0);d.admission=d.automatedGatesPass?'PENDING_AUTOMATED_ADMISSION_DECISION':'REJECTED';d.admissionReasons=[...(!d.automatedGatesPass?['automated_gate_failure']:[])]}
const report={version:'CEB-AUTO-ADMISSION-1-validation',policySha256:hash(policyBytes),humanReviewPerformed:false,linguisticLimitation:'No independent human linguistic review; automated checks do not establish perfect naturalness or semantic independence',created:new Date().toISOString(),validatorSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),coreSha256:hash(read('validation/core.mjs')),thresholds:'Unchanged Phase 1C.3 / original validator-v2: exact, normalized, entity-mask; >5-token 3-shingle Jaccard>=.80, short character Dice>=.90, Unicode edit>=.90; no embedding/model calls',...datasets,protectedIntegrity:{frozen404:hash(fb),historical10K:hash(ob),generationInputsMatch:true},independentReview:'OPTIONAL_NOT_PERFORMED',publicAdmission:false,productionDataUsed:false,productionAccess:false,cloudModelCalls:0,ollamaModelCalls:0,frozenCasesExecuted:0,fineTuningStarted:false,protectedContentDisclosed:false}
fs.writeFileSync(path.join(OUT,'validation-results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({status:'FIXED_SCAN_COMPLETE',runtime:{automated:report.runtime.automatedGatesPass,extra:report.runtime.extra,recipe:report.runtime.recipe,contamination:report.runtime.contamination},selection:{automated:report.selection.automatedGatesPass,extra:report.selection.extra,recipe:report.selection.recipe,contamination:report.selection.contamination},humanReviewPerformed:false,modelCalls:0,protectedContentDisclosed:false}))
