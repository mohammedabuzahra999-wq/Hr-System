import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import type { HrReport } from '@hr/shared'
import { env } from '../env.js'

/**
 * The prose at the top of a report.
 *
 * Handed the finished sections and nothing else — no database, no query, no
 * ability to reach a figure that is not already on the page. It describes what
 * is there; it cannot introduce anything.
 *
 * That constraint is what makes a generated report safe to send. Every number a
 * reader sees was produced by a query and rendered as it came back; the model
 * only ever wrote the sentences around them. If it is unavailable, the report
 * is published with no summary rather than delayed — the figures were never its
 * contribution.
 */

const shape = z.object({
  summary: z.object({ en: z.string(), ar: z.string() }),
  findings: z.array(z.object({ en: z.string(), ar: z.string() })).max(5),
})

const SYSTEM = `You write the opening summary of an HR report, from figures already produced.

- Two to four sentences of summary, in English and Arabic. Then up to five findings, each one sentence.
- Describe ONLY what is in the data you are given. You have no other source. Do not estimate, extrapolate, compare to a previous period you were not shown, or explain why a number is what it is.
- Do not repeat every figure — they are printed beside your text. Say what stands out and what it means for someone planning work.
- A finding names something specific and checkable: a rate, a count, a department. "Attendance is good" is not a finding; "the Engineering department accounts for most recorded absence" is, if the data shows it.
- Never name an individual in a way that reads as a judgement of them. Reporting that a person has the most absence is a fact; calling them unreliable is not yours to write.
- Never recommend disciplinary action, dismissal, promotion, or pay. A report informs a decision; it does not make one.
- If the data is thin or empty, say so plainly and write no findings. An honest short report beats a padded one.
- The Arabic reads as an Arabic speaker would write it, carrying the same facts.`

let client: OpenAI | null = null

export async function narrate(
  report: Omit<HrReport, 'summary' | 'findings'>,
): Promise<Pick<HrReport, 'summary' | 'findings'>> {
  const empty = { summary: { en: '', ar: '' }, findings: [] }

  /**
   * Report sections carry the most sensitive figures in the system — an
   * employee file includes their pay. When sharing is off they are not sent,
   * and the report is published with its tables and no summary.
   */
  if (!env.AI_SHARE_DATA) return empty
  if (!env.OPENAI_API_KEY) return empty
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })

  try {
    const response = await client.responses.parse({
      model: env.OPENAI_MODEL,
      // The same figures must always produce the same summary — a report that
      // reads differently each time it is regenerated is one nobody can cite.
      temperature: 0,
      input: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            `Report: ${report.title.en}`,
            `Period: ${report.period.en}`,
            `Covers: ${report.scope.en}`,
            '',
            'Sections:',
            JSON.stringify(report.sections).slice(0, 12_000),
          ].join('\n'),
        },
      ],
      text: { format: zodTextFormat(shape, 'report_narrative') },
    })
    return response.output_parsed ?? empty
  } catch (error) {
    console.error('[reports] narration failed:', String(error).slice(0, 140))
    return empty
  }
}
