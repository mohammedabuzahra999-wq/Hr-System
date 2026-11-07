// Fixed local entry point. No environment-file loading, CLI data paths or provider options.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../../../..')
if(process.argv.length!==2||Number(process.versions.node.split('.')[0])<24)throw Error('USE_NODE_24_OR_NEWER_WITHOUT_EXTRA_ARGUMENTS')
const manifest=path.join(HERE,'evidence/tool-file-hashes.sha256')
for(const line of fs.readFileSync(manifest,'utf8').trim().split('\n')){const[p,h]=line.split('\t'),file=path.resolve(ROOT,p);if(!file.startsWith(HERE+path.sep)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==h)throw Error('REVIEW_TOOL_INTEGRITY_FAILURE')}
const env={NODE_ENV:'test',TZ:'Asia/Riyadh'};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key]
const read=['criteria.mjs','repository.mjs','store.mjs','network-guard.mjs','server.mjs','public','storage'].map(p=>path.join(HERE,p))
read.push(path.resolve(HERE,'../runtime-reference-v1.1.jsonl'),path.resolve(HERE,'../model-selection-v1.1.jsonl'),path.resolve(HERE,'../review/review-register.json'))
const args=['--permission',...read.map(p=>'--allow-fs-read='+p),'--allow-fs-write='+path.join(HERE,'storage'),'--import',pathToFileURL(path.join(HERE,'network-guard.mjs')).href,path.join(HERE,'server.mjs')]
const r=spawnSync(process.execPath,args,{cwd:ROOT,env,stdio:'inherit',windowsHide:true});if(r.error){console.error('RESTRICTED_REVIEW_SERVER_FAILED');process.exitCode=1}else process.exitCode=r.status??1
