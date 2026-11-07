# Phase 5.1 — reproducible baseline

Scope: verification and evidence infrastructure only. No Phase 5.2, interview
provider, STT/TTS integration, architecture, authorization, engine or evaluation
behavior change is authorized by this package.

The recorded run is `runs/20261103T074721Z`. Its `REPORT.md` and `summary.json`
contain the final results. Existing suites and their assertions are unmodified.
`artifact-manifest.json` lists every package file and its SHA-256, excluding the
manifest itself. No package manager install or network download is required.

## What is fingerprinted

`manifest.mjs` hashes raw bytes, records repository-relative forward-slash paths,
sorts paths ordinally, and serializes JSON with fixed indentation and a final LF.
It excludes timestamps, machine-specific absolute paths and generated build
outputs. `filesDigest` hashes the UTF-8 compact JSON serialization of the sorted
`files` array; the actual JSON manifest also has a separate file SHA-256.

The source scope includes all API source/scripts/migrations (not just interview
modules), all contract and web source/public files, and the enumerated root,
workspace, TypeScript, Vite and deployment configuration files. Migration 0026
and the full migration journal/inventory are included. There are currently no
migrations after 0026. Dependencies are represented by package/lockfile hashes;
this baseline uses the installed dependencies and does not claim a fresh offline
`npm ci` was performed.

The separate protected manifest covers the earlier AI Interviewer documentation,
all `docs/fine-tuning` files, and earlier Phase 3/4 local evidence. Old Chrome
profiles are excluded because they are transient browser state. The new package
is excluded from both source and protected inventories. Protected files are read
only for hashing; their contents are never copied into this evidence package.

## Reproduce

From the repository root in PowerShell, use a NEW run id each time. The runner
refuses to overwrite suite results. Prerequisites: the currently installed Node
and npm packages; local PostgreSQL accepting the existing synthetic test role
on port 55442; installed Chrome; free ports 5179, 5180, 8793 and 9333.

```powershell
# Only if the existing test cluster is stopped:
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' -l '.\.local-dev\ai-interviewer-postgres\postgres.log' -o '-h 127.0.0.1 -p 55442' start -w

$phase51Run = 'new-unique-run-id'
node docs/ai-interviewer/phase-5.1-baseline/run.mjs $phase51Run init
node docs/ai-interviewer/phase-5.1-baseline/run.mjs $phase51Run all
# If FAIL is reported, STOP and investigate. Do not change a passing test.
node docs/ai-interviewer/phase-5.1-baseline/run.mjs $phase51Run integrity
node docs/ai-interviewer/phase-5.1-baseline/run.mjs $phase51Run cleanup
node docs/ai-interviewer/phase-5.1-baseline/summarize.mjs $phase51Run

# Stop only a test cluster that this run started, after all tests have exited:
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' stop -m fast -w
```

The runner executes the exact existing Node entrypoints with their documented
flags; `inventory.json` maps them to npm commands. The four components of
`check:voice:local` are run individually so each has its own result. `npm run check`
and the production web build run through npm itself. Child environments are
allowlisted: no retained `.env`, ambient API keys, employee accounts or production
database URL are inherited. Only synthetic process-local configuration is used.

To regenerate the deterministic source/protected inventory independently:

```powershell
node docs/ai-interviewer/phase-5.1-baseline/manifest.mjs source current-source.json
node docs/ai-interviewer/phase-5.1-baseline/manifest.mjs protected current-protected.json
Get-FileHash -Algorithm SHA256 current-source.json,current-protected.json
```

Byte-compare these files with the recorded `source-before.json` and
`protected-before.json`. Delete only the two newly generated comparison files
when finished. A suite can also be invoked with `run.mjs RUN_ID SUITE_ID` after
initialization. Its result must not already exist.

## Isolation and evidence handling

`guard.cjs` is a test-only Node preload inherited by spawned Node processes.
It permits only the suite's enumerated loopback TCP/fetch destinations. Existing
tests retain their own stronger guards. Tests replace fetch with in-memory
doubles where appropriate; the remaining socket guard blocks accidental I/O.
The recorded counters distinguish allowed local operations from blocked external
attempts. A blocked external attempt makes the runner FAIL.

The existing browser harness still performs all assertions and screenshot
capture calls. The preload redirects its evidence writes to this run, suppresses
PNG persistence and `fixture.json` (which contains a synthetic password), and
removes screenshot filenames from the copied result artifact. It does not alter
interview requests, DOM state or assertions. Chrome profiles live in a separate
temporary directory and are deleted by the bounded cleanup operation. Browser
page traffic uses the existing CDP request interception, with external font
attempts blocked before delivery. A Chrome resolver restriction is added for
nonlocal names. Native browser background traffic is not packet-captured; this
package does not claim a system-wide network measurement.

Logs are sanitized for credential-shaped strings, URLs containing database
credentials, token query values and credential fields. Successful logs contain
synthetic scenario text only. No secrets, browser cookies, fixture credentials,
raw invitation tokens or production environment values are retained.

The migration probe imports the same Drizzle migrator used by the application,
uses the real complete journal/SQL without fixtures or substitutions, creates a
unique local database, and drops only that generated database. Missing pgvector
is BLOCKED; no extension is faked and no migration is skipped. If available,
it also verifies all 27 journal rows, the three interview tables and a no-op
second migration run. Prior fixture-based PostgreSQL tests are separate evidence.

## Current architecture and supported assumptions

HR recruitment UI -> authenticated HR/Admin routes -> InterviewService -> pure
InterviewEngine -> PostgreSQL snapshot, ordered events and command receipts.
Candidate UI uses a separate interview-bound HttpOnly cookie, safe projection,
polling/replay and server-derived timers. Completed interviews feed frozen,
versioned report jobs and independent exact-evidence verification, then HR review.
Employee Voice/Copilot/MCP retains independent employee-session/RBAC checks.

- One application process and one runtime owner; runtime ownership is restart
  recovery, not a distributed lease. Do not deploy multiple active instances on
  the strength of this baseline.
- PostgreSQL is the durable authority. Row locks, versions and unique receipts
  protect transitions and retries; frontend busy flags are supplementary.
- Rate limiting is process-local. Forwarded-address trust depends on a correctly
  configured edge proxy.
- No real candidate interview provider or production candidate STT/TTS/WebRTC
  transport exists. Existing employee voice paths do not authorize candidates.
- Question selection/follow-up policy and evaluator are deterministic mocks.
  Production START must remain fail-closed and production mock routes absent.
- Evaluation remains frozen/versioned and verified; the legacy mock per-answer
  evaluator also runs during answer processing. Real model evaluation is absent.
- Invitation possession is the candidate identity proof; it is not independent
  human identity verification. Current HR/Admin recruitment authority is role-wide.

## Known limitations retained for later approval

Unsubmitted text and uncertain retry state are memory-only; refresh can lose
unsubmitted content. Real browser network loss does not establish a trusted
server pause. No real PLAY/STOP delivery worker exists. Evaluation execution has
no enforced provider timeout and sequential maintenance can be blocked by a
future hanging evaluator. Distributed runtime/rate-limit guarantees, retention
and deletion operations, report-view auditing and richer safe diagnostics remain
absent. Full migration-chain validation needs a pgvector-capable test server.

These are preserved audit findings, not implemented Phase 5.2+ work. A PASS in
an offline mock suite is not production provider readiness. Any required blocked
validation keeps the overall Phase 5.1 result BLOCKED.
