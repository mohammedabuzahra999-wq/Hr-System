// Sealed exclusion role: expose only already-authored candidate handles, never F text/golds/IDs.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {jsonLines,prepare,compare} from './core.mjs'
const HERE=path.dirname(fileURLToPath(import.meta.url)),BASE=path.dirname(HERE),PARENT=path.dirname(BASE),ROOT=path.resolve(PARENT,'../../..')
const hash=b=>createHash('sha256').update(b).digest('hex')
assert.ok(process.permission&&!process.permission.has('child')&&!process.permission.has('worker'))
const rb=fs.readFileSync(path.join(PARENT,'runtime-reference-v1.jsonl')),fb=fs.readFileSync(path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'))
assert.equal(hash(rb),'342503dd6c810136d8b5ede8dea96005e593a2ee623f849640fcfd357bb826de')
assert.equal(hash(fb),'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05')
const R=jsonLines(rb),F=jsonLines(fb),refs=F.map(r=>prepare(r.input,r.expected_entities)),ids=[]
for(const row of R){const view=prepare(row.input.text);view.alternates=row.input.text===row.wireProjection.inputText?[]:[prepare(row.wireProjection.inputText,{...(row.wireProjection.questionPlan??{}),...(row.wireProjection.actionPlan??{})})];if(compare([view],refs).flaggedCandidateRows)ids.push({candidateRecordId:row.recordId,candidateRowSha256:hash(JSON.stringify(row))})}
assert.equal(ids.length,3,'UNEXPECTED_EXCLUSION_COUNT_STOP')
const result={version:'CEB-R-remediation-selectors-v1',created:new Date().toISOString(),authority:'User Phase 1C.4R: identify and replace only the three previously rejected candidate records',runtimeSha256:hash(rb),frozenSha256:hash(fb),selectors:ids,disclosure:'Candidate handles only; no F text, gold, protected ID, similarity score or rewrite guidance',frozenCasesExecuted:0,modelCalls:0}
fs.writeFileSync(path.join(BASE,'validation/exclusion-selectors.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({status:'EXCLUSION_SELECTORS_CREATED',count:ids.length,selectors:ids,protectedContentExposed:false}))
