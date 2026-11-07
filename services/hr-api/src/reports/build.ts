import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { HrReport, ReportSection, ReportType, SessionUser } from '@hr/shared'
import { mayAsk } from '../copilot/intents.js'
import { db } from '../db/client.js'
import { applications, attendanceDays, candidates, jobOpenings, requests, users } from '../db/schema.js'
import { resolvePeriod, type ResolvedPeriod } from '../copilot/execute.js'
import type { CopilotPeriod } from '@hr/shared'

/**
 * Building a report from the database.
 *
 * Every figure below is a query. Nothing is estimated, nothing is carried over
 * from a previous report, and nothing comes from a model — the prose is added
 * afterwards by a separate step that is handed these sections and can reach
 * nothing else.
 *
 * Scope is decided here, from who asked, exactly as it is everywhere else in
 * this system: a manager's report covers their own reports, HR's covers the
 * company. There is no parameter that widens it, because there is no query here
 * that would honour one.
 */

const L = (en: string, ar: string) => ({ en, ar })
const MAX_ROWS = 100

interface Scope {
  userIds: string[]
  label: { en: string; ar: string }
}

/** Who a report covers, from who asked and which department they named. */
async function resolveScope(
  actor: SessionUser,
  department: string | null,
  /**
   * Only this person's own record.
   *
   * Set by the route from the intent, never from anything the model produced,
   * and it short-circuits before any role or department is considered. A report
   * about yourself is your own data whatever your role is, and it is exactly
   * one row wide no matter what else was asked for.
   */
  self = false,
): Promise<Scope> {
  if (self) return { userIds: [actor.id], label: L('You', 'أنت') }

  if (actor.role === 'manager') {
    const team = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.managerId, actor.id), eq(users.isActive, true)))
    return { userIds: team.map((t) => t.id), label: L('Your team', 'فريقك') }
  }

  const staff = await db
    .select({ id: users.id, en: users.departmentEn, ar: users.departmentAr })
    .from(users)
    .where(eq(users.isActive, true))

  if (!department) return { userIds: staff.map((s) => s.id), label: L('Whole company', 'الشركة كاملة') }

  const needle = department.toLowerCase()
    const matched = staff.filter((s) => [s.en, s.ar].some((d) => d.toLowerCase().includes(needle)))
  if (matched.length === 0) {
    // Named a department that matches nothing: an empty report saying so, never
    // a silent fall back to everybody.
    return { userIds: [], label: L(`Department "${department}" — not found`, `قسم «${department}» — غير موجود`) }
  }
  const name = matched[0]!
  return { userIds: matched.map((s) => s.id), label: L(name.en, name.ar) }
}

/** Attendance counts by status, for a set of people over a range. */
async function attendanceRows(userIds: string[], p: ResolvedPeriod) {
  if (userIds.length === 0) return []
  return db
    .select({ status: attendanceDays.status, total: count() })
    .from(attendanceDays)
    .where(
      and(
        inArray(attendanceDays.userId, userIds),
        gte(attendanceDays.workDate, p.from),
        lte(attendanceDays.workDate, p.to),
      ),
    )
    .groupBy(attendanceDays.status)
}

