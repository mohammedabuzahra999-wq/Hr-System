import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { hashPassword } from '../auth/password.js'
import { dayKey, isWorkingDay, statusForCheckIn } from '../domain/workdays.js'
import { closeDb, db } from './client.js'
import {
  announcements,
  attendanceDays,
  calendarEvents,
  documents,
  leaveBalances,
  notifications,
  payslips,
  publicHolidays,
  requests,
  sessions,
  shifts,
  users,
} from './schema.js'
import type { Shift } from '@hr/shared'

/**
 * Fills an empty database with a working demo organisation.
 *
 * Re-runnable: it clears the tables it owns first, so running it twice leaves
 * the same result rather than a pile of duplicates. It never touches a database
 * that already has real data without being asked — see the guard below.
 */

const SHIFT: Shift = { startHour: 8, startMinute: 30, endHour: 17, endMinute: 30, graceMinutes: 10 }

/** Everyone starts with the same password; the app forces a change on first use. */
const DEMO_PASSWORD = 'Menaitech#2026'

interface SeedPerson {
  email: string
  employeeNumber: string
  en: string
  ar: string
  role: 'admin' | 'manager' | 'hr' | 'employee'
  jobEn: string
  jobAr: string
  deptEn: string
  deptAr: string
  managerEmail?: string
  basic: number
}

const PEOPLE: SeedPerson[] = [
  /* The four working accounts, one per role. mo.employee reports to mo.manager,
     so the manager's team and approval inbox are not empty on a fresh install. */
  { email: 'mo.admin@menaitech.com', employeeNumber: 'EMP-2001', en: 'Mohammad Admin', ar: 'محمد — مدير النظام', role: 'admin', jobEn: 'System administrator', jobAr: 'مدير النظام', deptEn: 'IT', deptAr: 'تقنية المعلومات', basic: 1900 },
  { email: 'mo.hr@menaitech.com', employeeNumber: 'EMP-2002', en: 'Mohammad HR', ar: 'محمد — الموارد البشرية', role: 'hr', jobEn: 'HR manager', jobAr: 'مدير الموارد البشرية', deptEn: 'Human resources', deptAr: 'الموارد البشرية', basic: 1700 },
  { email: 'mo.manager@menaitech.com', employeeNumber: 'EMP-2003', en: 'Mohammad Manager', ar: 'محمد — المدير', role: 'manager', jobEn: 'Engineering manager', jobAr: 'مدير الهندسة', deptEn: 'Engineering', deptAr: 'الهندسة', basic: 1800 },
  { email: 'mo.employee@menaitech.com', employeeNumber: 'EMP-2004', en: 'Mohammad Employee', ar: 'محمد — موظف', role: 'employee', jobEn: 'Software engineer', jobAr: 'مهندس برمجيات', deptEn: 'Engineering', deptAr: 'الهندسة', managerEmail: 'mo.manager@menaitech.com', basic: 1200 },

  /* The wider demo organisation, so the team and company views have depth. */
  { email: 'omar.admin@company.com', employeeNumber: 'EMP-1001', en: 'Omar Haddad', ar: 'عمر حداد', role: 'admin', jobEn: 'System administrator', jobAr: 'مدير النظام', deptEn: 'IT', deptAr: 'تقنية المعلومات', basic: 1800 },
  { email: 'rania.hr@company.com', employeeNumber: 'EMP-1002', en: 'Rania Sami', ar: 'رانيا سامي', role: 'hr', jobEn: 'HR manager', jobAr: 'مديرة الموارد البشرية', deptEn: 'Human resources', deptAr: 'الموارد البشرية', basic: 1600 },
  { email: 'nabil.manager@company.com', employeeNumber: 'EMP-1003', en: 'Nabil Hadi', ar: 'نبيل هادي', role: 'manager', jobEn: 'Engineering manager', jobAr: 'مدير الهندسة', deptEn: 'Engineering', deptAr: 'الهندسة', basic: 1700 },
  { email: 'ahmad.employee@company.com', employeeNumber: 'EMP-1010', en: 'Ahmad Ali', ar: 'أحمد علي', role: 'employee', jobEn: 'Developer', jobAr: 'مطوّر', deptEn: 'Engineering', deptAr: 'الهندسة', managerEmail: 'nabil.manager@company.com', basic: 1100 },
  { email: 'omar.saleh@company.com', employeeNumber: 'EMP-1011', en: 'Omar Saleh', ar: 'عمر صالح', role: 'employee', jobEn: 'Designer', jobAr: 'مصمم', deptEn: 'Engineering', deptAr: 'الهندسة', managerEmail: 'nabil.manager@company.com', basic: 1050 },
  { email: 'ali.hassan@company.com', employeeNumber: 'EMP-1012', en: 'Ali Hassan', ar: 'علي حسن', role: 'employee', jobEn: 'Developer', jobAr: 'مطوّر', deptEn: 'Engineering', deptAr: 'الهندسة', managerEmail: 'nabil.manager@company.com', basic: 1150 },
  { email: 'maya.nasser@company.com', employeeNumber: 'EMP-1013', en: 'Maya Nasser', ar: 'مايا ناصر', role: 'employee', jobEn: 'QA analyst', jobAr: 'محللة جودة', deptEn: 'Engineering', deptAr: 'الهندسة', managerEmail: 'nabil.manager@company.com', basic: 1000 },
  { email: 'salma.dabbas@company.com', employeeNumber: 'EMP-1014', en: 'Salma Dabbas', ar: 'سلمى دباس', role: 'employee', jobEn: 'Data analyst', jobAr: 'محللة بيانات', deptEn: 'Data', deptAr: 'البيانات', managerEmail: 'nabil.manager@company.com', basic: 1200 },
  { email: 'hadi.khatib@company.com', employeeNumber: 'EMP-1015', en: 'Hadi Khatib', ar: 'هادي خطيب', role: 'employee', jobEn: 'Operations lead', jobAr: 'مسؤول العمليات', deptEn: 'Operations', deptAr: 'العمليات', managerEmail: 'nabil.manager@company.com', basic: 1250 },
]

