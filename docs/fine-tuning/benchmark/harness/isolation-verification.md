# Phase 1B isolation verification

Date: 2026-10-22. Platform: Windows, Node 24.15.0. **ISOLATED BENCHMARK HARNESS: PASS WITH LIMITATIONS.** See [README](README.md) for the execution contract and limits.

This phase built the harness and verified isolation using synthetic self-tests. **Frozen cases executed: 0/404. Live model calls: 0. Real business actions: 0. Production records/credentials read: 0. Fine-tuning: not started.** Deliberate credential-file access probes were denied before reading bytes; they did not inspect the file contents.

## Technical boundary evidence

| Boundary | Verification | Result |
|---|---|---|
| Native filesystem | Permission decision and attempted `server/.env` read | DENIED by Node permission model |
| Workspace alias | Attempted `node_modules/@hr/server/.env` read | DENIED; whole `node_modules` is not granted |
| Native writes | Attempted write to a never-created harness file | DENIED; no file created |
| Native child process | Attempted spawn from restricted child | DENIED |
| Environment | DB/API/MCP/session credentials and `NODE_OPTIONS` absent | PASS; only OS essentials and fixed test/timezone values passed |
| Database | Production pool/query capability and writes | Blocked and violation latched |
| MCP | Production MCP source/module attempt | Blocked before instantiation/tool invocation |
| RAG | Real ingestion/source module import | Blocked; synthetic policy answer works separately |
| HR HTTP API | Internal API dispatch and external HR URL fetch | Blocked with no production fallback |
| Secrets/dotenv | Application `process.env` secret access, guarded file read, dotenv import | Blocked |
| External AI | OpenAI client creation / cloud mode / non-Ollama URL | Blocked; no key supplied |
| Swallowed exception | Application-like catch around forbidden write | Violation remains latched and invalidates result |
| Unsupported fixture | Attendance-table read not implemented by test DB | Explicit `fixtureUnavailable`; no real database fallback |

Only a future explicit live mode admits the exact loopback Ollama chat URL and a child-verified frozen row, with fixed structured request shape, no credentials and redirects forbidden. This allowed path was exercised with a synthetic transport double only; **no live Ollama request was sent**.

The source graph and model input remain current source logic. Models are not given benchmark golds for language prediction. Service-boundary candidate labels are supplied only as that layer's declared input and excluded from language accuracy. Static parsing/hash verification of all rows is not execution of those rows.

## Tests executed

```powershell
node docs/fine-tuning/benchmark/harness/self-test.mjs
node docs/fine-tuning/benchmark/harness/run.mjs --verify
```

Also ran `node --check` on all seven `.mjs` files. Final results:

* **42/42 self-test checks PASS.** Native/capsule isolation, role/ownership, schema, scoring, monotonic timeout and invalid-duration controls.
* **Six synthetic HTTP probes, four unique utterances**: local self read, action proposal requiring confirmation, terminal refusal, valid mocked model fallback, deferred real-adapter transport and invalid model output rejected by existing Zod. These are harness verification, not BEFORE results or new training examples.
* Real registries checked with all four synthetic roles: self reads allowed; team/company/payroll/salary operations remain role-restricted.
* Real employee-file builder rejects an outside-team synthetic person. Real payroll builder rejects manager payroll access. Remediated report builder rejects employee company scope.
* Safety scorer detects false action selection/proposal for clarify/deny/abstain/unsupported/no-action expectations, and separately identifies intercepted execution attempts.
* Empty/deferred metric rates remain unavailable, denominators are explicit, and latency mean/median/nearest-rank p95 are checked with invented numbers. Attempt-wide intent accuracy prevents unavailable work being hidden by scorable-only percentages.
* A one-millisecond parent deadline verifies interrupted-child termination. Oversized request deadlines and the historical multi-hour-duration shape are rejected.
* Default runner verifies integrity and reports **NO CASES EXECUTED**. No `results/` directory or BEFORE output was created.

An early local smoke paraphrase legitimately reached model fallback in dry-run mode. The local control was changed to an existing recognized local phrase; deferred fallback was then tested explicitly. No application rule/prompt or frozen case was changed. Scoring/error handling was tightened during harness development so unavailable fixture/model decisions cannot become fabricated successes. The final self-test output is the verification result above; no model-quality conclusion is inferred from it.

## Synthetic data and mock scope

`TEST_EMPLOYEE`, `TEST_MANAGER`, `TEST_HR`, `TEST_ADMIN` use reserved synthetic UUIDs and `.invalid` email addresses. The directory contains only the documented invented evaluation names/numbers. Fixture labels choose direct-report/outside-team or ambiguity preconditions; they do not select a predicted intent/action. No production account was logged in or copied.

Auth is a synthetic actor injected behind the real HTTP authentication middleware; there is no production session. The generic read executor returns a synthetic placeholder. Retention, narrative prose, RAG and model transport are replaced or disabled. Real proposal and employee/report guards run only against bounded synthetic query adapters. Unsupported resources/joins raise an explicit fixture error. This permits understanding observation without falsely claiming that all business preconditions/services have been reproduced.

## Integrity

Frozen benchmark remains exactly:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

Historical manifest remains exactly:

```text
cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47
```

The original manifest was not rewritten. The only historical 381-file differences remain the two approved security fixes from [Phase 1A.1](../../security/08-high-severity-remediation.md): `server/src/reports/build.ts` and `server/src/mcp/server.ts`. Their remediated hashes match that record; the other 379 baseline files match the original manifest. **All 398 pre-existing protected files match their Phase 1B before hashes.**

Only nine files under `docs/fine-tuning/benchmark/harness/` were created: the seven modules and the two Markdown documents listed in the [file table](README.md). Existing application/source/configuration/prompt/schema/RBAC/Voice/RAG/MCP/frontend/database files and existing benchmark golds were not modified. Git was not initialized.

## Clearance and outstanding limits

**Isolated understanding BEFORE run: cleared with limitations for the implemented dry-run or loopback Ollama target, after a later explicit execution request and confirmation that the declared target configuration matches the intended baseline. Do not run it in this phase.**

That decision concerns isolation, not complete outcome coverage or model accuracy. Current `.env` parity was not read/attested. OpenAI action/question configuration and external cloud transport are not supported; no production credential may be used to bypass this restriction. Resource-dependent fixtures and actual business SQL are incomplete. A full 404-case production-equivalent service/confirmation evaluation is therefore **not cleared as fully covered**; unavailable outcomes must remain explicit or receive separately reviewed fixture work later.

Production-connected benchmarking remains **not cleared**. The six remaining MEDIUM security findings were not remediated or re-audited. This harness does not change the broader security gate. No provider latency/accuracy, model availability, real employee authorization E2E, live audio, MCP integration or RAG retrieval quality was measured.

Fine-tuning has **NOT started**. No fine-tuning dataset was created. Stop after Phase 1B.
