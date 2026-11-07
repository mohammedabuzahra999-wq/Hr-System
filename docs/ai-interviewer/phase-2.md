# AI Interviewer — Phase 2

Status: persistence, candidate security and restart recovery implemented. Stop at
Phase 2: no final UI, real AI, audio, WebRTC, WebSocket, email/OTP, candidate user
registration, Copilot/MCP access or automated hiring decision is connected.

## Inspection and Phase 1 compatibility

The implementation follows the existing Drizzle schema, handwritten additive SQL
migrations and journal, Hono routes, `manageRecruitment`, SHA-256 opaque credential
pattern and `.check.ts` checks. Phase 1 had a version **field**, but no
expected-version gate or hydration API. Phase 2 adds `InterviewEngine.restore`
and enforces expected versions in the service transaction. No Phase 1 transition
or timer rule was redesigned; its 37 checks and demo remain passing.

Existing written interviews are still separate and retain their one-per-
application relationship. Existing employee authentication, Voice/Local Voice,
Copilot/MCP and fine-tuning artifacts were not changed. Shared entry-point changes
only register the new routes/maintenance and exclude candidate/join URLs from
general request logging. The existing log behavior for other routes is preserved.

## Database model and migration

`services/hr-api/drizzle/0026_ai_interviewer.sql` is the sole new migration,
registered as journal entry 26. It adds exactly:

| Table | Source of truth |
| --- | --- |
| `ai_interviews` | Serialized domain snapshot; immutable approved inputs; consent, credential hashes, runtime checkpoint and pending playback effects |
| `ai_interview_events` | Ordered domain events, compact staff audit and committed-command receipts |
| `ai_interview_evaluations` | Versioned final report/job lifecycle, input hash, evidence results and coverage |

An interview references the existing application. Candidate and vacancy relations
are resolved through that application. No duplicate people, jobs or accounts were
created. Attempts are numbered under an application row lock. Only one open
attempt is permitted; recoverable failures also block creating another attempt.

The JSON snapshot is authoritative for status, phase, current question/turn,
language, plan, counters and timer. These are not duplicated into competing
columns. The `version` column is a query/concurrency projection with a PostgreSQL
CHECK against snapshot.version. `last_sequence` counts every durable record;
the engine's eventSeq continues to count its own domain events only. Durable
record sequences and domain event sequences intentionally have separate scopes.

READY freezes the HR-provided plan/prompt banks already in the snapshot, validated
rubric, criteria and explicit weights derived from an approved job description,
source document id, evaluator version and config version. Unknown criterion keys
are rejected. Later JD edits never reweight this interview. There is no edit-after-
READY or silent reevaluation API.

The migration was applied through the existing command to the configured project
database. Public table count changed from 37 to 40. Before/after hashes of columns,
constraints and indexes for all 37 previous tables matched. No existing table was
dropped, renamed, rewritten or altered. Existing migration history was inspected
first: 26 migrations were already recorded, through entry 25.

## Command transaction, concurrency and idempotency

Each engine/business command is handled in a PostgreSQL transaction:

1. Lock the aggregate row (`FOR UPDATE`). Creation locks the application row.
2. Recheck candidate scope/credential or the staff user's current active role.
3. Find a committed receipt for the command id. Identical retries return current
   state with `duplicate=true`, without reissuing effects or secrets.
4. Compare expectedVersion. Stale commands fail with 409.
5. Hydrate and run the deterministic engine, or the authorized security operation.
6. Append validated domain events, compact audit and a command receipt.
7. Update any report lifecycle record and save the aggregate with a version-
   conditional UPDATE. Commit everything together.

Receipt uniqueness is enforced by a partial unique index on
`(interview_id, command_id)` for COMMAND records. The receipt contains a hash of
the principal, command and expected version, not submitted text or secrets.
Changed content under an accepted id is a conflict. Idempotency is checked before
the old expected version, so a lost acknowledgement can be retried after restart.
Rejected commands are not receipted. No in-memory map determines durable results.

Creation also deduplicates under the application lock. Credentials use separate
security transitions under row locks; a one-use invitation exchange does not
require an unauthenticated client to know the aggregate version.

