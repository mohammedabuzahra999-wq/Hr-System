import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {exporter} from './prompt-export.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),root=path.resolve(base,'../../../../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fileHash(p){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(p))h.update(b);return h.digest('hex');}
const json=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const generation=json('generation/pre-generation-manifest.json'),local=json('validation/local-results.json'),sealed=json('validation/sealed-exclusion-results.json'),generated=json('candidate/generation-result.json');
if(local.status!=='PASS'||sealed.status!=='PASS')throw Error('ADMISSION_GATES_NOT_PASS');
for(const[p,h]of Object.entries({...generation.inputs,...generation.validatorHashesBeforeProtectedChecks}))if(await fileHash(path.join(root,p))!==h)throw Error('RECIPE_OR_CHECKER_DRIFT');
const candidatePath=path.join(base,'candidate/dataset.jsonl'),bytes=fs.readFileSync(candidatePath),datasetHash=hash(bytes);
if(datasetHash!==sealed.candidateSha256||datasetHash!==generated.sha256)throw Error('CANDIDATE_HASH_DRIFT');
const rows=bytes.toString('utf8').trim().split('\n').map(JSON.parse);if(rows.length!==8000)throw Error('COUNT_DRIFT');
const admitted=path.join(base,'admitted');fs.mkdirSync(admitted);
fs.writeFileSync(path.join(admitted,'dataset.jsonl'),bytes,{flag:'wx'});
const ex=await exporter();
const files=Object.fromEntries(['train','dev','internalTest'].map(s=>[s,fs.openSync(path.join(admitted,s==='internalTest'?'internal-test.jsonl':s+'.jsonl'),'wx')]));
const index=fs.openSync(path.join(admitted,'split-index.jsonl'),'wx'),counts={train:0,dev:0,internalTest:0};let maxPromptBytes=0,maxCompletionBytes=0;
try{for(const row of rows){const wire=ex.format(row),line=JSON.stringify(wire)+'\n';fs.writeSync(files[row.split],line);counts[row.split]++;maxPromptBytes=Math.max(maxPromptBytes,Buffer.byteLength(JSON.stringify(wire.prompt)));maxCompletionBytes=Math.max(maxCompletionBytes,Buffer.byteLength(wire.completion[0].content));fs.writeSync(index,JSON.stringify({recordId:row.recordId,familyId:row.lineage.familyId,split:row.split,splitLine:counts[row.split],canonicalRecordSha256:hash(JSON.stringify(row)),modelExampleSha256:hash(line)})+'\n');}}
finally{for(const fd of Object.values(files))fs.closeSync(fd);fs.closeSync(index);}
if(Object.values(ex.privacy.flags).some(Boolean))throw Error('MODEL_EXPORT_PRIVACY_SCAN_FAILED');
const projectionReport={createdAt:new Date().toISOString(),...ex.identity,rows:counts,promptPrivacy:ex.privacy,maxPromptBytes,maxCompletionBytes,tokenization:'NOT EXECUTED; pinned tokenizer/loss-mask qualification is a separate pre-training gate; no silent truncation is performed',trainingStarted:false};
fs.writeFileSync(path.join(base,'validation/prompt-export-results.json'),JSON.stringify(projectionReport,null,2)+'\n',{flag:'wx'});
const protectedFiles=json('protected-before.json'),mismatches=[];for(const[p,h]of Object.entries(protectedFiles))if(await fileHash(path.join(root,p))!==h)mismatches.push(p);if(mismatches.length)throw Error('PROTECTED_EVIDENCE_DRIFT');
const artifactHashes={};for(const file of fs.readdirSync(admitted).sort())artifactHashes['admitted/'+file]=await fileHash(path.join(admitted,file));
const manifest={version:'HR-QLORA-PLACEHOLDER-DATASET-1',admittedAt:new Date().toISOString(),status:'ADMITTED_FOR_CONTROLLED_EXPERIMENT_DATA_ONLY',policy:'CEB-AUTO-ADMISSION-1 with owner-authorized training purpose and placeholder-only override',authority:'Current owner request to create and admit exactly 8000 new synthetic examples',baseModel:generation.baseModel,revision:generation.revision,provenanceLimitationAccepted:true,exactGgufConversionLinkVerified:false,
 datasetSha256:datasetHash,canonicalDataset:'admitted/dataset.jsonl',uniqueExamples:8000,families:2000,splits:counts,languages:local.totals.languages,intentCoverage:Object.keys(local.totals.intents).length,actionBoundaryCoverage:Object.keys(local.totals.actions).length,actionBoundaryMeaning:'All 48 categories labelled doAction at resolveQuestion stage; no second-stage action extraction training',format:'Canonical input -> existing {plan: CopilotPlan}; one-to-one conversational prompt-completion split projections',artifactHashes,
 purpose:'Supervised HR language understanding, never factual HR answering, authorization or execution',generationSources:generation.inputs,validatorHashes:generation.validatorHashesBeforeProtectedChecks,
 validation:{strictSchema:'PASS',sharedSemantics:'PASS',rolesAndNonExecution:'PASS',privacy:'PASS_STATIC_WITH_LIMITATIONS',duplicates:local.duplicates,protectedContamination:sealed.status,familySplitLeakage:'PASS',crossSplitNearDuplicates:'PASS'},
 excludedSources:sealed.sources.map(x=>({file:x.file,sha256:x.sha256})),runtimeReferencesInPromptOnly:ex.identity.runtimeReferenceSha256,referenceRowsUsedAsTargets:false,protectedInputsAvailableToGenerator:false,
 humanReviewPerformed:false,limitations:['Template-composed synthetic data is not independently human-validated for naturalness or cross-language semantic independence','Placeholder-only identities do not establish natural-name extraction capability','Static privacy and lexical decontamination do not prove every PII form or complete semantic independence','Exact BEFORE GGUF conversion provenance link remains owner-accepted and unverified','Pinned tokenizer/loss masks, training environment and training execution are separate stages'],
 beforeEvidenceUnchanged:true,frozen404Executed:0,modelCalls:0,trainingStarted:false};
fs.writeFileSync(path.join(base,'dataset-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(base,'admission-decision.json'),JSON.stringify({decision:'ADMITTED_FOR_CONTROLLED_EXPERIMENT_DATA_ONLY',createdAt:manifest.admittedAt,datasetSha256:datasetHash,manifestSha256:await fileHash(path.join(base,'dataset-manifest.json')),allRequestedDataGatesPass:true,humanReviewPerformed:false,trainingAuthorizedOrStarted:false,priorProtectedFilesUnchanged:Object.keys(protectedFiles).length,limitations:manifest.limitations},null,2)+'\n',{flag:'wx'});
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]);
const all=walk(base).filter(p=>path.basename(p)!=='evidence-hashes.sha256').sort(),lines=[];for(const p of all)lines.push(path.relative(root,p).split(path.sep).join('/')+'\t'+await fileHash(p));
fs.writeFileSync(path.join(base,'evidence-hashes.sha256'),lines.join('\n')+'\n',{flag:'wx'});
// A logical freeze uses write-once exports and content hashes; read-only attributes
// also prevent accidental edits. No earlier file or source attribute is changed.
for(const f of fs.readdirSync(admitted))fs.chmodSync(path.join(admitted,f),0o444);
console.log(JSON.stringify({dataset:'CREATED_AND_ADMITTED',rows:8000,splits:counts,datasetSha256:datasetHash,protectedFilesUnchanged:Object.keys(protectedFiles).length,trainingStarted:false},null,2));
