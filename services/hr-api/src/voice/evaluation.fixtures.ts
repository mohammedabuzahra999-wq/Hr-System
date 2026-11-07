/**
 * Provider-independent final-turn checks for the development voice adapter.
 * These are deliberately transcripts, not recorded audio or production HR
 * data. Run them through the DEV mock UI once a signed-in test account exists.
 */
export const voiceEvaluationFixtures = [
  {
    id: 'open-employees-ar',
    transcript: 'افتحلي الموظفين',
    lang: 'ar' as const,
    expected: 'navigate:employees',
  },
  {
    id: 'open-payroll-mixed',
    transcript: 'روح على payroll',
    lang: 'ar' as const,
    expected: 'navigate:payroll',
  },
  {
    id: 'employee-search-ar',
    transcript: 'دورلي على أحمد',
    lang: 'ar' as const,
    expected: 'copilot:employee-clarification-when-ambiguous',
  },
  {
    id: 'select-second-ar',
    transcript: 'الثاني',
    lang: 'ar' as const,
    expected: 'active-clarification:option-2',
  },
  {
    id: 'selected-employee-attendance',
    transcript: 'ورجيني حضوره',
    lang: 'ar' as const,
    expected: 'copilot:uses-advisory-page-context-and-rbac',
  },
  {
    id: 'previous-period',
    transcript: 'الشهر الماضي',
    lang: 'ar' as const,
    expected: 'copilot:conversation-context',
  },
] as const
