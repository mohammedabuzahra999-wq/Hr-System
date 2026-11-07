import { Download, FileText, Trash2 } from 'lucide-react'
import type { CvFile } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'
import { downloadUrl } from '@/lib/api'

interface CvRowProps {
  file: CvFile
  /** Omitted for a viewer who may read but not remove. */
  onDelete?: (file: CvFile) => void
}

/**
 * One stored CV: what it is, who put it there, and the two things you can do.
 *
 * The download is an anchor, not a button that fetches — the browser's own save
 * dialog handles the file, the cookie rides along, and nothing is held in memory.
 */
export function CvRow({ file, onDelete }: CvRowProps) {
  const { t, loc, fmt } = useI18n()

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand" aria-hidden="true">
        <FileText className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        {/* A CV filename is usually Latin; `bdi` keeps it readable in an Arabic page. */}
        <p className="truncate text-sm font-medium text-ink">
          <bdi dir="ltr">{file.fileName}</bdi>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {fmt.bytes(file.sizeBytes)}
          {' · '}
          {file.uploadedByName
            ? t('recruit.uploadedBy', { name: loc(file.uploadedByName) })
            : fmt.date(file.uploadedAt)}
        </p>
      </div>

      <a
        href={downloadUrl(`/cv/${file.id}/download`)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
      >
        <Download className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{t('common.download')}</span>
      </a>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(file)}
          aria-label={t('recruit.removeCv')}
          className="inline-flex shrink-0 items-center rounded-md bg-danger-soft px-2 py-1.5 text-danger transition hover:bg-danger/15"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
