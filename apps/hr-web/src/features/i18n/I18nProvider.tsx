import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createFormatters, splitDuration } from '@/lib/format'
import {
  dictionaries,
  dirFor,
  localeFor,
  type Entry,
  type Lang,
  type PluralRule,
  type TKey,
  type Var,
} from './dictionary'
import { I18nContext, type I18nContextValue } from './useI18n'

const STORAGE_KEY = 'hr-app:lang'

type Vars = Record<string, Var> | undefined

const supplementalEntries: Record<Lang, Record<string, string>> = {
  en: {
    'nav.permissions': 'Permissions',
    'nav.settings': 'Settings',
    'adminPerms.title': 'Permissions',
    'adminPerms.badge': 'RBAC enabled',
    'adminPerms.adminScope': 'Full',
    'adminPerms.adminScopeSub': 'Complete system access',
    'adminPerms.managerScope': 'Team',
    'adminPerms.managerScopeSub': 'Direct team only',
    'adminPerms.employeeScope': 'Self',
    'adminPerms.employeeScopeSub': 'Personal data only',
    'adminPerms.qaRole': 'Update a role',
    'adminPerms.qaRoleHint': '3 pending changes',
    'adminPerms.qaAccess': 'Manage access',
    'adminPerms.qaAccessHint': 'RBAC active',
    'adminPerms.qaAudit': 'Security audit',
    'adminPerms.qaAuditHint': '2 review points',
    'adminPerms.policyTitle': 'Role policy',
    'adminPerms.policyAdmin': 'An administrator manages every role and access level.',
    'adminPerms.policyManager': 'A manager sees team data and approves their requests.',
    'adminPerms.policyHr': 'HR manages payroll, leave, attendance, and documents.',
    'adminPerms.policyEmployee': 'An employee reaches only their own profile and requests.',
    'mgrSet.title': 'Settings',
    'mgrSet.badge': 'Secure access',
    'mgrSet.prefs': 'Preferences',
    'mgrSet.prefEmail': 'Email notifications',
    'mgrSet.prefEmailDesc': 'Receive alerts for approvals and team updates',
    'mgrSet.prefSecurity': 'Security alerts',
    'mgrSet.prefSecurityDesc': 'Watch for unusual sign-ins or permission changes',
    'mgrSet.prefDigest': 'Team digests',
    'mgrSet.prefDigestDesc': 'A weekly update on attendance and leave',
    'mgrSet.security': 'Security',
    'mgrSet.sec1': 'Two-factor authentication is enabled',
    'mgrSet.sec2': 'Role-based access is confirmed',
    'mgrSet.sec3': 'Payroll access is restricted',
    'mgrSet.sec4': 'Manager permissions are limited to direct team data',
    'mgrSet.accessTitle': 'Access control',
    'mgrSet.accessBody':
      'This account can view team data, approve requests, and follow attendance, without editing employee records or payroll information.',
  },
  ar: {
    'nav.permissions': 'الصلاحيات',
    'nav.settings': 'الإعدادات',
    'adminPerms.title': 'الصلاحيات',
    'adminPerms.badge': 'RBAC مفعّل',
    'adminPerms.adminScope': 'كامل',
    'adminPerms.adminScopeSub': 'وصول شامل للنظام',
    'adminPerms.managerScope': 'الفريق',
    'adminPerms.managerScopeSub': 'الفريق المباشر فقط',
    'adminPerms.employeeScope': 'ذاتي',
    'adminPerms.employeeScopeSub': 'البيانات الشخصية فقط',
    'adminPerms.qaRole': 'تحديث دور',
    'adminPerms.qaRoleHint': '3 تغييرات معلقة',
    'adminPerms.qaAccess': 'إدارة الوصول',
    'adminPerms.qaAccessHint': 'RBAC نشط',
    'adminPerms.qaAudit': 'تدقيق أمني',
    'adminPerms.qaAuditHint': 'نقطتا مراجعة',
    'adminPerms.policyTitle': 'سياسة الأدوار',
    'adminPerms.policyAdmin': 'مدير النظام يدير جميع الأدوار ومستويات الوصول.',
    'adminPerms.policyManager': 'المدير يرى بيانات فريقه ويوافق على طلباتهم.',
    'adminPerms.policyHr': 'الموارد البشرية تدير الرواتب والإجازات والحضور والوثائق.',
    'adminPerms.policyEmployee': 'الموظف يصل إلى ملفه الشخصي وطلباته فقط.',
    'mgrSet.title': 'الإعدادات',
    'mgrSet.badge': 'وصول آمن',
    'mgrSet.prefs': 'التفضيلات',
    'mgrSet.prefEmail': 'إشعارات البريد الإلكتروني',
    'mgrSet.prefEmailDesc': 'استلام تنبيهات الموافقات وتحديثات الفريق',
    'mgrSet.prefSecurity': 'تنبيهات الأمان',
    'mgrSet.prefSecurityDesc': 'مراقبة تسجيلات الدخول أو تغييرات الصلاحيات غير المعتادة',
    'mgrSet.prefDigest': 'ملخصات الفريق',
    'mgrSet.prefDigestDesc': 'تحديث أسبوعي عن الحضور والإجازات',
    'mgrSet.security': 'الأمان',
    'mgrSet.sec1': 'المصادقة الثنائية مفعّلة',
    'mgrSet.sec2': 'الوصول حسب الدور مؤكَّد',
    'mgrSet.sec3': 'الوصول إلى الرواتب مقيّد',
    'mgrSet.sec4': 'صلاحيات المدير محدودة ببيانات فريقه المباشر',
    'mgrSet.accessTitle': 'التحكم في الوصول',
    'mgrSet.accessBody':
      'يمكن لهذا الحساب الاطلاع على بيانات الفريق والموافقة على الطلبات ومتابعة الحضور، دون تعديل سجلات الموظفين أو معلومات الرواتب.',
  },
}