async function buildAttendance(scope: Scope, p: ResolvedPeriod): Promise<ReportSection[]> {
  const rows = await attendanceRows(scope.userIds, p)
  const by = new Map(rows.map((r) => [r.status, Number(r.total)]))
  const totalDays = [...by.values()].reduce((a, b) => a + b, 0)
  const present = (by.get('present') ?? 0) + (by.get('late') ?? 0)

  const perPerson =
    scope.userIds.length === 0
      ? []
      : await db
          .select({
            en: users.fullNameEn,
            ar: users.fullNameAr,
            status: attendanceDays.status,
            total: count(),
          })
          .from(attendanceDays)
          .innerJoin(users, eq(users.id, attendanceDays.userId))
          .where(
            and(
              inArray(attendanceDays.userId, scope.userIds),
              gte(attendanceDays.workDate, p.from),
              lte(attendanceDays.workDate, p.to),
            ),
          )
          .groupBy(users.fullNameEn, users.fullNameAr, attendanceDays.status)

  const people = new Map<string, { ar: string; present: number; late: number; absent: number; leave: number }>()
  for (const r of perPerson) {
    const row = people.get(r.en) ?? { ar: r.ar, present: 0, late: 0, absent: 0, leave: 0 }
    /**
     * Written out rather than indexed by the status string.
     *
     * The statuses include `holiday` and `weekend`, which this table has no
     * column for — a dynamic assignment would have silently added fields the
     * renderer ignores, and quietly widened the type to swallow whatever a
     * future status is called.
     */
    if (r.status === 'present') row.present = Number(r.total)
    else if (r.status === 'late') row.late = Number(r.total)
    else if (r.status === 'absent') row.absent = Number(r.total)
    else if (r.status === 'leave') row.leave = Number(r.total)
    people.set(r.en, row)
  }

  return [
    {
      kind: 'stats',
      heading: L('Summary', 'الملخّص'),
      stats: [
        { label: L('People covered', 'عدد المشمولين'), value: String(scope.userIds.length), detail: null },
        { label: L('Days present', 'أيام الحضور'), value: String(by.get('present') ?? 0), detail: null },
        { label: L('Days late', 'أيام التأخير'), value: String(by.get('late') ?? 0), detail: null },
        { label: L('Days absent', 'أيام الغياب'), value: String(by.get('absent') ?? 0), detail: null },
        { label: L('Days on leave', 'أيام الإجازات'), value: String(by.get('leave') ?? 0), detail: null },
        {
          label: L('Attendance rate', 'نسبة الحضور'),
          // Computed here, not asked of a model. Percentages are arithmetic.
          value: totalDays > 0 ? `${Math.round((present / totalDays) * 100)}%` : '—',
          detail: L(`${present} of ${totalDays} recorded days`, `${present} من ${totalDays} يوم مسجّل`),
        },
      ],
    },
    {
      kind: 'table',
      heading: L('By person', 'حسب الموظّف'),
      columns: [L('Name', 'الاسم'), L('Present', 'حضور'), L('Late', 'تأخير'), L('Absent', 'غياب'), L('Leave', 'إجازة')],
      rows: [...people.entries()]
        .sort((a, b) => b[1].present - a[1].present || a[0].localeCompare(b[0]))
        .slice(0, MAX_ROWS)
        .map(([en, r]) => [r.ar || en, String(r.present), String(r.late), String(r.absent), String(r.leave)]),
      note: people.size > MAX_ROWS ? L(`Showing ${MAX_ROWS} of ${people.size}`, `عرض ${MAX_ROWS} من ${people.size}`) : null,
    },
  ]
}

async function buildLeave(scope: Scope, p: ResolvedPeriod): Promise<ReportSection[]> {
  const taken =
    scope.userIds.length === 0
      ? []
      : await db
          .select({ en: users.fullNameEn, ar: users.fullNameAr, total: count() })
          .from(attendanceDays)
          .innerJoin(users, eq(users.id, attendanceDays.userId))
          .where(
            and(
              inArray(attendanceDays.userId, scope.userIds),
              eq(attendanceDays.status, 'leave'),
              gte(attendanceDays.workDate, p.from),
              lte(attendanceDays.workDate, p.to),
            ),
          )
          .groupBy(users.fullNameEn, users.fullNameAr)

  const byStatus =
    scope.userIds.length === 0
      ? []
      : await db
          .select({ status: requests.status, total: count() })
          .from(requests)
          .where(and(inArray(requests.userId, scope.userIds), eq(requests.kind, 'leave')))
          .groupBy(requests.status)

  const totalDays = taken.reduce((a, r) => a + Number(r.total), 0)

  return [
    {
      kind: 'stats',
      heading: L('Summary', 'الملخّص'),
      stats: [
        { label: L('Leave days taken', 'أيام الإجازات المأخوذة'), value: String(totalDays), detail: null },
        { label: L('People who took leave', 'عدد من أخذوا إجازة'), value: String(taken.length), detail: null },
        ...byStatus.map((s) => ({
          label: L(`Requests ${s.status}`, `طلبات ${s.status}`),
          value: String(s.total),
          detail: null,
        })),
      ],
    },
    {
      kind: 'table',
      heading: L('Leave by person', 'الإجازات حسب الموظّف'),
      columns: [L('Name', 'الاسم'), L('Days', 'الأيام')],
      rows: taken
        .sort((a, b) => Number(b.total) - Number(a.total) || a.en.localeCompare(b.en))
        .slice(0, MAX_ROWS)
        .map((r) => [r.ar || r.en, String(r.total)]),
      note: null,
    },
  ]
}

