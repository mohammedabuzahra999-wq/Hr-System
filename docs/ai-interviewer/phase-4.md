# AI Interviewer — Phase 4

Phase 4 adds deterministic evaluation jobs, strictly verified evidence, immutable
versioned reports and a separate HR review to the existing interview service.
The Phase 1 engine and its MockEvaluator remain unchanged. Phase 5 is deferred.

## HR workflow and routes

Complete an interview with the Phase 3 browser mock. In the existing recruitment
application, open **AI Interview → Evaluation & human review**. The report page is
`/hr/recruitment/applications/:applicationId/ai-interviews/:interviewId/report`.
It identifies the candidate/application and displays interview status separately
from evaluation status. HR requests evaluation, inspects criteria and exact source
answers, then saves REVIEWED/UNREVIEWED and an optional private note. A link returns
to recruitment; the existing human application decision workflow is unchanged.

The following endpoints share the existing recruitment permission, employee
authentication, Origin validation, body limits and no-store/referrer headers:

- GET `/api/recruitment/applications/:applicationId/ai-interviews/:interviewId/evaluation`
  (optional positive `reportVersion` query).
- POST the same path: `commandId`, `expectedVersion`, `operation` RUN/RETRY/REEVALUATE,
  and an optional allowlisted mock evaluator version.
- POST `.../evaluation/:reportVersion/review`: `commandId`, `expectedVersion`,
  `status` REVIEWED/UNREVIEWED, and `note` (maximum 4,000 characters).

HR/Admin must still be active and have manageRecruitment at the service boundary.
The application/interview relationship is checked transactionally. Manager,
employee, candidate and system principals cannot call these report/review service
methods. Candidate cookies are not employee authentication. No candidate report or
evidence route is mounted. The candidate DTO and filtered replay remain unchanged.

## Storage without a migration

Migration 0026 already provides evaluation status, report_version, input_hash,
evaluator/rubric versions, retry_count, failure_code and a JSONB results field.
No database column, constraint, index, table or migration is added or changed.
Migration 0026 and its journal are unchanged.

The existing results JSONB now supports an additional discriminated envelope:
`format: phase4-report-v1`, frozen `input`, immutable `report`, independent `review`,
and durable `attempts`. Its TypeScript `$type` annotation is a union with the old
Phase 2 answer-evaluation array. That annotation produces no DDL. Legacy rows and
the Phase 2 legacy evaluation command still work; the legacy command cannot
overwrite a Phase 4 envelope. Its existing regression gains only an Array.isArray
assertion for correct narrowing of this union.

The report is stored in ai_interview_evaluations, not in generic audit events.
Existing JSONB coverage retains its legacy meaning for legacy rows; the Phase 4
report carries validated criterion coverage in its own closed contract.

## Frozen input and reproducible hash

On interview completion, the existing Phase 2 path creates PENDING v1. Completion
does not automatically run evaluation. HR's RUN request materializes the new
frozen input and persists it before execution. It includes:

- Interview id and original completion version/last included sequence.
- The ready-time frozen criteria, labels, weights and approved 0–4 rubric.
- Served question ids, prompts, types, criterion mappings and descendants.
- Persisted CANDIDATE_ANSWER_FINALIZED source events, sequence, turn and question
  references, final text and answer limitations.
- The explicit mock report evaluator version.

Partial-only answer text is removed from evaluator input. Uncertain transcripts,
incomplete question delivery and unsupported mock texts cannot support a score.
The input excludes candidate identity, employee data, private HR notes, sessions,
invitation secrets, raw audio and transient drafts. HR-only candidate/role context
is loaded separately for the report header, never sent to the evaluator.

SHA-256 uses the existing canonicalJson object-key ordering. Answer finalization
timestamps and job/review timestamps are excluded. Repeated equivalent input has
the same hash. Answer text, rubric/version, criterion mappings, weights or explicit
evaluator-version changes affect the hash. Retry reads the same stored input,
not today's JD/scorecard or a newly reconstructed interview. The Phase 2 hash
algorithm remains intact for legacy rows; the discriminator identifies Phase 4's
extended input protocol. A pending legacy v1 has no completed report to overwrite
when its input is materialized.

## Evaluation lifecycle and concurrency

RUN commits PENDING and a durable command receipt, then a job claims RUNNING under
the interview row lock. The evaluator executes outside the database transaction.
Validation precedes the atomic COMPLETED commit. Technical failure commits FAILED
with a safe code; interview status remains COMPLETED and answers are untouched.

Maintenance scans only Phase 4 envelopes in PENDING/RUNNING, leaving untouched
Phase 2/3 PENDING evaluations alone. It drains committed jobs after response loss
or restart. A RUNNING attempt has a five-minute lease; an expired lease can be
reclaimed. The persisted attempt number fences late workers, which cannot replace
a result from a newer attempt. The mock is synchronous/deterministic in normal
use. No external job service, model provider or WebSocket server is introduced.

