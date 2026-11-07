import type {
  AppNotification,
  Announcement,
  Application,
  CvAnalysis,
  AttendanceDay,
  Candidate,
  CvFile,
  Employee,
  EmployeeDocument,
  EmployeeRequest,
  JobDescription,
  JobDescriptionContent,
  JobOpening,
  Localized,
  Payslip,
  PayrollRun,
  PayrollSettings,
  Presence,
  PublicJob,
  SessionUser,
  Shift,
} from '@hr/shared'
import { cvAnalysisContentSchema } from '@hr/shared'
import type {
  announcements,
  applications,
  cvAnalyses,
  attendanceDays,
  candidates,
  cvFiles,
  documents,
  jobDescriptions,
  jobOpenings,
  jobPublications,
  notifications,
  payrollRuns,
  payrollSettings,
  payslips,
  requests,
  shifts,
  users,
} from './db/schema.js'
import { dayKey } from './domain/workdays.js'

/**
 * One place where a database row becomes an API payload.
 *
 * Every column that must never leave the server — `passwordHash` above all — is
 * dropped here rather than at each call site, so a new endpoint cannot leak it
 * by forgetting to pick columns.
 */

type UserRow = typeof users.$inferSelect
type AttendanceRow = typeof attendanceDays.$inferSelect
type RequestRow = typeof requests.$inferSelect
type PayslipRow = typeof payslips.$inferSelect
type DocumentRow = typeof documents.$inferSelect
type NotificationRow = typeof notifications.$inferSelect
type AnnouncementRow = typeof announcements.$inferSelect
type ShiftRow = typeof shifts.$inferSelect

const nameOf = (u: Pick<UserRow, 'fullNameEn' | 'fullNameAr'>): Localized => ({
  en: u.fullNameEn,
  ar: u.fullNameAr,
})

/** Dates are `date` columns, which node-postgres already gives back as `YYYY-MM-DD`. */
const dateOnly = (value: string | Date): string =>
  typeof value === 'string' ? value : value.toISOString().slice(0, 10)

const instant = (value: Date | null): string | null => value?.toISOString() ?? null

export function toSessionUser(user: UserRow, manager: UserRow | null): SessionUser {
  return {
    id: user.id,
    email: user.email,
    fullName: nameOf(user),
    role: user.role,
    employeeNumber: user.employeeNumber,
    jobTitle: { en: user.jobTitleEn, ar: user.jobTitleAr },
    department: { en: user.departmentEn, ar: user.departmentAr },
    managerId: user.managerId,
    managerName: manager ? nameOf(manager) : null,
    photoUrl: user.photoUrl,
  }
}

/**
 *  is passed in rather than read off the row.
 *
 * Only the route knows who currently holds an event stream — that lives in the
 * realtime bus, not in the database — so the caller resolves it and this stays
 * a pure row-to-payload mapping.
 */
export function toEmployee(user: UserRow, manager: UserRow | null, presence: Presence = 'offline'): Employee {
  return {
    id: user.id,
    email: user.email,
    employeeNumber: user.employeeNumber,
    fullName: nameOf(user),
    jobTitle: { en: user.jobTitleEn, ar: user.jobTitleAr },
    department: { en: user.departmentEn, ar: user.departmentAr },
    role: user.role,
    managerId: user.managerId,
    managerName: manager ? nameOf(manager) : null,
    isActive: user.isActive,
    presence,
    lastSeenAt: instant(user.lastSeenAt),
    photoUrl: user.photoUrl,
    joinedOn: dateOnly(user.joinedOn),
  }
}

type OpeningRow = typeof jobOpenings.$inferSelect
type CandidateRow = typeof candidates.$inferSelect
type ApplicationRow = typeof applications.$inferSelect
type AnalysisRow = typeof cvAnalyses.$inferSelect
type PublicationRow = typeof jobPublications.$inferSelect
type CvFileRow = typeof cvFiles.$inferSelect

/** `storedPath` is dropped here, so no endpoint can hand a client a path by accident. */
export function toCvFile(row: CvFileRow, uploader: Pick<UserRow, 'fullNameEn' | 'fullNameAr'> | null): CvFile {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedByName: uploader ? nameOf(uploader) : null,
  }
}

/**
 * Whether the careers page should still show an Apply button.
 *
 * Three things have to hold, and they fail independently: the vacancy is still
 * `open`, it has actually been published, and the deadline has not passed. HR
 * closing a role, HR never publishing it, and the calendar running out are
 * different events, and a single `isOpen` flag would blur them into one.
 */
function acceptingApplications(row: OpeningRow, today: string): boolean {
  if (row.status !== 'open' || !row.publishedAt) return false
  return !row.deadline || dateOnly(row.deadline) >= today
}

