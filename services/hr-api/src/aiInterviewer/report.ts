import { createHash } from 'node:crypto'
import { aiInterviewReportSchema, evaluationReportInputSchema, type AiInterviewReport, type EvaluationReportInput, type AiInterviewAnswer, type AiInterviewDimension,type EvaluationProviderSnapshot } from '@hr/shared'
import { MockEvaluator } from './evaluator.js'
import { canonicalJson } from './evaluationInput.js'
import { verifyProviderReport } from './evaluationReport.js'

export const reportInputHash = (input: EvaluationReportInput) => createHash('sha256').update(canonicalJson(evaluationReportInputSchema.parse(input))).digest('hex')
export const reportDimension = (type: string): AiInterviewDimension => type === 'technical' ? 'technical_accuracy' : type === 'behavioral' ? 'problem_solving' : 'relevance'
export function reportCoverage(criteria: AiInterviewReport['criteriaResults']) {
  const count = (status: string) => criteria.filter(c => c.status === status).length
  const assessed = count('ASSESSED'), partiallyAssessed = count('PARTIALLY_ASSESSED'), notAssessed = count('NOT_ASSESSED')
  return { criteriaTotal: criteria.length, assessed, partiallyAssessed, notAssessed,
    coveragePercent: Math.round(10000 * (assessed + partiallyAssessed) / criteria.length) / 100 }
}
export type ReportIdentity = Pick<AiInterviewReport, 'evaluationId' | 'reportVersion' | 'generatedAt'>
export interface ReportEvaluator {readonly providerSnapshot?:EvaluationProviderSnapshot; evaluateReport(input: Readonly<EvaluationReportInput>, identity: ReportIdentity, context?: { signal: AbortSignal }): unknown | Promise<unknown> }

/** Report adapter over the Phase 1 MockEvaluator, with explicit Unicode fixtures only. */
export class MockReportEvaluator extends MockEvaluator implements ReportEvaluator {
  evaluateReport(input: EvaluationReportInput, identity: ReportIdentity): AiInterviewReport {
    if(input.evaluatorVersion==='llm-report-v1'||input.provider)throw Error('mockEvaluatorModeInvalid')
    const criteriaResults: AiInterviewReport['criteriaResults'] = input.frozen.criteria.map(criterion => {
      const questions = input.questions.filter(q => q.criterionKey === criterion.key)
      const answers = input.answers.filter(a => a.answer.criterionKey === criterion.key)
      const eligible = answers.flatMap(record => {
        const a = record.answer, q = questions.find(q => q.questionId === a.questionId)
        if (!q || a.textSource !== 'final' || a.transcriptionUncertain || a.questionDelivery !== 'complete' || !a.text) return []
        const evaluation = this.evaluate({ ...a, finalizedAt: 0 } as AiInterviewAnswer)
        const dimension = evaluation.dimensions.find(d => d.dimension === q.dimension)!
        // Explicit synthetic multilingual anchors, never language/length/accent heuristics.
        const unicodeStrong = ['نفذت hybrid retrieval وقست recall@5 على أسئلة معلّمة.', 'قست جودة الاسترجاع على أسئلة معلّمة وراجعت الأخطاء.'].includes(a.text)
        const score = unicodeStrong ? 4 : dimension.status === 'assessed' ? dimension.score : null
        return score === null ? [] : [{ record, score, partial: a.text === 'I checked some results.' }]
      })
      const evidence = eligible.flatMap(({ record }) => {
        const a = record.answer
        // Multiple exact spans for the strong fixture. Offsets are always derived from source text.
        const spans = a.text === 'I measured recall@5 on labeled queries and reviewed incorrect retrievals.'
          ? ['I measured recall@5 on labeled queries', 'reviewed incorrect retrievals.'] : [a.text]
        return spans.map((quote, i) => ({ evidenceId: `e:${record.sequence}:${i}`, criterionKey: criterion.key, questionId: a.questionId,
          turnId: a.turnId, eventSequence: record.sequence, quote, source: 'CANDIDATE_FINAL_ANSWER' as const, validationStatus: 'VALID' as const,
          startOffset: a.text.indexOf(quote), endOffset: a.text.indexOf(quote) + quote.length, explanation: 'Exact finalized answer supporting a synthetic rubric anchor.' }))
      })
      const partial = eligible.length > 0 && (eligible.every(a => a.partial) || answers.some(a => !eligible.some(e => e.record.sequence === a.sequence)))
      const status = !eligible.length ? 'NOT_ASSESSED' : partial ? 'PARTIALLY_ASSESSED' : 'ASSESSED'
      const score = eligible.length ? Math.min(...eligible.map(e => e.score)) : null
      const anchors = [...new Set(eligible.map(e => {
        const dimension=questions.find(q=>q.questionId===e.record.answer.questionId)!.dimension
        return `${dimension}: ${e.score}/4 = ${input.frozen.rubric.dimensions.find(d=>d.dimension===dimension)!.anchors[e.score]}`
      }))]
      return { criterionKey: criterion.key, criterionLabel: criterion.label, status,
        score, maxScore: 4,
        rationale: eligible.length ? `Synthetic fixture anchors from the frozen rubric: ${anchors.join('; ')}. The lowest supported anchor (${score}/4) is retained across eligible answers. This is not a real assessment.` : 'Insufficient verified finalized answer evidence for this criterion; no performance score is assigned.',
        evidence, questionIds: [...new Set(eligible.map(e => e.record.answer.questionId))], turnIds: [...new Set(eligible.map(e => e.record.answer.turnId))],
        limitations: [...(!eligible.length ? ['Criterion not sufficiently tested by supported mock evidence.'] : []),
          ...(partial ? ['Only partial criterion coverage is supported.'] : []),
          ...(answers.some(a => a.answer.timedOut) ? ['An answer ended at its time limit; time is not a score penalty.'] : []),
          ...(questions.some(q => q.kind === 'CLARIFICATION') ? ['A clarification was requested; this is not a score penalty.'] : [])] }
    })
    const findings = (strong: boolean) => criteriaResults.filter(c => c.score !== null && (strong ? c.score >= 3 : c.score <= 1)).map(c => ({
      text: strong ? 'The finalized answer supports a strong synthetic rubric anchor.' : 'The finalized answer supports only the lower synthetic rubric anchor.',
      criterionKey: c.criterionKey, evidenceIds: c.evidence.map(e => e.evidenceId),
    }))
    return aiInterviewReportSchema.parse({ ...identity, interviewId: input.interviewId, inputHash: reportInputHash(input), evaluatorVersion: input.evaluatorVersion,
      rubricVersion: input.frozen.rubric.version, status: 'COMPLETED', mode: 'MOCK', criteriaResults, coverage: reportCoverage(criteriaResults),
      overallScore: null, aggregationRule: 'NONE_APPROVED_FOR_0_4', summary: 'Simulated evidence-grounded criterion report for human review. Coverage describes what was tested, not candidate performance.',
      strengths: findings(true), concerns: findings(false), limitations: ['SIMULATED / MOCK EVALUATION — deterministic fixtures, not a real assessment.',
        'No approved aggregation rule maps the frozen 0–4 rubric to an overall score; frozen weights are retained but no aggregate is invented.',
        'Only finalized verified transcripts are eligible. No voice, accent, personality or demographic inference is performed.',
        ...criteriaResults.filter(c => c.status === 'NOT_ASSESSED').map(c => `Coverage gap: ${c.criterionKey}. Absence of testing is not a candidate weakness.`)],
      evidenceValidation: { status: 'VALID', normalization: 'NONE', offsetUnit: 'UTF16_CODE_UNIT', verified: criteriaResults.reduce((n,c) => n + c.evidence.length, 0) } })
  }
}

