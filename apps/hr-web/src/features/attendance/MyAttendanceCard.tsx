import { useCallback, useState } from 'react'
import type { MyAttendance as MyAttendancePayload, ServerEventType } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { AttendanceCard } from '@/features/employee/components/AttendanceCard'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

/**
 * Checking in and out, for whoever is signed in.
 *
 * The server never restricted this — `/attendance/check-in` sits behind
 * `requireAuth` and nothing else — but the card only existed on the employee's
 * page, so an HR officer, a manager and an administrator had no way to record
 * their own day. They are employees too, and an attendance report that silently
 * excludes everybody senior is not an attendance report.
 *
 * This wraps the same card the employee home uses rather than a second one, so
 * the two cannot drift: one place decides what "checked in at 8:31, late by a
 * minute" looks like.
 */

const LIVE_ON: ServerEventType[] = ['attendance.changed']

export function MyAttendanceCard({ className }: { className?: string }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The same payload the employee home reads, so there is one shape to keep right.
  const mine = useLiveQuery<MyAttendancePayload>(() => api.get('/attendance/me'), [], { on: LIVE_ON })

  const act = useCallback(
    async (path: 'check-in' | 'check-out') => {
      setBusy(true)
      setError(null)
      try {
        await api.post(`/attendance/${path}`)
        mine.refresh()
      } catch (e) {
        setError(errorText(t, e))
      } finally {
        setBusy(false)
      }
    },
    [mine, t],
  )

  // Nothing at all until the day has loaded: a card with empty times briefly
  // reads as "you have not checked in", which is a lie for anyone who has.
  if (!mine.data) return null

  return (
    <div className={className}>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <AttendanceCard
        day={mine.data.today}
        shift={mine.data.shift}
        busy={busy}
        onCheckIn={() => void act('check-in')}
        onCheckOut={() => void act('check-out')}
      />
    </div>
  )
}
