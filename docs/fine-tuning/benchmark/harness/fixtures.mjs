import { PgDialect } from 'drizzle-orm/pg-core'
import { getTableName } from 'drizzle-orm'

export const personaId = role => ({ employee: 1, manager: 2, hr: 3, admin: 4 })[role]
  ? `00000000-0000-4000-8000-${String(({employee:1,manager:2,hr:3,admin:4})[role]).padStart(12,'0')}` : null
export function persona(role) {
  const id = personaId(role)
  if (!id) throw new Error('Invalid synthetic role')
  return { id, role, email: `test-${role}@example.invalid`, employeeNumber: `TEST-${role.toUpperCase()}`,
    fullName: { en: `TEST_${role.toUpperCase()}`, ar: `TEST_${role.toUpperCase()}` },
    jobTitle: { en: 'Synthetic test role', ar: 'Synthetic test role' }, department: { en: 'Test Department', ar: 'Test Department' },
    managerId: role === 'employee' ? personaId('manager') : null, managerName: null, photoUrl: null }
}
export class FixtureUnavailable extends Error {
  constructor() { super('Synthetic fixture does not implement this query'); this.code = 'fixtureUnavailable' }
}

// Explicit fictional directory. No gold intent/entities are used to manufacture a
// prediction. Fixture labels choose only the documented ownership/ambiguity state.
export function directory(fixture) {
  const names = ["Testara Veld", 'نيراف تجريبي', 'سيروان الاختباري', 'Zelvyn Testson',
    'Testara Veld-Example', 'نيراف ابن تجريبي', 'سيروان آل اختبار', "Zelvyn O'Test"]
  const people = names.map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
    fullNameEn: name, fullNameAr: name, employeeNumber: index === 0 ? 'EMP-990001' : index === 3 ? 'EMP-990004' : `TEST-${100 + index}`,
    managerId: fixture === 'employee_outside_actor_team' ? personaId('admin') : personaId('manager'),
    role: 'employee', isActive: true, departmentEn: 'Test Department', departmentAr: 'Test Department',
    jobTitleEn: 'Synthetic role', jobTitleAr: 'Synthetic role', joinedOn: '2026-01-01', email: `test-${index}@example.invalid`,
  }))
  // Without the explicit ambiguity fixture, the longer partial-name counterpart
  // must not make the declared unique employee fixture ambiguous.
  return fixture === 'two_employees_same_partial_name' ? people : people.filter((_, i) => i !== 4)
}
const fold = text => String(text).toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
export function syntheticDatabase(row, violation, trace) {
  const people = [...directory(row.fixture), ...['employee','manager','hr','admin'].map(role => {
    const p = persona(role)
    return { ...p, fullNameEn: p.fullName.en, fullNameAr: p.fullName.ar, departmentEn: p.department.en,
      departmentAr: p.department.ar, jobTitleEn: p.jobTitle.en, jobTitleAr: p.jobTitle.ar, isActive: true }
  })]
  const dialect = new PgDialect()
  function select(fields) {
    let table, condition, limit = Infinity
    const chain = {
      from(value) { table = value; return chain },
      where(value) { condition = value; return chain },
      orderBy() { return chain }, groupBy() { throw new FixtureUnavailable() },
      innerJoin() { throw new FixtureUnavailable() }, leftJoin() { throw new FixtureUnavailable() },
      limit(value) { limit = value; return chain },
      then(resolve, reject) { return Promise.resolve().then(() => {
        trace.syntheticQueries++
        if (getTableName(table) !== 'users') throw new FixtureUnavailable()
        let selected = people
        if (condition) {
          const query = dialect.sqlToQuery(condition), values = query.params
          // Only the reviewed identity/manager predicates are simulated. Unknown
          // predicates fail explicitly, rather than returning unscoped records.
          const known = /"(?:full_name_en|full_name_ar|employee_number|manager_id|is_active|id)"/.test(query.sql)
          const columns=[...query.sql.matchAll(/"users"\."([^"]+)"/g)].map(m=>m[1])
          if (!known || columns.some(name=>!['full_name_en','full_name_ar','employee_number','manager_id','is_active','id'].includes(name))
            || /\bin\s*\(/i.test(query.sql)) throw new FixtureUnavailable()
          if (/"manager_id" =/.test(query.sql)) {
            const manager = values.find(v => typeof v === 'string' && v === personaId('manager'))
            if (!manager) throw new FixtureUnavailable()
            selected = selected.filter(p => p.managerId === manager)
          }
          if (/"id" =/.test(query.sql) && !/"manager_id" =/.test(query.sql)) {
            selected = selected.filter(p => values.includes(p.id))
          }
          if (/"employee_number"/.test(query.sql)) selected = selected.filter(p => values.some(v => fold(v) === fold(p.employeeNumber)))
          if (/"full_name_/.test(query.sql)) {
            const needles = values.filter(v => typeof v === 'string' && !/^[0-9a-f-]{36}$/i.test(v))
              .map(v => fold(v.replaceAll('%','')))
            selected = selected.filter(p => needles.some(n => fold(p.fullNameEn).includes(n) || fold(p.fullNameAr).includes(n)))
          }
        }
        return selected.slice(0, limit).map(person => fields ? Object.fromEntries(Object.entries(fields).map(([alias, column]) => {
          const name = column?.name
          const key = name?.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
          if (!key || !(key in person)) throw new FixtureUnavailable()
          return [alias, person[key]]
        })) : { ...person })
      }).then(resolve, reject) },
    }
    return chain
  }
  return new Proxy({ select }, { get(target, key) {
    if (key === 'select') return select
    return () => violation(`database_${String(key)}_blocked`)
  } })
}
