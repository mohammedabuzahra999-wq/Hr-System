// Sealed comparison/validation role. No protected text or matching case IDs are output.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {contracts,ROOT,BASE,hash,read} from './contracts.mjs'
const normalize=t=>t.toLocaleLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/موضف/g,'موظف').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const jsonLines=b=>b.toString('utf8').trim().split(/\r?\n/).map(JSON.parse)
const dataFile=n=>path.join(BASE,n)
const token=/^<[A-Z][A-Z_]*_\d+>$/
const patterns={
 email:/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
 employeeIdentifier:/\bEMP[-_ ]?\d+\b|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i,
 nationalPassport:/\b(?:national|passport|civil)\s*(?:id|number|no)?\s*[:=#]\s*[A-Z0-9]{5,}/i,
 phone:/(?:\+\d{1,3}[ ().-]*)?(?:\d[ ().-]*){8,15}/,
 ibanBank:/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b|\b(?:bank|account)\s*(?:number|no)?\s*[:=#]\s*\w{6,}/i,
 address:/\b\d+\s+[A-Za-z -]+\s+(?:Street|Road|Avenue)\b|(?:عنوان|address)\s*[:=]\s*\S+/i,
 medical:/\b(?:diagnos\w*|cancer|diabet\w*|pregnan\w*|HIV|prescription)\b|تشخيص|سرطان|مرض مزمن|عقوبه طبيه/i,
 disciplinary:/\b(?:misconduct|disciplinary|warning issued|terminated for)\b|عقوبة|عقوبه|إنذار|انذار/i,
 factualRecord:/\b(?:salary is|salary was|was absent|was late|leave balance is|took \d+ days|worked \d+ hours)\b|راتبه يساوي|رصيده يساوي|تغيب يوم/i,
 apiKey:/\b(?:sk[-_](?:proj[-_])?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,})\b|api[_ -]?key\s*[:=]\s*\S+/i,
 bearerJWT:/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:access|refresh|session)[_-]?token\s*[:=]\s*\S+/i,
 passwordPrivateKey:/\b(?:password|passwd|pwd|secret)\s*[:=]\s*\S+|كلمة\s+(?:المرور|السر)\s*[:=]\s*\S+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
 databaseConnection:/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/|\b(?:Server|Host|Data Source)\s*=\s*\S+\s*;/i,
 urlOrInternalHost:/\b(?:https?|wss?|ftp):\/\/|\bwww\.|\b(?:localhost|[\w.-]+\.(?:internal|corp|lan|local))\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|[A-Z]:\\|\/(?:etc|home|srv)\//i,
 opaqueToken:/\b[A-Za-z0-9+/=_-]{36,}\b/,
}
const counts=list=>{const out={};for(const x of list)out[x]=(out[x]??0)+1;return out}
function strings(v){return typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(strings):v&&typeof v==='object'?Object.values(v).flatMap(strings):[]}
function mask(text,entities={}){
 let s=text;for(const [key,value]of Object.entries(entities)){if(typeof value!=='string'||!value.trim())continue;const type=/person|name/i.test(key)?'PERSON':/employee|number/i.test(key)?'IDENTIFIER':/department/i.test(key)?'DEPARTMENT':/amount/i.test(key)?'AMOUNT':/date|opensAt/i.test(key)?'DATE':null;if(type)s=s.split(value).join(`<${type}_1>`)}
 const seen=new Map();return normalize(s.replace(/<([A-Z][A-Z_]*?)_(\d+)>/g,(_,type,id)=>{const cls=/NAME/.test(type)?'PERSON':/EMPLOYEE_ID|RECORD_ID/.test(type)?'IDENTIFIER':/AMOUNT/.test(type)?'AMOUNT':/DATE/.test(type)?'DATE':type;const k=cls+':'+id;if(!seen.has(k))seen.set(k,[...seen.keys()].filter(x=>x.startsWith(cls+':')).length+1);return `<${cls}_${seen.get(k)}>`}))
}
const shingles=(a,n)=>{const s=new Set();for(let i=0;i<=a.length-n;i++)s.add(a.slice(i,i+n).join('\u0001'));return s}
const intersect=(a,b)=>{let n=0;for(const v of a.size<b.size?a:b)if((a.size<b.size?b:a).has(v))n++;return n}
function features(n){const chars=Array.from(n),tokens=n.split(' ');return{n,chars,tokens,cs:shingles(chars,3),ts:shingles(tokens,3)}}
function prepare(text,entities){const masked=mask(text,entities);return{text,masked,...features(normalize(text)),maskedView:features(masked)}}
function boundedEdit(a,b,k){if(Math.abs(a.length-b.length)>k)return false;let prior=new Int32Array(b.length+1),next=new Int32Array(b.length+1);for(let j=0;j<=b.length;j++)prior[j]=j
 for(let i=1;i<=a.length;i++){next.fill(k+1);next[0]=i;let min=k+1;for(let j=Math.max(1,i-k);j<=Math.min(b.length,i+k);j++){next[j]=Math.min(prior[j]+1,next[j-1]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));min=Math.min(min,next[j])}if(min>k)return false;[prior,next]=[next,prior]}return prior[b.length]<=k}
