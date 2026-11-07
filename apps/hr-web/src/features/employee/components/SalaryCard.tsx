import { useEffect, useState } from 'react'
import { Eye, EyeOff, FileText, Wallet } from 'lucide-react'
import type { SalarySummary } from '@hr/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/features/i18n/useI18n'

interface SalaryCardProps {
  salary: SalarySummary
  onViewPayslip: () => void
  className?: string
}

const STORAGE_KEY = 'hr-app:salary-visible'

/** The choice is remembered for the session, so it does not reset on every visit. */
function readVisible() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function SalaryCard({ salary, onViewPayslip, className }: SalaryCardProps) {
  const { t, fmt } = useI18n()
  const [visible, setVisible] = useState(readVisible)
  const { latest } = salary

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(visible))
    } catch {
      /* storage unavailable — the choice lasts until reload */
    }
  }, [visible])

  return (
    <Card
      title={t('salary.title')}
      icon={Wallet}
      className={className}
      action={
        <button
          onClick={() => setVisible((current) => !current)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-50"
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {visible ? t('salary.hide') : t('salary.show')}
        </button>
      }
    >
      <p className="text-xs text-muted">{t('salary.lastNet')}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums" aria-live="polite">
        {latest ? (visible ? fmt.money(latest.netPay, latest.currency) : `${latest.currency} ••••••`) : t('common.dash')}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <div>
          <dt className="text-xs text-muted">{t('salary.paidOn')}</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            {latest ? fmt.date(latest.paidOn) : t('common.dash')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('salary.nextPayday')}</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            {salary.nextPayOn ? fmt.date(salary.nextPayOn) : t('common.dash')}
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-5">
        <Button variant="secondary" onClick={onViewPayslip} disabled={!latest} className="w-full">
          <FileText className="size-4" />
          {t('salary.viewPayslip')}
        </Button>
      </div>
    </Card>
  )
}