Stable command ids and hashed request fingerprints use the existing COMMAND
receipt table. A replay of the identical request acknowledges its original
report version. Changed content with the same command id fails. Stale expected
versions fail with 409; the UI refreshes rather than blindly retrying a mutation.
Duplicate workers cannot commit conflicting reports.

RETRY is allowed only after FAILED, retaining the same report version, frozen
input/hash and evaluator. It increments retry_count and preserves failed attempts.
REEVALUATE is intentional: after a completed report, insert a new report_version
and fresh review state, retaining the prior report/input/review. Basic v1/v2 mock
evaluator choices demonstrate this boundary; advanced rubric revision UI is
deferred. The original frozen rubric never changes in place.

## Scores, coverage and mock evaluator

The adapter extends the current MockEvaluator; its existing answer API and the
Phase 1 engine are unchanged. The report interface accepts a frozen input and
returns untrusted structured output through the same verifier/persistence path
for every evaluator, including failure and fabricated-evidence test fixtures.

This is explicitly SIMULATED / MOCK EVALUATION. Existing English fixtures and
explicit Arabic/mixed synthetic fixtures define strong, weak and partial anchors.
Arbitrary text is not graded heuristically. The adapter uses the frozen question
type to select one existing rubric dimension: technical → technical_accuracy,
behavioral → problem_solving, experience/job_specific → relevance. It does not
apply five equal dimensions. The report's evaluator version identifies this
synthetic mapping policy. Each rationale names the dimension and frozen anchor;
the lowest supported anchor among eligible answers is the criterion score.

ASSESSED and PARTIALLY_ASSESSED require a 0–4 score, nonempty rationale and valid
evidence. Unsupported/incomplete criterion evidence is NOT_ASSESSED with null
score and no trusted evidence. Missing criteria cannot disappear or become zero.
An explicit partial fixture or incomplete supported turn coverage is marked
PARTIALLY_ASSESSED. Timing, clarification and connection limitations do not subtract
points. There is no accent, nationality, ethnicity, gender, age, disability,
emotion, personality, religion or political-trait inference. Mixed language is
not penalized. No communication/voice score is invented.

Coverage counts fully, partially and not assessed criteria separately. Its
percentage is `(assessed + partiallyAssessed) / criteriaTotal * 100`, rounded to
two decimal places: the share with usable evidence, not a performance percentage.

No approved rule maps the frozen 0–4 dimensions to the existing written-scorecard
verdict aggregation. Therefore overallScore is always null and the explicit rule
is NONE_APPROVED_FOR_0_4. Frozen weights remain inspectable but no equal weighting,
missing-evidence zero or unexplained overall percentage is introduced.

## Evidence validation and trace

The closed shared schema rejects extra decision/trait fields. Independently verify
report identity, inputHash, report/evaluator/rubric versions, all frozen criteria
and labels, score/status invariants, source references, findings and coverage.

Every evidence item names criterion, question, turn and persisted final-answer
event sequence. The source must be a certain final transcript with complete
question delivery and the same criterion mapping. Its quote must equal exactly
`answer.text.slice(startOffset, endOffset)`; verify bounds and nonempty spans.
Offsets are JavaScript UTF-16 code units. Spans splitting a surrogate pair are
rejected. There is **no normalization**, case folding, whitespace folding or Arabic
character rewriting. What HR sees is the exact persisted quote.

Evidence ids must be unique, criterion question/turn references must equal its
evidence references, and every strength/concern must reference valid evidence
belonging to its criterion. Coverage gaps are limitations, never candidate
weaknesses. All scores, findings and evidence use the same independent validation.

Chosen invalid-evidence policy: reject the entire report, set evaluation FAILED
with EVIDENCE_VALIDATION_FAILED, and persist no untrusted report or invented quote.
The browser shows a safe retry and preserved interview status/answers. It never
presents the fabricated quote as trusted evidence.

Clicking an evidence card opens the original question and finalized answer with
the verified span highlighted. The HR-only question/answer trace includes base,
follow-up/clarification references, final answers, assessed criteria and evidence
links. No transient partial transcript is displayed.

## Human review and audit

Review is independent metadata beside the immutable generated report: status,
reviewedBy, reviewedAt and note. UNREVIEWED clears reviewer/time. A review command
is version-checked, idempotent and permission-checked; the persisted report/input
remain byte-identical. The version selector preserves review context for older
reports. Review never calls an application-status or hiring route.
Editing a review pins its report version. Switching version clears the previous
view and draft before loading the selection; changing interview remounts the
page cache. Late reads cannot bind a note to a different report/candidate.
Numeric score and coverage fractions use isolated LTR spans within Arabic RTL.

