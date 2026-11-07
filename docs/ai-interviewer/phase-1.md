# AI Interviewer — Phase 1

Status: implemented as a deterministic, in-memory domain. No API routes, database,
candidate authentication, invitation tokens, UI, microphone, AI SDK or network
transport is connected. The existing written interview, Voice Assistant,
Copilot/MCP and their authorization are unchanged.

This implements the approved Phase 0 separation alongside the existing written
interview aggregate. It does not remove its one-interview-per-application
constraint, change its scorecard behavior, or use its external question generator.

## Run

From the repository root (use `npm.cmd` in PowerShell if `npm.ps1` is disabled):

```text
npm run check:ai-interviewer -w @hr/server
npm run demo:ai-interviewer -w @hr/server
npm run check
```

No environment file, API key, service, database or browser is needed for the first
two commands. Checks install network-denying guards before importing the domain.
The demo prints only event codes, synthetic question/turn ids and status; it does
not print answer text, prompts, candidate identity or secrets. Scores are synthetic
fixture outputs, not evidence of real model accuracy or candidate ability.

## Boundaries and state

- Shared validated contracts: `packages/contracts/src/aiInterview.ts`, exported
  through `@hr/shared` using the existing `.js` ESM convention.
- Authoritative engine: `services/hr-api/src/aiInterviewer/engine.ts`.
- Dependencies: `InterviewerPolicy`, `AnswerEvaluator`, `InterviewClock`.
- Transport: the engine returns typed PLAY/STOP_PLAYBACK effects. The harness
  passes them to `InterviewRealtimeProvider` and maps its observations back to
  commands. A provider cannot choose questions, extend a deadline or complete an
  interview. The engine does not import either provider implementation.
- No autonomous agents or HR tool access. These classes are internal domain
  services, not authenticated candidate endpoints.

Lifecycle status is `CREATED → READY → ACTIVE → COMPLETED`, with explicit
`PAUSED`, `FAILED` and `CANCELLED` states. Conversation phase is separate:

```text
INTRO → AI_SPEAKING → NEXT_QUESTION → AI_SPEAKING → LISTENING
LISTENING → PROCESSING → FOLLOW_UP / CLARIFICATION / NEXT_QUESTION
... → CLOSING → AI_SPEAKING → COMPLETED
```

`INTRO`, selection phases and `CLOSING` indicate requested delivery. A matching
playback-start observation changes the phase to `AI_SPEAKING`. The playback
record retains whether it is an introduction, question or closing. Only closing
playback completion, after every required base question is processed, completes
the interview. Completing it sets evaluation status to `PENDING`; the separate
`GENERATE_EVALUATION` command produces the in-memory report (`COMPLETED`).

Connection state (`CONNECTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`) belongs
to the transport contract, not the persistent interview snapshot. In the harness,
disconnect or provider timeout maps to PAUSE and reconnect maps to RESUME. These
commands still require a legal engine state; a reconnect cannot revive a terminal
interview.

## Plan and question rules

A versioned plan supports `en`, `ar`, `mixed`, and technical, behavioral,
experience and job-specific questions. A plan contains 1–30 base questions with
unique ids and order values. The engine processes them in order. Policy cannot
skip a required base question or terminate the interview early.
Base ids use letters, digits, underscores, dots and hyphens; colons are reserved
for generated follow-up/clarification ids so the two cannot collide.

Each base question explicitly specifies timing, warning, grace, silence action,
barge-in permission, follow-up and clarification limits and allowed prompt banks.
Limits are at most five follow-ups and three clarifications per base question;
counters include all descendants and do not reset for each follow-up. Selected
prompts must belong to the current base question and cannot be reused. If policy
requests an unavailable, repeated or over-limit prompt, the engine records
`POLICY_LIMIT_ENFORCED` and moves to the next base question. No model can invent an
unapproved prompt through this interface.

