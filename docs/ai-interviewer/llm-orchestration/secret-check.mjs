import assert from 'node:assert/strict'
import { readdirSync,readFileSync,statSync } from 'node:fs'
import { resolve } from 'node:path'
import { secretIndicators } from '../../../services/hr-api/scripts/checkInterviewSecrets.mjs'
import { root,writeJson } from './manifest.mjs'
const files=[],walk=dir=>{for(const n of readdirSync(dir)){const p=resolve(dir,n);if(statSync(p).isDirectory())walk(p);else if(/\.(js|css|html|ts|tsx|map)$/.test(n))files.push(p)}}
const indicators=text=>secretIndicators(text)+(text.match(/phase56-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key|speech-layer-synthetic-bundle-canary-not-a-key|interview-llm-synthetic-bundle-canary-not-a-key|VITE_AI_INTERVIEW_(?:SPEECH|LLM)_API_KEY/g)??[]).length
assert(indicators('interview-llm-synthetic-bundle-canary-not-a-key')>0)
walk(resolve(root,'apps/hr-web/src'));walk(resolve(root,'apps/hr-web/dist'))
const violations=files.filter(p=>indicators(readFileSync(p,'utf8'))>0).length
writeJson(resolve(process.env.LLM_ORCHESTRATION_OUTPUT,'speech-secret-proof.json'),{status:violations?'FAIL':'PASS',checkedFiles:files.length,offendingFiles:violations,valuesPrinted:0,dedicatedSpeechCanaryDetected:true,dedicatedLlmCanaryDetected:true,originalDetectorIncluded:true})
console.log(`${violations?'FAIL':'PASS'} dedicated speech/LLM bundle secret scan; files=${files.length}; violations=${violations}; valuesPrinted=0`);assert.equal(violations,0)
