import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { root, writeJson } from './manifest.mjs'

const output = process.env.LLM_ORCHESTRATION_OUTPUT
const url = new URL(process.env.AI_INTERVIEW_TEST_DATABASE_URL)
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Only a local disposable PostgreSQL server is allowed')
const name = 'ai_interview_llmprobe_' + randomUUID().replaceAll('-', '')
const admin = new pg.Pool({ connectionString: url.toString(), max: 1 })
let pool, created = false
const result = { status: 'BLOCKED', databasePolicy: 'Unique generated disposable local database; no application database touched', journalEntries: 0, cleanup: false }
try {
  result.postgresqlVersion = (await admin.query('SHOW server_version')).rows[0].server_version
  result.vectorAvailable = (await admin.query("SELECT name FROM pg_available_extensions WHERE name='vector'")).rowCount > 0
  const journal = JSON.parse(readFileSync(resolve(root, 'services/hr-api/drizzle/meta/_journal.json'), 'utf8'))
  result.journalEntries = journal.entries.length
  await admin.query(`CREATE DATABASE "${name}"`); created = true
  url.pathname = '/' + name
  pool = new pg.Pool({ connectionString: url.toString(), max: 1 })
  const database = drizzle(pool)
  try {
    // Same Drizzle migrator and exact journal/migration files used by db:migrate.
    await migrate(database, { migrationsFolder: resolve(root, 'services/hr-api/drizzle') })
    result.appliedCount = Number((await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count)
    result.interviewTables = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ai_interview%' ORDER BY table_name")).rows.map(r => r.table_name)
    await migrate(database, { migrationsFolder: resolve(root, 'services/hr-api/drizzle') })
    result.reapplyCount = Number((await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count)
    result.status = result.appliedCount === journal.entries.length && result.reapplyCount === result.appliedCount && result.interviewTables.length === 3 ? 'PASS' : 'FAIL'
  } catch (error) {
    const cause = error.cause ?? error
    result.sqlState = cause.code ?? null
    if (cause.code === '0A000' && !result.vectorAvailable) {
      result.status = 'BLOCKED'; result.blocker = 'pgvector extension unavailable; exact migration 0008 requires CREATE EXTENSION vector. No migration skipped, stubbed or edited.'
      result.failingMigration = '0008_happy_hannibal_king.sql'
      result.transactionRolledBack = (await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count === '0'
    } else { result.status = 'FAIL'; result.failureCode = 'MIGRATION_CHAIN_FAILED' }
  }
} finally {
  await pool?.end()
  if (created && /^ai_interview_llmprobe_[a-f0-9]{32}$/.test(name)) { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); result.cleanup = true }
  await admin.end()
  writeJson(resolve(output, 'migrations.json'), result)
}
console.log(JSON.stringify(result))
if (result.status === 'FAIL') process.exitCode = 1
