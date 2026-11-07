import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {langs,subjects,topicText,reportText,rankText,periodText,monthNames,inquiryFrames} from './language.mjs';
import {operationText,operationFrames} from './operations.mjs';
import {vague,restricted,outside,boundaryFrames,openers,helloFrames} from './boundaries.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(here,'..'),prep=path.resolve(base,'..');
const contract=JSON.parse(fs.readFileSync(path.join(prep,'current-contract-catalog.json'),'utf8'));
const blank=(intent,fields={})=>({...Object.fromEntries(contract.questionFields.map(k=>[k,null])),intent,...fields});
const mainIntents=contract.intents.filter(i=>!['doAction','greeting','outOfScope'].includes(i));
if(mainIntents.length!==29||!contract.actions.every(a=>operationText[a]))throw Error('V2_CONTRACT_COVERAGE');
const substitute=(s,o)=>s.replace(/\{(\w+)\}/g,(_,k)=>{if(!(k in o))throw Error('UNFILLED_SLOT');return o[k];});
const withTime=new Set(['myAttendance','teamAttendance','teamOnLeave','departmentAbsenceComparison','orgAttendance','orgLeaveSummary','attendanceRanking','generateReport','myReport','employeeFile']);
const monthly=new Set(['payrollInsights','payrollReadiness','payrollRunSummary']);
function time(n,l,monthOnly=false){
 if(n%4===0){const k=Math.floor(n/4),m=k%12+1,y=k%2===0?2029+k%3:null;const digits=v=>l===1&&n%16===0?String(v).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[+d]):String(v);
  const label=n%8===0?['calendar month '+digits(m),'الشهر التقويمي '+digits(m),'الشهر رقم '+digits(m),'calendar month '+digits(m)][l]:monthNames[m-1][l];
  return{plan:{period:'calendarMonth',month:m,year:y},words:['for ','عن ','عن ','عن '][l]+label+(y===null?'':[' of ',' لسنة ',' لسنة ',' لسنة '][l]+digits(y))};}
 const list=monthOnly?['thisMonth','lastMonth']:Object.keys(periodText),j=(Math.floor(n/4)*3+n%4-1)%list.length,p=list[j];return{plan:{period:p},words:periodText[p][l]};
}
const scope=p=>p.intent.startsWith('my')?'self':p.intent.startsWith('team')?'direct_reports':p.intent==='employeeFile'?'named_employee':p.intent==='outOfScope'?'none':['doAction','greeting','howDoI'].includes(p.intent)?'system':p.department?'department':'company';
function chooseRole(p,n){let a=contract.roles.filter(r=>p.intent==='outOfScope'||contract.allowedIntents[r].includes(p.intent));if(p.intent==='employeeFile'&&p.reportType==='payroll')a=a.filter(r=>r==='hr'||r==='admin');return a[n%a.length];}
const all=[];let serial=0;
function family(pool,split,construction,languageRecord){const f=++serial,id='QLORA2-F'+String(f).padStart(4,'0');
 for(let l=0;l<4;l++){
  const item=languageRecord(l),number={train:4100000,dev:5100000,internalTest:6100000}[split]+f*10;
  const symbols=s=>s.replace(/<([A-Z][A-Z_]*?)_(\d+)>/g,(_,type,n)=>'<'+type+'_'+(number+Number(n))+'>');
  const transform=x=>typeof x==='string'?symbols(x):Array.isArray(x)?x.map(transform):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,transform(v)])):x;
  const text=symbols(item.text),p=transform(item.plan),previous=transform(item.previous??null),spans=[...text.matchAll(/<([A-Z][A-Z_]*?)_\d+>/g)].map(m=>({type:m[1],value:m[0],start:m.index,end:m.index+m[0].length,offsetUnit:'UTF-16'}));
  all.push({schemaVersion:'HR-QLORA-DATASET-1',recordId:id+'-'+langs[l],task:'question_plan',split,language:langs[l],synthetic:true,
   lineage:{familyId:id,translationGroup:id,episodeId:id,constructionGroup:construction,syntaxPartition:split,entityPool:split},pool,
   input:{question:text,trustedRole:item.role??chooseRole(p,f),previousPlan:previous,referenceDate:'2027-06-15'},expected:{plan:p},
   annotations:{scope:scope(p),ownership:scope(p),entitySpans:spans,actionCategory:item.action??null,clarification:p.refusalReason==='unclear'?'required':'not_required',actionConfirmation:p.intent==='doAction'?'server_owned':'not_applicable',parameterSources:Object.fromEntries(Object.entries(p).filter(([k,v])=>k!=='intent'&&v!==null).map(([k,v])=>[k,previous&&previous[k]===v&&!text.includes(String(v))?'previous_plan':'explicit_or_semantic'])),executionPermitted:false,modelEligibility:'classifier_supervision'},
   provenance:{creator:'Codex independently authored v2',generation:'fresh approved-contract composition',source:'new v2 linguistic rules only',humanReviewPerformed:false,placeholderOnly:true}});
 }
}
for(const intent of mainIntents)for(let i=0;i<40;i++){
 const split=i<32?'train':i<36?'dev':'internalTest',frame=i<32?Math.floor(i/4):i%4;
 family('substantive_intents',split,'v2-core:'+intent+':'+split+frame+':variant'+i%4,l=>{
  let p=blank(intent),values={};
  if(intent==='payrollInsights'){p.payrollTopic=Object.keys(topicText)[i%11];values.topic=topicText[p.payrollTopic][l];}
  if(intent==='attendanceRanking'){p.rankBy=Object.keys(rankText)[i%3];values.rank=rankText[p.rankBy][l];}
  if(intent==='departmentAbsenceComparison')p.reportType='department';
  if(intent==='generateReport'){p.reportType=Object.keys(reportText)[i%6];values.report=reportText[p.reportType][l];}
  if(intent==='myReport'){p.reportType=i%2?'attendance':'leave';values.selfReport=reportText[p.reportType][l];}
  if(['orgAttendance','departmentBreakdown'].includes(intent)){p.department='<DEPARTMENT_1>';values.department=p.department;}
  if(intent==='employeeFile'){
   const field=i%2?'personName':'employeeNumber';p[field]=i%2?'<EMPLOYEE_NAME_1>':'<EMPLOYEE_ID_1>';values.person=p[field];
   const view=[['the complete personnel dossier','وثيقة الملف الوظيفي الكاملة','وثيقة الملف الوظيفي الكاملة','وثيقة personnel dossier الكاملة'],['the recorded additional-hours remuneration','الأجور المسجلة لساعات العمل الإضافية','الأجور المسجلة لساعات الشغل الإضافية','recorded overtime remuneration'],['the salary statements and pay information','بيانات الراتب ومعلومات الأجر','بيانات الراتب ومعلومات الأجر','salary statements ومعلومات الأجر'],['the stored employee-profile particulars','البيانات المحفوظة بالملف الوظيفي','البيانات المحفوظة بالملف الوظيفي','stored employee-profile particulars']][i%4];values.employeeView=view[l];p.reportType=i%4===0?'employeeFile':i%4===3?null:'payroll';
  }
  let noun=substitute(subjects[intent][i%subjects[intent].length][l],values);
  if(withTime.has(intent)||monthly.has(intent)){const t=time(i+mainIntents.indexOf(intent)*5,l,monthly.has(intent));p={...p,...t.plan};noun+=' '+t.words;}
  return{text:substitute(inquiryFrames[split][frame][l],{x:noun}),plan:p};
 });
}
for(const action of contract.actions)for(let i=0;i<8;i++){
 const split=i<6?'train':i===6?'dev':'internalTest',roles=contract.roles.filter(r=>contract.allowedActions[r].includes(action));
 family('action_boundaries',split,'v2-action:'+action+':'+split+(i<6?i:0),l=>({text:substitute(operationFrames[split][i<6?i:0][l],{x:operationText[action][l]}),plan:blank('doAction'),action,role:roles[i%roles.length]}));
}
for(const[reason,count,nouns,trainCount,devCount]of[['unclear',96,vague,80,8],['notPermitted',96,restricted,80,8],['notHrData',64,outside,56,4]])for(let i=0;i<count;i++){
 const split=i<trainCount?'train':i<trainCount+devCount?'dev':'internalTest',frame=split==='train'?Math.floor(i/nouns.length):0,meaning=i%nouns.length;
 family('refusal_abstention',split,'v2-boundary:'+reason+':'+split+frame+':meaning'+meaning,l=>{
  const text=substitute(boundaryFrames[split][frame][l],{x:nouns[meaning][l]}),p=blank('outOfScope',{refusalReason:reason});
  if(reason==='notPermitted'){if(text.includes('<EMPLOYEE_NAME_1>'))p.personName='<EMPLOYEE_NAME_1>';if(text.includes('<EMPLOYEE_ID_1>'))p.employeeNumber='<EMPLOYEE_ID_1>';}
  return{text,plan:p,role:reason==='notPermitted'?'employee':contract.roles[i%4]};
 });
}
for(let i=0;i<40;i++){
 const split=i<32?'train':i<36?'dev':'internalTest',frame=i<32?Math.floor(i/8):0;
 family('greeting',split,'v2-hello:'+split+frame+':opening'+i%8,l=>({text:substitute(helloFrames[split][frame][l],{x:openers[i%8][l]}),plan:blank('greeting')}));
}
const continuation={
train:[['Apply one correction to my preceding enquiry: {x}.','طبّق تصحيحاً واحداً على استفساري السابق: {x}.','طبّق تصحيح واحد على استفساري السابق: {x}.','طبّق correction واحد على enquiry السابق: {x}.'],['I want the last HR question kept, with the replacement {x}.','أريد الإبقاء على السؤال الوظيفي الأخير مع البديل {x}.','بدي أخلي السؤال الوظيفي الأخير مع البديل {x}.','بدي أخلي آخر HR question مع replacement {x}.'],['Continue from the previous enquiry and now refer to {x}.','تابع انطلاقاً من الاستفسار السابق واجعله الآن عن {x}.','تابع من الاستفسار السابق وخليه هسا عن {x}.','تابع من previous enquiry وخليه هسا عن {x}.'],['Use the earlier context but revise its relevant value to {x}.','استخدم السياق السابق مع تعديل القيمة ذات الصلة إلى {x}.','استخدم السياق السابق وعدّل القيمة المقصودة إلى {x}.','استخدم previous context وعدّل القيمة المقصودة إلى {x}.'],['The subject of my earlier request remains; the substitution is {x}.','يبقى موضوع طلبي السابق كما هو، والاستبدال هو {x}.','موضوع طلبي السابق بضل زي ما هو، والاستبدال هو {x}.','موضوع previous request بضل زي ما هو، والـ substitution هو {x}.'],['Make this adjustment to the question we just discussed: {x}.','أجر هذا التعديل على السؤال الذي ناقشناه: {x}.','اعمل هالتعديل على السؤال اللي حكينا عنه: {x}.','اعمل هالـ adjustment على السؤال اللي حكينا عنه: {x}.'],['Regarding the preceding HR question, please substitute {x}.','بشأن السؤال الوظيفي السابق، استخدم البديل {x}.','بالنسبة للسؤال الوظيفي السابق، استخدم البديل {x}.','بالنسبة للـ preceding HR question، استخدم البديل {x}.'],['I am continuing that same enquiry with this changed detail: {x}.','أتابع الاستفسار نفسه مع تغيير هذه الجزئية: {x}.','بكمل نفس الاستفسار مع تغيير هالتفصيل: {x}.','بكمل نفس enquiry مع هالـ changed detail: {x}.']],
dev:[['Please interpret this as a follow-up to the preceding HR question, changing it to {x}.','يرجى فهم هذا بوصفه متابعة للسؤال الوظيفي السابق مع تغييره إلى {x}.','اعتبر هاد متابعة للسؤال الوظيفي السابق مع تغييره إلى {x}.','اعتبر هاد follow-up للسؤال الوظيفي السابق مع تغييره إلى {x}.']],
internalTest:[['There is no new HR subject in this follow-up; replace the corresponding part with {x}.','لا يوجد موضوع وظيفي جديد في هذه المتابعة؛ استبدل الجزء المقابل بـ{x}.','ما في موضوع وظيفي جديد بهالمتابعة؛ بدّل الجزء المقصود بـ{x}.','ما في new HR subject بهالـ follow-up؛ بدّل الجزء المقصود بـ{x}.']]
};
for(const[kind,n,tr,dv]of[['employee',112,96,8],['department',20,16,2],['payroll',16,14,1],['ranking',12,10,1]])for(let i=0;i<n;i++){
 const split=i<tr?'train':i<tr+dv?'dev':'internalTest';
 family('context_entity_scope_contrasts',split,'v2-context:'+kind+':'+split+':case'+i,l=>{
  let previous,p,value;
  if(kind==='employee'){
   const field=i%2?'personName':'employeeNumber',old=i%2?'<EMPLOYEE_NAME_1>':'<EMPLOYEE_ID_1>',fresh=i%2?'<EMPLOYEE_NAME_2>':'<EMPLOYEE_ID_2>';
   previous=blank('employeeFile',{reportType:i%5===0?'employeeFile':'payroll',[field]:old,...time(i+3,l).plan});
   const nextPeriod=Object.keys(periodText)[Math.floor(i/2)%6],tm={plan:{period:nextPeriod},words:periodText[nextPeriod][l]};p={...previous,[field]:fresh,period:null,month:null,year:null,...tm.plan};
   value=['employee '+fresh+' instead of '+old+', '+tm.words,'الموظف '+fresh+' بدلاً من '+old+'، '+tm.words,'الموظف '+fresh+' بدل '+old+'، '+tm.words,'employee '+fresh+' بدل '+old+'، '+tm.words][l];
  }else if(kind==='department'){
   previous=blank('orgAttendance',{department:'<DEPARTMENT_1>',...time(i+9,l).plan});const tm=time(i+2,l);p={...previous,department:'<DEPARTMENT_2>',period:null,month:null,year:null,...tm.plan};
   value=['department <DEPARTMENT_2> rather than <DEPARTMENT_1>, '+tm.words,'القسم <DEPARTMENT_2> بدلاً من <DEPARTMENT_1>، '+tm.words,'القسم <DEPARTMENT_2> بدل <DEPARTMENT_1>، '+tm.words,'department <DEPARTMENT_2> بدل <DEPARTMENT_1>، '+tm.words][l];
  }else if(kind==='payroll'){
   const topic=Object.keys(topicText)[i%11];previous=blank('payrollInsights',{payrollTopic:Object.keys(topicText)[(i+2)%11],...time(i+5,l,true).plan});p={...previous,payrollTopic:topic};value=['the company Payroll Agent analytic for ','تحليل وكيل رواتب الشركة الخاص بـ','تحليل وكيل رواتب الشركة الخاص بـ','company Payroll Agent analytic الخاص بـ'][l]+topicText[topic][l];
  }else{
   const r=Object.keys(rankText)[i%3];previous=blank('attendanceRanking',{rankBy:Object.keys(rankText)[(i+1)%3],...time(i+8,l).plan});const tm=time(i+1,l);p={...previous,rankBy:r,period:null,month:null,year:null,...tm.plan};value=['the ranking criterion of ','معيار الترتيب وفق ','معيار الترتيب حسب ','ranking criterion حسب '][l]+rankText[r][l]+', '+tm.words;
  }
  return{text:substitute(continuation[split][split==='train'?(kind==='employee'?Math.floor(i/12):Math.floor(i/4)%8):0][l],{x:value}),plan:p,previous,role:i%2?'hr':'admin'};
 });
}
if(serial!==2000||all.length!==8000)throw Error('V2_SIZE_FAILURE');
let randomState=1601;function random(){randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;}
for(let i=all.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
export const build=()=>structuredClone(all);
if(process.argv.includes('--write')){
 globalThis.fetch=()=>{throw Error('V2_NETWORK_DENIED');};
 const root=path.resolve(base,'../../../../..'),denied=[];
 for(const p of ['server/.env','server/src/copilot/data/hr_agent_intents_10000.jsonl','docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl','docs/fine-tuning/controlled-assets/remediation-v1.1/runtime-reference-v1.1.jsonl','docs/fine-tuning/controlled-assets/remediation-v1.1/model-selection-v1.1.jsonl','docs/fine-tuning/training/qlora/dataset-v1/candidate/dataset.jsonl']){let ok=false;try{fs.readFileSync(path.join(root,p));}catch(e){ok=e.code==='ERR_ACCESS_DENIED';}if(!ok)throw Error('V2_DENIED_INPUT_ACCESSIBLE');denied.push({path:p,readDenied:true});}
 const bytes=Buffer.from(all.map(x=>JSON.stringify(x)).join('\n')+'\n'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(base,'candidate/dataset.jsonl'),bytes,{flag:'wx'});
 fs.writeFileSync(path.join(base,'candidate/generation-result.json'),JSON.stringify({release:'dataset-v2',createdAt:new Date().toISOString(),rows:8000,families:2000,sha256:sha,seed:1601,deniedInputs:denied,protectedInputsRead:0,modelCalls:0,trainingStarted:false},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({rows:8000,families:2000,sha256:sha,protectedInputsRead:0,trainingStarted:false}));
}
