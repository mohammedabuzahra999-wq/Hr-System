import OpenAI from 'openai'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { Criterion, CvAnalysisContent, InterviewOption, InterviewQuestionType } from '@hr/shared'
import { env } from '../env.js'

const QUESTIONS_PER_ASSESSMENT = 10
const WRITTEN_QUESTIONS = 2
const MULTIPLE_CHOICE_QUESTIONS = 8
const CHOICE_COUNT = 4

const optionSchema = z.object({
  id: z.string().trim().min(1).max(12),
  en: z.string().trim().min(1).max(500),
  ar: z.string().trim().min(1).max(500),
})

const questionSchema = z.object({
  criterionKey: z.string().trim(),
  questionType: z.enum(['written', 'multipleChoice']),
  en: z.string().trim().min(1).max(1200),
  ar: z.string().trim().min(1).max(1200),
  options: z.array(optionSchema).max(CHOICE_COUNT),
  correctOptionId: z.string().trim().nullable(),
})

const assessmentSchema = z.object({ questions: z.array(questionSchema) })
const replacementSchema = z.object({ question: questionSchema })

const SYSTEM = `You design fair, role-specific written assessments for an HR team.

THE DESIGN PRINCIPLE
- The vacancy and its requirements are the source of every question. The supplied CV evidence may tailor ONLY the two written questions, so they can connect a relevant professional skill or experience to a realistic task of the advertised position.
- Test the work of the advertised position through realistic scenarios, decisions, practical knowledge, and job-relevant judgement. Do not write generic trivia.
- Use the listed requirement keys exactly. Every question must have one of them as criterionKey.

QUESTION FORMATS
- A written question asks one clear, role-based scenario or task. It must be answerable in a focused paragraph, not a multi-part essay. Exactly two written questions must use the supplied professional CV evidence together with the job requirement; do not mention employers, schools, dates, places, names, or sensitive personal information.
- A multiple-choice question has exactly four plausible choices with ids A, B, C, D. It tests applied role knowledge, not a trick. Include its one correctOptionId.
- For a full assessment, write exactly ten questions: eight multiple-choice and two written.

SAFETY AND FAIRNESS
- Never ask about age, nationality, gender, marital status, religion, health, pregnancy, disability, family, salary history, or any protected characteristic.
- Do not assume a CV omission means a candidate cannot do something. Do not ask for personal history when a role scenario can test the same skill.
- Write every question and every option in both English and natural Arabic. The two languages must carry the same meaning.`

let client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}

export interface AssessmentQuestion {
  criterionKey: string | null
  questionType: InterviewQuestionType
  en: string
  ar: string
  options: InterviewOption[]
  correctOptionId: string | null
}

function cvCalibration(cv: CvAnalysisContent | null): string {
  if (!cv) return 'No CV analysis is available.'

  const evidence = cv.matches
    .filter((match) => match.evidence.trim())
    .slice(0, 8)
    .map((match) => `- Requirement: ${match.requirement}; professional evidence: ${match.evidence}`)

  return [
    'The candidate CV has been reviewed only for professional tailoring.',
    'Use the evidence below in exactly TWO written questions, together with the advertised role requirements.',
    'Ask a practical, role-based scenario that lets the candidate explain how they would apply a relevant skill or experience.',
    'Never name an employer, school, client, date, place, or personal detail from the CV. Never infer a protected characteristic from it.',
    'CV evidence:',
    ...(evidence.length ? evidence : ['- No usable professional evidence was extracted; keep the written scenarios role-specific.']),
  ].join('\n')
}

function normaliseQuestion(input: z.infer<typeof questionSchema>, keys: Set<string>): AssessmentQuestion | null {
  if (!keys.has(input.criterionKey)) return null

  const options = input.options.map((option) => ({
    id: option.id.trim().toUpperCase(),
    en: option.en.trim(),
    ar: option.ar.trim(),
  }))
  const validChoices =
    input.questionType === 'multipleChoice' &&
    options.length === CHOICE_COUNT &&
    new Set(options.map((option) => option.id)).size === CHOICE_COUNT &&
    ['A', 'B', 'C', 'D'].every((id) => options.some((option) => option.id === id)) &&
    input.correctOptionId !== null &&
    options.some((option) => option.id === input.correctOptionId!.trim().toUpperCase())

  return {
    criterionKey: input.criterionKey,
    questionType: validChoices ? 'multipleChoice' : 'written',
    en: input.en.trim(),
    ar: input.ar.trim(),
    options: validChoices ? options : [],
    correctOptionId: validChoices ? input.correctOptionId!.trim().toUpperCase() : null,
  }
}

