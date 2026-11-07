# Phase 5.3 — Bounded Jobs & Runtime Recovery

This package contains the before-state audit, execution policy, offline runner,
raw results and source/artifact hashes. Accepted Phase 5.1 and Phase 5.2 packages
are immutable. Release remains BLOCKED for pgvector/full-chain validation and live
local voice E2E. No Phase 5.4 work is authorized or implemented here.

Authoritative results: [final report](runs/final-20261103/REPORT.md),
[summary](runs/final-20261103/summary.json),
[runtime matrix](runs/final-20261103/runtime-matrix.json),
[source changes](runs/final-20261103/source-changes.json).

## Prerequisites and reproduction

Run in the repository root using installed Node/npm, existing dependencies, local
Chrome and the existing disposable PostgreSQL cluster on loopback port 55442.
Do not use a real/developer database. No API keys or provider configuration are
needed. The child environment is allowlisted; retained .env files are not loaded.

If this exact test cluster is stopped, start it with:

```powershell
& '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe' -D '.local-dev/ai-interviewer-postgres/data' -l '.local-dev/ai-interviewer-postgres/phase53-server.log' -w start
```

Use a new run name for every reproduction; the runner refuses to overwrite a
completed result. It executes original entrypoints plus the two new additive
checks. The `inventory.json` file records exact working directories, actual Node
arguments and allowed loopback ports for each command.

```powershell
$phase53Run = 'your-new-unique-run-id'
node docs/ai-interviewer/phase-5.3/run.mjs $phase53Run init
node docs/ai-interviewer/phase-5.3/run.mjs $phase53Run all
node docs/ai-interviewer/phase-5.3/run.mjs $phase53Run integrity
node docs/ai-interviewer/phase-5.3/run.mjs $phase53Run cleanup
node docs/ai-interviewer/phase-5.3/evidence.mjs $phase53Run
node docs/ai-interviewer/phase-5.3/verify.mjs $phase53Run
```

If the command host disconnects, let an existing runner finish. When it has
exited, a missing suite can be run individually using its inventory ID:

```powershell
node docs/ai-interviewer/phase-5.3/run.mjs $phase53Run browser3
```

Do not rerun existing results under the same name or resume after an application
source change. Preserve failures, investigate and start a fresh final run.

If this phase started the test cluster, stop that exact cluster afterwards:

```powershell
& '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe' -D '.local-dev/ai-interviewer-postgres/data' -m fast -w stop
```

The migration probe intentionally remains BLOCKED on this environment because
pgvector is absent. Do not install a stub/skip the migration to obtain PASS. Live
voice E2E is not executed because its accepted worker/configuration blocker is
still open. All executable suites must PASS independently of these blockers.

## Evidence and safety boundaries

- `before-state.md` was completed before application changes.
- `design.md` documents the 30-second timeout, two-call admission, scheduling,
  fencing, retry, restart and privacy policies, including non-preemptible CPU work.
- `source-before.json` is an exact copy of accepted Phase 5.2 source evidence.
- Each run records source before/after and earlier evidence before/after. Final
  generation checks both immutable package artifact manifests and all listed files.
- `source-final.json` covers source/scripts/migrations/contracts/web/config files;
  `source-changes.json` identifies every difference from accepted Phase 5.2.
- `artifact-manifest.json` covers all files in this new package except itself.
  Its hash is reported separately when the package is finalized.
- Synthetic database names are generated uniquely; test cleanup drops only those
  databases. Browser output is redirected into this package; credential-bearing
  fixture files and screenshots are suppressed. Temporary Chrome profiles live
  only under `.local-dev/phase53-temp/RUN_ID` and cleanup checks that boundary.
- Node socket/fetch calls are guarded and counted. Original page interception
  blocks nonlocal browser page requests. Native Chrome background traffic is not
  independently packet-captured; the application makes no real model/provider call.
- Early `development-1` results are retained separately; the complete final run
  establishes the final frozen source state. Diagnostic rows contain synthetic
  identifiers/hashes, never credentials or candidate answer text.

Production contracts/API/web builds emit generated files outside the source
inventory. The unchanged API copy helper's resolved recursive replacement target
was verified inside `services/hr-api/dist/services/hr-api/drizzle` in this workspace.
No accepted evidence directory is a build/cleanup target.
