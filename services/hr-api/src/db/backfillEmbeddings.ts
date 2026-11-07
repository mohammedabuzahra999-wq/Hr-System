/**
 * Gives every approved description an embedding, so retrieval has a corpus.
 *
 * Run with: npm run db:embed --workspace=@hr/server
 *
 * Safe to re-run: only rows without an embedding are touched, so it is the
 * right thing to run after a bulk import and the wrong thing to worry about
 * running twice.
 */
import 'dotenv/config'
import { isNull } from 'drizzle-orm'
import type { JobDescriptionContent } from '@hr/shared'
import { embed, embeddableText } from '../ai/retrieval.js'
import { closeDb, db } from './client.js'
import { jobDescriptions } from './schema.js'
import { eq } from 'drizzle-orm'

async function main() {
  const pending = await db
    .select({ id: jobDescriptions.id, titleAr: jobDescriptions.titleAr, content: jobDescriptions.content })
    .from(jobDescriptions)
    .where(isNull(jobDescriptions.embedding))

  if (pending.length === 0) {
    console.log('[embed] every description already has one')
    await closeDb()
    return
  }

  console.log(`[embed] ${pending.length} to do`)
  let ok = 0

  for (const row of pending) {
    const vector = await embed(embeddableText(row.content as unknown as JobDescriptionContent))
    if (!vector) {
      console.log(`  ✗ ${row.titleAr}`)
      continue
    }
    await db.update(jobDescriptions).set({ embedding: vector }).where(eq(jobDescriptions.id, row.id))
    ok += 1
    console.log(`  ✓ ${row.titleAr.padEnd(30)} ${vector.length} dimensions`)
  }

  console.log(`[embed] done — ${ok}/${pending.length}`)
  await closeDb()
}

main().catch(async (e) => {
  console.error(e)
  await closeDb()
  process.exit(1)
})
