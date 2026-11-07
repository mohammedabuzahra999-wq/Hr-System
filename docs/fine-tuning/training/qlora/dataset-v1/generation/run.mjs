import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),prep=path.resolve(base,'..'),root=path.resolve(prep,'../../../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fileHash(p){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(p))h.update(b);return h.digest('hex');}
const prepManifest=path.join(prep,'evidence-hashes.sha256');
if(await fileHash(prepManifest)!=='898af9e66d0744ad3e02a09958146b7ddb57706acba164ede4e5521a820a4814')throw Error('PREPARATION_EVIDENCE_DRIFT');
const protectedFiles=JSON.parse(fs.readFileSync(path.join(prep,'protected-before.json'),'utf8'));
for(const line of fs.readFileSync(prepManifest,'utf8').trim().split(/\r?\n/)){const[p,h]=line.split('\t');protectedFiles[p]=h;}
protectedFiles[path.relative(root,prepManifest).split(path.sep).join('/')]=await fileHash(prepManifest);
for(const[p,h]of Object.entries(protectedFiles))if(await fileHash(path.join(root,p))!==h)throw Error('PROTECTED_FILE_DRIFT');
fs.writeFileSync(path.join(base,'protected-before.json'),JSON.stringify(protectedFiles,null,2)+'\n',{flag:'wx'});
const checks=JSON.parse(fs.readFileSync(path.join(base,'validation/candidate-only-precheck-2.json'),'utf8'));
if(checks.status!=='PASS')throw Error('CANDIDATE_ONLY_PRECHECK_FAILED');
const sources=fs.readdirSync(dir).filter(f=>f.endsWith('.mjs')).map(f=>path.join(dir,f));
const inputs={};for(const p of [...sources,path.join(prep,'current-contract-catalog.json')])inputs[path.relative(root,p).split(path.sep).join('/')]=await fileHash(p);
const validators={};for(const f of fs.readdirSync(path.join(base,'validation')).filter(f=>f.endsWith('.mjs'))){const p=path.join(base,'validation',f);validators[path.relative(root,p).split(path.sep).join('/')]=await fileHash(p);}
const manifest={version:'HR-QLORA-GENERATION-1',frozenAt:new Date().toISOString(),authority:'Current owner approval for exactly 8000 placeholder-only synthetic examples',baseModel:'Qwen/Qwen3-4B-Thinking-2507',revision:'768f209d9ea81521153ed38c47d515654e938aea',provenanceLimitationAccepted:true,seed:42,inputs,validatorHashesBeforeProtectedChecks:validators,
 construction:'2000 semantic construction families, four language renditions each; split-specific syntax and placeholder pools',placeholderOnlyOwnerOverride:true,naturalNameExtractionNotTested:true,
 generationDenied:['frozen F404 and derivatives','historical 10K and compiled copies','runtime and selection asset rows','production credentials, database, logs, RAG/MCP and voice'],protectedDatasetsPermittedForSealedExclusionOnly:true,modelCalls:0,trainingStarted:false};
fs.writeFileSync(path.join(dir,'pre-generation-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
fs.mkdirSync(path.join(base,'candidate'));
const result=spawnSync(process.execPath,['--permission','--allow-fs-read='+dir,'--allow-fs-read='+path.join(prep,'current-contract-catalog.json'),'--allow-fs-write='+path.join(base,'candidate'),path.join(dir,'generate.mjs'),'--write'],{cwd:root,env:{SystemRoot:process.env.SystemRoot,PATH:path.dirname(process.execPath)},encoding:'utf8',timeout:120000,windowsHide:true});
if(result.stdout)process.stdout.write(result.stdout);if(result.status!==0){console.error('GENERATION_CHILD_FAILED',result.stderr?.slice(0,800));process.exitCode=1;}