Domain events, security operations and recovery can produce multiple records in
one transaction. Security-only operations increment the snapshot version; restart
recovery may reconcile a tick and then pause, incrementing it for both internal
transitions. Clients must use the returned current version rather than assume a
fixed increment. Failed writes roll back the entire transaction, including events.

## Candidate invitation and session security

HR/Admin creates an interview, marks it ready and issues an invitation:

```text
POST /api/recruitment/applications/:applicationId/ai-interviews
POST /api/recruitment/applications/:applicationId/ai-interviews/:id/ready
POST /api/recruitment/applications/:applicationId/ai-interviews/:id/invitation
POST /api/recruitment/applications/:applicationId/ai-interviews/:id/revoke-invitation
POST /api/recruitment/applications/:applicationId/ai-interviews/:id/cancel
GET  /api/recruitment/applications/:applicationId/ai-interviews/:id
```

Versioned staff actions accept `{commandId, expectedVersion}`. Creation accepts
`{commandId, plan, rubric}`. Role checks use the existing capability registry and
recheck the active user in the service; Managers and employees are denied. An
application id supplied in the route must match the interview's application.

Invitation secrets use `randomBytes(32)`, encoded base64url. Only a purpose-
separated SHA-256 digest is stored, along with expiry, revocation and consumption
times. Default invitation lifetime is 24 hours. Issuance is allowed in READY or
PAUSED. Reissuing invalidates the previous invitation and candidate session.
Revocation also invalidates the session and safely pauses active interviews,
including when their answer deadline needs reconciliation first.

The plaintext invitation is returned once to the authorized issuer. A duplicate
issuance command returns `token=null`; it cannot recover a stored plaintext
secret. HR must issue a new command/invitation if that initial response was lost.
No email delivery is performed.

```text
POST /api/ai-interview/session/exchange  {token, interviewId?}
GET  /api/ai-interview/session
GET  /api/ai-interview/state
POST /api/ai-interview/commands
GET  /api/ai-interview/events?afterSequence=N
```

Exchange consumes the invitation once and creates an opaque, interview-bound
random session credential. Only its SHA-256 is stored in the aggregate. It is
valid for at most two hours and cannot outlive the invitation's expiry. There is
one active candidate session per interview; rotation/revocation clears its hash.
The candidate is resolved through the existing application, never a `users` row.
The session version counter records rotations; hash replacement/clearing is the
authoritative revocation mechanism. Sessions can survive process restart.

The cookie is `ai_interview_session`, HttpOnly, host-only, SameSite=Lax, Secure in
production, expiring, with Path `/api/ai-interview`. It is never `hr_session` and
is never put into localStorage or returned in JSON. Session lookup checks scope,
expiry, hash with timing-safe equality, revocation and lifecycle accessibility on
every operation. A guessed interview id never expands its scope.

