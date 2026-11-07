import { Paperclip } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { CV_MAX_BYTES, CV_MIME_TYPES } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

interface CvUploadButtonProps {
  /** Exactly one of these — the same rule the API and the database enforce. */
  userId?: string
  candidateId?: string
  label: string
  onUploaded: () => void
  /** Called with null when a fresh attempt starts, so a stale refusal does not linger. */
  onError: (message: string | null) => void
}

const ACCEPT = Object.entries(CV_MIME_TYPES)
  .flatMap(([mime, ext]) => [mime, ext])
  .join(',')

/**
 * Picks a file and sends it.
 *
 * The size is checked here as a courtesy — it saves pushing ten megabytes up a
 * slow connection only to be refused — but the server checks it again, and reads
 * the file's leading bytes to see what it really is. This control is convenience,
 * the server is the rule.
 */
export function CvUploadButton({ userId, candidateId, label, onUploaded, onError }: CvUploadButtonProps) {
  const { t, fmt } = useI18n()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function send(file: File) {
    onError(null)
    if (file.size > CV_MAX_BYTES) {
      onError(t('err.fileTooLarge'))
      return
    }

    const form = new FormData()
    form.append('file', file)
    if (userId) form.append('userId', userId)
    if (candidateId) form.append('candidateId', candidateId)

    setBusy(true)
    try {
      await api.upload('/cv', form)
      onUploaded()
    } catch (e) {
      onError(errorText(t, e))
    } finally {
      setBusy(false)
      // Clearing lets the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void send(file)
        }}
      />
      <label
        htmlFor={inputId}
        title={t('recruit.fileHint', { size: fmt.bytes(CV_MAX_BYTES) })}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand ${
          busy ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <Paperclip className="size-3.5" aria-hidden="true" />
        {busy ? t('recruit.uploading') : label}
      </label>
    </>
  )
}
