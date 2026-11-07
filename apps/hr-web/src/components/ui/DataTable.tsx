import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/features/i18n/useI18n'

export interface Column<Row> {
  /** Stable identity for the column; also the React key. */
  key: string
  header: string
  cell: (row: Row) => ReactNode
  /**
   * The column that identifies the row. On a phone it becomes the card's
   * heading instead of a labelled field. Exactly one column should set this.
   */
  primary?: boolean
  /** Actions and the like: no label on the stacked layout, pinned to the end. */
  action?: boolean
  /** Right-aligned in the table header, e.g. an action column. */
  alignEnd?: boolean
}

interface DataTableProps<Row> {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  loading?: boolean
  /** Shown when the query succeeded but returned nothing. */
  empty?: string
  className?: string
  /**
   * Cap the height and scroll inside, instead of growing down the page.
   *
   * For lists long enough to push everything after them off the screen. A table
   * of five rows does not need it; one that grows every time somebody posts a
   * job does, because the section below stops being findable without scrolling
   * past the whole thing first.
   *
   * Off by default. A short table inside a scroll box looks like it is hiding
   * something, and a scrollbar that never scrolls is furniture.
   */
  maxHeight?: string
}

/**
 * One table, two layouts.
 *
 * A five-column table does not fit on a phone. Clipping it hides data with no
 * way to reach it — which is how the action column on the user directory became
 * invisible, and with it the only way to reset someone's password. Scrolling it
 * sideways is reachable but miserable to use.
 *
 * So below `md` each row is rendered as a stacked card with its own labels, and
 * from `md` up it is a real `<table>`. The cells are defined once either way, so
 * the two layouts cannot drift apart.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  className,
  maxHeight,
}: DataTableProps<Row>) {
  const { t } = useI18n()

  const primary = columns.find((c) => c.primary) ?? columns[0]
  const rest = columns.filter((c) => c !== primary)

  const message = loading ? t('common.loading') : rows.length === 0 ? (empty ?? t('common.noData')) : null

  if (message) {
    return (
      <div className={cn('rounded-xl border border-line px-4 py-6 text-center text-sm text-muted', className)}>
        {message}
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Phones: one card per row, every field labelled. */}
      <ul className={cn('flex flex-col gap-3 md:hidden', maxHeight && `${maxHeight} overflow-y-auto`)}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-xl border border-line bg-surface p-3">
            {primary && <div className="text-sm font-medium text-ink">{primary.cell(row)}</div>}
            <dl className="mt-2 flex flex-col gap-1.5">
              {rest
                .filter((column) => !column.action)
                .map((column) => (
                  <div key={column.key} className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted">{column.header}</dt>
                    <dd className="text-end text-sm text-ink">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
            {rest.some((column) => column.action) && (
              <div className="mt-2 flex justify-end border-t border-line pt-2">
                {rest.filter((c) => c.action).map((column) => (
                  <div key={column.key}>{column.cell(row)}</div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* From md up: the real table. */}
      <div
        className={cn(
          'hidden rounded-xl border border-line md:block',
          maxHeight ? 'overflow-y-auto' : 'overflow-hidden',
          maxHeight,
        )}
      >
        <table className="min-w-full text-start text-sm">
          {/*
            The header stays put while the body scrolls. A column of values with
            no heading in sight is a column you have to scroll back up to read.
          */}
          <thead className={cn('bg-paper text-muted', maxHeight && 'sticky top-0 z-10')}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('px-4 py-3 font-medium', column.alignEnd ? 'text-end' : 'text-start')}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-line bg-surface">
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3', column.alignEnd && 'text-end')}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
