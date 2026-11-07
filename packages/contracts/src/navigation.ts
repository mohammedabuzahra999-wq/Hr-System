import { z } from 'zod'

/**
 * The only destinations an assistant may name.
 *
 * A model never receives a URL to invent.  The server resolves a spoken screen
 * name to one of these ids after it has filtered the guide by the signed-in
 * person's role; the web app then maps that id back to a route locally.
 */
export const navigationPageIdSchema = z.enum([
  'assistant',
  'employeeHome',
  'managerDashboard',
  'managerTeam',
  'managerAttendance',
  'managerLeaves',
  'managerApprovals',
  'managerCalendar',
  'managerReports',
  'managerAnnouncements',
  'managerProfile',
  'managerSettings',
  'employeeOverview',
  'employeeAttendance',
  'employeeLeave',
  'employeeRequests',
  'employeePayslips',
  'employeeNotifications',
  'hrCenter',
  'attention',
  'employees',
  'attendance',
  'leaves',
  'recruitment',
  'jobDescriptions',
  'hrCalendar',
  'hrAnnouncements',
  'payroll',
  'payrollOverview',
  'payrollRuns',
  'payrollSalaries',
  'payrollEarnings',
  'payrollOvertime',
  'payrollBonuses',
  'payrollAdjustments',
  'payrollReview',
  'payrollPayslips',
  'payrollReports',
  'reports',
  'knowledge',
  'assistantQuestions',
  'adminDashboard',
  'adminOverview',
  'adminUsers',
  'adminApprovals',
  'adminAnnouncements',
  'careers',
])
export type NavigationPageId = z.infer<typeof navigationPageIdSchema>

export const navigationPaths: Record<NavigationPageId, string> = {
  assistant: '/assistant',
  employeeHome: '/home',
  managerDashboard: '/manager',
  managerTeam: '/manager/team',
  managerAttendance: '/manager/attendance',
  managerLeaves: '/manager/leaves',
  managerApprovals: '/manager/approvals',
  managerCalendar: '/manager/calendar',
  managerReports: '/manager/reports',
  managerAnnouncements: '/manager/announcements',
  managerProfile: '/manager/profile',
  managerSettings: '/manager/settings',
  employeeOverview: '/home#overview',
  employeeAttendance: '/home#attendance',
  employeeLeave: '/home#leave',
  employeeRequests: '/home#requests',
  employeePayslips: '/home#payslips',
  employeeNotifications: '/home#notifications',
  hrCenter: '/hr',
  attention: '/hr/attention',
  employees: '/hr/employees',
  attendance: '/hr/attendance',
  leaves: '/hr/leaves',
  recruitment: '/hr/recruitment',
  jobDescriptions: '/hr/job-descriptions',
  hrCalendar: '/hr/calendar',
  hrAnnouncements: '/hr/announcements',
  payroll: '/hr/payroll',
  payrollOverview: '/hr/payroll#overview',
  payrollRuns: '/hr/payroll#runs',
  payrollSalaries: '/hr/payroll#salaries',
  payrollEarnings: '/hr/payroll#earnings',
  payrollOvertime: '/hr/payroll#overtime',
  payrollBonuses: '/hr/payroll#bonuses',
  payrollAdjustments: '/hr/payroll#adjustments',
  payrollReview: '/hr/payroll#review',
  payrollPayslips: '/hr/payroll#payslips',
  payrollReports: '/hr/payroll#reports',
  reports: '/hr/reports',
  knowledge: '/hr/knowledge',
  assistantQuestions: '/hr/assistant-questions',
  adminDashboard: '/dashboard',
  adminOverview: '/admin',
  adminUsers: '/admin/users',
  adminApprovals: '/admin/approvals',
  adminAnnouncements: '/admin/announcements',
  careers: '/careers',
}

export function pageIdForPath(path: string): NavigationPageId | null {
  return (Object.entries(navigationPaths).find(([, candidate]) => candidate === path)?.[0] as NavigationPageId | undefined) ?? null
}

export function navigationPathFor(page: string): string | null {
  const parsed = navigationPageIdSchema.safeParse(page)
  return parsed.success ? navigationPaths[parsed.data] : null
}
