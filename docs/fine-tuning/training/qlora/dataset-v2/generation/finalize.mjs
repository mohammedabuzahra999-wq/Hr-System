// Freeze either an admitted release or an immutable quarantined candidate.
// Never modify examples after protected admission feedback.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {exporter} from './prompt-export.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),root=path.resolve(base,'../../../../..');
globalThis.fetch=()=>{throw Error('FINALIZATION_NETWORK_DENIED');};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fileHash(p){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(p))h.update(b);return h.digest('hex');}
const read=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8')),write=(p,j)=>fs.writeFileSync(path.join(base,p),JSON.stringify(j,null,2)+'\n',{flag:'wx'});
const generation=read('generation/pre-generation-manifest.json'),local=read('validation/local-results.json'),sealed=read('validation/sealed-exclusion-results.json'),independent=read('validation/v1-independence-results.json'),generated=read('candidate/generation-result.json');
for(const[p,h]of Object.entries({...generation.inputs,...generation.validatorHashesBeforeProtectedChecks}))if(await fileHash(path.join(root,p))!==h)throw Error('FROZEN_RECIPE_OR_CHECKER_DRIFT');
for(const[f,h]of Object.entries(generation.unchangedAdmissionCheckers))if(await fileHash(path.join(base,'validation',f))!==h)throw Error('ADMISSION_CHECKER_DRIFT');
const canonical=path.join(base,'candidate/dataset.jsonl'),bytes=fs.readFileSync(canonical),datasetSha256=hash(bytes);
for(const h of [local.candidatePayloadSha256,sealed.candidateSha256,independent.candidateSha256,generated.sha256,generation.candidateOnlyPrecheckSha256])if(h!==datasetSha256)throw Error('CANDIDATE_BINDING_DRIFT');
const prior=read('protected-before.json');for(const[p,h]of Object.entries(prior))if(await fileHash(path.join(root,p))!==h)throw Error('PRIOR_PROTECTED_FILE_DRIFT');
const rows=bytes.toString('utf8').trim().split('\n').map(JSON.parse);if(rows.length!==8000)throw Error('COUNT_DRIFT');
const gates={schema:local.strictSchemaValid===8000,semantics:local.sharedSemanticValid===8000,privacy:local.privacy.status==='PASS',duplicates:Object.values(local.duplicates).every(n=>n===0),familySplit:local.familyLeakage===0&&local.constructionLeakage===0,crossSplit:local.crossSplit.every(r=>r.flaggedCandidateRows===0),coverage:local.status==='PASS',frozen404:sealed.reports.frozen404.flaggedCandidateRows===0,excludedDatasets:['historical10K','runtimeAllVersions','selectionAllVersions'].every(k=>sealed.reports[k].flaggedCandidateRows===0),v1Independence:independent.status==='PASS'};
const pass=Object.values(gates).every(Boolean)&&sealed.status==='PASS';
let artifactHashes={},projection=null;
if(pass){
 const ex=await exporter(),output=[];let maxPromptBytes=0,maxCompletionBytes=0;
 for(const row of rows){const wire=ex.format(row),line=JSON.stringify(wire)+'\n';output.push({row,line});maxPromptBytes=Math.max(maxPromptBytes,Buffer.byteLength(JSON.stringify(wire.prompt)));maxCompletionBytes=Math.max(maxCompletionBytes,Buffer.byteLength(wire.completion[0].content));}
 if(Object.values(ex.privacy.flags).some(Boolean))throw Error('MODEL_EXPORT_PRIVACY_FAILED');
 const admitted=path.join(base,'admitted');fs.mkdirSync(admitted);fs.writeFileSync(path.join(admitted,'dataset.jsonl'),bytes,{flag:'wx'});
 const counts={train:0,dev:0,internalTest:0},index=[];
 for(const split of Object.keys(counts)){const selected=output.filter(x=>x.row.split===split);counts[split]=selected.length;fs.writeFileSync(path.join(admitted,split==='internalTest'?'internal-test.jsonl':split+'.jsonl'),selected.map(x=>x.line).join(''),{flag:'wx'});selected.forEach(({row,line},i)=>index.push({recordId:row.recordId,familyId:row.lineage.familyId,split,splitLine:i+1,canonicalRecordSha256:hash(JSON.stringify(row)),modelExampleSha256:hash(line)}));}
 if(counts.train!==6400||counts.dev!==800||counts.internalTest!==800)throw Error('EXPORT_QUOTA_FAILED');
 fs.writeFileSync(path.join(admitted,'split-index.jsonl'),index.map(x=>JSON.stringify(x)).join('\n')+'\n',{flag:'wx'});
 projection={status:'PASS',createdAt:new Date().toISOString(),...ex.identity,rows:counts,promptPrivacy:ex.privacy,maxPromptBytes,maxCompletionBytes,tokenization:'NOT EXECUTED; pinned tokenizer/loss-mask qualification is a separate pre-training gate; no truncation',trainingStarted:false};
 write('validation/prompt-export-results.json',projection);
 for(const f of fs.readdirSync(admitted).sort())artifactHashes['admitted/'+f]=await fileHash(path.join(admitted,f));
}
const frozenAt=new Date().toISOString(),status=pass?'ADMITTED_FOR_CONTROLLED_EXPERIMENT_DATA_ONLY':'QUARANTINED_NOT_ADMITTED';
const manifest={version:'HR-QLORA-PLACEHOLDER-DATASET-2',release:'dataset-v2',status,frozenAt,baseModel:generation.baseModel,revision:generation.revision,provenanceLimitationAccepted:true,exactGgufConversionLinkVerified:false,datasetSha256,canonicalDataset:pass?'admitted/dataset.jsonl':'candidate/dataset.jsonl',candidateRows:8000,admittedRows:pass?8000:0,families:2000,splits:local.totals.splits,languages:local.totals.languages,intents:Object.keys(local.totals.intents).length,actionBoundaryCategories:Object.keys(local.totals.actions).length,actionScope:'All 48 categories are question-stage doAction boundaries, not second-stage action extraction targets',format:'Natural HR question and trusted synthetic context -> existing {plan: CopilotPlan}; one-to-one conversational prompt-completion projections if admitted',gates,artifactHashes,contaminationReports:sealed.reports,v1Independence:independent.reports,excludedSources:sealed.sources,generationSources:generation.inputs,validatorHashes:generation.validatorHashesBeforeProtectedChecks,
 frozen404Sha256:'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05',protectedTextOrSelectorsUsedForAuthoring:false,protectedInputsAvailableToGenerator:false,noAdaptiveRewriteAfterProtectedResults:true,previousReleaseUsedForGeneration:false,previousReleaseUnchanged:true,referenceRowsUsedAsGold:false,runtimeReferencesInPromptOnly:projection?.runtimeReferenceSha256??null,
 realPiiFound:false,placeholderOnly:true,humanReviewPerformed:false,limitations:['Template-composed multilingual examples lack independent human linguistic validation','Placeholder-only identities do not establish natural-name extraction capability','Static privacy/lexical gates are not complete PII/semantic independence certification','Exact BEFORE GGUF conversion provenance remains owner-accepted and unverified','Tokenizer/loss masks, training runtime and training execution are separate stages'],beforeEvidenceUnchanged:true,productionBehaviorChanged:false,frozen404Executed:0,modelCalls:0,trainingStarted:false};
