# Phase 5.5 evidence

Authoritative results: [final report](runs/final-20261103/REPORT.md),
[summary](runs/final-20261103/summary.json),
[exact commands](runs/final-20261103/inventory.json),
[source changes](runs/final-20261103/source-changes.json),
[acceptance criteria](runs/final-20261103/acceptance-matrix.json),
[abuse matrix](runs/final-20261103/security-abuse-matrix.json).
The accepted Phase 5.1–5.4 packages must remain unchanged.

Final test execution completed on 2026-11-03. Evidence finalization resumed on
2026-11-05; completed suites were reused without rerunning them. Expanded answer
recovery browser evidence is 56/56 PASS, including its raw completed browser JSON,
exit code and timestamps. Development iterations are retained separately and are
not the authoritative final regression.

## Read-only verification

From the repository root:

```powershell
node docs/ai-interviewer/phase-5.5/verify.mjs final-20261103
```

This needs no PostgreSQL, browser or provider. It checks every recorded artifact
hash, all four accepted evidence packages, current source against the tested
manifest, completed suite results/counts, the blocked migration proof, secret
scan, log privacy checks, release flags and cleanup evidence. It writes no files.
The artifact manifest excludes itself. The source manifest covers source,
migrations, scripts and listed build/config files; it excludes dependencies,
emitted build files, temporary profiles and evidence. Artifact hashes cover the
new evidence package. There is no Git metadata in this workspace.

## Reproduce executable checks

Do not rerun into an existing run ID. Choose a new isolated ID and retain this
accepted run. Node/npm, installed dependencies, Chrome and the previously
initialized disposable local PostgreSQL server are prerequisites. Start that
cluster only if it is stopped, using its exact workspace path:

```powershell
& ./.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D ./.local-dev/ai-interviewer-postgres/data -l ./.local-dev/ai-interviewer-postgres/server.log -o '-h127.0.0.1 -p55442' -w start
node docs/ai-interviewer/phase-5.5/run.mjs NEW_RUN_ID init
node docs/ai-interviewer/phase-5.5/run.mjs NEW_RUN_ID all
node docs/ai-interviewer/phase-5.5/run.mjs NEW_RUN_ID integrity
node docs/ai-interviewer/phase-5.5/run.mjs NEW_RUN_ID cleanup
```

The configured test cluster uses loopback port 55442 and a synthetic local test
role. Verify the cluster settings before reproducing; never target an application
database. Each DB suite creates and removes its unique synthetic database. No
real provider/model account is needed. `run.mjs` documents the exact child cwd,
Node arguments and loopback port allowlist. Its child environment excludes real
credentials and retained .env files. It stops on failures and refuses to overwrite
completed result files. Individual unfinished suites can be selected by inventory
ID instead of `all`. It redirects older evidence writes into the new run and
suppresses credential fixture JSON/screenshots. Temporary profiles are confined
to `.local-dev/phase55-temp/NEW_RUN_ID`; cleanup checks the resolved target.

`evidence.mjs RUN_ID` generates a report and manifest from completed results only;
it verifies source stability and accepted evidence hashes before declaring PASS.
Run it only when intentionally generating a new evidence package: it updates this
phase's artifact manifest. Do not regenerate accepted older evidence. The existing
authoritative report records its actual completion provenance on Nov 3/5.

The full migration probe currently returns BLOCKED at unchanged migration 0008
because pgvector is absent, rolls back and removes its generated database. Its
exit 0 means the diagnostic finished, not that migrations passed. Live Voice E2E
is BLOCKED and unexecuted. Synthetic parent-schema DB suites do not resolve either
release blocker. Model/provider calls and guarded external attempts are zero;
native Chrome background traffic was not independently packet-captured.

## Finalization and limits

`resource-finalize.mjs` records the one-time cleanup of this phase's five temporary
profile directories and its previously started test cluster. It checks for other
client sessions and leftover phase-55 databases first, drops no database, checks
absolute cleanup targets and records stop/status exit codes. It refuses repetition.
No unrelated application/browser process is terminated.

The detailed [design](design.md) and final report retain the supported single
process/runtime owner, process-local counter reset/overflow, trusted-proxy
topology assumptions, bounded best-effort diagnostic logs, cached readiness,
non-preemptible synchronous CPU and finite shutdown limits. Overall release is
BLOCKED. Phase 5.6, retention, distributed runtime and real provider activation
are not started.
