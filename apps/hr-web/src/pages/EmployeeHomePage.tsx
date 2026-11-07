import { FileText, TrendingUp, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { AttendanceDay, CreateLeaveRequestInput } from '@hr/shared'
import { BarChart, type BarDatum } from '@/components/ui/BarChart'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { AnnouncementsCard } from '@/features/employee/components/AnnouncementsCard'
import { AttendanceCard } from '@/features/employee/components/AttendanceCard'
import { LeaveCard } from '@/features/employee/components/LeaveCard'
import { NotificationsCard } from '@/features/employee/components/NotificationsCard'
import { PayslipModal } from '@/features/employee/components/PayslipModal'
import { ProfileCard } from '@/features/employee/components/ProfileCard'
import { RequestLeaveModal } from '@/features/employee/components/RequestLeaveModal'
import { RequestsCard } from '@/features/employee/components/RequestsCard'
import { SalaryCard } from '@/features/employee/components/SalaryCard'
import { useEmployeeHome } from '@/features/employee/useEmployeeHome'
import { useLive } from '@/features/realtime/LiveContext'
import { errorKey } from '@/lib/apiError'
import { toDate } from '@/lib/format'

export function EmployeeHomePage() {
  const { user } = useAuth()
  const { t, fmt, duration } = useI18n()
  const { status: liveStatus } = useLive()
  const location = useLocation()
  const home = useEmployeeHome()

  const [leaveOpen, setLeaveOpen] = useState(false)
  const [payslipOpen, setPayslipOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  /** The last five days actually worked, read from the recorded attendance. */
  const week: BarDatum[] = useMemo(() => {
    const worked = (home.attendance?.month ?? []).filter(
      (day: AttendanceDay) => day.status === 'present' || day.status === 'late',
    )
    return worked.slice(-5).map((day) => {
      const ms = day.checkIn && day.checkOut ? toDate(day.checkOut).getTime() - toDate(day.checkIn).getTime() : 0
      return {
        id: day.date,
        label: fmt.weekdayShort(day.date),
        value: ms,
        valueText: duration(ms),
        hint: fmt.dayDate(day.date),
      }
    })
  }, [home.attendance, fmt, duration])

  const shift = home.attendance?.shift
  const shiftMs = shift
    ? (shift.endHour * 60 + shift.endMinute - shift.startHour * 60 - shift.startMinute) * 60_000
    : 0

  useEffect(() => {
    if (!location.hash) return
    const node = document.getElementById(location.hash.replace('#', ''))
    if (node) requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [location.hash, home.loading])

  async function guard(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } catch {
      // The hook already captured it; the banner below reports it.
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave(input: CreateLeaveRequestInput) {
    setBusy(true)
    try {
      await home.submitLeave(input)
      setLeaveOpen(false)
    } catch {
      // Stay open so the employee can see why and fix it.
    } finally {
      setBusy(false)
    }
  }

  if (home.loading) return <PageSpinner label={t('login.submitting')} />

  if (!user || !home.attendance || !home.balance) {
    return (
      <p role="alert" className="rounded-2xl border border-danger/20 bg-red-50 p-4 text-sm text-danger">
        {t(errorKey(home.error))}
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* A stale screen is worse than a visible warning that it is stale. */}
      {liveStatus !== 'open' && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          {t(liveStatus === 'connecting' ? 'live.connecting' : 'live.offline')}
        </p>
      )}

      {home.error && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(errorKey(home.error))}
        </p>
      )}

      <section id="overview">
        <ProfileCard profile={user} />
      </section>

      <div id="attendance" className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <AttendanceCard
          day={home.attendance.today}
          shift={home.attendance.shift}
          busy={busy}
          onCheckIn={() => void guard(home.checkIn)}
          onCheckOut={() => void guard(home.checkOut)}
        />

        <Card title={t('empHome.weekTitle')} icon={TrendingUp}>
          <BarChart
            caption={t('chart.weekHours')}
            data={week}
            max={Math.max(shiftMs, ...week.map((d) => d.value), 3_600_000)}
            reference={{ value: shiftMs, label: duration(shiftMs) }}
            highlightId={week.at(-1)?.id}
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div id="leave" className="flex">
          <LeaveCard balance={home.balance} onRequestLeave={() => setLeaveOpen(true)} className="w-full" />
        </div>

        <div id="requests" className="flex">
          <RequestsCard requests={home.requests} onCancel={(id) => void guard(() => home.cancelRequest(id))} className="w-full" />
        </div>
      </div>

      <div id="payslips" className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {home.salary && <SalaryCard salary={home.salary} onViewPayslip={() => setPayslipOpen(true)} />}
        <AnnouncementsCard items={home.announcements} />
      </div>

      <div id="notifications" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <NotificationsCard
          notifications={home.notifications}
          onToggleRead={(id, read) => void guard(() => home.setNotificationRead(id, read))}
          onDismiss={(id) => void guard(() => home.dismissNotification(id))}
          onMarkAllRead={() => void guard(home.markAllRead)}
        />

        <Card title={t('documents.title')} icon={FileText}>
          {home.documents.length === 0 ? (
            <p className="text-sm text-muted">{t('documents.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {home.documents.slice(0, 4).map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink" dir="ltr">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-muted">{t('empHome.fileSize', { size: fmt.number(doc.sizeKb) })}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand">
                    {t(`docKind.${doc.kind}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RequestLeaveModal
        open={leaveOpen}
        balance={home.balance}
        holidays={home.holidays}
        requests={home.requests}
        busy={busy}
        serverError={home.error ? errorKey(home.error) : null}
        onClose={() => setLeaveOpen(false)}
        onSubmit={(input) => void handleLeave(input)}
      />
      {home.salary && (
        <PayslipModal
          open={payslipOpen}
          salary={home.salary}
          employeeName={user.fullName.en}
          employeeId={user.employeeNumber}
          onClose={() => setPayslipOpen(false)}
        />
      )}
    </div>
  )
}

function PageSpinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <span className="size-8 animate-spin rounded-full border-2 border-line border-t-brand" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
