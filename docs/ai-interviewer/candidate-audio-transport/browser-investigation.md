# Phase 3 warning/grace observation

The first final-run Phase 3 browser attempt failed at 20/21, in the unchanged
`Warning and grace are backend-authoritative` assertion. Preserve these files:

- `runs/final-20261105/browser3.json` and `browser3.log`
- `runs/final-20261105/browser/browser3/ai-interviewer-phase3/browser-results.json`

Its diagnostic says: one intercepted command during the attempted Start speaking;
server version 24, phase LISTENING, speaking=false, remaining=9820ms after the
20-second observation wait. The prior stale-version reconciliation assertion
passed. This is the same assertion family that failed in the accepted speech-layer
run before this task; that historical evidence remains unchanged.

Inspection: the preceding assertion intentionally changes one expectedVersion,
expects a conflict, and waits for the reconciliation notice. The next assertion
clicks Start speaking once and waits for the speaking UI. The mock control uses
the current server turn/version; server conflicts reconcile without automatic
retry. Background server deadlines and browser/CDP/render timing can affect this
sequence. These are possible factors, not a demonstrated cause of this failure.

A separate diagnostic copy ran all 44 original assertions, waits and commands
without modification and **passed 44/44**. Only extra metadata observation was
added; it can itself affect timing. Its trace is in:

`runs/browser-recheck-20261105/browser/browser-diagnostics/ai-interviewer-phase3/metadata-trace.json`

The trace contains only time/method/path/status/command type/expected version and
returned version/phase/speaking/error code. No answer text, invite/session secret,
provider credential or raw response body is retained. It records the intentionally
stale speech-start request returning 409, a reconciled version 23, then the next
speech-start request returning 200/version 24/speaking=true. Thus that diagnostic
attempt did not reproduce the original failure. It cannot establish what happened
to the untraced original command.

An isolated execution of the original, unmodified Phase 3 browser entry is recorded
separately in `runs/browser-recheck-20261105/browser3.json`; the final report uses
only its completed result. No test wait, expected result, application timer or
mock behavior was loosened. Full assertion results and the original failed attempt
remain visible. **No proven root cause or stability fix is claimed.**
