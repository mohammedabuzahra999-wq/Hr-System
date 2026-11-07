import { maintainedHelpDecision } from './helpRouting.js'
import { foldRead } from '../copilot/readPeriods.js'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { guideAnswerSchema, type GuideAnswer, type Role } from '@hr/shared'
import { env } from '../env.js'
import { GUIDE_PAGES, pageFor } from './pages.js'
import { findTasks, GUIDE_TASKS } from './tasks.js'

/**
 * Answering "how do I…" from what this system actually is.
 *
 * The retrieval happens first and in plain code: the task entries whose trigger
 * words appear in the question, plus the page the person is currently on. Only
 * those reach the model, and the prompt says that anything not in front of it
 * does not exist.
 *
 * That restriction is the feature. A model asked how to publish a job will
 * produce fluent, confident, invented steps — a button that was renamed, a menu
 * that never existed — and a user who follows them concludes they have
 * misunderstood the software rather than that the guide is wrong. Grounding it
 * in a file that changes when the interface changes is the only way the guidance
 * stays true.
 *
 * Nothing about the user's data is sent here: this is about the interface, not
 * about them. It runs regardless of `AI_SHARE_DATA` for that reason.
 */

const shape = z.object({ answer: guideAnswerSchema })

let client: OpenAI | null = null

const SYSTEM = `You explain how to use an HR system, to somebody using it right now.

You will be given entries describing the system: the screen they are on, and the tasks that match their question. Those entries are the entire truth about this software.

RULES
- Explain ONLY from the entries given. If something is not in them, it does not exist in this system — say you do not have that rather than describing how it probably works.
- Never invent a button, a menu, a page or a setting. A wrong instruction sends somebody looking for something that is not there, and they will assume they have missed it.
- Use the exact wording the entries use for buttons and screens.
- Each screen has a name in both languages. Write the Arabic answer using the Arabic name and the English answer using the English one. Never put an English screen name inside an Arabic sentence.
- Copy the steps from the entry rather than rewriting them. Reorder or trim only if the question is narrower than the task.
- State the caveats. They are the things that will actually stop the person, and saying them first is the difference between guidance and a list.
- Keep the explanation to two or three sentences. The steps carry the detail.
- Be warm, direct and practical. Start with the next useful thing they can do; never sound dismissive, bureaucratic or like you are blaming them for asking.
- Answer in English and Arabic. The Arabic reads as an Arabic speaker would say it.
- If the entries do not cover the question, say so plainly in both languages and leave steps empty. That is a correct answer.

The person's role decides what they can do. Do not describe anything the entries do not list for them.`

/**
 * A question about how to use a known task is not a request to perform it.
 *
 * This settles the common ambiguity before the classifier sees it: "submit my
 * leave" starts a leave request, while "how can I submit leave" gets the
 * instructions.  The task still has to be one visible to the person's role.
 */
