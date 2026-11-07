import { AlertTriangle, Check, X } from 'lucide-react'
import { useState } from 'react'
import type { ActionProposal } from '@hr/shared'
import { useI18n } from '@/features/i18n/useI18n'

/**
 * What is about to happen, before it happens.
 *
 * The assistant can read and be wrong at no cost — a misread question shows a
 * different figure. It cannot write and be wrong at no cost, so this card sits
 * between understanding and doing: the instruction as the server resolved it,
 * written out in full, and two plain buttons.
 *
 * The details are rows rather than a sentence on purpose. Somebody approving
 * three days of leave skims a sentence and reads a list, and the difference
 * between the right Ahmad and the wrong one is one line in that list.
 *
 * Nothing here decides anything. The confirm button posts the same resolved
 * instruction back, and the server re-checks the role, re-reads the record and
 * calls the ordinary route — so pressing it can only do what this person could
 * already do by hand.
 */
export function ConfirmAction({
  proposal,
  onConfirm,
  onCancel,
  busy,
  confirmLabel,
  confirmationHint,
}: {
  proposal: ActionProposal
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
  /** Voice Mode arms a separate spoken confirmation instead of executing here. */
  confirmLabel?: string
  confirmationHint?: string
}) {
  const { t, loc } = useI18n()
  const [pressed, setPressed] = useState(false)

  return (
    <div
      className={`rounded-xl border p-3 ${
        proposal.destructive ? 'border-warning/40 bg-warning-soft' : 'border-line bg-paper'
      }`}
    >
      <p className="text-sm font-semibold text-ink">{loc(proposal.summary)}</p>

      {proposal.details.length > 0 && (
        <dl className="mt-2.5 space-y-1.5">
          {proposal.details.map((d, i) => (
            <div key={i} className="flex flex-wrap gap-x-2 text-xs">
              <dt className="shrink-0 text-muted">{loc(d.label)}</dt>
              <dd className="min-w-0 flex-1 font-medium text-ink">
                <bdi>{loc(d.value)}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/*
        Said only where there is something beyond the obvious to say: that
        approving leave also spends the balance, that publishing is public.
        A caution on every action is a caution nobody reads.
      */}
      {proposal.caution && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>{loc(proposal.caution)}</span>
        </p>
      )}

      {confirmationHint && <p className="mt-2.5 text-xs leading-relaxed text-muted">{confirmationHint}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || pressed}
          onClick={() => {
            setPressed(true)
            onConfirm()
          }}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 ${
            proposal.destructive ? 'bg-warning hover:brightness-95' : 'bg-brand hover:bg-brand-700'
          }`}
        >
          <Check className="size-3.5" aria-hidden="true" />
          {confirmLabel ?? t(proposal.destructive ? 'action.confirmCareful' : 'action.confirm')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden="true" />
          {t('action.cancel')}
        </button>
      </div>
    </div>
  )
}