function readStoredLang(): Lang {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'ar') return stored
  } catch {
    /* storage unavailable — fall back to Arabic for the demo */
  }
  return 'ar'
}

/** Plural entries choose their form from `count`; strings pass straight through. */
function resolve(entry: Entry, plurals: Intl.PluralRules, vars: Vars) {
  if (typeof entry === 'string') return entry
  const count = vars?.count
  const rule = plurals.select(typeof count === 'number' ? count : 0) as PluralRule
  return entry[rule] ?? entry.other
}

/** Provides the current language, its text direction, and locale-bound formatters. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)
  const dir = dirFor[lang]

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable — the choice lasts until reload */
    }
    setLangState(next)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[lang]
    const locales = localeFor[lang]
    const plurals = new Intl.PluralRules(locales.number)
    const fmt = createFormatters(locales)

    /**
     * A Date becomes a formatted date, and a nested Message is translated first.
     *
     * Dates reach the client as strings — `YYYY-MM-DD` for a calendar day and
     * full ISO for an instant — so both are formatted here. Without this a
     * request reads "Submitted 2026-09-17T12:41:46.311Z" instead of a date.
     */
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

    const render = (value: Var): string => {
      if (value instanceof Date) return fmt.date(value)
      if (typeof value === 'object' && value !== null) return t(value.key, value.vars)
      if (typeof value === 'string' && ISO_DATE.test(value)) return fmt.date(value)
      return String(value)
    }

    const t = (key: TKey, vars?: Record<string, Var>): string => {
      const entry = dict[key] ?? supplementalEntries[lang][key]
      // A key the API sent that this build does not carry yet: say something
      // neutral rather than printing the raw key at a customer.
      if (entry === undefined) return dict['err.unknown'] as string
      const template = resolve(entry, plurals, vars)
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? render(vars[name]) : whole,
      )
    }

    const days = (count: number) => t('common.days', { count })

    const duration = (ms: number) => {
      const { hours, minutes } = splitDuration(ms)
      return t('common.hm', { h: fmt.number(hours), m: String(minutes).padStart(2, '0') })
    }

    return {
      lang,
      dir,
      setLang,
      t,
      tm: (message) => t(message.key as TKey, message.vars),
      loc: (localized) => localized[lang],
      days,
      duration,
      timeAgo: (d) => fmt.relative(d) ?? t('time.justNow'),
      fmt,
    }
  }, [lang, dir, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
