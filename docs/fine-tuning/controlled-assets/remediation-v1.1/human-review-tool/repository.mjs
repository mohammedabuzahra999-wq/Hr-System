import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
export const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../../../..')
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export class ToolError extends Error{constructor(code,status=422){super(code);this.code=code;this.status=status}}
export const DEFINITIONS=Object.freeze([
 {key:'runtime',label:'Runtime',file:'runtime-reference-v1.1.jsonl',count:320,sha256:'f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736'},
 {key:'selection',label:'Model Selection',file:'model-selection-v1.1.jsonl',count:160,sha256:'09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986'},
])
export const SOURCE_REGISTER=path.resolve(HERE,'../review/review-register.json')
export const SOURCE_REGISTER_HASH='6248a1a611832eaf249039898eeda78a4a9131915d568293dad26557e0ec7999'
export function makeRepository(definitions,sourceRegisterHash='TEST_FIXTURE_ONLY'){
 const records=[],map=new Map()
 function assertIntegrity(){for(const d of definitions){if(fs.realpathSync(d.path)!==path.resolve(d.path)||hash(fs.readFileSync(d.path))!==d.sha256)throw new ToolError('ASSET_INTEGRITY_FAILURE',503)}}
 assertIntegrity()
 for(const d of definitions){const raw=fs.readFileSync(d.path,'utf8');if(!raw.endsWith('\n')||raw.includes('\r'))throw new ToolError('UNEXPECTED_JSONL_ENCODING',503);const lines=raw.slice(0,-1).split('\n');if(lines.length!==d.count)throw new ToolError('ASSET_COUNT_MISMATCH',503)
  for(const line of lines){const row=JSON.parse(line);if(!row.recordId||map.has(row.recordId)||row.synthetic!==true)throw new ToolError('INVALID_RECORD_IDENTITY',503);const item=Object.freeze({id:row.recordId,asset:d.key,assetLabel:d.label,assetFile:d.file,assetSha256:d.sha256,recordHash:hash(Buffer.from(line,'utf8')),language:row.language,role:row.input.trustedRole,ordinal:records.length+1,row});records.push(item);map.set(item.id,item)}
 }
 const manifest=definitions.map(({key,label,file,count,sha256})=>({key,label,file,count,sha256}))
 return Object.freeze({records,manifest,sourceRegisterHash,assertIntegrity,get:id=>{const r=map.get(id);if(!r)throw new ToolError('RECORD_NOT_FOUND',404);return r}})
}
export function loadRealRepository(){
 if(hash(fs.readFileSync(SOURCE_REGISTER))!==SOURCE_REGISTER_HASH)throw new ToolError('PENDING_REGISTER_INTEGRITY_FAILURE',503)
 const repo=makeRepository(DEFINITIONS.map(d=>({...d,path:path.resolve(HERE,'..',d.file)})),SOURCE_REGISTER_HASH)
 const register=JSON.parse(fs.readFileSync(SOURCE_REGISTER,'utf8')),bindings=new Map(register.rows.map(r=>[r.recordId,r]))
 for(const r of repo.records){const p=bindings.get(r.id);if(!p||p.rowSha256!==r.recordHash||p.assetSha256!==r.assetSha256)throw new ToolError('PENDING_REGISTER_BINDING_MISMATCH',503)}
 return repo
}
