import { interviewLlmConfiguration } from '../env.js'
import { createInterviewLlmProvider } from './llmProviders.js'
export const interviewLlmProvider=createInterviewLlmProvider(interviewLlmConfiguration)
