import { z } from 'zod'
import { localizedSchema } from './primitives.js'

/**
 * HR reports, asked for in plain language.
 *
 * The same rule as everything else the assistant does: the model chooses a
 * report from a closed list and names its parameters; the server runs queries
 * written by hand and scoped to the asker; the model writes the prose at the
 * end from figures it was handed. Nothing numeric in a report comes from a
 * model, so a report can be sent to a regulator, a board, or an employee
 * without anyone having to trust that a sentence generator got arithmetic right.
 *
 * A report differs from an answer in what it is for. An answer settles a
 * question someone has now; a report is a document that leaves the building —
 * it carries who it covers, what period, when it was produced, and what the
 * figures were, because in six months none of that will be remembered.
 */

export const reportTypeSchema = z.enum([
  'attendance',
  'leave',
  'employees',
  /** People whose recorded start date falls inside the requested period. */
  'newHires',
  'recruitment',
  'department',
  /** Payroll figures for one named employee. */
  'payroll',
  /** One person, in full. Produced by asking about them by number or name. */
  'employeeFile',
])
export type ReportType = z.infer<typeof reportTypeSchema>

/** A block of figures, rendered exactly as the query returned them. */
export const reportSectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stats'),
    heading: localizedSchema,
    stats: z.array(
      z.object({ label: localizedSchema, value: z.string(), detail: localizedSchema.nullable() }),
    ),
  }),
  z.object({
    kind: z.literal('table'),
    heading: localizedSchema,
    columns: z.array(localizedSchema),
    rows: z.array(z.array(z.string())),
    /** Shown under the table when rows were capped, so a cut is never silent. */
    note: localizedSchema.nullable(),
  }),
  /** A comparison calculated by the server, rendered without a chart provider. */
  z.object({
    kind: z.literal('barChart'),
    heading: localizedSchema,
    bars: z.array(
      z.object({
        label: localizedSchema,
        /** Percentage from 0 through 100, calculated from recorded data. */
        value: z.number().min(0).max(100),
        valueLabel: z.string(),
      }),
    ),
    note: localizedSchema.nullable(),
  }),
])
export type ReportSection = z.infer<typeof reportSectionSchema>

export const hrReportSchema = z.object({
  type: reportTypeSchema,
  title: localizedSchema,
  /** The period covered, spelled out — not "this month", which stops being true. */
  period: localizedSchema,
  /** Who it covers: a department, a team, or the whole company. */
  scope: localizedSchema,
  generatedAt: z.string(),
  /** Whose request produced it. A report with no author answers no questions later. */
  generatedBy: localizedSchema,
  sections: z.array(reportSectionSchema),
  /**
   * Written by the model from the sections above, and nowhere else.
   *
   * Kept separate from the figures so a reader can see which part of the page
   * is measured and which part is described. If the model is unavailable these
   * are empty and the report still stands — the numbers were never its work.
   */
  summary: localizedSchema,
  findings: z.array(localizedSchema),
})
export type HrReport = z.infer<typeof hrReportSchema>
