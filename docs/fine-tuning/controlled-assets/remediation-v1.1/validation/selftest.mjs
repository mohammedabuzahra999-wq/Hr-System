import assert from 'node:assert/strict'
import {selfTest,normalize,prepare,compare} from './core.mjs'
const base=selfTest();let extra=0
const ok=v=>{assert.ok(v);extra++}
ok(normalize('One, two!')==='one two')
ok(compare([prepare('sample <EMPLOYEE_NAME_1>')],[prepare('sample <EMPLOYEE_NAME_99>')]).entityMaskedExactCandidateRows===1)
ok(compare([prepare('the red canary opens a window')],[prepare('unrelated blue sample closes a door')]).flaggedCandidateRows===0)
ok(compare([prepare('stable canary')],[prepare('stable canary')]).exactCandidateRows===1)
console.log(JSON.stringify({status:'PASS',checks:base.checks+extra,protectedDatasetsRead:false,modelCalls:0}))
