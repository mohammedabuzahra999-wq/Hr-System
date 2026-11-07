// Additive opt-in cases. All original Phase 3 assertions still run unchanged.
process.env.PHASE52_ANSWER_TESTS = 'true'
if (!process.env.PHASE52_OUTPUT) throw Error('Run through docs/ai-interviewer/phase-5.2/run.mjs to preserve previous browser evidence')
await import('./checkAiInterviewBrowser.mjs')
