/**
 * The contract between the API and the web app.
 *
 * Both sides import these schemas, so a payload that one side sends is the
 * payload the other side validates — a field cannot drift on one side only.
 * Types are inferred from the schemas rather than declared twice.
 *
 * Relative imports carry `.js` extensions: Node's ESM resolution requires them,
 * and the bundler on the web side resolves them back to the `.ts` sources.
 */
export * from './primitives.js'
export * from './actions.js'
export * from './auth.js'
export * from './attendance.js'
export * from './leave.js'
export * from './people.js'
export * from './guide.js'
export * from './navigation.js'
export * from './lookup.js'
export * from './payroll.js'
export * from './recruitment.js'
export * from './copilot.js'
export * from './voice.js'
export * from './aiInterview.js'
export * from './aiInterviewPersistence.js'
export * from './aiInterviewUi.js'
export * from './reports.js'
export * from './screening.js'
export * from './scorecard.js'
export * from './jobDescriptions.js'
export * from './feed.js'
export * from './calendar.js'
export * from './events.js'
export * from './knowledge.js'
export * from './assistantReview.js'
export * from './hrAttention.js'
export * from './aiInterviewReport.js'
export * from './aiInterviewAnswer.js'
export * from './aiInterviewAudio.js'
export * from './aiInterviewPlayback.js'
export * from './aiInterviewLlm.js'
export * from './aiInterviewEvaluationProvider.js'
