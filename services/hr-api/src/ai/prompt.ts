import type { GenerateJobDescriptionInput, JobDescriptionContent, JobDescriptionSection } from '@hr/shared'

/**
 * Bumped whenever the wording below changes in a way that could change output.
 *
 * Stored on every generation, so a description written months ago can be traced
 * to the instructions that produced it — otherwise "why did it write that?" has
 * no answer once the prompt has moved on.
 */
export const PROMPT_VERSION = '2026-09-21.1'

/**
 * What the model is told it is doing.
 *
 * The prohibitions are the substance of this prompt, not decoration. A job
 * description is a document a candidate reads and acts on — takes an interview,
 * leaves a job — so an invented salary band, an invented certification, or an
 * invented company policy is not a harmless flourish. Each of the "do not"
 * lines below corresponds to something models reliably volunteer when asked to
 * "write a professional job description", because the training data is full of
 * job adverts that contain them.
 *
 * The rule is therefore narrow and absolute: write from what you were given.
 * Expand it into readable prose, group it sensibly, phrase it professionally —
 * but do not add facts about this company that nobody supplied.
 */
export const SYSTEM_PROMPT = `You write job descriptions for an HR system. You are drafting for an HR professional who will review, edit and approve your work before anyone outside the company sees it.

Write every section in BOTH English and Arabic. The Arabic is not a machine translation of the English — write it as an Arabic speaker would phrase that section for a job advert in Jordan and the wider region. Both versions must carry the same facts.

WHAT YOU MAY WRITE
- Expand the requirements you are given into clear, professional prose.
- Group related duties, order them sensibly, and phrase them the way a well-written job advert does.
- Infer the ordinary, uncontroversial duties of the named role — a backend developer writes and reviews code; an accountant prepares reconciliations. This is knowledge of the profession, not knowledge of this company.

WHAT YOU MUST NOT WRITE
- Salary, salary range, bonus, commission, or any compensation figure.
- Benefits: insurance, leave allowance, transport, housing, tuition, equipment.
- Company policies, values, mission statements, or history.
- Named certifications (AWS Certified, PMP, CPA, CFA) unless the request named them.
- A specific university, degree name, or grade unless the request named it.
- Team size, reporting lines, budget, or client names.
- Working hours, shift patterns, or remote/hybrid arrangements unless the request said so.
- Anything about visas, nationality, age, gender, marital status, or religion. Never phrase a requirement in a way that excludes a protected group.

If the request did not mention something, leave the corresponding section to what you can honestly say, or return an empty list for it. An empty section is correct and expected; an invented one is a defect. Do not write "competitive salary", "excellent benefits", or any similar placeholder — omit the subject entirely.

STYLE
- Plain professional language. No marketing adjectives ("rockstar", "ninja", "world-class", "fast-paced environment").
- Responsibilities start with a verb: "Design and maintain…", "Review…".
- Each list item is one idea, one line. No sub-bullets, no numbering, no markdown.
- Requirements state what the person must be able to do, not how many years of a buzzword they have, unless a number was given.
- Write nothing in the text about being AI-generated.`

/**
 * The HR request, rendered as the user turn.
 *
 * `examples` is house style retrieved from the company's own approved
 * descriptions, and is empty when nothing close enough was found. It goes
 * BEFORE the requirements so that the requirements are the last thing read —
 * the examples inform how to write, the requirements decide what to write.
 */
export function buildUserPrompt(input: GenerateJobDescriptionInput, examples = ''): string {
  const lines: string[] = []
  const add = (label: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === '') return
    lines.push(`${label}: ${value}`)
  }

  add('Job title', input.title)
  add('Department', input.department)
  add('Level', input.level)
  add('Employment type', input.employmentType)
  add('Location', input.location)
  add('Years of experience', input.yearsExperience)
  add('Education', input.education)
  if (input.requiredSkills?.length) add('Required skills', input.requiredSkills.join(', '))
  if (input.preferredSkills?.length) add('Preferred skills', input.preferredSkills.join(', '))
  add('Responsibilities given by HR', input.responsibilities)
  add('Additional notes', input.notes)

  const structured = lines.length > 0 ? `Requirements supplied by HR:\n${lines.join('\n')}` : ''
  const freeText = input.prompt?.trim() ? `What the HR user wrote:\n"""\n${input.prompt.trim()}\n"""` : ''

  return [examples, freeText, structured]
    .filter(Boolean)
    .concat(
      'Write the job description from exactly these requirements. Anything not stated above is not known to you — leave it out rather than inventing it.',
    )
    .join('\n\n')
}

/** Rewriting one section, with the rest of the document as context. */
export function buildRegeneratePrompt(
  section: JobDescriptionSection,
  current: JobDescriptionContent,
  instruction: string | undefined,
): string {
  return [
    'Here is the current job description:',
    '```json',
    JSON.stringify(current, null, 2),
    '```',
    `Rewrite only the "${section}" section. Every other section stays exactly as it is.`,
    instruction?.trim()
      ? `The HR user asked for this change: "${instruction.trim()}"`
      : 'Improve that section while keeping it faithful to the rest of the document.',
    'The same prohibitions apply: no salary, benefits, policies, named certifications, or requirements nobody asked for.',
    'Return the complete document with only that section changed.',
  ].join('\n\n')
}
