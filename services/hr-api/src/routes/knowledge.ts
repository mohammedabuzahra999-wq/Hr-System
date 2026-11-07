import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createKnowledgeTextSchema, knowledgeAudienceSchema, type CreateKnowledgeTextInput, type Role } from '@hr/shared'
import { createKnowledge, deleteKnowledge, listKnowledge } from '../knowledge/service.js'
import { extractKnowledgeFile, KnowledgeUploadRejected } from '../knowledge/extract.js'
import { requireAuth, requireRole, validateBody, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'

export const knowledgeRoutes = new Hono<AppEnv>()

// Managing source material is separate from asking the assistant. HR and an
// administrator may curate it; each entry then controls which roles may read it.
knowledgeRoutes.use('*', requireAuth, requireRole(...allowed('manageKnowledge')))

knowledgeRoutes.get('/', async (c) => c.json({ documents: await listKnowledge() }))

knowledgeRoutes.post('/text', validateBody(createKnowledgeTextSchema), async (c) => {
  const input = c.get('body') as CreateKnowledgeTextInput
  const document = await createKnowledge(
    { ...input, sourceType: 'text', sourceFileName: null },
    c.get('user').id,
  )
  return c.json({ document }, 201)
})

function parseAudience(raw: string | File | null): Role[] {
  if (raw === null || raw === '') return ['admin', 'hr', 'manager', 'employee']
  if (typeof raw !== 'string') throw new HTTPException(422, { message: 'knowledgeAudienceInvalid' })
  try {
    const checked = knowledgeAudienceSchema.safeParse(JSON.parse(raw))
    if (checked.success) return checked.data
  } catch {
    // The response below is intentionally the same for malformed JSON and an
    // unsupported role list: neither leaks internal validation details.
  }
  throw new HTTPException(422, { message: 'knowledgeAudienceInvalid' })
}

knowledgeRoutes.post('/upload', async (c) => {
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new HTTPException(400, { message: 'invalidUpload' })
  }

  const file = form.get('file')
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'fileMissing' })

  let extracted
  try {
    extracted = await extractKnowledgeFile(file)
  } catch (error) {
    if (error instanceof KnowledgeUploadRejected) throw new HTTPException(422, { message: error.code })
    throw error
  }

  const titleRaw = form.get('title')
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim().slice(0, 180) : extracted.title
  if (title.length < 2) throw new HTTPException(422, { message: 'knowledgeTitleInvalid' })

  const document = await createKnowledge(
    {
      title,
      content: extracted.text,
      visibleTo: parseAudience(form.get('visibleTo')),
      sourceType: 'file',
      sourceFileName: extracted.fileName,
    },
    c.get('user').id,
  )
  return c.json({ document }, 201)
})

knowledgeRoutes.delete('/:id', async (c) => {
  const removed = await deleteKnowledge(c.req.param('id'))
  if (!removed) throw new HTTPException(404, { message: 'knowledgeNotFound' })
  return c.json({ ok: true })
})
