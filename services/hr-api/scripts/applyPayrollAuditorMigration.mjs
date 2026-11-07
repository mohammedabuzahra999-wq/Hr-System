/*
 * The hosted database role cannot create Drizzle's bookkeeping schema, although
 * it is allowed to change the application's public schema.  This applies the
 * one reviewed payroll-auditor migration directly, without printing connection
 * details or recording any payroll data.
 *
 * Run once with: node scripts/applyPayrollAuditorMigration.mjs
 */
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const migration = fileURLToPath(new URL('../drizzle/0023_payroll_auditor.sql', import.meta.url))
const statements = (await readFile(migration, 'utf8'))
  .split('--> statement-breakpoint')
  .map((part) => part.trim())
  .filter(Boolean)

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  for (const [index, statement] of statements.entries()) {
    await pool.query(statement)
    console.log(`[payroll-auditor] applied step ${index + 1}/${statements.length}`)
  }
  console.log('[payroll-auditor] migration complete')
} finally {
  await pool.end()
}
