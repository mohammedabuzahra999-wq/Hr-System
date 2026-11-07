import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { dayKey } from '../domain/workdays.js'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  jobDescriptionContentSchema,
  submitApplicationSchema,
  type SubmitApplicationInput,
} from '@hr/shared'
import { db } from '../db/client.js'
import { analyseInBackground } from '../ai/analyseCv.js'
import { notifyMany } from '../domain/notify.js'
import { applications, candidates, cvFiles, jobDescriptions, jobOpenings, users } from '../db/schema.js'
import { toPublicJob } from '../mappers.js'
import { validateBody, type AppEnv } from '../middleware.js'
import { rateLimit } from '../rateLimit.js'
import { publish } from '../realtime/bus.js'
import { saveUpload, UploadRejected } from '../storage/files.js'

/**
 * The careers page, and the form on it.
 *
 * Everything else in this server sits behind `requireAuth`. These four routes do
 * not, which makes them the only surface a stranger can reach — so the rules are
 * different here and stated rather than assumed:
 *
 *  - Nothing internal is returned. The shapes come from `toPublicJob`, built
 *    field by field from a separate type, so a column added to the HR view
 *    cannot appear here by inheritance.
 *  - Every route is rate limited. Reads generously, the form strictly.
 *  - The response to an application says only that it arrived. It does not say
 *    whether the email was already on file — an applicant who could learn that
 *    has been handed a way to test whether a particular person applied.
 *  - A vacancy is only reachable while it is published, open, and in date. The
 *    same predicate decides the list and the detail, so a link cannot outlive
 *    the listing it came from.
 */
export const careerRoutes = new Hono<AppEnv>()

// Local calendar, not UTC: `toISOString()` reports yesterday in Jordan
// between midnight and 3am, which would keep a lapsed vacancy open.
const today = () => dayKey(new Date())

/** Published, still open, and not past its deadline. Used by every route here. */
const visible = () =>
  and(
    eq(jobOpenings.status, 'open'),
    isNotNull(jobOpenings.publishedAt),
    isNotNull(jobOpenings.publicSlug),
    or(sql`${jobOpenings.deadline} is null`, sql`${jobOpenings.deadline} >= ${today()}`),
  )

/* ---------- reading ---------- */

careerRoutes.get(
  '/jobs',
  rateLimit({ name: 'careers-list', limit: 60, windowMs: 60_000 }),
  async (c) => {
    const rows = await db.select().from(jobOpenings).where(visible()).orderBy(desc(jobOpenings.publishedAt)).limit(100)
    return c.json({ jobs: rows.map(toPublicJob) })
  },
)

careerRoutes.get(
  '/jobs/:slug',
  rateLimit({ name: 'careers-detail', limit: 60, windowMs: 60_000 }),
  async (c) => {
    const rows = await db
      .select()
      .from(jobOpenings)
      .where(and(visible(), eq(jobOpenings.publicSlug, c.req.param('slug'))))
      .limit(1)

    if (!rows[0]) throw new HTTPException(404, { message: 'jobNotFound' })

    /**
     * Only the approved description is served.
     *
     * A draft is unreviewed by definition, and the whole point of the approval
     * step is that nobody outside the company reads text nobody inside it has.
     */
    const description = await db
      .select({ content: jobDescriptions.content })
      .from(jobDescriptions)
      .where(and(eq(jobDescriptions.openingId, rows[0].id), eq(jobDescriptions.status, 'approved')))
      .limit(1)

    const parsed = description[0] ? jobDescriptionContentSchema.safeParse(description[0].content) : null

    return c.json({
      job: { ...toPublicJob(rows[0]), description: parsed?.success ? parsed.data : null },
    })
  },
)

/* ---------- applying ---------- */

/**
 * Twenty applications an hour from one address.
 *
 * The first version of this was five, reasoning about one applicant. That was
 * the wrong unit: an address is not a person. A company, a university lab or a
 * café shares one public address between everybody on it, so five locks out the
 * sixth real applicant of the hour — and the most likely place a group of people
 * apply from the same network is a careers fair or a class, which is exactly who
 * this page is for.
 *
 * Twenty is still a hard ceiling on a script. Spam needs a fresh email per row —
 * applying twice with the same address to the same vacancy updates one row
 * rather than adding another — so this bounds an abuser to a few hundred junk
 * candidates a day from one address, which HR can clear, while leaving a shared
 * office far below the line.
 */
const applyLimit = rateLimit({ name: 'careers-apply', limit: 20, windowMs: 60 * 60 * 1000 })

