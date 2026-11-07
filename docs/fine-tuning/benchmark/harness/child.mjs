import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createCapsule, IsolationError } from './capsule.mjs'
import { FixtureUnavailable } from './fixtures.mjs'
import { score } from './scoring.mjs'
import { ROOT, DATASET, DATASET_HASH, hash, validateConfig } from './policy.mjs'

if (!process.permission || process.permission.has('fs.write') || process.permission.has('child') || process.permission.has('worker')) {
  throw new Error('Harness child requires restricted Node permissions')
}
const chunks=[];let size=0
for await (const chunk of process.stdin) {size+=chunk.length;if(size>2_000_000)throw new Error('Oversized harness request');chunks.push(chunk)}
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'))
const emit = value => process.stdout.write(JSON.stringify(value)+'\n')
try {
  if(request.command==='evaluate') {
    validateConfig(request.config)
    if(request.config.mode==='ollama') {
      const bytes=fs.readFileSync(path.join(ROOT,DATASET))
      if(hash(bytes)!==DATASET_HASH)throw new Error('Frozen dataset integrity failure')
      const frozen=bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse).find(row=>row.id===request.row.id)
      if(!frozen||JSON.stringify(frozen)!==JSON.stringify(request.row))throw new Error('Live input must exactly match the frozen synthetic record')
      request.config.frozenRowVerified=true
    }
    const capsule=await createCapsule(request.row,request.config)
    try {
      const observed=await capsule.evaluate()
      emit({result:score(request.row,observed),diagnostics:observed.traceSummary})
    } finally {capsule.close()}
  } else if(request.command==='isolation-self-test') {
    const checks=[]
    const secret=path.join(ROOT,'server/.env')
    assert.equal(process.permission.has('fs.read',secret),false)
    assert.throws(()=>fs.readFileSync(secret),error=>error.code==='ERR_ACCESS_DENIED')
    checks.push('native filesystem denies application .env reads')
    const alias=path.join(ROOT,'node_modules/@hr/server/.env')
    assert.equal(process.permission.has('fs.read',alias),false)
    assert.throws(()=>fs.readFileSync(alias),error=>error.code==='ERR_ACCESS_DENIED')
    checks.push('workspace package junction cannot expose server credentials')
    const output=path.join(ROOT,'docs/fine-tuning/benchmark/harness/never-created.txt')
    assert.throws(()=>fs.writeFileSync(output,'not written'),error=>error.code==='ERR_ACCESS_DENIED')
    checks.push('native filesystem denies writes')
    assert.throws(()=>spawnSync(process.execPath,['-e','process.exit(0)']),error=>error.code==='ERR_ACCESS_DENIED')
    checks.push('native process spawning denied')
    for(const forbidden of ['DATABASE_URL','OPENAI_API_KEY','OPENROUTER_API_KEY','HR_MCP_PASSWORD','SESSION_SECRET','NODE_OPTIONS'])assert.equal(process.env[forbidden],undefined)
    checks.push('production credentials and inherited Node options absent')
    const row={id:'HARNESS-ISOLATION',language:'en',synthetic_data:true,actor_role:'employee',reference_date:'2026-10-22',fixture:'none'}
    for(const probe of ['db','write','mcp','ragImport','hrApi','network','credentials','envFile','childProcess','cloud','dotenv']) {
      const capsule=await createCapsule(row)
      try {await assert.rejects(capsule.probe(probe),error=>error instanceof IsolationError);assert.ok(capsule.trace.violations.length);checks.push(`${probe}: blocked and latched`)}
      finally {capsule.close()}
    }
    const caught=await createCapsule(row)
    try {assert.equal(await caught.probe('caughtViolation'),true);assert.ok(caught.trace.violations.length);checks.push('caught isolation errors remain latched')}
    finally {caught.close()}
    const rag=await createCapsule({...row,fixture:'knowledge_visible'})
    try {assert.equal((await rag.probe('rag')).answer.en,'Synthetic test policy only.');checks.push('synthetic RAG fixture works without production documents')}
    finally {rag.close()}
    for(const role of ['employee','manager','hr','admin']) {
      const capsule=await createCapsule({...row,actor_role:role})
      try {
        const decision=await capsule.probe('roles')
        assert.equal(decision.self,true)
        assert.equal(decision.team,role!=='employee')
        assert.equal(decision.company,role==='hr'||role==='admin')
        assert.equal(decision.payroll,role==='hr'||role==='admin')
        assert.equal(decision.salaryWrite,role==='hr'||role==='admin')
        checks.push(`${role}: real permission registries enforce synthetic role boundaries`)
      } finally {capsule.close()}
    }
    const outside=await createCapsule({...row,actor_role:'manager',fixture:'employee_outside_actor_team'})
    try {assert.equal(await outside.probe('employeeScope'),null);checks.push('real employee-file guard denies synthetic outside-team ownership')}
    finally {outside.close()}
    const payroll=await createCapsule({...row,actor_role:'manager',fixture:'employee_unique'})
    try {assert.equal(await payroll.probe('payrollScope'),null);checks.push('real employee-payroll guard denies manager before payroll access')}
    finally {payroll.close()}
    const company=await createCapsule(row)
    try {await assert.rejects(company.probe('companyReport'),error=>error.status===403);checks.push('remediated real report builder denies employee company scope')}
    finally {company.close()}
    const missing=await createCapsule(row)
    try {await assert.rejects(missing.probe('unsupportedFixture'),error=>error instanceof FixtureUnavailable);checks.push('unsupported synthetic query fails explicitly with no production fallback')}
    finally {missing.close()}
    emit({checks,passed:checks.length,benchmarkCasesExecuted:0,modelCalls:0,realWrites:0})
  } else throw new Error('Unknown harness command')
} catch(error) {
  // Do not print model bodies, fixture text, request headers or full DB errors.
  emit({fatal:error instanceof IsolationError?'isolationFailure':String(error.code??'harnessError'),
    detail:error instanceof IsolationError?error.message:String(error.message).slice(0,160)})
  process.exitCode=1
}
