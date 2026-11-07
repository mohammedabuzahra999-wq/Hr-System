import type { CopilotAction, CopilotActionPlan, Localized } from '@hr/shared'

/**
 * The fields an instruction is made of, as boxes to fill in.
 *
 * Asking for one detail per message is a conversation when there is one detail
 * and an interrogation when there are five. Adding an employee needs a name, an
 * email, a number, a title and a department: as messages that is five rounds
 * before anything happens, and no way to see what is coming or to correct the
 * second answer after giving the fourth. A form shows all of it at once, which
 * is the one thing a form is better at than talking.
 *
 * So the assistant does both. Say the whole thing in a sentence and it is
 * understood; say half of it and the rest arrives as boxes, already holding what
 * was understood from the sentence.
 *
 * This is an input convenience and deliberately not an authority. Filling the
 * form builds a plan and that plan goes through `proposeAction` exactly as a
 * spoken one does, so every gap check, every permission check and every lookup
 * still runs. A form that asked for the wrong things would be unhelpful; it
 * could not make anything happen that talking could not.
 */

export type FormFieldKind =
  /** One line. */
  | 'text'
  /** Several lines: an announcement body, a brief. */
  | 'longText'
  /** A calendar date, sent as YYYY-MM-DD. */
  | 'date'
  /** One of a fixed set, so nobody has to guess the wording. */
  | 'choice'

export interface FormField {
  /**
   * Which field of the plan this box fills.
   *
   * Unless `into` is set, in which case this is only a name for the box and the
   * answer is folded into that field instead. See `into`.
   */
  field: string
  label: Localized
  kind: FormFieldKind
  /**
   * Whether the instruction can go ahead without it.
   *
   * The same distinction the gaps make, shown rather than discovered: a
   * required box is marked, an optional one can be left empty, and "skip"
   * submits with every optional box as it stands.
   */
  required: boolean
  /** For `choice`, the values the plan accepts, in the words people read. */
  options?: readonly { value: string; label: Localized }[]
  /** Shown under the box when the label alone would leave a question. */
  hint?: Localized
  /**
   * Fold this box into a free-text field rather than a field of its own.
   *
   * For details the plan has no room for. A job description is better for
   * knowing the seniority, the years and the skills, and the plan holds none of
   * those \u2014 it holds a brief. Putting them in the plan would mean five more
   * fields for the model to fill on every unrelated instruction, to serve one
   * action.
   *
   * So the form asks for them separately, which is the part that matters to the
   * person, and the server writes them into the brief as labelled lines. The
   * generator reads free text either way.
   */
  into?: 'text'
}

const L = (en: string, ar: string): Localized => ({ en, ar })

const LEAVE_KINDS = [
  { value: 'annual', label: L('Annual', 'سنوية') },
  { value: 'sick', label: L('Sick', 'مرضية') },
  { value: 'unpaid', label: L('Unpaid', 'بدون راتب') },
] as const

const EMPLOYMENT_TYPES = [
  { value: 'fullTime', label: L('Full time', 'دوام كامل') },
  { value: 'partTime', label: L('Part time', 'دوام جزئي') },
  { value: 'contract', label: L('Contract', 'عقد') },
  { value: 'internship', label: L('Internship', 'تدريب') },
] as const

const ROLES = [
  { value: 'employee', label: L('Employee', 'موظف') },
  { value: 'manager', label: L('Manager', 'مدير') },
  { value: 'hr', label: L('HR', 'موارد بشرية') },
  { value: 'admin', label: L('Admin', 'مدير نظام') },
] as const

const STAGES = [
  { value: 'new', label: L('New', 'جديد') },
  { value: 'underReview', label: L('Under review', 'قيد المراجعة') },
  { value: 'shortlisted', label: L('Shortlisted', 'قائمة مختصرة') },
  { value: 'interview', label: L('Interview', 'مقابلة') },
  { value: 'offer', label: L('Offer', 'عرض') },
  { value: 'hired', label: L('Hired', 'تم التوظيف') },
  { value: 'rejected', label: L('Rejected', 'مرفوض') },
] as const

const PAYROLL_ADJUSTMENT_KINDS = [
  { value: 'overtime', label: L('Overtime', 'عمل إضافي') },
  { value: 'bonus', label: L('Bonus', 'مكافأة') },
  { value: 'allowance', label: L('Allowance', 'بدل') },
  { value: 'deduction', label: L('Deduction', 'خصم') },
] as const

