// Reuse the entire Phase 3 real browser lifecycle and add HR evaluation cases.
process.env.PHASE4_REPORT_TESTS = 'true'
await import('./checkAiInterviewBrowser.mjs')