const dayOffset = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

const monthStart = (offset: number) => {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 27)
  return dayKey(d)
}

/**
 * A stable 0–1 value for any string, so the demo month looks the same on every
 * reseed. Hashes the characters rather than parsing digits, so a key that mixes
 * a date with an employee number still produces a number.
 */
function seedValue(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const x = Math.sin(h >>> 0) * 10_000
  return x - Math.floor(x)
}

async function main() {
  const force = process.argv.includes('--force')
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(users)

  if ((existing?.n ?? 0) > 0 && !force) {
    console.error(
      `[seed] refusing to run: ${existing?.n} users already exist.\n` +
        '       Re-run with --force to clear and reseed.',
    )
    process.exitCode = 1
    return
  }

  console.log('[seed] clearing')
  // Children first; the rest cascade from users.
  await db.delete(calendarEvents)
  await db.delete(sessions)
  await db.delete(notifications)
  await db.delete(announcements)
  await db.delete(documents)
  await db.delete(payslips)
  await db.delete(requests)
  await db.delete(attendanceDays)
  await db.delete(leaveBalances)
  await db.delete(shifts)
  await db.delete(publicHolidays)
  await db.delete(users)

  console.log('[seed] hashing the shared demo password')
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  console.log('[seed] people')
  const byEmail = new Map<string, string>()

  // Two passes, so a manager exists before anyone points at them.
  for (const p of PEOPLE) {
    const [row] = await db
      .insert(users)
      .values({
        email: p.email,
        passwordHash,
        employeeNumber: p.employeeNumber,
        fullNameEn: p.en,
        fullNameAr: p.ar,
        jobTitleEn: p.jobEn,
        jobTitleAr: p.jobAr,
        departmentEn: p.deptEn,
        departmentAr: p.deptAr,
        role: p.role,
        joinedOn: dayOffset(-400 - PEOPLE.indexOf(p) * 30),
      })
      .returning({ id: users.id })
    byEmail.set(p.email, row!.id)
  }

  for (const p of PEOPLE) {
    if (!p.managerEmail) continue
    await db
      .update(users)
      .set({ managerId: byEmail.get(p.managerEmail)! })
      .where(sql`${users.id} = ${byEmail.get(p.email)!}`)
  }

  console.log('[seed] shift and holidays')
  await db.insert(shifts).values({ userId: null, ...SHIFT })
  await db.insert(publicHolidays).values([
    { holidayDate: dayOffset(7), nameEn: 'National holiday', nameAr: 'عطلة وطنية' },
    { holidayDate: dayOffset(-21), nameEn: 'National holiday', nameAr: 'عطلة وطنية' },
  ])
  const holidays = new Set([dayOffset(7), dayOffset(-21)])

  console.log('[seed] leave balances')
  await db.insert(leaveBalances).values(
    PEOPLE.map((p) => ({
      userId: byEmail.get(p.email)!,
      year: new Date().getFullYear(),
      annualTotal: 20,
      annualUsed: p.role === 'employee' ? 6 : 3,
      sickTotal: 10,
      sickUsed: p.role === 'employee' ? 2 : 0,
    })),
  )

  console.log('[seed] attendance history')
  // The month up to yesterday. Today is left empty on purpose: attendance is only
  // ever written by pressing check in.
  const today = dayKey(new Date())
  const first = `${today.slice(0, 7)}-01`
  const records: (typeof attendanceDays.$inferInsert)[] = []

  for (const p of PEOPLE) {
    const userId = byEmail.get(p.email)!
    for (let d = new Date(first); dayKey(d) < today; d.setDate(d.getDate() + 1)) {
      const day = dayKey(d)
      if (!isWorkingDay(day, holidays)) continue

      const r = seedValue(day + p.employeeNumber)
      if (r < 0.08) {
        records.push({ userId, workDate: day, status: 'absent' })
        continue
      }

      const lateBy = r < 0.25 ? 12 + Math.round(r * 60) : -6
      const checkIn = new Date(d)
      checkIn.setHours(SHIFT.startHour, SHIFT.startMinute + lateBy, 0, 0)
      const checkOut = new Date(d)
      checkOut.setHours(SHIFT.endHour, SHIFT.endMinute + Math.round(r * 30) - 10, 0, 0)

      records.push({
        userId,
        workDate: day,
        checkIn,
        checkOut,
        status: statusForCheckIn(checkIn, SHIFT),
      })
    }
  }
  if (records.length) await db.insert(attendanceDays).values(records)

  console.log('[seed] requests')
  const ahmad = byEmail.get('ahmad.employee@company.com')!
  const maya = byEmail.get('maya.nasser@company.com')!
  const mo = byEmail.get('mo.employee@menaitech.com')!
  await db.insert(requests).values([
    // Waiting on mo.manager, so their approvals inbox has something to decide.
    {
      userId: mo,
      kind: 'leave',
      status: 'pending',
      leaveType: 'annual',
      leaveFrom: dayOffset(9),
      leaveTo: dayOffset(10),
      leaveDays: 2,
      reason: 'Family matter',
    },
    { userId: mo, kind: 'certificate', status: 'pending' },
    {
      userId: mo,
      kind: 'leave',
      status: 'approved',
      leaveType: 'sick',
      leaveFrom: dayOffset(-15),
      leaveTo: dayOffset(-15),
      leaveDays: 1,
    },
    /*
     * Still to come, and belonging to mo.manager's own report — the calendar
     * scopes leave to who may see it, so an absence on another team would
     * correctly never appear on theirs.
     */
    {
      userId: mo,
      kind: 'leave',
      status: 'approved',
      leaveType: 'annual',
      leaveFrom: dayOffset(21),
      leaveTo: dayOffset(23),
      leaveDays: 3,
    },
    {
      userId: ahmad,
      kind: 'leave',
      status: 'pending',
      leaveType: 'annual',
      leaveFrom: dayOffset(5),
      leaveTo: dayOffset(6),
      leaveDays: 2,
      reason: 'Family trip',
    },
    { userId: ahmad, kind: 'certificate', status: 'completed' },
    {
      userId: maya,
      kind: 'leave',
      status: 'pending',
      leaveType: 'sick',
      leaveFrom: dayOffset(1),
      leaveTo: dayOffset(1),
      leaveDays: 1,
    },
    { userId: maya, kind: 'detailsUpdate', status: 'approved' },
  ])

  console.log('[seed] payroll')
  const slips: (typeof payslips.$inferInsert)[] = []
  for (const p of PEOPLE) {
    const userId = byEmail.get(p.email)!
    for (let m = 0; m < 6; m += 1) {
      slips.push({
        userId,
        paidOn: monthStart(m),
        currency: 'JOD',
        basic: p.basic.toFixed(2),
        allowances: (250 + (m === 1 ? 120 : 0)).toFixed(2),
        deductions: (100 + (m === 2 ? 45 : 0)).toFixed(2),
        status: m === 0 ? 'underReview' : 'processed',
      })
    }
  }
  await db.insert(payslips).values(slips)

  console.log('[seed] documents')
  await db.insert(documents).values(
    PEOPLE.flatMap((p) => {
      const userId = byEmail.get(p.email)!
      return [
        { userId, kind: 'contract' as const, issuedOn: dayOffset(-900), fileName: 'contract.pdf', sizeKb: 412 },
        { userId, kind: 'passport' as const, issuedOn: dayOffset(-1200), expiresOn: dayOffset(30), fileName: 'passport.pdf', sizeKb: 1260 },
        { userId, kind: 'nationalId' as const, issuedOn: dayOffset(-700), expiresOn: dayOffset(640), fileName: 'national-id.pdf', sizeKb: 880 },
      ]
    }),
  )

  console.log('[seed] announcements and notifications')
  await db.insert(announcements).values([
    {
      titleEn: 'Public holiday next week',
      titleAr: 'عطلة رسمية الأسبوع القادم',
      detailEn: 'Offices are closed and attendance is not recorded. The day is not deducted from annual leave.',
      detailAr: 'المكاتب مغلقة ولا يُسجّل الحضور. ولا يُخصم اليوم من رصيد الإجازة السنوية.',
      authorId: byEmail.get('rania.hr@company.com')!,
    },
    {
      titleEn: 'Updated remote work policy',
      titleAr: 'تحديث سياسة العمل عن بُعد',
      detailEn: 'Two remote days a week, agreed with your manager in advance.',
      detailAr: 'يومان عن بُعد أسبوعيًا، بالاتفاق المسبق مع مديرك.',
      authorId: byEmail.get('rania.hr@company.com')!,
    },
  ])

  console.log('[seed] calendar')
  /** A time on a day relative to today, so the calendar is always populated. */
  const at_ = (dayShift: number, hour: number, minute = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + dayShift)
    d.setHours(hour, minute, 0, 0)
    return d
  }
  const moManager = byEmail.get('mo.manager@menaitech.com')!
  await db.insert(calendarEvents).values([
    {
      kind: 'meeting',
      titleEn: 'Weekly team meeting',
      titleAr: 'اجتماع الفريق الأسبوعي',
      startsAt: at_(1, 10),
      endsAt: at_(1, 11),
      location: 'Main meeting room',
      teamOfId: moManager,
      createdBy: moManager,
    },
    {
      kind: 'training',
      titleEn: 'Security awareness session',
      titleAr: 'جلسة التوعية الأمنية',
      startsAt: at_(4, 14),
      endsAt: at_(4, 16),
      location: 'Training room',
      teamOfId: null,
      createdBy: byEmail.get('mo.hr@menaitech.com')!,
    },
    {
      kind: 'meeting',
      titleEn: 'Quarterly review',
      titleAr: 'المراجعة الربعية',
      startsAt: at_(11, 9, 30),
      endsAt: at_(11, 12),
      location: 'Board room',
      teamOfId: null,
      createdBy: byEmail.get('mo.admin@menaitech.com')!,
    },
    {
      kind: 'training',
      titleEn: 'New joiner onboarding',
      titleAr: 'تعريف الموظفين الجدد',
      startsAt: at_(-3, 9),
      endsAt: at_(-3, 13),
      location: 'Training room',
      teamOfId: null,
      createdBy: byEmail.get('mo.hr@menaitech.com')!,
    },
  ])

  await db.insert(notifications).values([
    { userId: ahmad, messageKey: 'notif.newCircular' },
    { userId: ahmad, messageKey: 'notif.leaveSent' },
    { userId: maya, messageKey: 'notif.newCircular' },
    { userId: mo, messageKey: 'notif.newCircular' },
    { userId: mo, messageKey: 'notif.leaveSent' },
  ])

  console.log(`\n[seed] done — ${PEOPLE.length} people, ${records.length} attendance days, ${slips.length} payslips`)
  console.log(`[seed] every account signs in with: ${DEMO_PASSWORD}\n`)
  console.log('       the four working accounts:')
  for (const p of PEOPLE.filter((x) => x.email.endsWith('@menaitech.com'))) {
    console.log(`         ${p.role.padEnd(8)} ${p.email}`)
  }
  console.log(`\n       plus ${PEOPLE.filter((p) => p.email.endsWith('@company.com')).length} demo colleagues on @company.com`)
}

try {
  await main()
} catch (error) {
  console.error('[seed] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDb()
}