async function buildEmployees(scope: Scope): Promise<ReportSection[]> {
  if (scope.userIds.length === 0) return []
  const rows = await db
    .select({
      en: users.fullNameEn,
      ar: users.fullNameAr,
      number: users.employeeNumber,
      jobAr: users.jobTitleAr,
      jobEn: users.jobTitleEn,
      deptAr: users.departmentAr,
      deptEn: users.departmentEn,
      joinedOn: users.joinedOn,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.id, scope.userIds))
    .orderBy(users.departmentAr, users.fullNameAr)

  const byDept = new Map<string, number>()
  for (const r of rows) byDept.set(r.deptAr || r.deptEn, (byDept.get(r.deptAr || r.deptEn) ?? 0) + 1)

  return [
    {
      kind: 'stats',
      heading: L('Summary', 'الملخّص'),
      stats: [
        { label: L('Employees', 'الموظفون'), value: String(rows.length), detail: null },
        { label: L('Departments', 'الأقسام'), value: String(byDept.size), detail: null },
      ],
    },
    {
      kind: 'table',
      heading: L('People', 'الموظفون'),
      columns: [L('Number', 'الرقم'), L('Name', 'الاسم'), L('Job title', 'المسمّى'), L('Department', 'القسم'), L('Joined', 'تاريخ الالتحاق')],
      rows: rows
        .slice(0, MAX_ROWS)
        .map((r) => [r.number, r.ar || r.en, r.jobAr || r.jobEn, r.deptAr || r.deptEn, String(r.joinedOn)]),
      note: rows.length > MAX_ROWS ? L(`Showing ${MAX_ROWS} of ${rows.length}`, `عرض ${MAX_ROWS} من ${rows.length}`) : null,
    },
  ]
}

async function buildRecruitment(p: ResolvedPeriod): Promise<ReportSection[]> {
  const openings = await db.select().from(jobOpenings).orderBy(desc(jobOpenings.openedOn))
  const apps = await db
    .select({ status: applications.status, total: count() })
    .from(applications)
    .where(and(gte(sql`${applications.appliedAt}::date`, p.from), lte(sql`${applications.appliedAt}::date`, p.to)))
    .groupBy(applications.status)

  const perOpening = await db
    .select({ openingId: applications.openingId, total: count() })
    .from(applications)
    .groupBy(applications.openingId)
  const byOpening = new Map(perOpening.map((r) => [r.openingId, Number(r.total)]))

  const [candidateCount] = await db.select({ n: count() }).from(candidates)

  return [
    {
      kind: 'stats',
      heading: L('Summary', 'الملخّص'),
      stats: [
        {
          label: L('Open vacancies', 'الوظائف المفتوحة'),
          value: String(openings.filter((o) => o.status === 'open').length),
          detail: null,
        },
        {
          label: L('Published', 'المنشورة'),
          value: String(openings.filter((o) => o.publishedAt).length),
          detail: null,
        },
        { label: L('Candidates on file', 'المرشّحون المسجّلون'), value: String(candidateCount?.n ?? 0), detail: null },
        ...apps.map((a) => ({ label: L(a.status, a.status), value: String(a.total), detail: null })),
      ],
    },
    {
      kind: 'table',
      heading: L('Vacancies', 'الوظائف'),
      columns: [L('Role', 'الوظيفة'), L('Department', 'القسم'), L('Status', 'الحالة'), L('Applications', 'الطلبات'), L('Opened', 'تاريخ الفتح')],
      rows: openings
        .slice(0, MAX_ROWS)
        .map((o) => [
          o.titleAr || o.titleEn,
          o.departmentAr || o.departmentEn,
          o.status,
          String(byOpening.get(o.id) ?? 0),
          String(o.openedOn),
        ]),
      note: null,
    },
  ]
}

