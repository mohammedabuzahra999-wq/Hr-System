import type { GuidePage } from '@hr/shared'

/**
 * Every screen in the system, described.
 *
 * Written by hand against the router and the navigation config rather than
 * generated from them, because a route tells you a path exists and says nothing
 * about what somebody is meant to do there — which is the only part a person
 * asking for help actually needs.
 *
 * The cost of that choice is that this file has to be updated when a screen
 * changes. That cost is the point: a guide that quietly drifts out of date is
 * worse than none, because a user who is misdirected assumes they have
 * misunderstood, not that the software is wrong.
 */

const L = (en: string, ar: string) => ({ en, ar })

/** The payroll workspace is one route with ten hash-selected sections. */
const payrollWorkspacePage = (
  section: string,
  titleEn: string,
  titleAr: string,
  purposeEn: string,
  purposeAr: string,
  actionEn: string,
  actionAr: string,
): GuidePage => ({
  path: `/hr/payroll#${section}`,
  roles: ['hr', 'admin'],
  title: L(titleEn, titleAr),
  purpose: L(purposeEn, purposeAr),
  actions: [L(actionEn, actionAr)],
})

const PAYROLL_WORKSPACE_PAGES: GuidePage[] = [
  payrollWorkspacePage(
    'overview',
    'Payroll overview',
    '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0631\u0648\u0627\u062a\u0628',
    'A monthly payroll summary and the AI monitoring status.',
    '\u0645\u0644\u062e\u0651\u0635 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0634\u0647\u0631\u064a \u0648\u062d\u0627\u0644\u0629 \u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a.',
    'Review net pay, allowances, deductions, and open audit findings.',
    '\u0631\u0627\u062c\u0639 \u0635\u0627\u0641\u064a \u0627\u0644\u0631\u0648\u0627\u062a\u0628\u060c \u0627\u0644\u0628\u062f\u0644\u0627\u062a\u060c \u0627\u0644\u062e\u0635\u0648\u0645\u0627\u062a\u060c \u0648\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629.',
  ),
  payrollWorkspacePage(
    'runs',
    'Payroll runs',
    '\u062f\u0648\u0631\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628',
    'Create, calculate, and review the monthly payroll cycle.',
    '\u0625\u0646\u0634\u0627\u0621 \u062f\u0648\u0631\u0629 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0634\u0647\u0631\u064a\u0629 \u0648\u062d\u0633\u0627\u0628\u0647\u0627 \u0648\u0645\u0631\u0627\u062c\u0639\u062a\u0647\u0627.',
    'See the current draft, calculation status, history, and approval flow.',
    '\u0634\u0648\u0641 \u0645\u0633\u0648\u062f\u0651\u0629 \u0627\u0644\u062f\u0648\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629\u060c \u062d\u0627\u0644\u0629 \u0627\u0644\u062d\u0633\u0627\u0628\u060c \u0627\u0644\u0633\u062c\u0644\u060c \u0648\u0645\u0631\u0627\u062d\u0644 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f.',
  ),
  payrollWorkspacePage(
    'salaries',
    'Employee salaries',
    '\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646',
    'Salary contracts and the employees who still need one.',
    '\u0639\u0642\u0648\u062f \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0648\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646 \u0627\u0644\u0630\u064a\u0646 \u0645\u0627 \u0632\u0627\u0644\u0648\u0627 \u0628\u062f\u0648\u0646 \u0639\u0642\u062f.',
    'Set or update a salary contract and review its history.',
    '\u062d\u062f\u0651\u062f \u0623\u0648 \u0639\u062f\u0651\u0644 \u0639\u0642\u062f \u0627\u0644\u0631\u0627\u062a\u0628 \u0648\u0631\u0627\u062c\u0639 \u062a\u0627\u0631\u064a\u062e\u0647.',
  ),
  payrollWorkspacePage(
    'earnings',
    'Earnings and deductions',
    '\u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642\u0627\u062a \u0648\u0627\u0644\u062e\u0635\u0648\u0645\u0627\u062a',
    'Allowances and deductions that affect payroll after review.',
    '\u0627\u0644\u0628\u062f\u0644\u0627\u062a \u0648\u0627\u0644\u062e\u0635\u0648\u0645\u0627\u062a \u0627\u0644\u062a\u064a \u062a\u0624\u062b\u0631 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u062a\u0628 \u0628\u0639\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629.',
    'Add or review an allowance or deduction for an employee.',
    '\u0623\u0636\u0641 \u0623\u0648 \u0631\u0627\u062c\u0639 \u0628\u062f\u0644\u064b\u0627 \u0623\u0648 \u062e\u0635\u0645\u064b\u0627 \u0644\u0645\u0648\u0638\u0641.',
  ),
  payrollWorkspacePage(
    'overtime',
    'Overtime',
    '\u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u064a',
    'Overtime inputs waiting to be reviewed for payroll.',
    '\u0625\u062f\u062e\u0627\u0644\u0627\u062a \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u064a \u0627\u0644\u062a\u064a \u062a\u0646\u062a\u0638\u0631 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0642\u0628\u0644 \u0627\u0644\u0631\u0648\u0627\u062a\u0628.',
    'Add or review overtime and its documented reason.',
    '\u0623\u0636\u0641 \u0623\u0648 \u0631\u0627\u062c\u0639 \u0639\u0645\u0644\u064b\u0627 \u0625\u0636\u0627\u0641\u064a\u064b\u0627 \u0648\u0633\u0628\u0628\u0647 \u0627\u0644\u0645\u0648\u062b\u0651\u0642.',
  ),
  payrollWorkspacePage(
    'bonuses',
    'Bonuses',
    '\u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062a',
    'One-time bonus inputs that need payroll review.',
    '\u0645\u0643\u0627\u0641\u0622\u062a \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629 \u0642\u0628\u0644 \u0623\u0646 \u062a\u0624\u062b\u0631 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u062a\u0628.',
    'Add or review a bonus for an employee.',
    '\u0623\u0636\u0641 \u0623\u0648 \u0631\u0627\u062c\u0639 \u0645\u0643\u0627\u0641\u0623\u0629 \u0644\u0645\u0648\u0638\u0641.',
  ),
  payrollWorkspacePage(
    'adjustments',
    'Payroll adjustments',
    '\u062a\u0639\u062f\u064a\u0644\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628',
    'All pending payroll inputs in one review queue.',
    '\u0643\u0644 \u0625\u062f\u062e\u0627\u0644\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0639\u0644\u0651\u0642\u0629 \u0641\u064a \u0635\u0641 \u0645\u0631\u0627\u062c\u0639\u0629 \u0648\u0627\u062d\u062f.',
    'Review bonus, allowance, deduction, and overtime inputs before approval.',
    '\u0631\u0627\u062c\u0639 \u0625\u062f\u062e\u0627\u0644\u0627\u062a \u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062a \u0648\u0627\u0644\u0628\u062f\u0644\u0627\u062a \u0648\u0627\u0644\u062e\u0635\u0648\u0645\u0627\u062a \u0648\u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u064a \u0642\u0628\u0644 \u0627\u0639\u062a\u0645\u0627\u062f\u0647\u0627.',
  ),
  payrollWorkspacePage(
    'review',
    'Payroll review',
    '\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0631\u0648\u0627\u062a\u0628',
    'AI audit findings that need a human review before finalizing payroll.',
    '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0627\u0644\u062a\u064a \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629 \u0628\u0634\u0631\u064a\u0629 \u0642\u0628\u0644 \u0625\u0642\u0641\u0627\u0644 \u0627\u0644\u0631\u0648\u0627\u062a\u0628.',
    'Review, explain, and resolve open payroll findings.',
    '\u0631\u0627\u062c\u0639\u060c \u0627\u0634\u0631\u062d\u060c \u0648\u0639\u0627\u0644\u062c \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629.',
  ),
  payrollWorkspacePage(
    'payslips',
    'Payslips',
    '\u0643\u0634\u0648\u0641 \u0627\u0644\u0631\u0648\u0627\u062a\u0628',
    'The payroll records and payslip status for each employee.',
    '\u0633\u062c\u0644\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0648\u062d\u0627\u0644\u0629 \u0643\u0634\u0641 \u0627\u0644\u0631\u0627\u062a\u0628 \u0644\u0643\u0644 \u0645\u0648\u0638\u0641.',
    'Review an employee\'s payslip and its processing status.',
    '\u0631\u0627\u062c\u0639 \u0643\u0634\u0641 \u0631\u0627\u062a\u0628 \u0627\u0644\u0645\u0648\u0638\u0641 \u0648\u062d\u0627\u0644\u0629 \u0645\u0639\u0627\u0644\u062c\u062a\u0647.',
  ),
  payrollWorkspacePage(
    'reports',
    'Payroll reports',
    '\u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628',
    'Monthly payroll reporting and export for the current cycle.',
    '\u062a\u0642\u0627\u0631\u064a\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0634\u0647\u0631\u064a\u0629 \u0648\u062a\u0635\u062f\u064a\u0631\u0647\u0627 \u0644\u0644\u062f\u0648\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.',
    'Review the payroll report and export the current cycle.',
    '\u0631\u0627\u062c\u0639 \u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0648\u0635\u062f\u0651\u0631 \u0627\u0644\u062f\u0648\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.',
  ),
]