careerRoutes.post(
  '/jobs/:slug/apply',
  applyLimit,
  validateBody(submitApplicationSchema),
  async (c) => {
    const input = c.get('body') as SubmitApplicationInput
    const rows = await db
      .select()
      .from(jobOpenings)
      .where(and(visible(), eq(jobOpenings.publicSlug, c.req.param('slug'))))
      .limit(1)

    const opening = rows[0]
    if (!opening) throw new HTTPException(404, { message: 'jobNotFound' })

    /**
     * A returning applicant is recognised, not duplicated.
     *
     * Their details are refreshed from what they just typed, because the newer
     * form is the better record of how to reach them — but `notes`, which is
     * HR's own writing about the person, is never touched by a public request.
     */
    const existing = await db
      .select()
      .from(candidates)
      .where(sql`lower(${candidates.email}) = ${input.email}`)
      .limit(1)

    const fields = {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      education: input.education ?? null,
      experience: input.experience ?? null,
      skills: input.skills ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
    }

    const candidate = existing[0]
      ? (await db
          .update(candidates)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(candidates.id, existing[0].id))
          .returning())[0]!
      : (await db.insert(candidates).values({ ...fields, createdBy: null }).returning())[0]!

    /**
     * Applying twice to the same vacancy updates the cover letter rather than
     * creating a second row — a double submission is a double-click, and the
     * unique constraint would otherwise surface as an error the applicant
     * cannot act on.
     */
    const createdApplication = (
      await db
        .insert(applications)
        .values({
          openingId: opening.id,
          candidateId: candidate.id,
          source: 'careers',
          coverLetter: input.coverLetter ?? null,
        })
        .onConflictDoNothing({ target: [applications.openingId, applications.candidateId] })
        .returning({ id: applications.id })
    )[0]

    if (!createdApplication) {
      await db
        .update(applications)
        .set({ coverLetter: input.coverLetter ?? null, updatedAt: new Date() })
        .where(and(eq(applications.openingId, opening.id), eq(applications.candidateId, candidate.id)))
    }

    // HR's list is live; this is what makes a new application appear on it.
    publish(
      { type: 'recruitment.changed', at: new Date().toISOString() },
      { kind: 'roles', roles: ['hr', 'admin'] },
    )

    /**
     * And a notification, for whoever is not looking at that list.
     *
     * Only to HR, not to administrators: an admin can see applications, but
     * nobody has asked them to act on one, and a bell that fills with other
     * people's work is a bell people stop reading.
     *
     * Deliberately not awaited by the response. An applicant should not wait on
     * our internal bookkeeping, and a failure here must not turn a received
     * application into an error they would retry.
     */
    void notifyHrOfApplication(candidate.fullName, opening).catch((e) =>
      console.error('[careers] could not notify HR:', e),
    )

    c.header('Cache-Control', 'private, no-store')
    return c.json({ received: true as const, jobTitle: { en: opening.titleEn, ar: opening.titleAr } }, 201)
  },
)

/**
 * The CV, uploaded separately after the form is accepted.
 *
 * Two requests rather than one multipart form because the validation differs in
 * kind: the form is checked against a schema, the file against its own first
 * bytes. Keeping them apart means a rejected file does not discard a filled-in
 * form, and the applicant is told which of the two was the problem.
 *
 * The same `saveUpload` the HR side uses — magic-byte sniffing, a size ceiling
 * and a generated filename — because a file arriving from the open internet
 * deserves at least what one from a signed-in employee gets.
 */
careerRoutes.post(
  '/jobs/:slug/cv',
  rateLimit({ name: 'careers-cv', limit: 20, windowMs: 60 * 60 * 1000 }),
  async (c) => {
    const email = c.req.query('email')?.trim().toLowerCase()
    if (!email) throw new HTTPException(400, { message: 'emailRequired' })

    const rows = await db
      .select()
      .from(jobOpenings)
      .where(and(visible(), eq(jobOpenings.publicSlug, c.req.param('slug'))))
      .limit(1)
    if (!rows[0]) throw new HTTPException(404, { message: 'jobNotFound' })

    /**
     * The file is only accepted for someone who has already applied to *this*
     * vacancy. Without that check the endpoint would attach files to any email
     * a caller names, which is both a way to fill the disk and a way to put a
     * document in a stranger's record.
     */
    const match = await db
      .select({ candidateId: candidates.id, applicationId: applications.id })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .where(and(eq(applications.openingId, rows[0].id), sql`lower(${candidates.email}) = ${email}`))
      .limit(1)

    if (!match[0]) throw new HTTPException(404, { message: 'applicationNotFound' })

    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HTTPException(400, { message: 'fileRequired' })

    try {
      const saved = await saveUpload(file)
      await db.insert(cvFiles).values({
        candidateId: match[0].candidateId,
        userId: null,
        fileName: saved.fileName,
        storedPath: saved.storedPath,
        content: saved.content,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        // Nobody signed in uploaded this, and saying an employee did would be a lie.
        uploadedBy: null,
      })
    } catch (error) {
      if (error instanceof UploadRejected) throw new HTTPException(415, { message: error.message })
      throw error
    }

    publish(
      { type: 'recruitment.changed', at: new Date().toISOString() },
      { kind: 'roles', roles: ['hr', 'admin'] },
    )

    /**
     * Read the CV against the vacancy, after replying.
     *
     * Not awaited: the applicant is told their file arrived the moment it is
     * stored, and a model that is slow or down must not turn a successful
     * upload into an error they would retry. The result appears on HR's list a
     * few seconds later.
     */
    analyseInBackground(match[0].applicationId)

    return c.json({ received: true })
  },
)

/**
 * Tells the HR team that someone applied.
 *
 * The message is stored as a key plus variables, never as finished text, so it
 * reads in whichever language the person opening the bell is using now — not
 * the one they happened to be using when the application arrived.
 */
async function notifyHrOfApplication(
  applicantName: string,
  opening: { titleEn: string; titleAr: string },
): Promise<void> {
  const hr = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'hr'), eq(users.isActive, true)))
  await notifyMany(
    hr.map((u) => u.id),
    'notif.newApplication',
    { name: applicantName, roleEn: opening.titleEn, roleAr: opening.titleAr },
  )
}
