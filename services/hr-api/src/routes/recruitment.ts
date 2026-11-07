import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { dayKey } from '../domain/workdays.js'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  type Application,
  interviewSummarySchema,
  interviewScheduleSchema,
  applicationFilterSchema,
  candidateFilterSchema,
  createJobOpeningSchema,
  updateApplicationSchema,
  updateCandidateSchema,
  updateJobOpeningSchema,
  type ApplicationFilter,
  type CandidateFilter,
  type CreateJobOpeningInput,
  type UpdateApplicationInput,
  type UpdateCandidateInput,
  type UpdateJobOpeningInput,
} from '@hr/shared'
import { db } from '../db/client.js'
import {
  applications,
  candidates,
  cvAnalyses,
  interviewAnswers,
  interviewQuestions,
  interviews,
  cvFiles,
  jobDescriptions,
  jobOpenings,
  jobPublications,
  users,
} from '../db/schema.js'
import { toApplication, toCandidate, toCvFile, toJobOpening } from '../mappers.js'
import { requireAuth, requireRole, validateBody, validateQuery, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { publish } from '../realtime/bus.js'
import { removeUpload } from '../storage/files.js'
import { publishOpening } from '../recruitment/publish.js'
import { analyseApplication } from '../ai/analyseCv.js'
import { createInterview } from '../recruitment/interview.js'
import { approveInterviewQuestion, getInterviewReview, reviseInterviewQuestion, sendApprovedInterview } from '../recruitment/interviewReview.js'
import { multipleChoiceResults } from '../recruitment/interviewResults.js'
import { evaluateInterview } from '../ai/evaluateInterview.js'

export const recruitmentRoutes = new Hono<AppEnv>()

/** Hiring is HR's and the administrator's. Managers do not see other teams' pipelines. */
recruitmentRoutes.use('*', requireAuth)
recruitmentRoutes.use('*', requireRole(...allowed('manageRecruitment')))

const changed = () =>
  publish({ type: 'recruitment.changed', at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })

type OpeningRow = typeof jobOpenings.$inferSelect
type CandidateRow = typeof candidates.$inferSelect
type ApplicationRow = typeof applications.$inferSelect
type AnalysisRow = typeof cvAnalyses.$inferSelect
type PublicationRow = typeof jobPublications.$inferSelect
type CvRow = typeof cvFiles.$inferSelect
type UserRow = typeof users.$inferSelect

// Local calendar, not UTC — see `domain/workdays`.
const interviewRevisionSchema = z.object({ feedback: z.string().trim().min(3).max(1000) })

const today = () => dayKey(new Date())

/**
 * The most recent CV per candidate.
 *
 * Older uploads stay in the table — replacing a CV should not destroy the one
 * HR already read — but only the current one is shown. Loaded once for a whole
 * list rather than per row.
 */
async function latestCvByCandidate(): Promise<Map<string, CvFileWithUploader>> {
  const files: { cv: CvRow; uploader: UserRow | null }[] = await db
    .select({ cv: cvFiles, uploader: users })
    .from(cvFiles)
    .leftJoin(users, eq(users.id, cvFiles.uploadedBy))
    .orderBy(desc(cvFiles.uploadedAt))

  const latest = new Map<string, CvFileWithUploader>()
  for (const f of files) {
    if (f.cv.candidateId && !latest.has(f.cv.candidateId)) latest.set(f.cv.candidateId, f)
  }
  return latest
}
type CvFileWithUploader = { cv: CvRow; uploader: UserRow | null }

/* ---------- openings ---------- */

/** Applications per opening, and publication rows per opening, in two queries. */
async function openingContext(ids: string[]) {
  const counts = ids.length
    ? await db
        .select({ openingId: applications.openingId, total: count() })
        .from(applications)
        .groupBy(applications.openingId)
    : []
  const pubs: PublicationRow[] = ids.length ? await db.select().from(jobPublications) : []
  const descriptions = ids.length
    ? await db
        .select({ id: jobDescriptions.id, openingId: jobDescriptions.openingId })
        .from(jobDescriptions)
        .where(eq(jobDescriptions.status, 'approved'))
    : []

  const byOpening = new Map(counts.map((r) => [r.openingId, Number(r.total)]))
  const pubsByOpening = new Map<string, PublicationRow[]>()
  for (const p of pubs) pubsByOpening.set(p.openingId, [...(pubsByOpening.get(p.openingId) ?? []), p])
  const descByOpening = new Map(descriptions.filter((d) => d.openingId).map((d) => [d.openingId!, d.id]))

  return { byOpening, pubsByOpening, descByOpening }
}

recruitmentRoutes.get('/openings', async (c) => {
  const rows: OpeningRow[] = await db.select().from(jobOpenings).orderBy(desc(jobOpenings.openedOn))
  const ctx = await openingContext(rows.map((r) => r.id))
  const day = today()

  return c.json({
    openings: rows.map((row) =>
      toJobOpening(
        row,
        ctx.byOpening.get(row.id) ?? 0,
        ctx.pubsByOpening.get(row.id) ?? [],
        ctx.descByOpening.get(row.id) ?? null,
        day,
      ),
    ),
  })
})

/** One opening, reloaded with everything that hangs off it. */
async function loadOpening(id: string) {
  const rows = await db.select().from(jobOpenings).where(eq(jobOpenings.id, id)).limit(1)
  if (!rows[0]) throw new HTTPException(404, { message: 'openingNotFound' })
  const ctx = await openingContext([id])
  return toJobOpening(
    rows[0],
    ctx.byOpening.get(id) ?? 0,
    ctx.pubsByOpening.get(id) ?? [],
    ctx.descByOpening.get(id) ?? null,
    today(),
  )
}

recruitmentRoutes.post('/openings', validateBody(createJobOpeningSchema), async (c) => {
  const actor = c.get('user')
  const input = c.get('body') as CreateJobOpeningInput

  const [row] = await db
    .insert(jobOpenings)
    .values({
      titleEn: input.title.en,
      titleAr: input.title.ar,
      departmentEn: input.department.en,
      departmentAr: input.department.ar,
      locationEn: input.location?.en ?? '',
      locationAr: input.location?.ar ?? '',
      employmentType: input.employmentType ?? null,
      deadline: input.deadline ?? null,
      openedOn: input.openedOn,
      createdBy: actor.id,
    })
    .returning()

  changed()
  return c.json(await loadOpening(row!.id), 201)
})

recruitmentRoutes.patch('/openings/:id', validateBody(updateJobOpeningSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.get('body') as UpdateJobOpeningInput

  const existing = await db.select().from(jobOpenings).where(eq(jobOpenings.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'openingNotFound' })

  /**
   * Closing stamps the date and reopening clears it, so `closedOn` can never
   * disagree with `status` — the pair is set together or not at all.
   *
   * `draft` is treated like a closure for this purpose: a vacancy pulled back
   * to draft is not open, and leaving a stale `closedOn` on it would misreport
   * when it last stopped accepting people.
   */
  const day = today()
  const closedOn =
    input.status === undefined
      ? undefined
      : input.status === 'open'
        ? null
        : (existing[0].closedOn ?? day)

  await db
    .update(jobOpenings)
    .set({
      ...(input.title ? { titleEn: input.title.en, titleAr: input.title.ar } : {}),
      ...(input.department ? { departmentEn: input.department.en, departmentAr: input.department.ar } : {}),
      ...(input.location ? { locationEn: input.location.en, locationAr: input.location.ar } : {}),
      ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
      ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
      ...(input.openedOn ? { openedOn: input.openedOn } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(closedOn === undefined ? {} : { closedOn }),
    })
    .where(eq(jobOpenings.id, id))

  changed()
  return c.json(await loadOpening(id))
})

/**
 * Publishing: the one action that makes a vacancy visible outside the company.
 *
 * The work lives in `recruitment/publish.ts` because it is a workflow, not a
 * database write — it validates, allocates the public slug, and records one row
 * per platform. This handler is the door.
 */
recruitmentRoutes.post('/openings/:id/publish', async (c) => {
  const id = c.req.param('id')
  await publishOpening(id)
  changed()
  return c.json(await loadOpening(id))
})

/* ---------- candidates: the people ---------- */

async function loadCandidates(filter: CandidateFilter) {
  const rows: CandidateRow[] = await db
    .select()
    .from(candidates)
    .where(
      filter.search
        ? or(ilike(candidates.fullName, `%${filter.search}%`), ilike(candidates.email, `%${filter.search}%`))
        : undefined,
    )
    .orderBy(desc(candidates.createdAt))
    .limit(200)

  if (rows.length === 0) return []

  const latest = await latestCvByCandidate()
  const counts = await db
    .select({ candidateId: applications.candidateId, total: count() })
    .from(applications)
    .groupBy(applications.candidateId)
  const byCandidate = new Map(counts.map((r) => [r.candidateId, Number(r.total)]))

  return rows.map((row) => {
    const found = latest.get(row.id)
    return toCandidate(row, found ? toCvFile(found.cv, found.uploader) : null, byCandidate.get(row.id) ?? 0)
  })
}

recruitmentRoutes.get('/candidates', validateQuery(candidateFilterSchema), async (c) =>
  c.json({ candidates: await loadCandidates(c.get('query') as CandidateFilter) }),
)

/**
 * Candidates arrive through the careers page, not by hand.
 *
 * `POST /candidates` used to exist for a form on the recruitment screen. The
 * form is gone: every applicant now comes in through the public page, which
 * already matches a returning one on email and attaches their CV, so typing
 * somebody in was a second way to create a record that could disagree with the
 * first.
 *
 * The route went with the form rather than being left behind. An endpoint no
 * screen calls is still an endpoint anybody can call, and it is the kind of
 * thing that is later mistaken for a feature somebody forgot to finish.
 */
recruitmentRoutes.patch('/candidates/:id', validateBody(updateCandidateSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.get('body') as UpdateCandidateInput

  const existing = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'candidateNotFound' })

  await db
    .update(candidates)
    .set({
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.education !== undefined ? { education: input.education } : {}),
      ...(input.experience !== undefined ? { experience: input.experience } : {}),
      ...(input.skills !== undefined ? { skills: input.skills } : {}),
      ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, id))

  changed()
  const all = await loadCandidates({})
  const updated = all.find((x) => x.id === id)
  if (!updated) throw new HTTPException(404, { message: 'candidateNotFound' })
  return c.json(updated)
})

