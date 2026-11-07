import { aliasedTable, and, desc, eq } from 'drizzle-orm'
import { dayKey } from '../domain/workdays.js'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  generateJobDescriptionSchema,
  jobDescriptionContentSchema,
  jobDescriptionFilterSchema,
  regenerateSectionSchema,
  updateJobDescriptionSchema,
  type GenerateJobDescriptionInput,
  type JobDescriptionContent,
  type JobDescriptionFilter,
  type RegenerateSectionInput,
  type UpdateJobDescriptionInput,
} from '@hr/shared'
import { AiFailure, embed, embeddableText, jobDescriptionProvider, PROMPT_VERSION } from '../ai/index.js'
import { db } from '../db/client.js'
import { aiGenerations, jobDescriptions, jobOpenings, users } from '../db/schema.js'
import { toJobDescription } from '../mappers.js'
import { publish } from '../realtime/bus.js'
import { requireAuth, requireRole, validateBody, validateQuery, type AppEnv } from '../middleware.js'
import { deriveCriteria, scorecardSchema, type Scorecard } from '@hr/shared'
import { benchmarkFor } from '../ai/benchmark.js'
import { allowed } from '../permissions.js'

export const jobDescriptionRoutes = new Hono<AppEnv>()

/**
 * Drafting job descriptions is HR's, and an administrator's.
 *
 * Not a manager's: a job description is a document the company publishes, and
 * the plan this was built from puts it with the people who own hiring policy.
 */
jobDescriptionRoutes.use('*', requireAuth)
jobDescriptionRoutes.use('*', requireRole(...allowed('manageJobDescriptions')))

const generatedBy = aliasedTable(users, 'generated_by_user')
const approvedBy = aliasedTable(users, 'approved_by_user')

type UserRow = typeof users.$inferSelect
type OpeningRow = typeof jobOpenings.$inferSelect

interface Joined {
  jd: typeof jobDescriptions.$inferSelect
  opening: OpeningRow | null
  generatedBy: UserRow | null
  approvedBy: UserRow | null
}

const selectJoined = () =>
  db
    .select({ jd: jobDescriptions, opening: jobOpenings, generatedBy, approvedBy })
    .from(jobDescriptions)
    .leftJoin(jobOpenings, eq(jobOpenings.id, jobDescriptions.openingId))
    .leftJoin(generatedBy, eq(generatedBy.id, jobDescriptions.generatedBy))
    .leftJoin(approvedBy, eq(approvedBy.id, jobDescriptions.approvedBy))
    .$dynamic()

const shape = (r: Joined) => toJobDescription(r.jd, r.opening, r.generatedBy, r.approvedBy)

async function loadOne(id: string) {
  const rows: Joined[] = await selectJoined().where(eq(jobDescriptions.id, id)).limit(1)
  if (!rows[0]) throw new HTTPException(404, { message: 'jobDescriptionNotFound' })
  return rows[0]
}

/**
 * Records the attempt, succeeded or failed.
 *
 * Deliberately outside the success path so a failure is logged too — the rows
 * that explain a bill and the rows that explain an outage are the same rows,
 * and only keeping the happy ones would hide both.
 */
async function logGeneration(entry: {
  kind: string
  jobDescriptionId: string | null
  requestedBy: string
  input: Record<string, unknown>
  inputTokens?: number | null
  outputTokens?: number | null
  durationMs: number
  ok: boolean
  errorCode?: string
}) {
  await db
    .insert(aiGenerations)
    .values({
      kind: entry.kind,
      jobDescriptionId: entry.jobDescriptionId,
      requestedBy: entry.requestedBy,
      model: jobDescriptionProvider.name,
      promptVersion: PROMPT_VERSION,
      input: entry.input,
      inputTokens: entry.inputTokens ?? null,
      outputTokens: entry.outputTokens ?? null,
      durationMs: entry.durationMs,
      ok: entry.ok,
      errorCode: entry.errorCode ?? null,
    })
    .catch((e) => console.error('[ai] could not write generation log:', e))
}

/** An AI failure is a 503 with a translatable code — never a provider message. */
function aiHttp(failure: AiFailure): HTTPException {
  console.error(`[ai] ${failure.code}${failure.detail ? `: ${failure.detail}` : ''}`)
  return new HTTPException(503, { message: failure.code })
}

/**
 * Give a document its place in meaning-space, so later requests can find it.
 *
 * Deliberately after the insert and deliberately not awaited by the caller in
 * the failure case: an embedding outage should cost retrieval quality on the
 * next request, never the generation the user just waited eight seconds for.
 */
