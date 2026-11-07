import { aiInterviewReportSchema,evaluationProviderOutputSchema,type EvaluationReportInput,type EvaluationProviderOutput,type AiInterviewReport } from '@hr/shared'
import { canonicalJson } from './evaluationInput.js'
import { reportCoverage,reportInputHash,MockReportEvaluator,type ReportIdentity } from './report.js'

export function syntheticEvaluationSelection(input:EvaluationReportInput):EvaluationProviderOutput{
  const {provider:_provider,...legacy}=input
  const report=new MockReportEvaluator().evaluateReport({...legacy,evaluatorVersion:'mock-report-v1'},{evaluationId:input.interviewId,reportVersion:1,generatedAt:new Date(0).toISOString()})
  return {criteria:report.criteriaResults.map(c=>{const q=input.questions.find(q=>q.questionId===c.evidence[0]?.questionId),dimension=q?.dimension
    if(c.evidence.some(e=>input.questions.find(q=>q.questionId===e.questionId)?.dimension!==dimension))return {criterionKey:c.criterionKey,anchor:null,citations:[]}
    return {criterionKey:c.criterionKey,anchor:c.score!==null&&dimension?{dimension,score:c.score,text:input.frozen.rubric.dimensions.find(d=>d.dimension===dimension)!.anchors[c.score]!}:null,
      citations:c.evidence.map(e=>({eventSequence:e.eventSequence,startOffset:e.startOffset,endOffset:e.endOffset,quote:e.quote}))}
  })}
}

/** Model chooses only exact source spans and approved anchors. Narrative is server-owned. */
export function buildProviderReport(raw:unknown,input:EvaluationReportInput,identity:ReportIdentity):AiInterviewReport{
  const selection=evaluationProviderOutputSchema.parse(raw),provider=input.provider
  if(input.evaluatorVersion!=='llm-report-v1'||!provider||selection.criteria.length!==input.frozen.criteria.length||new Set(selection.criteria.map(c=>c.criterionKey)).size!==selection.criteria.length)throw Error('evaluationProviderInputInvalid')
  const criteriaResults:AiInterviewReport['criteriaResults']=input.frozen.criteria.map(criterion=>{
    const claim=selection.criteria.find(c=>c.criterionKey===criterion.key)
    if(!claim||(!claim.anchor)!==(claim.citations.length===0))throw Error('evaluationSupportMissing')
    const anchor=claim.anchor
    if(anchor&&input.frozen.rubric.dimensions.find(d=>d.dimension===anchor.dimension)?.anchors[anchor.score]!==anchor.text)throw Error('evaluationRubricInvalid')
    const seen=new Set<string>()
    const evidence=claim.citations.map((citation,index)=>{
      const record=input.answers.find(a=>a.sequence===citation.eventSequence),a=record?.answer,q=a&&input.questions.find(q=>q.questionId===a.questionId)
      const boundary=(s:string,n:number)=>n<=0||n>=s.length||!(s.charCodeAt(n-1)>=0xd800&&s.charCodeAt(n-1)<=0xdbff&&s.charCodeAt(n)>=0xdc00&&s.charCodeAt(n)<=0xdfff)
      const key=`${citation.eventSequence}:${citation.startOffset}:${citation.endOffset}`
      if(!a||!q||q.criterionKey!==criterion.key||a.criterionKey!==criterion.key||q.dimension!==anchor?.dimension||a.textSource!=='final'||a.transcriptionUncertain||a.questionDelivery!=='complete'||!a.text.trim()||!citation.quote.trim()
        ||citation.endOffset<=citation.startOffset||citation.endOffset>a.text.length||!boundary(a.text,citation.startOffset)||!boundary(a.text,citation.endOffset)||a.text.slice(citation.startOffset,citation.endOffset)!==citation.quote||seen.has(key))throw Error('evaluationCitationInvalid')
      seen.add(key)
      return {...citation,evidenceId:`llm:${input.frozen.criteria.indexOf(criterion)}:${index}`,criterionKey:criterion.key,questionId:a.questionId,turnId:a.turnId,source:'CANDIDATE_FINAL_ANSWER' as const,validationStatus:'VALID' as const,
        explanation:'Exact source quote for a proposed rubric anchor; HR must assess relevance and the model judgment.'}
    })
    const questions=input.questions.filter(q=>q.criterionKey===criterion.key),covered=new Set(evidence.map(e=>e.questionId))
    const status=!anchor?'NOT_ASSESSED':questions.some(q=>!covered.has(q.questionId))?'PARTIALLY_ASSESSED':'ASSESSED'
    return {criterionKey:criterion.key,criterionLabel:criterion.label,status,score:anchor?.score??null,maxScore:4,
      rationale:anchor?`Proposed ${anchor.dimension} rubric anchor: ${anchor.score}/4 = ${anchor.text}. Source quotes are verified; this rating is a model judgment requiring HR review.`:'Insufficient supported finalized evidence; NOT_ASSESSED, no performance score assigned.',
      evidence,questionIds:[...covered],turnIds:[...new Set(evidence.map(e=>e.turnId))],
      limitations:anchor?['Exact quote validation establishes provenance, not semantic correctness of the proposed rating.',...(status==='PARTIALLY_ASSESSED'?['Some questions lack cited evidence; coverage is partial.']:[])]:['Missing/insufficient evidence is not a zero score or candidate weakness.']}
  })
  return aiInterviewReportSchema.parse({...identity,interviewId:input.interviewId,inputHash:reportInputHash(input),evaluatorVersion:input.evaluatorVersion,rubricVersion:input.frozen.rubric.version,status:'COMPLETED',mode:provider.provider==='synthetic'?'LLM_SYNTHETIC':'LLM',
    modelAssessment:{contract:'evidence-rubric-selection-v1',provider,selection},criteriaResults,coverage:reportCoverage(criteriaResults),overallScore:null,aggregationRule:'NONE_APPROVED_FOR_0_4',
    summary:'Evidence-linked rubric proposals for HR decision support. Verified quotes do not prove the model rating; no hiring or rejection decision is made.',strengths:[],concerns:[],
    limitations:[...(provider.provider==='synthetic'?['SYNTHETIC LLM EVALUATION — deterministic fixtures, no real model assessment.']:['LLM EVALUATION — proposed ratings require independent HR review.']),
      'No approved aggregate; no automatic hiring/rejection or application status change.',
      'Only finalized, certain transcripts of completed questions are eligible; missing, uncertain or incomplete evidence is not penalized.',
      'No inference about voice, accent, personality, protected traits or demographics is supported.'],
    evidenceValidation:{status:'VALID',normalization:'NONE',offsetUnit:'UTF16_CODE_UNIT',verified:criteriaResults.reduce((n,c)=>n+c.evidence.length,0)}})
}
export function verifyProviderReport(report:AiInterviewReport,input:EvaluationReportInput,identity:ReportIdentity){
  if(!report.modelAssessment||canonicalJson(report.modelAssessment.provider)!==canonicalJson(input.provider)||canonicalJson(report)!==canonicalJson(buildProviderReport(report.modelAssessment.selection,input,identity)))throw Error('evaluationReportFabricated')
}
