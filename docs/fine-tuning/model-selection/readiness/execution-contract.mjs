// Executable payload/identity contract only. No HTTP client and no evaluation loop.
import assert from 'node:assert/strict'
import {hash} from '../../controlled-assets/validation/contracts.mjs'
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
const nonempty=x=>typeof x==='string'&&x.trim().length>0
export function assertCandidate(candidate,contract){
 assert.equal(candidate.status,'APPROVED_FOR_CONTROLLED_SELECTION','CANDIDATE_NOT_ADMITTED')
 for(const key of ['candidateId','modelFamily','exactTag','quantization','runtimeVersion','licenseSpdx','trainableCheckpointRepository','trainableCheckpointRevision','adaptationMethod'])assert.ok(nonempty(candidate[key]),'MISSING_CANDIDATE_IDENTITY')
 for(const key of ['inferenceDigest','tokenizerSha256','templateSha256','checkpointManifestSha256','licenseEvidenceSha256','adaptationEvidenceSha256','conversionRecipeSha256','runtimeBinarySha256'])assert.ok(digest(candidate[key]),'MISSING_VERIFIED_ARTIFACT_DIGEST')
 assert.ok(Number.isFinite(candidate.parameterBillions)&&candidate.parameterBillions>0&&candidate.parameterBillions<=4,'OUTSIDE_SMALL_MODEL_CPU_TRACK')
 assert.equal(candidate.runtime,'ollama');assert.equal(candidate.local,true);assert.equal(candidate.cloud,false)
 assert.equal(candidate.provenanceVerified,true);assert.equal(candidate.licenseVerified,true);assert.equal(candidate.adaptationVerified,true)
 assert.equal(candidate.quantization,contract.candidateTrack.quantization,'INCOMPARABLE_QUANTIZATION_TRACK')
 assert.equal(candidate.supportsNativeJsonSchema,true);assert.equal(candidate.supportsCommonOptions,true)
 assert.equal(candidate.supportsSeed,true,'SEED_UNSUPPORTED_REQUIRES_SEPARATE_PREDECLARED_TRACK')
 assert.ok(['qwen3_non_thinking','non_reasoning','verified_think_false'].includes(candidate.generationPolicy),'UNVERIFIED_REASONING_POLICY')
 assert.ok(!/\s|[\r\n]/.test(candidate.exactTag),'INVALID_MODEL_TAG')
 return true
}
export function buildRequest(candidate,captured,contract){
 assertCandidate(candidate,contract)
 assert.equal(contract.version,'CEB-MODEL-RUN-1.0.0');assert.equal(contract.transport.endpoint,'http://127.0.0.1:11434/api/chat')
 assert.equal(captured.messagesSha256,hash(JSON.stringify(captured.messages)),'RENDERED_MESSAGES_DRIFT')
 assert.equal(captured.schemaSha256,hash(JSON.stringify(captured.schema)),'RENDERED_SCHEMA_DRIFT')
 assert.equal(captured.representation,'wire');assert.equal(captured.previousPlan,null)
 assert.equal(captured.messages.length,2);assert.equal(captured.messages[0].role,'system');assert.equal(captured.messages[1].role,'user')
 const messages=structuredClone(captured.messages)
 // Existing family control, not candidate-specific HR guidance. Shared captured messages stay unchanged.
 if(candidate.generationPolicy==='qwen3_non_thinking')messages[1].content+=' /no_think'
 const body={model:candidate.exactTag,messages,format:structuredClone(captured.schema),think:false,stream:false,keep_alive:contract.inference.keepAlive,
  options:{temperature:contract.inference.temperature,top_p:contract.inference.topP,seed:contract.inference.seed,num_predict:contract.inference.maxOutputTokens,num_ctx:contract.inference.contextTokens,num_thread:contract.inference.threads,num_batch:contract.inference.batchSize,num_gpu:0}}
 return{url:contract.transport.endpoint,method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',requestTimeoutMs:contract.deadlines.requestMs,parentTimeoutMs:contract.deadlines.parentMs,maxResponseBytes:contract.transport.maxResponseBytes,body,bodySha256:hash(JSON.stringify(body)),sharedMessagesSha256:captured.messagesSha256,requestPolicy:'NO_RETRY_NO_FALLBACK',authority:'CLASSIFICATION_ONLY_NEVER_EXECUTE'}
}
export function assertMonotonicDuration(start,end){assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=150000,'INVALID_MONOTONIC_DURATION');return end-start}
