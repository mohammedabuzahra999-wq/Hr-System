import { and, desc, eq, gt, sql } from 'drizzle-orm'
import type { CopilotAction, CopilotIntent, Role } from '@hr/shared'
import { db } from '../db/client.js'
import { assistantMemory } from '../db/schema.js'

/**
 * Getting better from use, without training on anybody.
 *
 * The thing that improves here is the *routing*: which question or action a
 * sentence means. Nothing about the data is learned, no model is fine-tuned,
 * and no employee's figures leave the database — the sentence and the decision
 * are kept, and the answer is not.
 *
 * Two properties come out of that, and the first is the reason this exists.
 *
 * **It makes classification stable.** At temperature zero the model is nearly
 * deterministic, not deterministic: "publish the payroll officer vacancy"
 * resolved correctly, then a minute later did not. A person who is refused,
 * rephrases, and then succeeds with the same words has learned that the system
 * is moody. Once a routing has been accepted by a human, it is remembered, and
 * the same sentence routes the same way from then on.
 *
 * **It makes the gaps countable.** Every refusal recorded here is somebody who
 * wanted something and did not get it, in their own words. That is a better
 * account of what to build next than anyone's guess about what people need.
 *
 * What it deliberately never does:
 *
 *  - **Learn from anything a human declined.** A proposal someone backed out of
 *    is the strongest available evidence the routing was wrong; one rejection
 *    stops a memory being used again. Counting it as data would be learning the
 *    opposite of what they said.
 *  - **Remember parameters.** "Leave tomorrow" meant one pair of dates when it
 *    was said and means another today. Only the action is kept; the specifics
 *    are worked out fresh every time.
 *  - **Bypass a permission check.** A remembered routing is a hint about
 *    meaning, not a grant. The role gate and every ownership check run exactly
 *    as they would have.
 */

/**
 * The form a sentence is matched on.
 *
 * Case and surrounding space are noise. Arabic diacritics are stripped for the
 * same reason — "سجّل" and "سجل" are the same instruction typed by two people,
 * and treating them as different memories would mean learning each phrasing
 * twice over.
 */
export function normalise(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')
    .replace(/\s+/g, ' ')
}

export interface Remembered {
  kind: 'question' | 'instruction'
  intent: CopilotIntent | null
  action: CopilotAction | null
}

/**
 * What this sentence meant last time, if a human accepted it.
 *
 * Deliberately strict: accepted at least once, rejected never. A memory with
 * any rejection against it is not a weak signal to weigh up, it is a wrong
 * answer somebody already caught.
 */
export async function recall(question: string, role: Role): Promise<Remembered | null> {
  const rows = await db
    .select()
    .from(assistantMemory)
    .where(
      and(
        eq(assistantMemory.normalised, normalise(question)),
        eq(assistantMemory.role, role),
        gt(assistantMemory.acceptedCount, 0),
        eq(assistantMemory.rejectedCount, 0),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    kind: row.kind === 'instruction' ? 'instruction' : 'question',
    intent: (row.intent as CopilotIntent) ?? null,
    action: (row.action as CopilotAction) ?? null,
  }
}

type Outcome =
  /** A human saw the result and took it. */
  | { kind: 'accepted' }
  /** A human saw the proposal and backed out. */
  | { kind: 'rejected' }
  /** It never got that far. */
  | { kind: 'refused'; reason: string }

/**
 * Recording what happened, without ever failing the request over it.
 *
 * A memory that cannot be written is a lost improvement, not a lost answer —
 * so this swallows its own errors. The alternative is a person being told
 * their leave request failed because a logging table was locked.
 */
export async function remember(
  question: string,
  role: Role,
  what: { kind: 'question'; intent: CopilotIntent } | { kind: 'instruction'; action: CopilotAction },
  outcome: Outcome,
): Promise<void> {
  const normalised = normalise(question)
  /* Nothing useful is learned from two words, and plenty of noise is. */
  if (normalised.length < 6) return

  const row = {
    normalised,
    role,
    kind: what.kind,
    intent: what.kind === 'question' ? what.intent : null,
    action: what.kind === 'instruction' ? what.action : null,
    acceptedCount: outcome.kind === 'accepted' ? 1 : 0,
    rejectedCount: outcome.kind === 'rejected' ? 1 : 0,
    refusedCount: outcome.kind === 'refused' ? 1 : 0,
    lastRefusal: outcome.kind === 'refused' ? outcome.reason : null,
  }

  await db
    .insert(assistantMemory)
    .values(row)
    .onConflictDoUpdate({
      target: [assistantMemory.normalised, assistantMemory.role],
      set: {
        /*
         * The routing is overwritten, the counts accumulate. A sentence that
         * used to mean one thing and now means another should follow the new
         * reading; a sentence that has been rejected once should carry that
         * rejection forever.
         */
        kind: row.kind,
        intent: row.intent,
        action: row.action,
        acceptedCount: sql`${assistantMemory.acceptedCount} + ${row.acceptedCount}`,
        rejectedCount: sql`${assistantMemory.rejectedCount} + ${row.rejectedCount}`,
        refusedCount: sql`${assistantMemory.refusedCount} + ${row.refusedCount}`,
        lastRefusal: outcome.kind === 'refused' ? outcome.reason : assistantMemory.lastRefusal,
        lastSeenAt: new Date(),
      },
    })
    .catch((e) => console.error('[copilot] could not record the routing:', String(e).slice(0, 120)))
}

/**
 * What people asked for and did not get, most-wanted first.
 *
 * The one report this table exists to produce. Read by a person deciding what
 * to build, not by anything at runtime.
 */
export async function unmetDemand(limit = 30) {
  return db
    .select({
      asked: assistantMemory.normalised,
      role: assistantMemory.role,
      times: assistantMemory.refusedCount,
      why: assistantMemory.lastRefusal,
      lastSeenAt: assistantMemory.lastSeenAt,
    })
    .from(assistantMemory)
    .where(gt(assistantMemory.refusedCount, 0))
    .orderBy(desc(assistantMemory.refusedCount), desc(assistantMemory.lastSeenAt))
    .limit(limit)
}