async function embedDocument(id: string, content: JobDescriptionContent) {
  const vector = await embed(embeddableText(content))
  if (!vector) return
  await db
    .update(jobDescriptions)
    .set({ embedding: vector })
    .where(eq(jobDescriptions.id, id))
    .catch((e) => console.error('[ai] could not store embedding:', e))
}
/* ---------- the library ---------- */

jobDescriptionRoutes.get('/', validateQuery(jobDescriptionFilterSchema), async (c) => {
  const filter = c.get('query') as JobDescriptionFilter
  const rows: Joined[] = await selectJoined()
    .where(
      and(
        filter.status ? eq(jobDescriptions.status, filter.status) : undefined,
        filter.openingId ? eq(jobDescriptions.openingId, filter.openingId) : undefined,
      ),
    )
    .orderBy(desc(jobDescriptions.updatedAt))
    .limit(100)

  return c.json({
    jobDescriptions: rows.map(shape),
    /** So the UI can say plainly whether a model is behind this. */
    provider: { name: jobDescriptionProvider.name, isModel: jobDescriptionProvider.isModel },
  })
})

jobDescriptionRoutes.get('/:id', async (c) => c.json({ jobDescription: shape(await loadOne(c.req.param('id'))) }))

/* ---------- generating ---------- */

/**
 * Generate and save as a draft in one step.
 *
 * Saved immediately rather than held in the browser: a generation costs money
 * and takes seconds, and losing it to a closed tab is a worse outcome than a
 * draft nobody kept. Drafts are visibly drafts and can be deleted.
 */
jobDescriptionRoutes.post('/generate', validateBody(generateJobDescriptionSchema), async (c) => {
  const actor = c.get('user')
  const input = c.get('body') as GenerateJobDescriptionInput
  const started = Date.now()

  if (input.openingId) {
    const found = await db.select({ id: jobOpenings.id }).from(jobOpenings).where(eq(jobOpenings.id, input.openingId)).limit(1)
    if (!found[0]) throw new HTTPException(404, { message: 'openingNotFound' })
  }

  let result
  try {
    result = await jobDescriptionProvider.generate(input)
  } catch (error) {
    const failure = error instanceof AiFailure ? error : new AiFailure('aiUnavailable', String(error))
    await logGeneration({
      kind: 'generate',
      jobDescriptionId: null,
      requestedBy: actor.id,
      input,
      durationMs: Date.now() - started,
      ok: false,
      errorCode: failure.code,
    })
    throw aiHttp(failure)
  }

  const content = jobDescriptionContentSchema.parse(result.content)
  const [row] = await db
    .insert(jobDescriptions)
    .values({
      titleEn: content.title.en,
      titleAr: content.title.ar,
      departmentEn: input.department?.trim() ?? '',
      departmentAr: input.department?.trim() ?? '',
      level: input.level ?? null,
      employmentType: input.employmentType ?? null,
      content,
      openingId: input.openingId ?? null,
      model: jobDescriptionProvider.name,
      promptVersion: PROMPT_VERSION,
      generatedBy: actor.id,
      generatedAt: new Date(),
    })
    .returning()

  await embedDocument(row!.id, content)

  await logGeneration({
    kind: 'generate',
    jobDescriptionId: row!.id,
    requestedBy: actor.id,
    input,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: Date.now() - started,
    ok: true,
  })

  return c.json({ jobDescription: shape(await loadOne(row!.id)) }, 201)
})

/** Rewriting one section, leaving the rest exactly as it is. */
jobDescriptionRoutes.post('/:id/regenerate', validateBody(regenerateSectionSchema), async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const { section, instruction } = c.get('body') as RegenerateSectionInput
  const existing = await loadOne(id)
  const started = Date.now()

  let result
  try {
    result = await jobDescriptionProvider.regenerate(
      section,
      existing.jd.content as unknown as JobDescriptionContent,
      instruction,
    )
  } catch (error) {
    const failure = error instanceof AiFailure ? error : new AiFailure('aiUnavailable', String(error))
    await logGeneration({
      kind: `regenerate:${section}`,
      jobDescriptionId: id,
      requestedBy: actor.id,
      input: { section, instruction },
      durationMs: Date.now() - started,
      ok: false,
      errorCode: failure.code,
    })
    throw aiHttp(failure)
  }

  const content = jobDescriptionContentSchema.parse(result.content)
  await db
    .update(jobDescriptions)
    .set({ content, titleEn: content.title.en, titleAr: content.title.ar, updatedAt: new Date() })
    .where(eq(jobDescriptions.id, id))

  await embedDocument(id, content)

  await logGeneration({
    kind: `regenerate:${section}`,
    jobDescriptionId: id,
    requestedBy: actor.id,
    input: { section, instruction },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: Date.now() - started,
    ok: true,
  })

  return c.json({ jobDescription: shape(await loadOne(id)) })
})

