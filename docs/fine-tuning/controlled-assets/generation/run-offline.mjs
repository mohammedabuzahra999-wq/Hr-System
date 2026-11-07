// Reviewed launcher: only fixed tool paths/outputs; never starts application services.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
const HERE=path.dirname(fileURLToPath(import.meta.url)),BASE=path.dirname(HERE),ROOT=path.resolve(BASE,'../../..')
const mode=process.argv[2]
if(!['contracts','generate','validate','self-test','validate-v2','self-test-v2','envelope'].includes(mode)||process.argv.length!==3)throw new Error('FIXED_TOOL_MODE_REQUIRED')
const env={NODE_ENV:'test',TZ:'Asia/Riyadh'};for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[k])env[k]=process.env[k]
const read=['generation/offline-guard.mjs',mode==='generate'?'generation/generate-controlled-assets.mjs':mode==='contracts'?'validation/contracts.mjs':mode==='envelope'?'validation/envelope-quality.mjs':mode.endsWith('-v2')?'validation/validate-controlled-assets-v2.mjs':'validation/validate-controlled-assets.mjs']
const write=[]
if(mode==='generate'){read.push('generation/templates-v1.mjs','generation/contracts-v1.json');write.push('runtime-reference-v1.jsonl','model-selection-v1.jsonl','generation/pre-generation-manifest.json','generation/generation-result.json')}
else{read.push('validation/contracts.mjs');for(const p of ['zod','typescript'])read.push(path.join(ROOT,'node_modules',p));read.push(path.join(ROOT,'shared/src'));for(const p of ['intents','actions','validatePlan'])read.push(path.join(ROOT,`server/src/copilot/${p}.ts`));read.push(path.join(ROOT,'server/src/permissions.ts'))
 if(mode==='contracts')write.push('generation/contracts-v1.json')
 else if(mode==='envelope'){read.push('runtime-reference-v1.jsonl','model-selection-v1.jsonl');write.push('validation/envelope-results.json')}
 else if(mode==='validate'||mode==='validate-v2'){read.push('runtime-reference-v1.jsonl','model-selection-v1.jsonl','generation/templates-v1.mjs','generation/generate-controlled-assets.mjs','generation/contracts-v1.json','generation/pre-generation-manifest.json','generation/generation-result.json',path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'),path.join(ROOT,'server/src/copilot/data/hr_agent_intents_10000.jsonl'));write.push(mode==='validate-v2'?'validation/validation-results-v2.json':'validation/validation-results.json')}
}
const abs=p=>path.isAbsolute(p)?p:path.join(BASE,p)
for(const p of read)if(!fs.existsSync(abs(p)))throw new Error('TOOL_INPUT_MISSING')
const args=['--permission',...read.map(p=>'--allow-fs-read='+abs(p)),...write.map(p=>'--allow-fs-write='+abs(p)),'--experimental-vm-modules','--import',pathToFileURL(path.join(HERE,'offline-guard.mjs')).href,abs(read[1]),...(mode==='contracts'?['--export']:mode.startsWith('self-test')?['--self-test']:[])]
const r=spawnSync(process.execPath,args,{cwd:ROOT,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:2000000})
if(r.error){console.error('OFFLINE_TOOL_PROCESS_FAILED');process.exitCode=1}else{process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status??1}
