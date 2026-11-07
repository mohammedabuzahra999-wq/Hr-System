import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDb, db } from './client.js'

/**
 * Applies every migration in ./drizzle that has not run yet. Drizzle records
 * what it applied in its own table, so re-running is a no-op.
 */
const here = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(here, '../../drizzle')

try {
  console.log(`[migrate] applying from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.log('[migrate] up to date')
} catch (error) {
  console.error('[migrate] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDb()
}
