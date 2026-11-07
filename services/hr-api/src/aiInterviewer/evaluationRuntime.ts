import { interviewEvaluationConfiguration } from '../env.js'
import { createRegisteredEvaluationProvider } from './evaluationProviders.js'
/** Registration performs no I/O. Existing mock versions always use their original adapter. */
export const interviewEvaluationProvider=createRegisteredEvaluationProvider(interviewEvaluationConfiguration)
