// Evaluation-only gate and typed projection. This module is never imported by the application.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {contracts,hash} from '../../validation/contracts.mjs'
const BASE=path.dirname(path.dirname(fileURLToPath(import.meta.url))),ROOT=path.resolve(BASE,'../../../..'),brands=new WeakSet()
export class ControlledInputError extends Error{constructor(code){super(code);this.code=code}}
export function rejectLegacyReference(value){let s=String(value);for(let i=0;i<3;i++){try{s=decodeURIComponent(s)}catch{break}}s=s.toLowerCase().replaceAll('\\','/');if(/hr_agent_intents_10000|(?:^|\/)copilot\/training\.ts|(?:^|\/)copilot\/training\.js/.test(s))throw new ControlledInputError('LEGACY_REFERENCE_DENIED')}
export const isControlledProjection=p=>brands.has(p)
const normalize=t=>t.toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function assertAdmission(gate,lock){
 if(gate?.status!=='ADMITTED'||gate?.independentHumanReview!=='PASS')throw new ControlledInputError('HUMAN_REVIEW_REQUIRED')
 if(gate.assetSha256!==lock.runtimeSha256||gate.purpose!=='runtime-reference-only'||!gate.approvalId||!gate.reviewEvidenceSha256||!gate.reviewers?.length||gate.reviewers.some(r=>!r.accountableId||r.independentOfCreator!==true||r.human!==true)||!gate.all480TextsReviewed||gate.unresolvedFindings!==0)throw new ControlledInputError('INVALID_ADMISSION_EVIDENCE')
 for(const l of ['en','ar-MSA','ar-JO','mixed'])if(!gate.languagesReviewed?.includes(l))throw new ControlledInputError('LANGUAGE_REVIEW_MISSING')
}
async function project(rows,identity){
 const K=await contracts(),entries=[]
 for(const row of rows){rejectLegacyReference(JSON.stringify(row));if(row.synthetic!==true||row.purpose!=='runtime-reference-only')throw new ControlledInputError('WRONG_ASSET_PURPOSE');const q=K.validatePlan(row.wireProjection.questionPlan,'training');if(!q.ok)throw new ControlledInputError('INVALID_CONTROLLED_PLAN');const a=row.wireProjection.actionPlan;if(a&&!K.shared.copilotActionPlanSchema.safeParse(a).success)throw new ControlledInputError('INVALID_CONTROLLED_ACTION');entries.push({text:row.wireProjection.inputText,normalized:normalize(row.wireProjection.inputText),question:q.plan,action:a,recordId:row.recordId})}
 const permitted=(e,role)=>e.question.intent==='outOfScope'||(K.catalog.allowedIntents[role]?.includes(e.question.intent)&&(!e.action||K.catalog.allowedActions[role]?.includes(e.action.action)))
 const exact=(text,role)=>entries.find(e=>e.normalized===normalize(text)&&permitted(e,role))
 const nearest=(text,role,limit)=>{const tokens=new Set(normalize(text).split(' '));return entries.filter(e=>permitted(e,role)).map(e=>({e,score:e.normalized.split(' ').filter(t=>tokens.has(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.e.recordId.localeCompare(b.e.recordId)).slice(0,limit).map(x=>x.e)}
 const value=Object.freeze({identity:Object.freeze(identity),entryCount:entries.length,
  localTrainingPlan:(text,role,onSource)=>{const e=exact(text,role);if(e)onSource?.('training');return e?structuredClone(e.question):null},
  localTrainingAction:(text,role)=>{const e=exact(text,role);return e?.action?structuredClone(e.action):null},
  questionTrainingExamples:(text,role,limit=10)=>nearest(text,role,limit).map(e=>({text:e.text,intent:e.question.intent,reportType:e.question.reportType,refusal:e.question.refusalReason})),
  actionTrainingExamples:(text,role,limit=8)=>nearest(text,role,entries.length).filter(e=>e.action).slice(0,limit).map(e=>({text:e.text,action:e.action.action})),
  coverage:()=>({intents:[...new Set(entries.map(e=>e.question.intent))].sort(),actions:[...new Set(entries.map(e=>e.action?.action).filter(Boolean))].sort()})})
 brands.add(value);return value
}
export async function loadAdmittedRuntime(){
 const lock=JSON.parse(fs.readFileSync(path.join(BASE,'evaluation/target-lock.json'),'utf8')),gateBytes=fs.readFileSync(path.join(BASE,'admission/admission-gate.json'))
 if(hash(gateBytes)!==lock.admissionGateSha256)throw new ControlledInputError('ADMISSION_GATE_HASH_DRIFT')
 const gate=JSON.parse(gateBytes);assertAdmission(gate,lock)
 // Current release stops above. Future approved target must pin the independent review file too.
 const reviewPath=path.join(BASE,'review/approved-independent-review.json'),reviewBytes=fs.readFileSync(reviewPath)
 if(hash(reviewBytes)!==gate.reviewEvidenceSha256)throw new ControlledInputError('REVIEW_EVIDENCE_DRIFT')
 const review=JSON.parse(reviewBytes);if(review.status!=='PASS'||review.assetSha256!==lock.runtimeSha256||review.pendingRows!==0||review.unresolvedFindings!==0||review.completedRows!==320)throw new ControlledInputError('REVIEW_INCOMPLETE')
 const file=path.join(BASE,'runtime-reference-v1.1.jsonl');if(fs.realpathSync(file)!==file)throw new ControlledInputError('ASSET_REDIRECT_DENIED')
 const bytes=fs.readFileSync(file);if(hash(bytes)!==lock.runtimeSha256)throw new ControlledInputError('ASSET_HASH_DRIFT')
 const rows=bytes.toString('utf8').trim().split('\n').map(JSON.parse);if(rows.length!==320)throw new ControlledInputError('ASSET_COUNT_DRIFT')
 const result=await project(rows,{profile:'controlled-admitted-runtime-only',assetSha256:hash(bytes),approvalId:gate.approvalId});if(result.coverage().intents.length!==32||result.coverage().actions.length!==48)throw new ControlledInputError('PROJECTION_COVERAGE_LOSS');return result
}
export async function selfTestProjection(){
 // Five fixed in-memory canaries, never candidate/review data and never a benchmark.
 const K=await contracts(),q=(intent,extra={})=>({...Object.fromEntries(K.catalog.questionFields.map(k=>[k,null])),intent,...extra}),a=(action,extra={})=>({...Object.fromEntries(K.catalog.actionFields.map(k=>[k,null])),action,...extra})
 const fixtures=[['CEB_CANARY_SELF_ATTENDANCE',q('myAttendance',{period:'thisMonth'}),null],['CEB_CANARY_COMPANY_COUNT',q('headcount'),null],['CEB_CANARY_PERSON_PAYROLL',q('employeeFile',{personName:'<EMPLOYEE_NAME_99901>',reportType:'payroll',period:'lastMonth'}),null],['CEB_CANARY_ACTION',q('doAction'),a('setSalary',{personName:'<EMPLOYEE_NAME_99901>',amount:'742.50'})],['CEB_CANARY_REFUSAL',q('outOfScope',{refusalReason:'notHrData'}),null]]
 const rows=fixtures.map(([text,questionPlan,actionPlan],i)=>({recordId:'CEB-SELFTEST-'+i,synthetic:true,purpose:'runtime-reference-only',wireProjection:{inputText:text,questionPlan,actionPlan}}))
 return project(rows,{profile:'self-test-canaries-only-not-admission',fixtureSha256:hash(JSON.stringify(rows)),candidateAssetsLoaded:false})
}
