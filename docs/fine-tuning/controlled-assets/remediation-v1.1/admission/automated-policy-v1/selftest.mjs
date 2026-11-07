import assert from 'node:assert/strict'
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {selfTest} from '../../validation/core.mjs'
import {extraChecks} from './automated-extra.mjs'
const BASE=path.dirname(fileURLToPath(import.meta.url)),prior=selfTest(),results=[]
const test=(name,fn)=>{fn();results.push({name,status:'PASS'})}
const row=()=>({recordId:'AUTOMATED_CHECK_CANARY_ONLY',input:{text:'canary <EMPLOYEE_NAME_90001>',trustedRole:'hr'},expected:{questionPlan:{intent:'employeeFile',personName:'<EMPLOYEE_NAME_90001>',employeeNumber:null,period:'lastMonth',reportType:'payroll'},actionPlan:null,orchestration:{behavior:'read',scope:'named_employee',confirmation:'notApplicable',executionPermitted:false}}})
test('valid-stated-placeholder-and-employee-scope',()=>assert.equal(extraChecks([row()]).status,'PASS'))
test('unstated-placeholder-fails',()=>{const r=row();r.input.text='canary only';assert.equal(extraChecks([r]).status,'FAIL')})
test('employee-scope-without-identifier-fails',()=>{const r=row();r.expected.questionPlan.personName=null;assert.equal(extraChecks([r]).status,'FAIL')})
test('company-read-cannot-have-employee-role',()=>{const r=row();r.expected.questionPlan={intent:'headcount'};r.expected.orchestration.scope='company';r.input.trustedRole='employee';assert.equal(extraChecks([r]).status,'FAIL')})
test('unsupported-payslip-period-fails',()=>{const r=row();r.expected.questionPlan={intent:'myPayslips',period:'lastMonth'};r.expected.orchestration.scope='self';assert.equal(extraChecks([r]).status,'FAIL')})
test('protected-action-cannot-claim-safe-ui-confirmation',()=>{const r=row();r.expected.questionPlan={intent:'doAction'};r.expected.actionPlan={action:'setSalary'};r.expected.orchestration={...r.expected.orchestration,behavior:'action',scope:'named_employee',confirmation:'safeUiExceptionIfValid'};assert.equal(extraChecks([r]).status,'FAIL')})
test('non-executable-clarification-control-passes',()=>{const r=row();r.expected.questionPlan=null;r.expected.orchestration={...r.expected.orchestration,behavior:'clarify',scope:'none'};assert.equal(extraChecks([r]).status,'PASS')})
test('executable-control-fails',()=>{const r=row();r.expected.orchestration.executionPermitted=true;assert.equal(extraChecks([r]).status,'FAIL')})
const report={version:'CEB-AUTO-ADMISSION-1-selftests',created:new Date().toISOString(),status:'PASS',priorDetectorChecks:prior.checks,supplementChecks:results.length,totalChecks:prior.checks+results.length,results,protectedDatasetsRead:false,modelCalls:0,humanReviewPerformed:false}
fs.writeFileSync(path.join(BASE,'selftest-results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',checks:report.totalChecks,modelCalls:0}))