The existing interview AUDIT record mechanism records EVALUATION_REQUESTED,
EVALUATION_RUNNING, EVALUATION_COMPLETED, EVALUATION_FAILED, EVALUATION_RETRIED and
REPORT_REVIEWED. Payloads contain action, ids, report version and safe failure or
review status only. Transcript, evidence, evaluator error details and review notes
are excluded. COMMAND receipt fingerprints are SHA-256, never plaintext requests.

## Verification and manual demo

Use the Phase 3 local fixture instructions in `phase-3.md`. No AI key is needed.
Complete a mock interview, open its HR report, run evaluation, inspect evidence,
save review, refresh, and select report versions. Candidate completion never
reveals the HR report. Production mock candidate controls remain disabled.

From the repository root:

```powershell
$env:AI_INTERVIEW_TEST_DATABASE_URL='postgresql://phase2_test@127.0.0.1:55442/postgres'
npm.cmd run check:ai-interviewer:report -w @hr/server
npm.cmd run check:ai-interviewer:report:browser -w @hr/server
npm.cmd run check:ai-interviewer:persistence -w @hr/server
npm.cmd run check:ai-interviewer -w @hr/server
npm.cmd run check:ai-interviewer:ui -w @hr/server
npm.cmd run check:ai-interviewer:browser -w @hr/server
npm.cmd run check
npm.cmd run build -w hr-app
```

Run existing Voice, Local Voice (synthetic process-only configuration), MCP,
permissions and scorecard regressions as recorded in `phase-4-verification.json`.
Focused tests use disposable local PostgreSQL and prohibit external connections.
The browser wrapper reuses the complete Phase 3 Chrome/CDP lifecycle and adds HR
evaluation, invalid evidence, not-assessed, failure/retry, version/review and RTL
cases. Test-only scenario selection and synthetic interview setup use private
fixture stdin, require PHASE4_REPORT_TESTS=true and have no HTTP endpoint. Their
output still goes through the same validation and transaction path.
The browser warning/grace check advances relative to backend remainingMs rather
than a fixed wall-clock assumption, and still asserts the exact 15-second grace
boundary. Browser latency cannot silently skip the observation window.
One concrete Phase 3 recovery defect was also reproduced and fixed: a 409 could
reuse a poll begun before the conflict. Reconciliation now drains that read and
performs a fresh read; it never retries the mutation. The new targeted UI check
fails on the old code and increases the baseline UI suite from 23 to 24 checks.

Browser screenshots and results are under `.local-dev/ai-interviewer-phase4`;
inventories, exact verification commands, final counts and SHA-256 evidence are
recorded in `phase-4-verification.json`. Source/training and migration baselines
are checked separately. The configured remote database is not touched.

## Recorded verification

| Verification | Result |
| --- | --- |
| Phase 4 source, evidence, PostgreSQL, jobs/security/review | 76/76 PASS |
| Phase 4 full browser lifecycle (44 existing + 14 report cases) | 58/58 PASS |
| Phase 3 frontend (23 existing + conflict/poll regression) | 24/24 PASS |
| Phase 3 standalone browser regression | 44/44 PASS |
| Phase 1 deterministic engine | 37/37 PASS |
| Phase 2 persistence/security, including written interview routes | 65/65 PASS |
| MCP authorization | 18 scenarios PASS; 69 tools for invalid-auth states |
| Voice, Local Voice, permissions and scorecard | PASS |
| Contracts/API/web typechecks and production build | PASS |

Candidate pages and the backend mock fixture completed zero external requests.
The HR shell's five font requests were intercepted and blocked separately.
Microphone and WebRTC invocations were zero. The production build remains byte-
identical with the development mock flag explicitly true, and contains no
MockControls chunk or provider-failure control text. The two pre-existing lint
warnings and the Vite application chunk-size advisory remain; checks/build pass.
The standalone Phase 3 browser result and all source/evidence hashes are recorded
in the verification JSON.

## Limitations and deferred work

- Synthetic anchor scores demonstrate architecture, not real candidate assessment.
- There is no approved overall aggregation; report coverage is separate.
- The existing single-process maintenance/rate-limit deployment limits remain.
  The DB lease fences stale workers but no distributed worker system is added.
- Review stores the current note; minimal audit retains review action metadata,
  not a full note revision history.
- Advanced rubric revision UI, export/PDF, ranking and hiring automation are absent.
- No real model, OpenAI, WebRTC, microphone, STT, TTS, raw audio or new application
  WebSocket server. Training/benchmark assets are untouched. Stop after Phase 4.
