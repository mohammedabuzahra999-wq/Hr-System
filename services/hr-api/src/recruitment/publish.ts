import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/client.js'
import { jobDescriptions, jobOpenings, jobPublications } from '../db/schema.js'

/**
 * Making a vacancy visible outside the company.
 *
 * Publishing is a workflow, not a status change, which is why it is here rather
 * than inline in the route: it refuses incomplete vacancies, allocates a public
 * address that has to stay stable forever, and records one row per platform.
 *
 * The platform rows are the point. "Published" is not one fact — the careers
 * page can be live while LinkedIn refused — and a single boolean would average
 * those into a claim that is true of neither.
 */

/** A vacancy cannot go public missing any of these. */
function missingFields(row: typeof jobOpenings.$inferSelect): string[] {
  const missing: string[] = []
  if (!row.titleEn.trim() && !row.titleAr.trim()) missing.push('title')
  if (!row.departmentEn.trim() && !row.departmentAr.trim()) missing.push('department')
  if (!row.locationEn.trim() && !row.locationAr.trim()) missing.push('location')
  if (!row.employmentType) missing.push('employmentType')
  return missing
}

/**
 * A readable, permanent address for the vacancy.
 *
 * Latin characters only, from the English title, with a short suffix from the
 * id so two "Software Engineer" openings a year apart do not collide. When the
 * title is Arabic-only there is nothing to transliterate honestly, so the slug
 * falls back to the department and the suffix — an opaque-but-stable URL beats
 * a mangled one.
 */
export function slugFor(titleEn: string, departmentEn: string, id: string): string {
  const base = (titleEn || departmentEn || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const suffix = id.replace(/-/g, '').slice(0, 6)
  return base ? `${base}-${suffix}` : `job-${suffix}`
}

/** Records how one platform's attempt ended, replacing any earlier attempt. */
async function recordPublication(
  openingId: string,
  platform: 'careers' | 'linkedin',
  outcome: { status: 'published' | 'failed' | 'pending'; externalJobId?: string | null; errorMessage?: string | null },
) {
  await db
    .insert(jobPublications)
    .values({
      openingId,
      platform,
      status: outcome.status,
      externalJobId: outcome.externalJobId ?? null,
      errorMessage: outcome.errorMessage ?? null,
      publishedAt: outcome.status === 'published' ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [jobPublications.openingId, jobPublications.platform],
      set: {
        status: outcome.status,
        externalJobId: outcome.externalJobId ?? null,
        errorMessage: outcome.errorMessage ?? null,
        publishedAt: outcome.status === 'published' ? new Date() : null,
        updatedAt: new Date(),
      },
    })
}

export async function publishOpening(id: string): Promise<void> {
  const rows = await db.select().from(jobOpenings).where(eq(jobOpenings.id, id)).limit(1)
  const opening = rows[0]
  if (!opening) throw new HTTPException(404, { message: 'openingNotFound' })

  const missing = missingFields(opening)
  if (missing.length > 0) {
    /**
     * The code and the detail travel separately.
     *
     * They used to be one string — `openingIncomplete:location,employmentType` —
     * which read well in a terminal and reached the user as "something went
     * wrong": the web app looks the code up in its dictionary, and a code with
     * a list glued to it matches nothing. The code is now a stable key, and
     * `missing` rides alongside for anyone debugging.
     */
    throw new HTTPException(422, {
      res: Response.json({ error: 'openingIncomplete', message: 'openingIncomplete', missing }, { status: 422 }),
    })
  }

  /**
   * A vacancy publishes its approved description. A draft one is by definition
   * not reviewed, and putting unreviewed text in front of candidates is exactly
   * what the approval step exists to prevent.
   */
  const description = await db
    .select({ id: jobDescriptions.id, status: jobDescriptions.status })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.openingId, id))
    .limit(1)

  if (!description[0]) throw new HTTPException(422, { message: 'openingHasNoDescription' })
  if (description[0].status !== 'approved') throw new HTTPException(422, { message: 'descriptionNotApproved' })

  /**
   * The slug is written once and never regenerated.
   *
   * By the time anyone renames a job, its URL is in sent emails and LinkedIn
   * posts. A link that has been shared has to keep working, so re-publishing
   * reuses the address the vacancy already has.
   */
  const slug = opening.publicSlug ?? slugFor(opening.titleEn, opening.departmentEn, opening.id)

  await db
    .update(jobOpenings)
    .set({
      status: 'open',
      closedOn: null,
      publicSlug: slug,
      publishedAt: opening.publishedAt ?? new Date(),
    })
    .where(eq(jobOpenings.id, id))

  // Our own careers page is served from our own database, so it is live the
  // moment the row says so — there is nothing that can fail here.
  await recordPublication(id, 'careers', { status: 'published' })

  /**
   * LinkedIn is recorded as pending, not attempted.
   *
   * Posting to LinkedIn programmatically needs Talent Solutions partner access,
   * which is granted to a company, not obtained with a key. Until this company
   * has it, HR publishes there by hand — so the row says `pending` and carries
   * the reason, which is the truth, rather than `failed`, which would read as a
   * bug to fix.
   */
  await recordPublication(id, 'linkedin', {
    status: 'pending',
    errorMessage: 'linkedinManualPublish',
  })
}
