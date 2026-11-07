# Phase 5.3 before-state — runtime and jobs

Inspection completed before application changes, 2026-11-03 (Asia/Riyadh).
Accepted Phase 5.2 source manifest SHA-256:
`f46c6b5170f48ee3c3ddc93cdea0d1e430ec04fc95757a87053e08c81bd96b6f`.
The Phase 5.1/5.2 packages are immutable. Release remains BLOCKED for missing
pgvector/full-chain validation and unavailable live voice E2E configuration.

## Runtime path found

`runtime.ts:startInterviewMaintenance` creates one 1,000 ms interval with a
single `running` flag. A tick selects evaluations with status PENDING/RUNNING
whose results envelope format is phase4-report-v1. It awaits each runJob in a
sequential for loop, THEN selects ACTIVE interviews and processes PROCESSING
answers or due LISTENING timers/warnings/silence. Heartbeats preserve the last
known server observation without advancing domain version. A never-resolving
evaluator prevents the entire tick from reaching timers; later ticks skip because
running remains true. Stop only clears the interval and does not drain work.

The HTTP report-request route also schedules runJob after its durable request
transaction. Multiple report service objects can therefore operate in the same
application process; a per-instance frontend flag would not bound execution.

## runJob and durable boundary

1. Under the existing interview row lock and an evaluation row lock, load the
   job/storage. Ignore missing/terminal jobs. A RUNNING attempt younger than
   300,000 ms is skipped. An expired unfinished attempt receives
   WORKER_LEASE_EXPIRED; append a new attempt, set RUNNING, update interview
   evaluationStatus/version, and write EVALUATION_RUNNING audit. Commit.
2. Outside SQL, await evaluator.evaluateReport on a structured clone of the
   persisted frozen input. There is no timeout or cancellation signal. A thrown
   exception becomes MOCK_EVALUATOR_FAILED. Independent verifyInterviewReport
   rejects malformed/invalid-evidence output as EVIDENCE_VALIDATION_FAILED.
3. Reacquire locks. Commit only if the job remains RUNNING, persisted attempt
   count matches the claim and the current inputHash matches the current stored
   input. Persist report or safe failure code, finish the attempt, set COMPLETED
   or FAILED, update interview version and write audit. Commit.

The existing attempt-count check fences an older worker after lease reclamation.
There is no persisted execution token, evaluator deadline or evaluation owner.
The commit guard does not explicitly compare the current hash to the original
claimed hash. Frozen input/output must remain independently verified.

Before evaluator work, durable state includes frozen input/hash, job/version,
RUNNING status, attempt start and audit. After successful/failed commit it also
includes attempt finish, safe failure code or verified report, and terminal audit.
If the process stops during evaluator work, RUNNING remains until its five-minute
lease is reclaimed by a later runJob. PENDING survives and can be executed by a
new service instance. A completed job is not run again.

## Retry and interview recovery

HR RETRY is allowed only for FAILED jobs with valid storage. It preserves frozen
input, evaluatorVersion, inputHash and reportVersion, increments retryCount and
sets PENDING. Explicit REEVALUATE is separate and creates a new report version.
Candidate/staff/HR authorization and exact evidence validation are outside model
authority and must remain unchanged.

InterviewService.recover compares persisted runtimeOwner to the process owner.
ACTIVE recovery pauses using lastObservedAt so unknown offline time is not
charged. PAUSED recovery preserves remaining duration. The policy assumes one
live process/runtime owner, not distributed ownership. Current runtime scans
ACTIVE rows; PAUSED rows reconcile on an authorized load. Evaluation recovery is
separate and currently relies solely on the five-minute attempt lease.

## Minimal Phase 5.3 decision

- Bound the asynchronous evaluator wait to 30,000 ms; timeout is FAILED with no
  report. Offer an AbortSignal and consume/fence late settlement.
- Use a shared, bounded execution coordinator for the database in this single
  process. Preserve the five-minute legacy lease and attempt-count fence, adding
  optional execution-token/owner/deadline metadata to existing attempt JSON.
- Separate one-second interview maintenance and job discovery; do not await an
  evaluator on the timer path. Bound dispatched jobs to two.
- Preserve frozen input/hash/version on retries; verify the claimed hash at both
  claim and commit. New-owner RUNNING recovery must be deterministic.
- Bound non-cooperative asynchronous work by retaining its physical admission
  slot until it settles. Exhausted capacity fails safely rather than creating an
  unlimited collection of abandoned evaluator calls.
- Add only sanitized lifecycle diagnostics and transactional recovery audit.
  No schema migration, provider integration, distributed ownership or retention.

The execution bound assumes evaluator code returns/yields promptly. JavaScript
timeouts cannot preempt synchronous CPU loops, nor process deadlines during a
Node event-loop stall or database outage. No CPU/process isolation is claimed.
This limitation must remain explicit in results and the later real-provider gate.
