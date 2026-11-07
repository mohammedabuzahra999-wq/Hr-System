// Preserve a failed release without promoting it or producing training exports.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),root=path.resolve(base,'../../../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
async function fileHash(p){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(p))h.update(b);return h.digest('hex');}
const write=(p,j)=>fs.writeFileSync(path.join(base,p),JSON.stringify(j,null,2)+'\n',{flag:'wx'});
const local=read('validation/local-results.json'),sealed=read('validation/sealed-exclusion-results.json'),generation=read('generation/pre-generation-manifest.json');
if(local.status!=='PASS'||sealed.status!=='FAIL')throw Error('NOT_A_REJECTED_RELEASE');
const canonical=path.join(base,'candidate/dataset.jsonl'),datasetSha256=await fileHash(canonical);
if(datasetSha256!==sealed.candidateSha256||datasetSha256!==local.candidatePayloadSha256)throw Error('CANDIDATE_DRIFT');
for(const[p,h]of Object.entries({...generation.inputs,...generation.validatorHashesBeforeProtectedChecks}))if(await fileHash(path.join(root,p))!==h)throw Error('RECIPE_OR_CHECKER_CHANGED_AFTER_PROTECTED_RESULTS');
const test=spawnSync(process.execPath,['--experimental-vm-modules',path.join(base,'generation/admit.mjs')],{cwd:root,encoding:'utf8',timeout:30000,windowsHide:true});
const failClosed=test.status!==0&&String(test.stderr).includes('ADMISSION_GATES_NOT_PASS')&&!fs.existsSync(path.join(base,'admitted'));
if(!failClosed)throw Error('ADMISSION_DID_NOT_FAIL_CLOSED');
const protectedFiles=read('protected-before.json'),mismatches=[];
for(const[p,h]of Object.entries(protectedFiles))if(await fileHash(path.join(root,p))!==h)mismatches.push(p);
if(mismatches.length)throw Error('PROTECTED_FILE_DRIFT');
const frozen404Sha256=await fileHash(path.join(root,'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'));
const reports=sealed.reports;
const manifest={version:'HR-QLORA-PLACEHOLDER-CANDIDATE-1',frozenAt:new Date().toISOString(),status:'REJECTED_CONTAMINATION_NOT_ADMITTED',baseModel:generation.baseModel,revision:generation.revision,provenanceLimitationAccepted:true,datasetSha256,canonicalCandidate:'candidate/dataset.jsonl',rows:8000,families:2000,splits:local.totals.splits,languages:local.totals.languages,intents:Object.keys(local.totals.intents).length,actionBoundaryCategories:Object.keys(local.totals.actions).length,actionScope:'question-stage doAction only; no action-plan extraction training',
 checks:{schema:'PASS',sharedSemantics:'PASS',piiSecrets:local.privacy.status,duplicates:local.duplicates,familySplitLeakage:local.familyLeakage===0&&local.constructionLeakage===0?'PASS':'FAIL',frozen404Contamination:reports.frozen404.flaggedCandidateRows===0?'PASS':'FAIL',excludedDatasetContamination:reports.historical10K.flaggedCandidateRows===0&&reports.runtimeAllVersions.flaggedCandidateRows===0&&reports.selectionAllVersions.flaggedCandidateRows===0?'PASS':'FAIL'},
 contaminationCounts:reports,excludedSources:sealed.sources,generationSources:generation.inputs,validatorHashesBeforeProtectedChecks:generation.validatorHashesBeforeProtectedChecks,
 placeholderOnly:true,realPiiFound:false,humanReviewPerformed:false,limitations:['Template-composed synthetic language is not independently human-validated','Placeholder-only identities do not establish extraction capability for natural names','Static lexical screening is not complete semantic contamination certification','Two F404 near-match rows and one runtime near-match row may overlap; no distinct-union claim is made','Accepted exact GGUF conversion provenance limitation remains'],
 trainingExportsCreated:0,admittedRows:0,frozen404Executed:0,modelCalls:0,trainingStarted:false};
write('dataset-manifest.json',manifest);
write('admission-decision.json',{decision:'REJECTED_CONTAMINATION',frozenAt:manifest.frozenAt,datasetSha256,manifestSha256:await fileHash(path.join(base,'dataset-manifest.json')),reason:'Fixed exclusion gate found strong near matches: F404=2 candidate rows; runtime references=1 candidate row. No exact/normalized/entity-masked matches.',admittedRows:0,admissionFailsClosed:failClosed,sourceOrThresholdChangedAfterProtectedResults:false,noProtectedMatchIdsDisclosed:true,trainingAuthorizedOrStarted:false,nextStep:'A separately declared independently authored successor release under owner-approved remediation protocol; do not train or revise this release against held-out feedback.'});
write('integrity-verification.json',{verifiedAt:new Date().toISOString(),priorProtectedFiles:Object.keys(protectedFiles).length,protectedMismatches:mismatches,sourceAndBeforeEvidenceUnchanged:true,frozen404Sha256,frozen404CasesExecuted:0,recipeAndCheckersUnchangedSinceFreeze:true,failClosedAdmissionTest:{pass:failClosed,exitCode:test.status,code:'ADMISSION_GATES_NOT_PASS',admittedDirectoryCreated:false},canonicalCandidateSha256:datasetSha256,trainingExportsCreated:0,admittedRows:0,productionDataAccess:false,modelCalls:0,trainingStarted:false});
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]),files=walk(base).filter(p=>path.basename(p)!=='evidence-hashes.sha256').sort(),lines=[];
for(const p of files)lines.push(path.relative(root,p).split(path.sep).join('/')+'\t'+await fileHash(p));
fs.writeFileSync(path.join(base,'evidence-hashes.sha256'),lines.join('\n')+'\n',{flag:'wx'});
for(const p of [canonical,path.join(base,'candidate/generation-result.json'),path.join(base,'dataset-manifest.json'),path.join(base,'admission-decision.json'),path.join(base,'evidence-hashes.sha256')])fs.chmodSync(p,0o444);
console.log(JSON.stringify({dataset:'FAILED_ADMISSION_CANDIDATE_PRESERVED',candidateRows:8000,datasetSha256,protectedFilesUnchanged:Object.keys(protectedFiles).length,failClosedAdmissionTest:'PASS',admittedRows:0,evidenceFilesHashed:files.length,evidenceManifestSha256:await fileHash(path.join(base,'evidence-hashes.sha256')),trainingStarted:false},null,2));
