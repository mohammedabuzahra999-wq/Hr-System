import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute, RoleHomeRedirect } from '@/features/auth/ProtectedRoute'
import { AppLayout } from '@/layouts/AppLayout'
import { AdminPage } from '@/pages/AdminPage'
import { AdminApprovalsPage } from '@/pages/AdminApprovalsPage'
import { AdminAnnouncementsPage } from '@/pages/AdminAnnouncementsPage'
import { AdminUsersPage } from '@/pages/AdminUsersPage'
import { AssistantPage } from '@/pages/AssistantPage'
import { AssistantQuestionsPage } from '@/pages/AssistantQuestionsPage'
import { CareerJobPage } from '@/pages/CareerJobPage'
import { CareersPage } from '@/pages/CareersPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EmployeeHomePage } from '@/pages/EmployeeHomePage'
import { HrAttendancePage } from '@/pages/HrAttendancePage'
import { HrAttentionPage } from '@/pages/HrAttentionPage'
import { HrAnnouncementsPage } from '@/pages/HrAnnouncementsPage'
import { HrEmployeesPage } from '@/pages/HrEmployeesPage'
import { HrLeavesPage } from '@/pages/HrLeavesPage'
import { HrJobDescriptionsPage } from '@/pages/HrJobDescriptionsPage'
import { HrKnowledgePage } from '@/pages/HrKnowledgePage'
import { HrPage } from '@/pages/HrPage'
import { HrPayrollPage } from '@/pages/HrPayrollPage'
import { HrRecruitmentPage } from '@/pages/HrRecruitmentPage'
import { HrReportsPage } from '@/pages/HrReportsPage'
import { InterviewPage } from '@/pages/InterviewPage'
import { AiInterviewPage } from '@/pages/AiInterviewPage'
import { AiInterviewReportPage } from '@/pages/AiInterviewReportPage'
import { LoginPage } from '@/pages/LoginPage'
import { ManagerAnnouncementsPage } from '@/pages/ManagerAnnouncementsPage'
import { ManagerApprovalsPage } from '@/pages/ManagerApprovalsPage'
import { ManagerAttendancePage } from '@/pages/ManagerAttendancePage'
import { ManagerCalendarPage } from '@/pages/ManagerCalendarPage'
import { ManagerLeavesPage } from '@/pages/ManagerLeavesPage'
import { ManagerPage } from '@/pages/ManagerPage'
import { ManagerProfilePage } from '@/pages/ManagerProfilePage'
import { ManagerReportsPage } from '@/pages/ManagerReportsPage'
import { ManagerSettingsPage } from '@/pages/ManagerSettingsPage'
import { ManagerTeamPage } from '@/pages/ManagerTeamPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { WelcomePage } from '@/pages/WelcomePage'

/**
 * Page titles are dictionary keys, not text: the topbar translates `titleKey`
 * so the heading follows the language like every other string.
 */
export const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/welcome', element: <WelcomePage /> },
  { path: '/careers', element: <CareersPage /> },
  { path: '/careers/jobs/:slug', element: <CareerJobPage /> },
  { path: '/interview/:token', element: <InterviewPage /> },
  { path: '/interview/join', element: <AiInterviewPage /> },
  { path: '/interview/session', element: <AiInterviewPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <RoleHomeRedirect /> },
          { path: 'assistant', element: <AssistantPage />, handle: { titleKey: 'assistant.name' } },
          {
            element: <ProtectedRoute allow={['admin']} />,
            children: [
              { path: 'dashboard', element: <DashboardPage />, handle: { titleKey: 'nav.dashboard' } },
              { path: 'admin', element: <AdminPage />, handle: { titleKey: 'nav.adminOverview' } },
              { path: 'admin/users', element: <AdminUsersPage />, handle: { titleKey: 'nav.userRoles' } },
              { path: 'admin/approvals', element: <AdminApprovalsPage />, handle: { titleKey: 'nav.approvals' } },
              { path: 'admin/announcements', element: <AdminAnnouncementsPage />, handle: { titleKey: 'nav.announcements' } },
            ],
          },
          {
            element: <ProtectedRoute allow={['manager']} />,
            children: [
              { path: 'manager', element: <ManagerPage />, handle: { titleKey: 'nav.dashboard' } },
              { path: 'manager/team', element: <ManagerTeamPage />, handle: { titleKey: 'nav.myTeam' } },
              { path: 'manager/attendance', element: <ManagerAttendancePage />, handle: { titleKey: 'nav.teamAttendance' } },
              { path: 'manager/leaves', element: <ManagerLeavesPage />, handle: { titleKey: 'nav.leaveManagement' } },
              { path: 'manager/approvals', element: <ManagerApprovalsPage />, handle: { titleKey: 'nav.approvals' } },
              { path: 'manager/calendar', element: <ManagerCalendarPage />, handle: { titleKey: 'nav.teamCalendar' } },
              { path: 'manager/reports', element: <ManagerReportsPage />, handle: { titleKey: 'nav.teamReports' } },
              { path: 'manager/announcements', element: <ManagerAnnouncementsPage />, handle: { titleKey: 'nav.announcements' } },
              { path: 'manager/profile', element: <ManagerProfilePage />, handle: { titleKey: 'nav.myProfile' } },
              { path: 'manager/settings', element: <ManagerSettingsPage />, handle: { titleKey: 'nav.settings' } },
            ],
          },
          {
            element: <ProtectedRoute allow={['hr']} />,
            children: [
              { path: 'hr', element: <HrPage />, handle: { titleKey: 'nav.hrCenter' } },
              { path: 'hr/employees', element: <HrEmployeesPage />, handle: { titleKey: 'route.employeeRecords' } },
              { path: 'hr/attendance', element: <HrAttendancePage />, handle: { titleKey: 'route.attendanceOverview' } },
              { path: 'hr/leaves', element: <HrLeavesPage />, handle: { titleKey: 'nav.leaveManagement' } },
              { path: 'hr/announcements', element: <HrAnnouncementsPage />, handle: { titleKey: 'nav.announcements' } },
              { path: 'hr/reports', element: <HrReportsPage />, handle: { titleKey: 'nav.reports' } },
            ],
          },
          {
            element: <ProtectedRoute allow={['admin', 'hr']} />,
            children: [
              { path: 'hr/attention', element: <HrAttentionPage />, handle: { titleKey: 'nav.attention' } },
              { path: 'hr/payroll', element: <HrPayrollPage />, handle: { titleKey: 'nav.payroll' } },
              { path: 'hr/calendar', element: <ManagerCalendarPage />, handle: { titleKey: 'nav.teamCalendar' } },
              { path: 'hr/recruitment', element: <HrRecruitmentPage />, handle: { titleKey: 'nav.recruitment' } },
              { path: 'hr/recruitment/applications/:applicationId/ai-interviews/:interviewId/report', element: <AiInterviewReportPage />, handle: { titleKey: 'nav.recruitment' } },
              { path: 'hr/job-descriptions', element: <HrJobDescriptionsPage />, handle: { titleKey: 'nav.jobDescriptions' } },
              { path: 'hr/knowledge', element: <HrKnowledgePage />, handle: { titleKey: 'nav.knowledge' } },
              { path: 'hr/assistant-questions', element: <AssistantQuestionsPage />, handle: { titleKey: 'nav.assistantQuestions' } },
            ],
          },
          {
            element: <ProtectedRoute allow={['employee']} />,
            children: [
              { path: 'home', element: <EmployeeHomePage />, handle: { titleKey: 'nav.home' } },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
