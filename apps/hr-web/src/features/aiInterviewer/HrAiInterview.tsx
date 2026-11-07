import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Check, Copy, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { createAiInterviewSchema, aiInterviewDimensionSchema, type AiInterviewQuestion, type InterviewPlan, type AiInterviewSnapshot } from '@hr/shared'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { api, ApiError } from '@/lib/api'
import { useInterviewCopy } from './copy'
import { interviewTime } from './timer'

type CriterionOption = { key: string; label: { en: string; ar: string } }
type Summary = { interviewId: string; version: number; status: string; language: string; invitationStatus: string; evaluationStatus: string; attempt: number }
const statusLabel = (status: string, ar: boolean) => ({ CREATED: ['Created', 'تم الإنشاء'], READY: ['Ready', 'جاهزة'], ACTIVE: ['Active', 'جارية'], PAUSED: ['Paused', 'متوقفة مؤقتاً'],
  COMPLETED: ['Completed', 'مكتملة'], FAILED: ['Needs attention', 'تحتاج متابعة'], CANCELLED: ['Cancelled', 'ملغاة'], NONE: ['Not issued', 'لم تصدر'], INVITED: ['Invitation sent', 'الدعوة جاهزة'],
  CONSUMED: ['Candidate joined', 'انضم المرشح'], EXPIRED: ['Expired', 'منتهية'], REVOKED: ['Revoked', 'تم إلغاؤها'], NOT_STARTED: ['Not started', 'لم يبدأ'], PENDING: ['Pending', 'قيد الانتظار'], RUNNING: ['In progress', 'جارٍ الإعداد'] }[status]?.[ar ? 1 : 0] ?? status)

export function HrAiInterview({ applicationId }: { applicationId: string }) {
  const { s } = useInterviewCopy()
  const [open, setOpen] = useState(false)
  return <>
    <Button variant="secondary" data-testid="manage-ai-interview" onClick={() => setOpen(true)}><Bot className="size-4" />{s('AI Interview', 'المقابلة الذكية')}</Button>
    <Modal wide open={open} title={s('AI Interview · plan & invitation', 'المقابلة الذكية · الخطة والدعوة')} onClose={() => setOpen(false)}>
      {open && <InterviewManager applicationId={applicationId} />}
    </Modal>
  </>
}

