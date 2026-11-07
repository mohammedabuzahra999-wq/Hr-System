import { z } from 'zod'
import { localizedSchema, roleSchema } from './primitives.js'

/**
 * What the assistant knows about the system it lives in.
 *
 * Data in this repository, not knowledge in a model. That distinction is the
 * whole feature: a model asked "how do I publish a job" will produce confident,
 * plausible, wrong instructions — a button that does not exist, a menu that was
 * renamed — and a guide that misdirects is worse than none, because the user
 * assumes they are the one who has misunderstood.
 *
 * So the model is given the relevant entries and told to explain them, and it
 * is told explicitly that anything not in front of it does not exist. When the
 * interface changes, this file changes with it and the guidance follows.
 */

/** One screen the user can be on. */
export const guidePageSchema = z.object({
  /** The route, exactly as the router defines it. */
  path: z.string(),
  roles: z.array(roleSchema),
  title: localizedSchema,
  /** What this screen is for, in one or two sentences. */
  purpose: localizedSchema,
  /** What a person can actually do here. */
  actions: z.array(localizedSchema),
})
export type GuidePage = z.infer<typeof guidePageSchema>

/** A task somebody wants to complete, and the steps that complete it. */
export const guideTaskSchema = z.object({
  id: z.string(),
  roles: z.array(roleSchema),
  title: localizedSchema,
  /** Phrases a person might use for this task, for matching. */
  triggers: z.array(z.string()),
  steps: z.array(
    z.object({
      /** Where the step happens, so the assistant can send them there. */
      path: z.string().nullable(),
      text: localizedSchema,
    }),
  ),
  /** Anything that will stop them, said before they hit it. */
  caveats: z.array(localizedSchema),
})
export type GuideTask = z.infer<typeof guideTaskSchema>

/** What the client tells the server about where the user is. */
export const guideContextSchema = z.object({
  /** The current route, so help can be about the screen in front of them. */
  path: z.string().max(200).optional(),
})
export type GuideContext = z.infer<typeof guideContextSchema>

/** An answer about how to use the system, as opposed to about data. */
export const guideAnswerSchema = z.object({
  /** Prose, written by the model from the entries it was given. */
  explanation: localizedSchema,
  /** Steps, when the question was about doing something. */
  steps: z.array(
    z.object({ path: z.string().nullable(), text: localizedSchema }),
  ),
  /** Where to go next, as real routes the user may open. */
  links: z.array(z.object({ path: z.string(), label: localizedSchema })),
})
export type GuideAnswer = z.infer<typeof guideAnswerSchema>

/* ---------- the introductory tour ---------- */

/**
 * One stop on the tour: a screen, and what to say about it.
 *
 * Derived on the server from the same page entries the assistant answers from,
 * so a screen described one way in help is described the same way here. Two
 * hand-written copies of "what the recruitment page is for" would disagree
 * within a month.
 */
export const tourStopSchema = z.object({
  path: z.string(),
  title: localizedSchema,
  body: localizedSchema,
  /**
   * What to point at, as a CSS selector for the sidebar link.
   *
   * The navigation is the one part of the interface present on every screen and
   * stable across them, which makes it the only thing a tour can reliably
   * highlight without every page having to cooperate.
   */
  highlight: z.string().nullable(),
})
export type TourStop = z.infer<typeof tourStopSchema>

export const tourSchema = z.object({
  /** False once somebody has finished or skipped it. */
  shouldOffer: z.boolean(),
  stops: z.array(tourStopSchema),
})
export type Tour = z.infer<typeof tourSchema>
