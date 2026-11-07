import { Bot, RefreshCw } from 'lucide-react'
import type { AssistantQuestionReason, AssistantUnansweredQuestion, AssistantUnansweredQuestions } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorText } from '@/lib/apiError'

const REASON_LABEL: Record<AssistantQuestionReason, TKey> = {
  notHrData: 'assistantQuestions.reason.notHrData',
  notPermitted: 'assistantQuestions.reason.notPermitted',
  unclear: 'assistantQuestions.reason.unclear',
  noData: 'assistantQuestions.reason.noData',
}

const REASON_TONE: Record<AssistantQuestionReason, BadgeTone> = {
  notHrData: 'neutral',
  notPermitted: 'warning',
  unclear: 'warning',
  noData: 'info',
}

/** HR/Admin-only inbox for the exact wording behind a refused assistant answer. */
export function AssistantQuestionsPage() {
  const { t, fmt } = useI18n()
  const unanswered = useLiveQuery<AssistantUnansweredQuestions>(() => api.get('/assistant-review/unanswered'), [])

  const columns: Column<AssistantUnansweredQuestion>[] = [
    {
      key: 'question',
      header: t('assistantQuestions.question'),
      primary: true,
      cell: (item) => <p className="max-w-xl whitespace-pre-wrap text-sm leading-6 text-ink">{item.question}</p>,
    },
    {
      key: 'role',
      header: t('assistantQuestions.role'),
      cell: (item) => <Badge tone="info">{t(`role.${item.role}`)}</Badge>,
    },
    {
      key: 'reason',
      header: t('assistantQuestions.reason'),
      cell: (item) => <Badge tone={REASON_TONE[item.reason]}>{t(REASON_LABEL[item.reason])}</Badge>,
    },
    {
      key: 'createdAt',
      header: t('assistantQuestions.date'),
      cell: (item) => <span className="whitespace-nowrap text-muted">{fmt.date(item.createdAt)} {fmt.time(item.createdAt)}</span>,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">{t('assistantQuestions.title')}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">{t('assistantQuestions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="warning">{t('assistantQuestions.badge')}</Badge>
          <Button type="button" variant="secondary" onClick={unanswered.refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('assistantQuestions.refresh')}
          </Button>
        </div>
      </header>

      {unanswered.error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{errorText(t, unanswered.error)}</p>}

      <Card title={t('assistantQuestions.title')} icon={Bot} className="rounded-2xl">
        <DataTable
          columns={columns}
          rows={unanswered.data?.questions ?? []}
          rowKey={(item) => item.id}
          loading={unanswered.loading}
          empty={t('assistantQuestions.empty')}
          maxHeight="max-h-[34rem]"
        />
      </Card>
    </div>
  )
}
