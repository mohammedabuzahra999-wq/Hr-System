import { isNull, and, ne, eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { closeDb, db } from './client.js'
import { cvFiles } from './schema.js'
import { env } from '../env.js'

/**
 * Moves CV files that are still on disk into the database.
 *
 * Run once, on the machine that holds the files, before deploying anywhere the
 * filesystem does not survive a restart. Safe to run twice: it only looks at
 * rows that have a path and no contents, so a second run finds nothing.
 *
 * A file the row points at but which is no longer there is reported and left
 * alone rather than skipped silently — a missing CV is something HR should know
 * about, not something a migration should quietly paper over.
 *
 *     npm run db:cv:import -w @hr/server
 */
const ROOT = resolve(env.UPLOAD_DIR)

const pending = await db
  .select({ id: cvFiles.id, storedPath: cvFiles.storedPath, fileName: cvFiles.fileName })
  .from(cvFiles)
  .where(and(isNull(cvFiles.content), ne(cvFiles.storedPath, '')))

console.log(`[cv] ${pending.length} file(s) still on disk`)

let moved = 0
const missing: string[] = []

for (const row of pending) {
  try {
    const bytes = await readFile(resolve(ROOT, row.storedPath))
    await db.update(cvFiles).set({ content: bytes }).where(eq(cvFiles.id, row.id))
    moved += 1
    console.log(`[cv] moved ${row.fileName} (${bytes.byteLength} bytes)`)
  } catch {
    missing.push(`${row.fileName} → ${row.storedPath}`)
  }
}

console.log(`[cv] moved ${moved}, missing ${missing.length}`)
for (const m of missing) console.warn(`[cv] file not found on disk: ${m}`)

await closeDb()
