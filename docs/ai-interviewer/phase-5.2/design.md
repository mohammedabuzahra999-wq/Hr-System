# Phase 5.2 — answer preservation and submission recovery

Step 1 is recorded in before-state.md and was not repeated. The continuation
authorizes failure-before-commit, two-tab, refresh/restart, UX, security and full
regression validation. No Phase 5.3, provider/voice/WebRTC/distributed runtime or
retention work is included.

## Durable boundary

The typed mock UI now sends one logical answer through
`POST /api/ai-interview/answers/submit`. This is a candidate-only, Origin-checked,
body-limited, rate-limited route using the existing HttpOnly cookie. The closed
request includes the interview, question/turn, non-secret session generation,
stable UUID command id, expected version and finalized text.

InterviewService validates the candidate inside the existing PostgreSQL row
lock. It checks the session generation and existing command receipt/fingerprint
before expected version, restart/lifecycle and turn validation. A complete typed
submission uses the unchanged engine's existing speech-start, transcript-final
and speech-finish commands synchronously inside ONE transaction. Intermediate
domain results are never committed separately. Final snapshot, finalized-answer
event and existing COMMAND receipt either all commit or all roll back. Internal
engine command ids are deterministic derivatives of the outer UUID; they are not
additional externally retryable operations.

No new table, index, migration, outbox or parallel idempotency store is introduced.
The engine, timer/grace policy and legacy mock-media observations remain intact.
PROCESS_ANSWER is still separate, with its existing locks/version/receipt rules.
Follow-up decisions and evaluation behavior are not changed.

Only after the repository transaction resolves does the router return COMMITTED.
An identical UUID/body/version retry returns the original receipt outcome without
new writes. Conflicting reuse returns 409. Authorization is always checked first.

## Reconciliation

`POST /api/ai-interview/answers/status` is an authenticated read-only operation
under the same row lock. It accepts the frozen submission envelope and verifies
its fingerprint if that receipt exists. It compares the requested question, turn
and exact finalized text against BOTH persisted finalized-answer events and the
snapshot. The response is a closed candidate DTO with one outcome:

| Outcome | Meaning and candidate behavior |
|---|---|
| COMMITTED | Exact intended answer is durably finalized, either by this receipt or another tab. Clear local plaintext; show server-confirmed success. |
| OPEN | No matching committed answer/receipt and this turn still exists. Retain text; retry the identical frozen envelope only while its expected version remains current and the turn is active. |
| CONFLICT | A different finalized text occupies this turn. Retain the losing copy and explain it did not overwrite that answer. |
| CLOSED | This turn cannot accept the local text, including a silence timeout. Preserve the copy and explicitly avoid a saved/success claim. |

Same text with different submission UUIDs yields one real commit/receipt. The
losing POST conflicts; reconciliation can confirm that the same intended text is
already durable without writing another receipt. Different texts never overwrite
a finalized answer. Fresh requests after completion are refused; a valid original
receipt may still confirm a historical commit without advancing state.

A version conflict never causes automatic rebasing. If a fresh locked status
check proves OPEN at a different version, the candidate may explicitly choose
"Review as draft", then initiate a NEW attempt/UUID after reviewing. The old
expected version is permanently stale and cannot later commit. If the original
version is still current, retries use exactly the original UUID/body/version.
Background polling performs read-only reconciliation, never automatic submission.

The answer endpoints have a 15-second browser request deadline. Aborting a fetch
is treated as uncertainty, never proof that a server transaction failed.

## Local recovery envelope and security

- Location: `sessionStorage['ai-interview:answer:v1']`, one record per browser tab.
  It survives refresh and navigation in that tab. It is not shared localStorage.
- Contents: format, interview id, non-secret candidate-session generation,
  current question/turn, text, expiry, and (once submission starts) the stable UUID
  and original expected version. No cookie, invite, bearer, password, API key,
  database credential, score or authorization material is stored.
- Lifetime: at most two hours and no longer than the server-reported remaining
  candidate session lifetime. Expiry is checked on load, observed state and the
  room's interval. Closing the tab normally clears sessionStorage; browser session
  restoration may retain it until explicit cleanup/expiry.
- Gating: cached text is parsed with a closed schema and a 100,000-character raw
  limit. It is never displayed before an authenticated state establishes the
  matching interview/session generation. Foreign, malformed or expired records
  are purged. New invitation exchange, changed session scope and 401/403 purge
  the copy. A late response cannot repopulate a cleared/detached generation.
- Cleanup: confirmed commit removes the recovery record and plaintext from the
  controller. Explicit discard removes only the local copy and does not claim to
  cancel an already-sent request. Pending/closed/conflicting copies are retained
  within the bounded lifetime until confirmation, explicit discard or security
  cleanup. Completion alone is not treated as proof of this answer's commit.
- Storage failure: no POST is sent unless the pending envelope was synchronously
  written and read back. The visible draft remains in memory with an explicit
  warning; beforeunload requests browser confirmation for unpersisted text. The
  browser may suppress that dialog, so the UI also tells the candidate to copy
  the text before refreshing.
- Initial storage-read failure is explicit and blocks new typing from replacing
  an unknown pending record. A subsequent authenticated state observation retries
  the read; no recovery text is displayed before scope verification.
- Browser plaintext is accessible to same-origin scripts and browser/device
  owners. The normal application/XSS boundary still matters. This is bounded
  local recovery, not encrypted backup or cross-device persistence. The envelope
  never authorizes server access; every server operation rechecks the cookie,
  interview binding, generation, action, expected version and lifecycle.

## Candidate states

| State | Visible guarantee |
|---|---|
| DRAFT | Local draft only. The UI separately distinguishes tab-persisted text from memory-only text. No server-save claim. |
| SUBMITTING | Waiting for durable server confirmation. Further clicks cannot create a second client submission. |
| RECOVERY_REQUIRED | Outcome unconfirmed, retryable, changed, conflicted or closed. The local text remains visible; no ambiguous success/failure claim. |
| COMMITTED | Validated server result proves the exact text has been durably finalized. |

Recovery status is outside the turn-keyed mock controls, so a turn change cannot
silently unmount the only copy/status. The UI never renders hashes, UUIDs,
internal versions, SQL exceptions or stack traces. Frontend busy state is a UX
guard; PostgreSQL remains the concurrency authority.

## Validation and release boundary

New isolated tests inject failures before finalized-event insertion, receipt
insertion and snapshot update; race identical/different submissions on real
PostgreSQL; exercise response loss and new runtime owners; verify session/Origin/
resource boundary failures; and test browser persistence, malformed storage,
refresh, network interruption and two real same-session tabs. The new optional
browser-suite hook adds cases without changing any original assertion or normal
Phase 3/4 count. Existing suites are rerun independently.

The single-process/runtime-owner limitation is unchanged. Restart can confirm an
already committed receipt; an uncommitted active attempt may recover PAUSED and
requires explicit resume/review. Real network loss does not establish a trusted
server pause, and local recovery never extends the server deadline.

Phase 5.1 stays BLOCKED. The pgvector full-chain and live STT/TTS E2E blockers
remain open in release evidence. No inference/model call is needed by this phase.