/**
 * Deleting a candidate takes their files and applications with them.
 *
 * `ON DELETE CASCADE` removes the rows, but nothing in the database knows about
 * the bytes on disk, so the paths are read first and the files unlinked after.
 */
recruitmentRoutes.delete('/candidates/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'candidateNotFound' })

  const files = await db.select({ storedPath: cvFiles.storedPath }).from(cvFiles).where(eq(cvFiles.candidateId, id))
  await db.delete(candidates).where(eq(candidates.id, id))
  await Promise.all(files.map((f) => removeUpload(f.storedPath)))

  changed()
  return c.json({ ok: true, filesRemoved: files.length })
})

/* ---------- applications: the pairings ---------- */

async function loadApplications(filter: ApplicationFilter) {
  const rows: { app: ApplicationRow; opening: OpeningRow; candidate: CandidateRow; analysis: AnalysisRow | null }[] =
    await db
    .select({ app: applications, opening: jobOpenings, candidate: candidates, analysis: cvAnalyses })
    .from(applications)
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    // Left, not inner: an application with no reading is still an application.
    .leftJoin(cvAnalyses, eq(cvAnalyses.applicationId, applications.id))
    .where(
      and(
        filter.openingId ? eq(applications.openingId, filter.openingId) : undefined,
        filter.candidateId ? eq(applications.candidateId, filter.candidateId) : undefined,
        filter.status ? eq(applications.status, filter.status) : undefined,
        filter.search
          ? or(ilike(candidates.fullName, `%${filter.search}%`), ilike(candidates.email, `%${filter.search}%`))
          : undefined,
      ),
    )
    .orderBy(desc(applications.appliedAt))
    .limit(200)

  if (rows.length === 0) return []
  const latest = await latestCvByCandidate()

  /*
   * Interviews for this page, counted in one pass.
   *
   * Per card it would be a query each, and the answered count another — which
   * is how a list of twenty applications becomes forty round trips for two
   * numbers.
   */
  const ids = rows.map((r) => r.app.id)
  const ivs = await db
    .select({
      applicationId: interviews.applicationId,
      status: interviews.status,
      token: interviews.token,
      expiresAt: interviews.expiresAt,
      opensAt: interviews.opensAt,
      durationMinutes: interviews.durationMinutes,
      evaluation: interviews.evaluation,
      questionId: interviewQuestions.id,
      answerId: interviewAnswers.id,
    })
    .from(interviews)
    .leftJoin(interviewQuestions, eq(interviewQuestions.interviewId, interviews.id))
    .leftJoin(interviewAnswers, eq(interviewAnswers.questionId, interviewQuestions.id))
    .where(inArray(interviews.applicationId, ids))

  const byApplication = new Map<string, NonNullable<Application['interview']>>()
  for (const row of ivs) {
    const found = byApplication.get(row.applicationId) ?? {
      /* Expiry is a fact about the clock, not a status anybody set. */
      status: row.expiresAt.getTime() < Date.now() ? ('expired' as const) : row.status,
      token: row.token,
      questions: 0,
      answered: 0,
      opensAt: row.opensAt?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
      expiresAt: row.expiresAt.toISOString(),
      /* Read leniently: an assessment that will not parse is reported as none. */
      evaluation: row.status === 'completed' ? (() => {
        const parsed = interviewSummarySchema.shape.evaluation.safeParse(row.evaluation)
        return parsed.success ? parsed.data : null
      })() : null,
    }
    if (row.questionId) found.questions += 1
    if (row.answerId) found.answered += 1
    byApplication.set(row.applicationId, found)
  }

  for (const interview of byApplication.values()) {
    if (interview.questions === 0 || interview.answered !== interview.questions) {
      interview.evaluation = null
    }
  }

  return rows.map(({ app, opening, candidate, analysis }) => {
    const found = latest.get(candidate.id)
    return toApplication(
      app,
      opening,
      candidate,
      found ? toCvFile(found.cv, found.uploader) : null,
      analysis,
      byApplication.get(app.id) ?? null,
    )
  })
}

