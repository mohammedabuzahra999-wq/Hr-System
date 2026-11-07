import type { Role } from '@hr/shared'

/**
 * Who may do what, in one place — and the place the routes read it from.
 *
 * Until now these lists were written inline at twenty-seven call sites across
 * ten files. That works: `requireRole('hr', 'admin')` beside the handler is
 * clear, and it is enforced. What it cannot do is answer "who can approve
 * leave?" without somebody reading ten files, which means the answer on the
 * permissions screen was written separately, by hand, and was wrong.
 *
 * So the routes now name a capability from this table, and the screen renders
 * the same table. There is one statement of each rule, and it is the one that
 * runs — a screen that disagrees with the server is not documentation, it is a
 * second claim nobody checked.
 *
 * Each entry says what the capability is *for*, because a list of role arrays
 * with no explanation is only marginally better than reading the routes.
 */

export interface Capability {
  /** Roles allowed. Everything not listed is refused. */
  roles: readonly Role[]
  /** What this permits, in both languages, for the screen. */
  label: { en: string; ar: string }
  /** Which part of the system it belongs to, for grouping. */
  area: 'people' | 'time' | 'pay' | 'hiring' | 'communication' | 'oversight'
  /**
   * Said where it is surprising.
   *
   * "HR can see every leave request but cannot decide one" is the kind of rule
   * people assume the opposite of, and an unexplained role list invites exactly
   * that assumption.
   */
  note?: { en: string; ar: string }
}

const L = (en: string, ar: string) => ({ en, ar })

