// Fixed evaluation-only launcher; no user-supplied input/model/network mode.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
const BASE=path.dirname(fileURLToPath(import.meta.url)),PARENT=path.dirname(BASE),ROOT=path.resolve(PARENT,'../../..'),mode=process.argv[2]
const modes={identify:'validation/identify-exclusions.mjs',generate:'generation/remediate.mjs',validate:'validation/validate.mjs',selftest:'validation/selftest.mjs',isolation:'evaluation/self-test.mjs',review:'review/build-register.mjs'}
if(!Object.hasOwn(modes,mode)||process.argv.length!==3)throw Error('FIXED_OFFLINE_MODE_REQUIRED')
const abs=p=>path.isAbsolute(p)?p:path.join(BASE,p),read=[modes[mode],'run-offline.mjs',path.join(PARENT,'generation/offline-guard.mjs')],write=[]
const pure=()=>{read.push('validation/core.mjs',path.join(PARENT,'validation/contracts.mjs'));for(const p of ['zod','typescript'])read.push(path.join(ROOT,'node_modules',p));read.push(path.join(ROOT,'shared/src'));for(const p of ['intents','actions','validatePlan'])read.push(path.join(ROOT,`server/src/copilot/${p}.ts`));read.push(path.join(ROOT,'server/src/permissions.ts'))}
if(['identify','validate','selftest','isolation'].includes(mode))pure()
if(mode==='identify'){read.push(path.join(PARENT,'runtime-reference-v1.jsonl'),path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'));write.push('validation/exclusion-selectors.json')}
if(mode==='generate'){read.push('generation/replacement-catalog.json','generation/remediation-plan.json','validation/exclusion-selectors.json',path.join(PARENT,'generation/contracts-v1.json'),path.join(PARENT,'runtime-reference-v1.jsonl'),path.join(PARENT,'model-selection-v1.jsonl'));write.push('runtime-reference-v1.1.jsonl','model-selection-v1.1.jsonl','generation/pre-generation-manifest.json','generation/generation-result.json','generation/row-deltas.json')}
if(mode==='validate'){read.push('runtime-reference-v1.1.jsonl','model-selection-v1.1.jsonl','generation/generation-result.json','generation/pre-generation-manifest.json','generation/replacement-catalog.json','generation/remediation-plan.json','generation/remediate.mjs','generation/row-deltas.json','validation/envelope.mjs',path.join(PARENT,'validation/envelope-quality.mjs'),path.join(PARENT,'runtime-reference-v1.jsonl'),path.join(PARENT,'model-selection-v1.jsonl'),path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'),path.join(ROOT,'server/src/copilot/data/hr_agent_intents_10000.jsonl'));write.push('validation/validation-results.json')}
if(mode==='review'){read.push('runtime-reference-v1.1.jsonl','model-selection-v1.1.jsonl','validation/validation-results.json');write.push('review/review-register.json','review/review-summary.json')}
if(mode==='isolation'){read.push('evaluation/controlled-loader.mjs','evaluation/resolver-capsule.mjs','evaluation/target-lock.json','runtime-reference-v1.1.jsonl','model-selection-v1.1.jsonl');for(const p of ['resolve','readRules','readPeriods','personName'])read.push(path.join(ROOT,`server/src/copilot/${p}.ts`));write.push('evaluation/isolation-results.json')}
const env={NODE_ENV:'test',TZ:'Asia/Riyadh'};for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[k])env[k]=process.env[k]
for(const p of read)if(!fs.existsSync(abs(p)))throw Error('INPUT_MISSING: '+p)
const args=['--permission',...read.map(p=>'--allow-fs-read='+abs(p)),...write.map(p=>'--allow-fs-write='+abs(p)),'--experimental-vm-modules','--import',pathToFileURL(path.join(PARENT,'generation/offline-guard.mjs')).href,abs(modes[mode])]
const r=spawnSync(process.execPath,args,{cwd:ROOT,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1000000})
if(r.error){console.error('RESTRICTED_TOOL_FAILED');process.exitCode=1}else{process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status??1}
