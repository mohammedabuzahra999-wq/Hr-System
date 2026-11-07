/**
 * Fills the job-description library by actually generating the documents.
 *
 * Run with: npm run db:seed:jd --workspace=@hr/server
 *
 * Deliberately not hand-written rows. Every document here goes through the same
 * provider, the same prompt and the same validation an HR user's request does,
 * so what lands in the table is the genuine output of the feature — with honest
 * provenance on each row — rather than prose someone typed to look like it.
 * That matters twice over: it is the corpus a retrieval layer would later draw
 * on, and a library seeded with invented text would teach the retriever to
 * imitate invented text.
 *
 * It costs real money to run. Each call is one generation at the configured
 * model's rates.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { jobDescriptionContentSchema, type GenerateJobDescriptionInput } from '@hr/shared'
import { jobDescriptionProvider, PROMPT_VERSION } from '../ai/index.js'
import { closeDb, db } from './client.js'
import { aiGenerations, jobDescriptions, users } from './schema.js'

interface Seed {
  input: GenerateJobDescriptionInput
  department: { en: string; ar: string }
  /** Most of a real library is settled work, so most of these are approved. */
  approve: boolean
}

const SEEDS: Seed[] = [
  {
    input: {
      title: 'AI Engineer',
      department: 'Engineering',
      level: 'senior',
      employmentType: 'fullTime',
      yearsExperience: 5,
      requiredSkills: ['Python', 'PyTorch', 'LLM fine-tuning', 'Vector databases'],
      preferredSkills: ['Kubernetes', 'MLOps'],
      responsibilities: 'Design and ship machine learning features\nEvaluate model quality against real tasks\nWork with engineering on deployment',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    approve: true,
  },
  {
    input: {
      title: 'Software Developer',
      department: 'Engineering',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
      preferredSkills: ['Docker'],
      responsibilities: 'Build and maintain web features end to end\nReview colleagues code\nFix defects reported by users',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    approve: true,
  },
  {
    input: {
      title: 'Accountant',
      department: 'Finance',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 4,
      requiredSkills: ['Bookkeeping', 'Bank reconciliation', 'Excel', 'ERP systems'],
      responsibilities: 'Prepare monthly reconciliations\nMaintain the general ledger\nSupport the annual audit',
    },
    department: { en: 'Finance', ar: 'المالية' },
    approve: true,
  },
  {
    input: {
      title: 'HR Specialist',
      department: 'Human Resources',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 4,
      requiredSkills: ['Recruitment', 'Employee relations', 'HRIS'],
      responsibilities: 'Run hiring from vacancy to offer\nMaintain employee records\nSupport managers on day to day matters',
    },
    department: { en: 'Human Resources', ar: 'الموارد البشرية' },
    approve: true,
  },
  {
    input: {
      title: 'Office Services Coordinator',
      department: 'Administration',
      level: 'junior',
      employmentType: 'fullTime',
      yearsExperience: 2,
      requiredSkills: ['Supplier coordination', 'Inventory tracking', 'Scheduling'],
      responsibilities:
        'Keep cleaning and office supplies stocked\nCoordinate the cleaning and maintenance teams\nHandle supplier orders and deliveries\nKeep the premises ready for the working day',
    },
    department: { en: 'Administration', ar: 'الشؤون الإدارية' },
    approve: true,
  },
  {
    input: {
      title: 'Data Analyst',
      department: 'Engineering',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['SQL', 'Power BI', 'Excel'],
      responsibilities: 'Build reports for department heads\nInvestigate anomalies in operational data',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    approve: true,
  },
  {
    input: {
      title: 'UI/UX Designer',
      department: 'Product',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['Figma', 'Design systems', 'Prototyping'],
      responsibilities: 'Design screens and flows for new features\nMaintain the shared design system',
    },
    department: { en: 'Product', ar: 'المنتج' },
    approve: true,
  },
  {
    input: {
      title: 'Project Manager',
      department: 'Product',
      level: 'senior',
      employmentType: 'fullTime',
      yearsExperience: 6,
      requiredSkills: ['Planning', 'Stakeholder communication', 'Risk management'],
      responsibilities: 'Plan delivery with the teams\nTrack progress and raise blockers early',
    },
    department: { en: 'Product', ar: 'المنتج' },
    approve: true,
  },
  {
    input: {
      title: 'Sales Representative',
      department: 'Sales',
      level: 'junior',
      employmentType: 'fullTime',
      yearsExperience: 2,
      requiredSkills: ['CRM', 'Negotiation', 'Arabic and English'],
      responsibilities: 'Find and qualify new clients\nKeep the pipeline accurate in the CRM',
    },
    department: { en: 'Sales', ar: 'المبيعات' },
    approve: true,
  },
  {
    input: {
      title: 'Technical Support Specialist',
      department: 'Support',
      level: 'junior',
      employmentType: 'fullTime',
      yearsExperience: 1,
      requiredSkills: ['Ticketing systems', 'Troubleshooting', 'Arabic and English'],
      responsibilities: 'Answer customer tickets\nEscalate defects to engineering with clear reproduction steps',
    },
    department: { en: 'Support', ar: 'الدعم الفني' },
    approve: true,
  },
  {
    input: {
      title: 'Marketing Specialist',
      department: 'Marketing',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['Content writing', 'Social media', 'Analytics'],
      responsibilities: 'Plan and publish campaigns\nReport on what each campaign achieved',
    },
    department: { en: 'Marketing', ar: 'التسويق' },
    approve: true,
  },
  {
    input: {
      title: 'Information Security Officer',
      department: 'Engineering',
      level: 'senior',
      employmentType: 'fullTime',
      yearsExperience: 6,
      requiredSkills: ['Risk assessment', 'Incident response', 'Access control'],
      responsibilities: 'Review systems for security weaknesses\nRespond to incidents and write up what happened',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    approve: true,
  },
  {
    input: {
      title: 'Legal Counsel',
      department: 'Legal',
      level: 'senior',
      employmentType: 'fullTime',
      yearsExperience: 7,
      requiredSkills: ['Contract drafting', 'Commercial law', 'Arabic and English'],
      responsibilities: 'Draft and review commercial contracts\nAdvise departments on legal risk',
    },
    department: { en: 'Legal', ar: 'الشؤون القانونية' },
    approve: true,
  },
  {
    input: {
      title: 'Procurement Officer',
      department: 'Administration',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['Supplier negotiation', 'Purchase orders', 'Cost control'],
      responsibilities: 'Source suppliers and compare offers\nRaise and track purchase orders',
    },
    department: { en: 'Administration', ar: 'الشؤون الإدارية' },
    approve: true,
  },
  {
    input: {
      title: 'Logistics Coordinator',
      department: 'Operations',
      level: 'junior',
      employmentType: 'fullTime',
      yearsExperience: 2,
      requiredSkills: ['Shipment tracking', 'Documentation', 'Scheduling'],
      responsibilities: 'Coordinate shipments in and out\nKeep delivery paperwork in order',
    },
    department: { en: 'Operations', ar: 'العمليات' },
    approve: true,
  },
  {
    input: {
      title: 'QA Engineer',
      department: 'Engineering',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['Test planning', 'Automation', 'Bug reporting'],
      responsibilities: 'Write and run test plans for releases\nAutomate the checks that repeat every release',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    approve: true,
  },
  {
    input: {
      title: 'Payroll Officer',
      department: 'Finance',
      level: 'mid',
      employmentType: 'fullTime',
      yearsExperience: 3,
      requiredSkills: ['Payroll processing', 'Attendance systems', 'Excel'],
      responsibilities: 'Run the monthly payroll cycle\nReconcile attendance against payroll records',
    },
    department: { en: 'Finance', ar: 'المالية' },
    approve: true,
  },
  {
    input: {
      title: 'Engineering Manager',
      department: 'Engineering',
      level: 'manager',
      employmentType: 'fullTime',
      yearsExperience: 8,
      requiredSkills: ['Team leadership', 'Technical planning', 'Hiring'],
      responsibilities: 'Lead a team of developers\nPlan technical work with the product team\nGrow the people on the team',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    approve: true,
  },
  {
    input: {
      title: 'Software Developer Intern',
      department: 'Engineering',
      level: 'intern',
      employmentType: 'temporary',
      yearsExperience: 0,
      requiredSkills: ['JavaScript', 'Git'],
      responsibilities: 'Work on small features with a mentor\nWrite tests for what you build',
    },
    department: { en: 'Engineering', ar: 'الهندسة' },
    // Left as a draft on purpose: a real library has unfinished ones in it.
    approve: false,
  },
  {
    input: {
      prompt:
        'A receptionist for the head office who greets visitors, answers the switchboard, and keeps the meeting rooms booked and tidy. Two years of experience, Arabic and English.',
    },
    department: { en: 'Administration', ar: 'الشؤون الإدارية' },
    approve: false,
  },
]

async function main() {
  if (!jobDescriptionProvider.isModel) {
    console.error('[seed:jd] no model configured — set OPENAI_API_KEY (or ANTHROPIC_API_KEY) first.')
    process.exit(1)
  }

  const hr = await db.select().from(users).where(eq(users.email, 'mo.hr@menaitech.com')).limit(1)
  const author = hr[0]
  if (!author) {
    console.error('[seed:jd] no HR account found — run the main seed first.')
    process.exit(1)
  }

  console.log(`[seed:jd] generating ${SEEDS.length} descriptions with ${jobDescriptionProvider.name}`)
  let ok = 0
  let failed = 0

  for (const [i, seed] of SEEDS.entries()) {
    const label = seed.input.title ?? seed.input.prompt?.slice(0, 40) ?? '(untitled)'
    const started = Date.now()
    try {
      const result = await jobDescriptionProvider.generate(seed.input)
      const content = jobDescriptionContentSchema.parse(result.content)

      const [row] = await db
        .insert(jobDescriptions)
        .values({
          titleEn: content.title.en,
          titleAr: content.title.ar,
          departmentEn: seed.department.en,
          departmentAr: seed.department.ar,
          level: seed.input.level ?? null,
          employmentType: seed.input.employmentType ?? null,
          content,
          model: jobDescriptionProvider.name,
          promptVersion: PROMPT_VERSION,
          generatedBy: author.id,
          generatedAt: new Date(),
          ...(seed.approve
            ? { status: 'approved' as const, approvedBy: author.id, approvedAt: new Date() }
            : {}),
        })
        .returning()

      await db.insert(aiGenerations).values({
        kind: 'generate',
        jobDescriptionId: row!.id,
        requestedBy: author.id,
        model: jobDescriptionProvider.name,
        promptVersion: PROMPT_VERSION,
        input: seed.input as Record<string, unknown>,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: Date.now() - started,
        ok: true,
      })

      ok += 1
      console.log(
        `  ${String(i + 1).padStart(2)}/${SEEDS.length}  ${content.title.ar.padEnd(26)} ` +
          `${String(Date.now() - started).padStart(6)}ms  ${seed.approve ? 'approved' : 'draft'}`,
      )
    } catch (error) {
      failed += 1
      console.error(`  ${String(i + 1).padStart(2)}/${SEEDS.length}  ${label}: ${String(error).slice(0, 80)}`)
    }
  }

  console.log(`[seed:jd] done — ${ok} written, ${failed} failed`)
  await closeDb()
}

main().catch(async (e) => {
  console.error(e)
  await closeDb()
  process.exit(1)
})
