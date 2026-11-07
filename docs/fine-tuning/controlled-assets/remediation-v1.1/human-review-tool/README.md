# Local human review tool — Phase 1C.4H

From `C:\Users\PC-LAB\Downloads\hr-app-step2`:

```powershell
node docs/fine-tuning/controlled-assets/remediation-v1.1/human-review-tool/start.mjs
```

Open **http://localhost:5194**. Node 24 or newer is required; no install/build/npm dependencies. The server binds **127.0.0.1 only**. Stop with Ctrl+C in the command's terminal; run the same command to resume. Closing/reloading the browser does not erase saved progress. Leave the restricted launcher in place—do not run `server.mjs` directly or broaden permissions.

## Human workflow

1. Enter a private pseudonym, language/dialect and review competence, and an independence statement. Explicitly confirm that you are a human independent of the template author. No public real identity is required. These are your statements, not machine-verified identity or competence.
2. Inspect one record at a time. Runtime 320 and Model Selection 160 are hash-verified against the fixed v1.1 release and original pending register. Arabic inputs use RTL, English LTR and mixed input automatic direction. Context, complete symbolic/wire plans, parameters, annotations, lineage and exact hashes are visible.
3. Make **15 manual criterion decisions**: all 12 existing pending-register criteria plus explicit symbolic/wire consistency, semantic correctness and overall suitability. Every control starts blank; there is no auto-PASS or bulk-grading control. FAIL and NOT_APPLICABLE each require their own note. Use placeholders in notes; do not add real HR facts or secrets.
4. Save partial work as a **draft**; it cannot count as reviewed. Save & Next moves after a successful save. Use Previous/Next, global record number, and asset/language/role/status filters. Unsaved record edits prompt before leaving. A saved row may leave the current status filter; Next then opens the first remaining match.
5. Progress counts complete criterion coverage, not dataset approval. Summary shows all-PASS rows, rows with FAIL, rows with N/A, unresolved rows and failures per criterion. Unresolved means incomplete or containing FAIL. FAIL/N/A counts include saved drafts and may overlap.
6. Export successor JSON whenever needed after reviewer setup. Draft exports are labelled incomplete. At 480/480 complete decisions the tool automatically snapshots review evidence and summary, **never admission**. Human decisions, notes, actor information, UTC timestamps, exact row/asset hashes and the audit-chain tip are bound in the export. Final admission remains a separate phase, including disposition of N/A and unresolved concerns.

Current asset identities:

* Runtime: `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736`
* Selection: `09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986`

The [approved checklist](../review/independent-review-checklist.md) still governs. This UI does not certify semantic independence, review rights or authorization. The original pending register and all candidate/historical assets are read-only and are never rewritten. This phase does not review any real row or make an admission decision.

## Local storage and audit

Only `human-review-tool/storage/` is writable by the running server:

* `events/`: exclusively created JSON events, sequenced and SHA-256 chained. Earlier decisions/profile revisions remain available; no event is edited/deleted. Restart verifies the chain and exact dataset bindings. Stale browser saves fail with 409 rather than overwriting another tab's work.
* `exports/`: immutable successor evidence and summary snapshots. Filenames contain revision/hash, not reviewer identity. Download links stay on the local server. No exports are uploaded or copied into the admission loader automatically.

Synchronous writes close before acknowledgement. Node's restricted permission mode denies descriptor-only `fsync`; permissions are not widened to work around that. Normal stop/restart persistence is tested. Sudden power-loss durability is not certified. A partial/corrupt event causes a fail-closed startup error; no silent truncation, reset or recovery discards decisions. Preserve the storage tree and inspect/recover a separate copy manually if needed.

Review evidence is private local data. Hash chaining detects ordinary corruption against the retained sequence/tip; it is not a digital signature, authenticated identity or protection from an administrator rewriting the entire store. A reviewer may update their profile, while earlier saved rows retain the profile used when they were reviewed. Keep one review tab where possible. If a stale-save error occurs, reload before saving; copy your unsaved notes locally first if necessary.

## Safety boundary

The launcher checks immutable tool hashes, strips inherited credentials/proxies/NODE_OPTIONS and starts Node with native filesystem allowlists and no worker/child permission. It can read only tool files, the two candidates, the pending register and its own successor storage. Original assets, the pending register and historical paths have no write permission. Production source/env/DB/MCP/RAG and F/10K are not readable by the running tool.

HTTP is incoming loopback only. An outgoing-transport guard denies fetch, WebSocket, HTTP clients, sockets, TLS, UDP, external DNS and unapproved packages. Literal-loopback listener lookup is answered in memory without DNS. Exact Host/Origin checks, a per-process local write token, JSON body limits and same-origin CSP protect writes from other websites. No token is printed or put in URLs/exports. The browser loads only local scripts/styles, with no fonts/CDNs/analytics or external resources. Raw record text is rendered through `textContent`.

These controls are for trusted hash-pinned local code, not an operating-system sandbox for arbitrary hostile code. The tool does not alter system firewall/browser security settings. No model/provider, production API, HR action or training path is implemented.

## Verification

```powershell
node docs/fine-tuning/controlled-assets/remediation-v1.1/human-review-tool/tests/run.mjs
```

Workflow tests use `TEST_ONLY_*` records in separate `tests/.fixture-work-*` directories. Their invented decisions/profile are explicitly test-only and never target real record IDs or `storage/`. Exports carry `testOnly: true` and `TEST_FIXTURE_ONLY` provenance. Real assets are loaded only in a separate read-only child to verify counts/hashes/native write denials; no profile or decisions are created there. Each test run retains a new numbered result artifact; earlier failed development attempts are preserved.

Tests cover restart persistence, rationale requirements, incomplete drafts, progress/failure counts, stale/hash mismatch rejection, completion without admission, write denial, cross-origin/Host rejection, guard probes, changed-source blocking and audit-corruption detection. See [implementation evidence](evidence/implementation-report.md) and numbered test results. Temporary fixture data is not human review evidence and must never be admitted or copied into the real store.

**No human review is completed by building/testing this tool. No model selection or fine-tuning is authorized.**
