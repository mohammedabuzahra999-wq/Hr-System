# Phase 5.2 — submission path before implementation

Inspection date: 2026-11-03 (Asia/Riyadh). This document records the existing
behavior before application changes. Phase 5.1 remains **BLOCKED — environment
validation blockers only, with clean executable regression**. Its package and
source manifest are immutable.

Accepted Phase 5.1 source-manifest SHA-256:
`06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163`.

Open release evidence blockers, not waived by Phase 5.2:

1. Full migration-chain validation needs genuine pgvector; local PostgreSQL lacks
   it. The prior full-chain attempt stopped at 0008 before reaching 0026.
2. Live local voice E2E needs the STT/TTS worker and an isolated synthetic
   real-engine configuration, which are unavailable.

## Exact current path

1. `apps/hr-web/src/features/aiInterviewer/MockControls.tsx` owns typed text in
   React `useState`. Its component key changes with turn/playback identity.
   Neither text nor a logical-answer submission envelope is persisted in browser
   storage. This is a development-only typed mock path, not a production voice
   adapter.
2. `submit()` sends up to three independently identified commands, each using a
   newly generated UUID: `CANDIDATE_SPEECH_STARTED` (unless already speaking),
   `CANDIDATE_TRANSCRIPT_FINAL`, then `CANDIDATE_SPEECH_FINISHED`. Text is trimmed.
   Failure of either of the first two returns early. The final call's boolean
   result is not used by `submit()`.
3. `InterviewSession.send()` constructs an envelope with the currently cached
   interview id and expected version. `perform()` sets the in-memory busy flag
   and remembers only the latest envelope in `lastAttempt`. A different command
   replaces that retry context. `retryLast()` exists in developer tools and
   resends the same envelope while that JavaScript object remains alive.
4. `CandidateInterviewClient` POSTs `/api/ai-interview/commands` with the HttpOnly
   candidate cookie, no-store and no-referrer. Fetch rejection becomes
   `networkUnavailable`. Non-success HTTP responses expose a safe error code.
   A successful response is validated against the candidate state schema.
5. The candidate router enforces Origin, body limits, rate limits and the closed
   candidate-command schema. Candidate START is refused without the permitted
   development mock runtime. The route passes the request to InterviewService.
6. `InterviewService.executeOperation()` obtains a PostgreSQL interview row lock.
   It validates the candidate credential/expiry/revocation/interview scope before
   checking receipts. The fingerprint binds actor, expected version and complete
   operation content. Identical receipt reuse returns duplicate=true; changed
   content with the same command id returns an explicit conflict.
7. Without a receipt, runtime recovery and expected-version checks run. The
   existing engine dispatches one command, retaining its timer/lifecycle/turn
   guards. Snapshot, resulting domain events and the command receipt are saved
   in the same transaction. A failure rolls back all of those writes.
8. A final transcript can be durably present in `snapshot.draft.finalText` before
   the answer is finalized. `TRANSCRIPT_FINAL_RECEIVED` itself contains no text.
   When final transcript and speech-finished observations are both present, the
   engine emits `CANDIDATE_ANSWER_FINALIZED`, appends `snapshot.answers`, clears
   the draft/timer and enters PROCESSING. These changes and their receipt commit
   atomically for the finalizing command.
9. Maintenance later sends PROCESS_ANSWER. The existing state machine and
   transaction/version/receipt protections govern its single advancement and
   bounded approved follow-up/clarification selection. Evaluation/report input
   integrity is a separate existing boundary.
10. The candidate response contains duplicate plus the safe current state. The
    UI accepts only pinned-interview/nondecreasing-version responses. On 409 it
    clears `lastAttempt`, fetches authoritative state and asks the candidate to
    review; it never blindly resends. No response field or recovery API currently
    identifies a complete logical answer submission as durably finalized.

## Failure windows A–J

| Window | Existing behavior | Gap |
|---|---|---|
| A. Typed, never submitted | Text exists only in component memory. | Refresh/unmount loses it; no draft durability indicator. |
| B. Request not sent | Last attempted command may remain in memory; local busy flags suppress clicks. | No refresh-safe envelope; no durable logical submission identity. |
| C. Sent, never received | Fetch can fail or remain unresolved; server has no receipt. | Client cannot distinguish this from a lost acknowledgement. |
| D. Server transaction rolls back | Snapshot/events/receipt roll back together. | Text/envelope recovery is memory-only; no dedicated answer outcome reconciliation. |
| E. Commit, response lost | Identical command retry is deduplicated by the durable receipt. A transcript commit may still precede finalization. | The browser cannot recover the envelope after refresh or prove logical answer completion from its lost response. |
| F. Response arrives, browser crashes before local transition | Server writes survive. | Local step/identity is lost; restored state alone does not identify which intended answer was accepted. |
| G. Duplicate retry after commit | Same command id/content/version yields duplicate=true with no second effect. Conflicting reuse fails. | Protection is per command; the three-command logical operation has no persistent browser identity. |
| H. Two tabs, same logical answer | Row locks/versions prevent simultaneous state advancement at the same version. Each tab generates unrelated command ids. | No answer-level acknowledgement/reconciliation; intermediate speech/transcript steps may interleave if a tab refreshes its version. |
| I. Two tabs, conflicting answers | Stale requests conflict; one finalized turn cannot append another answer through normal engine transitions. Before finalization, a fresh-version transcript command may replace the same draft's final text. | No atomic logical submission ownership; explicit conflict outcome is required instead of letting independent command chains overlap. |
| J. Refresh while pending | The new client fetches authoritative state/replays safe event notifications. | Typed text, current command envelope and the acknowledgement uncertainty are lost. Replay notifications omit answer text/receipt details. |

## Constraints for the smallest implementation

- Preserve the engine, deadline/grace rules, PostgreSQL row lock, expected
  versions, durable command receipts/fingerprints and authorization order.
- Treat a complete typed submission as one atomic service operation using the
  existing engine observations and one existing command-receipt identity, rather
  than retaining three independently retryable browser mutations.
- Use authoritative, candidate-scoped receipt/answer reconciliation to prove
  commit; a local cache entry, completed fetch or transcript-only receipt is not
  proof that an answer was finalized.
- Persist a bounded recovery envelope before sending. Retrying must preserve the
  original id, body and expected version. A version conflict must not silently
  change the envelope and resubmit.
- Bind recovery to a server-validated, non-credential interview/session scope.
  Never persist invite/session credentials. Do not display a cached answer
  before validating the current candidate scope. Clear or quarantine stale scope
  data without exposing it to a different session.
- Expose DRAFT, SUBMITTING, COMMITTED and RECOVERY_REQUIRED/UNCERTAIN semantics.
  Storage failure must be explicit; no claim of refresh safety if persistence
  fails. Pending/conflicting text must not disappear merely because a turn
  advanced or a component unmounted.
- Test A–J with synthetic data and offline mocks, including database rollback,
  commit-before-ack, identical/conflicting two-tab races, session changes and
  durable restart recovery. Existing passing tests must remain unchanged.

## Instruction boundary

The received request ends at `## Step 6 — Failure`. The remaining instructions
have been requested. This inspection and source-integrity capture do not assume
the missing failure-test requirements, acceptance criteria or any later approval
gate. No application source has been changed at this inspection point.
