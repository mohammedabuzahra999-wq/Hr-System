import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import type { ResetPasswordResult } from '@hr/shared'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * Shows a freshly issued temporary password.
 *
 * This is the only moment the value is readable — the server hashed it on the
 * way in and cannot return it again — so the dialog says so plainly rather than
 * letting someone assume they can come back for it.
 */
export function TemporaryPasswordDialog({
  result,
  onClose,
}: {
  result: ResetPasswordResult | null
  onClose: () => void
}) {
  const { t, loc } = useI18n()
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the value is on screen to read either way.
    }
  }

  function close() {
    setCopied(false)
    onClose()
  }

  return (
    <Modal
      open={result !== null}
      title={result ? t('adminUsers.resetTitle', { name: loc(result.employeeName) }) : ''}
      onClose={close}
    >
      {result && (
        <div className="flex flex-col gap-4">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            {t('adminUsers.resetOnce')}
          </p>

          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper p-3">
            <KeyRound className="size-4 shrink-0 text-muted" aria-hidden="true" />
            {/* Latin and grouped, so it reads the same inside an Arabic layout. */}
            <code className="flex-1 select-all font-mono text-lg tracking-wide text-ink" dir="ltr">
              {result.temporaryPassword}
            </code>
            <Button type="button" variant="secondary" onClick={() => void copy()} className="shrink-0">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {t(copied ? 'adminUsers.copied' : 'adminUsers.copy')}
            </Button>
          </div>

          <p className="text-sm text-muted">{t('adminUsers.resetSignedOut')}</p>

          <div className="flex justify-end border-t border-line pt-4">
            <Button type="button" onClick={close}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
