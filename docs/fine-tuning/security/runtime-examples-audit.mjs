// Offline, read-only Phase 1C.1 audit. Never imports application startup/env/DB.
// All output is aggregate metadata, allowlisted labels, safe row IDs or masked text.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DATASET = 'server/src/copilot/data/hr_agent_intents_10000.jsonl'
// The separately verified file digest is checked below (no manifest rewrite).
const DATASET_HASH = '1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = rel => fs.readFileSync(path.join(ROOT, rel))
globalThis.fetch = async () => { throw new Error('AUDIT_NETWORK_DISABLED') }

// Copied verbatim in behavior from training.ts:136-148, without importing it.
export const normalize = text => text.toLocaleLowerCase().normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g, '').replace(/[\u0625\u0623\u0622\u0671]/g, '\u0627')
  .replace(/\u0649/g, '\u064a').replace(/\u0629/g, '\u0647').replace(/\u0645\u0648\u0636\u0641/g, '\u0645\u0648\u0638\u0641')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const digits = text => text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) % 16))
const patterns = {
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  employee_id: /\b(?:EMP|employee|staff|personnel)[-_ #]*\d+\b|(?:رقم\s+(?:الموظف|موظف))\s*[:#]?\s*\d+/i,
  national_id: /\b(?:national|civil|identity|ID)\s*(?:number|no\.?|#)?\s*[:=#]?\s*[A-Z0-9-]{6,}|(?:رقم\s+(?:وطني|الهوية)|الرقم\s+الوطني)\s*[:#]?\s*[A-Z0-9-]{6,}/i,
  passport: /\bpassport\s*(?:number|no\.?|#)?\s*[:=#]?\s*[A-Z0-9]{5,}|(?:جواز\s*(?:السفر)?)\s*[:#]?\s*[A-Z0-9]{5,}/i,
  phone: /(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){8,15}/,
  iban: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/i,
  bank_account: /(?:\b(?:bank|account|routing|IBAN)\s*(?:number|no\.?|#)?|(?:رقم\s+)?(?:الحساب|حساب\s+بنكي))\s*[:=#]?\s*[A-Z0-9][A-Z0-9 -]{5,}/i,
  uuid: /\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b/i,
  connection_string: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|mssql):\/\/\S+|\b(?:Server|Host|Data Source)\s*=\s*\S+\s*;\s*(?:Database|Port|User)/i,
  api_key: /\b(?:sk[-_](?:proj[-_])?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,})\b|\bapi[_ -]?key\s*[:=]\s*\S+/i,
  token: /\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:access|refresh|session)[_-]?token\s*[:=]\s*\S+/i,
  password: /\b(?:password|passwd|pwd|secret)\s*[:=]\s*\S+|(?:كلمة\s+(?:المرور|السر))\s*[:=]\s*\S+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  credential_topic: /\b(?:password|passwd|credential|secret|token|api\s*key)\b|كلمة\s+(?:المرور|السر)|مفتاح\s*(?:الواجهة|الوصول)/i,
  url: /\b(?:https?|ftp|wss?):\/\/[^\s<>]+|\bwww\.[\w.-]+/i,
  internal_host_ip_path: /\b(?:localhost|[\w.-]+\.(?:internal|local|corp|lan))(?::\d+)?\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[A-Z]:\\[^\s]+|\/(?:home|srv|var|etc)\//i,
  concrete_money: /(?:\b(?:salary|pay|wage|compensation|bonus|deduction|amount)\b|راتب|مبلغ|علاوة|مكافأة|خصم)[^\d\n]{0,24}\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:JOD|JD|USD|dollars?|dinars?|دينار|دنانير)\b|[$€£]\s*\d+/i,
  spelled_money_fact: /\b(?:salary|pay|wage)\s+(?:is|was|equals)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|a)\s+(?:hundred|thousand)|راتب(?:ه|ها)?\s+(?:الف|ألف|الفين|ألفين|مئة|مائة)\b/i,
  address: /\b\d+\s+[\p{L} -]+\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?)\b|(?:address|عنوان|شارع)\s*[:=]\s*\S+/iu,
  medical_detail: /\b(?:diagnos\w*|disease|cancer|diabet\w*|pregnan\w*|HIV|prescription|medication)\b|تشخيص|سرطان|سكري|مرض\s+مزمن|حامل|دواء/i,
  health_topic: /\b(?:medical|sick|illness|health)\b|مرضي|مرضية|طبي|صحي/i,
  attendance_fact: /\b(?:checked\s+(?:in|out)|clocked\s+(?:in|out)|was\s+(?:absent|late|present)|worked\s+\d+)\b|(?:حضر|تغيب|تغيّب|تأخر|داوم)\s+[^؟?]*\d+/i,
  leave_fact: /\b(?:leave\s+(?:balance|remaining)\s*(?:is|=|:)\s*\d+|(?:took|used|approved)\s+\d+\s+(?:days?|hours?)\s+(?:of\s+)?leave)\b|رصيد[^\n]{0,15}(?:=|:)\s*\d+/i,
  disciplinary_detail: /\b(?:disciplin\w*|misconduct|warning\s+(?:letter|issued)|terminated\s+for|dismissed\s+for)\b|تأديب|تاديب|عقوبة|انذار|إنذار|مخالفة/i,
  calendar_date: /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/,
  long_opaque_value: /\b[A-Za-z0-9+/=_-]{32,}\b/,
}

