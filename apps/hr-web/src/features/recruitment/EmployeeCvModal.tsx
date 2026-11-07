import { useState } from 'react'
import type { CvFile, Employee, ServerEventType } from '@hr/shared'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'
import { CvRow } from './CvRow'
import { CvUploadButton } from './CvUploadButton'

const LIVE_ON: ServerEventType[] = ['recruitment.changed']

/**
 * The CVs on one employee's file.
 *
 * Uploading here does not replace what is there: an employee can have several
 * versions over the years, and the newest sitting at the top is more useful than
 * the older one silently disappearing.
 */
export function EmployeeCvModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { t, loc } = useI18n()
  const [error, setError] = useState<string | null>(null)

  const files = useLiveQuery<{ files: CvFile[] }>(
    () => api.get(`/cv/employee/${employee!.id}`),
    [employee?.id],
    { on: LIVE_ON, enabled: employee !== null },
  )

  const rows = files.data?.files ?? []

  async function remove(file: CvFile) {
    if (!window.confirm(t('recruit.removeCvConfirm', { name: file.fileName }))) return
    setError(null)
    try {
      await api.delete(`/cv/${file.id}`)
      files.refresh()
    } catch (e) {
      setError(errorText(t, e))
    }
  }

  return (
    <Modal
      open={employee !== null}
      title={employee ? t('recruit.cvFor', { name: loc(employee.fullName) }) : ''}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('recruit.employeeCvSub')}</p>

        {(error || files.error) && (
          <Alert>
            {error ?? errorText(t, files.error)}
          </Alert>
        )}

        {files.loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-line px-3 py-4 text-center text-sm text-muted">{t('recruit.noCv')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((file) => (
              <CvRow key={file.id} file={file} onDelete={remove} />
            ))}
          </div>
        )}

        {employee && (
          <div className="flex justify-end pt-1">
            <CvUploadButton
              userId={employee.id}
              label={t('recruit.uploadCv')}
              onUploaded={files.refresh}
              onError={setError}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
