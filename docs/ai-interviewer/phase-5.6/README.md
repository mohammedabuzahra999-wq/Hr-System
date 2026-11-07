# Phase 5.6 — Final acceptance and API integration readiness

Review/verification evidence only; no application feature or real integration was
implemented. Start with [final report](runs/final-20261105/REPORT.md),
[architecture review](architecture-review.md),
[future integration checklist](integration-checklist.md),
[before-state](before-state.md), [summary](runs/final-20261105/summary.json),
[synthetic acceptance matrix](runs/final-20261105/synthetic-e2e-matrix.json).

## Verify without providers, PostgreSQL or Chrome

```powershell
node docs/ai-interviewer/phase-5.6/verify.mjs final-20261105
```

The verifier reads current source, completed suite results, raw browser checks,
new and accepted artifact manifests, secret results, cleanup evidence and release
flags. It performs no provider calls and writes no files. The source manifest
retains the Phase 5.5 compatible format so unchanged source has the same SHA-256.
The new artifact manifest excludes itself and covers every other file in this
phase package. No Git metadata is available; exact file hashes are the provenance.

## Reproduce in a new run

Prerequisites are already-installed Node/npm dependencies, Chrome and the initialized
disposable local test PostgreSQL cluster/test role. No API key, local model or
Ollama is needed. Never use an application DB or overwrite accepted run results.
Start the test cluster only when stopped, at the exact workspace path:

```powershell
& ./.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D ./.local-dev/ai-interviewer-postgres/data -l ./.local-dev/ai-interviewer-postgres/server.log -o '-h127.0.0.1 -p55442' -w start
node docs/ai-interviewer/phase-5.6/run.mjs NEW_RUN_ID init
node docs/ai-interviewer/phase-5.6/run.mjs NEW_RUN_ID all
node docs/ai-interviewer/phase-5.6/run.mjs NEW_RUN_ID integrity
node docs/ai-interviewer/phase-5.6/run.mjs NEW_RUN_ID cleanup
```

`all` in the final runner includes the two new verification checks plus the 33
pre-existing regression/probe suites. The authoritative run initialized its original
33-suite inventory first and then recorded the two new checks with separate command
inventory JSON. Each suite logs exact arguments/cwd, UTC timestamps, exit code and
guarded network counters. Existing test assertions are not modified. Unique test
databases are created and removed by their own suites; browser fixtures/profiles
are redirected into this new phase. Credential fixture JSON and screenshots are
suppressed. The runner refuses to overwrite completed results. Choose an unfinished
suite by ID only when needed; a rerun needs a new run ID.

The production build receives synthetic server-only canaries. The unchanged
Phase 5.5 scanner and the additional Phase 5.6 canary-aware scan cover frontend
source/emitted assets. Positive detector fixtures prove canary detection; no secret
values are printed. No retained .env is loaded by the guarded child workflow.

The migration diagnostic's expected exit 0/BLOCKED means it finished checking the
unchanged chain and recorded the missing-pgvector blocker, not that migrations
passed. The combined E2E uses actual PostgreSQL and in-process authenticated Hono
requests with a server-only synthetic WAV/STT/TTS adapter. Real Chrome suites
separately verify the supported mock UI. Neither proves live candidate audio.

`evidence.mjs RUN_ID` generates the new report/manifest only after completed
results, source integrity and accepted evidence checks. It updates this phase's
artifact manifest; do not invoke it casually after evidence acceptance. The one-time
`resource-finalize.mjs` records safe temporary-profile/test-cluster cleanup after
all tests finish, only when there are no other client sessions. It does not drop
databases or stop unrelated applications. See its retained commands/exit codes.

Native Chrome background traffic was not independently packet-captured; Node
socket/fetch and browser page guards enforce the stated external-call scope.
No real STT/TTS/LLM provider was activated. The documented single-process runtime,
local counters, trusted-proxy topology and CPU/health/shutdown limits remain.
Overall release and live provider activation remain BLOCKED by missing code and
the two explicit release validations. Stop after this phase's report.