function InterviewManager({ applicationId }: { applicationId: string }) {
  const { lang, s } = useInterviewCopy()
  const base = `/recruitment/applications/${applicationId}/ai-interviews`
  const [latest, setLatest] = useState<Summary | null>(null)
  const [plan, setPlan] = useState<InterviewPlan | null>(null)
  const [criteria, setCriteria] = useState<CriterionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secretLink, setSecretLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [newAttempt, setNewAttempt] = useState(false)
  const active = useRef(true)
  const load = useCallback(async () => {
    try {
      const result = await api.get<{ interviews: Summary[] }>(base)
      if (!active.current) return
      setLatest(result.interviews[0] ?? null)
      if (result.interviews[0]) {
        const detail = await api.get<{ snapshot: AiInterviewSnapshot }>(`${base}/${result.interviews[0].interviewId}`)
        if (active.current) setPlan(detail.snapshot.plan)
      } else {
        const config = await api.get<{ criteria: CriterionOption[] }>(`${base}/configuration`)
        if (active.current) setCriteria(config.criteria)
      }
    } catch (e) {
      if (active.current) setError(e instanceof ApiError && e.code === 'approvedJobDescriptionRequired' ? 'approvedJobDescriptionRequired' : 'requestFailed')
    } finally { if (active.current) setLoading(false) }
  }, [base])
  useEffect(() => { active.current = true; const first = window.setTimeout(() => void load(), 0); const id = window.setInterval(() => void load(), 4000); return () => { active.current = false; window.clearTimeout(first); window.clearInterval(id) } }, [load])
  useEffect(() => { if (!secretLink) return; const id = window.setTimeout(() => setSecretLink(null), 60_000); return () => window.clearTimeout(id) }, [secretLink])
  async function action(name: 'ready' | 'invitation' | 'revoke-invitation' | 'cancel') {
    if (!latest || busy) return
    setBusy(true); setError(null); setCopied(false)
    if (name !== 'invitation') setSecretLink(null)
    try {
      const result = await api.post<{ token?: string | null }>(`${base}/${latest.interviewId}/${name}`, { commandId: crypto.randomUUID(), expectedVersion: latest.version })
      if (name === 'invitation' && result.token) {
        const url = new URL('/interview/join', window.location.origin); url.searchParams.set('token', result.token)
        setSecretLink(url.toString())
      }
      await load()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'stateReconciled' : 'requestFailed'); await load()
    } finally { setBusy(false) }
  }
  async function copy() {
    if (!secretLink) return
    try { await navigator.clipboard.writeText(secretLink); setSecretLink(null); setCopied(true) } catch { setError('clipboardUnavailable') }
  }
  async function beginAnother() {
    try { setCriteria((await api.get<{ criteria: CriterionOption[] }>(`${base}/configuration`)).criteria); setNewAttempt(true) }
    catch { setError('approvedJobDescriptionRequired') }
  }
  if (loading) return <p className="p-8 text-center text-sm text-muted">{s('Loading interview…', 'جارٍ تحميل المقابلة…')}</p>
  return <div className="max-h-[75dvh] space-y-5 overflow-y-auto px-1 pb-2" data-testid="hr-ai-panel">
    {error && <Alert tone="danger">{error === 'approvedJobDescriptionRequired' ? s('Approve a job description for this opening before preparing an AI interview.', 'اعتمد الوصف الوظيفي لهذا الشاغر قبل إعداد المقابلة الذكية.')
      : error === 'stateReconciled' ? s('The status changed. The latest version is loaded; review before trying again.', 'تغيرت الحالة. تم تحميل آخر نسخة؛ راجعها قبل المحاولة مجدداً.')
        : error === 'clipboardUnavailable' ? s('Clipboard access is unavailable. Allow clipboard access, then copy again.', 'النسخ غير متاح. اسمح بالوصول إلى الحافظة ثم حاول مجدداً.') : s('Could not complete the request. Refresh the status and try again.', 'تعذر إكمال الطلب. حدّث الحالة وحاول مجدداً.')}</Alert>}
    {latest && !newAttempt ? <>
      <div className="grid gap-3 sm:grid-cols-3">{[[s('Interview', 'المقابلة'), latest.status], [s('Invitation', 'الدعوة'), latest.invitationStatus], [s('Evaluation', 'التقييم'), latest.evaluationStatus]].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-paper p-4"><p className="text-xs text-muted">{label}</p><p data-testid={label === s('Interview', 'المقابلة') ? 'hr-interview-status' : undefined} data-status={value} className="mt-2 font-semibold text-ink">{statusLabel(value!, lang === 'ar')}</p></div>)}</div>
      <p className="text-sm text-muted">{s('Language', 'اللغة')}: {latest.language === 'mixed' ? s('Arabic & English', 'العربية والإنجليزية') : latest.language === 'ar' ? s('Arabic', 'العربية') : s('English', 'الإنجليزية')} · {s('Attempt', 'المحاولة')} {latest.attempt}</p>
      <div className="flex flex-wrap gap-2">
        {latest.status === 'COMPLETED' && <Link data-testid="open-evaluation-report" to={`/hr/recruitment/applications/${applicationId}/ai-interviews/${latest.interviewId}/report`} className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white">{s('Evaluation & human review', 'التقييم والمراجعة البشرية')}</Link>}
        {latest.status === 'CREATED' && <Button data-testid="freeze-interview" loading={busy} onClick={() => void action('ready')}><ShieldCheck className="size-4" />{s('Approve & make ready', 'اعتماد وتجهيز المقابلة')}</Button>}
        {['READY', 'PAUSED'].includes(latest.status) && <Button data-testid="generate-invitation" loading={busy} onClick={() => void action('invitation')}>{s('Generate invitation', 'إنشاء دعوة')}</Button>}
        {latest.invitationStatus !== 'NONE' && latest.invitationStatus !== 'REVOKED' && <Button variant="secondary" disabled={busy} onClick={() => void action('revoke-invitation')}>{s('Revoke invitation', 'إلغاء الدعوة')}</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw className="size-3.5" />{s('Refresh status', 'تحديث الحالة')}</Button>
        {!['COMPLETED', 'CANCELLED'].includes(latest.status) && <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(s('Cancel this AI interview?', 'إلغاء هذه المقابلة الذكية؟'))) void action('cancel') }}>{s('Cancel interview', 'إلغاء المقابلة')}</Button>}
        {['COMPLETED', 'CANCELLED'].includes(latest.status) && <Button variant="secondary" onClick={() => void beginAnother()}>{s('New attempt', 'محاولة جديدة')}</Button>}
      </div>
      {secretLink && <div className="rounded-xl border border-brand/20 bg-brand-50 p-4"><p className="text-sm font-semibold text-ink">{s('Your private invitation is ready.', 'الدعوة الخاصة جاهزة.')}</p><p className="mt-1 text-xs leading-6 text-muted">{s('Copy it now and share it privately with this candidate. It is shown only once and clears from this panel after a minute.', 'انسخ الدعوة الآن وشاركها مع هذا المرشح فقط. تتاح مرة واحدة وتُزال من هذه اللوحة بعد دقيقة.')}</p><Button data-testid="copy-invitation" className="mt-3" onClick={() => void copy()}><Copy className="size-4" />{s('Copy invitation link', 'نسخ رابط الدعوة')}</Button></div>}
      {copied && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700"><Check className="size-4" />{s('Invitation copied. Share it privately with the candidate.', 'تم نسخ الدعوة. شاركها مع المرشح بشكل خاص.')}</p>}
      <div className="space-y-3">{plan?.questions.map((q, i) => <div key={q.id} className="rounded-xl border border-line p-4"><p className="text-xs font-semibold text-brand">{s('Question', 'السؤال')} {i + 1}</p><p dir="auto" className="mt-2 text-sm font-medium text-ink">{q.prompt}</p><p className="mt-2 text-xs leading-6 text-muted">{s('Answer', 'الإجابة')} {interviewTime(q.answerTimeLimitSec * 1000)} · {s('Warning', 'التنبيه')} {interviewTime(q.warningAtSec * 1000)} · {s('Grace', 'المهلة الإضافية')} {interviewTime(q.gracePeriodSec * 1000)} · {s('Follow-ups', 'المتابعات')} {q.maxFollowUps}</p></div>)}</div>
      <p className="text-xs leading-6 text-muted">{s('Detailed evaluation and human review are handled separately. This panel shows operational status only.', 'التقييم التفصيلي والمراجعة البشرية منفصلان. تعرض هذه اللوحة الحالة التشغيلية فقط.')}</p>
    </> : criteria.length > 0 ? <PlanForm criteria={criteria} base={base} onCreated={() => { setNewAttempt(false); void load() }} /> : <p className="text-sm text-muted">{s('No approved job criteria are available.', 'لا توجد معايير وظيفية معتمدة.')}</p>}
  </div>
}

