import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TeamAttendanceRow } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'

type StatusKey = 'present' | 'late' | 'absent' | 'leave'

const tones: Record<TeamAttendanceRow['status'], BadgeTone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave: 'info',
  holiday: 'neutral',
  weekend: 'neutral',
}

/** `status: null` is the "all" chip. Filtering is by key, so it survives a language switch. */
const filters: { label: TKey; status: StatusKey | null }[] = [
  { label: 'common.all', status: null },
  { label: 'attStatus.present', status: 'present' },
  { label: 'attStatus.late', status: 'late' },
  { label: 'attStatus.absent', status: 'absent' },
  { label: 'attStatus.leave', status: 'leave' },
]

/**
 * Today's attendance for whoever the caller is allowed to see.
 *
 * The rows are already scoped by the API — a manager's request returns their own
 * reports and HR's returns everyone — so this component never decides who is
 * visible, only how they are drawn.
 */
export function TeamAttendanceTable({
  rows,
  loading,
  showDepartment = true,
}: {
  rows: TeamAttendanceRow[]
  loading: boolean
  showDepartment?: boolean
}) {
  const { t, loc, fmt, duration } = useI18n()
  const [query, setQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<StatusKey | null>(null)

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (activeStatus && row.status !== activeStatus) return false
      if (!normalized) return true
      return `${row.name.en} ${row.name.ar} ${row.department.en} ${row.department.ar}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [rows, activeStatus, query])

  /*
   * The department column is spread in only when the caller asks for it: a
   * manager's page already knows the department, so repeating it wastes a
   * column on a phone.
   */
  const columns: Column<TeamAttendanceRow>[] = [
    {
      key: 'employee',
      header: t('table.employee'),
      primary: true,
      cell: (row) => <span className="font-medium text-ink">{loc(row.name)}</span>,
    },
    ...(showDepartment
      ? [
          {
            key: 'department',
            header: t('table.department'),
            cell: (row: TeamAttendanceRow) => <span className="text-muted">{loc(row.department)}</span>,
          },
        ]
      : []),
    {
      key: 'checkIn',
      header: t('table.checkIn'),
      cell: (row) => (
        <span className="tabular-nums text-muted">{row.checkIn ? fmt.time(row.checkIn) : t('common.dash')}</span>
      ),
    },
    {
      key: 'status',
      header: t('table.status'),
      cell: (row) => <Badge tone={tones[row.status]}>{t(`attStatus.${row.status}`)}</Badge>,
    },
    {
      key: 'hours',
      header: t('table.hours'),
      cell: (row) => (
        <span className="tabular-nums text-muted">{row.workedMs > 0 ? duration(row.workedMs) : t('common.dash')}</span>
      ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted md:min-w-[220px]">
          <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.byEmployee')}
            aria-label={t('search.byEmployee')}
            className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => setActiveStatus(filter.status)}
              aria-pressed={activeStatus === filter.status}
              className={[
                'rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
                activeStatus === filter.status
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-paper text-muted hover:border-brand/40 hover:text-brand',
              ].join(' ')}
            >
              {t(filter.label)}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        rows={visible}
        rowKey={(row) => row.userId}
        loading={loading}
        empty={t('chart.empty')}
        columns={columns}
      />
    </>
  )
}
