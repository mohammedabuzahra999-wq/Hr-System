import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { L, concepts, topics, reports, ranks, periods, months, questionFrames } from './lexicon.mjs';
import { actions, actionFrames } from './actions.mjs';
import { unclear, forbidden, external, refusalFrames, hellos, greetingFrames } from './controls.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url)), prep=path.resolve(dir,'../..');
const C=JSON.parse(fs.readFileSync(path.join(prep,'current-contract-catalog.json'),'utf8'));
export const empty=(intent,extra={})=>({...Object.fromEntries(C.questionFields.map(k=>[k,null])),intent,...extra});
const positive=C.intents.filter(x=>!['greeting','outOfScope','doAction'].includes(x));
if(positive.length!==29||Object.keys(actions).length!==48)throw Error('ONTOLOGY_MISMATCH');
const timingIntents=new Set(['myAttendance','teamAttendance','teamOnLeave','departmentAbsenceComparison','orgAttendance','orgLeaveSummary','attendanceRanking','generateReport','myReport','employeeFile']);
const payIntents=new Set(['payrollInsights','payrollReadiness','payrollRunSummary']);
const fullPeriods=Object.keys(periods), payPeriods=['thisMonth','lastMonth'];
function timing(i,l,pay=false){
 if(i%3===0){const m=Math.floor(i/3)%12+1,y=i%2===0?2028+(Math.floor(i/3)%3):null;const numeric=i%4<2;const ar=l===1&&i%2===0;const digit=n=>ar?String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[+d]):String(n);
 const month=numeric?['month '+digit(m),'الشهر '+digit(m),'الشهر '+digit(m),'month '+digit(m)][l]:months[m-1][l];
 return{fields:{period:'calendarMonth',month:m,year:y},text:month+(y===null?'':[' in ',' من عام ',' من سنة ',' من سنة '][l]+digit(y))};}
 const p=(pay?payPeriods:fullPeriods)[(Math.floor(i/3)*2+i%3-1)%(pay?payPeriods.length:fullPeriods.length)];return{fields:{period:p},text:periods[p][l]};
}
function roleFor(intent,i,q){let a=C.roles.filter(r=>intent==='outOfScope'||C.allowedIntents[r].includes(intent));if(intent==='employeeFile'&&q.reportType==='payroll')a=a.filter(r=>r==='hr'||r==='admin');return a[i%a.length];}
const replace=(s,values)=>s.replace(/\{(\w+)\}/g,(_,k)=>values[k]??(()=>{throw Error('UNKNOWN_SLOT_'+k)})());
function scope(q){if(q.intent.startsWith('my'))return'self';if(q.intent.startsWith('team'))return'direct_reports';if(q.intent==='employeeFile')return'named_employee';if(['doAction','howDoI','greeting'].includes(q.intent))return'system';if(q.intent==='outOfScope')return'none';return q.department?'department':'company';}
let family=0;const result=[];
function add(pool,split,construction,make){
 const f=++family,fid='QLORA1-F'+String(f).padStart(4,'0');
 for(let l=0;l<4;l++){
  const v=make(l);const offset=({train:1000000,dev:2000000,internalTest:3000000})[split]+f*10;
  const render=s=>s.replace(/<([A-Z][A-Z_]*?)_(\d+)>/g,(_,t,n)=>'<'+t+'_'+(offset+Number(n))+'>');
  const map=x=>typeof x==='string'?render(x):Array.isArray(x)?x.map(map):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,map(v)])):x;
  const question=render(v.text),q=map(v.plan),previous=map(v.previous??null);
  const spans=[...question.matchAll(/<([A-Z][A-Z_]*?)_\d+>/g)].map(m=>({type:m[1],value:m[0],start:m.index,end:m.index+m[0].length,offsetUnit:'UTF-16'}));
  result.push({schemaVersion:'HR-QLORA-DATASET-1',recordId:fid+'-'+L[l],task:'question_plan',split,language:L[l],synthetic:true,
   lineage:{familyId:fid,translationGroup:fid,episodeId:fid,constructionGroup:construction,syntaxPartition:split,entityPool:split},pool,
   input:{question,trustedRole:v.role??roleFor(q.intent,f,q),previousPlan:previous,referenceDate:'2027-06-15'},
   expected:{plan:q},annotations:{scope:scope(q),ownership:scope(q),entitySpans:spans,actionCategory:v.action??null,clarification:q.refusalReason==='unclear'?'required':'not_required',actionConfirmation:q.intent==='doAction'?'server_owned':'not_applicable',parameterSources:Object.fromEntries(Object.entries(q).filter(([k,v])=>k!=='intent'&&v!==null).map(([k,v])=>[k,previous&&previous[k]===v&&!question.includes(String(v))?'previous_plan':'explicit_or_semantic'])),executionPermitted:false,modelEligibility:'classifier_supervision'},
   provenance:{creator:'Codex independently authored grammar',generation:'deterministic composition from approved contracts; no teacher API',source:'fresh authored lexicon and semantic construction, not a reference-corpus row',humanReviewPerformed:false,placeholderOnly:true}});
 }
}
function core(intent,i,l){
 let q=empty(intent),values={},j=i%4;let base=concepts[intent][j%concepts[intent].length][l];
 if(intent==='payrollInsights'){const t=Object.keys(topics)[i%11];q.payrollTopic=t;values.topic=topics[t][l];}
 if(intent==='attendanceRanking'){const r=Object.keys(ranks)[i%3];q.rankBy=r;values.rank=ranks[r][l];}
 if(intent==='departmentAbsenceComparison')q.reportType='department';
 if(intent==='generateReport'){const t=Object.keys(reports)[i%6];q.reportType=t;values.report=reports[t][l];}
 if(intent==='myReport'){const t=i%2?'leave':'attendance';q.reportType=t;values.selfReport=reports[t][l];}
 if(['orgAttendance','departmentBreakdown'].includes(intent)){q.department='<DEPARTMENT_1>';values.department=q.department;}
 if(intent==='employeeFile'){
  const number=i%2===1;const p=number?'<EMPLOYEE_ID_1>':'<EMPLOYEE_NAME_1>';q[number?'employeeNumber':'personName']=p;values.person=p;
  const view=[['a complete employee-file report','تقرير كامل بالملف الوظيفي','تقرير كامل بالملف الوظيفي','تقرير employee file كامل'],['the overtime hours and pay','ساعات وأجر العمل الإضافي','ساعات وأجر الأوفرتايم','ساعات وأجر overtime'],['the salary and payslip information','معلومات الراتب وقسائم الراتب','معلومات الراتب وكشوفاته','معلومات salary والـ payslips'],['the personal employee details','البيانات الوظيفية الشخصية','البيانات الوظيفية الشخصية','بيانات employee الشخصية']][j];
  values.employeeView=view[l];q.reportType=j===0?'employeeFile':j===3?null:'payroll';
 }
 base=replace(base,values);
 if(timingIntents.has(intent)||payIntents.has(intent)){const t=timing(i+positive.indexOf(intent),l,payIntents.has(intent));q={...q,...t.fields};base+=' '+t.text;}
 const split=i<32?'train':i<36?'dev':'internalTest';const fi=split==='train'?Math.floor(i/4):i%4;
 return{text:replace(questionFrames[split][fi][l],{x:base}),plan:q};
}
for(const intent of positive)for(let i=0;i<40;i++)add('substantive_intents',i<32?'train':i<36?'dev':'internalTest','core:'+intent+':'+(i<32?'train'+Math.floor(i/4):i<36?'dev'+i%4:'test'+i%4)+':meaning'+i%4,l=>core(intent,i,l));
for(const action of C.actions)for(let i=0;i<8;i++){
 const split=i<6?'train':i===6?'dev':'internalTest',fi=split==='train'?i:0;
 add('action_boundaries',split,'action:'+action+':'+split+fi,l=>({text:replace(actionFrames[split][fi][l],{x:actions[action][l]}),plan:empty('doAction'),action,role:C.roles.filter(r=>C.allowedActions[r].includes(action))[i%C.roles.filter(r=>C.allowedActions[r].includes(action)).length]}));
}
for(const [reason,n,subjects,trainN,devN]of[['unclear',96,unclear,80,8],['notPermitted',96,forbidden,80,8],['notHrData',64,external,56,4]])for(let i=0;i<n;i++){
 const split=i<trainN?'train':i<trainN+devN?'dev':'internalTest';const fi=split==='train'?Math.floor(i/subjects.length):0,si=i%subjects.length;
 add('refusal_abstention',split,'refusal:'+reason+':'+split+fi+':subject'+si,l=>{
  const text=replace(refusalFrames[split][fi][l],{x:subjects[si][l]});const p=empty('outOfScope',{refusalReason:reason});
  if(reason==='notPermitted'&&text.includes('<EMPLOYEE_NAME_1>'))p.personName='<EMPLOYEE_NAME_1>';
  if(reason==='notPermitted'&&text.includes('<EMPLOYEE_ID_1>'))p.employeeNumber='<EMPLOYEE_ID_1>';
  return{text,plan:p,role:reason==='notPermitted'?'employee':C.roles[i%4]};
 });
}
for(let i=0;i<40;i++){
 const split=i<32?'train':i<36?'dev':'internalTest',fi=split==='train'?Math.floor(i/8):0,hi=i%8;
 add('greeting',split,'greeting:'+split+fi+':opening'+hi,l=>({text:replace(greetingFrames[split][fi][l],{x:hellos[hi][l]}),plan:empty('greeting')}));
}
const contextFrames={
 train:[['Keep the same view, but replace the earlier subject with {x}.','احتفظ بالعرض نفسه، لكن استبدل الموضوع السابق بـ{x}.','خلي نفس العرض بس بدّل الموضوع السابق بـ{x}.','خلي نفس الـ view بس بدّل الموضوع السابق بـ{x}.'],['For that earlier HR question, I now mean {x} instead.','في سؤالي الوظيفي السابق، أقصد الآن {x} بدلاً من السابق.','بالسؤال الوظيفي السابق، هسا قصدي {x} بدل السابق.','بسؤالي السابق للـ HR، هسا قصدي {x} بدل السابق.'],['Reuse the previous subject and period with this change: {x}.','استخدم موضوع السؤال السابق وفترته مع هذا التغيير: {x}.','استخدم موضوع السؤال السابق وفترته مع هالتغيير: {x}.','استخدم subject والفترة السابقين مع هالـ change: {x}.'],['There is one correction to the preceding request: {x}.','هناك تصحيح واحد للاستفسار السابق: {x}.','في تصحيح واحد للسؤال السابق: {x}.','في correction واحد للسؤال السابق: {x}.'],['In the view we were discussing, substitute {x}.','في العرض الذي كنا نناقشه، استخدم بدلاً من السابق {x}.','بالعرض اللي كنا نحكي عنه، استخدم بدل السابق {x}.','بالـ view اللي كنا نحكي عنه، استخدم بدل السابق {x}.'],['The previous HR enquiry still applies; the new value is {x}.','لا يزال الاستفسار الوظيفي السابق مقصوداً، والقيمة الجديدة هي {x}.','السؤال الوظيفي السابق لسه مقصود، والقيمة الجديدة هي {x}.','الـ HR enquiry السابق لسه مقصود، والقيمة الجديدة هي {x}.'],['I am following up on that result, specifically changing it to {x}.','أتابع السؤال السابق مع تغييره تحديداً إلى {x}.','بتابع السؤال السابق وبغيره بالتحديد إلى {x}.','بتابع الـ result السابق وبغيره بالتحديد إلى {x}.'],['Please retain the previous question but use {x} this time.','أبق السؤال السابق كما هو مع استخدام {x} هذه المرة.','خلي السؤال السابق زي ما هو واستخدم {x} هالمرة.','خلي الـ question السابق زي ما هو واستخدم {x} هالمرة.']],
 dev:[['With the preceding question as context, the replacement I want is {x}.','بالاستناد إلى سياق السؤال السابق، البديل الذي أقصده هو {x}.','بسياق السؤال السابق، البديل اللي قصدي إياه هو {x}.','بسياق الـ question السابق، البديل اللي قصدي إياه هو {x}.']],
 internalTest:[['Rather than starting a new HR topic, alter the last enquiry to refer to {x}.','بدلاً من بدء موضوع وظيفي جديد، اجعل الاستفسار الأخير يتعلق بـ{x}.','بدل ما نبدأ موضوع وظيفي جديد، خلي آخر سؤال يتعلق بـ{x}.','بدل ما نبدأ HR topic جديد، خلي آخر سؤال يتعلق بـ{x}.']]
};
for(const [kind,n,tr,dv]of[['employee',112,96,8],['department',20,16,2],['payroll',16,14,1],['ranking',12,10,1]])for(let i=0;i<n;i++){
 const split=i<tr?'train':i<tr+dv?'dev':'internalTest';
 add('context_entity_scope_contrasts',split,'context:'+kind+':'+split+':meaning'+i,l=>{
  let p,q,x;
  if(kind==='employee'){
   const id=i%2===1,field=id?'employeeNumber':'personName';p=empty('employeeFile',{reportType:i%3===0?'employeeFile':'payroll',[field]:id?'<EMPLOYEE_ID_1>':'<EMPLOYEE_NAME_1>',...timing(i,l,true).fields});q={...p,[field]:id?'<EMPLOYEE_ID_2>':'<EMPLOYEE_NAME_2>'};
   x=['employee ','الموظف ','الموظف ','employee '][l]+q[field];
   const t=timing(i+1,l);q={...q,period:null,month:null,year:null,...t.fields};x+=[' for ',' عن ',' عن ',' عن '][l]+t.text;
  }else if(kind==='department'){p=empty('orgAttendance',{department:'<DEPARTMENT_1>',...timing(i,l).fields});const t=timing(i+1,l);q={...p,department:'<DEPARTMENT_2>',period:null,month:null,year:null,...t.fields};x=['department ','القسم ','القسم ','department '][l]+q.department+[' for ',' عن ',' عن ',' عن '][l]+t.text;
  }else if(kind==='payroll'){const topic=Object.keys(topics)[i%11];p=empty('payrollInsights',{payrollTopic:Object.keys(topics)[(i+1)%11],...timing(i,l,true).fields});q={...p,payrollTopic:topic};x=['the company payroll topic of ','موضوع رواتب الشركة المتعلق بـ','موضوع رواتب الشركة بخصوص ','company payroll topic بخصوص '][l]+topics[topic][l];
  }else{const rank=Object.keys(ranks)[i%3];p=empty('attendanceRanking',{rankBy:Object.keys(ranks)[(i+1)%3],...timing(i,l).fields});const t=timing(i+1,l);q={...p,rankBy:rank,period:null,month:null,year:null,...t.fields};x=['ranking by ','الترتيب وفق ','الترتيب حسب ','ranking حسب '][l]+ranks[rank][l]+[' for ',' عن ',' عن ',' عن '][l]+t.text;}
  const fi=split==='train'?Math.floor(i/4)%8:0;
  return{text:replace(contextFrames[split][fi][l],{x}),plan:q,previous:p,role:i%2?'hr':'admin'};
 });
}
if(family!==2000||result.length!==8000)throw Error('WRONG_COUNTS');
// Stable row shuffle, not a row-wise split. Splits were assigned to families above.
let state=42;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/2**32;};
for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
export const build=()=>structuredClone(result);
if(process.argv.includes('--write')){
 globalThis.fetch=()=>{throw Error('GENERATION_NETWORK_DENIED');};
 const root=path.resolve(dir,'../../../../../..'),checks=[];
 for(const p of ['server/.env','server/src/copilot/data/hr_agent_intents_10000.jsonl','docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl','docs/fine-tuning/controlled-assets/remediation-v1.1/runtime-reference-v1.1.jsonl','docs/fine-tuning/controlled-assets/remediation-v1.1/model-selection-v1.1.jsonl']){
  let denied=false;try{fs.readFileSync(path.join(root,p));}catch(e){denied=e.code==='ERR_ACCESS_DENIED';}if(!denied)throw Error('GENERATION_INPUT_NOT_DENIED');checks.push({path:p,readDenied:true});
 }
 const bytes=Buffer.from(result.map(r=>JSON.stringify(r)).join('\n')+'\n');
 fs.writeFileSync(path.resolve(dir,'../candidate/dataset.jsonl'),bytes,{flag:'wx'});
 fs.writeFileSync(path.resolve(dir,'../candidate/generation-result.json'),JSON.stringify({generatedAt:new Date().toISOString(),rows:result.length,families:family,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),prohibitedInputCanaries:checks,modelCalls:0,trainingStarted:false},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({rows:8000,families:2000,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),protectedInputsRead:0,modelCalls:0,trainingStarted:false}));
}