recruitmentRoutes.get('/applications', validateQuery(applicationFilterSchema), async (c) =>
  c.json({ applications: await loadApplications(c.get('query') as ApplicationFilter) }),
)

/**
 * Moving an application along.
 *
 * Status lives here rather than on the candidate because the same person can be
 * rejected for one role and hired into another — a status on the person cannot
 * express that, which is the whole reason this table exists.
 */
recruitmentRoutes.patch('/applications/:id', validateBody(updateApplicationSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.get('body') as UpdateApplicationInput

  const existing = await db.select().from(applications).where(eq(applications.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'applicationNotFound' })

  await db
    .update(applications)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.decisionNote !== undefined ? { decisionNote: input.decisionNote } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))

  changed()
  const all = await loadApplications({})
  const updated = all.find((x) => x.id === id)
  if (!updated) throw new HTTPException(404, { message: 'applicationNotFound' })
  return c.json(updated)
})

recruitmentRoutes.delete('/applications/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await db.select().from(applications).where(eq(applications.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'applicationNotFound' })

  await db.delete(applications).where(eq(applications.id, id))
  changed()
  return c.json({ ok: true })
})

/**
 * Deleting a vacancy — only one nobody has applied to.
 *
 * A vacancy with applications is a record of who wanted the job and what HR
 * decided about them, and `ON DELETE CASCADE` would take all of it. Closing is
 * how a filled or abandoned role is retired; deleting is for the one created by
 * mistake five minutes ago.
 */