export const GUIDE_PAGES: GuidePage[] = [
  /* ---------- everyone, and the first thing they see ---------- */
  {
    path: '/assistant',
    roles: ['employee', 'manager', 'hr', 'admin'],
    title: L('MenaChat', 'مينا شات'),
    purpose: L(
      'Where every session starts. Ask it a question about this system in plain words, or tell it what to do and it does it — within whatever your role allows, and never beyond.',
      'من هون بتبلّش كل مرة. اسأله عن النظام بكلامك العادي، أو قلّه شو بدك يعمل وبيعمله — بحدود دورك، وما بيتجاوزها أبداً.',
    ),
    actions: [
      L('Ask: "how much leave do I have", "who is in today".', 'اسأل: «كم رصيد إجازاتي»، «مين حاضر اليوم».'),
      L('Instruct: "check me in", "submit leave for me". It shows you what it will do first.', 'اطلب: «سجّل حضوري»، «بدي إجازة». بيوريك شو رح يعمل قبل ما يعمله.'),
      L('Skip it any time — your screens are all in the menu.', 'تخطّاه أي وقت — شاشاتك كلها بالقائمة.'),
    ],
  },

  /* ---------- employee ---------- */
  {
    path: '/home',
    roles: ['employee'],
    title: L('My page', 'صفحتي'),
    purpose: L(
      'Everything about your own work: your attendance today, your leave balance, your requests, your payslips and your documents.',
      'كل شي يخصّك: حضورك اليوم، رصيد إجازاتك، طلباتك، كشوف رواتبك ومستنداتك.',
    ),
    actions: [
      L('Check in at the start of your day and check out at the end.', 'سجّل حضورك أول الدوام ومغادرتك بآخره.'),
      L('Request leave, and see whether your manager has decided.', 'اطلب إجازة، وشوف إذا مديرك قرّر.'),
      L('Ask for a salary certificate.', 'اطلب شهادة راتب.'),
      L('Open your payslips and your documents.', 'افتح كشوف رواتبك ومستنداتك.'),
    ],
  },

  {
    path: '/home#overview',
    roles: ['employee'],
    title: L('My overview', '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629'),
    purpose: L('Your profile and today\'s work summary.', '\u0645\u0644\u0641\u0643 \u0648\u0645\u0644\u062e\u0651\u0635 \u062f\u0648\u0627\u0645\u0643 \u0644\u0644\u064a\u0648\u0645.'),
    actions: [L('Review your profile and today\'s work summary.', '\u0631\u0627\u062c\u0639 \u0645\u0644\u0641\u0643 \u0648\u0645\u0644\u062e\u0651\u0635 \u062f\u0648\u0627\u0645\u0643 \u0644\u0644\u064a\u0648\u0645.')],
  },
  {
    path: '/home#attendance',
    roles: ['employee'],
    title: L('My attendance', '\u062d\u0636\u0648\u0631\u064a'),
    purpose: L('Your attendance today and your recent working time.', '\u062d\u0636\u0648\u0631\u0643 \u0627\u0644\u064a\u0648\u0645 \u0648\u0623\u0648\u0642\u0627\u062a \u062f\u0648\u0627\u0645\u0643 \u0627\u0644\u0623\u062e\u064a\u0631\u0629.'),
    actions: [L('Check in, check out, and review your recent working time.', '\u0633\u062c\u0651\u0644 \u062d\u0636\u0648\u0631\u0643 \u0623\u0648 \u0645\u063a\u0627\u062f\u0631\u062a\u0643\u060c \u0648\u0631\u0627\u062c\u0639 \u0623\u0648\u0642\u0627\u062a \u062f\u0648\u0627\u0645\u0643 \u0627\u0644\u0623\u062e\u064a\u0631\u0629.')],
  },
  {
    path: '/home#leave',
    roles: ['employee'],
    title: L('Leave balance', '\u0631\u0635\u064a\u062f \u0627\u0644\u0625\u062c\u0627\u0632\u0627\u062a'),
    purpose: L('Your available leave balance and a way to submit a request.', '\u0631\u0635\u064a\u062f \u0625\u062c\u0627\u0632\u0627\u062a\u0643 \u0627\u0644\u0645\u062a\u0627\u062d \u0648\u0637\u0644\u0628 \u0625\u062c\u0627\u0632\u0629 \u062c\u062f\u064a\u062f.'),
    actions: [L('Review your balance and submit a new leave request.', '\u0631\u0627\u062c\u0639 \u0631\u0635\u064a\u062f\u0643 \u0648\u0642\u062f\u0651\u0645 \u0637\u0644\u0628 \u0625\u062c\u0627\u0632\u0629 \u062c\u062f\u064a\u062f.')],
  },
  {
    path: '/home#requests',
    roles: ['employee'],
    title: L('My requests', '\u0637\u0644\u0628\u0627\u062a\u064a'),
    purpose: L('The leave and other requests you have submitted.', '\u0637\u0644\u0628\u0627\u062a\u0643 \u0627\u0644\u0645\u0642\u062f\u0645\u0629 \u0648\u062d\u0627\u0644\u062a\u0647\u0627.'),
    actions: [L('Review your submitted requests and withdraw a pending one.', '\u0631\u0627\u062c\u0639 \u0637\u0644\u0628\u0627\u062a\u0643 \u0627\u0644\u0645\u0642\u062f\u0651\u0645\u0629 \u0648\u0627\u0633\u062d\u0628 \u0637\u0644\u0628\u064b\u0627 \u0645\u0627 \u0632\u0627\u0644 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0642\u0631\u0627\u0631.')],
  },
  {
    path: '/home#payslips',
    roles: ['employee'],
    title: L('My payslips', '\u0643\u0634\u0648\u0641 \u0631\u0648\u0627\u062a\u0628\u064a'),
    purpose: L('Your salary details and available payslips.', '\u062a\u0641\u0627\u0635\u064a\u0644 \u0631\u0627\u062a\u0628\u0643 \u0648\u0643\u0634\u0648\u0641 \u0627\u0644\u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0645\u062a\u0627\u062d\u0629.'),
    actions: [L('Open an available payslip and review its salary details.', '\u0627\u0641\u062a\u062d \u0643\u0634\u0641 \u0631\u0627\u062a\u0628 \u0645\u062a\u0627\u062d\u064b\u0627 \u0648\u0631\u0627\u062c\u0639 \u062a\u0641\u0627\u0635\u064a\u0644 \u0631\u0627\u062a\u0628\u0643.')],
  },
  {
    path: '/home#notifications',
    roles: ['employee'],
    title: L('My notifications', '\u0625\u0634\u0639\u0627\u0631\u0627\u062a\u064a'),
    purpose: L('Your latest work notifications and company notices.', '\u0622\u062e\u0631 \u0625\u0634\u0639\u0627\u0631\u0627\u062a\u0643 \u0648\u0625\u0639\u0644\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629.'),
    actions: [L('Read, mark as read, or dismiss your work notifications.', '\u0627\u0642\u0631\u0623 \u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0627\u0644\u0639\u0645\u0644\u060c \u0639\u0644\u0651\u0645\u0647\u0627 \u0643\u0645\u0642\u0631\u0648\u0621\u0629\u060c \u0623\u0648 \u0623\u062e\u0641\u0650 \u0625\u0634\u0639\u0627\u0631\u064b\u0627.')],
  },

  /* ---------- manager ---------- */
  {
    path: '/manager',
    roles: ['manager'],
    title: L('Manager dashboard', 'لوحة المدير'),
    purpose: L(
      'Your team at a glance: who is in today, what is waiting for your decision, and your own attendance.',
      'فريقك بلمحة: مين حاضر اليوم، شو مستنّي قرارك، وحضورك إنت.',
    ),
    actions: [
      L('Check in and out yourself — managers record attendance too.', 'سجّل حضورك ومغادرتك — المدير كمان بيسجّل.'),
      L('See how many approvals are waiting.', 'شوف كم موافقة مستنّية.'),
    ],
  },
  {
    path: '/manager/team',
    roles: ['manager'],
    title: L('My team', 'فريقي'),
    purpose: L('The people who report to you, with their job titles and whether they are in the system now.', 'الموظفون الي بيرفعولك، بمسمّياتهم وهل هم موجودين بالنظام هلق.'),
    actions: [L('Open a team member to see their details.', 'افتح أي عضو بالفريق لتشوف تفاصيله.')],
  },
  {
    path: '/manager/attendance',
    roles: ['manager'],
    title: L('Team attendance', 'حضور الفريق'),
    purpose: L('Who was present, late or absent across your team, day by day.', 'مين حضر أو تأخّر أو غاب من فريقك، يوم بيوم.'),
    actions: [L('Filter by status to see only absences or only lateness.', 'فلتر حسب الحالة لتشوف الغياب بس أو التأخير بس.')],
  },
  {
    path: '/manager/leaves',
    roles: ['manager'],
    title: L('Leave management', 'إدارة الإجازات'),
    purpose: L('Leave taken and planned across your team, and their remaining balances.', 'الإجازات المأخوذة والمخطّطة بفريقك، وأرصدتهم المتبقّية.'),
    actions: [L('See who is away and when.', 'شوف مين مجاز وإمتى.')],
  },
  {
    path: '/manager/approvals',
    roles: ['manager'],
    title: L('Approvals', 'الموافقات'),
    purpose: L(
      'Requests from your team waiting on you. Leave is decided here, by you — not by HR and not by an administrator.',
      'طلبات فريقك المستنّية قرارك. الإجازة بتتقرّر هون، منّك إنت — مش من الموارد البشرية ولا الأدمن.',
    ),
    actions: [
      L('Approve or reject a leave request, with a reason.', 'وافق أو ارفض طلب إجازة، مع سبب.'),
      L('See whether the person is in the system right now before deciding.', 'شوف إذا الشخص موجود بالنظام هلق قبل ما تقرّر.'),
    ],
  },
  {
    path: '/manager/calendar',
    roles: ['manager'],
    title: L('Team calendar', 'تقويم الفريق'),
    purpose: L('Leave, holidays and meetings laid out by date.', 'الإجازات والعطل والاجتماعات مرتّبة بالتواريخ.'),
    actions: [L('See overlapping absences before approving more.', 'شوف الغيابات المتداخلة قبل ما توافق على غيرها.')],
  },
  {
    path: '/manager/reports',
    roles: ['manager'],
    title: L('Team reports', 'تقارير الفريق'),
    purpose: L('Attendance and leave figures for your team over a period.', 'أرقام الحضور والإجازات لفريقك عبر فترة.'),
    actions: [L('Ask the assistant for a team report in plain words.', 'اطلب من المساعد تقرير فريق بكلامك العادي.')],
  },
  {
    path: '/manager/announcements',
    roles: ['manager'],
    title: L('Announcements', 'الإعلانات'),
    purpose: L('Notices you post, which everyone in the company sees with your name on them.', 'إعلانات بتنشرها، وبتوصل كل الشركة باسمك عليها.'),
    actions: [
      L('Post a notice, a holiday or a meeting.', 'انشر إعلان أو عطلة أو اجتماع.'),
      L('Set how long it stays up, and edit or withdraw it later.', 'حدّد كم بيضل منشور، وعدّله أو اسحبه بعدين.'),
    ],
  },

  /* ---------- HR ---------- */
  {
    path: '/hr',
    roles: ['hr'],
    title: L('HR centre', 'مركز الموارد البشرية'),
    purpose: L('The overview: headcount, attendance today, leave awaiting review, and your own attendance.', 'النظرة العامة: عدد الموظفين، حضور اليوم، الإجازات بانتظار المراجعة، وحضورك إنت.'),
    actions: [L('Check in and out yourself.', 'سجّل حضورك ومغادرتك.')],
  },
  {
    path: '/hr/employees',
    roles: ['hr'],
    title: L('Employee records', 'سجلات الموظفين'),
    purpose: L(
      'The staff directory, and a lookup that opens one person’s whole file from their employee number.',
      'دليل الموظفين، واستعلام بيفتح ملف الشخص كامل من رقمه الوظيفي.',
    ),
    actions: [
      L('Type an employee number to see their attendance, leave, salary, documents and requests in one place.', 'اكتب الرقم الوظيفي لتشوف حضوره وإجازاته وراتبه ومستنداته وطلباته بمكان واحد.'),
      L('Add an employee, or change their role.', 'أضف موظّف، أو غيّر دوره.'),
    ],
  },
  {
    path: '/hr/attendance',
    roles: ['hr'],
    title: L('Attendance overview', 'نظرة على الحضور'),
    purpose: L('Attendance across the whole company, not one team.', 'الحضور على مستوى الشركة كاملة، مش فريق واحد.'),
    actions: [L('Remind people who have not checked out.', 'ذكّر الي ما سجّلوا مغادرة.')],
  },
  {
    path: '/hr/leaves',
    roles: ['hr'],
    title: L('Leaves', 'الإجازات'),
    purpose: L(
      'Every leave request in the company, and where each one stands. HR sees these; the employee’s own manager decides them.',
      'كل طلبات الإجازات بالشركة ووين وصل كل واحد. الموارد البشرية بتشوفهم؛ ومدير الموظّف هو الي بيقرّر.',
    ),
    actions: [L('Track a request, and see who decided it and when.', 'تتبّع طلب، وشوف مين قرّره وإمتى.')],
  },
  {
    path: '/hr/recruitment',
    roles: ['hr', 'admin'],
    title: L('Recruitment', 'التوظيف'),
    purpose: L(
      'Vacancies, the applications that arrive against them, and the text to post on LinkedIn.',
      'الوظائف الشاغرة، والطلبات الي بتوصل عليها، ونصّ المنشور للينكدإن.',
    ),
    actions: [
      L('Create a vacancy, edit it, and publish it to the public careers page.', 'أنشئ وظيفة، عدّلها، وانشرها على صفحة الوظائف العامة.'),
      L('Copy the public link, or the ready-made LinkedIn post.', 'انسخ الرابط العام، أو منشور لينكدإن الجاهز.'),
      L('Read applications, see the CV match, and move a candidate along.', 'اقرأ الطلبات، شوف نسبة تطابق السيرة، وحرّك المرشّح.'),
    ],
  },
  {
    path: '/hr/job-descriptions',
    roles: ['hr', 'admin'],
    title: L('Job descriptions', 'الأوصاف الوظيفية'),
    purpose: L(
      'Write a job description with AI from the requirements you type, review it, and approve it.',
      'اكتب وصف وظيفي بالذكاء الاصطناعي من المتطلبات الي بتكتبها، راجعه، واعتمده.',
    ),
    actions: [
      L('Enter the role and its requirements, then generate.', 'اكتب المسمّى ومتطلباته، وبعدين ولّد.'),
      L('Edit any section by hand, or regenerate just that section.', 'عدّل أي قسم بإيدك، أو أعد توليد هاد القسم لحاله.'),
      L('Approve it — which also creates a draft vacancy on the recruitment page.', 'اعتمده — وهاد كمان بينشئ وظيفة مسودّة بصفحة التوظيف.'),
    ],
  },
  {
    path: '/hr/announcements',
    roles: ['hr'],
    title: L('Announcements', 'الإعلانات'),
    purpose: L('Notices to the whole company: holidays, meetings, policy changes.', 'إعلانات لكل الشركة: عطل، اجتماعات، تغييرات بالسياسات.'),
    actions: [L('Post, edit, or withdraw a notice, and set how long it stays up.', 'انشر أو عدّل أو اسحب إعلان، وحدّد كم بيضل منشور.')],
  },
  {
    path: '/hr/payroll',
    roles: ['hr', 'admin'],
    title: L('Payroll', 'الرواتب'),
    purpose: L('Salaries, payslips and the monthly payroll cycle.', 'الرواتب وكشوف الرواتب ودورة الرواتب الشهرية.'),
    actions: [L('See the current cycle and what each person is paid.', 'شوف الدورة الحالية وكم بيتقاضى كل شخص.')],
  },
  {
    path: '/hr/reports',
    roles: ['hr'],
    title: L('Reports', 'التقارير'),
    purpose: L('Figures across the company — attendance, leave, headcount, recruitment.', 'أرقام على مستوى الشركة — حضور، إجازات، عدد موظفين، توظيف.'),
    actions: [L('Ask the assistant for a report in plain words and print it.', 'اطلب من المساعد تقرير بكلامك العادي واطبعه.')],
  },

  {
    path: '/hr/attention',
    roles: ['hr', 'admin'],
    title: L('Attention centre', '\u0645\u0631\u0643\u0632 \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a'),
    purpose: L('Items that need HR review.', '\u0623\u0645\u0648\u0631 \u0628\u062d\u0627\u062c\u0629 \u0645\u0631\u0627\u062c\u0639\u0629.'),
    actions: [],
  },
  {
    path: '/hr/calendar',
    roles: ['hr', 'admin'],
    title: L('Team calendar', '\u062a\u0642\u0648\u064a\u0645 \u0627\u0644\u0641\u0631\u064a\u0642'),
    purpose: L('The shared calendar for leave and events.', '\u062a\u0642\u0648\u064a\u0645 \u0627\u0644\u0625\u062c\u0627\u0632\u0627\u062a \u0648\u0627\u0644\u0623\u062d\u062f\u0627\u062b.'),
    actions: [],
  },
  {
    path: '/hr/knowledge',
    roles: ['hr', 'admin'],
    title: L('Knowledge base', '\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629'),
    purpose: L('Approved sources used by the assistant.', '\u0627\u0644\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 \u0644\u0644\u0645\u0633\u0627\u0639\u062f.'),
    actions: [],
  },
  {
    path: '/hr/assistant-questions',
    roles: ['hr', 'admin'],
    title: L('Assistant questions', '\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0633\u0627\u0639\u062f'),
    purpose: L('Questions that need assistant review.', '\u0623\u0633\u0626\u0644\u0629 \u0628\u062d\u0627\u062c\u0629 \u0645\u0631\u0627\u062c\u0639\u0629.'),
    actions: [],
  },

  ...PAYROLL_WORKSPACE_PAGES,

  /* ---------- admin ---------- */
  {
    path: '/dashboard',
    roles: ['admin'],
    title: L('Dashboard', 'لوحة المعلومات'),
    purpose: L('System-wide figures and activity.', 'أرقام ونشاط على مستوى النظام.'),
    actions: [],
  },
  {
    path: '/admin',
    roles: ['admin'],
    title: L('Admin overview', 'نظرة عامة على الإدارة'),
    purpose: L('The state of the system: accounts, roles, attendance and alerts worth looking at.', 'حالة النظام: الحسابات، الأدوار، الحضور، والتنبيهات الي تستاهل نظرة.'),
    actions: [L('Check in and out yourself.', 'سجّل حضورك ومغادرتك.')],
  },
  {
    path: '/admin/users',
    roles: ['admin'],
    title: L('User roles', 'أدوار المستخدمين'),
    purpose: L('Who has which role, and whether their account is active.', 'مين عنده أي دور، وهل حسابه مفعّل.'),
    actions: [
      L('Change somebody’s role, or disable their account.', 'غيّر دور حدا، أو عطّل حسابه.'),
      L('Reset a password — you cannot read an existing one, only replace it.', 'صفّر كلمة سر — ما بتقدر تقرأ الموجودة، بس تستبدلها.'),
    ],
  },
  {
    path: '/admin/approvals',
    roles: ['admin'],
    title: L('Approvals', 'الموافقات'),
    purpose: L(
      'Every request in the company, for oversight. Decisions are made by each employee’s own manager, not here.',
      'كل الطلبات بالشركة، للاطّلاع. القرارات بياخدها مدير كل موظّف، مش من هون.',
    ),
    actions: [L('See what is pending and who it is waiting on.', 'شوف شو معلّق ومستنّي مين.')],
  },
  {
    path: '/admin/announcements',
    roles: ['admin'],
    title: L('Announcements', 'الإعلانات'),
    purpose: L('Notices from the administrator to everyone, and oversight of anyone else’s.', 'إعلانات من مدير النظام للكل، ومتابعة إعلانات غيره.'),
    actions: [L('Post a notice, or edit and withdraw one posted by HR or a manager.', 'انشر إعلان، أو عدّل واسحب إعلان نشرته الموارد البشرية أو مدير.')],
  },

  {
    path: '/manager/profile',
    roles: ['manager'],
    title: L('My profile', 'ملفي الشخصي'),
    purpose: L(
      'Your own record as HR holds it, and your own working day — a manager is an employee too.',
      'ملفك زي ما الموارد البشرية شايفته، ودوامك أنت — المدير موظف كمان.',
    ),
    actions: [
      L('Check your own attendance and request your own leave here.', 'سجّل حضورك واطلب إجازتك من هون.'),
    ],
  },
  {
    path: '/manager/settings',
    roles: ['manager'],
    title: L('Settings', '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a'),
    purpose: L('Manage the settings available for your manager account.', '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u062d\u0633\u0627\u0628\u0643 \u0643\u0645\u062f\u064a\u0631.'),
    actions: [],
  },

  /* ---------- everyone ---------- */
  {
    path: '/careers',
    roles: ['admin', 'manager', 'hr', 'employee'],
    title: L('Careers page', 'صفحة الوظائف'),
    purpose: L(
      'The public page. Anybody on the internet can open it with no account and apply — this is where applications come from.',
      'الصفحة العامة. أي حدا على الإنترنت بيفتحها بلا حساب ويقدّم — من هون بتيجي الطلبات.',
    ),
    actions: [L('Open it to see a vacancy the way a candidate sees it.', 'افتحها لتشوف الوظيفة زي ما بيشوفها المرشّح.')],
  },
]

