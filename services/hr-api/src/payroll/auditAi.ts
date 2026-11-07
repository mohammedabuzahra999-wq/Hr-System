import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { env } from '../env.js'

let client: OpenAI | null = null

const shape = z.object({ explanation: z.object({ en: z.string().max(500), ar: z.string().max(500) }) })

/**
 * Prose only.  The model receives a compact, already-authorised finding and
 * cannot query payroll, decide severity, change a figure, or approve a run.
 */
export async function explainPayrollFinding(input: { type: string; severity: string; facts: Record<string, unknown>; explanation: unknown }) {
  if (!env.AI_SHARE_DATA || !env.OPENAI_API_KEY) return null
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  try {
    const response = await client.responses.parse({
      model: env.OPENAI_MODEL,
      temperature: 0,
      input: [
        {
          role: 'system',
          content: `You explain one deterministic payroll-audit finding for an HR reviewer.

- Write one short explanation in English and Arabic.
- Explain only why this item needs review and what source should be checked.
- Do not include any numbers, names, recommendations about pay, or a decision to approve, reject, discipline, or change anything.
- This is explanatory text only. The stored facts and the human reviewer remain authoritative.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ type: input.type, severity: input.severity, facts: input.facts, deterministicExplanation: input.explanation }),
        },
      ],
      text: { format: zodTextFormat(shape, 'payroll_audit_explanation') },
    })
    return response.output_parsed?.explanation ?? null
  } catch (error) {
    console.error('[payroll-audit] AI explanation failed:', String(error).slice(0, 140))
    return null
  }
}