New mutating endpoints require an explicitly allowed Origin. All new responses
use `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. The
exchange is a POST body, not a token-bearing API URL. Candidate API and future
`/interview/join` URLs are excluded from request logging. A future join UI must
exchange then remove `?token` using replace navigation; that UI is not built here.

## Candidate commands, consent and DTOs

Candidate command bodies contain `{interviewId, expectedVersion, command}`.
The command includes its stable commandId. The allowlist is START, USER PAUSE,
RESUME, CANCEL, candidate speech-start/finish and final transcript, plus
`ACCEPT_CONSENT` with policyVersion `ai-interview-v1`. Internal playback, tick,
processing, ready/fail and report commands are not accepted from candidates.
Wrong/closed turn ids are still rejected by the engine.

Consent is stored with the server timestamp and policy version before START.
Even a system-originated start is refused without required persisted consent and
frozen inputs. Transport observations and processing are driven by internal mock
services in this phase; no public endpoint grants provider authority.

Candidate state is an explicit strict DTO: status/phase/version, language,
current delivered question, current turn, playback text/id, safe timer,
consent status and replay position. It does not contain a future plan, rubric,
weights, criterion internals, HR notes, application decision, evaluation, hashes,
audit or raw database row. HR responses are also explicitly projected so that
credential hashes/session secrets are not casually returned.

## Timer persistence and restart recovery

Phase 1's timers are serialized without recomputing their limits from today's JD.
PAUSED stores exact remaining milliseconds. RESUME creates a new deadline from
that duration. The test case uses 120 seconds minus 45 seconds, followed by a
five-minute outage: the candidate retains 75 seconds.

Each process has a runtime owner id. On access or maintenance, an ACTIVE aggregate
owned by an old process is reconciled at its **last durable healthy observation**,
then moved to PAUSED with SERVER_RESTART. Offline wall time is never treated as
healthy listening time. Current question/turn/counters are preserved. Candidate
must explicitly resume using a valid session and current version. Delivery is
re-requested with a new playback id after resume, so stale delivery-finished
events cannot start a timer. Already PAUSED and COMPLETED/PENDING states reload
without losing their semantics.

The maintenance loop supplies authoritative ticks and deterministic answer
processing. It checkpoints healthy listening and uses conditional version checks
to avoid overwriting concurrent commands. It never supplies real audio or marks
playback finished on behalf of a candidate/provider. At restart, only time known
at the last checkpoint can be preserved precisely; unknown time since that point
is conservatively not charged. This is the intentionally safe Phase 2 policy.

## Durable event replay and audit

Events have a durable per-interview sequence, event type/id, command id, state
version, source, actor reference, validated payload and timestamp. DOMAIN records
retain the engine event; AUDIT records are minimal action codes for creation,
freeze, invitation issuance/revocation and staff cancellation. COMMAND records
carry hashed receipts. This follows the existing assistant audit's data-
minimization principle without misclassifying a candidate as a staff assistant.

`getEventsAfter` supports ordered replay; `getEventsPage` also returns a cursor
and hasMore. Pagination is bounded to 100 scanned records. Candidate replay
contains only allowlisted `{sequence,type,at}` metadata; the cursor advances even
across internal-only records, so filtering cannot stall reconnect. There is no
production SSE or WebSocket server.

Snapshots are authoritative checkpoints, not a promise that every transient
intermediate draft can be rebuilt from an event-only reducer. Phase 2 reloads
validated snapshots plus immutable frozen inputs and durable receipts. Final
answers and meaningful domain events are retained. Partial transcript commands
are refused by the persistence service; draft partial text is removed before
writing. Raw audio is never stored. Phase 1's in-memory partial simulation remains
available without persistence.

## Evaluation lifecycle, reproducibility and evidence

COMPLETED interview + PENDING evaluation is durable. The completion transaction
creates the versioned evaluation row. A separate internal report command checks
every assessment against finalized answer events loaded from PostgreSQL, including
turn/question/criterion/dimension references and exact UTF-16 text spans. Invalid
or duplicated evidence references cause rejection and rollback; they do not become
trusted evidence. The mock report is separate from the interview lifecycle.

The input SHA-256 uses canonical sorted object keys, preserved answer order,
frozen rubric/criteria/weights/config/evaluator version, finalized answer content
and relevant metadata, included durable sequence and state version. Unrelated
finalization timestamps are excluded. The completion receipt anchors the input
version, so the later report command does not accidentally change its own input
hash. Changed answers, rubric or included version change the hash.

Reports store status, report version, input hash, included sequence, evaluator and
rubric versions, structured results/coverage, failure/retry fields and timestamps.
The schema supports RUNNING/FAILED for future workers; the deterministic mock
report currently completes synchronously in one internal command. A rejected
report remains PENDING. No production async report worker or HR review UI is
claimed. Phase 1 per-turn evaluations remain part of its snapshot; final report
publication is the separate evaluation record. No overall score or hiring decision
is generated, and application status is never automatically updated.

## Verification and reproduction

From the repository root:

```powershell
# Start the already-provisioned local test cluster when it is stopped.
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' -l '.\.local-dev\ai-interviewer-postgres\postgres.log' -o '-h 127.0.0.1 -p 55442' start -w
# Use a LOCAL disposable PostgreSQL server, never the application database.
$env:AI_INTERVIEW_TEST_DATABASE_URL='postgresql://phase2_test@127.0.0.1:55442/postgres'
npm.cmd run check:ai-interviewer:persistence -w @hr/server
npm.cmd run check:ai-interviewer -w @hr/server
npm.cmd run demo:ai-interviewer -w @hr/server
npm.cmd run check
npm.cmd run check:voice -w @hr/server
npm.cmd run check:scorecard -w @hr/server
npm.cmd run check:permissions -w @hr/server