export function toJobOpening(
  row: OpeningRow,
  applicationCount: number,
  publications: PublicationRow[] = [],
  jobDescriptionId: string | null = null,
  today: string = dayKey(new Date()),
): JobOpening {
  return {
    id: row.id,
    title: { en: row.titleEn, ar: row.titleAr },
    department: { en: row.departmentEn, ar: row.departmentAr },
    location: { en: row.locationEn, ar: row.locationAr },
    employmentType: row.employmentType,
    status: row.status,
    openedOn: dateOnly(row.openedOn),
    closedOn: row.closedOn ? dateOnly(row.closedOn) : null,
    deadline: row.deadline ? dateOnly(row.deadline) : null,
    publicSlug: row.publicSlug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    acceptingApplications: acceptingApplications(row, today),
    publications: publications.map((p) => ({
      platform: p.platform,
      status: p.status,
      externalJobId: p.externalJobId,
      errorMessage: p.errorMessage,
      publishedAt: p.publishedAt?.toISOString() ?? null,
    })),
    jobDescriptionId,
    applicationCount,
  }
}

export function toCandidate(row: CandidateRow, cv: CvFile | null, applicationCount: number): Candidate {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    education: row.education,
    experience: row.experience,
    skills: row.skills,
    linkedinUrl: row.linkedinUrl,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    cv,
    applicationCount,
  }
}

/**
 * An application with the person inlined.
 *
 * The candidate's name and contact details are copied onto the row rather than
 * left behind an id, because this is the shape the applications dashboard
 * renders and a row that needs a second lookup to say who applied is a row
 * nobody can scan.
 */
/**
 * The stored reading, parsed on the way out rather than trusted.
 *
 * `content` is jsonb, so a row written by an older prompt could otherwise reach
 * the browser with fields the screen cannot render. A result that no longer
 * parses is reported as having none, which is honest.
 */
