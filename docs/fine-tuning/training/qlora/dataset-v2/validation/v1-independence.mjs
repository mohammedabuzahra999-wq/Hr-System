// Additional conservative exclusion against the quarantined release. No text,
// row identifiers, selectors or rewrite suggestions leave the sealed child.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepare,compare,selfTest} from './compare.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),root=path.resolve(base,'../../../../..'),prior=path.resolve(base,'../dataset-v1/candidate/dataset.jsonl');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!process.argv.includes('--sealed-native')){
 const allowed=[base,prior,path.join(root,'docs/fine-tuning/controlled-assets/remediation-v1.1/validation/core.mjs')];
 const child=spawn(process.execPath,['--permission',...allowed.map(p=>'--allow-fs-read='+p),'--allow-fs-write='+dir,fileURLToPath(import.meta.url),'--sealed-native'],{cwd:root,env:{SystemRoot:process.env.SystemRoot,PATH:path.dirname(process.execPath)},stdio:'inherit',windowsHide:true});
 child.on('error',()=>{console.error('INDEPENDENCE_CHILD_START_FAILED');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}else{
 if(!process.permission||process.permission.has('fs.read',path.join(root,'server/.env'))||process.permission.has('fs.read',path.join(root,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl')))throw Error('INDEPENDENCE_ISOLATION_REQUIRED');
 globalThis.fetch=()=>{throw Error('INDEPENDENCE_NETWORK_DENIED');};
 const generation=JSON.parse(fs.readFileSync(path.join(base,'generation/pre-generation-manifest.json'),'utf8'));
 for(const[p,h]of Object.entries(generation.validatorHashesBeforeProtectedChecks))if(hash(fs.readFileSync(path.join(root,p)))!==h)throw Error('VALIDATOR_DRIFT');
 const local=JSON.parse(fs.readFileSync(path.join(dir,'local-results.json'),'utf8'));if(local.status!=='PASS')throw Error('LOCAL_REQUIRED');
 const bytes=fs.readFileSync(path.join(base,'candidate/dataset.jsonl')),old=fs.readFileSync(prior),priorSha256=hash(old);
 if(priorSha256!=='21a5bb1b466d92b2b838df663c1326c47fcf891419553413bd1203eefc4f5a8a'||hash(bytes)!==local.candidatePayloadSha256)throw Error('CANDIDATE_OR_PRIOR_DRIFT');
 const parse=b=>b.toString('utf8').trim().split(/\r?\n/).map(JSON.parse).map(r=>prepare(r.input.question));
 const reports=compare(parse(bytes),parse(old),n=>console.log(JSON.stringify({stage:'sealed_v1_independence',candidatesChecked:n})));
 const status=reports.flaggedCandidateRows===0?'PASS':'FAIL';
 fs.writeFileSync(path.join(dir,'v1-independence-results.json'),JSON.stringify({status,checkedAt:new Date().toISOString(),candidateSha256:hash(bytes),quarantinedV1Sha256:priorSha256,reports,thresholds:'Unchanged compare.mjs, same zero-match gate',checkerParity:selfTest(),priorReadOnlyForExclusion:true,matchIdsOrTextDisclosed:false,noAdaptiveRewrite:true,modelCalls:0,trainingStarted:false},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({stage:'sealed_v1_independence_complete',status,...reports}));if(status!=='PASS')process.exitCode=1;
}