export function isGuideQuestion(question: string, role: Role, currentPath?: string): boolean {
  const help = maintainedHelpDecision(question, role)
  if (help.kind === 'resolved') return true
  if (help.kind === 'abstain') return false
  return /^(?:what can i do on (?:this|the) page|what is on (?:this|the) page|what's here|what is here|explain (?:this|the) page|(?:شو|ماذا) (?:في )?(?:بهاي|بهذه|هاي|هذه|هال)?\s*الصفحه|شو بقدر اعمل (?:هون|بهاي الصفحه))[?؟!.]*$/u.test(foldRead(question))
    && pageFor(currentPath, role) !== null
}

/**
 * Known tasks are rendered from the checked guide itself.  This keeps the
 * common answers available during an AI outage and prevents a model from
 * paraphrasing a button or a route into something that does not exist.
 */
function localGuide(tasks: ReturnType<typeof findTasks>, role: Role): GuideAnswer | null {
  const task = tasks[0]
  if (!task) return null

  const links: GuideAnswer['links'] = []
  for (const step of task.steps) {
    if (!step.path || links.some((link) => link.path === step.path)) continue
    const page = pageFor(step.path, role)
    links.push({ path: step.path, label: page?.title ?? { en: 'Open page', ar: 'افتح الصفحة' } })
  }

  const caveats = {
    en: task.caveats.map((caveat) => caveat.en).join(' '),
    ar: task.caveats.map((caveat) => caveat.ar).join(' '),
  }

  return {
    explanation: {
      en: `To ${task.title.en.toLowerCase()}, follow these steps.${caveats.en ? ` Note: ${caveats.en}` : ''}`,
      ar: `لـ${task.title.ar}، اتبع الخطوات التالية.${caveats.ar ? ` انتبه: ${caveats.ar}` : ''}`,
    },
    steps: task.steps.map((step) => ({ path: step.path, text: step.text })),
    links,
  }
}

/** A page overview is data we already own; it must not depend on a model. */
function localPageOverview(page: (typeof GUIDE_PAGES)[number]): GuideAnswer {
  const steps = page.actions.map((action) => ({ path: page.path, text: action }))
  return {
    explanation: {
      en: `${page.title.en}: ${page.purpose.en}`,
      ar: `${page.title.ar}: ${page.purpose.ar}`,
    },
    steps,
    links: [{ path: page.path, label: page.title }],
  }
}

export async function answerGuide(
  question: string,
  role: Role,
  currentPath: string | undefined,
): Promise<GuideAnswer | null> {
  const help = maintainedHelpDecision(question, role)
  const tasks = help.kind === 'resolved' ? [help.task] : findTasks(question, role)
  const page = pageFor(currentPath, role)
  const pages = GUIDE_PAGES.filter((p) => p.roles.includes(role))

  const local = localGuide(tasks, role)
  if (local) return local

  /* Questions such as “what can I do on this page?” are about the page in
     front of the user. Return its maintained capability list immediately. */
  const pageOverview = page ? localPageOverview(page) : null
  if (pageOverview) return pageOverview

  if (!env.OPENAI_API_KEY) return null
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })

  const context = [
    `The person's role: ${role}`,
    /**
     * Both languages for every name.
     *
     * Given only the English, the model wrote Arabic prose with English screen
     * names embedded in it — "صفحة Job descriptions" — because it had no Arabic
     * name to use. Each screen carries both, so each language's answer can be
     * written entirely in that language.
     */
    page
      ? `The screen they are on: ${page.path} — "${page.title.en}" / "${page.title.ar}". ${page.purpose.en}`
      : 'Screen: unknown',
    '',
    'SCREENS THEY CAN REACH (use the name in the language you are writing in):',
    ...pages.map((p) => `- ${p.path} — en:"${p.title.en}" ar:"${p.title.ar}" — ${p.purpose.en}`),
    '',
    tasks.length
      ? 'TASKS MATCHING THEIR QUESTION:\n' + JSON.stringify(tasks)
      : 'No task entry matched their question. Answer from the screen list only, or say it is not covered.',
  ].join('\n')

  try {
    const response = await client.responses.parse({
      model: env.OPENAI_MODEL,
      // The same question must produce the same instructions every time.
      temperature: 0,
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${context}\n\n=== THEIR QUESTION ===\n${question}` },
      ],
      text: { format: zodTextFormat(shape, 'guide_answer') },
    })
    return response.output_parsed?.answer ?? null
  } catch (error) {
    console.error('[guide] failed:', String(error).slice(0, 140))
    return null
  }
}

/** Questions worth offering on a given screen, from the tasks that touch it. */
export function suggestionsFor(role: Role, currentPath: string | undefined): { en: string; ar: string }[] {
  const page = pageFor(currentPath, role)
  const here = GUIDE_TASKS.filter(
    (t) => t.roles.includes(role) && (!page || t.steps.some((s) => s.path === page.path)),
  )
  const rest = GUIDE_TASKS.filter((t) => t.roles.includes(role) && !here.includes(t))
  return [...here, ...rest].slice(0, 4).map((t) => ({
    en: `How do I ${t.title.en.toLowerCase()}?`,
    ar: `كيف ${t.title.ar}؟`,
  }))
}