export const CAPABILITIES = {
  /* ---------- people ---------- */
  viewEmployees: {
    roles: ['hr', 'admin', 'manager'],
    area: 'people',
    label: L('See the employee directory', 'عرض دليل الموظفين'),
    note: L(
      'A manager sees their own reports; HR and an administrator see everybody.',
      'المدير بيشوف فريقه؛ والموارد البشرية والأدمن بيشوفوا الكل.',
    ),
  },
  manageEmployees: {
    roles: ['hr', 'admin'],
    area: 'people',
    label: L('Add an employee, or change their details', 'إضافة موظّف أو تعديل بياناته'),
  },
  resetPassword: {
    roles: ['hr', 'admin'],
    area: 'people',
    label: L('Reset somebody’s password', 'تصفير كلمة سر'),
    note: L(
      'Nobody can read an existing password — they are one-way hashes. It can only be replaced.',
      'ما حدا بيقدر يقرأ كلمة سر موجودة — مخزّنة بتجزئة باتجاه واحد. بس بتنستبدل.',
    ),
  },
  lookUpEmployeeFile: {
    roles: ['hr', 'admin'],
    area: 'people',
    label: L('Open one employee’s whole file', 'فتح ملف موظّف كامل'),
    note: L('It contains their pay, which is why a manager cannot.', 'بيحتوي راتبه، ولهيك المدير ما بيقدر.'),
  },

  /* ---------- time ---------- */
  recordOwnAttendance: {
    roles: ['employee', 'manager', 'hr', 'admin'],
    area: 'time',
    label: L('Check in and out', 'تسجيل الحضور والمغادرة'),
    note: L('Everyone, including managers and administrators.', 'الكل، بما فيهم المدراء والأدمن.'),
  },
  viewTeamAttendance: {
    roles: ['manager', 'hr', 'admin'],
    area: 'time',
    label: L('See attendance for others', 'عرض حضور الآخرين'),
  },
  remindCheckout: {
    roles: ['hr', 'admin'],
    area: 'time',
    label: L('Remind people who have not checked out', 'تذكير من ما سجّلوا مغادرة'),
  },
  viewRequests: {
    roles: ['manager', 'hr', 'admin'],
    area: 'time',
    label: L('See leave and other requests', 'عرض طلبات الإجازات وغيرها'),
  },
  decideRequests: {
    roles: ['manager'],
    area: 'time',
    label: L('Approve or reject a request', 'الموافقة على طلب أو رفضه'),
    note: L(
      'Only the employee’s own manager. HR and administrators can see every request but decide none of them.',
      'مدير الموظّف بس. الموارد البشرية والأدمن بيشوفوا كل الطلبات وما بيقرّروا ولا واحد.',
    ),
  },
  manageCalendar: {
    roles: ['manager', 'hr', 'admin'],
    area: 'time',
    label: L('Add or remove calendar events', 'إضافة أو حذف أحداث التقويم'),
  },

  /* ---------- pay ---------- */
  viewPayroll: {
    roles: ['hr', 'admin'],
    area: 'pay',
    label: L('See salaries and payslips', 'عرض الرواتب وكشوف الرواتب'),
    note: L('Everyone can see their own, always.', 'كل واحد بيشوف كشوفه هو، دايماً.'),
  },
  runPayroll: {
    roles: ['hr', 'admin'],
    area: 'pay',
    label: L('Calculate and approve a month’s payroll', 'حساب واعتماد رواتب الشهر'),
    note: L('An approved run is locked and cannot be recalculated.', 'الدورة المعتمدة بتنقفل وما بتنحسب من جديد.'),
  },
  setSalary: {
    roles: ['hr', 'admin'],
    area: 'pay',
    label: L('Set what somebody earns', 'تحديد راتب موظّف'),
    note: L(
      'A raise starts a new agreement on a date rather than editing the old one, so payslips already issued still recalculate to what was paid.',
      'الزيادة بتبلّش اتفاق جديد من تاريخ، مو بتعدّل القديم — فكشوف الرواتب القديمة بتضل تطلع زي ما اندفعت.',
    ),
  },
  managePayrollSettings: {
    roles: ['hr', 'admin'],
    area: 'pay',
    label: L('Set the tax and social security rates', 'ضبط نسب الضريبة والضمان'),
  },

  /* ---------- hiring ---------- */
  manageRecruitment: {
    roles: ['hr', 'admin'],
    area: 'hiring',
    label: L('Vacancies, applications and publishing', 'الوظائف والطلبات والنشر'),
  },
  manageJobDescriptions: {
    roles: ['hr', 'admin'],
    area: 'hiring',
    label: L('Write and approve job descriptions', 'كتابة واعتماد الأوصاف الوظيفية'),
  },
  manageKnowledge: {
    roles: ['hr', 'admin'],
    area: 'oversight',
    label: L('Manage the assistant knowledge base', 'إدارة قاعدة معرفة المساعد'),
    note: L('Each source names the roles that may use it.', 'كل مصدر يحدد الأدوار التي يمكنها استخدامه.'),
  },
  reviewAssistantQuestions: {
    roles: ['hr', 'admin'],
    area: 'oversight',
    label: L('Review questions the assistant could not answer', 'مراجعة الأسئلة التي لم يستطع المساعد الإجابة عنها'),
    note: L(
      'Shows the exact question for improving the assistant. It is not available to employees or managers.',
      'يعرض نص السؤال كما أُرسل لتطوير المساعد، ولا يظهر للموظفين أو المدراء.'
    ),
  },
  manageCvFiles: {
    roles: ['hr', 'admin'],
    area: 'hiring',
    label: L('Upload or remove a CV', 'رفع أو حذف سيرة ذاتية'),
  },

  /* ---------- communication ---------- */
  postAnnouncements: {
    roles: ['manager', 'hr', 'admin'],
    area: 'communication',
    label: L('Post an announcement to everyone', 'نشر إعلان للجميع'),
    note: L('The author’s name is shown on it.', 'اسم الناشر بيظهر عليه.'),
  },

  /* ---------- oversight ---------- */
  viewOrgStats: {
    roles: ['admin', 'hr'],
    area: 'oversight',
    label: L('See company-wide figures', 'عرض أرقام على مستوى الشركة'),
  },
  viewTeamStats: {
    roles: ['manager', 'hr', 'admin'],
    area: 'oversight',
    label: L('See team figures', 'عرض أرقام الفريق'),
  },
} as const satisfies Record<string, Capability>

export type CapabilityName = keyof typeof CAPABILITIES

/** The roles for a capability, spread straight into `requireRole`. */
export function allowed(name: CapabilityName): Role[] {
  return [...CAPABILITIES[name].roles]
}
