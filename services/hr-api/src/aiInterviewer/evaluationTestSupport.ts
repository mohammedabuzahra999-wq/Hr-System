import {randomUUID} from 'node:crypto'
import {aiInterviewDimensionSchema,evaluationReportInputSchema} from '@hr/shared'
import {parseEvaluationConfiguration,evaluationProviderSnapshot} from './evaluationConfiguration.js'
export const syntheticEvaluationConfig=()=>parseEvaluationConfiguration({NODE_ENV:'test',AI_INTERVIEW_EVALUATION_ENABLED:'true',AI_INTERVIEW_EVALUATION_PROVIDER:'synthetic'})
export function evaluationFixture(){
 const text='I measured recall@5 on labeled queries and reviewed incorrect retrievals.'
 return evaluationReportInputSchema.parse({format:'ai-interview-report-input-v1',interviewId:randomUUID(),interviewVersion:20,lastIncludedSequence:21,evaluatorVersion:'llm-report-v1',provider:evaluationProviderSnapshot(syntheticEvaluationConfig()),
 frozen:{configVersion:'phase2-mock-v1',evaluatorVersion:'mock-v1',jobDescriptionId:randomUUID(),rubric:{version:'approved-test-v1',dimensions:aiInterviewDimensionSchema.options.map(dimension=>({dimension,anchors:['Absent','Basic','Partial','Applied','Explained']}))},criteria:[{id:'rag',key:'rag',label:{en:'RAG',ar:'RAG'},kind:'skill',weight:100,custom:false},{id:'gap',key:'gap',label:{en:'Untested',ar:'Untested'},kind:'skill',weight:0,custom:false}],weights:[{key:'rag',weight:100},{key:'gap',weight:0}]},
 questions:[{questionId:'q1',baseQuestionId:'q1',criterionKey:'rag',prompt:'How did you evaluate retrieval?',type:'technical',kind:'BASE',dimension:'technical_accuracy'}],
 answers:[{sequence:10,answer:{questionId:'q1',baseQuestionId:'q1',turnId:'turn1',criterionKey:'rag',text,textSource:'final',endReason:'SUBMITTED',timedOut:false,transcriptionUncertain:false,questionDelivery:'complete'}}]})
}