async function buildDepartment(p: ResolvedPeriod): Promise<ReportSection[]> {
  const staff = await db
    .select({ id: users.id, en: users.departmentEn, ar: users.departmentAr })
    .from(users)
    .where(eq(users.isActive, true))

  const depts = new Map<string, { ar: string; ids: string[] }>()
  for (const s of staff) {
    const d = depts.get(s.en) ?? { ar: s.ar, ids: [] }
    d.ids.push(s.id)
    depts.set(s.en, d)
  }

  const rows: string[][] = []
  for (const [en, d] of depts) {
    const counts = await attendanceRows(d.ids, p)
    const by = new Map(counts.map((r) => [r.status, Number(r.total)]))
    const total = [...by.values()].reduce((a, b) => a + b, 0)
    const present = (by.get('present') ?? 0) + (by.get('late') ?? 0)
    rows.push([
      d.ar || en,
      String(d.ids.length),
      String(present),
      String(by.get('absent') ?? 0),
      String(by.get('leave') ?? 0),
      total > 0 ? `${Math.round((present / total) * 100)}%` : '—',
    ])
  }

  return [
    {
      kind: 'stats',
      heading: L('Summary', 'الملخّص'),
      stats: [
        { label: L('Departments', 'الأقسام'), value: String(depts.size), detail: null },
        { label: L('Employees', 'الموظفون'), value: String(staff.length), detail: null },
      ],
    },
    {
      kind: 'table',
      heading: L('By department', 'حسب القسم'),
      columns: [
        L('Department', 'القسم'),
        L('People', 'العدد'),
        L('Present', 'حضور'),
        L('Absent', 'غياب'),
        L('Leave', 'إجازة'),
        L('Rate', 'النسبة'),
      ],
      rows: rows.sort((a, b) => Number(b[1]) - Number(a[1])),
      note: null,
    },
    {
      kind: 'barChart',
      heading: L('Absence rate by department', '\u0646\u0633\u0628\u0629 \u0627\u0644\u063a\u064a\u0627\u0628 \u062d\u0633\u0628 \u0627\u0644\u0642\u0633\u0645'),
      bars: rows
        .map((row) => {
          const present = Number(row[2])
          const absent = Number(row[3])
          const rate = present + absent > 0 ? Math.round((absent / (present + absent)) * 100) : 0
          return {
            label: L(row[0]!, row[0]!),
            value: rate,
            valueLabel: present + absent > 0 ? `${rate}%` : '—',
          }
        })
        .sort((a, b) => b.value - a.value || a.label.en.localeCompare(b.label.en)),
      note: L(
        'Absence rate = absent recorded days divided by recorded present, late and absent days.',
        '\u0646\u0633\u0628\u0629 \u0627\u0644\u063a\u064a\u0627\u0628 = \u0623\u064a\u0627\u0645 \u0627\u0644\u063a\u064a\u0627\u0628 \u0627\u0644\u0645\u0633\u062c\u0644\u0629 \u0645\u0642\u0633\u0648\u0645\u0629 \u0639\u0644\u0649 \u0623\u064a\u0627\u0645 \u0627\u0644\u062d\u0636\u0648\u0631 \u0648\u0627\u0644\u062a\u0623\u062e\u064a\u0631 \u0648\u0627\u0644\u063a\u064a\u0627\u0628 \u0627\u0644\u0645\u0633\u062c\u0644\u0629.',
      ),
    },
  ]
}

