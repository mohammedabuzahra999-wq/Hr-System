import { useCallback, useMemo, useState } from 'react'
import type {
  Announcement,
  AppNotification,
  CreateLeaveRequestInput,
  EmployeeDocument,
  EmployeeRequest,
  LeaveBalance,
  MyAttendance,
  SalarySummary,
} from '@hr/shared'
import { useAuth } from '@/features/auth/useAuth'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api, ApiError } from '@/lib/api'

/**
 * Everything the employee home page reads and writes, over the API.
 *
 * Each slice refetches when the server says its data changed, so two tabs — or a
 * manager approving leave elsewhere — update this screen without a reload. The
 * numbers cannot disagree because they all come from the same round trip rather
 * than from local copies kept in sync by hand.
 */
export function useEmployeeHome() {
  const { user } = useAuth()
  const enabled = user !== null
  const [actionError, setActionError] = useState<ApiError | null>(null)

  const attendance = useLiveQuery<MyAttendance>(
    () => api.get<MyAttendance>('/attendance/me'),
    [user?.id],
    {
      enabled,
      on: ['attendance.changed', 'request.decided'],
      // Only my own rows; a manager's stream also carries their whole team's.
      when: (e) => 'userId' in e && e.userId === user?.id,
    },
  )

  const requests = useLiveQuery<{ requests: EmployeeRequest[]; balance: LeaveBalance }>(
    () => api.get('/requests/me'),
    [user?.id],
    {
      enabled,
      on: ['request.created', 'request.decided'],
      when: (e) => 'userId' in e && e.userId === user?.id,
    },
  )

  const notifications = useLiveQuery<{ notifications: AppNotification[] }>(
    () => api.get('/feed/notifications'),
    [user?.id],
    { enabled, on: ['notification.created'] },
  )

  const announcements = useLiveQuery<{ announcements: Announcement[] }>(
    () => api.get('/feed/announcements'),
    [user?.id],
    { enabled, on: ['announcement.published'] },
  )

  const salary = useLiveQuery<SalarySummary>(() => api.get('/payroll/me'), [user?.id], { enabled })

  const documents = useLiveQuery<{ documents: EmployeeDocument[] }>(
    () => (user ? api.get(`/employees/${user.id}/documents`) : Promise.resolve({ documents: [] })),
    [user?.id],
    { enabled },
  )

  /*
   * Each `refresh` is itself memoised by useLiveQuery, so pulling them out here
   * gives the callbacks below stable dependencies — the query objects are new on
   * every render and would defeat the memoisation.
   */
  const refreshAttendance = attendance.refresh
  const refreshRequests = requests.refresh
  const refreshNotifications = notifications.refresh

  /** Wraps a write so a failure surfaces as a translatable code, never a crash. */
  const run = useCallback(async (action: () => Promise<unknown>, after: () => void) => {
    setActionError(null)
    try {
      await action()
      after()
    } catch (error) {
      setActionError(error instanceof ApiError ? error : new ApiError(0, 'unknown', String(error)))
      throw error
    }
  }, [])

  const checkIn = useCallback(
    () => run(() => api.post('/attendance/check-in'), refreshAttendance),
    [run, refreshAttendance],
  )

  const checkOut = useCallback(
    () => run(() => api.post('/attendance/check-out'), refreshAttendance),
    [run, refreshAttendance],
  )

  const submitLeave = useCallback(
    (input: CreateLeaveRequestInput) =>
      run(() => api.post('/requests/leave', input), () => {
        refreshRequests()
        // An approved day lands in attendance, so the month view follows it.
        refreshAttendance()
      }),
    [run, refreshRequests, refreshAttendance],
  )

  const cancelRequest = useCallback(
    (id: string) => run(() => api.post(`/requests/${id}/cancel`), refreshRequests),
    [run, refreshRequests],
  )

  const setNotificationRead = useCallback(
    (id: string, read: boolean) =>
      run(() => api.patch(`/feed/notifications/${id}`, { read }), refreshNotifications),
    [run, refreshNotifications],
  )

  const markAllRead = useCallback(
    () => run(() => api.post('/feed/notifications/read-all'), refreshNotifications),
    [run, refreshNotifications],
  )

  const dismissNotification = useCallback(
    (id: string) => run(() => api.delete(`/feed/notifications/${id}`), refreshNotifications),
    [run, refreshNotifications],
  )

  const holidays = useMemo(() => attendance.data?.holidays ?? [], [attendance.data])

  return {
    /** True only until the first load of the cards that gate the page. */
    loading: attendance.loading || requests.loading,
    error: attendance.error ?? requests.error ?? actionError,
    attendance: attendance.data,
    holidays,
    requests: requests.data?.requests ?? [],
    balance: requests.data?.balance ?? null,
    notifications: notifications.data?.notifications ?? [],
    announcements: announcements.data?.announcements ?? [],
    salary: salary.data,
    documents: documents.data?.documents ?? [],
    checkIn,
    checkOut,
    submitLeave,
    cancelRequest,
    setNotificationRead,
    markAllRead,
    dismissNotification,
  }
}
