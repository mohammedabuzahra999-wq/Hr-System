import type { AttendanceStatus } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { useI18n } from '@/features/i18n/useI18n'

const TONES: Record<AttendanceStatus, BadgeTone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  leave: 'info',
  holiday: 'neutral',
  weekend: 'neutral',
}

/**
 * Whether someone is in today.
 *
 * A null status means the answer has not arrived yet, and renders as a dash —
 * showing "absent" for a row still loading would state a fact nobody checked.
 */
export function PresenceBadge({ status }: { status: AttendanceStatus | null }) {
  const { t } = useI18n()
  if (!status) return <span className="text-xs text-muted">{t('common.dash')}</span>
  return <Badge tone={TONES[status]}>{t(`attStatus.${status}`)}</Badge>
}
