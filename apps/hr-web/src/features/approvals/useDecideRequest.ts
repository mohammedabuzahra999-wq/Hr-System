import { useCallback, useState } from 'react'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

export type Decision = 'approved' | 'rejected'

/**
 * Deciding a request, shared by every screen that can.
 *
 * Manager, HR and admin all reach the same endpoint under the same rules — the
 * server decides who may act on what, from the session — so the call, the
 * per-row busy state and the error mapping live here instead of being written
 * out once per screen and drifting apart.
 *
 * `onDecided` is the caller's refetch: the response is deliberately ignored and
 * the list is read again through the authorised endpoint, the same way a live
 * event refreshes it.
 */
export function useDecideRequest(onDecided: () => void) {
  const { t } = useI18n()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = useCallback(
    async (id: string, decision: Decision) => {
      setBusyId(id)
      setError(null)
      try {
        await api.post(`/requests/${id}/decide`, { decision })
        onDecided()
      } catch (e) {
        setError(errorText(t, e))
      } finally {
        setBusyId(null)
      }
    },
    [onDecided, t],
  )

  return { busyId, error, decide }
}
