// Loads pure source contracts in a restricted VM. Never loads application startup.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import * as zod from 'zod'
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
export const BASE=path.join(ROOT,'docs/fine-tuning/controlled-assets')
export const hash=b=>createHash('sha256').update(b).digest('hex')
export const read=p=>fs.readFileSync(path.join(ROOT,p))
export async function contracts(){
 const context=vm.createContext({},{codeGeneration:{strings:false,wasm:false}}),cache=new Map(),used={}
 const zz=new vm.SyntheticModule(Object.keys(zod),function(){for(const k of Object.keys(zod))this.setExport(k,zod[k])},{context});cache.set('zod',zz)
 async function load(name){
  if(cache.has(name))return cache.get(name)
  if(!(name.startsWith('shared/src/')&&name.endsWith('.ts'))&&!['server/src/copilot/validatePlan.ts','server/src/copilot/intents.ts','server/src/copilot/actions.ts','server/src/permissions.ts'].includes(name))throw new Error('CONTRACT_IMPORT_DENIED')
  const bytes=read(name);used[name]=hash(bytes)
  const code=ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText
  const mod=new vm.SourceTextModule(code,{context,identifier:name,importModuleDynamically(){throw new Error('DYNAMIC_IMPORT_DENIED')}});cache.set(name,mod)
  await mod.link(async(spec,ref)=>{if(spec==='zod')return zz;if(spec==='@hr/shared')return load('shared/src/index.ts');if(!spec.startsWith('.'))throw new Error('CONTRACT_IMPORT_DENIED');return load(path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier),spec)).replace(/\.js$/,'.ts'))})
  return mod
 }
 async function ns(p){const m=await load(p);if(m.status==='linked')await m.evaluate({timeout:10000});return m.namespace}
 const shared=await ns('shared/src/index.ts'),validation=await ns('server/src/copilot/validatePlan.ts'),intents=await ns('server/src/copilot/intents.ts'),actions=await ns('server/src/copilot/actions.ts')
 const roles=['employee','manager','hr','admin']
 const catalog={version:'CEB-contracts-v1',sourceHashes:used,questionFields:Object.keys(shared.copilotPlanSchema.shape),actionFields:Object.keys(shared.copilotActionPlanSchema.shape),intents:shared.copilotIntentSchema.options,actions:shared.copilotActionSchema.options,periods:shared.copilotPeriodSchema.options,
  roles,allowedIntents:Object.fromEntries(roles.map(r=>[r,intents.intentsFor(r)])),allowedActions:Object.fromEntries(roles.map(r=>[r,actions.actionsFor(r)])),
  questionJSONSchema:zod.z.toJSONSchema(shared.copilotPlanSchema),actionJSONSchema:zod.z.toJSONSchema(shared.copilotActionPlanSchema)}
 return {catalog,shared,validatePlan:validation.validateCopilotPlan}
}
if(process.argv.includes('--export')){const {catalog}=await contracts();fs.writeFileSync(path.join(BASE,'generation/contracts-v1.json'),JSON.stringify(catalog,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'CURATED_CONTRACTS_EXPORTED',intents:catalog.intents.length,actions:catalog.actions.length,sourceFiles:Object.keys(catalog.sourceHashes).length}))}

