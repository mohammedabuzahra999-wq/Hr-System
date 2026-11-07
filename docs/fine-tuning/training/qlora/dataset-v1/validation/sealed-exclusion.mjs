// Sealed exclusion role. Protected material is never returned, rewritten or exported.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {prepare,compare,selfTest} from './compare.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),root=path.resolve(base,'../../../../..');
if(!process.argv.includes('--sealed-native')||!process.permission||process.permission.has('fs.read',path.join(root,'server/.env')))throw Error('SEALED_NATIVE_ISOLATION_REQUIRED');
globalThis.fetch=()=>{throw Error('SEALED_NETWORK_DENIED');};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.join(root,p));
const load=p=>read(p).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const generation=JSON.parse(fs.readFileSync(path.join(base,'generation/pre-generation-manifest.json'),'utf8'));
for(const[p,h]of Object.entries(generation.validatorHashesBeforeProtectedChecks))if(hash(read(p))!==h)throw Error('VALIDATOR_DRIFT');
const local=JSON.parse(fs.readFileSync(path.join(dir,'local-results.json'),'utf8'));if(local.status!=='PASS')throw Error('LOCAL_VALIDATION_REQUIRED');
const candidates=fs.readFileSync(path.join(base,'candidate/dataset.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const generationResult=JSON.parse(fs.readFileSync(path.join(base,'candidate/generation-result.json'),'utf8'));
const candidateBytes=fs.readFileSync(path.join(base,'candidate/dataset.jsonl'));if(hash(candidateBytes)!==generationResult.sha256)throw Error('CANDIDATE_DRIFT');
if(local.candidatePayloadSha256!==hash(candidateBytes))throw Error('LOCAL_REPORT_CANDIDATE_MISMATCH');
const unique=a=>[...new Map(a.map(x=>[x.text,x])).values()];
const views=candidates.map(r=>prepare(r.input.question));
const sources=[
 ['frozen404','docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl','b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05'],
 ['historical10K','server/src/copilot/data/hr_agent_intents_10000.jsonl','1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b'],
 ['runtimeV1','docs/fine-tuning/controlled-assets/runtime-reference-v1.jsonl','342503dd6c810136d8b5ede8dea96005e593a2ee623f849640fcfd357bb826de'],
 ['runtimeV11','docs/fine-tuning/controlled-assets/remediation-v1.1/runtime-reference-v1.1.jsonl','f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736'],
 ['selectionV1','docs/fine-tuning/controlled-assets/model-selection-v1.jsonl','8d50c67b4daa388c9cadcd3e992e0aa8504a08534b1beb4bdc2a022ac62928c6'],
 ['selectionV11','docs/fine-tuning/controlled-assets/remediation-v1.1/model-selection-v1.1.jsonl','09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986']
];
const sourceEvidence=[],references={frozen404:[],historical10K:[],runtimeAllVersions:[],selectionAllVersions:[]};
for(const[name,p,h]of sources){const bytes=read(p);if(hash(bytes)!==h)throw Error('EXCLUDED_DATASET_HASH_DRIFT');sourceEvidence.push({name,file:p,sha256:h,access:'sealed exclusion comparison only'});const rows=bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
 if(name==='frozen404')references.frozen404=unique(rows.map(r=>prepare(r.input,r.expected_entities)));
 else if(name==='historical10K')references.historical10K=unique(rows.map(r=>prepare(r.text)));
 else{const target=name.startsWith('runtime')?references.runtimeAllVersions:references.selectionAllVersions;for(const r of rows){target.push(prepare(r.input.text));target.push(prepare(r.wireProjection.inputText,{...(r.wireProjection.questionPlan??{}),...(r.wireProjection.actionPlan??{})}));}}
}
const reports={};
for(const[name,refs]of Object.entries(references)){
 const reference=unique(refs);console.log(JSON.stringify({stage:'sealed_exclusion_started',reference:name,candidateRows:views.length}));
 reports[name]=compare(views,reference,n=>console.log(JSON.stringify({stage:'sealed_exclusion_progress',reference:name,candidatesChecked:n})));
 console.log(JSON.stringify({stage:'sealed_exclusion_complete',reference:name,...reports[name]}));
}
const protectedFiles=JSON.parse(fs.readFileSync(path.join(base,'protected-before.json'),'utf8')),buildCopies=[];
for(const p of Object.keys(protectedFiles).filter(p=>/hr_agent_intents_10000\.jsonl$/.test(p)&&p!==sources[1][1])){if(hash(read(p))!==sources[1][2])throw Error('LEGACY_BUILD_COPY_DRIFT');buildCopies.push({file:p,sha256:sources[1][2],comparedByIdentityToSource:true});}
const pass=Object.values(reports).every(r=>r.flaggedCandidateRows===0);
const report={version:'HR-QLORA-SEALED-EXCLUSION-1',checkedAt:new Date().toISOString(),status:pass?'PASS':'FAIL',candidateSha256:hash(candidateBytes),sources:sourceEvidence,legacyBuildCopies:buildCopies,reports,checkerParity:selfTest(),protectedCasesExecuted:0,protectedDataUsedAsTrainingSource:false,protectedContentDisclosed:false,matchesIdsOrRewriteSuggestionsDisclosed:false,noAdaptiveRewrite:true,modelCalls:0,trainingStarted:false};
fs.writeFileSync(path.join(dir,'sealed-exclusion-results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
if(!pass)process.exitCode=1;
