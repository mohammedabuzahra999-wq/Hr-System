# Phase 5.2 — answer preservation and submission recovery

Implementation and verification are confined to answer submission and recovery.
Step 1 remains in before-state.md. design.md describes the commit boundary,
candidate states, storage envelope, exact retry semantics and security limits.
The final report is `runs/final-20261103-verified-2/REPORT.md`, with machine-readable results,
per-scenario database/browser matrices, source diffs and hashes beside it.

Phase 5.1 remains **BLOCKED — environment validation blockers only, with clean
executable regression**. Its accepted source manifest remains
`06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163`.
The original package is never written by this phase's tools. The full migration
chain needs genuine pgvector, and live local voice E2E needs the STT/TTS worker
plus an isolated synthetic real-engine configuration. Both are open release
blockers and are not waived by a Phase 5.2 PASS.

## Reproduce from the repository root

Requirements: installed Node/npm dependencies, installed Chrome, the existing
local disposable PostgreSQL test runtime on loopback port 55442, and unused
ports 5179/5180/8793/9333. No npm install, provider key, microphone, external API,
real employee/candidate account or developer application database is needed.

```powershell
# Start only if this test cluster is stopped:
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' -l '.\.local-dev\ai-interviewer-postgres\postgres.log' -o '-h 127.0.0.1 -p 55442' start -w

$phase52Run = 'new-unique-run-id'
node docs/ai-interviewer/phase-5.2/run.mjs $phase52Run init
node docs/ai-interviewer/phase-5.2/run.mjs $phase52Run all
# On FAIL, stop and investigate. Never weaken an existing assertion.
node docs/ai-interviewer/phase-5.2/run.mjs $phase52Run integrity
node docs/ai-interviewer/phase-5.2/run.mjs $phase52Run cleanup
node docs/ai-interviewer/phase-5.2/evidence.mjs $phase52Run

# Stop only the test cluster this run started, after every suite has exited:
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' stop -m fast -w
```

The runner refuses to overwrite existing suite results. New runs need new ids.
For a single suite, use `run.mjs RUN_ID answer-ui`, `answer-db` or `answer-browser`
after init. Existing suites have their original ids in inventory.json. The
documented npm entrypoints added are `check:ai-interviewer:answer`,
`check:ai-interviewer:answer:ui` and `check:ai-interviewer:answer:browser`; the
evidence runner supplies their safe configuration and executes the same Node
entrypoints. The browser wrapper refuses unisolated execution to protect older
browser evidence.

`all` reruns all executable original baseline entrypoints, independent Phase 3
and Phase 4 browser suites, the new answer tests, and the exact full-chain
migration probe. Missing pgvector must remain BLOCKED, not be skipped/faked or
reported as migration PASS. The unavailable live voice E2E check is explicitly
recorded as BLOCKED. Live employee Ollama inference smoke scripts remain outside
the mock interview Phase 1–4 regression; no real model inference is invoked.

## Evidence and integrity

- Root `source-before.json` is the accepted pre-change 414-file source inventory.
- Each run's `source-before.json` fingerprints the implemented code before that
  test run, and `source-after.json` verifies stability during verification.
- `source-final.json` and `source-changes.json` record the final inventory and
  every source/config filename created/modified/deleted, with SHA-256 values.
- `phase51-preservation-after.json` checks every original package file, the
  original artifact manifest itself, the accepted source-manifest hash, and all
  previously protected Phase 1–4 evidence/training files.
- `answer-database-matrix.json` records actual PostgreSQL versions/state, answer
  and receipt counts, finalized events, follow-up decisions and pending effects.
- `answer-browser-matrix.json` records candidate recovery state and the matching
  durable fixture state at refresh, disconnect, commit-before-ack, rollback,
  retry and real same-session two-tab transitions. It omits answer text/UUIDs.
- `artifact-manifest.json` lists every new phase package file and SHA-256,
  excluding itself. Development runs and their failures are preserved separately
  from the final verification; see iterations.md for their disposition.

The test-only preload allowlists loopback ports, sanitizes logs, redirects all
old Phase 3/4 evidence output to the new run, suppresses fixture credential files
and screenshots, and puts Chrome profiles in a bounded temporary directory.
`cleanup` deletes only that run's temporary profile directory. Close each run
before starting another browser suite; their test ports are intentionally fixed.
Extra browser scenarios dispose completed contexts so unused tabs do not keep
polling or contaminate subsequent rate-limit/concurrency tests. Limits are not
raised or bypassed.

The browser fixture gained opt-in local stdin controls for metadata inspection
and database fault injection. They only exist in a uniquely named synthetic
local database process and are never HTTP endpoints or production routes. The
existing browser suite gained one opt-in extension hook; its original assertions
and default 44/58 baseline counts are unchanged.

## Storage and limits

Recovery uses one closed-schema sessionStorage record per tab, bounded to two
hours and the current authenticated candidate session lifetime. It contains only
answer text, interview/question/turn/session-generation ids, expiry, and the
frozen submission UUID/expected version. It contains no credentials and cannot
authorize any server operation. It is plaintext accessible to same-origin
scripts/device owners, not cross-device backup. Browser storage removal is best
effort if access is blocked; scope/expiry are revalidated before redisplay.

A candidate can see local draft, submitting, committed and recovery-required
states. Only validated server proof produces committed/success. Storage failure
warns explicitly and prevents sending a new unrecoverable request. No silent
rebase/resubmit occurs. Changed versions require explicit review; failed or
conflicting copies remain visible within the lifetime until confirmation,
security cleanup or explicit discard. Scope change, expiry and revocation must
not expose recovery text to another session.

The one-process/runtime-owner policy, server deadlines and production START
fail-closed behavior remain. Restart tests use a fresh service/runtime owner on
real durable PostgreSQL rather than OS process termination. Real network loss
does not prove server pause. Phase 5.3, real provider/voice/WebRTC, distributed
runtime and server retention work are not started.