# After local DB checks, stop only this test cluster.
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' stop -m fast -w

# Offline legacy Local Voice checks need synthetic configuration, not a DB.
$env:DATABASE_URL='postgresql://synthetic:synthetic@127.0.0.1:1/phase2_not_connected'
$env:SESSION_SECRET='phase2-offline-regression-synthetic-secret'
npm.cmd run check:voice:local -w @hr/server

# From services/hr-api:
node --conditions=development --import tsx src/mcp/authorization.security.check.ts
```

The persistence check refuses remote database URLs and never falls back to
DATABASE_URL. It creates a uniquely named test database, uses synthetic legacy
parents, applies the new migration verbatim inside a transaction, runs actual
PostgreSQL locks/concurrency/rollback checks, then drops only that generated test
database. Legacy fixture vector/enum columns not exercised by these checks use
nullable text, so a vector extension is not required. New tables, constraints,
indexes, transactions and service queries are real PostgreSQL, not mocks. Existing
written-interview route handlers are also exercised with synthetic local rows.

Network guards allow only the chosen loopback PostgreSQL port and reject fetch,
HTTP(S) and other socket connections. Final results: 65/65 Phase 2 checks, 37/37
Phase 1 checks, zero external attempts in the Phase 2 suite. The four explicit
Candidate A → B attempts (GET state, POST command, GET replay, RESUME) all fail.
MCP authorization's 18 scenarios, Voice, Local Voice, permissions and scorecard
checks pass. Workspace typechecks pass; the web check retains the existing
set-state-in-effect warnings in GapForm.tsx and ScorecardEditor.tsx.

The standard application migration command executed separately from offline
tests was:

```powershell
npm.cmd run db:migrate -w @hr/server
```

Applying/inspecting the configured database necessarily used its existing network
connection. Those administration calls are separate from the offline test count;
no AI API was called. A portable PostgreSQL runtime was provisioned under
`.local-dev/ai-interviewer-postgres` outside the tests, using the same verified
PostgreSQL 18.6 archive already recorded by the project's earlier backup. No npm
package or dependency/lockfile changed. The local server is stopped after checks;
the runtime can be reused to run them without internet.

`phase-2-verification.json` records source/test/migration hashes, file inventory,
commands, results and schema comparison. Frozen training, benchmark and model-
selection artifacts are excluded from modifications.

## Known limitations and deferred work

- Single application process is the supported runtime policy. Multiple healthy
  processes need shared runtime leases/ownership; the current restart-owner
  policy must not be represented as multi-server coordination.
- Existing rate limiting is per-process memory. Limits are reasonable for this
  verification phase, not a distributed abuse-control solution.
- Invite links prove possession, not independently verified human identity.
  OTP/email and account registration are intentionally absent.
- Candidate sessions last two hours. After expiry during ACTIVE, HR can revoke
  (pausing the interview) and issue another invitation in PAUSED. No silent renewal.
- Pending playback effects are durable preparation for later dispatch; a real
  provider/outbox delivery worker and audio provenance are not implemented.
- Runtime heartbeats describe the server's last known healthy point, not proof
  that a browser remained connected. Real connection-loss observation belongs to
  the later transport; explicit pause/disconnect commands already freeze time.
- Retention/deletion operations, final consent wording, production evaluation
  rubric validation and human review workflows still need their later phases.
- No final UI exists, and no provider playback endpoint is exposed to candidates.
  Phase 2 proves progression through authorized internal mocks/tests.
- Stop here. Phase 3 UI, Phase 4 review UI and Phase 5 real provider integration
  have not been started.