/** Extra capabilities for screens whose UI is primarily a work queue or review surface. */
const EXTRA_PAGE_ACTIONS: Readonly<Record<string, ReturnType<typeof L>[]>> = {
  '/hr/attention': [
    L('Open contracts, leave, payroll inputs, and findings that need review.', '\u0627\u0641\u062a\u062d \u0639\u0642\u0648\u062f \u0627\u0644\u0631\u0648\u0627\u062a\u0628\u060c \u0627\u0644\u0625\u062c\u0627\u0632\u0627\u062a\u060c \u0625\u062f\u062e\u0627\u0644\u0627\u062a \u0627\u0644\u0631\u0648\u0627\u062a\u0628\u060c \u0648\u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u062a\u064a \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629.'),
    L('Ask the assistant to analyze an item before opening its workflow.', '\u0627\u0637\u0644\u0628 \u0645\u0646 \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0623\u0646 \u064a\u062d\u0644\u0644 \u0627\u0644\u0639\u0646\u0635\u0631 \u0642\u0628\u0644 \u0641\u062a\u062d \u0625\u062c\u0631\u0627\u0621\u0647.'),
  ],
  '/hr/calendar': [
    L('View leave and team events, or add a calendar event.', '\u0634\u0648\u0641 \u0627\u0644\u0625\u062c\u0627\u0632\u0627\u062a \u0648\u0623\u062d\u062f\u0627\u062b \u0627\u0644\u0641\u0631\u064a\u0642\u060c \u0623\u0648 \u0623\u0636\u0641 \u062d\u062f\u062b\u064b\u0627 \u0639\u0644\u0649 \u0627\u0644\u062a\u0642\u0648\u064a\u0645.'),
  ],
  '/hr/knowledge': [
    L('Add an approved text or file source and choose which roles may use it.', '\u0623\u0636\u0641 \u0646\u0635\u064b\u0627 \u0623\u0648 \u0645\u0644\u0641\u064b\u0627 \u0645\u0639\u062a\u0645\u062f\u064b\u0627\u060c \u0648\u062d\u062f\u0651\u062f \u0627\u0644\u0623\u062f\u0648\u0627\u0631 \u0627\u0644\u062a\u064a \u064a\u0645\u0643\u0646\u0647\u0627 \u0627\u0633\u062a\u062e\u062f\u0627\u0645\u0647.'),
    L('Review or remove a source when it is no longer current.', '\u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0635\u062f\u0631 \u0623\u0648 \u0627\u062d\u0630\u0641\u0647 \u0639\u0646\u062f\u0645\u0627 \u0644\u0627 \u064a\u0639\u0648\u062f \u0645\u062d\u062f\u0651\u062b\u064b\u0627.'),
  ],
  '/hr/assistant-questions': [
    L('Review the exact questions the assistant could not answer and why.', '\u0631\u0627\u062c\u0639 \u0646\u0635 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062a\u064a \u0644\u0645 \u064a\u062a\u0645\u0643\u0651\u0646 \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0645\u0646 \u0625\u062c\u0627\u0628\u062a\u0647\u0627 \u0648\u0633\u0628\u0628 \u0630\u0644\u0643.'),
  ],
  '/dashboard': [
    L('Review company KPIs, live attendance, open roles, payroll, and system alerts.', '\u0631\u0627\u062c\u0639 \u0645\u0624\u0634\u0631\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629\u060c \u0627\u0644\u062d\u0636\u0648\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u060c \u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629\u060c \u0627\u0644\u0631\u0648\u0627\u062a\u0628\u060c \u0648\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0627\u0644\u0646\u0638\u0627\u0645.'),
  ],
  '/manager/settings': [
    L('Review the manager notification, security, and access settings shown here.', '\u0631\u0627\u062c\u0639 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u062f\u064a\u0631 \u0648\u0623\u0645\u0646 \u0627\u0644\u062d\u0633\u0627\u0628 \u0648\u0635\u0644\u0627\u062d\u064a\u0627\u062a\u0647.'),
  ],
}

/** The page entry for a route, matched longest-first so `/hr/leaves` beats `/hr`. */
export function pageFor(path: string | undefined, role: string): GuidePage | null {
  if (!path) return null
  const hashIndex = path.indexOf('#')
  const beforeHash = (hashIndex === -1 ? path : path.slice(0, hashIndex)).split('?')[0]!
  const clean = hashIndex === -1 ? beforeHash : `${beforeHash}${path.slice(hashIndex)}`
  const candidates = GUIDE_PAGES.filter(
    (p) =>
      p.roles.includes(role as GuidePage['roles'][number]) &&
      (clean === p.path || clean.startsWith(`${p.path}/`) || clean.startsWith(`${p.path}#`)),
  )
  const page = candidates.sort((a, b) => b.path.length - a.path.length)[0] ?? null
  if (!page) return null
  const extras = EXTRA_PAGE_ACTIONS[page.path]
  return extras?.length ? { ...page, actions: [...page.actions, ...extras] } : page
}