// Candidate detectors only. Neither a positive nor a negative proves a real identity.
const genericNameWords = new Set(normalize('employee employees profile information details payroll salary balance attendance report request leave please show display get view find search open the me my his her this that last month today team company manager HR Employee الجديد الجديدة الموظف الموظفة موظف موظفة بيانات معلومات ملف طلب اجازة إجازة قسم رواتب راتب رصيد').split(' '))
// Audit-only review vocabulary. These are functional words, never employee names.
const reviewedFunctionalWords = new Set(normalize('الموظف الموظفة الموظفين الموظفات الجديد الجديدة بيانات معلومات ملف شخص حساب حسابات راتب الرواتب رصيد الإجازات اجازاتي إجازة طلب طلبات قسم تقرير تقارير قائمة جديد موظف موظفة بدي هذا هذه تبع تبعي آخر الشهر التالي الخاصة الخاص الحالي حالي الحالية السابقة التفاصيل الشخص الشخصي الراتب ارجوك لو سمحت ممكن ابحث اعرض لي عن هلأ هلا هسا الان الآن بسرعة فورا فوراً فقط بالتفصيل عندي تبعي تبعه تبعتها الحالي هذي هاي بس بوضوح شوي كمان بليز للموظف الجديد please now quickly today current new personal salary payslip employee').split(' '))
export function personCandidates(text) {
  const result = []
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:[-'’][A-Za-z]+)*(?:\s+[A-Z][a-z]+(?:[-'’][A-Za-z]+)*){0,2})(?:['’]s|\s+(?:profile|details|information|salary))\b/g)) result.push(m[1])
  for (const m of text.matchAll(/\b(?:employee|for|named|called|of)\s+([A-Z][a-z]+(?:[-'’][A-Za-z]+)*(?:\s+[A-Z][a-z]+(?:[-'’][A-Za-z]+)*){0,2})\b/g)) result.push(m[1])
  for (const m of text.matchAll(/(?:الموظف(?:ة)?|للموظف(?:ة)?|موظف(?:ة)?|معلومات|بيانات|ملف|راتب)\s+([\u0621-\u064A]+(?:\s+[\u0621-\u064A]+){0,2})/g)) result.push(m[1])
  return [...new Set(result.map(v => normalize(v)).filter(v => v.split(' ').some(w => !genericNameWords.has(w))))]
}
const safeId = (row, index) => /^HR_\d{5}$/.test(row.id ?? '') ? row.id : `ROW_${index + 1}`
const values = value => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(values)
  : value && typeof value === 'object' ? Object.values(value).flatMap(values) : []