The mock policy recognizes two exact synthetic answers: the RAG introduction
selects the retrieval-quality follow-up; an incomplete measurement answer selects
the approved clarification. Other nonempty answers move on. Empty answers select
an unused clarification only when `silenceAction=CLARIFY_OR_NEXT`; otherwise the
policy moves on. Engine bounds still apply.

## Timer semantics

Times are integer epoch milliseconds from `InterviewClock`. `Date.now()` exists
only in the default system clock. `FakeClock` is monotonic and manually advanced;
there are no real intervals, sleeps or scheduled jobs in this phase.

1. Introduction and question playback consume no answer time.
2. Matching question-playback completion starts `LISTENING` and records
   `listeningStartedAt`, `answerDeadlineAt`, `timeLimitSec`, `warningAtSec`, and
   `gracePeriodSec`.
3. A warning fires once when remaining time is at or below `warningAtSec`.
   Zero disables it. Follow-up/clarification warnings are clamped to that turn's
   shorter time limit.
4. At the deadline, a silent/non-speaking candidate produces `ANSWER_TIMEOUT`
   and a finalized answer containing only available text. No evidence means an
   empty answer, not a score of zero.
5. A candidate already speaking at the deadline receives grace ending at
   **original deadline + configured grace**. A late tick cannot extend it.
   Zero grace finalizes immediately. Expiry finalizes with `endReason=TIME_LIMIT`.
6. `TIMER_TICK` reconciles elapsed deadlines. Late speech, transcript and pause
   commands cannot bypass an expired budget: they are rejected with
   `ANSWER_DEADLINE_PASSED_TICK_REQUIRED` when a tick must finalize the answer.
   Phase 2 must supply the authoritative scheduler and reconcile before retrying
   such commands; a frontend countdown will never be the source of truth.

A follow-up gets `followUpTimeLimitSec`; a clarification gets
`clarificationTimeLimitSec`. Each starts only after its own playback finishes.
Processing and playback time are excluded.

## Pause, failure and recovery

During LISTENING, PAUSE stores the remaining time in the current ANSWER or GRACE
stage. Resume sets a new deadline to **resume time + remaining duration**. Five
minutes offline consumes none of the saved 80 seconds. Existing warning state is
preserved. Silence inactivity time is shifted by the pause duration as well.

Pause clears active-speaking status; a new speech observation is required after
resuming. Pausing during grace preserves only the remaining grace and cannot grant
a second grace period. A pause cannot freeze an already expired timer.

Pausing during delivery requests playback stop. Resuming requests the same text
with a new playback id, requiring playback completion before listening. Old
playback ids and closed turn ids are refused. This avoids assuming that a full
question was heard before a disconnect. No real audio cancellation is implemented.

FAILED is terminal unless `FAIL_INTERVIEW` explicitly set `recoverable=true`.
Recoverable failure uses the same frozen-time recovery semantics. CANCELLED and
COMPLETED reject continuation and new answers. The report command is the sole
post-completion domain operation in Phase 1.

Recovery here is within the live in-memory harness. Restart hydration, durable
receipts, database transactions, event replay and multi-process coordination remain
Phase 2 work; the current harness does not claim crash durability.

## Speech, silence and interruption

Provider transcript updates are cumulative text for the current turn, not chunks
to concatenate. Partial text remains in the draft and never completes an answer
by itself. A final transcript and speech-finished observation, in either order,
normally finalize it. At forced time-limit finalization, available partial text
can be retained but is marked `textSource=partial` and `transcriptionUncertain`.
After resumed speech, an older final transcript cannot finalize the new speech;
the engine waits for its current final or the deadline. Forced finalization uses
the most recent cumulative text, marking newer partial evidence as uncertain.

With `silenceThresholdSec > 0`, a tick detecting an empty, inactive turn finalizes
it as SILENCE before the deadline. Policy can select a bounded clarification;
that clarification gets a fresh, explicit timer after playback. With threshold
zero, silence is handled at the normal answer deadline. There is no retry loop
outside the plan's hard limits.