recruitmentRoutes.delete('/openings/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await db.select().from(jobOpenings).where(eq(jobOpenings.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'openingNotFound' })

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(applications)
    .where(eq(applications.openingId, id))

  if (Number(total) > 0) throw new HTTPException(409, { message: 'openingHasApplications' })

  await db.delete(jobOpenings).where(eq(jobOpenings.id, id))
  changed()
  return c.json({ ok: true })
})

/**
 * Reading a CV again.
 *
 * Needed because the reasons a reading fails are mostly temporary — the model
 * was rate limited, the key was missing, the vacancy had no approved
 * description yet — and without this, an application that failed once would
 * carry "could not be read" for the rest of its life.
 */
/**
 * Sending one applicant a written interview.
 *
 * HR only, and the whole router is already behind `manageRecruitment`, so the
 * gate is the same one that guards every other hiring action. What comes back
 * is the link to give the candidate; it is the only time the token is returned,
 * because after this it is a credential rather than a result.
 */
/**
 * Read the answers again.
 *
 * For an interview whose evaluation failed, or one HR wants re-read after
 * changing the weights. It is the same function the candidate's last answer
 * fires, so there is one way an assessment is produced.
 */
recruitmentRoutes.post('/applications/:id/interview/evaluate', async (c) => {
  const row = (
    await db
      .select({ id: interviews.id, status: interviews.status })
      .from(interviews)
      .where(eq(interviews.applicationId, c.req.param('id')))
      .limit(1)
  )[0]
  if (!row) throw new HTTPException(404, { message: 'interviewNotFound' })
  if (row.status !== 'completed') throw new HTTPException(409, { message: 'interviewNotCompleted' })
  await evaluateInterview(row.id)
  changed()
  return c.json({ ok: true })
})