const counts = rows => {
  const result = {}; for (const row of rows) result[row] = (result[row] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([a],[b]) => a.localeCompare(b)))
}
function scan(rows) {
  const out = {}
  for (const [category, pattern] of Object.entries(patterns)) {
    const hits = rows.map((row,index) => ({row,index})).filter(({row}) => values(row).some(s => pattern.test(digits(s))))
    out[category] = { rows: hits.length, uniqueTexts: new Set(hits.map(x => x.row.text)).size,
      rowIds: hits.slice(0,30).map(x => safeId(x.row,x.index)), representation: hits.length ? `<${category.toUpperCase()}_CANDIDATE_REDACTED>` : null }
  }
  const persons = rows.map((row,index) => ({row,index,names:personCandidates(row.text)})).filter(x => x.names.length)
  out.person_name_candidate = {rows:persons.length,uniqueTexts:new Set(persons.map(x=>x.row.text)).size,
    uniqueCandidateSpans:new Set(persons.flatMap(x=>x.names)).size,rowIds:persons.slice(0,30).map(x=>safeId(x.row,x.index)),representation:persons.length?'<PERSON_CANDIDATE_REDACTED>':null}
  const residual=persons.filter(x=>x.names.some(n=>!n.split(' ').every(w=>reviewedFunctionalWords.has(w))))
  out.person_name_candidate.review={functionalOnlyRows:persons.length-residual.length,
    residualRows:residual.length,residualUniqueTexts:new Set(residual.map(x=>x.row.text)).size,
    residualUniqueSpans:new Set(residual.flatMap(x=>x.names).filter(n=>!n.split(' ').every(w=>reviewedFunctionalWords.has(w)))).size,
    residualRowIds:residual.slice(0,30).map(x=>safeId(x.row,x.index)),
    interpretation:'Broad lexical candidates, not confirmed names/identities; dictionary review cannot establish real-person provenance'}
  return out
}

// Read-only file discovery; never follows junctions. No env/token/key/log/backup contents.
const skipped = new Set(['node_modules','.git','.codex','.agents','.aws','.claude','.codex-snapshots','dist','build','.next','coverage','logs','log','tmp','temp','__pycache__','.venv','venv','.gradle'])
function inventory(directory = ROOT) {
  const result = []
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const file = path.join(directory,entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) { if (!skipped.has(entry.name) && !/backup|recovery|snapshot/i.test(entry.name)) result.push(...inventory(file)) }
    else if (entry.isFile() && !/^(?:\.env)(?:\.|$)/i.test(entry.name)
      && !/\.(?:token|key|pem|log|zip|wav|onnx|bin|exe|dll|apk|jar)$/i.test(entry.name)) result.push(path.relative(ROOT,file).replaceAll('\\','/'))
  }
  return result
}
const literalValues = (text, key) => [...text.matchAll(new RegExp(`\\b(?:${key})\\s*:\\s*(['"\x60])([^'"\x60\\r\\n]+)\\1`,'g'))].map(m=>m[2])
function containsSpan(haystack, needle) { return (` ${normalize(haystack)} `).includes(` ${normalize(needle)} `) }
function downloadMetadata() {
  let raw
  try{raw=read(DATASET+':Zone.Identifier').toString('utf8')}catch{return {available:false}}
  const fields=Object.fromEntries(raw.split(/\r?\n/).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i).trim(),s.slice(i+1).trim()]}))
  const urls={}
  for(const key of ['HostUrl','ReferrerUrl']) {
    if(!fields[key]){urls[key]={present:false};continue}
    try{const u=new URL(fields[key]);urls[key]={present:true,scheme:u.protocol,
      knownPublicHost:['chatgpt.com','chat.openai.com','files.oaiusercontent.com','oaiusercontent.com','github.com','raw.githubusercontent.com','huggingface.co'].includes(u.hostname)?u.hostname:'<OTHER_HOST_REDACTED>',
      pathRedacted:true,queryRedacted:!!u.search,hasCredentials:!!u.username||!!u.password}}
    catch{urls[key]={present:true,valueRedacted:true}}
  }
  return{available:true,zoneId:/^[0-4]$/.test(fields.ZoneId??'')?Number(fields.ZoneId):null,urls,
    interpretation:'Local editable download metadata; not a signature or proof of synthetic generation inputs'}
}

