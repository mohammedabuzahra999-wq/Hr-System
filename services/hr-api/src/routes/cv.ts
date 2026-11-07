import { aliasedTable, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { CV_MAX_BYTES } from '@hr/shared'
import { db } from '../db/client.js'
import { applications, candidates, cvFiles, users } from '../db/schema.js'
import { analyseInBackground } from '../ai/analyseCv.js'
import { toCvFile } from '../mappers.js'
import { requireAuth, requireRole, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { publish } from '../realtime/bus.js'
import { readUpload, removeUpload, safeFileName, saveUpload, UploadRejected } from '../storage/files.js'

export const cvRoutes = new Hono<AppEnv>()

cvRoutes.use('*', requireAuth)

const uploader = aliasedTable(users, 'uploader')

type UserRow = typeof users.$inferSelect

interface CvRow {
  cv: typeof cvFiles.$inferSelect
  uploader: UserRow | null
}

const selectCvs = () =>
  db.select({ cv: cvFiles, uploader }).from(cvFiles).leftJoin(uploader, eq(uploader.id, cvFiles.uploadedBy)).$dynamic()

/**
 * Uploading a CV.
 *
 * Exactly one of `userId` or `candidateId` comes in the same multipart body as
 * the file. The database enforces that too, but rejecting it here gives a usable
 * error instead of a constraint violation.
 */
cvRoutes.post('/', requireRole(...allowed('manageCvFiles')), async (c) => {
  const actor = c.get('user')

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new HTTPException(400, { message: 'invalidUpload' })
  }

  const file = form.get('file')
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'fileMissing' })

  const userId = form.get('userId')
  const candidateId = form.get('candidateId')
  const ownerCount = [userId, candidateId].filter((v) => typeof v === 'string' && v.length > 0).length
  if (ownerCount !== 1) throw new HTTPException(400, { message: 'cvNeedsOneOwner' })

  // The owner must exist before a file is written, or an upload can leave an
  // orphaned file on disk that no row will ever point at.
  if (typeof userId === 'string' && userId) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    if (!rows[0]) throw new HTTPException(404, { message: 'employeeNotFound' })
  } else if (typeof candidateId === 'string' && candidateId) {
    const rows = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
    if (!rows[0]) throw new HTTPException(404, { message: 'candidateNotFound' })
  }

  let stored
  try {
    stored = await saveUpload(file)
  } catch (e) {
    if (e instanceof UploadRejected) throw new HTTPException(422, { message: e.code })
    throw e
  }

  try {
    const [row] = await db
      .insert(cvFiles)
      .values({
        userId: typeof userId === 'string' && userId ? userId : null,
        candidateId: typeof candidateId === 'string' && candidateId ? candidateId : null,
        fileName: stored.fileName,
        storedPath: stored.storedPath,
        content: stored.content,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedBy: actor.id,
      })
      .returning()

    publish({ type: 'recruitment.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })

    /**
     * A CV typed in by HR gets read the same way one that arrived through the
     * careers page does — every application this person has open, since a new
     * CV changes what each of them evidences.
     */
    if (row!.candidateId) {
      const open = await db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.candidateId, row!.candidateId))
      for (const a of open) analyseInBackground(a.id)
    }

    return c.json(toCvFile(row!, { fullNameEn: actor.fullName.en, fullNameAr: actor.fullName.ar }), 201)
  } catch (e) {
    // The row is the record; a file with no row is litter. Undo the write.
    await removeUpload(stored.storedPath).catch(() => {})
    throw e
  }
})

/**
 * Downloading.
 *
 * The bytes are streamed by this handler, never by a static file server, so the
 * session is checked on every single fetch. An employee may read their own CV;
 * HR and admin may read any.
 */
cvRoutes.get('/:id/download', async (c) => {
  const actor = c.get('user')
  const rows: CvRow[] = await selectCvs().where(eq(cvFiles.id, c.req.param('id'))).limit(1)
  const row = rows[0]
  if (!row) throw new HTTPException(404, { message: 'cvNotFound' })

  const isOwnEmployeeFile = row.cv.userId !== null && row.cv.userId === actor.id
  const mayRead = actor.role === 'hr' || actor.role === 'admin' || isOwnEmployeeFile
  if (!mayRead) throw new HTTPException(403, { message: 'forbidden' })

  let bytes: Buffer
  try {
    bytes = await readUpload(row.cv)
  } catch {
    // The row survived but the file did not — say so rather than serving nothing.
    throw new HTTPException(410, { message: 'cvFileMissing' })
  }

  const name = safeFileName(row.cv.fileName)
  return c.body(new Uint8Array(bytes), 200, {
    'Content-Type': row.cv.mimeType,
    // `attachment` matters: it stops a document being rendered in the app's own
    // origin, and the filename is ASCII-escaped with a UTF-8 form beside it.
    'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
})

cvRoutes.delete('/:id', requireRole(...allowed('manageCvFiles')), async (c) => {
  const rows = await db.select().from(cvFiles).where(eq(cvFiles.id, c.req.param('id'))).limit(1)
  const row = rows[0]
  if (!row) throw new HTTPException(404, { message: 'cvNotFound' })

  await db.delete(cvFiles).where(eq(cvFiles.id, row.id))
  await removeUpload(row.storedPath)

  publish({ type: 'recruitment.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return c.json({ ok: true })
})

/** An employee's CVs. Theirs to read, HR's and admin's to manage. */
cvRoutes.get('/employee/:id', async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  if (actor.role !== 'hr' && actor.role !== 'admin' && actor.id !== id) {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  const rows: CvRow[] = await selectCvs().where(eq(cvFiles.userId, id)).orderBy(desc(cvFiles.uploadedAt))
  return c.json({ files: rows.map((r) => toCvFile(r.cv, r.uploader)), maxBytes: CV_MAX_BYTES })
})
