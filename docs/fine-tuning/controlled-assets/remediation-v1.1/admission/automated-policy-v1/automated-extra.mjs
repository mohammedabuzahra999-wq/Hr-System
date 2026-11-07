// Deterministic target/envelope constraints only, not linguistic or service/SQL certification.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const sha=b=>createHash('sha256').update(b).digest('hex')
const token=/<[A-Z][A-Z_]*_\d+>/g
const allStrings=v=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(allStrings):[]
export function extraChecks(rows){
 const failures=[],safeUi=new Set(['openScreen','filterScreen','scrollPage','openEmployeeFile','markAllNotificationsRead']),company=new Set(['headcount','departmentBreakdown','departmentAbsenceComparison','orgAttendance','orgLeaveSummary','recruitmentSummary','openJobOpenings','listApplications','whoIsPresentNow','payrollInsights','payrollReadiness','payrollRunSummary','payrollAuditSummary','payrollFindings'])
 for(const r of rows){const q=r.expected.questionPlan,a=r.expected.actionPlan,o=r.expected.orchestration,fail=code=>failures.push({recordId:r.recordId,code})
  for(const text of allStrings({question:q,action:a}))for(const match of text.matchAll(token))if(!r.input.text.includes(match[0]))fail('target_placeholder_not_in_input')
  if(!q&&(!['clarify','unsupported'].includes(o.behavior)||o.scope!=='none'))fail('non_executable_control_mismatch')
  if(q){if(q.intent.startsWith('my')&&o.scope!=='self')fail('self_scope_mismatch');if(q.intent.startsWith('team')&&(o.scope!=='team'||r.input.trustedRole==='employee'))fail('team_scope_mismatch');if(company.has(q.intent)&&(o.scope!=='company'||!['hr','admin'].includes(r.input.trustedRole)))fail('company_scope_mismatch');if(q.intent==='employeeFile'&&(o.scope!=='named_employee'||!q.personName&&!q.employeeNumber))fail('employee_scope_missing_identifier');if(q.intent==='outOfScope'&&(o.scope!=='none'||q.refusalReason===null))fail('refusal_scope_mismatch');if(['myPayslips','myRequests','myLeaveBalance'].includes(q.intent)&&q.period!==null)fail('unsupported_self_filter_gold')}
  if(a&&(o.behavior!=='action'||q?.intent!=='doAction'||o.confirmation!==(safeUi.has(a.action)?'safeUiExceptionIfValid':'reviewIfProposalComplete')))fail('action_confirmation_mismatch')
  if(o.executionPermitted!==false)fail('execution_flag_must_be_false')
 }
 return{status:failures.length?'FAIL':'PASS',rows:rows.length,failures,scope:'Deterministic permission/scope/confirmation and stated-placeholder consistency; no employee lookup, service execution or linguistic judgment'}
}
export function recipeConformance(oldLines,newLines,asset,catalog,plan,generatorHash){
 const digest=createHash('sha256');let changed=0
 for(let i=0;i<oldLines.length;i++){const raw=oldLines[i],r=JSON.parse(raw),oldRole=r.input.trustedRole;let modified=false
  if(asset==='R'&&Object.hasOwn(catalog.replacements,r.recordId)){r.input.text=catalog.replacements[r.recordId];r.wireProjection.inputText=Object.entries(r.syntheticRendering).reduce((s,[k,v])=>s.split(k).join(v),r.input.text);modified=true}
  if(asset==='S'){const family=/^CEB-S-QUESTION-(\d{3})-/.exec(r.recordId)?.[1],role=plan.selection.questionFamilyRoleAssignments[family];if(role){r.input.trustedRole=role;modified=true;assert.notEqual(role,oldRole)}}
  if(modified){changed++;r.assetVersion='v1.1';r.templateId+='-r1.1';r.provenance={...r.provenance,recipe:'remediation-v1.1/generation/remediate.mjs',recipeHash:generatorHash,parentRowSha256:sha(raw),remediationId:'CEB-1C4R-v1.1'}}
  const expected=modified?JSON.stringify(r):raw;assert.equal(expected,newLines[i],'FROZEN_RECIPE_CONFORMANCE_FAILURE');digest.update(expected+'\n')
 }
 assert.equal(changed,asset==='R'?3:72)
 return{status:'PASS',checkedRows:newLines.length,changedRowsAgainstParent:changed,expectedReleaseSha256:digest.digest('hex'),method:'Read-only line-by-line comparison with the already frozen edit recipe; generator not invoked, no JSONL output created',newAssetFilesWritten:0}
}
