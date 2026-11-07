// Loads the real 480 records for display/integrity only. No profiles or decisions are created.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {loadRealRepository,HERE,ROOT,DEFINITIONS,SOURCE_REGISTER} from '../repository.mjs'
import {guardStatus} from '../network-guard.mjs'
const repo=loadRealRepository();let checks=0
assert.equal(repo.records.length,480);checks++;assert.equal(repo.records.filter(r=>r.asset==='runtime').length,320);checks++;assert.equal(repo.records.filter(r=>r.asset==='selection').length,160);checks++
for(const p of [...DEFINITIONS.map(d=>path.resolve(HERE,'..',d.file)),SOURCE_REGISTER,path.join(ROOT,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'),path.join(ROOT,'server/src/copilot/data/hr_agent_intents_10000.jsonl')]){assert.equal(process.permission.has('fs.write',p),false);assert.throws(()=>fs.writeFileSync(p,'THIS MUST NEVER BE WRITTEN'),e=>e.code==='ERR_ACCESS_DENIED');checks++}
for(const p of ['server/.env','server/src/db/client.ts','server/src/mcp/server.ts','server/src/knowledge/service.ts']){assert.equal(process.permission.has('fs.read',path.join(ROOT,p)),false);checks++}
await assert.rejects(fetch('https://example.invalid/guard-canary'),e=>e.code==='OUTBOUND_NETWORK_DENIED');checks++;assert.throws(()=>new WebSocket('wss://example.invalid'),e=>e.code==='OUTBOUND_NETWORK_DENIED');checks++;await assert.rejects(import('openai'),e=>e.code==='MODULE_NOT_ALLOWED');checks++;await assert.rejects(import('node:child_process'),e=>e.code==='MODULE_NOT_ALLOWED');checks++
assert.equal(process.permission.has('child'),false);checks++;assert.equal(process.permission.has('worker'),false);checks++;for(const key of ['OPENAI_API_KEY','OPENROUTER_API_KEY','DATABASE_URL','NODE_OPTIONS']){assert.equal(process.env[key],undefined);checks++}
repo.assertIntegrity();checks++;console.log(JSON.stringify({status:'PASS',checks,available:{runtime:320,selection:160},originalAssetWritesDenied:true,externalCalls:guardStatus().externalCalls,modelCalls:0,humanDecisionsCreated:0}))