/** Employees whose start date falls inside the requested reporting period. */
async function buildNewHires(scope: Scope, p: ResolvedPeriod): Promise<ReportSection[]> {
  const rows =
    scope.userIds.length === 0
      ? []
      : await db
          .select({
            en: users.fullNameEn,
            ar: users.fullNameAr,
            number: users.employeeNumber,
            jobEn: users.jobTitleEn,
            jobAr: users.jobTitleAr,
            deptEn: users.departmentEn,
            deptAr: users.departmentAr,
            joinedOn: users.joinedOn,
          })
          .from(users)
          .where(
            and(
              inArray(users.id, scope.userIds),
              gte(users.joinedOn, p.from),
              lte(users.joinedOn, p.to),
            ),
          )
          .orderBy(desc(users.joinedOn), users.fullNameEn)

  const departments = new Set(rows.map((row) => row.deptEn || row.deptAr).filter(Boolean))

  return [
    {
      kind: 'stats',
      heading: L('Summary', '\u0627\u0644\u0645\u0644\u062e\u0651\u0635'),
      stats: [
        { label: L('New employees', '\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646 \u0627\u0644\u062c\u062f\u062f'), value: String(rows.length), detail: null },
        { label: L('Departments joined', '\u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u0646\u0636\u0645 \u0625\u0644\u064a\u0647\u0627'), value: String(departments.size), detail: null },
      ],
    },
    {
      kind: 'table',
      heading: L('New employees', '\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646 \u0627\u0644\u062c\u062f\u062f'),
      columns: [
        L('Number', '\u0627\u0644\u0631\u0642\u0645'),
        L('Name', '\u0627\u0644\u0627\u0633\u0645'),
        L('Job title', '\u0627\u0644\u0645\u0633\u0645\u0651\u0649'),
        L('Department', '\u0627\u0644\u0642\u0633\u0645'),
        L('Joined', '\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0644\u062a\u062d\u0627\u0642'),
      ],
      rows: rows.slice(0, MAX_ROWS).map((row) => [
        row.number,
        row.ar || row.en,
        row.jobAr || row.jobEn,
        row.deptAr || row.deptEn,
        String(row.joinedOn),
      ]),
      note: rows.length > MAX_ROWS ? L(`Showing ${MAX_ROWS} of ${rows.length}`, `\u0639\u0631\u0636 ${MAX_ROWS} \u0645\u0646 ${rows.length}`) : null,
    },
  ]
}

const TITLES: Record<ReportType, { en: string; ar: string }> = {
  newHires: L('New employees report', '\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0627\u0644\u062c\u062f\u062f'),
  attendance: L('Attendance report', 'تقرير الحضور'),
  leave: L('Leave report', 'تقرير الإجازات'),
  employees: L('Employee report', 'تقرير الموظفين'),
  recruitment: L('Recruitment report', 'تقرير التوظيف'),
  department: L('Department report', 'تقرير الأقسام'),
  payroll: L('Payroll report', 'تقرير الرواتب'),
  employeeFile: L('Employee file', 'ملف الموظّف'),
}

export async function buildReport(
  type: ReportType,
  actor: SessionUser,
  options: {
    period: CopilotPeriod | null
    month?: number | null
    year?: number | null
    department: string | null
    now?: Date
    self?: boolean
  },
): Promise<Omit<HrReport, 'summary' | 'findings'>> {
  // The caller supplies an authenticated actor and derives `self` from the
  // admitted intent. Recheck here so a direct service call cannot give an
  // employee the company scope used by the non-self builders.
  if (!mayAsk(actor.role, options.self ? 'myReport' : 'generateReport')) {
    throw new HTTPException(403, { message: 'forbidden' })
  }
  // These builders have no self/team/department implementation. Refuse a
  // narrower request before any query rather than silently returning company
  // data. Model-provided reportType/department never authorize wider scope.
  const companyIntent = type === 'recruitment' ? 'recruitmentSummary'
    : type === 'department' ? 'departmentAbsenceComparison' : null
  if (companyIntent && (options.self || options.department !== null || !mayAsk(actor.role, companyIntent))) {
    throw new HTTPException(403, { message: 'forbidden' })
  }
  const p = resolvePeriod(options.period, options.now, options)
  /* A department named alongside "my own" is ignored: one person has one department. */
  const scope = await resolveScope(actor, options.self ? null : options.department, options.self)

  const sections =
    type === 'attendance'
      ? await buildAttendance(scope, p)
      : type === 'leave'
        ? await buildLeave(scope, p)
        : type === 'employees'
          ? await buildEmployees(scope)
          : type === 'newHires'
            ? await buildNewHires(scope, p)
          : type === 'recruitment'
            ? await buildRecruitment(p)
            : type === 'department'
              ? await buildDepartment(p)
              : []

  return {
    type,
    title: TITLES[type],
    // Spelled out, because "this month" stops being true the moment it is filed.
    period: L(`${p.from} to ${p.to}`, `من ${p.from} إلى ${p.to}`),
    scope: type === 'recruitment' || type === 'department' ? L('Whole company', 'الشركة كاملة') : scope.label,
    generatedAt: (options.now ?? new Date()).toISOString(),
    generatedBy: actor.fullName,
    sections,
  }
}
