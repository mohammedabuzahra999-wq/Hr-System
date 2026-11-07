import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'

/**
 * Turning an uploaded CV into text a model can read.
 *
 * Deliberately a separate step from the analysis, and deliberately returning
 * the text rather than passing it straight on. Two reasons, both about being
 * able to answer for a hiring decision later:
 *
 *  - What was read is auditable. If a candidate was scored low, "the file was
 *    scanned images and produced forty characters" is the answer, and it is only
 *    available if extraction is a thing that succeeded or failed on its own.
 *  - A file that yields nothing is a different outcome from a candidate who
 *    matches nothing, and conflating them would quietly bury good applicants
 *    whose CV happened to be a photograph.
 */

/** Below this, whatever came out is not a CV — it is a scan, or a failure. */
const MIN_USEFUL_CHARS = 200

/**
 * A ceiling on what is sent to the model.
 *
 * Long enough for any real CV — twenty thousand characters is roughly ten dense
 * pages — and a bound on both cost and on someone pasting a novel into a PDF to
 * see what happens.
 */
const MAX_CHARS = 20_000

export type CvTextResult =
  | { ok: true; text: string; characters: number }
  | { ok: false; reason: 'unsupportedFormat' | 'noTextFound' | 'extractionFailed'; detail?: string }

/** Collapses the whitespace PDF extraction leaves behind, without losing line structure. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS)
}

async function fromPdf(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n') : text
}

async function fromDocx(bytes: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: bytes })
  return value
}

export async function extractCvText(bytes: Buffer, mimeType: string): Promise<CvTextResult> {
  try {
    let raw: string
    if (mimeType === 'application/pdf') {
      raw = await fromPdf(bytes)
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      raw = await fromDocx(bytes)
    } else {
      /**
       * `.doc` — the pre-2007 binary Word format — is accepted on upload but
       * cannot be read here without a parser for a format Microsoft replaced
       * nearly twenty years ago. HR can still open and read the file; only the
       * automatic reading is unavailable, and the screen says so rather than
       * scoring the candidate zero.
       */
      return { ok: false, reason: 'unsupportedFormat', detail: mimeType }
    }

    const text = tidy(raw)
    if (text.length < MIN_USEFUL_CHARS) {
      return { ok: false, reason: 'noTextFound', detail: `${text.length} characters` }
    }
    return { ok: true, text, characters: text.length }
  } catch (error) {
    return { ok: false, reason: 'extractionFailed', detail: String(error).slice(0, 160) }
  }
}
