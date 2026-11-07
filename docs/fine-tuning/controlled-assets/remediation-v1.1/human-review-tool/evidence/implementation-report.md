# Phase 1C.4H — local human review interface

Date: **2026-10-25**, Asia/Riyadh. **TOOL STATUS: PASS WITH LIMITATIONS.** The local server, real-asset loading, workflow/persistence/security tests and client DOM contracts pass. A real browser visual/render check could not be completed in this automation environment. Human review is **NOT COMPLETED**; no actual profile/decision/admission was fabricated.

## Start and use

From the project root:

```powershell
node docs/fine-tuning/controlled-assets/remediation-v1.1/human-review-tool/start.mjs
```

Local URL: **http://localhost:5194**. Listener: **127.0.0.1:5194 only**. The tool is running at handoff. Closing the browser preserves saved progress; stop/restart the command to resume. [Full workflow and safety notes](../README.md).

Available: **Runtime 320/320; Model Selection 160/160**. UI/API load the real fixed assets read-only, with the exact source pending-register row bindings. One record is displayed at a time, including text, context, expected intent/action, parameters, full symbolic and wire plans, annotations, lineage and exact hashes. English is LTR, Arabic RTL and mixed text automatic direction.

All 12 existing pending-register criteria are retained, plus explicit symbolic/wire consistency, semantic correctness and overall suitability: **15 manual decisions per row**. Every decision starts blank. FAIL and N/A each require a note. Partial saves remain drafts, never reviewed. Previous/Next, Save, Save & Next, global jump, four filters and progress/summary are present. Reviewer pseudonym, competence, independence statement and explicit human-independent attestation are collected before saves; no public real identity is required.

## New successor storage; no automatic admission

Only the new `storage/` subtree is writable. Profile and record saves create exclusive, sequenced, SHA-256-chained JSON events; old revisions remain intact. Every review binds record ID, exact raw UTF-8 JSONL-line hash (excluding LF), whole asset hash, reviewer snapshot, criterion decisions/notes and server UTC timestamp. Restart validates the audit chain and asset bindings. A changed source, stale browser revision or corrupted journal fails closed.

The tool can export immutable successor evidence plus a human review summary. At full decision coverage it snapshots automatically, but **admission stays NOT_DECIDED_SEPARATE_PHASE** and model-execution clearance stays false. Summary separates reviewed/all-PASS/FAIL/N/A/unresolved counts and groups failures by criterion. N/A does not silently become PASS. No export is uploaded, copied over the pending register or installed into the controlled admission loader.

Synchronous saves close before acknowledgement. Node's native permission model rejects descriptor-only fsync; the tool does not broaden write permissions to bypass this. Normal stop/restart persistence passed. Sudden power-loss durability is not certified; partial events are detected on restart, never silently truncated. Local hash chaining is not a digital signature or proof of a human's asserted identity/competence/independence. A later independent admission phase must evaluate the evidence.

## Safety checks

The fixed launcher pins source hashes, strips environment credentials/proxies/NODE_OPTIONS, uses native read/write allowlists and grants no child/worker capability. The running tool cannot read production source/env/DB/MCP/RAG/F/10K and cannot write the source datasets or original pending register. No provider or business-service dependency is present.

Incoming loopback HTTP is the only allowed transport. Outgoing HTTP clients, fetch, sockets/TLS/UDP/WebSocket, external DNS and unapproved imports are blocked. Node's literal-loopback listener lookup is answered locally without DNS. Host/Origin checks, same-origin CSP, a non-logged per-process local write token and request-size limits protect the API. No analytics/CDN/fonts/cloud dependency. Record content is displayed with textContent rather than HTML. This is a trusted local tool boundary, not a sandbox for arbitrary hostile code or an authenticated public service.

## Tests actually run

| Check | Result |
|---|---|
| Real two-asset loader and original pending-register hash bindings | 480/480 available |
| Read-only/native denial and no-egress assertions | 23 assertions PASS |
| [Final workflow run](test-results-attempt-006.json) | 30/30 checks PASS, including the read-only assertion group |
| [Client DOM contract](dom-contract-attempt-004.json) | 10/10 PASS; real client JS, live local GET-only API, minimal DOM double |
| New JavaScript syntax | 11 modules/scripts PASS |
| Original protected files | 468 unchanged; see [integrity record](integrity-verification.json) |
| Actual human profiles / decisions / reviewed rows created | **0 / 0 / 0** |

Workflow tests use only separate `TEST_ONLY_*` fixtures, invented test profile/decisions, `TEST_FIXTURE_ONLY` provenance and testOnly exports in `tests/.fixture-work-*`. They never write real review storage or real record decisions. Tests cover restart, FAIL/N/A rationale, draft completeness, hash/stale-write checks, accurate progress/failure counts, completion without admission, original write denial, CSP/Host/Origin/token controls, export path rejection, changed-source blocking and copied-fixture journal tampering. No test fixture is a training/evaluation dataset or a human sign-off.

Preserved development attempts 001–005: two loopback-listener denials before the in-memory literal lookup was added; three fd-fsync denials before using narrow synchronous exclusive writes. None touched real review decisions. DOM-double attempts 001–003 failed because the test double lacked dataset/heading-node support; the client itself was unchanged by those fixes. All failed result files remain in this directory rather than being overwritten.

[Browser verification limitation](browser-check.json): the browser connector had no available surfaces. A separate headless Chrome profile then failed with GPU-process access denied, producing no screenshot/DOM. No browser sandbox/security barrier was disabled. The fallback contract verifies 480-index loading, 15 blank decisions/profile lock, LTR/RTL/auto attributes, filter intersections, global jump to 480, Previous, empty reviewed-status filtering, detail population and zero actual decisions after the test. It does **not** verify layout, actual browser form widgets, keyboard accessibility or visual bidi rendering. The human should confirm those when opening the ready tool.

## Integrity and final state

No pre-existing file was edited. New implementation/evidence/test files are confined to `human-review-tool/`. Runtime mutable state and temporary test/browser profiles are excluded from the immutable implementation manifest and must never be confused with review/admission evidence. Source and numbered test reports are hashed separately; no old manifest was regenerated.

| Protected asset | SHA-256, unchanged |
|---|---|
| Runtime v1.1 | `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736` |
| Selection v1.1 | `09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986` |
| Frozen F | `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05` |
| Historical 10K | `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` |

Tool external calls **0**; model calls **0**; production access **NO**; HR business actions **0**; frozen 404 executed **NO — 0/404**; fine-tuning **NOT STARTED**; Git initialized/uploaded **NO**. No AI_PROVIDER, .env, prompt, application schema/resolver/service/frontend or production behavior changed.

**Human decisions fabricated: NO. Human review completed: NO. Dataset admission: unchanged/rejected pending review. Model selection: NOT CLEARED.** Stop at the ready review interface.