export function toCvAnalysis(row: AnalysisRow): CvAnalysis {
  const parsed = row.content ? cvAnalysisContentSchema.safeParse(row.content) : null
  return {
    id: row.id,
    applicationId: row.applicationId,
    status: row.status,
    content: parsed?.success ? parsed.data : null,
    failure: (row.failure as CvAnalysis['failure']) ?? null,
    model: row.model,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toApplication(
  row: ApplicationRow,
  opening: OpeningRow,
  candidate: CandidateRow,
  cv: CvFile | null,
  analysis: AnalysisRow | null = null,
  interview: Application['interview'] = null,
): Application {
  return {
    interview,
    id: row.id,
    openingId: row.openingId,
    openingTitle: { en: opening.titleEn, ar: opening.titleAr },
    candidateId: row.candidateId,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    status: row.status,
    source: row.source,
    coverLetter: row.coverLetter,
    decisionNote: row.decisionNote,
    appliedAt: row.appliedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cv,
    analysis: analysis ? toCvAnalysis(analysis) : null,
  }
}

/**
 * A published vacancy as someone who is not signed in sees it.
 *
 * Built field by field from a separate type rather than by deleting keys from
 * `JobOpening`. A stripping function silently starts leaking the day somebody
 * adds a field to the internal shape; this one stops compiling instead.
 */
export function toPublicJob(row: OpeningRow): PublicJob {
  return {
    slug: row.publicSlug!,
    title: { en: row.titleEn, ar: row.titleAr },
    department: { en: row.departmentEn, ar: row.departmentAr },
    location: { en: row.locationEn, ar: row.locationAr },
    employmentType: row.employmentType,
    deadline: row.deadline ? dateOnly(row.deadline) : null,
    publishedAt: row.publishedAt!.toISOString(),
  }
}

type JobDescriptionRow = typeof jobDescriptions.$inferSelect

/**
 * The stored document, with the people named rather than referenced by id.
 *
 * `content` is parsed on the way out, not trusted: it is jsonb, so a row
 * written by an older version of the schema would otherwise reach the browser
 * with sections the app cannot render.
 */
export function toJobDescription(
  row: JobDescriptionRow,
  opening: OpeningRow | null,
  generatedBy: Pick<UserRow, 'fullNameEn' | 'fullNameAr'> | null,
  approvedBy: Pick<UserRow, 'fullNameEn' | 'fullNameAr'> | null,
): JobDescription {
  return {
    id: row.id,
    status: row.status,
    content: row.content as unknown as JobDescriptionContent,
    department: { en: row.departmentEn, ar: row.departmentAr },
    level: row.level,
    employmentType: row.employmentType,
    openingId: row.openingId,
    openingTitle: opening ? { en: opening.titleEn, ar: opening.titleAr } : null,
    model: row.model,
    generatedByName: generatedBy ? nameOf(generatedBy) : null,
    generatedAt: instant(row.generatedAt),
    editedByHuman: row.editedByHuman,
    approvedByName: approvedBy ? nameOf(approvedBy) : null,
    approvedAt: instant(row.approvedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toShift(row: ShiftRow): Shift {
  return {
    startHour: row.startHour,
    startMinute: row.startMinute,
    endHour: row.endHour,
    endMinute: row.endMinute,
    graceMinutes: row.graceMinutes,
  }
}

export function toAttendanceDay(row: AttendanceRow): AttendanceDay {
  return {
    date: dateOnly(row.workDate),
    checkIn: instant(row.checkIn),
    checkOut: instant(row.checkOut),
    status: row.status,
  }
}

export function toRequest(
  row: RequestRow,
  employee: Pick<UserRow, 'fullNameEn' | 'fullNameAr'>,
  decider: Pick<UserRow, 'fullNameEn' | 'fullNameAr'> | null,
): EmployeeRequest {
  return {
    id: row.id,
    userId: row.userId,
    employeeName: nameOf(employee),
    kind: row.kind,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: instant(row.decidedAt),
    decidedByName: decider ? nameOf(decider) : null,
    decisionNote: row.decisionNote,
    leave:
      row.kind === 'leave' && row.leaveType && row.leaveFrom && row.leaveTo
        ? {
            type: row.leaveType,
            from: dateOnly(row.leaveFrom),
            to: dateOnly(row.leaveTo),
            days: row.leaveDays ?? 0,
            reason: row.reason,
          }
        : null,
  }
}

export function toPayslip(row: PayslipRow): Payslip {
  const basic = Number(row.basic)
  const allowances = Number(row.allowances)
  const deductions = Number(row.deductions)
  return {
    id: row.id,
    paidOn: dateOnly(row.paidOn),
    currency: row.currency,
    basic,
    allowances,
    deductions,
    // Derived here, so the figure on the payslip and the figure in payroll agree.
    netPay: Number((basic + allowances - deductions).toFixed(2)),
  }
}

export function toDocument(row: DocumentRow): EmployeeDocument {
  return {
    id: row.id,
    kind: row.kind,
    issuedOn: dateOnly(row.issuedOn),
    expiresOn: row.expiresOn ? dateOnly(row.expiresOn) : null,
    fileName: row.fileName,
    sizeKb: row.sizeKb,
  }
}

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    message: { key: row.messageKey, vars: row.messageVars ?? undefined },
    at: row.createdAt.toISOString(),
    read: row.readAt !== null,
  }
}

export function toAnnouncement(
  row: AnnouncementRow,
  author: Pick<UserRow, 'fullNameEn' | 'fullNameAr' | 'role'> | null,
): Announcement {
  return {
    id: row.id,
    title: { en: row.titleEn, ar: row.titleAr },
    detail: { en: row.detailEn, ar: row.detailAr },
    kind: row.kind,
    publishedAt: row.publishedAt.toISOString(),
    expiresAt: instant(row.expiresAt),
    // Decided here against the server clock, so every reader agrees on it.
    expired: row.expiresAt !== null && row.expiresAt.getTime() <= Date.now(),
    authorName: author ? nameOf(author) : null,
    authorRole: author?.role ?? null,
  }
}

type PayrollRunRow = typeof payrollRuns.$inferSelect
type PayrollSettingsRow = typeof payrollSettings.$inferSelect

export function toPayrollRun(row: PayrollRunRow): PayrollRun {
  return {
    id: row.id,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    status: row.status,
    calculatedAt: instant(row.calculatedAt),
    approvedAt: instant(row.approvedAt),
    paidOn: row.paidOn ? dateOnly(row.paidOn) : null,
  }
}

/**
 * Rates on the way out, as numbers.
 *
 * Stored as `numeric` — which node-postgres returns as strings, correctly, so
 * nothing is lost in the database — and converted here, once, at the boundary
 * where they stop being money and start being something to display.
 */
export function toPayrollSettings(row: PayrollSettingsRow): PayrollSettings {
  return {
    id: row.id,
    effectiveFrom: dateOnly(row.effectiveFrom),
    socialSecurityEmployeeRate: Number(row.socialSecurityEmployeeRate),
    socialSecurityEmployerRate: Number(row.socialSecurityEmployerRate),
    socialSecurityCeiling: Number(row.socialSecurityCeiling),
    taxPersonalExemption: Number(row.taxPersonalExemption),
    taxDependantExemption: Number(row.taxDependantExemption),
    taxBands: (row.taxBands as { upTo: number | null; rate: number }[]) ?? [],
    confirmed: row.confirmed,
    note: row.note,
  }
}
