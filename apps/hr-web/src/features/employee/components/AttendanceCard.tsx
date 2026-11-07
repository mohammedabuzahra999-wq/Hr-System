import { useEffect, useState } from 'react'
import { Clock, LogIn, LogOut } from 'lucide-react'
import type { AttendanceDay, Shift } from '@hr/shared'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/features/i18n/useI18n'
import { toDate } from '@/lib/format'
import { lateMinutes, shiftEnd, shiftStart, workedMs } from '../attendance'

interface AttendanceCardProps {
  day: AttendanceDay
  shift: Shift
  onCheckIn: () => void
  onCheckOut: () => void
  /** Disables both controls while a check-in or check-out is in flight. */
  busy?: boolean
  className?: string
}

export function AttendanceCard({ day, shift, onCheckIn, onCheckOut, busy, className }: AttendanceCardProps) {
  const { t, fmt, duration } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const checkIn = day.checkIn ? toDate(day.checkIn) : null
  const checkOut = day.checkOut ? toDate(day.checkOut) : null
  const date = toDate(day.date)

  const state = !checkIn ? 'out' : checkOut ? 'done' : 'in'
  const worked = workedMs({ checkIn, checkOut }, now)
  const late = checkIn && day.status === 'late' ? lateMinutes(checkIn, shift) : 0

  const rows = [
    { label: t('attendance.checkedIn'), value: checkIn ? fmt.time(checkIn) : t('common.dash') },
    { label: t('attendance.checkedOut'), value: checkOut ? fmt.time(checkOut) : t('common.dash') },
    { label: t('attendance.hoursToday'), value: duration(worked) },
  ]

  const badge =
    state === 'in' ? (
      late ? (
        <Badge tone="warning">{t('attendance.lateTag')}</Badge>
      ) : (
        <Badge tone="success">{t('attendance.present')}</Badge>
      )
    ) : state === 'done' ? (
      <Badge tone="info">{t('attendance.checkedOutTag')}</Badge>
    ) : (
      <Badge>{t('attendance.notCheckedIn')}</Badge>
    )

  /** A note under the figures: why today is unusual, or how late the arrival was. */
  const note =
    state === 'done'
      ? t('attendance.done')
      : late
        ? // Past an hour, "6h 16m" reads better than "376 min".
          late >= 60
          ? t('attendance.lateByDuration', { duration: duration(late * 60_000) })
          : t('attendance.lateBy', { minutes: fmt.number(late) })
        : day.status === 'holiday'
          ? t('attendance.holiday')
          : day.status === 'weekend'
            ? t('attendance.weekend')
            : null

  return (
    <Card title={t('attendance.title')} icon={Clock} className={className} action={badge}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-muted">{fmt.dayDate(new Date(now))}</p>
        <p className="text-xs text-muted">
          {t('attendance.shift', {
            from: fmt.time(shiftStart(date, shift)),
            to: fmt.time(shiftEnd(date, shift)),
          })}
        </p>
      </div>

      {/*
        Three columns still fit on a phone, but "0h 00m" does not at the larger
        size — it wrapped onto two lines. The value steps up with the viewport
        instead of the box having to grow.
      */}
      <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md bg-paper px-2.5 py-3 sm:px-3">
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        Two separate controls rather than one that swaps label: arriving and
        leaving are different actions, and each stays visible but disabled when
        it does not apply, so the day's state is readable without pressing.
      */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-5">
        <Button onClick={onCheckIn} disabled={state !== 'out' || busy} className="w-full sm:w-auto">
          <LogIn className="size-4" aria-hidden="true" />
          {t('attendance.checkIn')}
        </Button>
        <Button
          variant="secondary"
          onClick={onCheckOut}
          disabled={state !== 'in' || busy}
          className="w-full sm:w-auto"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {t('attendance.checkOut')}
        </Button>
        {note && <p className="w-full text-sm text-muted sm:w-auto">{note}</p>}
      </div>
    </Card>
  )
}
