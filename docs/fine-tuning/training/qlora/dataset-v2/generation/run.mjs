// Freeze the independently authored recipe before any protected comparisons.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),prep=path.resolve(base,'..'),root=path.resolve(base,'../../../../..');
async function hashFile(p){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(p))h.update(b);return h.digest('hex');}
const read=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const protectedFiles=read('protected-before.json');for(const[p,h]of Object.entries(protectedFiles))if(await hashFile(path.join(root,p))!==h)throw Error('PROTECTED_FILE_DRIFT');
const continuity=read('checker-continuity.json');for(const[f,h]of Object.entries(continuity.unchangedCopiedCheckers))if(await hashFile(path.join(base,'validation',f))!==h)throw Error('ADMISSION_CHECKER_CHANGED');
const checks=read('validation/candidate-only-precheck-2.json'),prompt=read('validation/prompt-precheck.json');if(checks.status!=='PASS'||prompt.status!=='PASS')throw Error('PRECHECK_FAILED');
const inputs={},validators={};for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.mjs'))){const p=path.join(dir,f);inputs[path.relative(root,p).split(path.sep).join('/')]=await hashFile(p);}
const catalog=path.join(prep,'current-contract-catalog.json');inputs[path.relative(root,catalog).split(path.sep).join('/')]=await hashFile(catalog);
for(const f of fs.readdirSync(path.join(base,'validation')).filter(f=>f.endsWith('.mjs'))){const p=path.join(base,'validation',f);validators[path.relative(root,p).split(path.sep).join('/')]=await hashFile(p);}
const manifest={version:'HR-QLORA-GENERATION-2',release:'dataset-v2',frozenAt:new Date().toISOString(),authority:'Owner-approved independent replacement; approved HR contracts and fresh synthetic linguistic composition only',baseModel:'Qwen/Qwen3-4B-Thinking-2507',revision:'768f209d9ea81521153ed38c47d515654e938aea',provenanceLimitationAccepted:true,seed:1601,inputs,validatorHashesBeforeProtectedChecks:validators,unchangedAdmissionCheckers:continuity.unchangedCopiedCheckers,candidateOnlyPrecheckSha256:checks.candidatePayloadSha256,
 construction:'2000 semantic construction families, four language renditions each; split-specific syntax and placeholder pools',placeholderOnlyOwnerOverride:true,naturalNameExtractionNotTested:true,
 generationDenied:['frozen F404 and derivatives or matching selectors','historical 10K and compiled copies','runtime/selection rows as authoring inputs or targets','quarantined dataset-v1 data and lexicons','production credentials, database, logs, RAG/MCP and voice'],generatorReadableData:['current-contract-catalog.json'],protectedDatasetsPermittedForSealedExclusionOnly:true,noAdaptiveRewriteAfterProtectedCheck:true,modelCalls:0,trainingStarted:false};
fs.writeFileSync(path.join(dir,'pre-generation-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
fs.mkdirSync(path.join(base,'candidate'));
const child=spawnSync(process.execPath,['--permission','--allow-fs-read='+dir,'--allow-fs-read='+catalog,'--allow-fs-write='+path.join(base,'candidate'),path.join(dir,'generate.mjs'),'--write'],{cwd:root,env:{SystemRoot:process.env.SystemRoot,PATH:path.dirname(process.execPath)},encoding:'utf8',timeout:120000,windowsHide:true});
if(child.stdout)process.stdout.write(child.stdout);if(child.status!==0){console.error('GENERATION_CHILD_FAILED',child.stderr?.slice(0,700));process.exitCode=1;}
else if(await hashFile(path.join(base,'candidate/dataset.jsonl'))!==checks.candidatePayloadSha256)throw Error('PRECHECK_PAYLOAD_MISMATCH');
