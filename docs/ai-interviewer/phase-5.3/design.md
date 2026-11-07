# Phase 5.3 policy and design

The before-state inspection is complete in before-state.md. This phase preserves
one application process, one current runtime owner and PostgreSQL durability.
There is no distributed leadership, real provider/audio integration or retention
implementation. Accepted Phase 5.1/5.2 evidence is read-only.

## Bounds and admission

- Production evaluator wait: **30,000 ms**. Trusted test-only constructor options
  can lower it (1..30,000 ms), never disable or raise it. No HTTP/env override was
  added. The native timer starts before invoking the evaluator.
- The attempt records ownerId, random executionId, deadlineAt and inputHash in
  existing JSON. New fields are optional for backward compatibility; no migration.
- Timeout: FAILED, EVALUATOR_TIMEOUT, finished attempt, null report. Success
  observed at/after the persisted deadline is also refused at commit.
- Rejection/unavailable: existing MOCK_EVALUATOR_FAILED. Invalid schema/evidence:
  existing EVIDENCE_VALIDATION_FAILED. No failure fabricates report data.
- An optional AbortSignal is provided. Shutdown cancellation becomes
  EVALUATOR_CANCELLED, never success. Late settlement is consumed and produces
  only a sanitized fenced diagnostic, not a second authoritative completion.
- Physical admission is shared across report-service objects for the single
  database in the process, with a maximum of **two calls**. Duplicate claims that
  do not execute release their temporary reservation immediately.
- An uncancellable timed-out call retains its physical slot until settlement or
  process exit. This bounds abandoned work/memory at two calls. If both slots are
  occupied, another eligible attempt fails promptly with
  EVALUATOR_CAPACITY_EXHAUSTED and no evaluator invocation/report. HR can retry
  after capacity recovers; two permanently stuck calls require a process restart.
  No unbounded hidden queue of provider calls is created.

Timeout bounds asynchronous/cooperative execution waits, not arbitrary
synchronous CPU loops. Trusted evaluator code must return/yield promptly.
In-process JavaScript cannot preempt CPU-blocking code or guarantee progress
during a Node event-loop stall/database outage. Such code needs process/worker
isolation before admission; none is claimed or added here.

## Maintenance fairness

The existing interview maintenance work remains sequential within its own pass,
with its original timer, warning, grace, silence, PROCESS_ANSWER and heartbeat
rules. It now has an independent 1,000 ms interval and reentrancy guard.

Job discovery has a separate 1,000 ms interval/guard. It selects at most 64 valid
PENDING/RUNNING report envelopes, ordered PENDING first then creation/id, and
dispatches at most two logical jobs without awaiting their evaluator waits.
Existing row locks/versions/receipts remain authoritative. HTTP-started report
work uses the same physical admission coordinator.

Evaluator-induced timer delay is **zero awaited evaluator work**. The supported
observation tolerance is one 1,000 ms scheduling interval plus a finite active-row
scan, DB latency and event-loop scheduling latency. There is no hard real-time
claim under arbitrary load/outage. Deterministic tests process the exact injected
deadline while A remains RUNNING and B is COMPLETED. A real-interval local test
requires observation within 2,000 ms after the injected deadline; actual measured
times and source timestamps are recorded in runtime-matrix.json. Deadlines are
not extended to meet that tolerance.

For a finite queue, two logical jobs are dispatched per scan at most. An occupied
logical slot waits at most the configured evaluator bound plus SQL completion;
capacity failures drain as explicit FAILED jobs instead of starting extra work.
Healthy one-hang/one-normal operation leaves the second slot usable. An evaluator
does not acquire/retain an active-interview row lock while it runs.

## Fencing and integrity

Claim and terminal commit remain separate locked transactions around the external
wait. Commit requires RUNNING status, matching persisted attempt count,
executionId and ownerId. The current inputHash must equal BOTH the original claim
hash and the independently recomputed hash of frozen input. The first available
attempt hash anchors retry even for upgraded legacy histories.

Every accepted report still passes verifyInterviewReport with the original frozen
input and server identity. Changing current source/hash while a worker runs
cannot accept its old result or silently make RETRY assess a different source.
Malformed durable report envelopes with the expected format fail closed as
EVALUATION_INPUT_INVALID rather than being endlessly retried as RUNNING.

A late/fenced worker writes neither report nor authoritative job/aggregate state.
Only a sanitized diagnostic is emitted. Tests deliberately give A and B different
valid summaries, then compare durable rows/hash/version after A returns.

## Retry and restart

FAILED -> HR RETRY -> PENDING preserves reportVersion, evaluatorVersion, frozen
input and inputHash. The existing durable request receipt still handles response
loss. Explicit REEVALUATE alone creates the next report version.

- ACTIVE interview: existing restart recovery pauses at lastObservedAt; unknown
  offline time is not charged. It runs on timer discovery or authorized load.
- PAUSED interview: remaining duration is preserved; owner reconciles on load.
- PENDING evaluation: durable frozen job is executed by the new process.
- New-format RUNNING: a different runtime owner immediately fences the prior
  unfinished attempt as WORKER_RESTARTED and creates a new attempt of the same job.
- Legacy RUNNING without owner/deadline: existing five-minute lease is retained;
  it is bounded recovery, not an indefinitely stranded job.
- Same-owner expired lease keeps WORKER_LEASE_EXPIRED semantics. A recorded
  execution deadline can recover an unfinished same-owner attempt sooner.
- COMPLETED result: another invocation/restart is a no-op. Lost acknowledgement
  cannot create another report.
- Timeout/retry transition: FAILED remains failed until explicit retry; durable
  RETRY/PENDING survives restart without a new report version.

The process coordinator is not a distributed lock. Owner changes mean restart
under the existing one-process policy. Concurrent healthy instances are still
unsupported. Restart tests use a fresh service/runtime owner over real PostgreSQL
state, not OS process termination or distributed failover.

Graceful stop cancels bounded waits, drains in-flight logical passes/jobs and
then closes the DB. It does not await uncancellable physical promises. SQL drain
still depends on database availability. If durability is interrupted, persisted
RUNNING metadata is recovered by the next process rather than falsely completed.

## Diagnostics and privacy

Existing transactional evaluation audits now correlate attempt numbers. Timeout
has an explicit transactional audit; interview/job recovery has start/completed
audits that exist only if their transaction commits. System actors are identified
as system in audit source metadata.

Operational diagnostics are closed typed metadata: event, interview/evaluation
identifier, report version, attempt and safe code. There are no exception bodies,
SQL parameter values, prompts, transcripts, personal names, API credentials,
invite tokens or report content. Sink failure cannot change evaluation authority.

The two prior release blockers remain OPEN: pgvector/full migration-chain
validation and live STT/TTS E2E configuration. A local Phase 5.3 PASS does not waive
them or authorize Phase 5.4 activation.