/* ---------- editing, approving, removing ---------- */

/**
 * Editing by hand.
 *
 * Any change to the text sets `editedByHuman`, permanently. It is the flag that
 * lets a reader tell a document a person has been through from one that came
 * straight out of the model, and it is never cleared — a later regeneration
 * does not undo the fact that somebody once reviewed this.
 */
jobDescriptionRoutes.patch('/:id', validateBody(updateJobDescriptionSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.get('body') as UpdateJobDescriptionInput
  const existing = await loadOne(id)

  const merged = input.content
    ? jobDescriptionContentSchema.parse({
        ...(existing.jd.content as unknown as JobDescriptionContent),
        ...input.content,
      })
    : null

  if (input.openingId) {
    const found = await db.select({ id: jobOpenings.id }).from(jobOpenings).where(eq(jobOpenings.id, input.openingId)).limit(1)
    if (!found[0]) throw new HTTPException(404, { message: 'openingNotFound' })
  }

  await db
    .update(jobDescriptions)
    .set({
      ...(merged ? { content: merged, titleEn: merged.title.en, titleAr: merged.title.ar } : {}),
      ...(input.department ? { departmentEn: input.department.en, departmentAr: input.department.ar } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
      ...(input.openingId !== undefined ? { openingId: input.openingId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(merged ? { editedByHuman: true } : {}),
      updatedAt: new Date(),
    })
    .where(eq(jobDescriptions.id, id))

  // The text changed, so its position in meaning-space has to change with it.
  if (merged) await embedDocument(id, merged)

  return c.json({ jobDescription: shape(await loadOne(id)) })
})

/**
 * Approving.
 *
 * Names the person, not just the moment — "approved" with nobody attached is
 * the kind of record that answers no question anyone will actually ask later.
 */

/**
 * Creates the vacancy a description becomes once it is approved.
 *
 * Returns the new vacancy's id, or null when the description already has one —
 * approving something twice must not leave two vacancies behind.
 *
 * The vacancy is built from the description rather than typed again: the title,
 * department and employment type were just agreed, and asking someone to retype
 * what they approved a second ago is how the two drift apart. Location is the
 * one field left empty, because a description never states it — the prompt
 * forbids inventing where a company is — so HR fills it in before publishing.
 *
 * It is created as a draft, and that is the point of the split: approving the
 * text and showing it to the world are different decisions by different people
 * on different days. Approval puts it in the hiring list; publishing is still a
 * deliberate press.
 */
async function createOpeningFor(
  jd: typeof jobDescriptions.$inferSelect,
  actorId: string,
): Promise<string | null> {
  if (jd.openingId) return null

  const content = jd.content as unknown as JobDescriptionContent
  const [opening] = await db
    .insert(jobOpenings)
    .values({
      titleEn: content.title.en || jd.titleEn,
      titleAr: content.title.ar || jd.titleAr,
      departmentEn: jd.departmentEn,
      departmentAr: jd.departmentAr,
      employmentType: jd.employmentType,
      locationEn: '',
      locationAr: '',
      openedOn: dayKey(new Date()),
      createdBy: actorId,
    })
    .returning()

  await db.update(jobDescriptions).set({ openingId: opening!.id, updatedAt: new Date() }).where(eq(jobDescriptions.id, jd.id))

  // The recruitment page is live; this is what makes the vacancy appear on it.
  publish({ type: 'recruitment.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })
  return opening!.id
}

/**
 * What this role weighs, and how heavily.
 *
 * The criteria are derived from the document every time rather than stored, so
 * this cannot return a requirement the description no longer contains. Stored
 * weights are merged on by wording; anything nobody has weighted comes back at
 * the default for its kind, which is why this opens with sensible numbers in it
 * instead of an empty form.
 */
jobDescriptionRoutes.get('/:id/scorecard', async (c) => {
  const row = await loadOne(c.req.param('id'))
  const content = jobDescriptionContentSchema.safeParse(row.jd.content)
  if (!content.success) throw new HTTPException(422, { message: 'jobDescriptionMalformed' })

  const stored = scorecardSchema.safeParse(row.jd.scorecard)
  const criteria = deriveCriteria(content.data, stored.success ? stored.data : null)
  return c.json({
    criteria,
    /*
     * What the people hired into this role had evidenced.
     *
     * Shown while the weights are being set, which is the moment it is useful:
     * "every one we hired showed Git" is an argument for weighting Git, made to
     * the person who decides, rather than a number applied behind their back.
     */
    benchmark: await benchmarkFor(row.jd.id, criteria),
  })
})

/**
 * Setting the weights.
 *
 * Replaces the whole set rather than patching one, because a scorecard is read
 * as a set: what a requirement is worth only means anything beside what the
 * others are worth, and half-applied weights would score candidates against a
 * rubric nobody chose.
 *
 * Nothing here touches an analysis that has already run. Those keep the score
 * they were given, which is the honest behaviour \u2014 re-scoring old candidates
 * under a new rubric silently would change a ranking somebody may have already
 * acted on.
 */
jobDescriptionRoutes.put('/:id/scorecard', validateBody(scorecardSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.get('body') as Scorecard
  const row = await loadOne(id)

  const content = jobDescriptionContentSchema.safeParse(row.jd.content)
  if (!content.success) throw new HTTPException(422, { message: 'jobDescriptionMalformed' })

  /*
   * Only weights for requirements this document actually has.
   *
   * A label that matches nothing would sit in the row forever, weighing a
   * requirement that does not exist, and reappear as a puzzle the day somebody
   * edited the description back.
   */
  const real = new Set(deriveCriteria(content.data, null).map((crit) => crit.key))
  const weights = input.weights.filter((w) => real.has(w.key))

  /*
   * An added requirement may not shadow one the document already states.
   *
   * Otherwise the same thing is weighed twice under two rows, and the second
   * one silently wins on the screen while both count in the sum.
   */
  const seen = new Set(real)
  const extra = (input.extra ?? []).filter((e) => {
    const key = e.key.trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  await db
    .update(jobDescriptions)
    .set({ scorecard: { weights, extra } as unknown as Record<string, unknown> })
    .where(eq(jobDescriptions.id, id))

  const stored = scorecardSchema.parse({ weights, extra })
  return c.json({ criteria: deriveCriteria(content.data, stored) })
})

jobDescriptionRoutes.post('/:id/approve', async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const existing = await loadOne(id)
  if (existing.jd.status === 'approved') throw new HTTPException(409, { message: 'alreadyApproved' })

  await db
    .update(jobDescriptions)
    .set({ status: 'approved', approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobDescriptions.id, id))

  /**
   * Approving is what puts the role into hiring.
   *
   * It used to take a second, separate press — approve here, then "create a
   * vacancy" on the same screen — which is two decisions where HR only ever
   * makes one. Approving a job description *is* deciding the company will hire
   * for it. So the vacancy appears by itself, as a draft, and the only thing
   * left to decide is whether to publish it.
   *
   * A draft nobody wants can be deleted from the recruitment page.
   */
  const openingId = await createOpeningFor(existing.jd, actor.id)

  return c.json({ jobDescription: shape(await loadOne(id)), openingId })
})

jobDescriptionRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await loadOne(id)
  await db.delete(jobDescriptions).where(eq(jobDescriptions.id, id))
  return c.json({ ok: true })
})

/**
 * Turns an approved description into a vacancy, ready to publish.
 *
 * This is the step that was missing. A description could be generated and
 * approved, and a vacancy could be created and published, but nothing joined
 * them: `job_descriptions.opening_id` existed with no way to set it, so HR had
 * an approved document and a vacancy that could never carry it.
 *
 * The vacancy is built from the description rather than typed again — the title,
 * department and employment type are already agreed, and asking someone to
 * retype what they just approved is how the two drift apart.
 *
 * It is created as a draft. Creating a vacancy and publishing it are different
 * decisions: publishing is what makes it visible to the world, and that stays a
 * deliberate second press on the recruitment page.
 */
jobDescriptionRoutes.post('/:id/create-opening', async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const existing = await loadOne(id)

  /**
   * Approved only. A vacancy exists to be published, publishing refuses an
   * unapproved description, and creating one here from a draft would hand HR a
   * vacancy that cannot go anywhere.
   */
  if (existing.jd.status !== 'approved') throw new HTTPException(422, { message: 'descriptionNotApproved' })
  if (existing.jd.openingId) throw new HTTPException(409, { message: 'descriptionAlreadyLinked' })

  const openingId = await createOpeningFor(existing.jd, actor.id)
  return c.json({ openingId, jobDescription: shape(await loadOne(id)) }, 201)
})
