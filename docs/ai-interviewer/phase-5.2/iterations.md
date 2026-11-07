# Phase 5.2 implementation iterations

These are development findings, not waived regression failures. Original Phase
1–4 assertions were not removed or weakened. Final results are recorded under
`runs/final-20261103-verified-2`; development outputs are kept for traceability.

- Initial compile checks identified unsupported TypeScript parameter-property
  syntax in the new web controller (the web project enables erasableSyntaxOnly)
  and missing required synthetic fixture fields. The new implementation/test
  fixture were corrected; no compiler setting or existing test changed.
- The new recovery suite found that malformed JSON was ignored without removing
  the storage record. The controller now purges malformed records before display.
- Security/lifecycle review added a fixed local session-expiry boundary, late
  response fencing after room unmount, and tests for both. An offline stale state
  cannot renew the local recovery lifetime.
- Concurrency review found a client-side risk when retry/review overlaps a
  background status query: a delayed old outcome could replace a newer local
  state. Reconciliation now shares its in-flight promise, and transmit/review/
  commit retire older response generations. Two new deferred-response tests
  prove serialization and preservation of explicitly reviewed draft text.
- `development-1`: initial 20 recovery, 26 PostgreSQL answer and 51 browser checks
  passed. The browser count was the unchanged 44 plus seven initial new cases.
  Subsequent cases added per-transition DB metadata, in-flight disconnect and
  real transaction rollback/retry coverage.
- `development-2`: all original 44 browser checks passed, then a new diagnostic
  helper failed because a local variable shadowed its function name. Only that
  new instrumentation variable was renamed. The failing log is preserved.
- `development-3`: original checks and early added cases passed; the added
  conflicting-tab check timed out. Completed scenario contexts were then disposed
  to remove accumulated background polling; application rate limits were not
  changed. This was isolation work, not proof of the timeout's sole cause.
- `development-4` and `development-5`: diagnostic stages proved both competing
  POSTs reached SUBMITTING and were released together. The remaining added
  assertion sampled temporary RECOVERY_REQUIRED/checking before read-only server
  reconciliation had supplied the final conflict text. The new check now waits
  for the required server-confirmed message/commit outcome within its existing
  timeout. It still asserts one durable answer, the conflicting copy preserved,
  and the expected final candidate message. No database assertion was relaxed.
- The preliminary `final-20261103` run passed all original suites, but its added
  conflict-text wait still timed out. Inspection identified the missing locale
  setup in the manually created second tab: unlike the normal browser helper, it
  did not initialize sessionStorage display language to English. The application
  defaults to Arabic. The new tab now uses the same English setup as the existing
  harness; the English message assertion is retained, and original RTL checks
  remain unchanged. Polling teardown and settled-outcome waits remain appropriate
  isolation/async checks, but are not represented as the sole root cause.
- Completion copy was made conditional after source review found that an ended
  interview could otherwise claim receipt while local text remained unconfirmed.
  A new browser case expires a single synthetic question and verifies the local
  copy survives, its submit receipt is absent, and completion does not claim that
  answer was received. The authoritative final run starts after these changes.
- Initial storage-read denial was given an explicit recovery-unavailable state.
  New typing cannot replace an unreadable existing pending envelope. Once a fresh
  authenticated observation can read storage again, the original text/identity
  is restored. The added regression passes. The intermediate verified-named run
  began before this final guard; the authoritative `verified-2` run fingerprints
  the finished source before verification and tests that same source throughout.

Screenshots and synthetic fixture credential files are suppressed throughout;
sanitized logs and metadata matrices are retained. No real model/API call was
used to diagnose or correct these findings.
