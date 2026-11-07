import { useMemo } from 'react'
import type { AttendanceStatus, ServerEventType, TeamAttendanceRow } from '@hr/shared'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'

const LIVE_ON: ServerEventType[] = ['attendance.changed', 'request.decided']

/**
 * Whether each person is in today.
 *
 * Read from the same `/attendance/team` endpoint the attendance screens use, so
 * a request queue and the attendance table can never disagree about who is here.
 * The endpoint scopes itself from the session: HR and an administrator get
 * everyone, a manager gets their own reports.
 *
 * `statusOf` returns null while the query is still loading, so a caller shows a
 * dash rather than asserting "absent" about someone it has not heard about yet.
 */
export function usePresenceToday() {
  const attendance = useLiveQuery<{ rows: TeamAttendanceRow[] }>(() => api.get('/attendance/team'), [], {
    on: LIVE_ON,
  })

  const byUser = useMemo(() => {
    const map = new Map<string, AttendanceStatus>()
    for (const row of attendance.data?.rows ?? []) map.set(row.userId, row.status)
    return map
  }, [attendance.data])

  return {
    loading: attendance.loading,
    statusOf: (userId: string): AttendanceStatus | null =>
      attendance.data ? (byUser.get(userId) ?? null) : null,
  }
}
