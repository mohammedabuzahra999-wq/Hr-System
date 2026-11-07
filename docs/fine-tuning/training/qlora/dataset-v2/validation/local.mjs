// Candidate-only validation. Never reads protected reference dataset contents.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {contracts} from '../../../../controlled-assets/validation/contracts.mjs';
import {normalize,patterns,strings} from '../../../../controlled-assets/remediation-v1.1/validation/core.mjs';
import {prepare,compare,selfTest} from './compare.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..');
const counts=a=>a.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
export async function validate(rows,{near=true}={}){
 const K=await contracts(),failures=[],check=(v,code,id='DATASET')=>{if(!v)failures.push({id,code});};
 const plan=z.object({plan:K.shared.copilotPlanSchema.strict()}).strict();
 const totals={splits:counts(rows.map(r=>r.split)),languages:counts(rows.map(r=>r.language)),intents:counts(rows.map(r=>r.expected.plan.intent)),actions:counts(rows.map(r=>r.annotations.actionCategory).filter(Boolean))};
 check(rows.length===8000,'row_count');for(const [s,n]of Object.entries({train:6400,dev:800,internalTest:800}))check(totals.splits[s]===n,'split_'+s);
 const families=new Map(),construction=new Map(),seenIds=new Set(),raw=new Set(),norm=new Set(),masked=new Set();
 const privacyCounts=Object.fromEntries(Object.keys(patterns).map(k=>[k,0]));let exactDuplicates=0,normalizedDuplicates=0,maskedDuplicates=0,schemaValid=0,semanticValid=0;
 for(const r of rows){const id=r.recordId,q=r.expected.plan;
  check(!seenIds.has(id),'duplicate_record_id',id);seenIds.add(id);
  check(r.schemaVersion==='HR-QLORA-DATASET-1'&&r.task==='question_plan'&&r.synthetic===true,'envelope',id);
  check(r.input.referenceDate==='2027-06-15'&&K.catalog.roles.includes(r.input.trustedRole),'trusted_synthetic_context',id);
  check(r.input.question.length>=2&&r.input.question.length<=500,'input_length',id);
  const strict=plan.safeParse(r.expected);if(strict.success)schemaValid++;else check(false,'strict_plan_schema',id);
  if(K.validatePlan(q,'model').ok)semanticValid++;else check(false,'shared_plan_semantics',id);
  check(Object.keys(q).length===11&&K.catalog.questionFields.every(k=>Object.hasOwn(q,k)),'complete_fields',id);
  check(q.intent==='outOfScope'||K.catalog.allowedIntents[r.input.trustedRole]?.includes(q.intent),'intent_role_menu',id);
  check(r.annotations.executionPermitted===false&&r.provenance.humanReviewPerformed===false&&r.provenance.placeholderOnly===true,'non_execution_provenance',id);
  for(const k of ['personName','employeeNumber','department'])if(q[k]!==null){check(/^<[A-Z][A-Z_]*_\d+>$/.test(q[k]),'non_placeholder_entity',id);check(r.input.question.includes(q[k])||r.input.previousPlan?.[k]===q[k],'unstated_entity',id);}
  if(r.input.previousPlan)check(K.validatePlan(r.input.previousPlan,'model').ok,'previous_plan_invalid',id);
  if(q.intent==='employeeFile')check(!!q.personName!==!!q.employeeNumber,'employee_identifier_required_unique',id);
  if(q.intent==='payrollInsights')check(q.payrollTopic!==null&&!q.personName&&!q.employeeNumber,'company_payroll_scope',id);
  if(q.intent==='employeeFile'&&q.reportType==='payroll')check(['hr','admin'].includes(r.input.trustedRole),'person_payroll_role',id);
  if(['myRequests','myPayslips'].includes(q.intent))check(q.period===null,'unsupported_self_filter',id);
  if(q.intent==='doAction'){check(K.catalog.actions.includes(r.annotations.actionCategory)&&K.catalog.allowedActions[r.input.trustedRole].includes(r.annotations.actionCategory),'action_category_role',id);check(Object.entries(q).every(([k,v])=>k==='intent'||v===null),'action_stage_scope',id);}
  else check(r.annotations.actionCategory===null,'action_label_on_read',id);
  for(const e of r.annotations.entitySpans)check(r.input.question.slice(e.start,e.end)===e.value&&/^<[A-Z][A-Z_]*_\d+>$/.test(e.value),'entity_span',id);
  const question=r.input.question.replace(/<[A-Z][A-Z_]*_\d+>/g,''),ar=/\p{Script=Arabic}/u.test(question),en=/[A-Za-z]/.test(question);
  check(r.language==='en'?en&&!ar:r.language==='mixed'?ar&&en:ar&&!en,'language_script',id);
  // The only non-scanned value is an exact declared synthetic reference date.
  const safe={...r,input:{...r.input}};delete safe.input.referenceDate;
  const texts=strings(safe).map(s=>s.replace(/<[A-Z][A-Z_]*_\d+>/g,'<TYPED_PLACEHOLDER>'));
  for(const [name,re]of Object.entries(patterns))if(texts.some(s=>re.test(s)))privacyCounts[name]++;
  const text=r.input.question,n=normalize(text),m=prepare(text).masked;
  if(raw.has(text))exactDuplicates++;raw.add(text);if(norm.has(n))normalizedDuplicates++;norm.add(n);if(masked.has(m))maskedDuplicates++;masked.add(m);
  if(!families.has(r.lineage.familyId))families.set(r.lineage.familyId,[]);families.get(r.lineage.familyId).push(r);
  if(!construction.has(r.lineage.constructionGroup))construction.set(r.lineage.constructionGroup,new Set());construction.get(r.lineage.constructionGroup).add(r.split);
 }
 check(schemaValid===8000,'schema_count');check(semanticValid===8000,'semantic_count');check(exactDuplicates===0&&normalizedDuplicates===0&&maskedDuplicates===0,'duplicates');
 check(Object.values(privacyCounts).every(n=>n===0),'pii_secrets');check(families.size===2000,'family_count');
 let familyLeakage=0,constructionLeakage=0;
 for(const group of families.values()){
  if(new Set(group.map(x=>x.split)).size!==1)familyLeakage++;
  check(group.length===4&&new Set(group.map(x=>x.language)).size===4,'translation_family_membership',group[0].lineage.familyId);
  check(new Set(group.map(x=>JSON.stringify(x.expected))).size===1,'translation_target_consistency',group[0].lineage.familyId);
 }
 for(const s of construction.values())if(s.size>1)constructionLeakage++;
 check(familyLeakage===0&&constructionLeakage===0,'family_construction_leakage');
 const coverage={};
 for(const language of ['en','ar-MSA','ar-JO','mixed']){
  const a=rows.filter(r=>r.language===language),p=a.map(r=>r.expected.plan);
  const c={rows:a.length,splits:counts(a.map(x=>x.split)),intents:counts(p.map(x=>x.intent)),actions:counts(a.map(x=>x.annotations.actionCategory).filter(Boolean)),periods:counts(p.map(x=>x.period??'null')),months:counts(p.map(x=>x.month).filter(Boolean)),reportTypes:counts(p.map(x=>x.reportType).filter(Boolean)),payrollTopics:counts(p.map(x=>x.payrollTopic).filter(Boolean)),rankBy:counts(p.map(x=>x.rankBy).filter(Boolean)),namedOrNumberedPeople:p.filter(x=>x.personName||x.employeeNumber).length,departments:p.filter(x=>x.department).length};
  coverage[language]=c;check(c.rows===2000&&c.splits.train===1600&&c.splits.dev===200&&c.splits.internalTest===200,'language_split_quota_'+language);
  check(K.catalog.intents.every(i=>c.intents[i]>0)&&K.catalog.actions.every(i=>c.actions[i]>0),'language_ontology_'+language);
  check(c.namedOrNumberedPeople>=120&&c.departments>=20&&c.periods.calendarMonth>=40,'entity_calendar_coverage_'+language);
  for(const p of K.catalog.periods.filter(x=>x!=='calendarMonth'))check(c.periods[p]>=20,'relative_period_'+language+'_'+p);
  for(let m=1;m<=12;m++)check(c.months[m]>0,'month_'+language+'_'+m);
  for(const [field,values]of [['payrollTopics',K.shared.payrollTopicSchema.options],['rankBy',K.shared.copilotRankBySchema.options],['reportTypes',K.shared.reportTypeSchema.options]])for(const v of values)check(c[field][v]>=4,'slot_value_'+language+'_'+field+'_'+v);
  for(const split of ['train','dev','internalTest']){const b=a.filter(x=>x.split===split);check(K.catalog.intents.every(i=>b.some(x=>x.expected.plan.intent===i))&&K.catalog.actions.every(i=>b.some(x=>x.annotations.actionCategory===i)),'split_ontology_'+language+'_'+split);}
 }
 const crossSplit=[];if(near)for(const [a,b]of [['dev','train'],['internalTest','train'],['internalTest','dev']]){
  const stat=compare(rows.filter(r=>r.split===a).map(r=>prepare(r.input.question)),rows.filter(r=>r.split===b).map(r=>prepare(r.input.question)));
  crossSplit.push({comparison:a+'_vs_'+b,...stat});check(stat.flaggedCandidateRows===0,'cross_split_similarity_'+a+'_'+b);
 }
 return{status:failures.length?'FAIL':'PASS',checkedAt:new Date().toISOString(),candidatePayloadSha256:crypto.createHash('sha256').update(rows.map(r=>JSON.stringify(r)).join('\n')+'\n').digest('hex'),rows:rows.length,totals,strictSchemaValid:schemaValid,sharedSemanticValid:semanticValid,privacy:{status:Object.values(privacyCounts).every(n=>n===0)?'PASS':'FAIL',flaggedRowsByCategory:privacyCounts,realPiiFound:false,qualification:'Placeholder-only lineage and fixed static checks; not an independent human linguistic/PII certification',declaredException:'Exact synthetic referenceDate 2027-06-15 only'},duplicates:{exact:exactDuplicates,normalized:normalizedDuplicates,entityMasked:maskedDuplicates},families:families.size,familyLeakage,constructionLeakage,coverage,crossSplit,comparisonSelfTest:selfTest(),failures,modelCalls:0,trainingStarted:false};
}
if(process.argv.includes('--preview')||process.argv.includes('--candidate')){
 const preview=process.argv.includes('--preview');const rows=preview?(await import('../generation/generate.mjs')).build():fs.readFileSync(path.join(base,'candidate/dataset.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const report=await validate(rows);let reportName=preview?'candidate-only-precheck.json':'local-results.json';if(preview&&fs.existsSync(path.join(dir,reportName))){let n=2;while(fs.existsSync(path.join(dir,'candidate-only-precheck-'+n+'.json')))n++;reportName='candidate-only-precheck-'+n+'.json';}fs.writeFileSync(path.join(dir,reportName),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:report.status,rows:report.rows,schema:report.strictSchemaValid,semantics:report.sharedSemanticValid,privacy:report.privacy.status,duplicates:report.duplicates,leakage:report.familyLeakage,failures:report.failures.slice(0,12),crossSplit:report.crossSplit},null,2));if(report.status!=='PASS')process.exitCode=1;
}
