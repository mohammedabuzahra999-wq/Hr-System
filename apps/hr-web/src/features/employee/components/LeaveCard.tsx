import { CalendarDays, Plus } from 'lucide-react'
import type { LeaveBalance } from '@hr/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import { useI18n } from '@/features/i18n/useI18n'
import { availableDays } from '../leave'

interface LeaveCardProps {
  /** Carries its own hold, so the card cannot show a balance the server would refuse. */
  balance: LeaveBalance
  onRequestLeave: () => void
  className?: string
}

export function LeaveCard({ balance, onRequestLeave, className }: LeaveCardProps) {
  const { t, fmt, days } = useI18n()

  const available = availableDays('annual', balance)
  const heldTotal = balance.heldAnnual + balance.heldSick

  return (
    <Card title={t('leave.title')} icon={CalendarDays} className={className}>
      <p className="text-xs text-muted">{t('leave.annualBalance')}</p>
      <p className="mt-1 text-3xl font-bold text-brand">{days(balance.annualRemaining)}</p>

      <Meter
        bare
        className="mt-3"
        label={t('leave.annualBalance')}
        value={balance.annualRemaining}
        max={balance.annualTotal}
        valueText={days(balance.annualRemaining)}
        caption={t('leave.ofTotal', { total: fmt.number(balance.annualTotal) })}
      />

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <div>
          <dt className="text-xs text-muted">{t('leave.sickLeft')}</dt>
          <dd className="mt-0.5 font-semibold">{days(balance.sickRemaining)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('leave.usedThisYear')}</dt>
          <dd className="mt-0.5 font-semibold">{days(balance.usedThisYear)}</dd>
        </div>
      </dl>

      {/* Pending requests reserve days, so the balance above is not all spendable. */}
      {heldTotal > 0 && (
        <div className="mt-4 rounded-md bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
          <p className="font-medium">{t('leave.onHold', { days: days(heldTotal) })}</p>
          <p className="mt-0.5">{t('leave.available', { days: days(available) })}</p>
        </div>
      )}

      <div className="mt-auto pt-5">
        <Button onClick={onRequestLeave} className="w-full">
          <Plus className="size-4" />
          {t('leave.request')}
        </Button>
      </div>
    </Card>
  )
}
