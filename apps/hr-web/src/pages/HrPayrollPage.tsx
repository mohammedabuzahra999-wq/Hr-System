import { ArrowUpLeft, Banknote, BarChart3, ChevronDown, ChevronUp, ClipboardCheck, Clock3, Database, DollarSign, FileText, Gift, LayoutDashboard, ReceiptText, ScanSearch, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, UsersRound, WalletCards, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import type { Employee, PayrollAudit, PayrollAuditOverview, PayrollCycle, PayrollRun, PayrollRunStatus, PayrollSettings, PayrollStatus, SalaryContractStatuses, SalaryRecord } from '@hr/shared'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import type { TKey } from '@/features/i18n/dictionary'
import { useI18n } from '@/features/i18n/useI18n'
import { useLiveQuery } from '@/features/realtime/useLiveQuery'
import { api } from '@/lib/api'
import { errorKey } from '@/lib/apiError'

/**
 * Payroll status is rendered from the stored key, never from the text on screen,
 * so a language switch cannot change what a row means. `onHold` has no dictionary
 * entry of its own yet and reads as the nearest existing one.
 */
const statusMeta: Record<PayrollStatus, { label: TKey; tone: BadgeTone }> = {
  processed: { label: 'status.processed', tone: 'success' },
  underReview: { label: 'status.underReview', tone: 'warning' },
  onHold: { label: 'status.pending', tone: 'warning' },
}

const runMeta: Record<PayrollRunStatus, { label: TKey; tone: BadgeTone }> = {
  draft: { label: 'hrPay.runStatus.draft', tone: 'warning' },
  approved: { label: 'hrPay.runStatus.approved', tone: 'success' },
  paid: { label: 'hrPay.runStatus.paid', tone: 'success' },
  cancelled: { label: 'hrPay.runStatus.cancelled', tone: 'neutral' },
}

const auditTone: Record<PayrollAudit['status'], BadgeTone> = {
  running: 'info',
  completed: 'success',
  failed: 'danger',
  stale: 'neutral',
}

const findingTone: Record<PayrollAudit['findings'][number]['severity'], BadgeTone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
}

/** The seed note is a system state, not HR-authored prose, so it follows the UI language. */
function isUnconfirmedSeedNote(note: string | null) {
  return note?.startsWith('Seeded defaults. NOT verified against current Jordanian law') ?? false
}

type PayrollAdjustmentRow = {
  id: string
  userId: string
  employee: { en: string; ar: string }
  employeeNumber: string
  kind: 'overtime' | 'bonus' | 'allowance' | 'deduction'
  amount: number
  effectiveOn: string
  note: string
  status: 'pending' | 'approved' | 'rejected'
}

type SalaryForm = {
  basic: string
  transport: string
  housing: string
  other: string
  effectiveFrom: string
  socialSecurityExempt: boolean
  dependants: string
}

type PayrollWorkspaceSection =
  | 'overview'
  | 'runs'
  | 'salaries'
  | 'earnings'
  | 'overtime'
  | 'bonuses'
  | 'adjustments'
  | 'review'
  | 'payslips'
  | 'reports'

const payrollNavigation: { id: PayrollWorkspaceSection; label: TKey; icon: LucideIcon }[] = [
  { id: 'overview', label: 'hrPay.nav.overview', icon: LayoutDashboard },
  { id: 'runs', label: 'hrPay.nav.runs', icon: ClipboardCheck },
  { id: 'salaries', label: 'hrPay.nav.salaries', icon: UsersRound },
  { id: 'earnings', label: 'hrPay.nav.earnings', icon: ReceiptText },
  { id: 'overtime', label: 'hrPay.nav.overtime', icon: Clock3 },
  { id: 'bonuses', label: 'hrPay.nav.bonuses', icon: Gift },
  { id: 'adjustments', label: 'hrPay.nav.adjustments', icon: SlidersHorizontal },
  { id: 'review', label: 'hrPay.nav.review', icon: ScanSearch },
  { id: 'payslips', label: 'hrPay.nav.payslips', icon: FileText },
  { id: 'reports', label: 'hrPay.nav.reports', icon: BarChart3 },
]

