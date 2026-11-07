// Only readiness/self-test/freeze modes. No model transport exists in this entry point.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../../..'),C=path.join(ROOT,'docs/fine-tuning/controlled-assets'),A=path.join(C,'remediation-v1.1/admission/automated-policy-v1'),mode=process.argv[2]
const modes={selftest:'scorer.selftest.mjs',partition:'partition.mjs',verify:'verify.mjs'}
if(process.argv.length!==3||!Object.hasOwn(modes,mode))throw Error('FIXED_OFFLINE_READINESS_MODE_REQUIRED')
const lock=JSON.parse(fs.readFileSync(path.join(HERE,'source-lock.json'),'utf8'))
const read=[path.join(HERE,modes[mode]),path.join(HERE,'scorer.mjs'),path.join(HERE,'source-lock.json'),path.join(HERE,'run-offline.mjs'),path.join(HERE,'readiness-guard.mjs'),path.join(C,'validation/contracts.mjs'),path.join(C,'generation/offline-guard.mjs'),path.join(ROOT,'node_modules/zod'),path.join(ROOT,'node_modules/typescript'),...Object.keys(lock.sourceHashes).map(p=>path.join(ROOT,p))]
const write={selftest:['scorer-selftest-final-results.json','scorer-selftest-attempt-002.json'],partition:['selection-partition.json','rendered-model-requests.json','partition-diagnostics.json'],verify:['readiness-check-final-results.json']}[mode]
if(['partition','verify'].includes(mode))read.push(...Object.keys(lock.dependencyHashes).map(p=>path.join(ROOT,p)),path.join(HERE,'resolver-capsule.mjs'),path.join(A,'evaluation/controlled-loader.mjs'),path.join(A,'evaluation/target-lock.json'),path.join(A,'admission-decision.json'),path.join(A,'validation-results.json'),path.join(C,'remediation-v1.1/runtime-reference-v1.1.jsonl'),path.join(C,'remediation-v1.1/model-selection-v1.1.jsonl'),path.join(HERE,'scoring-specification.json'),path.join(HERE,'run-contract.json'))
if(mode==='verify')for(const p of ['partition.mjs','execution-contract.mjs','selection-partition.json','rendered-model-requests.json','partition-diagnostics.json','scorer-selftest-final-results.json','scorer.selftest.mjs','candidate-policy.md','metrics-and-winner-rules.md','environment-capture.json'])read.push(path.join(HERE,p))
const env={NODE_ENV:'test',TZ:'Asia/Riyadh'};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key]
const args=['--permission',...read.map(p=>'--allow-fs-read='+p),...write.map(p=>'--allow-fs-write='+path.join(HERE,p)),'--experimental-vm-modules','--import',pathToFileURL(path.join(HERE,'readiness-guard.mjs')).href,path.join(HERE,modes[mode])]
const r=spawnSync(process.execPath,args,{cwd:ROOT,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1000000});if(r.error){console.error('OFFLINE_READINESS_CHILD_FAILED');process.exitCode=1}else{process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status??1}