recruitmentRoutes.get('/applications/:id/interview', async (c) => c.json(await getInterviewReview(c.req.param('id'))))

recruitmentRoutes.get('/applications/:id/interview/results', async (c) => c.json(await multipleChoiceResults(c.req.param('id'))))

recruitmentRoutes.post('/applications/:id/interview/questions/:questionId/approve', async (c) => {
  const actor = c.get('user')
  const review = await approveInterviewQuestion(c.req.param('id'), c.req.param('questionId'), actor.id)
  changed()
  return c.json(review)
})

recruitmentRoutes.post(
  '/applications/:id/interview/questions/:questionId/revise',
  validateBody(interviewRevisionSchema),
  async (c) => {
    const actor = c.get('user')
    const { feedback } = c.get('body') as z.infer<typeof interviewRevisionSchema>
    const review = await reviseInterviewQuestion(c.req.param('id'), c.req.param('questionId'), feedback, actor.id)
    changed()
    return c.json(review)
  },
)

recruitmentRoutes.post('/applications/:id/interview/send', validateBody(interviewScheduleSchema), async (c) => {
  const schedule = c.get('body') as { opensAt: string; durationMinutes: number }
  const sent = await sendApprovedInterview(c.req.param('id'), {
    opensAt: new Date(schedule.opensAt),
    durationMinutes: schedule.durationMinutes,
  })
  changed()
  return c.json(sent)
})
recruitmentRoutes.post('/applications/:id/interview', async (c) => {
  const actor = c.get('user')
  const made = await createInterview(c.req.param('id'), actor.id)
  changed()
  return c.json(made, 201)
})

recruitmentRoutes.post('/applications/:id/analyse', async (c) => {
  const id = c.req.param('id')
  const existing = await db.select({ id: applications.id }).from(applications).where(eq(applications.id, id)).limit(1)
  if (!existing[0]) throw new HTTPException(404, { message: 'applicationNotFound' })

  await analyseApplication(id)
  changed()
  const all = await loadApplications({})
  return c.json(all.find((x) => x.id === id) ?? null)
})