async function crossCheck(rows, files) {
  const seed = read('server/src/db/seed.ts').toString('utf8')
  const seedFields = {names:literalValues(seed,'en|ar'),emails:literalValues(seed,'email'),employeeIds:literalValues(seed,'employeeNumber')}
  const seedSummary = Object.fromEntries(Object.entries(seedFields).map(([category,items]) => {
    const hit=rows.filter(row=>items.some(item=>containsSpan(row.text,item)))
    return [category,{referenceValues:items.length,matchingRows:hit.length,rowIds:hit.slice(0,20).map((r,i)=>safeId(r,i))}]
  }))
  // Named literals in the documented demo seed are demo references, not evidence
  // of production provenance. The seed is parsed as text and NEVER executed.
  const textFiles = files.filter(p=> /\.(?:ts|tsx|mjs|js|json|jsonl|md|sql|csv|txt|yaml|yml)$/i.test(p)
    && !p.startsWith('docs/fine-tuning/') && !p.includes('/uploads/') && p!==DATASET && !p.endsWith('package-lock.json'))
  const rowTexts = [...new Set(rows.map(r=>r.text))]
  const groups = {}
  for (const file of textFiles) {
    const text = read(file).toString('utf8')
    const matches = rowTexts.filter(t=>text.includes(t))
    if (!matches.length) continue
    const group = /(?:check|test|benchmark|fixture|coverage|diagnostic|profile|validation|e2e)/i.test(file)?'tests_or_evaluation_artifacts'
      : /seed/i.test(file)?'demo_seed_source':'application_or_project_source'
    groups[group] ??= {files:0,exactUniqueRuntimeTexts:new Set()};groups[group].files++
    for (const match of matches) groups[group].exactUniqueRuntimeTexts.add(match)
  }
  const pdfFiles = files.filter(p=>p.startsWith('server/uploads/')&&p.endsWith('.pdf'))
  const documentSummary = {discovered:pdfFiles.length,extracted:0,unreadable:0,exactRowMatches:0,personSpanMatchedRows:0,
    multiwordPersonSpanMatchedRows:0,identifierMatchedRows:0,rowIds:[],documents:[],sensitiveValuesPrinted:false}
  const matching = new Set(),multiword = new Set(),exact = new Set(),ids = new Set()
  if(pdfFiles.length) {
    const saved = {log:console.log,warn:console.warn,error:console.error,info:console.info}
    try {
      for(const key of Object.keys(saved)) console[key]=()=>{}
      const {getDocumentProxy,extractText} = await import('unpdf')
      for(const [documentIndex,file] of pdfFiles.entries()) {
        let pdf
        const evidence={document:`LOCAL_PDF_${documentIndex+1}`,bytes:fs.statSync(path.join(ROOT,file)).size,status:'unreadable',textCharacters:0,errorCategory:null}
        documentSummary.documents.push(evidence)
        try {
          pdf=await getDocumentProxy(new Uint8Array(read(file)))
          const result=await extractText(pdf,{mergePages:true});const text=Array.isArray(result.text)?result.text.join('\n'):result.text
          if(!text?.trim()){documentSummary.unreadable++;evidence.errorCategory='no_extractable_text';continue}
          evidence.status='extracted';evidence.textCharacters=text.length
          documentSummary.extracted++
          for(let i=0;i<rows.length;i++) {
            const row=rows[i], id=safeId(row,i)
            if(containsSpan(text,row.text))exact.add(id)
            const spans=personCandidates(row.text).filter(n=>containsSpan(text,n))
            if(spans.length)matching.add(id)
            if(spans.some(s=>s.split(' ').length>1))multiword.add(id)
            for(const category of ['email','employee_id','national_id','passport','phone','iban','uuid']) {
              const match=patterns[category].exec(digits(row.text))
              if(match&&digits(text).includes(match[0]))ids.add(id)
            }
          }
        }catch(error){documentSummary.unreadable++;evidence.errorCategory=['PasswordException','InvalidPDFException','MissingPDFException','UnknownErrorException','AbortException','FormatError','TypeError','Error'].includes(error?.name)?error.name:'other_parser_error'}
        finally{if(typeof pdf?.destroy==='function'){try{await pdf.destroy()}catch{ /* Cleanup cannot skip the next local document. */ }}}
      }
    }catch{documentSummary.unreadable=pdfFiles.length-documentSummary.extracted}
    finally{Object.assign(console,saved)}
  }
  Object.assign(documentSummary,{exactRowMatches:exact.size,personSpanMatchedRows:matching.size,multiwordPersonSpanMatchedRows:multiword.size,
    identifierMatchedRows:ids.size,rowIds:[...new Set([...exact,...matching,...ids])].slice(0,30)})
  return {seedSource:'server/src/db/seed.ts',seedExecuted:false,demoSeedComparison:seedSummary,
    otherTextArtifactFilesInspected:textFiles.length,exactTextOverlapGroups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{files:v.files,uniqueRuntimeTexts:v.exactUniqueRuntimeTexts.size}])),
    localUploadDocuments:documentSummary,limitations:['No production DB/directory comparison','No OCR for scanned images','Name-span matching is heuristic; common names/topic matches cannot establish derivation','Excluded credential files, logs, backups, caches and binary/audio/model contents','No application/seed/RAG/MCP code executed']}
}