/** Closed schema + independent source checks. Never persist untrusted evaluator output. */
export function verifyInterviewReport(value: unknown, input: EvaluationReportInput, identity: ReportIdentity): AiInterviewReport {
  const report = aiInterviewReportSchema.parse(value)
  if(input.evaluatorVersion==='llm-report-v1')verifyProviderReport(report,input,identity)
  else if(input.provider||report.mode!=='MOCK'||report.modelAssessment)throw Error('reportModeInvalid')
  if (report.interviewId !== input.interviewId || report.inputHash !== reportInputHash(input) || report.evaluationId !== identity.evaluationId
    || report.reportVersion !== identity.reportVersion || report.generatedAt !== identity.generatedAt || report.evaluatorVersion !== input.evaluatorVersion
    || report.rubricVersion !== input.frozen.rubric.version) throw Error('reportIdentityInvalid')
  if (report.criteriaResults.length !== input.frozen.criteria.length || new Set(report.criteriaResults.map(c => c.criterionKey)).size !== report.criteriaResults.length) throw Error('reportCriteriaInvalid')
  const evidenceIds = new Set<string>()
  const boundary = (s: string, n: number) => n <= 0 || n >= s.length || !(s.charCodeAt(n-1) >= 0xd800 && s.charCodeAt(n-1) <= 0xdbff && s.charCodeAt(n) >= 0xdc00 && s.charCodeAt(n) <= 0xdfff)
  for (const c of report.criteriaResults) {
    const frozen = input.frozen.criteria.find(f => f.key === c.criterionKey)
    if (!frozen || canonicalJson(frozen.label) !== canonicalJson(c.criterionLabel)) throw Error('reportCriterionInvalid')
    for (const e of c.evidence) {
      const record = input.answers.find(r => r.sequence === e.eventSequence)
      const a = record?.answer, q = input.questions.find(q => q.questionId === e.questionId)
      if (!a || !q || e.criterionKey !== c.criterionKey || q.criterionKey !== c.criterionKey || a.criterionKey !== c.criterionKey
        || a.turnId !== e.turnId || a.questionId !== e.questionId || a.textSource !== 'final' || a.transcriptionUncertain || a.questionDelivery !== 'complete'
        || e.endOffset <= e.startOffset || e.endOffset > a.text.length || !boundary(a.text,e.startOffset) || !boundary(a.text,e.endOffset)
        || a.text.slice(e.startOffset,e.endOffset) !== e.quote || evidenceIds.has(e.evidenceId)) throw Error('reportEvidenceInvalid')
      evidenceIds.add(e.evidenceId)
    }
    if (canonicalJson([...new Set(c.evidence.map(e => e.questionId))].sort()) !== canonicalJson([...c.questionIds].sort())
      || canonicalJson([...new Set(c.evidence.map(e => e.turnId))].sort()) !== canonicalJson([...c.turnIds].sort())) throw Error('reportTraceInvalid')
  }
  for (const finding of [...report.strengths, ...report.concerns]) {
    const c = report.criteriaResults.find(c => c.criterionKey === finding.criterionKey)
    if (!c || c.status === 'NOT_ASSESSED' || finding.evidenceIds.some(id => !c.evidence.some(e => e.evidenceId === id))) throw Error('reportFindingInvalid')
  }
  if (canonicalJson(report.coverage) !== canonicalJson(reportCoverage(report.criteriaResults)) || report.evidenceValidation.verified !== evidenceIds.size) throw Error('reportCoverageInvalid')
  return report
}