write('dataset-manifest.json',manifest);
write('admission-decision.json',{decision:status,frozenAt,datasetSha256,manifestSha256:await fileHash(path.join(base,'dataset-manifest.json')),allDataAdmissionGatesPass:pass,gates,admittedRows:pass?8000:0,sourceOrThresholdChangedAfterProtectedFeedback:false,noMatchTextOrIdsDisclosed:true,humanReviewPerformed:false,trainingStarted:false,trainingAutomaticallyLaunched:false,nextStep:pass?'Prepare pinned-tokenizer/loss-mask and isolated QLoRA runtime checks under a separate instruction; no training has started':'Do not train; preserve quarantine without rewriting against protected feedback'});
// Verify prior bytes again after writing projections/evidence; includes v1.
for(const[p,h]of Object.entries(prior))if(await fileHash(path.join(root,p))!==h)throw Error('PROTECTED_FILE_DRIFT_AFTER_FINALIZATION');
write('integrity-verification.json',{verifiedAt:new Date().toISOString(),priorProtectedFiles:Object.keys(prior).length,protectedMismatches:[],priorDatasetV1Unchanged:true,sourceAndBeforeEvidenceUnchanged:true,frozen404Sha256:await fileHash(path.join(root,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl')),frozen404CasesExecuted:0,recipeAndCheckersUnchangedSinceFreeze:true,admissionFailClosed:pass?'Not applicable: all data gates passed':!fs.existsSync(path.join(base,'admitted')),admittedRows:pass?8000:0,canonicalDatasetSha256:datasetSha256,modelCalls:0,trainingStarted:false});
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]),files=walk(base).filter(p=>path.basename(p)!=='evidence-hashes.sha256').sort(),lines=[];
for(const p of files)lines.push(path.relative(root,p).split(path.sep).join('/')+'\t'+await fileHash(p));
fs.writeFileSync(path.join(base,'evidence-hashes.sha256'),lines.join('\n')+'\n',{flag:'wx'});
for(const p of [...files,path.join(base,'evidence-hashes.sha256')])fs.chmodSync(p,0o444);
console.log(JSON.stringify({dataset:status,total:8000,splits:local.totals.splits,languages:local.totals.languages,intents:manifest.intents,actionBoundaryCategories:manifest.actionBoundaryCategories,gates,datasetSha256,protectedFilesUnchanged:Object.keys(prior).length,evidenceManifestSha256:await fileHash(path.join(base,'evidence-hashes.sha256')),trainingStarted:false},null,2));
