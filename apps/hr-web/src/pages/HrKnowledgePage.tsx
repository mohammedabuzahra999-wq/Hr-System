import { BookOpen, FileText, FileUp, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { KnowledgeDocument, Role } from '@hr/shared'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

const ROLES: Role[] = ['employee', 'manager', 'hr', 'admin']
type Source = 'text' | 'file'

/**
 * The curation screen for MenaChat's company knowledge.
 *
 * It stores extracted text rather than making an opaque model-training job: HR
 * can see each source, control who can use it, and remove it immediately.
 */
export function HrKnowledgePage() {
  const { t, fmt } = useI18n()
  const fileId = useId()
  const library = useLiveQuery<{ documents: KnowledgeDocument[] }>(() => api.get('/knowledge'), [])
  const [source, setSource] = useState<Source>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [visibleTo, setVisibleTo] = useState<Role[]>([...ROLES])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleRole(role: Role) {
    setVisibleTo((current) => (current.includes(role) ? current.filter((item) => item !== role) : [...current, role]))
  }

  function reset() {
    setTitle('')
    setContent('')
    setFile(null)
    setVisibleTo([...ROLES])
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(null)
    if (visibleTo.length === 0) {
      setError(t('knowledge.audienceRequired'))
      return
    }
    if (source === 'text' && content.trim().length < 40) {
      setError(t('knowledge.contentRequired'))
      return
    }
    if (source === 'file' && !file) {
      setError(t('knowledge.fileRequired'))
      return
    }

    setBusy(true)
    try {
      if (source === 'text') {
        await api.post('/knowledge/text', { title, content, visibleTo })
      } else {
        const form = new FormData()
        form.append('file', file!)
        if (title.trim()) form.append('title', title.trim())
        form.append('visibleTo', JSON.stringify(visibleTo))
        await api.upload('/knowledge/upload', form)
      }
      reset()
      library.refresh()
    } catch (caught) {
      setError(errorText(t, caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove(document: KnowledgeDocument) {
    if (!window.confirm(t('knowledge.removeConfirm', { title: document.title }))) return
    setError(null)
    try {
      await api.delete(`/knowledge/${document.id}`)
      library.refresh()
    } catch (caught) {
      setError(errorText(t, caught))
    }
  }

  const columns: Column<KnowledgeDocument>[] = [
    {
      key: 'title',
      header: t('knowledge.document'),
      primary: true,
      cell: (document) => (
        <div>
          <p className="font-medium text-ink">{document.title}</p>
          <p className="mt-0.5 text-xs text-muted">{document.sourceFileName ?? t('knowledge.sourceText')}</p>
        </div>
      ),
    },
    {
      key: 'audience',
      header: t('knowledge.audience'),
      cell: (document) => (
        <div className="flex flex-wrap gap-1">
          {document.visibleTo.map((role) => (
            <Badge key={role} tone="info">{t(`role.${role}`)}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'chunks',
      header: t('knowledge.passages'),
      cell: (document) => fmt.number(document.chunkCount),
    },
    {
      key: 'updated',
      header: t('knowledge.added'),
      cell: (document) => fmt.date(document.updatedAt),
    },
    {
      key: 'delete',
      header: t('table.action'),
      action: true,
      alignEnd: true,
      cell: (document) => (
        <Button variant="ghost" className="h-8 px-2 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => void remove(document)}>
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="sr-only">{t('knowledge.remove')}</span>
        </Button>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('knowledge.title')}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">{t('knowledge.subtitle')}</p>
        </div>
        <Badge tone="info">{t('knowledge.badge')}</Badge>
      </header>

      {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {library.error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{errorText(t, library.error)}</p>}

      <Card title={t('knowledge.addSource')} icon={Plus} className="rounded-2xl">
        <form className="space-y-5" onSubmit={(event) => void save(event)}>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm font-medium text-ink">{t('knowledge.source')}</legend>
            <button
              type="button"
              onClick={() => setSource('text')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${source === 'text' ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-surface text-muted hover:text-ink'}`}
            >
              <FileText className="size-4" aria-hidden="true" />
              {t('knowledge.sourceText')}
            </button>
            <button
              type="button"
              onClick={() => setSource('file')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${source === 'file' ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-surface text-muted hover:text-ink'}`}
            >
              <FileUp className="size-4" aria-hidden="true" />
              {t('knowledge.sourceFile')}
            </button>
          </fieldset>

          <label className="block max-w-xl">
            <span className="text-sm font-medium text-ink">{t('knowledge.documentTitle')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={180}
              required={source === 'text'}
              placeholder={t('knowledge.documentTitleHint')}
              className="mt-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          {source === 'text' ? (
            <label className="block">
              <span className="text-sm font-medium text-ink">{t('knowledge.content')}</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={8}
                maxLength={80_000}
                placeholder={t('knowledge.contentHint')}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
          ) : (
            <label htmlFor={fileId} className="block rounded-xl border border-dashed border-line bg-paper p-4 transition hover:border-brand">
              <span className="flex items-center gap-2 text-sm font-medium text-ink"><FileUp className="size-4 text-brand" aria-hidden="true" />{t('knowledge.chooseFile')}</span>
              <span className="mt-1 block text-xs text-muted">{t('knowledge.fileHint')}</span>
              <input
                id={fileId}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="mt-3 block w-full text-sm text-muted file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand hover:file:bg-brand-50"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file && <span className="mt-2 block text-xs text-muted">{file.name} · {fmt.bytes(file.size)}</span>}
            </label>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-ink">{t('knowledge.audience')}</legend>
            <p className="mt-1 text-xs text-muted">{t('knowledge.audienceHint')}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {ROLES.map((role) => (
                <label key={role} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={visibleTo.includes(role)} onChange={() => toggleRole(role)} className="size-4 rounded border-line accent-brand" />
                  {t(`role.${role}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="rounded-xl bg-paper px-3 py-2 text-xs leading-relaxed text-muted">{t('knowledge.privacy')}</p>
          <Button type="submit" loading={busy} loadingText={t('knowledge.saving')}>
            <BookOpen className="size-4" aria-hidden="true" />
            {t('knowledge.save')}
          </Button>
        </form>
      </Card>

      <Card title={t('knowledge.library')} icon={BookOpen} className="rounded-2xl">
        <DataTable columns={columns} rows={library.data?.documents ?? []} rowKey={(document) => document.id} loading={library.loading} empty={t('knowledge.empty')} />
      </Card>
    </div>
  )
}
