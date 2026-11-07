import { useState, type FormEvent } from 'react'
import type { CreateLeaveRequestInput, EmployeeRequest, LeaveBalance, LeaveType } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/features/i18n/useI18n'
import type { TKey } from '@/features/i18n/dictionary'
import { dayKey } from '@/lib/workdays'
import { checkLeave } from '../leave'

interface RequestLeaveModalProps {
  open: boolean
  balance: LeaveBalance
  /** `YYYY-MM-DD` public holidays, so they are not counted against the balance. */
  holidays: string[]
  /** Existing requests, so an overlapping range can be refused. */
  requests: EmployeeRequest[]
  /** Set while the request is in flight, to stop a double submission. */
  busy?: boolean
  /** A failure from the server, already reduced to a dictionary key. */
  serverError?: TKey | null
  onClose: () => void
  onSubmit: (leave: CreateLeaveRequestInput) => void
}

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid']

export function RequestLeaveModal({
  open,
  balance,
  holidays,
  requests,
  busy,
  serverError,
  onClose,
  onSubmit,
}: RequestLeaveModalProps) {
  const { t, tm, days } = useI18n()

  const [type, setType] = useState<LeaveType>('annual')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const check = checkLeave({ type, from, to }, { balance, holidays, requests })
  // Errors appear once the employee has tried to send, so the form is not
  // shouting at them while they are still picking dates.
  const errors = submitted ? check.errors : {}
  const today = dayKey(new Date())

  function reset() {
    setType('annual')
    setFrom('')
    setTo('')
    setReason('')
    setSubmitted(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!check.valid || !check.range || busy) return
    // `days` is deliberately not sent: the server counts the working days itself.
    onSubmit({ type, from, to, reason: reason.trim() || undefined })
  }

  return (
    <Modal open={open} title={t('leaveForm.title')} onClose={handleClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="leave-type" className="text-sm font-medium">
            {t('leaveForm.type')}
          </label>
          <select
            id="leave-type"
            value={type}
            onChange={(event) => setType(event.target.value as LeaveType)}
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          >
            {LEAVE_TYPES.map((option) => (
              <option key={option} value={option}>
                {t(`leaveType.${option}`)}
              </option>
            ))}
          </select>
          {Number.isFinite(check.available) && (
            <p className="text-xs text-muted">
              {t('leaveForm.availableNote', {
                days: days(check.available),
                type: t(`leaveType.${type}`),
              })}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('leaveForm.from')}
            type="date"
            min={today}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            error={errors.from && tm(errors.from)}
          />
          <Input
            label={t('leaveForm.to')}
            type="date"
            min={from || today}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            error={errors.to && tm(errors.to)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="leave-reason" className="text-sm font-medium">
            {t('leaveForm.reason')} <span className="font-normal text-muted">{t('leaveForm.optional')}</span>
          </label>
          <textarea
            id="leave-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          />
        </div>

        {check.days > 0 && (
          <div className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand">
            <p className="font-medium">{t('leaveForm.summary', { days: days(check.days) })}</p>
            <p className="mt-0.5 text-xs text-brand/80">{t('leaveForm.summaryNote')}</p>
          </div>
        )}

        {serverError && (
          <Alert>
            {t(serverError)}
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy} loadingText={t('login.submitting')}>
            {t('leaveForm.send')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
