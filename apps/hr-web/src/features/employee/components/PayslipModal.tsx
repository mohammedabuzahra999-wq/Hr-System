import { useState } from 'react'
import { Printer } from 'lucide-react'
import type { Payslip, SalarySummary } from '@hr/shared'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/features/i18n/useI18n'

interface PayslipModalProps {
  open: boolean
  salary: SalarySummary
  employeeName: string
  employeeId: string
  onClose: () => void
}

/** The payslip itself, rendered both inside the dialog and in the print sheet. */
function PayslipSheet({ payslip }: { payslip: Payslip }) {
  const { t, fmt } = useI18n()
  const money = (amount: number) => fmt.money(amount, payslip.currency)

  const rows = [
    { label: t('payslip.basic'), value: money(payslip.basic) },
    { label: t('payslip.allowances'), value: money(payslip.allowances) },
    { label: t('payslip.deductions'), value: `− ${money(payslip.deductions)}` },
  ]

  return (
    <dl className="divide-y divide-line rounded-md border border-line">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between px-4 py-2.5 text-sm">
          <dt className="text-muted">{row.label}</dt>
          <dd className="tabular-nums">{row.value}</dd>
        </div>
      ))}
      <div className="flex justify-between bg-brand-50 px-4 py-3 font-semibold text-brand">
        <dt>{t('payslip.netPay')}</dt>
        <dd className="tabular-nums">{money(payslip.netPay)}</dd>
      </div>
    </dl>
  )
}

export function PayslipModal({ open, salary, employeeName, employeeId, onClose }: PayslipModalProps) {
  const { t, fmt } = useI18n()
  const [selectedId, setSelectedId] = useState(salary.latest?.id ?? '')
  const [wasOpen, setWasOpen] = useState(open)

  // Reopening the dialog always starts from the newest payslip. Adjusting during
  // render rather than in an effect keeps it to one pass, with nothing painted in between.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && salary.latest) setSelectedId(salary.latest.id)
  }

  const payslip = salary.history.find((item) => item.id === selectedId) ?? salary.latest
  // Nothing to show before the first payslip exists.
  if (!payslip) return null

  return (
    <>
      <Modal open={open} title={`${t('payslip.title')} · ${fmt.monthYear(payslip.paidOn)}`} onClose={onClose}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="payslip-month" className="text-sm font-medium">
            {t('payslip.month')}
          </label>
          <select
            id="payslip-month"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          >
            {salary.history.map((item) => (
              <option key={item.id} value={item.id}>
                {fmt.monthYear(item.paidOn)}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-4 text-sm text-muted">
          {t('payslip.paidTo', { name: employeeName, date: payslip.paidOn })}
        </p>

        <div className="mt-4">
          <PayslipSheet payslip={payslip} />
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t('common.print')}
          </Button>
        </div>
      </Modal>

      {/*
        A <dialog> lives in the top layer, which browsers print inconsistently.
        This copy is a normal page node that only the print stylesheet reveals,
        so "Print / Save as PDF" always produces the payslip and nothing else.
      */}
      {open && (
        <div className="print-sheet" aria-hidden="true">
          <h1 className="text-lg font-bold">
            {t('payslip.title')} · {fmt.monthYear(payslip.paidOn)}
          </h1>
          <p className="mt-1 text-sm">{employeeName}</p>
          <p className="text-sm">
            {t('payslip.employeeNumber')}: {employeeId}
          </p>
          <p className="mb-4 text-sm">{t('payslip.paidTo', { name: employeeName, date: payslip.paidOn })}</p>
          <PayslipSheet payslip={payslip} />
        </div>
      )}
    </>
  )
}
