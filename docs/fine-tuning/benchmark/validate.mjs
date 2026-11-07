// FROZEN EVALUATION DATA — DO NOT USE FOR TRAINING.
// Static dataset validation only. Does not import/execute an application module,
// call a resolver/provider, authenticate, query a database or generate audio.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { z } from 'zod'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory,'../../..')
const read = relative => readFileSync(path.join(root,relative),'utf8')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const PIN = 'cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47'
function ast(relative) { return ts.createSourceFile(relative,read(relative),ts.ScriptTarget.Latest,true) }
function initializer(relative,name) {
  const source = ast(relative); let value
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) value = node.initializer
    ts.forEachChild(node,visit)
  }
  visit(source)
  assert.ok(value, `Missing frozen declaration ${name}`)
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression
  return {source,value}
}
function enumValues(relative,name) {
  const {value} = initializer(relative,name)
  const array=ts.isArrayLiteralExpression(value) ? value : ts.isCallExpression(value) ? value.arguments[0] : null
  assert.ok(array && ts.isArrayLiteralExpression(array),`Expected literal enum/array: ${name}`)
  return array.elements.map(element => { assert.ok(ts.isStringLiteral(element)); return element.text })
}
function object(relative,name) {
  const result = initializer(relative,name)
  assert.ok(ts.isObjectLiteralExpression(result.value))
  return result.value.properties.map(p=>{ assert.ok(ts.isPropertyAssignment(p)); return [p.name.getText(result.source).replace(/^['"]|['"]$/g,''),p.initializer] })
}
const intents = enumValues('shared/src/copilot.ts','copilotIntentSchema')
const actions = enumValues('shared/src/actions.ts','copilotActionSchema')
assert.equal(intents.length,32); assert.equal(actions.length,48)
const intentRoles = Object.fromEntries(object('server/src/copilot/intents.ts','INTENT_ROLES').map(([key,value])=>{
  assert.ok(ts.isArrayLiteralExpression(value)); return [key,value.elements.map(v=>v.text)]
}))
const capabilities = Object.fromEntries(object('server/src/permissions.ts','CAPABILITIES').map(([key,value])=>{
  assert.ok(ts.isObjectLiteralExpression(value)); const p=value.properties.find(v=>v.name?.getText()==='roles')
  assert.ok(p && ts.isPropertyAssignment(p) && ts.isArrayLiteralExpression(p.initializer))
  return [key,p.initializer.elements.map(v=>v.text)]
}))
const actionRoles = Object.fromEntries(object('server/src/copilot/actions.ts','ACTION_CAPABILITY').map(([key,value])=>
  [key,value.kind===ts.SyntaxKind.NullKeyword ? ['employee','manager','hr','admin'] : capabilities[value.text]]))
const periods = enumValues('shared/src/copilot.ts','copilotPeriodSchema')
const reports = enumValues('shared/src/reports.ts','reportTypeSchema')
const topics = enumValues('shared/src/copilot.ts','payrollTopicSchema')
const pages = enumValues('shared/src/navigation.ts','navigationPageIdSchema')
const planFields = ['period','month','year','department','personName','employeeNumber','rankBy','payrollTopic','reportType','refusalReason']
const actionFields = ['leaveKind','startDate','endDate','documentKind','text','title','personName','employeeNumber','decision','stage','role','email','location','employmentType','language','screen','scrollTarget','amount','opensAt','durationMinutes','questionNumber','payrollAdjustmentKind','employeeNumberNew','jobTitle','department','jobDescriptionSection']
const fields = new Set([...planFields,...actionFields])
const allowedNames = new Set(['Testara Veld','نيراف تجريبي','سيروان الاختباري','Zelvyn Testson','Testara',
  'Testara Veld-Example','نيراف ابن تجريبي','سيروان آل اختبار',"Zelvyn O'Test"])
const enumSlots = {
  period:periods, reportType:reports,payrollTopic:topics,rankBy:['present','absent','late'],
  refusalReason:['notHrData','notPermitted','unclear'],leaveKind:['annual','sick','unpaid'],documentKind:['certificate','detailsUpdate'],
  decision:['approve','reject'],stage:['new','underReview','shortlisted','interview','offer','hired','rejected'],
  role:['employee','manager','hr','admin'],employmentType:['fullTime','partTime','contract','internship'],
  language:['en','ar'],scrollTarget:['up','down','top','bottom'],payrollAdjustmentKind:['overtime','bonus','allowance','deduction'],
  jobDescriptionSection:enumValues('shared/src/jobDescriptions.ts','JOB_DESCRIPTION_SECTIONS'),
}
const schema = z.object({
  id:z.string().regex(/^BENCH-\d{4}$/),version:z.literal('pre-finetuning-benchmark-v1'),family:z.string().min(1),
  language:z.enum(['en','ar-MSA','ar-JO','mixed']),category:z.enum(['intent','action','safety']),input:z.string().trim().min(2).max(500),
  actor_role:z.enum(['employee','manager','hr','admin']),context:z.object({current_page:z.string(),previous_plan:z.record(z.string(),z.unknown()).nullable(),pending_task:z.null()}),
  reference_date:z.literal('2026-10-22'),timezone:z.literal('Asia/Riyadh'),synthetic_data:z.literal(true),
  evaluation_layer:z.enum(['question','action','conversation','local_boundary','service_boundary','capability']),
  expected_intent:z.enum(intents).nullable(),expected_action:z.enum(actions).nullable(),
  expected_entities:z.record(z.string(),z.union([z.string(),z.number().int(),z.null()])),
  expected_scope:z.enum(['self','direct_reports','company','department','named_employee','named_applicant','knowledge','system','none']),
  expected_behavior:z.enum(['read','propose_action','ui_effect','notification_metadata','clarify','permission_denied','unsupported','out_of_scope','abstain','no_action','no_data','greeting','help','knowledge']),
  requires_clarification:z.boolean(),clarification_fields:z.array(z.string()),requires_confirmation:z.boolean(),
  permission_sensitive:z.boolean(),voice_style:z.boolean(),negative:z.boolean(),fixture:z.string().min(1),
  forbidden_effects:z.array(z.enum(['unauthorized_read','unconfirmed_protected_write','invented_employee_id'])),
  requested_capability:z.union([z.enum(intents),z.enum(actions)]).nullable(),expected_ui_page:z.enum(pages).nullable(),notes:z.string().nullable(),
}).strict()

export function normalize(text) {
  return text.normalize('NFKD').toLowerCase().replace(/[\u064b-\u065f\u0670]/gu,'')
    .replace(/[أإآٱ]/gu,'ا').replace(/ى/gu,'ي').replace(/ة/gu,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}
const oldTexts = new Set()
for (const line of read('server/src/copilot/data/hr_agent_intents_10000.jsonl').split(/\r?\n/).filter(Boolean)) oldTexts.add(normalize(JSON.parse(line).text))
const literalSources = ['server/src/copilot/phrasebook.ts','server/src/copilot/training.ts','server/src/copilot/corpus.ts',
  'server/src/copilot/conversationTraining.ts','server/src/copilot/benchmark/cases.ts','server/src/voice/evaluation.fixtures.ts']
for (const relative of literalSources) {
  const source=ast(relative)
  function visit(node) { if ((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&node.text.length>=8) oldTexts.add(normalize(node.text)); ts.forEachChild(node,visit) }
  visit(source)
}
export function verifyBaseline() {
  const bytes=readFileSync(path.join(root,'docs/fine-tuning/pre-finetuning-file-hashes.sha256'))
  assert.equal(hash(bytes),PIN,'Frozen system manifest changed')
  const rows=bytes.toString('utf8').trimEnd().split('\n'); assert.equal(rows.length,381)
  for (const line of rows) { const [file,want]=line.split('\t'); assert.equal(hash(readFileSync(path.join(root,file))),want,`Frozen file changed: ${file}`) }
  return rows.length
}
function slots(record) {
  const e=record.expected_entities
  for (const [key,value] of Object.entries(e)) {
    assert.ok(fields.has(key),`${record.id}: unknown application field ${key}`)
    if (value===null) continue
    if (enumSlots[key]) assert.ok(enumSlots[key].includes(value),`${record.id}: invalid ${key}`)
    if (['month','year','durationMinutes','questionNumber'].includes(key)) assert.equal(typeof value,'number')
    else assert.equal(typeof value,'string',`${record.id}: string slot ${key}`)
    if (key==='month') assert.ok(value>=1&&value<=12)
    if (key==='year') assert.ok(value>=2000&&value<=2100)
    if (key==='questionNumber') assert.ok(value>=1&&value<=10)
    if (key==='durationMinutes') assert.ok(value>=15&&value<=240)
    if (key==='personName') assert.ok(allowedNames.has(value),'Unreviewed name; do not print its value')
    if (key==='email') assert.equal(value,'test.hire@example.invalid')
    if (['employeeNumber','employeeNumberNew'].includes(key)) assert.ok(['EMP-990001','EMP-990004'].includes(value))
    if (['startDate','endDate'].includes(key)) assert.match(value,/^2026-\d{2}-\d{2}$/)
    if (key==='opensAt') assert.equal(value,'2026-11-15T09:00:00+03:00')
    if (key==='amount') assert.ok(['75','1250'].includes(value),'Only declared fictional instruction amounts permitted')
  }
  if (e.period==='calendarMonth') assert.ok(e.month!=null)
  else assert.ok(e.month==null&&e.year==null)
  if (e.reportType==='payroll') assert.equal(record.expected_intent,'employeeFile')
  if (e.payrollTopic!=null) assert.equal(record.expected_intent,'payrollInsights')
  if (e.rankBy!=null) assert.equal(record.expected_intent,'attendanceRanking')
  if (e.refusalReason!=null) assert.equal(record.expected_intent,'outOfScope')
  if (!record.expected_action) for (const key of Object.keys(e)) assert.ok(planFields.includes(key),`${record.id}: action slot without action`)
  if (record.context.previous_plan) {
    const p=record.context.previous_plan
    assert.ok(intents.includes(p.intent)); assert.deepEqual(Object.keys(p).sort(),['intent',...planFields].sort())
    assert.equal(p.personName,null);assert.equal(p.employeeNumber,null)
  }
}
export function validateRows(rows) {
  assert.equal(rows.length,404,'Reviewed v1 size must remain 404')
  const ids=new Set(),inputs=new Set(),families=new Map()
  for (const raw of rows) {
    const record=schema.parse(raw)
    assert.ok(!ids.has(record.id),'Duplicate benchmark ID'); ids.add(record.id)
    const folded=normalize(record.input)
    assert.ok(!inputs.has(folded),`${record.id}: normalized duplicate input`); inputs.add(folded)
    assert.ok(!oldTexts.has(folded),`${record.id}: exact normalized overlap with existing language/fixture assets`)
    const ls=families.get(record.family)??new Set();assert.ok(!ls.has(record.language));ls.add(record.language);families.set(record.family,ls)
    slots(record)
    assert.equal(record.requires_clarification,record.expected_behavior==='clarify')
    assert.equal(record.requires_clarification,record.clarification_fields.length>0)
    if (record.requires_confirmation) assert.equal(record.expected_behavior,'propose_action')
    if (record.expected_behavior==='propose_action') assert.ok(record.requires_confirmation)
    if (record.expected_action) {
      assert.equal(record.expected_intent,'doAction')
      assert.ok(actionRoles[record.expected_action].includes(record.actor_role),'Action gold exceeds role permission')
    }
    if (record.expected_intent&&record.expected_intent!=='outOfScope') assert.ok(intentRoles[record.expected_intent].includes(record.actor_role))
    if (record.evaluation_layer==='local_boundary') { assert.equal(record.expected_intent,null);assert.equal(record.expected_behavior,'abstain') }
    if (record.expected_behavior==='unsupported') { assert.equal(record.evaluation_layer,'capability');assert.equal(record.expected_action,null) }
    if (record.expected_behavior==='permission_denied') {assert.equal(record.expected_intent,'outOfScope');assert.equal(record.expected_action,null);assert.equal(record.expected_entities.refusalReason,'notPermitted')}
    if (record.expected_behavior==='no_data') assert.equal(record.evaluation_layer,'service_boundary')
    const emails=record.input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)??[]
    assert.ok(emails.every(email=>email==='test.hire@example.invalid'),'Unreviewed email detected')
    assert.ok(!/\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/i.test(record.input),'Potential credential detected')
    assert.ok(!/\d{8,}/.test(record.input),'Potential phone/national/account identifier detected')
    const employeeIds=record.input.match(/EMP-[\w-]+/g)??[]
    assert.ok(employeeIds.every(id=>['EMP-990001','EMP-990004'].includes(id)),'Unreviewed employee ID detected')
    assert.ok(!/\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b/.test(record.input),'Potential IBAN detected')
    assert.ok(!/[\u00c0-\u00ff]{3,}/.test(record.input),'Potential mojibake')
    assert.ok(!record.input.includes('\ufffd'),'Replacement characters detected')
  }
  assert.equal(families.size,101);for(const languages of families.values()) assert.equal(languages.size,4)
  for (const period of periods) assert.ok(rows.some(r=>r.expected_entities.period===period),`Missing supported period ${period}`)
  for (const intent of intents) for (const language of ['en','ar-MSA','ar-JO','mixed']) assert.ok(rows.some(r=>r.expected_intent===intent&&r.language===language),`Missing intent/language ${intent}/${language}`)
  for (const action of actions) for (const language of ['en','ar-MSA','ar-JO','mixed']) assert.ok(rows.some(r=>r.expected_action===action&&r.language===language),`Missing action/language ${action}/${language}`)
  const count=predicate=>rows.filter(predicate).length
  return {pass:true,total:rows.length,languages:Object.fromEntries(['en','ar-MSA','ar-JO','mixed'].map(l=>[l,count(r=>r.language===l)])),
    intentCount:intents.length,actionCount:actions.length,
    byIntent:Object.fromEntries(intents.map(i=>[i,count(r=>r.expected_intent===i)])),
    byAction:Object.fromEntries(actions.map(a=>[a,count(r=>r.expected_action===a)])),
    byBehavior:Object.fromEntries([...new Set(rows.map(r=>r.expected_behavior))].sort().map(b=>[b,count(r=>r.expected_behavior===b)])),
    byLayer:Object.fromEntries([...new Set(rows.map(r=>r.evaluation_layer))].sort().map(b=>[b,count(r=>r.evaluation_layer===b)])),
    byRole:Object.fromEntries(['employee','manager','hr','admin'].map(role=>[role,count(r=>r.actor_role===role)])),
    safetyNegative:count(r=>r.negative),safetyCategory:count(r=>r.category==='safety'),outOfScope:count(r=>r.expected_behavior==='out_of_scope'),
    voiceStyle:count(r=>r.voice_style),clarification:count(r=>r.requires_clarification),confirmation:count(r=>r.requires_confirmation),
    rbacSensitive:count(r=>r.permission_sensitive),selfService:count(r=>r.expected_scope==='self'),
    namedEmployee:count(r=>r.expected_scope==='named_employee'),namedApplicant:count(r=>r.expected_scope==='named_applicant'),
    exactKnownTextOverlaps:0,normalizedDuplicates:0,obviousPiiScan:'PASS (synthetic allowlist; not a proof about arbitrary natural names)',
    productionCalls:0,benchmarkExecuted:false,fineTuningStarted:false}
}
function main() {
  const baselineFiles=verifyBaseline()
  const file=path.join(directory,'pre-finetuning-benchmark-v1.jsonl')
  const bytes=readFileSync(file)
  assert.ok(bytes.at(-1)===10&&!bytes.includes(Buffer.from('\r')),'Require UTF-8/LF with final newline')
  const rows=bytes.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line))
  const result=validateRows(rows)
  let selfTests=0
  if (process.argv.includes('--self-test')) {
    const mutate=fn=>{const copy=structuredClone(rows);fn(copy);assert.throws(()=>validateRows(copy));selfTests++}
    mutate(r=>{r[1].id=r[0].id});mutate(r=>{r[1].input=r[0].input});mutate(r=>{r[0].expected_intent='inventedIntent'})
    mutate(r=>{r[0].expected_action='inventedAction'});mutate(r=>{delete r[0].expected_scope})
    mutate(r=>{r[0].input+=' Contact somebody@private-company.com'});mutate(r=>{r[0].input+=' 1234567890'})
    mutate(r=>{r[0].expected_entities.period='previous_month'});mutate(r=>{r[0].expected_entities.employeeNumber='EMP-1234'})
    mutate(r=>{r[0].synthetic_data=false});mutate(r=>{r[0].input='Show me my leave balance'})
  }
  const digest=hash(bytes)
  for (const name of ['README.md','benchmark-coverage.md']) {
    if (existsSync(path.join(directory,name))) assert.ok(readFileSync(path.join(directory,name),'utf8').includes(digest),`${name}: frozen digest not recorded`)
  }
  console.log(JSON.stringify({...result,baselineFilesVerified:baselineFiles,sha256:digest,validatorNegativeSelfTests:selfTests},null,2))
}
if (process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) main()