function PlanForm({ criteria, base, onCreated }: { criteria: CriterionOption[]; base: string; onCreated: () => void }) {
  const { s, loc } = useInterviewCopy()
  const [language, setLanguage] = useState<InterviewPlan['language']>('mixed')
  const seq = useRef(2)
  function question(n: number): AiInterviewQuestion {
    const criterion = criteria[Math.min(n - 1, criteria.length - 1)]!
    return { id: `q${n}`, criterionKey: criterion.key, type: n === 1 ? 'technical' : 'behavioral', order: n,
      prompt: n === 1 ? `Tell me about your experience with ${criterion.label.en}.` : 'Describe how you approached a difficult engineering decision.',
      answerTimeLimitSec: n === 1 ? 180 : 120, warningAtSec: 30, gracePeriodSec: 15,
      maxFollowUps: n === 1 ? 2 : 0, followUpTimeLimitSec: 60, maxClarifications: 1, clarificationTimeLimitSec: 30,
      silenceThresholdSec: 0, silenceAction: 'CLARIFY_OR_NEXT', allowBargeIn: true,
      followUps: n === 1 ? [{ id: 'f1', prompt: 'How did you evaluate retrieval quality?' }, { id: 'f2', prompt: 'Which trade-offs did you test?' }] : [],
      clarifications: [{ id: 'c1', prompt: 'Please describe a concrete measurement and what you learned from it.' }] }
  }
  const [questions, setQuestions] = useState<AiInterviewQuestion[]>(() => [question(1), question(2)])
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const edit = (index: number, update: Partial<AiInterviewQuestion>) => setQuestions(old => old.map((q, i) => i === index ? { ...q, ...update } : q))
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    const body = createAiInterviewSchema.safeParse({ commandId: crypto.randomUUID(),
      plan: { id: `plan-${crypto.randomUUID()}`, version: 1, language, type: questions[0]!.type,
        introduction: s('Welcome. We will explore your experience one question at a time. You may pause when needed.', 'أهلاً بك. سنتحدث عن خبراتك بسؤال واحد في كل مرة. يمكنك التوقف مؤقتاً عند الحاجة.'),
        closing: s('Thank you for sharing your experience. Your answers have been received for human review.', 'شكراً لمشاركة خبراتك. تم استلام إجاباتك للمراجعة البشرية.'), questions: questions.map((q, i) => ({ ...q, order: i + 1 })) },
      rubric: { version: 'phase3-mock-v1', dimensions: aiInterviewDimensionSchema.options.map(dimension => ({ dimension, anchors: ['No evidence', 'Basic', 'Partial', 'Applied', 'Explained trade-offs'] })) } })
    if (!body.success) { setError(s('Review the question settings. Prompts are required, warning must fit the answer time, and limits must stay within the displayed ranges.', 'راجع إعدادات الأسئلة. نص السؤال مطلوب، والتنبيه لا يتجاوز وقت الإجابة، والقيم ضمن الحدود المعروضة.')); return }
    setBusy(true)
    try { await api.post(base, body.data); onCreated() } catch { setError(s('Could not save the interview. Refresh and check your access or the job description.', 'تعذر حفظ المقابلة. حدّث الصفحة وتحقق من صلاحياتك والوصف الوظيفي.')) } finally { setBusy(false) }
  }
  return <form onSubmit={e => void submit(e)} className="space-y-5" data-testid="interview-plan-form">
    <p className="text-sm leading-7 text-muted">{s('Prepare a focused interview using the approved job criteria. Review each question and its follow-up prompts before approving the plan.', 'أعد مقابلة مركزة باستخدام معايير الوظيفة المعتمدة. راجع كل سؤال وأسئلة المتابعة قبل اعتماد الخطة.')}</p>
    <label className="block text-sm font-medium">{s('Interview language', 'لغة المقابلة')}<select data-testid="plan-language" value={language} onChange={e => setLanguage(e.target.value as InterviewPlan['language'])} className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3"><option value="en">English</option><option value="ar">العربية</option><option value="mixed">Arabic & English · العربية والإنجليزية</option></select></label>
    {questions.map((q, i) => <fieldset key={q.id} className="space-y-4 rounded-2xl border border-line bg-paper p-4 sm:p-5"><legend className="px-2 text-sm font-semibold">{s('Question', 'السؤال')} {i + 1}</legend>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">{s('Job requirement', 'معيار الوظيفة')}<select aria-label={`Requirement ${i + 1}`} value={q.criterionKey} onChange={e => edit(i, { criterionKey: e.target.value })} className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3">{criteria.map(c => <option key={c.key} value={c.key}>{loc(c.label)}</option>)}</select></label>
        <label className="text-sm">{s('Question type / time preset', 'نوع السؤال / وقت مقترح')}<select aria-label={`Question type ${i + 1}`} value={q.type} onChange={e => { const type = e.target.value as AiInterviewQuestion['type']; edit(i, { type, answerTimeLimitSec: type === 'technical' ? 180 : type === 'behavioral' ? 120 : 90, warningAtSec: 30, gracePeriodSec: 15 }) }} className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3">{(['technical', 'behavioral', 'experience', 'job_specific'] as const).map(type => <option key={type} value={type}>{type === 'technical' ? s('Technical · 03:00', 'تقني · 03:00') : type === 'behavioral' ? s('Behavioral · 02:00', 'سلوكي · 02:00') : type === 'experience' ? s('Experience · 01:30', 'خبرات · 01:30') : s('Job specific · 01:30', 'خاص بالوظيفة · 01:30')}</option>)}</select></label></div>
      <label className="block text-sm">{s('Question prompt', 'نص السؤال')}<textarea aria-label={`Question prompt ${i + 1}`} rows={2} value={q.prompt} onChange={e => edit(i, { prompt: e.target.value })} required maxLength={4000} dir="auto" className="mt-2 w-full rounded-lg border border-line bg-surface p-3 text-sm leading-6" /></label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([
        ['answerTimeLimitSec', s('Answer time (sec)', 'وقت الإجابة (ثانية)'), 1, 1800], ['warningAtSec', s('Warning: remaining (sec)', 'التنبيه: الوقت المتبقي'), 0, 1800],
        ['gracePeriodSec', s('Speaking grace (sec)', 'مهلة المتحدث (ثانية)'), 0, 120], ['maxFollowUps', s('Max follow-ups', 'الحد الأقصى للمتابعات'), 0, 5],
        ['followUpTimeLimitSec', s('Follow-up time (sec)', 'وقت المتابعة (ثانية)'), 1, 1800], ['maxClarifications', s('Max clarifications', 'الحد الأقصى للتوضيحات'), 0, 3],
        ['clarificationTimeLimitSec', s('Clarification time (sec)', 'وقت التوضيح (ثانية)'), 1, 1800],
      ] as const).map(([field, label, min, max]) => <Input key={field} label={label} aria-label={`${field} ${i + 1}`} type="number" min={min} max={max} required value={q[field]} onChange={e => {
        const value = Number(e.target.value)
        const extra = field === 'maxFollowUps' ? { followUps: Array.from({ length: Math.max(0, Math.min(5, value)) }, (_, j) => q.followUps[j] ?? { id: `f${j + 1}`, prompt: 'What did you measure, and what did you learn?' }) }
          : field === 'maxClarifications' ? { clarifications: Array.from({ length: Math.max(0, Math.min(3, value)) }, (_, j) => q.clarifications[j] ?? { id: `c${j + 1}`, prompt: 'Please clarify your answer with a concrete example.' }) } : {}
        edit(i, { [field]: value, ...extra })
      }} />)}</div>
      <p className="text-xs text-muted">{s('Answer', 'الإجابة')} {interviewTime(q.answerTimeLimitSec * 1000)} · {s('Warning in the last', 'التنبيه في آخر')} {interviewTime(q.warningAtSec * 1000)} · {s('Grace while speaking', 'مهلة أثناء الكلام')} {interviewTime(q.gracePeriodSec * 1000)}</p>
      {(['followUps', 'clarifications'] as const).map(field => q[field].map((p, j) => <Input key={`${field}:${p.id}`} label={`${field === 'followUps' ? s('Approved follow-up', 'سؤال المتابعة المعتمد') : s('Approved clarification', 'التوضيح المعتمد')} ${j + 1}`} value={p.prompt} maxLength={4000} required onChange={e => edit(i, { [field]: q[field].map((old, n) => n === j ? { ...old, prompt: e.target.value } : old) })} />))}
      <div className="flex flex-wrap gap-3">{import.meta.env.DEV && import.meta.env.VITE_AI_INTERVIEW_DEV_MOCK === 'true' && <button type="button" className="text-xs font-semibold text-brand underline underline-offset-4" onClick={() => edit(i, { answerTimeLimitSec: 12, warningAtSec: 5, gracePeriodSec: 4, followUpTimeLimitSec: 10, clarificationTimeLimitSec: 8 })}>{s('Use explicit short demo timings', 'استخدام أوقات قصيرة للتجربة')}</button>}{questions.length > 1 && <button type="button" className="ms-auto flex items-center gap-1 text-xs text-danger" onClick={() => setQuestions(old => old.filter((_, n) => n !== i))}><Trash2 className="size-3" />{s('Remove question', 'حذف السؤال')}</button>}</div>
    </fieldset>)}
    {error && <Alert tone="danger">{error}</Alert>}
    <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" type="button" disabled={questions.length >= 30 || busy} onClick={() => { seq.current++; setQuestions(old => [...old, question(seq.current)]) }}><Plus className="size-4" />{s('Add question', 'إضافة سؤال')}</Button><Button type="submit" data-testid="create-ai-interview" loading={busy}><Bot className="size-4" />{s('Create AI interview', 'إنشاء المقابلة الذكية')}</Button></div>
  </form>
}