function detectorSelfTest() {
  const checks=[['email','person@example.invalid'],['employee_id','EMP-990001'],['national_id','national ID: 1234567890'],
    ['passport','passport: AB123456'],['phone','+962 700 000 000'],['iban','JO00'+'A'.repeat(26)],['bank_account','account number: 1234567890'],
    ['uuid','00000000-0000-4000-8000-000000000001'],['connection_string','postgresql://test:example@localhost/test'],
    ['api_key','sk-'+'A'.repeat(30)],['token','Bearer '+'A'.repeat(30)],['password','password=EXAMPLE_NOT_A_CREDENTIAL'],
    ['credential_topic','password reset'],['spelled_money_fact','salary is one thousand'],
    ['url','https://example.invalid/path'],['internal_host_ip_path','host.internal'],['concrete_money','salary is 100 JOD'],
    ['address','123 Example Street'],['medical_detail','diagnosis'],['health_topic','sick leave'],
    ['attendance_fact','was absent'],['leave_fact','leave balance is 10'],['disciplinary_detail','warning issued'],
    ['calendar_date','2026-01-01'],['long_opaque_value','Z'.repeat(40)]]
  for(const [key,text] of checks)assert.ok(patterns[key].test(text),key)
  assert.ok(personCandidates("Show Example Person's profile").length)
  assert.ok(personCandidates('ملف شخص تجريبي').length)
  assert.equal(normalize('إجازة!'),'اجازه')
  return {status:'PASS',checks:checks.length+3,note:'Artificial detector canaries only; no benchmark/model/application calls'}
}
async function main() {
  if(process.argv.includes('--self-test')){console.log(JSON.stringify(detectorSelfTest(),null,2));return}
  if(process.argv.length>2)throw new Error('Unknown audit argument')
  const bytes=read(DATASET),stat=fs.statSync(path.join(ROOT,DATASET))
  assert.equal(sha(bytes),DATASET_HASH,'Dataset differs from reviewed baseline')
  const lines=bytes.toString('utf8').split(/\r?\n/).filter(s=>s.trim()),rows=lines.map(JSON.parse)
  assert.ok(rows.every(r=>typeof r.text==='string'),'Non-text example')
  const exact=new Set(rows.map(r=>r.text)),normal=new Map()
  for(const r of rows){const n=normalize(r.text);if(!normal.has(n))normal.set(n,new Set());normal.get(n).add(r.intent)}
  const files=inventory()
  const labelCounts=counts(rows.map(r=>r.intent))
  const loader=read('server/src/copilot/training.ts').toString('utf8')
  const intentMap=[...loader.slice(loader.indexOf('const INTENT_MAP'),loader.indexOf('const ACTION_MAP')).matchAll(/^\s*([A-Z_]+): \{ kind: 'intent', intent: '([A-Za-z]+)'/gm)].map(m=>[m[1],m[2]])
  const actionMap=[...loader.slice(loader.indexOf('const ACTION_MAP'),loader.indexOf('const STOP_WORDS')).matchAll(/^\s*([A-Z_]+): '([A-Za-z]+)'/gm)].map(m=>[m[1],m[2]])
  // All metadata printed below must first conform to a non-sensitive vocabulary.
  for(const key of ['intent','tool','category','target','role','language'])assert.ok(rows.every(r=>typeof r[key]==='string'&&/^[A-Za-z_]+$/.test(r[key])),`Unexpected ${key} metadata`)
  const audit={verificationUtc:new Date().toISOString(),dataset:{path:DATASET,format:'UTF-8 JSONL',sha256:sha(bytes),bytes:bytes.length,
    creationUtc:stat.birthtime.toISOString(),lastWriteUtc:stat.mtime.toISOString(),rows:rows.length,uniqueExact:exact.size,uniqueNormalized:normal.size,
    duplicateExact:rows.length-exact.size,duplicateNormalized:rows.length-normal.size,
    languages:counts(rows.map(r=>r.language)),roles:counts(rows.map(r=>r.role)),legacyLabels:labelCounts,
    tools:counts(rows.map(r=>r.tool)),categories:counts(rows.map(r=>r.category)),targets:counts(rows.map(r=>r.target)),
    requiresConfirmation:counts(rows.map(r=>String(r.requires_confirmation))),
    emptyParameterObjects:rows.filter(r=>r.parameters&&typeof r.parameters==='object'&&!Array.isArray(r.parameters)&&!Object.keys(r.parameters).length).length,
    textLength:{min:Math.min(...rows.map(r=>r.text.length)),max:Math.max(...rows.map(r=>r.text.length)),over500:rows.filter(r=>r.text.length>500).length},
    uniqueIds:new Set(rows.map(r=>r.id)).size,allIdsPattern:rows.every(r=>/^HR_\d{5}$/.test(r.id)),
    idsCoverOneTo10000:[...rows.map(r=>Number(r.id.slice(3)))].sort((a,b)=>a-b).every((v,i)=>v===i+1),
    idOrderSequential:rows.every((r,i)=>r.id==='HR_'+String(i+1).padStart(5,'0')),
    crossLabelNormalizedTexts:[...normal.values()].filter(s=>s.size>1).length,
    rowsWithDigitsInText:rows.filter(r=>/\p{N}/u.test(r.text)).length,
    explicitPlaceholderRows:rows.filter(r=>/<[A-Z_0-9]+>|\{\{?\w+\}?\}|\[(?:NAME|PERSON|EMPLOYEE|ID)\]/i.test(r.text)).length,
    provenanceDeclarationRows:rows.filter(r=>['synthetic','synthetic_data','provenance','source','generated','metadata'].some(k=>Object.hasOwn(r,k))).length},
    downloadMetadata:downloadMetadata(),
    runtimeMapping:{legacyIntentLabels:intentMap.length,legacyActionLabels:actionMap.length,questionIntents:[...new Set(intentMap.map(([,v])=>v))].sort(),actionTypes:[...new Set(actionMap.map(([,v])=>v))].sort(),actionsAppearAsDoActionInQuestionStage:true},
    textOutliers:{replacementCharacterRows:rows.filter(r=>r.text.includes('\uFFFD')).length,
      nulOrBidiControlRows:rows.filter(r=>/[\u0000\u202A-\u202E\u2066-\u2069]/.test(r.text)).length,
      scriptComposition:counts(rows.map(r=>{const a=/\p{Script=Arabic}/u.test(r.text),l=/[A-Za-z]/.test(r.text);return a&&l?'both':a?'arabic_only':l?'latin_only':'neither'}))},
    sensitiveScan:scan(rows),crossCheck:await crossCheck(rows,files),
    integrity:{datasetUnchanged:sha(read(DATASET))===DATASET_HASH,
      frozenBenchmarkSha256:sha(read('docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl')),
      historicalManifestSha256:sha(read('docs/fine-tuning/pre-finetuning-file-hashes.sha256'))},
    limits:['Static pattern scan is not a real-identity or author-provenance attestation','No regex-negative result proves absence of all PII','Local artifact overlap is not evidence of which source copied which'],
    productionDataSystemsAccessed:false,networkCalls:0,benchmarkCasesExecuted:0,fineTuningStarted:false}
  console.log(JSON.stringify(audit,null,2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(()=>{console.error('OFFLINE_AUDIT_FAILED (details suppressed to avoid sensitive output)');process.exitCode=1})
}
