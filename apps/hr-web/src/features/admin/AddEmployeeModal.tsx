import { useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import type { CreateEmployeeInput, Employee, Role } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { api, ApiError } from '@/lib/api'
import { errorKey } from '@/lib/apiError'
import { dayKey } from '@/lib/workdays'

/** Only these three can be created here; a second admin is a deliberate, separate act. */
const ASSIGNABLE_ROLES: Role[] = ['employee', 'manager', 'hr']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Draft {
  email: string
  employeeNumber: string
  nameEn: string
  nameAr: string
  jobEn: string
  jobAr: string
  deptEn: string
  deptAr: string
  role: Role
  managerId: string
  joinedOn: string
  password: string
}

const emptyDraft = (today: string): Draft => ({
  email: '',
  employeeNumber: '',
  nameEn: '',
  nameAr: '',
  jobEn: '',
  jobAr: '',
  deptEn: '',
  deptAr: '',
  role: 'employee',
  managerId: '',
  joinedOn: today,
  password: '',
})

/**
 * Creates an account through the API.
 *
 * The form mirrors the server's rules so the reader is told what is wrong while
 * they type, but nothing here is a safety boundary: the server validates the
 * same payload again, hashes the password, and is the only thing that decides
 * whether the account exists.
 */
export function AddEmployeeModal({
  open,
  managers,
  onClose,
  onCreated,
}: {
  open: boolean
  /** People who can be picked as a direct manager. */
  managers: Employee[]
  onClose: () => void
  onCreated: (employee: Employee) => void
}) {
  const { t, loc } = useI18n()
  const today = dayKey(new Date())

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today))
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<TKey | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const problems: Partial<Record<keyof Draft, string>> = {}
  if (!EMAIL_RE.test(draft.email.trim())) problems.email = t('login.errEmail')
  if (!draft.employeeNumber.trim()) problems.employeeNumber = t('userForm.required')
  if (!draft.nameEn.trim()) problems.nameEn = t('userForm.required')
  if (!draft.nameAr.trim()) problems.nameAr = t('userForm.required')
  if (draft.password.length < 8) problems.password = t('err.tooShort')

  const errors = touched ? problems : {}

  function reset() {
    setDraft(emptyDraft(today))
    setTouched(false)
    setServerError(null)
    setFieldErrors({})
  }

  function handleClose() {
    if (busy) return
    reset()
    onClose()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setServerError(null)
    setFieldErrors({})
    if (Object.keys(problems).length > 0 || busy) return

    // Arabic text is optional for the job title and department; fall back to the
    // English so a row never renders blank in one language.
    const payload: CreateEmployeeInput = {
      email: draft.email.trim().toLowerCase(),
      employeeNumber: draft.employeeNumber.trim(),
      fullName: { en: draft.nameEn.trim(), ar: draft.nameAr.trim() },
      jobTitle: { en: draft.jobEn.trim(), ar: draft.jobAr.trim() || draft.jobEn.trim() },
      department: { en: draft.deptEn.trim(), ar: draft.deptAr.trim() || draft.deptEn.trim() },
      role: draft.role,
      managerId: draft.managerId || null,
      joinedOn: draft.joinedOn,
      password: draft.password,
    }

    setBusy(true)
    try {
      const res = await api.post<{ employee: Employee }>('/employees', payload)
      onCreated(res.employee)
      reset()
      onClose()
    } catch (error) {
      setServerError(errorKey(error))
      if (error instanceof ApiError && error.details) setFieldErrors(error.details)
    } finally {
      setBusy(false)
    }
  }

  /** Server-side field complaints, joined onto the matching input. */
  const serverField = (path: string) => fieldErrors[path]?.join(' ')

  return (
    <Modal open={open} title={t('adminUsers.add')} onClose={handleClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-muted">{t('adminUsers.addSub')}</p>

        <fieldset className="flex flex-col gap-4" disabled={busy}>
          <legend className="sr-only">{t('userForm.identity')}</legend>

          <Input
            label={t('userForm.email')}
            type="email"
            dir="ltr"
            autoComplete="off"
            placeholder="name@menaitech.com"
            value={draft.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email ?? serverField('email')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('userForm.nameEn')}
              dir="ltr"
              value={draft.nameEn}
              onChange={(e) => set('nameEn', e.target.value)}
              error={errors.nameEn ?? serverField('fullName.en')}
            />
            <Input
              label={t('userForm.nameAr')}
              dir="rtl"
              value={draft.nameAr}
              onChange={(e) => set('nameAr', e.target.value)}
              error={errors.nameAr ?? serverField('fullName.ar')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('userForm.employeeNumber')}
              dir="ltr"
              placeholder="EMP-2010"
              value={draft.employeeNumber}
              onChange={(e) => set('employeeNumber', e.target.value)}
              error={errors.employeeNumber ?? serverField('employeeNumber')}
            />
            <Input
              label={t('userForm.joinedOn')}
              type="date"
              value={draft.joinedOn}
              onChange={(e) => set('joinedOn', e.target.value)}
              error={serverField('joinedOn')}
            />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4 border-t border-line pt-5" disabled={busy}>
          <legend className="sr-only">{t('userForm.job')}</legend>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-user-role" className="text-sm font-medium text-ink">
              {t('userForm.role')}
            </label>
            <select
              id="new-user-role"
              value={draft.role}
              onChange={(e) => set('role', e.target.value as Role)}
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`role.${role}`)}
                </option>
              ))}
            </select>
            {/* Says what the role can reach, so it is not picked by name alone. */}
            <p className="text-xs text-muted">{t(`userForm.roleHint.${draft.role}`)}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('userForm.jobEn')}
              dir="ltr"
              value={draft.jobEn}
              onChange={(e) => set('jobEn', e.target.value)}
              error={serverField('jobTitle.en')}
            />
            <Input
              label={t('userForm.jobAr')}
              dir="rtl"
              value={draft.jobAr}
              onChange={(e) => set('jobAr', e.target.value)}
              error={serverField('jobTitle.ar')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('userForm.deptEn')}
              dir="ltr"
              value={draft.deptEn}
              onChange={(e) => set('deptEn', e.target.value)}
              error={serverField('department.en')}
            />
            <Input
              label={t('userForm.deptAr')}
              dir="rtl"
              value={draft.deptAr}
              onChange={(e) => set('deptAr', e.target.value)}
              error={serverField('department.ar')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-user-manager" className="text-sm font-medium text-ink">
              {t('userForm.manager')}
            </label>
            <select
              id="new-user-manager"
              value={draft.managerId}
              onChange={(e) => set('managerId', e.target.value)}
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            >
              <option value="">{t('userForm.managerNone')}</option>
              {managers.map((person) => (
                <option key={person.id} value={person.id}>
                  {loc(person.fullName)} · {t(`role.${person.role}`)}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5 border-t border-line pt-5" disabled={busy}>
          <legend className="sr-only">{t('userForm.access')}</legend>
          <Input
            label={t('userForm.password')}
            type="text"
            dir="ltr"
            autoComplete="off"
            value={draft.password}
            onChange={(e) => set('password', e.target.value)}
            error={errors.password ?? serverField('password')}
          />
          <p className="text-xs text-muted">{t('userForm.passwordHint')}</p>
        </fieldset>

        {serverError && (
          <Alert>
            {t(serverError)}
          </Alert>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-5">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy} loadingText={t('login.submitting')}>
            <UserPlus className="size-4" aria-hidden="true" />
            {t('userForm.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
