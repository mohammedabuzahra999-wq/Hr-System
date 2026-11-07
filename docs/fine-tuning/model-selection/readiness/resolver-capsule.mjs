// CEB-1D0 capture-only resolver boundary; no provider transport or service execution.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import * as zod from 'zod'
import {contracts,hash} from '../../controlled-assets/validation/contracts.mjs'
import {isControlledProjection,rejectLegacyReference,ControlledInputError} from '../../controlled-assets/remediation-v1.1/admission/automated-policy-v1/evaluation/controlled-loader.mjs'
const BASE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(BASE,'../../../..')
export async function createResolverCapsule(projection){
 if(!isControlledProjection(projection))throw new ControlledInputError('UNADMITTED_PROJECTION_DENIED')
 const K=await contracts(),lock=JSON.parse(fs.readFileSync(path.join(BASE,'source-lock.json'),'utf8')),trace={loadedSourceHashes:{},capturedRequests:[],dependencyOverrides:['training','phrasebook-empty-plan','conversation-examples-excluded','guide-examples-excluded','provider-capture-only','synthetic-env'],violations:[],modelCalls:0,hrExecutions:0,legacyBytesRead:0,candidateAssetsLoaded:projection.identity.candidateAssetsLoaded??true,admittedRuntimeLoaded:projection.identity.admitted===true},cache=new Map()
 let failed=false
 const deny=code=>{failed=true;trace.violations.push(code);throw new ControlledInputError(code)},healthy=()=>{if(failed)throw new ControlledInputError('STICKY_ISOLATION_FAILURE')}
 for(const[p,h]of Object.entries(K.catalog.sourceHashes))if(lock.sourceHashes[p]!==h)deny('CONTRACT_SOURCE_HASH_DRIFT')
 class ReferenceDate extends Date{constructor(...args){if(args.length)super(...args);else super('2027-06-15T09:00:00.000Z')}static now(){return Date.parse('2027-06-15T09:00:00.000Z')}}
 const context=vm.createContext({console:Object.freeze({log(){},warn(){},error(){}}),Date:ReferenceDate,structuredClone,fetch:()=>deny('NETWORK_DENIED')},{codeGeneration:{strings:false,wasm:false}})
 function synthetic(name,exports){const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context,identifier:name});cache.set(name,m);return m}
 class DisabledOpenAI{constructor(){deny('CLOUD_CLIENT_DENIED')}static AuthenticationError=class extends Error{};static RateLimitError=class extends Error{}}
 class StructuredGenerationError extends Error{constructor(code){super(code);this.code=code}}
 const empty=Object.fromEntries(K.catalog.questionFields.map(k=>[k,null]))
 const stubs={
  zod, '@hr/shared':K.shared, openai:{default:DisabledOpenAI},'openai/helpers/zod':{zodTextFormat:()=>deny('MODEL_HELPER_DENIED')},
  'server/src/env.ts':{env:Object.freeze({NODE_ENV:'test',OPENAI_API_KEY:undefined}),isProduction:false},
  'server/src/ai/structuredProvider.ts':{questionGenerationProvider:()=>({generateStructured:async(request)=>{trace.capturedRequests.push({messages:structuredClone(request.messages),schema:zod.z.toJSONSchema(request.schema,{io:'input'}),schemaName:request.schemaName,temperature:request.temperature});throw new StructuredGenerationError('CAPTURE_ONLY_NO_TRANSPORT')}})},'server/src/ai/structured.ts':{StructuredGenerationError},
  'server/src/copilot/phrasebook.ts':{EMPTY_PLAN:Object.freeze(empty)},
  'server/src/copilot/conversationTraining.ts':{conversationQuestionPrompt:()=>'',continuationConversationPrompt:()=>'',localConversationFollowUp:()=>null},
  'server/src/guide/helpRouting.ts':{maintainedHelpDecision:()=>({kind:'unmatched'})},'server/src/guide/pages.ts':{pageFor:()=>null},
 }
 async function trainingStub(){const reads=await ns('server/src/copilot/readRules.ts');return synthetic('server/src/copilot/training.ts',{
  ...Object.fromEntries(['localTrainingPlan','localTrainingAction','questionTrainingExamples','actionTrainingExamples'].map(k=>[k,projection[k]])),
  deterministicReadPlan:(text,role,onRule)=>{const r=reads.deterministicReadDecision(text);if(r.kind!=='resolved')return null;onRule?.(r.routingRule);if(K.catalog.allowedIntents[role]?.includes(r.plan.intent))return r.plan;return{...empty,intent:'outOfScope',refusalReason:'notPermitted'}}})}
 function canonical(spec,parent){if(spec==='@hr/shared')return spec;if(!spec.startsWith('.'))return spec;const p=path.posix.normalize(path.posix.join(path.posix.dirname(parent),spec)).replace(/\.js$/,'.ts');if(p.startsWith('../'))return deny('MODULE_ESCAPE_DENIED');return p}
 function load(name){
  if(cache.has(name))return cache.get(name)
  if(stubs[name])return synthetic(name,stubs[name])
  try{rejectLegacyReference(name)}catch{return deny('LEGACY_REFERENCE_DENIED')}
  if(!Object.hasOwn(lock.sourceHashes,name))return deny('MODULE_IMPORT_DENIED')
  const file=path.join(ROOT,name),bytes=fs.readFileSync(file);if(hash(bytes)!==lock.sourceHashes[name])return deny('SOURCE_HASH_DRIFT')
  trace.loadedSourceHashes[name]=hash(bytes)
  const code=ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText
  const m=new vm.SourceTextModule(code,{context,identifier:name,importModuleDynamically:()=>deny('DYNAMIC_IMPORT_DENIED')});cache.set(name,m);return m
 }
 async function ns(name){const m=load(name);if(m.status==='unlinked')await m.link((spec,parent)=>load(canonical(spec,parent.identifier)));if(m.status==='linked')await m.evaluate({timeout:10000});return m.namespace}
 // Install pure shared contracts and the explicit controlled replacement BEFORE resolving imports.
 synthetic('server/src/copilot/validatePlan.ts',{validateCopilotPlan:K.validatePlan})
 await trainingStub()
 const resolver=await ns('server/src/copilot/resolve.ts'),routing=await ns('server/src/copilot/routingOutcome.ts')
 return{trace,assertHealthy:healthy,preflight:(text,role,context)=>{healthy();const r=routing.deterministicRoutingOutcome(text,role,context);healthy();return r},probeModule:name=>load(name),probeReference:value=>{try{rejectLegacyReference(value)}catch{return deny('LEGACY_REFERENCE_DENIED')}},
  resolveQuestion:async(text,role)=>{healthy();try{rejectLegacyReference(text)}catch{return deny('LEGACY_REFERENCE_DENIED')}const result=await resolver.resolveQuestion(text,role);healthy();return result}}
}