When barge-in is allowed, interruption of a started question stops its delivery,
records `PLAYBACK_INTERRUPTED`, starts LISTENING and records candidate speech.
The answer carries `questionDelivery=interrupted`; it never claims the question
was heard in full. Introduction/closing interruption and disabled barge-in are
rejected. The mock evaluator leaves incomplete delivery unassessed.

## Commands, events and idempotency

Every command has a stable `commandId`; media observations have a stable event id
used as their command id. Harness-generated command and media ids use separate
namespaces. Accepted ids are recorded in memory. Identical retries return the
current snapshot with `duplicate=true` and no new effects/events. Reusing an id
for different validated content is `COMMAND_ID_CONFLICT`. Rejected commands are
not receipted. Duplicate delivery must reuse its original id.

Every event has `interviewId`, interview-scoped `eventId`, monotonic `seq`,
`commandId`, timestamp and a validated typed payload. Creation records the plan;
question selection records the actual prompt and parent; listening records its
timer; finalization records text and delivery/timing metadata; evaluation records
structured evidence. Partial transcript updates do not enter the event log.

Snapshots/events returned to callers and inputs passed to policy/evaluator are
copies. Rejected transitions roll back the in-memory state and staged events.
Phase 2 must atomically persist snapshots, event sequences, command receipts and
pending effects. These internal snapshots contain the plan and answers and must
not be reused as future public candidate DTOs. Candidate DTOs, authentication and
authorization must be built separately in Phase 2.

## Evaluation and evidence

`AnswerEvaluator` returns all five dimensions: technical_accuracy, relevance,
depth, communication, problem_solving. Each is an integer 0–4 with nonempty
evidence, or explicit `not_assessed`. No overall score or hiring-decision field
exists. Unknown answers, missing evidence, uncertain transcripts and incomplete
question delivery are unassessed by the mock. Timeout metadata does not subtract
points from otherwise available, recognized evidence.

Evidence carries question id, turn id, criterion key, dimension, exact quote and
UTF-16 `[start,end)` offsets. The Phase 1 verifier checks those references and the
exact in-memory substring before accepting evaluation. Persistence-backed checks
remain Phase 2 work. Fixture scores are illustrative only; they do not implement a
validated technical rubric or infer accent, language proficiency or personality.

## Remaining work

- Phase 2: persistence, authorization, candidate sessions, durable replay and
  scheduling, effect recovery, report jobs, retention and consent.
- Later: UI, real media adapter and real question/evaluation providers, privacy
  review, approved rubric anchors and production quality/latency testing.
- Human approval for dynamic prompt families and manager assignment remain policy
  decisions from Phase 0. Phase 1 only uses explicit in-plan prompt banks.
- No existing fine-tuning data, evaluation artifacts or frozen baseline changed.

## Verification coverage

The checks cover all 22 requested Phase 1 cases, plus exact timing boundaries,
zero grace, delayed ticks, overdue commands, silence limits, paused grace,
replayed delivery, transcript ordering, evidence tampering, plan validation,
copy isolation, deterministic traces and provider timeout. Existing Voice,
scorecard and permission checks are run separately as regression checks.

Recorded verification:

- Phase 1 checks: 37/37, zero attempted network operations.
- Workspace checks: contracts, API and web passed. Web lint reports existing
  `react(set-state-in-effect)` warnings in `GapForm.tsx` and `ScorecardEditor.tsx`;
  neither file was modified.
- Existing `check:voice`, `check:voice:local`, `check:scorecard`, and
  `check:permissions` passed. The local voice checks used synthetic process-only
  DATABASE_URL/SESSION_SECRET values to satisfy their existing configuration
  validator; all transports were offline test doubles, with no database connection.
- Demo: four finalized answers, a follow-up, a clarification, both required base
  questions, closing completion, then separate report generation.
