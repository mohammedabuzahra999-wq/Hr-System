import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { HTTPException } from 'hono/http-exception'
import ts from 'typescript'
import type { ReportType, Role, SessionUser } from '@hr/shared'
import { users } from '../db/schema.js'

// Run the real report builder with only its DB transport and period arithmetic
// replaced. No application DB client, model, HTTP service or frozen benchmark
// is loaded. SQL predicates are inspected, and synthetic rows obey their scope.
const key = Symbol.for('hr.check.report-scope-security')
const globals = globalThis as unknown as Record<symbol, unknown>
assert.equal(globals[key], undefined)
const dialect = new PgDialect()
const ids = { self: randomUUID(), manager: randomUUID(), report: randomUUID(), outside: randomUUID(), hr: randomUUID() }
const staff = [
  { id: ids.self, managerId: ids.manager, name: 'Synthetic Self', dept: 'Test A' },
  { id: ids.manager, managerId: null, name: 'Synthetic Manager', dept: 'Test B' },
  { id: ids.report, managerId: ids.manager, name: 'Synthetic Report', dept: 'Test A' },
  { id: ids.outside, managerId: null, name: 'Synthetic Outside', dept: 'Test C' },
]
type Row = Record<string, unknown>
type Query = { table: string; fields?: Record<string, unknown>; sql: string; params: unknown[] }
interface Chain extends PromiseLike<Row[]> {
  from(table: Parameters<typeof getTableName>[0]): Chain
  where(condition: SQL): Chain
  innerJoin(...args: unknown[]): Chain
  groupBy(...args: unknown[]): Chain
  orderBy(...args: unknown[]): Chain
  limit(...args: unknown[]): Chain
}
const queries: Query[] = []
function rowsFor(query: Query): Row[] {
  if (query.table === 'users') {
    let matches = staff
    if (query.sql.includes('"manager_id" =')) matches = matches.filter(row => row.managerId === query.params[0])
    if (query.sql.includes('"id" in')) matches = matches.filter(row => query.params.includes(row.id))
    return matches.map(row => ({
      id: row.id,
      en: query.fields?.en === users.departmentEn ? row.dept : row.name,
      ar: query.fields?.ar === users.departmentAr ? row.dept : row.name,
      number: 'SYN-' + staff.indexOf(row), jobEn: 'Synthetic role', jobAr: 'Synthetic role',
      deptEn: row.dept, deptAr: row.dept, joinedOn: '2026-10-02', role: 'employee',
    }))
  }
  if (query.table === 'attendance_days' || query.table === 'requests') {
    assert.match(query.sql, /"user_id" in/, 'Every employee-data query must carry an explicit scope predicate')
    const matches = staff.filter(row => query.params.includes(row.id))
    if (query.fields?.en) return matches.map(row => ({ en: row.name, ar: row.name, status: 'present', total: 1 }))
    return matches.length ? [{ status: query.table === 'requests' ? 'approved' : 'present', total: matches.length }] : []
  }
  if (query.table === 'job_openings') return [{ id: 'synthetic-opening', titleEn: 'Synthetic vacancy', titleAr: '',
    departmentEn: 'Test A', departmentAr: '', status: 'open', publishedAt: null, openedOn: '2026-10-01' }]
  if (query.table === 'applications') return []
  if (query.table === 'candidates') return [{ n: 0 }]
  throw new Error('Unexpected table in isolated report security test')
}
const db = {
  select(fields?: Record<string, unknown>): Chain {
    const query: Query = { table: '', fields, sql: '', params: [] }
    const chain: Chain = {
      from(table) { query.table = getTableName(table); return chain },
      where(condition) { const rendered = dialect.sqlToQuery(condition); query.sql = rendered.sql; query.params = rendered.params; return chain },
      innerJoin() { return chain }, groupBy() { return chain }, orderBy() { return chain }, limit() { return chain },
      then(resolve, reject) { queries.push(query); return Promise.resolve().then(() => rowsFor(query)).then(resolve, reject) },
    }
    return chain
  },
}
globals[key] = { db }
const state = "globalThis[Symbol.for('hr.check.report-scope-security')]"
const file = new URL('./build.ts', import.meta.url)
let code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
}).outputText
const overrides: Record<string, string> = {
  '../db/client.js': `export const db=${state}.db`,
  '../copilot/execute.js': `export const resolvePeriod=()=>({from:'2026-10-01',to:'2026-10-31',label:{en:'Synthetic period',ar:'Synthetic period'}})`,
}
code = code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote: string, specifier: string) => {
  const replacement = overrides[specifier]
  const url = replacement ? 'data:text/javascript;base64,' + Buffer.from(replacement).toString('base64')
    : specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier)
  return `from ${JSON.stringify(url)}`
})
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('Network forbidden in report security checks') }
let checks = 0
function pass(label: string) { checks++; console.log(`PASS: ${label}`) }
function actor(role: Role): SessionUser {
  return { id: role === 'manager' ? ids.manager : role === 'employee' ? ids.self : ids.hr,
    role, email: 'synthetic@example.invalid', employeeNumber: 'SYN-REPORT', fullName: { en: 'Synthetic', ar: 'Synthetic' },
    department: { en: 'Test A', ar: 'Test A' }, jobTitle: { en: 'Synthetic', ar: 'Synthetic' },
    managerId: null, managerName: null, photoUrl: null }
}
try {
  const { buildReport } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')) as typeof import('./build.js')
  const base = { period: 'thisMonth' as const, department: null, now: new Date('2026-10-22T09:00:00Z') }
  async function denied(type: ReportType, role: Role, self: boolean, department: string | null = null) {
    const before = queries.length
    await assert.rejects(buildReport(type, actor(role), { ...base, self, department }),
      error => error instanceof HTTPException && error.status === 403 && error.message === 'forbidden')
    assert.equal(queries.length, before, 'Authorization denial must precede all report queries')
    pass(`${role}/${self ? 'self' : 'non-self'}/${type}${department ? '/department-filter' : ''}: denied before data access`)
  }
  for (const role of ['employee', 'manager', 'hr', 'admin'] as const) {
    for (const type of ['recruitment', 'department'] as const) await denied(type, role, true)
  }
  for (const type of ['attendance', 'leave', 'employees', 'newHires', 'recruitment', 'department'] as const) {
    await denied(type, 'employee', false)
  }
  for (const type of ['recruitment', 'department'] as const) await denied(type, 'manager', false)
  for (const role of ['hr', 'admin'] as const) {
    for (const type of ['recruitment', 'department'] as const) await denied(type, role, false, 'Test A')
  }
  // Adversarial extra parameters represent untrusted wider-scope hints. None
  // can replace the separately supplied trusted actor or service-derived IDs.
  const injected = { scope: 'company', userIds: [ids.outside], role: 'admin', actorId: ids.outside }
  for (const type of ['attendance', 'leave', 'employees', 'newHires'] as const) {
    const self = await buildReport(type, actor('employee'), { ...base, ...injected, self: true, department: 'Test C' })
    assert.equal(self.scope.en, 'You')
    assert.ok(!JSON.stringify(self).includes('Synthetic Outside') && !JSON.stringify(self).includes('Synthetic Report'))
    pass(`self ${type}: wider hints and other department cannot widen results`)
    const before = queries.length
    const team = await buildReport(type, actor('manager'), { ...base, ...injected, self: false, department: 'Test C' })
    assert.equal(team.scope.en, 'Your team')
    assert.ok(!JSON.stringify(team).includes('Synthetic Outside'))
    for (const query of queries.slice(before).filter(q => q.table !== 'users' || q.sql.includes('"id" in'))) {
      assert.ok(!query.params.includes(ids.outside), 'Outside-team identifier cannot enter downstream query scope')
    }
    pass(`team ${type}: manager/direct-report scope survives wider hints`)
  }
  for (const role of ['hr', 'admin'] as const) {
    const self = await buildReport('employees', actor(role), { ...base, self: true })
    assert.equal(self.scope.en, 'You', 'A privileged caller requesting self still remains self')
    pass(`${role} self remains self`)
    for (const type of ['attendance', 'leave', 'employees', 'newHires', 'recruitment', 'department'] as const) {
      const company = await buildReport(type, actor(role), { ...base, self: false })
      assert.equal(company.scope.en, 'Whole company')
      assert.ok(company.sections.length > 0)
      pass(`${role} authorized company ${type} still works`)
    }
    const department = await buildReport('employees', actor(role), { ...base, self: false, department: 'Test A' })
    assert.equal(department.scope.en, 'Test A')
    assert.ok(!JSON.stringify(department).includes('Synthetic Outside'))
    pass(`${role} authorized department filter remains narrow`)
  }
  console.log(`PASS: ${checks} report authorization/scope checks; synthetic in-memory queries only`)
} finally {
  globalThis.fetch = savedFetch
  delete globals[key]
}