const JOB_DESCRIPTION_SECTIONS = [
  { value: 'title', label: L('Title', 'المسمّى') },
  { value: 'summary', label: L('Summary', 'الملخص') },
  { value: 'responsibilities', label: L('Responsibilities', 'المسؤوليات') },
  { value: 'requiredQualifications', label: L('Required qualifications', 'المؤهلات المطلوبة') },
  { value: 'requiredSkills', label: L('Required skills', 'المهارات المطلوبة') },
  { value: 'preferredSkills', label: L('Preferred skills', 'المهارات المفضلة') },
  { value: 'softSkills', label: L('Soft skills', 'المهارات الشخصية') },
  { value: 'experience', label: L('Experience', 'الخبرة') },
  { value: 'education', label: L('Education', 'التعليم') },
  { value: 'workingConditions', label: L('Working conditions', 'ظروف العمل') },
] as const

/**
 * Only the actions worth a form.
 *
 * Checking in has nothing to fill in, and a box asking which screen to open is
 * worse than typing "open attendance" — those keep the plain reply they had.
 * An action missing from here is not broken, it just asks in words.
 */
export const ACTION_FORM: Partial<Record<CopilotAction, readonly FormField[]>> = {
  requestLeave: [
    { field: 'leaveKind', label: L('Kind of leave', 'نوع الإجازة'), kind: 'choice', required: true, options: LEAVE_KINDS },
    { field: 'startDate', label: L('First day', 'أول يوم'), kind: 'date', required: true },
    { field: 'endDate', label: L('Last day', 'آخر يوم'), kind: 'date', required: true, hint: L('Included.', 'محسوب ضمن الإجازة.') },
    { field: 'text', label: L('Reason', 'السبب'), kind: 'longText', required: false },
  ],

  requestDocument: [
    {
      field: 'documentKind',
      label: L('What you need', 'شو بتحتاج'),
      kind: 'choice',
      required: true,
      options: [
        { value: 'certificate', label: L('Employment certificate', 'شهادة عمل') },
        { value: 'detailsUpdate', label: L('A change to your details', 'تعديل بياناتك') },
      ],
    },
    { field: 'text', label: L('Anything to add', 'أي إشي تحب تضيفه'), kind: 'longText', required: false },
  ],

  /*
   * One box per thing, rather than one box asking for everything.
   *
   * This was a title and a single empty area labelled "the rest, in your words",
   * which asked for nothing anybody could answer without first deciding what was
   * wanted. A form's whole advantage is that it names the things \u2014 giving that
   * up and calling it brevity left somebody filling in one box and being told
   * that was all.
   *
   * Everything but the title is optional, because the point is a better draft,
   * not a longer wait for one.
   */
  generateJobDescription: [
    { field: 'title', label: L('Job title', 'المسمّى الوظيفي'), kind: 'text', required: true },
    { field: 'department', label: L('Department', 'القسم'), kind: 'text', required: false },
    {
      field: 'level',
      into: 'text',
      label: L('Seniority', 'المستوى'),
      kind: 'choice',
      required: false,
      options: [
        { value: 'intern', label: L('Intern', 'متدرّب') },
        { value: 'junior', label: L('Junior', 'مبتدئ') },
        { value: 'mid', label: L('Mid', 'متوسط') },
        { value: 'senior', label: L('Senior', 'سينيور') },
        { value: 'lead', label: L('Lead', 'قائد فريق') },
        { value: 'manager', label: L('Manager', 'مدير') },
      ],
    },
    {
      field: 'yearsExperience',
      into: 'text',
      label: L('Years of experience', 'سنين الخبرة'),
      kind: 'text',
      required: false,
    },
    {
      field: 'requiredSkills',
      into: 'text',
      label: L('Key skills', 'المهارات الأساسية'),
      kind: 'text',
      required: false,
      hint: L('Separated by commas.', 'افصلهم بفواصل.'),
    },
    {
      field: 'preferredSkills',
      into: 'text',
      label: L('Nice-to-have skills', 'المهارات المفضّلة'),
      kind: 'text',
      required: false,
    },
    {
      field: 'softSkills',
      into: 'text',
      label: L('Personal skills', 'المهارات الشخصية'),
      kind: 'text',
      required: false,
    },
    /*
     * A level, not a degree.
     *
     * This was a free-text box, and a free-text box for education is where
     * "graduate of such-and-such university" and a named discipline end up —
     * neither of which most roles actually need, and both of which narrow a
     * field on something that is not the work. A level is the part that is
     * usually meant: the requirement is a bachelor's, not a bachelor's in
     * telecommunications engineering.
     *
     * Where the discipline genuinely is the job — a dentist needs a dentistry
     * degree — it goes in as its own requirement, weighted on purpose, rather
     * than smuggled into this one.
     */
    {
      field: 'education',
      into: 'text',
      label: L('Minimum education', 'الحد الأدنى للمؤهل'),
      kind: 'choice',
      required: false,
      options: [
        { value: 'high school', label: L('High school', 'ثانوية عامة') },
        { value: 'diploma', label: L('Diploma', 'دبلوم') },
        { value: "bachelor's degree", label: L("Bachelor's", 'بكالوريوس') },
        { value: "master's degree", label: L("Master's", 'ماجستير') },
        { value: 'doctorate', label: L('Doctorate', 'دكتوراه') },
      ],
      hint: L(
        'The level only. If a particular field of study is genuinely required, add it as its own requirement below.',
        'المستوى بس. إذا التخصص نفسه مطلوب فعلاً، ضيفه كمتطلب مستقل.',
      ),
    },
    {
      field: 'responsibilities',
      into: 'text',
      label: L('Main responsibilities', 'أهم المسؤوليات'),
      kind: 'longText',
      required: false,
      hint: L(
        'Anything left empty is written from the title and what you did give.',
        'أي إشي بتتركه فاضي بينكتب من المسمّى والي عبّيته.',
      ),
    },
  ],

  regenerateJobDescriptionSection: [
    { field: 'title', label: L('Which job description', 'أي وصف وظيفي'), kind: 'text', required: true },
    { field: 'jobDescriptionSection', label: L('Which section', 'أي قسم'), kind: 'choice', required: true, options: JOB_DESCRIPTION_SECTIONS },
    { field: 'text', label: L('Rewrite instruction', 'تعليمات إعادة الكتابة'), kind: 'longText', required: false },
  ],

  createJob: [
    { field: 'title', label: L('Job title', 'المسمّى الوظيفي'), kind: 'text', required: true },
    {
      field: 'department',
      label: L('Department', 'القسم'),
      kind: 'text',
      required: false,
      hint: L(
        'Left empty, it is taken from the approved job description for that role.',
        'إذا تركتها فاضية بتنأخذ من الوصف الوظيفي المعتمد لهالوظيفة.',
      ),
    },
    { field: 'location', label: L('Location', 'الموقع'), kind: 'text', required: false },
    { field: 'employmentType', label: L('Employment type', 'نوع التوظيف'), kind: 'choice', required: false, options: EMPLOYMENT_TYPES },
  ],

  updateJobOpening: [
    { field: 'title', label: L('Which vacancy', 'أي وظيفة'), kind: 'text', required: true },
    { field: 'location', label: L('Location', 'الموقع'), kind: 'text', required: false },
    { field: 'employmentType', label: L('Employment type', 'نوع التوظيف'), kind: 'choice', required: false, options: EMPLOYMENT_TYPES },
    { field: 'startDate', label: L('Deadline', 'الموعد النهائي'), kind: 'date', required: false },
  ],

  addEmployee: [
    { field: 'personName', label: L('Full name', 'الاسم الكامل'), kind: 'text', required: true },
    { field: 'email', label: L('Email', 'الإيميل'), kind: 'text', required: true },
    { field: 'employeeNumberNew', label: L('Employee number', 'الرقم الوظيفي'), kind: 'text', required: true },
    { field: 'jobTitle', label: L('Job title', 'المسمّى الوظيفي'), kind: 'text', required: true },
    { field: 'department', label: L('Department', 'القسم'), kind: 'text', required: true },
    {
      field: 'role',
      label: L('Role in the system', 'الدور بالنظام'),
      kind: 'choice',
      required: false,
      options: ROLES,
      hint: L('Employee, unless you say otherwise.', 'موظف، إلا إذا حددت غير هيك.'),
    },
  ],

  updateEmployeeDetails: [
    { field: 'personName', label: L('Who', 'مين'), kind: 'text', required: true },
    { field: 'jobTitle', label: L('New job title', 'المسمّى الجديد'), kind: 'text', required: false },
    { field: 'department', label: L('New department', 'القسم الجديد'), kind: 'text', required: false },
  ],

  changeEmployeeRole: [
    { field: 'personName', label: L('Who', 'مين'), kind: 'text', required: true },
    { field: 'role', label: L('New role', 'الدور الجديد'), kind: 'choice', required: true, options: ROLES },
  ],

  setSalary: [
    { field: 'personName', label: L('Who', 'مين'), kind: 'text', required: true },
    { field: 'amount', label: L('Monthly basic', 'الراتب الأساسي الشهري'), kind: 'text', required: true },
  ],

  createPayrollAdjustment: [
    { field: 'personName', label: L('Employee name', 'اسم الموظف'), kind: 'text', required: false, hint: L('Enter a name or the employee number below — one is required.', 'اكتب الاسم أو الرقم الوظيفي بالأسفل — يكفي واحد منهما.') },
    { field: 'employeeNumber', label: L('Employee number', 'الرقم الوظيفي'), kind: 'text', required: false, hint: L('Enter a name above or this exact employee number — one is required.', 'اكتب الاسم بالأعلى أو الرقم الوظيفي الدقيق — يكفي واحد منهما.') },
    { field: 'payrollAdjustmentKind', label: L('Type', 'النوع'), kind: 'choice', required: true, options: PAYROLL_ADJUSTMENT_KINDS },
    { field: 'amount', label: L('Amount', 'المبلغ'), kind: 'text', required: true },
    { field: 'text', label: L('Reason', 'السبب'), kind: 'longText', required: true },
  ],

  decideRequest: [
    { field: 'personName', label: L('Whose request', 'طلب مين'), kind: 'text', required: true },
    {
      field: 'decision',
      label: L('Decision', 'القرار'),
      kind: 'choice',
      required: true,
      options: [
        { value: 'approve', label: L('Approve', 'موافقة') },
        { value: 'reject', label: L('Reject', 'رفض') },
      ],
    },
  ],

  moveApplication: [
    { field: 'personName', label: L('Which applicant', 'أي مرشّح'), kind: 'text', required: true },
    { field: 'stage', label: L('Move to', 'انقله إلى'), kind: 'choice', required: true, options: STAGES },
  ],

  postAnnouncement: [
    { field: 'text', label: L('What it says', 'نص الإعلان'), kind: 'longText', required: true },
    {
      field: 'title',
      label: L('Title', 'العنوان'),
      kind: 'text',
      required: false,
      hint: L('Left empty, the first line is used.', 'إذا تركتها فاضية بتنأخذ أول سطر.'),
    },
  ],

  updateAnnouncement: [
    { field: 'title', label: L('Which announcement', 'أي إعلان'), kind: 'text', required: true },
    { field: 'text', label: L('New message', 'النص الجديد'), kind: 'longText', required: true },
  ],

  addCalendarEvent: [
    { field: 'title', label: L('What it is', 'شو هو'), kind: 'text', required: true },
    { field: 'startDate', label: L('Date', 'التاريخ'), kind: 'date', required: true },
  ],

  resetPassword: [{ field: 'personName', label: L('Who', 'مين'), kind: 'text', required: true }],

  approveJobDescription: [
    { field: 'title', label: L('Which draft', 'أي مسودة'), kind: 'text', required: true },
  ],

  publishOpening: [{ field: 'title', label: L('Which vacancy', 'أي وظيفة'), kind: 'text', required: true }],
  closeOpening: [{ field: 'title', label: L('Which vacancy', 'أي وظيفة'), kind: 'text', required: true }],
  deleteOpening: [{ field: 'title', label: L('Which vacancy', 'أي وظيفة'), kind: 'text', required: true }],
  deleteAnnouncement: [{ field: 'title', label: L('Which announcement', 'أي إعلان'), kind: 'text', required: true }],
  deleteKnowledgeText: [{ field: 'title', label: L('Which knowledge article', 'أي مقال معرفة'), kind: 'text', required: true }],
  analyseApplication: [{ field: 'personName', label: L('Which applicant', 'أي مرشّح'), kind: 'text', required: true }],
}

/** The boxes for an action, or null when it has nothing to fill in. */
export function formFor(action: CopilotAction): readonly FormField[] | null {
  return ACTION_FORM[action] ?? null
}

/**
 * What is already known, so the form opens part-filled.
 *
 * Somebody who typed "leave from Sunday to Tuesday" has said two of the three
 * things. Showing them three empty boxes throws that away and asks them to
 * repeat themselves, which is the thing that makes people stop using an
 * assistant and go back to the screen.
 */
export function valuesFrom(plan: CopilotActionPlan, fields: readonly FormField[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { field, into } of fields) {
    if (into) continue
    const held = plan[field as keyof CopilotActionPlan]
    if (typeof held === 'string' && held.trim()) out[field] = held
  }
  return out
}
