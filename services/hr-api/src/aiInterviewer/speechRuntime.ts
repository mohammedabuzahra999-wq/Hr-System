import { interviewSpeechConfiguration } from '../env.js'
import { createInterviewSpeechProviders } from './speechProviders.js'

/** One server-owned registry. Registration alone never probes a provider or enables candidate delivery. */
export const interviewSpeechProviders = createInterviewSpeechProviders(interviewSpeechConfiguration)
