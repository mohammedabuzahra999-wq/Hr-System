import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  BookOpen,
  FileText,
  House,
  LayoutDashboard,
  ListChecks,
  Bell,
  Bot,
  CalendarDays,
  Clock3,
  ReceiptText,
  Settings,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/roles'
import type { TKey } from '@/features/i18n/dictionary'

export interface NavItem {
  label: string
  labelKey?: TKey
  to: string
  hash?: string
  icon: LucideIcon
  roles: Role[]
}

/** Sidebar links by role. */
export const navItems: NavItem[] = [
  { label: 'MenaChat', labelKey: 'assistant.name', to: '/assistant', icon: Bot, roles: ['admin', 'manager', 'hr', 'employee'] },
  { label: 'Dashboard', labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { label: 'Admin Overview', labelKey: 'nav.adminOverview', to: '/admin', icon: LayoutDashboard, roles: ['admin'] },
  { label: 'User Roles', labelKey: 'nav.userRoles', to: '/admin/users', icon: UsersRound, roles: ['admin'] },
  { label: 'Approvals', labelKey: 'nav.approvals', to: '/admin/approvals', icon: FileText, roles: ['admin'] },
  { label: 'Announcements', labelKey: 'nav.announcements', to: '/admin/announcements', icon: Bell, roles: ['admin'] },
  { label: 'Payroll', labelKey: 'nav.payroll', to: '/hr/payroll', icon: ReceiptText, roles: ['admin'] },
  { label: 'Attention centre', labelKey: 'nav.attention', to: '/hr/attention', icon: Bell, roles: ['admin'] },
  { label: 'Team Calendar', labelKey: 'nav.teamCalendar', to: '/hr/calendar', icon: CalendarDays, roles: ['admin'] },
  { label: 'Recruitment', labelKey: 'nav.recruitment', to: '/hr/recruitment', icon: BriefcaseBusiness, roles: ['admin'] },
  { label: 'Job descriptions', labelKey: 'nav.jobDescriptions', to: '/hr/job-descriptions', icon: ListChecks, roles: ['admin'] },
  { label: 'Knowledge base', labelKey: 'nav.knowledge', to: '/hr/knowledge', icon: BookOpen, roles: ['admin'] },
  { label: 'Assistant questions', labelKey: 'nav.assistantQuestions', to: '/hr/assistant-questions', icon: Bot, roles: ['admin'] },
  { label: 'Dashboard', labelKey: 'nav.dashboard', to: '/manager', icon: LayoutDashboard, roles: ['manager'] },
  { label: 'My Team', labelKey: 'nav.myTeam', to: '/manager/team', icon: UsersRound, roles: ['manager'] },
  { label: 'Team Attendance', labelKey: 'nav.teamAttendance', to: '/manager/attendance', icon: Clock3, roles: ['manager'] },
  { label: 'Leave Management', labelKey: 'nav.leaveManagement', to: '/manager/leaves', icon: CalendarDays, roles: ['manager'] },
  { label: 'Approvals', labelKey: 'nav.approvals', to: '/manager/approvals', icon: FileText, roles: ['manager'] },
  { label: 'Team Calendar', labelKey: 'nav.teamCalendar', to: '/manager/calendar', icon: CalendarDays, roles: ['manager'] },
  { label: 'Team Reports', labelKey: 'nav.teamReports', to: '/manager/reports', icon: ChartNoAxesCombined, roles: ['manager'] },
  { label: 'Announcements', labelKey: 'nav.announcements', to: '/manager/announcements', icon: Bell, roles: ['manager'] },
  { label: 'My Profile', labelKey: 'nav.myProfile', to: '/manager/profile', icon: UserRound, roles: ['manager'] },
  { label: 'Settings', labelKey: 'nav.settings', to: '/manager/settings', icon: Settings, roles: ['manager'] },
  { label: 'HR center', labelKey: 'nav.hrCenter', to: '/hr', icon: BriefcaseBusiness, roles: ['hr'] },
  { label: 'Attention centre', labelKey: 'nav.attention', to: '/hr/attention', icon: Bell, roles: ['hr'] },
  { label: 'Employees', labelKey: 'nav.employees', to: '/hr/employees', icon: UsersRound, roles: ['hr'] },
  { label: 'Attendance', labelKey: 'nav.attendance', to: '/hr/attendance', icon: Clock3, roles: ['hr'] },
  { label: 'Leaves', labelKey: 'nav.leaves', to: '/hr/leaves', icon: CalendarDays, roles: ['hr'] },
  { label: 'Payroll', labelKey: 'nav.payroll', to: '/hr/payroll', icon: ReceiptText, roles: ['hr'] },
  { label: 'Reports', labelKey: 'nav.reports', to: '/hr/reports', icon: ChartNoAxesCombined, roles: ['hr'] },
  { label: 'Recruitment', labelKey: 'nav.recruitment', to: '/hr/recruitment', icon: BriefcaseBusiness, roles: ['hr'] },
  { label: 'Job descriptions', labelKey: 'nav.jobDescriptions', to: '/hr/job-descriptions', icon: ListChecks, roles: ['hr'] },
  { label: 'Knowledge base', labelKey: 'nav.knowledge', to: '/hr/knowledge', icon: BookOpen, roles: ['hr'] },
  { label: 'Assistant questions', labelKey: 'nav.assistantQuestions', to: '/hr/assistant-questions', icon: Bot, roles: ['hr'] },
  { label: 'Announcements', labelKey: 'nav.announcements', to: '/hr/announcements', icon: Bell, roles: ['hr'] },
  { label: 'Overview', labelKey: 'nav.home', to: '/home', hash: 'overview', icon: House, roles: ['employee'] },
  { label: 'Attendance', labelKey: 'nav.attendance', to: '/home', hash: 'attendance', icon: Clock3, roles: ['employee'] },
  { label: 'Leaves', labelKey: 'nav.leaves', to: '/home', hash: 'leave', icon: CalendarDays, roles: ['employee'] },
  { label: 'Requests', labelKey: 'nav.reports', to: '/home', hash: 'requests', icon: FileText, roles: ['employee'] },
  { label: 'Payslips', labelKey: 'nav.payroll', to: '/home', hash: 'payslips', icon: ReceiptText, roles: ['employee'] },
  { label: 'Notifications', labelKey: 'nav.announcements', to: '/home', hash: 'notifications', icon: Bell, roles: ['employee'] },
]
