// Fixed offline verification modes only. No generation, benchmark, model or service mode.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
const HERE=path.dirname(fileURLToPath(import.meta.url)),R=path.resolve(HERE,'../..'),C=path.dirname(R),ROOT=path.resolve(R,'../../../..'),mode=process.argv[2]
const modes={validate:'validate.mjs',selftest:'selftest.mjs',preflight:'evaluation/preflight.mjs',publish:'publish-decision.mjs',runtime:'evaluation/verify-runtime.mjs'}
if(!Object.hasOwn(modes,mode)||process.argv.length!==3)throw Error('FIXED_VERIFICATION_MODE_REQUIRED')
const read=[path.join(HERE,modes[mode]),path.join(HERE,'run.mjs'),path.join(C,'generation/offline-guard.mjs')],write=[]
const add=(...p)=>read.push(...p.map(x=>path.join(HERE,x))),old=(...p)=>read.push(...p.map(x=>path.join(R,x)))
if(['validate','selftest','preflight','runtime'].includes(mode)){
 read.push(path.join(C,'validation/contracts.mjs'),path.join(ROOT,'node_modules/zod'),path.join(ROOT,'node_modules/typescript'),path.join(ROOT,'shared/src'))
 for(const p of ['actions','intents','validatePlan'])read.push(path.join(ROOT,`server/src/copilot/${p}.ts`));read.push(path.join(ROOT,'server/src/permissions.ts'))
}
if(mode==='validate'){
 add('automated-extra.mjs');old('validation/core.mjs','validation/envelope.mjs','validation/validate.mjs','runtime-reference-v1.1.jsonl','model-selection-v1.1.jsonl','generation/generation-result.json','generation/pre-generation-manifest.json','generation/row-deltas.json','generation/remediation-plan.json','generation/replacement-catalog.json','generation/remediate.mjs','validation/exclusion-selectors.json','run-offline.mjs');read.push(path.join(C,'runtime-reference-v1.jsonl'),path.join(C,'model-selection-v1.jsonl'),path.join(C,'generation/contracts-v1.json'),path.join(ROOT,'docs/fine-tuning/design/05-protocol-amendment-automated-admission.md'),path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'),path.join(ROOT,'server/src/copilot/data/hr_agent_intents_10000.jsonl'));write.push('validation-results.json')
}
if(mode==='selftest'){add('automated-extra.mjs');old('validation/core.mjs');write.push('selftest-results.json')}
if(mode==='preflight'){
 old('evaluation/controlled-loader.mjs','evaluation/resolver-capsule.mjs','evaluation/target-lock.json','admission/admission-gate.json');for(const p of ['resolve','readRules','readPeriods','personName','teamPresence'])read.push(path.join(ROOT,`server/src/copilot/${p}.ts`));write.push('evaluation/preflight-isolation-results.json')
}
if(mode==='publish'){add('validation-results.json','selftest-results.json','evaluation/preflight-isolation-results.json','validate.mjs','automated-extra.mjs','selftest.mjs','evaluation/preflight.mjs');read.push(path.join(ROOT,'docs/fine-tuning/design/05-protocol-amendment-automated-admission.md'));write.push('admission-decision.json')}
if(mode==='runtime'){
 add('evaluation/controlled-loader.mjs','evaluation/resolver-capsule.mjs','evaluation/target-lock.json','admission-decision.json','validation-results.json');old('runtime-reference-v1.1.jsonl');for(const p of ['resolve','readRules','readPeriods','personName','teamPresence'])read.push(path.join(ROOT,`server/src/copilot/${p}.ts`));write.push('evaluation/runtime-exclusion-results.json')
}
const env={NODE_ENV:'test',TZ:'Asia/Riyadh'};for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[k])env[k]=process.env[k]
for(const p of read)if(!fs.existsSync(p))throw Error('VERIFICATION_INPUT_MISSING')
const args=['--permission',...read.map(p=>'--allow-fs-read='+p),...write.map(p=>'--allow-fs-write='+path.join(HERE,p)),'--experimental-vm-modules','--import',pathToFileURL(path.join(C,'generation/offline-guard.mjs')).href,path.join(HERE,modes[mode])]
const r=spawnSync(process.execPath,args,{cwd:ROOT,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1000000});if(r.error){console.error('VERIFICATION_CHILD_FAILED');process.exitCode=1}else{process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status??1}