function sectionFromHash(hash: string): PayrollWorkspaceSection {
  const id = hash.replace(/^#/, '') as PayrollWorkspaceSection
  return payrollNavigation.some((item) => item.id === id) ? id : 'overview'
}

/** A new agreement cannot rewrite a month already approved for payment. */
function firstEditableSalaryDate(runs: PayrollRun[], now: Date): string {
  const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const latestLocked = runs
    .filter((run) => run.status === 'approved' || run.status === 'paid')
    .reduce<PayrollRun | null>((latest, run) => {
      if (!latest) return run
      return run.periodYear > latest.periodYear || (run.periodYear === latest.periodYear && run.periodMonth > latest.periodMonth)
        ? run
        : latest
    }, null)
  if (!latestLocked) return `${firstOfCurrentMonth.getFullYear()}-${String(firstOfCurrentMonth.getMonth() + 1).padStart(2, '0')}-01`
  const lockedMonth = new Date(latestLocked.periodYear, latestLocked.periodMonth - 1, 1)
  if (lockedMonth < firstOfCurrentMonth) return `${firstOfCurrentMonth.getFullYear()}-${String(firstOfCurrentMonth.getMonth() + 1).padStart(2, '0')}-01`
  const next = new Date(latestLocked.periodYear, latestLocked.periodMonth, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
}

export function HrPayrollPage() {
  const { t, loc, fmt } = useI18n()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [actionError, setActionError] = useState<TKey | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [auditRunId, setAuditRunId] = useState<string | null>(null)
  const [showAuditDetails, setShowAuditDetails] = useState(false)
  const [showVariablePay, setShowVariablePay] = useState(false)
  const [section, setSection] = useState<PayrollWorkspaceSection>(() => sectionFromHash(location.hash))
  const [adjustment, setAdjustment] = useState({ userId: '', kind: 'overtime' as PayrollAdjustmentRow['kind'], amount: '', effectiveOn: today, note: '' })
  const [salaryEmployeeId, setSalaryEmployeeId] = useState(() => searchParams.get('salaryEmployee') ?? '')
  const [salaryForm, setSalaryForm] = useState<SalaryForm>({
    basic: '', transport: '0', housing: '0', other: '0', effectiveFrom: currentMonthStart, socialSecurityExempt: false, dependants: '0',
  })

  const payroll = useLiveQuery<PayrollCycle>(() => api.get('/payroll/cycle'), [], {
    on: ['employee.changed'],
  })
  const runs = useLiveQuery<{ runs: PayrollRun[] }>(() => api.get('/payroll/runs'), [])
  const settings = useLiveQuery<{ settings: PayrollSettings | null }>(() => api.get('/payroll/settings'), [])
  const auditOverviews = useLiveQuery<{ audits: PayrollAuditOverview[] }>(() => api.get('/payroll/audits'), [])
  const adjustments = useLiveQuery<{ adjustments: PayrollAdjustmentRow[] }>(() => api.get('/payroll/adjustments'), [])
  const people = useLiveQuery<{ employees: Employee[] }>(() => api.get('/employees'), [], { on: ['employee.changed'] })
  const salaryContracts = useLiveQuery<SalaryContractStatuses>(() => api.get('/payroll/salary-contracts'), [], {
    on: ['employee.changed'],
  })
  const salaryHistory = useLiveQuery<{ history: SalaryRecord[] }>(
    () => api.get(`/payroll/salary/${salaryEmployeeId}`),
    [salaryEmployeeId],
    { enabled: Boolean(salaryEmployeeId) },
  )

  const selectedAuditRunId = auditRunId ?? runs.data?.runs.find((run) => run.status === 'draft')?.id ?? runs.data?.runs[0]?.id ?? null
  const audit = useLiveQuery<{ audit: PayrollAudit | null }>(
    () => api.get(`/payroll/runs/${selectedAuditRunId}/audit`),
    [selectedAuditRunId],
    { enabled: Boolean(selectedAuditRunId) },
  )

  const cycle = payroll.data
  const rows = cycle?.rows ?? []

  /**
   * A figure is shown only once the cycle has actually arrived: the currency
   * belongs to the payload, so there is nothing honest to render before it.
   */
  const figure = (pick: (c: PayrollCycle) => number) => {
    if (cycle) return fmt.money(pick(cycle), cycle.currency)
    return payroll.loading ? t('common.loading') : t('common.dash')
  }

  const figureClass = cycle ? 'text-3xl font-bold' : 'text-lg font-medium text-muted'

  async function action(key: string, request: () => Promise<unknown>) {
    setBusy(key)
    setActionError(null)
    try {
      await request()
      payroll.refresh()
      runs.refresh()
      settings.refresh()
      auditOverviews.refresh()
      audit.refresh()
      adjustments.refresh()
      salaryContracts.refresh()
      salaryHistory.refresh()
    } catch (error) {
      setActionError(errorKey(error))
    } finally {
      setBusy(null)
    }
  }

  const currentSettings = settings.data?.settings ?? null
  const adjustmentRows = adjustments.data?.adjustments ?? []
  const currentDraft = runs.data?.runs.find((run) => run.status === 'draft') ?? null
  const activeAudit = audit.data?.audit ?? null
  const urgentOpenFindings = activeAudit?.findings.filter(
    (finding) => finding.status === 'open' && (finding.severity === 'critical' || finding.severity === 'high'),
  ).length ?? 0
  const openFindings = activeAudit?.findings.filter((finding) => finding.status === 'open').length ?? 0
  const pendingAdjustments = adjustmentRows.filter((row) => row.status === 'pending').length
  const salaryEffectiveDefault = firstEditableSalaryDate(runs.data?.runs ?? [], now)
  const activeEmployees = (people.data?.employees ?? []).filter((person) => person.isActive)
  const employeesMissingSalaryContract = (salaryContracts.data?.employees ?? []).filter((person) => !person.hasSalaryContract)
  const selectedSalaryEmployee = activeEmployees.find((person) => person.id === salaryEmployeeId) ?? null
  const latestSalary = salaryHistory.data?.history[0] ?? null
  const adjustmentSection = section === 'earnings' || section === 'overtime' || section === 'bonuses' || section === 'adjustments'
  const visibleAdjustments = adjustmentSection
    ? adjustmentRows.filter((row) => {
        if (section === 'overtime') return row.kind === 'overtime'
        if (section === 'bonuses') return row.kind === 'bonus'
        if (section === 'earnings') return row.kind === 'allowance' || row.kind === 'deduction'
        return true
      })
    : adjustmentRows
  const adjustmentTitle: TKey = section === 'overtime'
    ? 'hrPay.nav.overtime'
    : section === 'bonuses'
      ? 'hrPay.nav.bonuses'
      : section === 'earnings'
        ? 'hrPay.nav.earnings'
        : 'hrPay.nav.adjustments'

  function selectSalaryEmployee(id: string) {
    setSalaryEmployeeId(id)
    setSalaryForm({ basic: '', transport: '0', housing: '0', other: '0', effectiveFrom: salaryEffectiveDefault, socialSecurityExempt: false, dependants: '0' })
  }

  function loadLatestSalary(record: SalaryRecord) {
    setSalaryForm({
      basic: record.basic, transport: record.transport, housing: record.housing, other: record.other,
      effectiveFrom: salaryEffectiveDefault, socialSecurityExempt: record.socialSecurityExempt, dependants: String(record.dependants),
    })
  }

  function openSection(next: PayrollWorkspaceSection) {
    setSection(next)
    if (next === 'overtime' || next === 'bonuses') {
      setAdjustment((current) => ({ ...current, kind: next === 'overtime' ? 'overtime' : 'bonus' }))
      setShowVariablePay(true)
    }
  }

  /* A validated Copilot period arrives as a query parameter. Resolve it to a
     real payroll run only after the runs were loaded; an arbitrary route value
     never becomes an API id. */
  useEffect(() => {
    const period = searchParams.get('period')
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return
    const [year, month] = period.split('-').map(Number)
    const run = runs.data?.runs.find((item) => item.periodYear === year && item.periodMonth === month)
    if (!run) return
    const frame = requestAnimationFrame(() => setAuditRunId(run.id))
    return () => cancelAnimationFrame(frame)
  }, [runs.data?.runs, searchParams])

  /* The assistant changes the route hash for a payroll workspace section.
     This page stays mounted for that change, so the visible section must follow
     the hash instead of relying only on its initial value. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => openSection(sectionFromHash(location.hash)))
    return () => cancelAnimationFrame(frame)
  }, [location.hash])

  function downloadPayrollCsv() {
    if (!cycle) return
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const csv = [
      ['Employee number', 'Employee', 'Net pay', 'Currency', 'Status'].map(quote).join(','),
      ...rows.map((row) => [row.employeeNumber, loc(row.employeeName), row.netPay.toFixed(2), row.currency, row.status].map(quote).join(',')),
    ].join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `payroll-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">{t('section.hr')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t('hrPay.title')}</h2>
        </div>
        <div className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">
          {figure((c) => c.netTotal)}
        </div>
      </div>

      {(payroll.error || runs.error || settings.error || auditOverviews.error || audit.error || adjustments.error || people.error || salaryContracts.error || salaryHistory.error || actionError) && (
        <p role="alert" className="rounded-xl border border-danger/20 bg-red-50 px-3 py-2 text-sm text-danger">
          {t(actionError ?? errorKey(payroll.error ?? runs.error ?? settings.error ?? auditOverviews.error ?? audit.error ?? adjustments.error ?? people.error ?? salaryContracts.error ?? salaryHistory.error))}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={t('hrPay.workspaceNavigation')} className="overflow-x-auto rounded-2xl border border-line bg-surface p-2 xl:sticky xl:top-5 xl:overflow-visible">
          <div className="flex min-w-max gap-1 xl:flex-col">
            {payrollNavigation.map(({ id, label, icon: Icon }) => {
              const active = section === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openSection(id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-paper hover:text-ink'}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{t(label)}</span>
                  {id === 'review' && openFindings > 0 && <span className="ms-auto rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{openFindings}</span>}
                </button>
              )
            })}
          </div>
        </nav>

        <main className="min-w-0 space-y-6">
      {section === 'overview' && <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t('hrPay.net')} icon={Banknote} className="rounded-2xl">
          <p className={figureClass}>{figure((c) => c.netTotal)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrPay.netSub')}</p>
        </Card>
        <Card title={t('hrPay.benefits')} icon={WalletCards} className="rounded-2xl">
          <p className={figureClass}>{figure((c) => c.allowancesTotal)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrPay.benefitsSub')}</p>
        </Card>
        <Card title={t('hrPay.tax')} icon={DollarSign} className="rounded-2xl">
          <p className={figureClass}>{figure((c) => c.deductionsTotal)}</p>
          <p className="mt-2 text-sm text-muted">{t('hrPay.taxSub')}</p>
        </Card>
      </div>

      <Card title={t('hrPay.aiMonitor')} icon={ScanSearch} className="rounded-2xl">
        {openFindings > 0 ? (
          <button type="button" className="w-full rounded-xl border border-danger/20 bg-red-50 px-4 py-3 text-start text-sm font-medium text-danger" onClick={() => openSection('review')}>
            {t('hrPay.reviewAlert', { count: openFindings })}
          </button>
        ) : (
          <p className="text-sm text-muted">{t('hrPay.aiMonitorClear')}</p>
        )}
      </Card>

      <Card title={t('hrPay.agent')} icon={Sparkles} className="overflow-hidden rounded-2xl border-brand/20 bg-gradient-to-br from-brand-soft/70 via-surface to-success-soft/35">
        <div className="relative">
          <span aria-hidden="true" className="absolute -end-10 -top-14 size-40 rounded-full bg-brand/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-[0_10px_25px_rgba(var(--shadow-tint),0.28)]">
              <Sparkles className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">{t('hrPay.agent')}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{t('hrPay.agentSub')}</p>
            </div>
          </div>
          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            {[
              { label: t('hrPay.agentData'), icon: Database },
              { label: t('hrPay.agentAnalysis'), icon: ScanSearch },
              { label: t('hrPay.agentAccess'), icon: ShieldCheck },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-line/80 bg-surface/80 px-3 py-2 text-xs font-medium text-ink shadow-sm">
                <Icon className="size-4 text-brand" aria-hidden="true" />
                {label}
              </div>
            ))}
          </div>
          <div className="relative mt-5">
            <Button type="button" onClick={() => window.dispatchEvent(new CustomEvent('hr:open-copilot', { detail: { variant: 'payroll' } }))}>
              <Sparkles className="size-4" aria-hidden="true" />
              {t('hrPay.agentOpen')}
              <ArrowUpLeft className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>
      </>}

      {section === 'payslips' && <Card title={t('hrPay.nav.payslips')} icon={FileText} className="rounded-2xl">
        <DataTable
          rows={rows}
          /* A person appears once per cycle, so the payday pins the row even as the list reorders. */
          rowKey={(row) => `${row.userId}-${row.paidOn ?? 'unpaid'}`}
          loading={payroll.loading}
          empty={t('common.noData')}
          columns={[
            {
              key: 'employee',
              header: t('table.employee'),
              primary: true,
              cell: (row) => (
                <>
                  <p className="font-medium text-ink">{loc(row.employeeName)}</p>
                  <p className="text-xs font-normal text-muted">{row.employeeNumber}</p>
                </>
              ),
            },
            {
              key: 'amount',
              header: t('table.amount'),
              cell: (row) => <span className="text-muted">{fmt.money(row.netPay, row.currency)}</span>,
            },
            {
              key: 'status',
              header: t('table.status'),
              cell: (row) => {
                const meta = statusMeta[row.status]
                return <Badge tone={meta.tone}>{t(meta.label)}</Badge>
              },
            },
          ]}
        />
      </Card>}

      {section === 'runs' && <Card title={t('hrPay.currentCycle')} icon={ClipboardCheck} className="rounded-2xl">
        <div className="flex flex-col gap-5 rounded-2xl bg-paper p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">
              {currentDraft ? fmt.monthYear(new Date(currentDraft.periodYear, currentDraft.periodMonth - 1, 1)) : t('hrPay.noDraft')}
            </p>
            <p className="mt-1 text-sm text-muted">{t('hrPay.currentCycleSub')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentDraft && <Badge tone="warning">{t('hrPay.runStatus.draft')}</Badge>}
            <Button
              type="button"
              variant={currentDraft ? 'ghost' : 'primary'}
              loading={busy === 'calculate'}
              loadingText={t('common.loading')}
              onClick={() => {
                if (!window.confirm(`${t('hrPay.calculate')}?`)) return
                void action('calculate', async () => {
                  const result = await api.post<{ runId: string }>('/payroll/runs', { year: now.getFullYear(), month: now.getMonth() + 1 })
                  setAuditRunId(result.runId)
                  setShowAuditDetails(false)
                })
              }}
            >
              {currentDraft ? t('hrPay.recalculate') : t('hrPay.calculate')}
            </Button>
            {currentDraft && (
              <Button
                type="button"
                variant="secondary"
                loading={busy === `audit:${currentDraft.id}`}
                loadingText={t('common.loading')}
                onClick={() => {
                  setAuditRunId(currentDraft.id)
                  setShowAuditDetails(true)
                  void action(`audit:${currentDraft.id}`, () => api.post(`/payroll/runs/${currentDraft.id}/audit`, {}))
                }}
              >
                {t('hrPay.analyze')}
              </Button>
            )}
            {currentDraft && (
              <Button
                type="button"
                loading={busy === currentDraft.id}
                loadingText={t('common.loading')}
                onClick={() => {
                  setAuditRunId(currentDraft.id)
                  if (!window.confirm(`${t('hrPay.approve')}?`)) return
                  void action(currentDraft.id, () => api.post(`/payroll/runs/${currentDraft.id}/approve`, {}))
                }}
              >
                {t('hrPay.approve')}
              </Button>
            )}
          </div>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          <li className="rounded-xl border border-line px-4 py-3 text-sm text-muted"><strong className="me-2 text-ink">1.</strong>{t('hrPay.flowCalculate')}</li>
          <li className="rounded-xl border border-line px-4 py-3 text-sm text-muted"><strong className="me-2 text-ink">2.</strong>{t('hrPay.flowAudit')}</li>
          <li className="rounded-xl border border-line px-4 py-3 text-sm text-muted"><strong className="me-2 text-ink">3.</strong>{t('hrPay.flowApprove')}</li>
        </ol>
      </Card>}

      {section === 'review' && <Card
        title={t('hrPay.audit')}
        icon={ScanSearch}
        className="rounded-2xl"
        action={
          selectedAuditRunId ? (
            <Button type="button" variant="secondary" onClick={() => setShowAuditDetails((shown) => !shown)}>
              {showAuditDetails ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
              {t(showAuditDetails ? 'hrPay.hideDetails' : 'hrPay.showDetails')}
            </Button>
          ) : undefined
        }
      >
        {!selectedAuditRunId ? (
          <p className="text-sm text-muted">{t('hrPay.auditNoRun')}</p>
        ) : audit.loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : audit.data?.audit ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
              <div>
                <p className="font-medium text-ink">{t('hrPay.currentAudit')}</p>
                <p className="mt-1 text-sm text-muted">{t('hrPay.auditGate')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={auditTone[audit.data.audit.status]}>{t(`hrPay.auditStatus.${audit.data.audit.status}` as TKey)}</Badge>
                <Badge tone="danger">{t('hrPay.critical')}: {audit.data.audit.findingCounts.critical}</Badge>
                <Badge tone="warning">{t('hrPay.high')}: {audit.data.audit.findingCounts.high}</Badge>
              </div>
            </div>
            {audit.data.audit.findings.length > 0 && !showAuditDetails && (
              <button type="button" className="w-full rounded-xl border border-line px-4 py-3 text-start text-sm font-medium text-brand transition hover:bg-brand-50" onClick={() => setShowAuditDetails(true)}>
                {urgentOpenFindings > 0 ? t('hrPay.urgentFindings', { count: urgentOpenFindings }) : t('hrPay.showDetails')}
              </button>
            )}
            {audit.data.audit.findings.length === 0 ? (
              <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">{t('hrPay.auditClear')}</p>
            ) : (
              <div className={showAuditDetails ? 'space-y-3' : 'hidden'}>
                {audit.data.audit.findings.map((finding) => (
                  <article key={finding.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={findingTone[finding.severity]}>{t(`hrPay.severity.${finding.severity}` as TKey)}</Badge>
                          <Badge tone={finding.status === 'open' ? 'warning' : 'success'}>{t(`hrPay.findingStatus.${finding.status}` as TKey)}</Badge>
                        </div>
                        <p className="mt-3 font-semibold text-ink">{finding.employee ? loc(finding.employee) : t('hrPay.companyCheck')}</p>
                        {finding.employeeNumber && <p className="mt-0.5 text-xs text-muted">{finding.employeeNumber}</p>}
                      </div>
                      {finding.status === 'open' && (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" loading={busy === `review:${finding.id}`} loadingText={t('common.loading')} onClick={() => void action(`review:${finding.id}`, () => api.post(`/payroll/findings/${finding.id}/review`, { status: 'reviewed' }))}>
                            {t('hrPay.review')}
                          </Button>
                          <Button type="button" variant="ghost" loading={busy === `dismiss:${finding.id}`} loadingText={t('common.loading')} onClick={() => void action(`dismiss:${finding.id}`, () => api.post(`/payroll/findings/${finding.id}/review`, { status: 'dismissed' }))}>
                            {t('hrPay.dismiss')}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted">{loc(finding.explanation)}</p>
                    {finding.details.length > 0 && (
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        {finding.details.map((detail) => (
                          <div key={detail.label.en} className="rounded-xl bg-paper px-3 py-2">
                            <dt className="text-xs text-muted">{loc(detail.label)}</dt>
                            <dd className="mt-1 text-sm font-medium text-ink">{detail.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {finding.aiExplanation && <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink">{loc(finding.aiExplanation)}</p>}
                    <Button type="button" variant="ghost" className="mt-3" loading={busy === `explain:${finding.id}`} loadingText={t('common.loading')} onClick={() => void action(`explain:${finding.id}`, () => api.post(`/payroll/findings/${finding.id}/explain`, {}))}>
                      <Sparkles className="size-4" aria-hidden="true" />
                      {t('hrPay.aiExplain')}
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
            <p className="text-sm text-muted">{t('hrPay.auditNeeded')}</p>
            <Button type="button" loading={busy === `audit:${selectedAuditRunId}`} loadingText={t('common.loading')} onClick={() => void action(`audit:${selectedAuditRunId}`, () => api.post(`/payroll/runs/${selectedAuditRunId}/audit`, {}))}>
              {t('hrPay.analyze')}
            </Button>
          </div>
        )}
      </Card>}

      {section === 'salaries' && <Card title={t('hrPay.contractPay')} icon={DollarSign} className="rounded-2xl">
        <p className="mb-4 text-sm text-muted">{t('hrPay.contractPaySub')}</p>
        <section className="mb-5 rounded-2xl border border-line bg-paper p-4" aria-labelledby="salary-contracts-needed">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="salary-contracts-needed" className="text-sm font-semibold text-ink">{t('hrPay.salaryContractsNeeded')}</h3>
              <p className="mt-1 text-sm text-muted">{t('hrPay.salaryContractsNeededSub')}</p>
            </div>
            {salaryContracts.loading ? (
              <span className="text-sm text-muted">{t('common.loading')}</span>
            ) : employeesMissingSalaryContract.length > 0 ? (
              <Badge tone="warning">{employeesMissingSalaryContract.length} · {t('hrPay.salaryContractMissing')}</Badge>
            ) : (
              <Badge tone="success">{t('hrPay.salaryContractsComplete')}</Badge>
            )}
          </div>

          {!salaryContracts.loading && employeesMissingSalaryContract.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {employeesMissingSalaryContract.map((person) => (
                <button
                  key={person.userId}
                  type="button"
                  onClick={() => selectSalaryEmployee(person.userId)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-warning/25 bg-surface px-3 py-2.5 text-start transition-colors hover:border-warning/55 hover:bg-warning-soft/35 focus:outline-none focus:ring-2 focus:ring-brand/35"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{loc(person.employee)}</span>
                    <span className="block truncate text-xs text-muted">{person.employeeNumber}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-warning">{t('hrPay.selectForSalaryContract')}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <label className="grid max-w-xl gap-1 text-sm font-medium text-ink">
          {t('table.employee')}
          <select
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
            value={salaryEmployeeId}
            onChange={(event) => selectSalaryEmployee(event.target.value)}
          >
            <option value="">{t('hrPay.chooseEmployee')}</option>
            {activeEmployees.map((person) => (
              <option key={person.id} value={person.id}>{loc(person.fullName)} — {person.employeeNumber}</option>
            ))}
          </select>
        </label>

        {selectedSalaryEmployee && (
          <form
            className="mt-4 grid gap-3 rounded-2xl bg-paper p-4 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!salaryForm.basic) return
              if (!window.confirm(t('hrPay.saveSalaryConfirm', { name: loc(selectedSalaryEmployee.fullName) }))) return
              void action(`salary:${selectedSalaryEmployee.id}`, () =>
                api.post(`/payroll/salary/${selectedSalaryEmployee.id}`, {
                  ...salaryForm,
                  dependants: Number(salaryForm.dependants),
                }),
              )
            }}
          >
            <label className="grid gap-1 text-sm font-medium text-ink">
              {t('hrPay.basicSalary')}
              <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" inputMode="decimal" value={salaryForm.basic} onChange={(event) => setSalaryForm((current) => ({ ...current, basic: event.target.value }))} placeholder="0.00" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              {t('hrPay.transportAllowance')}
              <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" inputMode="decimal" value={salaryForm.transport} onChange={(event) => setSalaryForm((current) => ({ ...current, transport: event.target.value }))} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              {t('hrPay.housingAllowance')}
              <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" inputMode="decimal" value={salaryForm.housing} onChange={(event) => setSalaryForm((current) => ({ ...current, housing: event.target.value }))} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              {t('hrPay.otherAllowance')}
              <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" inputMode="decimal" value={salaryForm.other} onChange={(event) => setSalaryForm((current) => ({ ...current, other: event.target.value }))} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              {t('hrPay.effectiveOn')}
              <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" type="date" min={salaryEffectiveDefault} value={salaryForm.effectiveFrom} onChange={(event) => setSalaryForm((current) => ({ ...current, effectiveFrom: event.target.value }))} required />
              <span className="text-xs font-normal text-muted">{t('hrPay.salaryEffectiveHint')}</span>
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              {t('hrPay.dependants')}
              <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" type="number" min="0" max="20" value={salaryForm.dependants} onChange={(event) => setSalaryForm((current) => ({ ...current, dependants: event.target.value }))} required />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={salaryForm.socialSecurityExempt} onChange={(event) => setSalaryForm((current) => ({ ...current, socialSecurityExempt: event.target.checked }))} />
              {t('hrPay.socialSecurityExempt')}
            </label>
            <div className="flex items-end">
              <Button type="submit" loading={busy === `salary:${selectedSalaryEmployee.id}`} loadingText={t('common.loading')}>
                {t('hrPay.saveSalary')}
              </Button>
            </div>

            <div className="border-t border-line pt-3 md:col-span-2 xl:col-span-4">
              <p className="mb-2 text-sm font-semibold text-ink">{t('hrPay.salaryHistory')}</p>
              {salaryHistory.loading ? (
                <p className="text-sm text-muted">{t('common.loading')}</p>
              ) : salaryHistory.data?.history.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  {latestSalary && <Button type="button" variant="ghost" onClick={() => loadLatestSalary(latestSalary)}>{t('hrPay.loadLatestSalary')}</Button>}
                  {salaryHistory.data.history.slice(0, 4).map((record) => (
                    <span key={record.id} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">
                      {fmt.money(Number(record.basic) + Number(record.transport) + Number(record.housing) + Number(record.other), record.currency)} · {t('hrPay.effectiveFrom', { date: fmt.date(record.effectiveFrom) })}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">{t('hrPay.noSalaryHistory')}</p>
              )}
            </div>
          </form>
        )}
      </Card>}

      {adjustmentSection && <Card
        title={t(adjustmentTitle)}
        icon={WalletCards}
        className="rounded-2xl"
        action={
          <Button type="button" variant="secondary" onClick={() => setShowVariablePay((shown) => !shown)}>
            {showVariablePay ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            {t(showVariablePay ? 'hrPay.hideDetails' : 'hrPay.manageVariablePay')}
          </Button>
        }
      >
        {showVariablePay ? <>
        <p className="mb-4 text-sm text-muted">{t('hrPay.variablePaySub')}</p>
        <form
          className="grid gap-3 rounded-2xl bg-paper p-4 md:grid-cols-2 xl:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!adjustment.userId || !adjustment.amount || !adjustment.note.trim()) return
            void action('new-adjustment', async () => {
              await api.post('/payroll/adjustments', adjustment)
              setAdjustment((current) => ({ ...current, amount: '', note: '' }))
            })
          }}
        >
          <label className="grid gap-1 text-sm font-medium text-ink">
            {t('table.employee')}
            <select className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" value={adjustment.userId} onChange={(event) => setAdjustment((current) => ({ ...current, userId: event.target.value }))} required>
              <option value="">{t('hrPay.chooseEmployee')}</option>
              {rows.map((row) => <option key={row.userId} value={row.userId}>{loc(row.employeeName)} — {row.employeeNumber}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink">
            {t('hrPay.adjustmentKind')}
            <select className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" value={adjustment.kind} onChange={(event) => setAdjustment((current) => ({ ...current, kind: event.target.value as PayrollAdjustmentRow['kind'] }))}>
              <option value="overtime">{t('hrPay.adjustment.overtime')}</option>
              <option value="bonus">{t('hrPay.adjustment.bonus')}</option>
              <option value="allowance">{t('hrPay.adjustment.allowance')}</option>
              <option value="deduction">{t('hrPay.adjustment.deduction')}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink">
            {t('table.amount')}
            <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" inputMode="decimal" value={adjustment.amount} onChange={(event) => setAdjustment((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink">
            {t('hrPay.effectiveOn')}
            <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" type="date" value={adjustment.effectiveOn} onChange={(event) => setAdjustment((current) => ({ ...current, effectiveOn: event.target.value }))} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink">
            {t('hrPay.adjustmentNote')}
            <input className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" value={adjustment.note} onChange={(event) => setAdjustment((current) => ({ ...current, note: event.target.value }))} required />
          </label>
          <div className="md:col-span-2 xl:col-span-5">
            <Button type="submit" loading={busy === 'new-adjustment'} loadingText={t('common.loading')}>{t('hrPay.addAdjustment')}</Button>
          </div>
        </form>
        <div className="mt-4">
          <DataTable
            rows={visibleAdjustments}
            rowKey={(row) => row.id}
            loading={adjustments.loading}
            empty={t('common.noData')}
            columns={[
              { key: 'employee', header: t('table.employee'), primary: true, cell: (row) => <><p className="font-medium text-ink">{loc(row.employee)}</p><p className="text-xs text-muted">{row.employeeNumber}</p></> },
              { key: 'kind', header: t('hrPay.adjustmentKind'), cell: (row) => t(`hrPay.adjustment.${row.kind}` as TKey) },
              { key: 'amount', header: t('table.amount'), cell: (row) => fmt.money(row.amount, 'JOD') },
              { key: 'status', header: t('table.status'), cell: (row) => <Badge tone={row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : 'neutral'}>{t(`hrPay.adjustmentStatus.${row.status}` as TKey)}</Badge> },
              { key: 'action', header: t('table.action'), action: true, alignEnd: true, cell: (row) => row.status === 'pending' ? <Button type="button" variant="secondary" loading={busy === `adjustment:${row.id}`} loadingText={t('common.loading')} onClick={() => void action(`adjustment:${row.id}`, () => api.post(`/payroll/adjustments/${row.id}/approve`, {}))}>{t('hrPay.approve')}</Button> : <span className="text-muted">{t('common.dash')}</span> },
            ]}
          />
        </div>
        </> : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
            <p className="text-sm text-muted">{t('hrPay.variablePayCollapsed')}</p>
            <Badge tone={pendingAdjustments > 0 ? 'warning' : 'neutral'}>
              {t('hrPay.pendingAdjustments', { count: pendingAdjustments })}
            </Badge>
          </div>
        )}
      </Card>}

      {section === 'runs' && <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card title={t('hrPay.runHistory')} icon={Banknote} className="rounded-2xl">
          <DataTable
            rows={runs.data?.runs ?? []}
            rowKey={(row) => row.id}
            loading={runs.loading}
            empty={t('common.noData')}
            maxHeight="20rem"
            columns={[
              {
                key: 'period',
                header: t('hrPay.title'),
                primary: true,
                cell: (row) => <span className="font-medium text-ink">{fmt.monthYear(new Date(row.periodYear, row.periodMonth - 1, 1))}</span>,
              },
              {
                key: 'status',
                header: t('table.status'),
                cell: (row) => {
                  const meta = runMeta[row.status]
                  return <Badge tone={meta.tone}>{t(meta.label)}</Badge>
                },
              },
              {
                key: 'calculated',
                header: t('hrPay.calculatedAt'),
                cell: (row) => <span className="text-muted">{row.calculatedAt ? fmt.date(row.calculatedAt) : t('common.dash')}</span>,
              },
            ]}
          />
        </Card>

        <Card
          title={t('hrPay.settings')}
          icon={Settings2}
          className="rounded-2xl"
          action={
            currentSettings && !currentSettings.confirmed ? (
              <Button
                type="button"
                variant="secondary"
                loading={busy === 'settings'}
                loadingText={t('common.loading')}
                onClick={() => {
                  if (!window.confirm(`${t('hrPay.confirmSettings')}?`)) return
                  void action('settings', () => api.post(`/payroll/settings/${currentSettings.id}/confirm`, {}))
                }}
              >
                {t('hrPay.confirmSettings')}
              </Button>
            ) : undefined
          }
        >
          {settings.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : currentSettings ? (
            <div className="space-y-3">
              <Badge tone={currentSettings.confirmed ? 'success' : 'warning'}>
                {t(currentSettings.confirmed ? 'hrPay.confirmed' : 'hrPay.unconfirmed')}
              </Badge>
              <p className="text-sm text-muted">{t('hrPay.effectiveFrom', { date: fmt.date(currentSettings.effectiveFrom) })}</p>
              {currentSettings.note && (
                <p className="text-sm text-muted">
                  {isUnconfirmedSeedNote(currentSettings.note) ? t('hrPay.seededNote') : currentSettings.note}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">{t('common.noData')}</p>
          )}
        </Card>
      </div>}

      {section === 'reports' && <Card title={t('hrPay.nav.reports')} icon={BarChart3} className="rounded-2xl">
        <p className="text-sm text-muted">{t('hrPay.reportsSub')}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{t('hrPay.currentCycleExport')}</p>
            <p className="mt-1 text-sm text-muted">{cycle ? fmt.money(cycle.netTotal, cycle.currency) : t('common.noData')}</p>
          </div>
          <Button type="button" disabled={!cycle || rows.length === 0} onClick={downloadPayrollCsv}>
            <FileText className="size-4" aria-hidden="true" />
            {t('hrPay.exportCsv')}
          </Button>
        </div>
      </Card>}
        </main>
      </div>
    </div>
  )
}