function requirements(criteria: Criterion[]): string[] {
  return criteria.map((criterion, index) => `${index + 1}. [key: ${criterion.key}] [${criterion.kind}] ${criterion.key}`)
}

export async function generateAssessmentQuestions(
  jobTitle: string,
  criteria: Criterion[],
  cv: CvAnalysisContent | null,
): Promise<AssessmentQuestion[] | null> {
  const openai = getClient()
  if (!openai || criteria.length === 0) return null

  try {
    const response = await openai.responses.parse({
      model: env.OPENAI_MODEL,
      temperature: 0,
      input: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            `Vacancy: ${jobTitle}`,
            '',
            'Role requirements:',
            ...requirements(criteria),
            '',
            cvCalibration(cv),
            '',
            `Write exactly ${QUESTIONS_PER_ASSESSMENT} questions now: exactly ${MULTIPLE_CHOICE_QUESTIONS} multiple-choice and exactly ${WRITTEN_QUESTIONS} written. The two written questions must combine the position requirements with relevant professional CV evidence.`,
          ].join('\n'),
        },
      ],
      text: { format: zodTextFormat(assessmentSchema, 'role_assessment') },
    })
    const parsed = response.output_parsed
    const result = parsed ? assessmentSchema.safeParse(parsed) : null
    if (!result?.success) return null

    const keys = new Set(criteria.map((criterion) => criterion.key))
    const questions = result.data.questions.map((question) => normaliseQuestion(question, keys)).filter((question): question is AssessmentQuestion => question !== null)
    const written = questions.filter((question) => question.questionType === 'written')
    const choices = questions.filter((question) => question.questionType === 'multipleChoice')
    return questions.length === QUESTIONS_PER_ASSESSMENT &&
      written.length === WRITTEN_QUESTIONS &&
      choices.length === MULTIPLE_CHOICE_QUESTIONS
      ? questions
      : null
  } catch (error) {
    console.error('[interview] assessment generation failed:', String(error).slice(0, 160))
    return null
  }
}

export async function generateReplacementQuestion(
  jobTitle: string,
  criteria: Criterion[],
  cv: CvAnalysisContent | null,
  current: AssessmentQuestion,
  feedback: string,
): Promise<AssessmentQuestion | null> {
  const openai = getClient()
  if (!openai) return null

  try {
    const response = await openai.responses.parse({
      model: env.OPENAI_MODEL,
      temperature: 0,
      input: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            `Vacancy: ${jobTitle}`,
            '',
            'Role requirements:',
            ...requirements(criteria),
            '',
            cvCalibration(cv),
            '',
            'Current question:',
            `Type: ${current.questionType}`,
            `English: ${current.en}`,
            `Arabic: ${current.ar}`,
            '',
            current.questionType === 'written'
              ? 'This is one of the two CV-tailored written questions. Keep it tied to both a role requirement and relevant professional CV evidence, without naming employers, schools, dates, places, or personal details.'
              : 'This is a multiple-choice question. Keep it about the role requirements, with exactly four choices A, B, C and D.',
            '',
            `HR review feedback: ${feedback}`,
            '',
            'Replace this one question. Preserve its format unless the feedback explicitly asks for another format. Return only the replacement question.',
          ].join('\n'),
        },
      ],
      text: { format: zodTextFormat(replacementSchema, 'replacement_assessment_question') },
    })
    const parsed = response.output_parsed
    const result = parsed ? replacementSchema.safeParse(parsed) : null
    if (!result?.success) return null
    return normaliseQuestion(result.data.question, new Set(criteria.map((criterion) => criterion.key)))
  } catch (error) {
    console.error('[interview] question replacement failed:', String(error).slice(0, 160))
    return null
  }
}
