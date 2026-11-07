import fs from 'node:fs'
import path from 'node:path'
import {CRITERIA,CHOICES,TOOL_VERSION} from './criteria.mjs'
import {hash,ToolError} from './repository.mjs'
// Stored values are JSON-only. Avoid structuredClone's lazy worker-thread dependency.
const clone=v=>JSON.parse(JSON.stringify(v)),text=(v,max=3000)=>{if(typeof v!=='string'||v.length>max)throw new ToolError('INVALID_TEXT');return v.trim()}
export function validateProfile(value){
 const p={pseudonym:text(value?.pseudonym,80),competence:text(value?.competence),independenceStatement:text(value?.independenceStatement),humanIndependent:value?.humanIndependent===true}
 if(p.pseudonym.length<2||p.competence.length<8||p.independenceStatement.length<12||!p.humanIndependent)throw new ToolError('REVIEWER_INFORMATION_REQUIRED')
 return p
}
export function validateDecisions(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!CRITERIA.some(c=>c.id===k)))throw new ToolError('INVALID_CRITERIA')
 const out={}
 for(const c of CRITERIA){const v=value[c.id];if(!v||!Object.hasOwn(v,'decision'))throw new ToolError('MISSING_CRITERION');const decision=v.decision===null?null:v.decision;if(decision!==null&&!CHOICES.includes(decision))throw new ToolError('INVALID_DECISION');const note=text(v.note??'');if((decision==='FAIL'||decision==='NOT_APPLICABLE')&&!note)throw new ToolError('RATIONALE_REQUIRED:'+c.id);out[c.id]={decision,note}}
 return out
}
export function reviewStatus(criteria){const values=Object.values(criteria);if(values.length!==CRITERIA.length||values.some(v=>v.decision===null))return'draft';return values.some(v=>v.decision==='FAIL')?'reviewed_fail':values.some(v=>v.decision==='NOT_APPLICABLE')?'reviewed_na':'reviewed_pass'}
export class ReviewStore{
 constructor(repo,directory){this.repo=repo;this.dir=path.resolve(directory);fs.mkdirSync(path.join(this.dir,'events'),{recursive:true});fs.mkdirSync(path.join(this.dir,'exports'),{recursive:true});if(fs.realpathSync(this.dir)!==this.dir)throw new ToolError('STORAGE_REDIRECT_DENIED',503);this.profile=null;this.reviews=new Map();this.revision=0;this.tipHash=null;this.replay()}
 replay(){
  const files=fs.readdirSync(path.join(this.dir,'events')).sort()
  for(const name of files){if(!/^\d{9}-[a-f0-9]{64}\.json$/.test(name))throw new ToolError('AUDIT_TRAIL_CORRUPT',503);let event;try{event=JSON.parse(fs.readFileSync(path.join(this.dir,'events',name),'utf8'))}catch{throw new ToolError('AUDIT_TRAIL_CORRUPT',503)}const{eventHash,...payload}=event
   if(hash(JSON.stringify(payload))!==eventHash||name!==`${String(this.revision+1).padStart(9,'0')}-${eventHash}.json`||payload.previousEventHash!==this.tipHash||payload.sequence!==this.revision+1||payload.assetManifestHash!==hash(JSON.stringify(this.repo.manifest)))throw new ToolError('AUDIT_TRAIL_CORRUPT',503)
   this.apply(payload);this.revision=payload.sequence;this.tipHash=eventHash
  }
 }
 apply(event){
  if(event.kind==='reviewerProfile'){this.profile=validateProfile(event.value);return}
  if(event.kind!=='recordReview'||!this.profile)throw new ToolError('AUDIT_TRAIL_CORRUPT',503)
  const r=this.repo.get(event.value.recordId),v=event.value
  if(v.recordHash!==r.recordHash||v.assetSha256!==r.assetSha256||v.asset!==r.asset||JSON.stringify(v.reviewer)!==JSON.stringify(this.profile))throw new ToolError('AUDIT_TRAIL_CORRUPT',503)
  const criteria=validateDecisions(v.criteria);if(reviewStatus(criteria)!==v.status||!Number.isFinite(Date.parse(v.timestamp)))throw new ToolError('AUDIT_TRAIL_CORRUPT',503)
  this.reviews.set(r.id,clone(v))
 }
 commit(kind,value,expectedRevision){
  if(expectedRevision!==this.revision)throw new ToolError('STALE_REVIEW_REFRESH_REQUIRED',409)
  this.repo.assertIntegrity()
  const payload={version:TOOL_VERSION,sequence:this.revision+1,previousEventHash:this.tipHash,timestamp:new Date().toISOString(),assetManifestHash:hash(JSON.stringify(this.repo.manifest)),kind,value},eventHash=hash(JSON.stringify(payload)),event={...payload,eventHash}
  const file=path.join(this.dir,'events',`${String(payload.sequence).padStart(9,'0')}-${eventHash}.json`)
  // Node permission mode denies fd-only fsync. Keep the narrow write allowlist;
  // synchronous exclusive writes close before acknowledgement. Replay rejects partial events.
  fs.writeFileSync(file,JSON.stringify(event,null,2)+'\n',{flag:'wx'})
  this.apply(payload);this.revision=payload.sequence;this.tipHash=eventHash
 }
 saveProfile(value,revision){const p=validateProfile(value);this.commit('reviewerProfile',p,revision);return this.state()}
 saveReview(id,value){
  if(!this.profile)throw new ToolError('REVIEWER_INFORMATION_REQUIRED')
  const r=this.repo.get(id);if(value.recordHash!==r.recordHash)throw new ToolError('RECORD_HASH_MISMATCH',409)
  const criteria=validateDecisions(value.criteria),review={recordId:id,asset:r.asset,assetFile:r.assetFile,assetSha256:r.assetSha256,recordHash:r.recordHash,reviewer:clone(this.profile),criteria,notes:text(value.notes??'',5000),timestamp:new Date().toISOString(),status:reviewStatus(criteria)}
  this.commit('recordReview',review,value.expectedRevision)
  const result=this.state();if(result.summary.total.reviewed===this.repo.records.length)result.export=this.exportEvidence()
  return result
 }
 summary(){
  const measure=rows=>{const out={total:rows.length,reviewed:0,passRows:0,rowsWithFail:0,rowsWithNA:0,unresolvedRows:0,notStarted:0,drafts:0,failuresByCriterion:Object.fromEntries(CRITERIA.map(c=>[c.id,0]))}
   for(const r of rows){const v=this.reviews.get(r.id),complete=v&&v.status.startsWith('reviewed_'),fail=v&&Object.values(v.criteria).some(c=>c.decision==='FAIL'),na=v&&Object.values(v.criteria).some(c=>c.decision==='NOT_APPLICABLE');out.reviewed+=+!!complete;out.passRows+=+(v?.status==='reviewed_pass');out.rowsWithFail+=+!!fail;out.rowsWithNA+=+!!na;out.unresolvedRows+=+(!complete||!!fail);out.notStarted+=+!v;out.drafts+=+(v?.status==='draft');if(v)for(const c of CRITERIA)out.failuresByCriterion[c.id]+=+(v.criteria[c.id].decision==='FAIL')}
   return out}
  return{runtime:measure(this.repo.records.filter(r=>r.asset==='runtime')),selection:measure(this.repo.records.filter(r=>r.asset==='selection')),total:measure(this.repo.records),admission:'NOT_DECIDED_SEPARATE_PHASE',modelExecutionCleared:false}
 }
 state(){return{revision:this.revision,profile:clone(this.profile),reviews:Object.fromEntries(this.reviews),summary:this.summary()}}
 exportEvidence(){
  this.repo.assertIntegrity();const summary=this.summary(),createdAt=new Date().toISOString(),evidence={version:TOOL_VERSION,kind:'HUMAN_REVIEW_SUCCESSOR_EVIDENCE',testOnly:this.repo.sourceRegisterHash==='TEST_FIXTURE_ONLY',createdAt,sourcePendingRegisterSha256:this.repo.sourceRegisterHash,assetManifest:this.repo.manifest,criteria:CRITERIA,reviewer:clone(this.profile),journal:{revision:this.revision,tipHash:this.tipHash},humanDecisionCoverageComplete:summary.total.reviewed===this.repo.records.length,admission:'NOT_DECIDED_SEPARATE_PHASE',modelExecutionCleared:false,summary,records:this.repo.records.map(r=>({recordId:r.id,asset:r.asset,assetSha256:r.assetSha256,recordHash:r.recordHash,review:this.reviews.get(r.id)??null}))}
  const bytes=JSON.stringify(evidence,null,2)+'\n',digest=hash(bytes),stem=`review-r${String(this.revision).padStart(9,'0')}-${digest}`,evidenceName=stem+'.json',summaryName=stem+'-summary.json'
  const once=(name,value)=>{const file=path.join(this.dir,'exports',name);if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==value)throw new ToolError('EXPORT_COLLISION',503)}else fs.writeFileSync(file,value,{flag:'wx'})}
  once(evidenceName,bytes);once(summaryName,JSON.stringify({...summary,createdAt,evidenceSha256:digest,evidenceFile:evidenceName,assetManifest:this.repo.manifest},null,2)+'\n')
  return{evidenceFile:evidenceName,summaryFile:summaryName,sha256:digest,complete:evidence.humanDecisionCoverageComplete,admission:evidence.admission}
 }
 readExport(name){if(!/^review-r\d{9}-[a-f0-9]{64}(?:-summary)?\.json$/.test(name))throw new ToolError('EXPORT_NOT_FOUND',404);const p=path.join(this.dir,'exports',name);if(!fs.existsSync(p))throw new ToolError('EXPORT_NOT_FOUND',404);return fs.readFileSync(p)}
}