function near(a,b){
 const ci=intersect(a.cs,b.cs)
 if(Math.max(a.tokens.length,b.tokens.length)<=5){if(a.cs.size+b.cs.size&&2*ci/(a.cs.size+b.cs.size)>=0.9)return true}
 else{const ti=intersect(a.ts,b.ts),union=a.ts.size+b.ts.size-ti;if(union&&ti/union>=0.8)return true}
 const max=Math.max(a.chars.length,b.chars.length),k=Math.floor(max*0.1+1e-9)
 if(Math.abs(a.chars.length-b.chars.length)>k||ci<Math.max(a.cs.size,b.cs.size)-3*k)return false
 return boundedEdit(a.chars,b.chars,k)
}
function compare(candidate,reference){
 const out={candidateRows:candidate.length,referenceUniqueTexts:reference.length,exactCandidateRows:0,normalizedCandidateRows:0,entityMaskedExactCandidateRows:0,strongNearCandidateRows:0,flaggedCandidateRows:0}
 const exact=new Set(reference.map(x=>x.text)),norm=new Set(reference.map(x=>x.n)),masked=new Set(reference.map(x=>x.masked))
 for(const item of candidate){const variants=[item,...(item.alternates??[])],e=variants.some(v=>exact.has(v.text)),n=variants.some(v=>norm.has(v.n)),m=variants.some(v=>masked.has(v.masked));let strong=false
  if(!e&&!n&&!m){outer:for(const v of variants)for(const ref of reference){if(near(v,ref)||near(v.maskedView,ref.maskedView)){strong=true;break outer}}}
  out.exactCandidateRows+=+e;out.normalizedCandidateRows+=+n;out.entityMaskedExactCandidateRows+=+m;out.strongNearCandidateRows+=+strong;out.flaggedCandidateRows+=+(e||n||m||strong)
 }
 return out
}
function privacy(rows){const flags=Object.fromEntries(Object.keys(patterns).map(k=>[k,0]));let unsafeSlots=0,declaredRows=0,operationTopics=0
 for(const r of rows){
  assert.equal(r.input.referenceDate,'2027-06-15','UNDECLARED_REFERENCE_DATE');const render=r.syntheticRendering??{},symbolic=strings({input:{text:r.input.text,trustedRole:r.input.trustedRole,context:r.input.context},expected:r.expected,wire:r.wireProjection});if(Object.keys(render).length)declaredRows++
  const sanitized=symbolic.map(s=>{for(const [key,value]of Object.entries(render)){assert.ok(token.test(key));assert.ok(['2027-07-12','2027-07-14','742.50','18.75','2027-07-12T09:00:00Z'].includes(value));s=s.split(value).join('<DECLARED_SYNTHETIC_RENDERING>')}return s.replace(/<[A-Z][A-Z_]*_\d+>/g,'<TYPED_PLACEHOLDER>')})
  for(const [key,p]of Object.entries(patterns))if(sanitized.some(s=>p.test(s)))flags[key]++
  for(const p of [r.expected.questionPlan,r.expected.actionPlan,r.wireProjection.questionPlan,r.wireProjection.actionPlan])if(p)for(const k of ['personName','employeeNumber','employeeNumberNew','email','department','jobTitle','title','location'])if(p[k]!==null&&p[k]!==undefined&&!token.test(p[k]))unsafeSlots++
  if(r.expected.actionPlan?.action==='resetPassword')operationTopics++
 }
 return{status:Object.values(flags).some(x=>x)||unsafeSlots?'FAIL':'PASS_STATIC_WITH_REVIEW_LIMITATIONS',flaggedRowsByCategory:flags,untypedConcreteIdentitySlots:unsafeSlots,
  declaredSyntheticRenderingRows:declaredRows,credentialOperationTopicRows:operationTopics,realFactsDetected:0,
  scope:'Fixed synthetic referenceDate validated separately; every row/field is structurally checked; all input/expected/wire strings scanned. Typed metadata IDs/hashes and declared synthetic dates/instruction amounts are validated exceptions, not copied real values.',
  names:'Only indexed placeholders are permitted in identity fields; static checks do not certify independent bilingual semantic review',independentReview:'PENDING'}
}
async function quality(rows,expectedCount,asset,K){const failures=[];const fail=(id,code)=>failures.push({recordId:id,code});const seen=new Set(),normalized=new Set();let qvalid=0,avalid=0,wvalid=0
 for(const r of rows){const id=r.recordId
  if(r.schemaVersion!=='CEB-assets-v1'||r.assetVersion!=='v1'||r.synthetic!==true||!/^CEB-[RS]-(?:QUESTION|ACTION|CHALLENGE)-\d{3}-(?:en|ar-MSA|ar-JO|mixed)$/.test(id??''))fail(id,'invalid_envelope')
  if(seen.has(id))fail(id,'duplicate_id');seen.add(id);if(normalized.has(normalize(r.input?.text??'')))fail(id,'normalized_duplicate');normalized.add(normalize(r.input?.text??''))
  if(!['en','ar-MSA','ar-JO','mixed'].includes(r.language)||typeof r.input?.text!=='string'||r.input.text.length<2||r.input.text.length>500||r.expected?.orchestration?.executionPermitted!==false)fail(id,'invalid_input_or_execution_flag')
  if(r.input.trustedRole&&!K.catalog.roles.includes(r.input.trustedRole))fail(id,'invalid_role')
  for(const [which,p] of [['symbolic',r.expected.questionPlan],['wire',r.wireProjection.questionPlan]])if(p){const result=K.validatePlan(p,'deterministic');if(!result.ok)fail(id,'question_'+which+'_schema_semantic');else{qvalid++;if(which==='wire')wvalid++}if(p.intent!=='outOfScope'&&!K.catalog.allowedIntents[r.input.trustedRole]?.includes(p.intent))fail(id,'role_intent_mismatch')}
  for(const [which,p]of[['symbolic',r.expected.actionPlan],['wire',r.wireProjection.actionPlan]])if(p){if(!K.shared.copilotActionPlanSchema.safeParse(p).success)fail(id,'action_'+which+'_schema');else avalid++;if(!K.catalog.allowedActions[r.input.trustedRole]?.includes(p.action))fail(id,'role_action_mismatch')
   if(which==='wire'){for(const k of ['startDate','endDate'])if(p[k]!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(p[k]))fail(id,'wire_date');if(p.amount!==null&&!/^\d+(?:\.\d{1,2})?$/.test(p.amount))fail(id,'wire_amount');if(p.opensAt!==null&&!Number.isFinite(Date.parse(p.opensAt)))fail(id,'wire_time')}
  }
  const slotPattern=/\$[A-Z_]+/;if(strings(r).some(s=>slotPattern.test(s)))fail(id,'unexpanded_slot')
  if(r.expected.questionPlan===null&&!['clarify','unsupported'].includes(r.expected.orchestration.behavior))fail(id,'missing_question_gold')
 }
 if(rows.length!==expectedCount)fail('ASSET','wrong_count')
 const languages=counts(rows.map(r=>r.language));for(const l of ['en','ar-MSA','ar-JO','mixed'])if(languages[l]!==expectedCount/4)fail('ASSET','language_quota')
 const core=rows.filter(r=>/-QUESTION-/.test(r.recordId)),coreIntents=[...new Set(core.map(r=>r.expected.questionPlan?.intent))].sort(),actions=[...new Set(rows.map(r=>r.expected.actionPlan?.action).filter(Boolean))].sort()
 if(coreIntents.length!==32)fail('ASSET','core_intent_coverage');if(asset==='R'&&actions.length!==48)fail('ASSET','action_coverage')
 return{status:failures.length?'FAIL':'PASS',rows:rows.length,uniqueExact:new Set(rows.map(r=>r.input.text)).size,uniqueNormalized:normalized.size,duplicates:rows.length-normalized.size,languages,
  roles:counts(rows.map(r=>r.input.trustedRole)),families:new Set(rows.map(r=>r.familyId)).size,coreQuestionRows:core.length,actionReferenceRows:rows.filter(r=>r.task==='action-reference').length,challengeRows:rows.filter(r=>/-CHALLENGE-/.test(r.recordId)).length,
  coreIntentCount:coreIntents.length,coreIntents,actionCount:actions.length,actions,schemaSemanticValidations:qvalid,actionSchemaValidations:avalid,wireQuestionPlans:wvalid,failures,
  capabilityReview:'Existing typed schema/semantic and role gates checked only; no service/proposal/confirmation execution. Independent bilingual/capability review pending.',modelEligibility:'NOT_ASSESSED_NO_ROUTER_EXECUTED'}
}
function selfTest(){let n=0;const ok=(v)=>{assert.ok(v);n++}
 ok(normalize('إجازة')==='اجازه');ok(mask('employee <EMPLOYEE_NAME_10>')===mask('employee <EMPLOYEE_NAME_90>'))
 ok(near(prepare('abcdefghij'),prepare('abcdefghiX')));ok(!near(prepare('abcdefghij'),prepare('zzzzzzzzzz')))
 ok(near(prepare('a b c d e f g'),prepare('a b c d e f g')))
 const canaries={email:'x@example.invalid',employeeIdentifier:'EMP-990001',nationalPassport:'passport: AB123456',phone:'+962 700 000 000',ibanBank:'JO00'+'A'.repeat(26),address:'123 Example Street',medical:'diagnosis',disciplinary:'misconduct',factualRecord:'salary is one hundred',apiKey:'sk-'+'A'.repeat(30),bearerJWT:'Bearer '+'A'.repeat(30),passwordPrivateKey:'password=EXAMPLE_TEST_ONLY',databaseConnection:'postgresql://test:example@localhost/test',urlOrInternalHost:'https://example.invalid',opaqueToken:'Z'.repeat(40)}
 for(const [k,v]of Object.entries(canaries))ok(patterns[k].test(v))
 const result=compare([prepare('identical text')],[prepare('identical text')]);ok(result.flaggedCandidateRows===1);ok(result.normalizedCandidateRows===1)
 return{status:'PASS',checks:n,protectedDatasetsRead:false,modelCalls:0}
}
async function main(){
 assert.ok(process.permission&&!process.permission.has('child')&&!process.permission.has('worker'),'RESTRICTED_PROCESS_REQUIRED')
 if(process.argv.includes('--self-test')){console.log(JSON.stringify(selfTest()));return}
 const K=await contracts(),Rbytes=fs.readFileSync(dataFile('runtime-reference-v1.jsonl')),Sbytes=fs.readFileSync(dataFile('model-selection-v1.jsonl')),R=jsonLines(Rbytes),S=jsonLines(Sbytes)
 const manifest=JSON.parse(fs.readFileSync(dataFile('generation/generation-result.json'),'utf8'))
 assert.equal(hash(Rbytes),manifest.outputs['runtime-reference-v1.jsonl']);assert.equal(hash(Sbytes),manifest.outputs['model-selection-v1.jsonl'])
 for(const [n,h]of Object.entries(manifest.inputHashes))assert.equal(hash(fs.readFileSync(dataFile('generation/'+n))),h,'GENERATION_INPUT_DRIFT')
 const Fbytes=read('docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'),Obytes=read('server/src/copilot/data/hr_agent_intents_10000.jsonl')
 assert.equal(hash(Fbytes),'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05');assert.equal(hash(Obytes),'1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b')
 const F=jsonLines(Fbytes),O=jsonLines(Obytes),unique=list=>[...new Map(list.map(x=>[x.text,x])).values()]
 const assetViews=rows=>rows.map(r=>{const p=prepare(r.input.text);p.alternates=r.input.text===r.wireProjection.inputText?[]:[prepare(r.wireProjection.inputText,{...(r.wireProjection.questionPlan??{}),...(r.wireProjection.actionPlan??{})})];return p})
 const fp=unique(F.map(r=>prepare(r.input,r.expected_entities))),op=unique(O.map(r=>prepare(r.text))),rp=assetViews(R),sp=assetViews(S),rReferences=unique(rp.flatMap(p=>[p,...p.alternates]))
 const rQuality=await quality(R,320,'R',K),sQuality=await quality(S,160,'S',K),rPrivacy=privacy(R),sPrivacy=privacy(S)
 const report={version:'CEB-validation-v2',timestamp:new Date().toISOString(),validatorSha256:hash(read('docs/fine-tuning/controlled-assets/validation/validate-controlled-assets-v2.mjs')),
  thresholds:{normalization:'current resolver NFKD/Arabic/punctuation',longText:'>5 tokens: token 3-shingle Jaccard >=0.80 OR normalized code-point edit >=0.90',shortText:'<=5 tokens: character 3-shingle Dice >=0.90 OR normalized code-point edit >=0.90',entityMask:'known typed spans only',reporting:'aggregate counts only; no protected text/golds/IDs or matched-candidate IDs'},
  runtime:{sha256:hash(Rbytes),quality:rQuality,privacy:rPrivacy,secrets:{status:Object.entries(rPrivacy.flaggedRowsByCategory).filter(([k])=>['apiKey','bearerJWT','passwordPrivateKey','databaseConnection'].includes(k)).some(([,v])=>v)?'FAIL':'PASS'},contamination:{frozen404:compare(rp,fp),historical10K:compare(rp,op)}},
  selection:{sha256:hash(Sbytes),quality:sQuality,privacy:sPrivacy,secrets:{status:Object.entries(sPrivacy.flaggedRowsByCategory).filter(([k])=>['apiKey','bearerJWT','passwordPrivateKey','databaseConnection'].includes(k)).some(([,v])=>v)?'FAIL':'PASS'},contamination:{frozen404:compare(sp,fp),historical10K:compare(sp,op),runtimeReference:compare(sp,rReferences)}},
  integrity:{frozen404:hash(Fbytes),historical10K:hash(Obytes),generationInputHashesMatch:true},
  provenance:'Generator-created bytes verified; fixed metadata/hash exceptions validated; creator attestation and independent review are separate evidence, not inferred here',
  independentReview:'NOT_PROVIDED',legacyCorpusExclusion:'NOT_YET_VERIFIED_FOR_CONTROLLED_RESOLVER',productionAccess:false,cloudModelCalls:0,ollamaCalls:0,frozenCasesExecuted:0,fineTuningStarted:false}
 for(const item of [report.runtime,report.selection]){const collision=Object.values(item.contamination).some(c=>c.flaggedCandidateRows>0);item.automatedGatesPass=item.quality.status==='PASS'&&item.privacy.status!=='FAIL'&&item.secrets.status==='PASS'&&!collision;item.admission='REJECTED';item.admissionReasons=[...(item.quality.status!=='PASS'?['structural_or_schema_failure']:[]),...(item.privacy.status==='FAIL'?['privacy_candidate_unresolved']:[]),...(collision?['unresolved_contamination_flags']:[]),'independent_bilingual_privacy_semantic_review_missing','purpose_specific_independent_admission_signoff_missing']}
 fs.writeFileSync(dataFile('validation/validation-results-v2.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify({status:'VALIDATION_COMPLETE_NO_MODELS',runtime:{quality:rQuality.status,privacy:rPrivacy.status,contamination:report.runtime.contamination,admission:report.runtime.admission},selection:{quality:sQuality.status,privacy:sPrivacy.status,contamination:report.selection.contamination,admission:report.selection.admission},independentReview:report.independentReview,protectedTextPrinted:false}))
}
main().catch(()=>{console.error('OFFLINE_VALIDATION_FAILED (sensitive details suppressed)');process.exitCode=1})
