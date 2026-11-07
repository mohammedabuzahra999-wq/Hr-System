# Phase 1A.1 — HIGH-severity remediation

Date: 2026-10-22 (Asia/Riyadh). Project: `C:\Users\PC-LAB\Downloads\hr-app-step2`.

Scope: remediate **only SEC-01 and SEC-02**, the two HIGH findings in [the historical Phase 1A audit](07-security-audit-findings.md). The six MEDIUM, one LOW and one INFORMATIONAL findings were not remediated or re-audited. No benchmark execution, real employee-data access, AI request, training-data creation or fine-tuning was performed.

## Result

| Finding | Re-audit status | Basis |
|---|---|---|
| SEC-01 — report subtype discards self/team scope | **FIXED** | Service-level admission rejects unauthorized report scope before queries. Company-only builders reject self/team/department-filtered requests rather than widening them. Existing scoped builders and authorized company reports pass focused tests. |
| SEC-02 — MCP uses stale startup identity for protected reads | **FIXED** | Every registered tool revalidates the existing cookie through the normal HTTP authentication boundary, validates the returned identity, and uses current role/scope. Read/write permission is checked at invocation; slow classification is followed by another authorization check. |

These results combine source review and isolated synthetic regression tests. They are not a live production penetration test or a full security-gate PASS. Remaining HIGH findings among the two reviewed: **0**. Remaining MEDIUM findings: **6**.

## Exact files changed or created

| File | Change / reason |
|---|---|
| [server/src/reports/build.ts](../../../server/src/reports/build.ts) | **Modified.** Reuses `mayAsk` at report-service admission. Non-self requests require the existing `generateReport` permission. Company-only `recruitment`/`department` builders additionally require their existing company intent permission, no self scope and no department filter. Invalid combinations throw the existing HTTP `403 forbidden` error before report queries. |
| [server/src/mcp/server.ts](../../../server/src/mcp/server.ts) | **Modified.** Adds `currentUser` and a common `protectedTool` wrapper using `callInternal(GET /auth/me)` with the existing session cookie. Applies fresh identity to every handler. Rechecks current `mayAsk`/`mayDo`; revalidates after question/action classification and before automatic action execution. Startup identity is used only for discovery, binding the session to its original user, and the unchanged startup diagnostic. |
| [server/src/reports/build.security.check.ts](../../../server/src/reports/build.security.check.ts) | **Created.** Exercises the real builder with synthetic in-memory query transport; asserts scope predicates/results, denial before queries, malicious wider hints, and authorized reports. |
| [server/src/mcp/authorization.security.check.ts](../../../server/src/mcp/authorization.security.check.ts) | **Created.** Exercises real MCP callbacks through an in-memory HTTP authentication fixture using the real `requireAuth` and `resolveSession`. Replaces only SDK transport, DB transport, mapper fixture and business/model operations. Covers lifecycle, role changes, failed auth, delayed resolution and confirmation boundaries. |
| [08-high-severity-remediation.md](08-high-severity-remediation.md) | **Created.** Separate remediation record; historical baseline/audit artifacts are not rewritten. |

No package files, prompts, intent/action registries, local routing, shared schemas, `.env`, AI provider configuration, provider adapters, database schema, frontend, Voice, RAG or unrelated MCP functionality were changed. No Git repository was initialized.

## SEC-01: authorization and scope after remediation

The HTTP route still derives `self` from its admitted intent (`myReport`), rather than copying a client scope field. The report service now independently checks that the authenticated actor is allowed that class of report.

* Self attendance/leave/employees/new-hire reports retain `actor.id`, including for privileged callers. A named other department or extra user/scope/role hints cannot replace it.
* Manager non-self reports retain the existing direct-report SQL scope, regardless of a requested other department or wider hints. They cannot use company-only report builders.
* Recruitment and department-comparison builders currently implement whole-company reporting only. Rather than implementing new narrower reporting capabilities, the minimal fix denies self/team/department-filtered use before any query.
* HR/admin can still request these builders at authorized company scope. Existing department filtering on builders that support scoped employees remains functional.
* Direct non-self builder calls by an employee are denied as well; authorization no longer relies exclusively on the HTTP caller's earlier intent check.

The source continues to use fixed database queries and trusted actor identity. Model-provided `reportType` selects a candidate report, not a permission. Extra client parameters do not grant a scope. No prompt change or intent remapping was used as a security fix.

**Intentional behavior change:** a previously widened company-only report now returns `403 forbidden`; it does not return misleading company data under a self/team/department request. This also applies to an HR/admin caller who explicitly selected self or a department for an unscoped-only subtype. Normal authorized report behavior remains covered by tests.

## SEC-02: fresh MCP authorization after remediation

Startup login, stdio transport and role-based tool registration are preserved. Each invocation now calls the existing `/auth/me` boundary with the same signed-in cookie. That route runs normal session expiry, revocation, active-account and current-user checks. Its returned user is checked with the existing `sessionUserSchema` and must retain the original authenticated user ID.

Transport errors, failed auth, malformed identity or substituted identity fail closed with `notAuthenticated`, before model resolution, proposals, reads or writes. There is no cached-role fallback and no automatic login/renewal after expiry.

Typed reads check current `mayAsk`; typed actions check current `mayDo`; both pass the freshly authenticated actor to existing services. Question/action classification receives the current role, then authorization is refreshed again before a protected read/proposal. Automatic typed actions refresh again before execution. Confirmation also checks current permission before running the stored action. Existing one-attempt token consumption, expiry, service/domain permission checks and Voice/text confirmation architecture are preserved.

**Intentional behavior changes:** expired/revoked/disabled sessions cease to authorize MCP tools; downgraded roles cannot use their old tool permissions; unavailable auth fails closed. Each invocation adds an HTTP session lookup, with additional lookups at the slow-resolution/execution boundaries. No latency claim was measured against a live service.

Tool discovery remains based on startup role. Old registered tools can remain visible but are denied by current permissions. Newly granted tools may require an MCP restart to appear; dynamic tool-discovery expansion was not added. A request uses current authorization at its checked boundaries, consistent with normal request admission; this does not claim transaction-wide cancellation of every operation concurrent with a later role change.

## Tests added and executed

Focused commands, from `server/`:

```powershell
node --conditions=development --import tsx src/reports/build.security.check.ts
node --conditions=development --import tsx src/mcp/authorization.security.check.ts
```

| Focused test | Final result / coverage |
|---|---|
| Report security | **PASS — 44 checks.** Self cannot widen, team cannot widen, employee company reports denied, company-only narrow requests denied before queries, wider client/model hints ignored, authorized HR/admin company reports preserved, supported department filters remain narrow. |
| MCP security | **PASS — 18 scenarios.** Active authorized session; expiry; session revocation; account disablement; role downgrade without restart; stale tool denial; fresh self/team access; failures during classification/proposal; current permission at confirmation; valid authorized action and one-time token behavior. |
| All registered MCP tools under failed authentication | **PASS — 69 tools for each of six states** (expired, revoked, disabled, unavailable transport, malformed response, substituted identity). Counters verify no protected business/model calls under failed auth. |

The tests use invented users, identifiers, amounts, query rows and cookies. All non-fixture network access is blocked. The MCP fixture uses actual signed-cookie/session validation with synthetic in-memory session rows; mapper/business/model operations are controlled doubles. The report fixture checks actual generated SQL scope predicates and restricts returned synthetic rows accordingly. This does not substitute for live DB/domain-route or deployed MCP transport penetration testing.

The initial sandboxed `tsx` attempts failed before test execution because Node's Windows `os.userInfo()` lookup returned `uv_os_get_passwd ENOMEM`. Available memory did not indicate exhaustion. The same checks succeeded outside that sandbox; no SDK/dependency/runtime patch was made. One initial MCP test run exposed a fixture issue: PostgreSQL timestamp bind values are strings, so the in-memory expiry comparison needed to parse the timestamp. That test-only issue was corrected; final security runs pass. No application failure was hidden or retried as a provider success.

Existing suites executed with `node --conditions=development --import tsx <file>` from `server/`, all **PASS**:

| Existing file | Result |
|---|---|
| `src/copilot/gate.check.ts` | PASS — intent/action gates |
| `src/permissions.check.ts` | PASS — 22 capabilities and route enforcement |
| `src/copilot/validatePlan.check.ts` | PASS — 95 shared-plan/resolver/HTTP/RBAC/scope/confirmation checks |
| `src/copilot/localReads.check.ts` | PASS — bilingual local reads, names, schema, action boundaries |
| `src/copilot/readRules.check.ts` | PASS — 47 exact local plans, 46 abstentions, zero incorrect local/forced ambiguous plans |
| `src/copilot/conversationTraining.check.ts` | PASS — follow-up/continuation behavior |
| `src/copilot/training.check.ts` | PASS — existing language routing and protected action checks |
| `src/copilot/corpus.check.ts` | PASS — existing corpus/registry checks; existing uncovered-refusal notices are not new failures |
| `src/copilot/routingOutcome.check.ts` | PASS — terminal outcomes/context safety |
| `src/copilot/phase3b.check.ts` | PASS — existing routing/abstention/role visibility |
| `src/copilot/phase3d.check.ts` | PASS — terminal HTTP cases make zero AI/embedding/executor calls |
| `src/copilot/benchmark/coverage.check.ts` | PASS — **historical 26-case offline routing coverage only**, not the frozen 404-case benchmark |
| `src/copilot/benchmark/openrouter.check.ts` | PASS — existing mock adapter/runner self-tests, no real network/provider call |

Type/check commands from project root:

* `npm.cmd run check`: **PASS**, shared/server/frontend TypeScript and existing frontend lint. Two warnings in unchanged files: `hr-app/src/features/copilot/GapForm.tsx:55` and `hr-app/src/features/jobDescriptions/ScorecardEditor.tsx:42` (`react(set-state-in-effect)`). They were not changed in this phase.
* `npm.cmd run check --workspace=server`: **PASS**, including a final run after the last MCP/test adjustment.

Final result: **15/15 test suites PASS**, plus workspace/server checks. No live-model benchmark, 404-case benchmark, production action, database migration or fine-tuning was run.

## Integrity and historical evidence

The original manifest is unchanged and was not regenerated:

```text
docs/fine-tuning/pre-finetuning-file-hashes.sha256
SHA-256: cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47
```

Original baseline verification now intentionally reports **379 unchanged files and 2 authorized source changes out of 381**. Those two differences are this remediation, not rewritten baseline evidence. All other 393 pre-existing files in the 395-file before/after protected set remain unchanged, including the original six Phase 0 documents, snapshot, benchmark artifacts and seven Phase 1A audit documents.

| Source | Historical SHA-256 | Remediated SHA-256 |
|---|---|---|
| `server/src/reports/build.ts` | `aba336f8fb910d5972a51a7702576e31584bf3854c8bc9453cf618154c8bd025` | `94bc1e2992d34ab4ef5e2371db323027fff75c56ca49b7cd1862bf36ef973bdc` |
| `server/src/mcp/server.ts` | `1dcacc53a0b2a3c2164b8bc13452f49b5e4ba547b0abb3c7a3c59f9b100258fe` | `ad13911ffb1d6025f0c48975135b9ee7b2609b9cfcea6051430fa8cddfc73699` |

Frozen benchmark JSONL SHA-256 remains exactly:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

The benchmark was hashed only; its cases, golds and authoring files were not changed or executed. This document records the post-baseline remediation separately; earlier audit descriptions remain historical observations rather than rewritten current-state claims.

## Remaining findings and next-step safety

Not addressed: SEC-03 MCP semantic/orchestration parity; SEC-04 human-confirmation consistency; SEC-05 raw-language retention/export controls; SEC-06 comprehensive AI egress policy; SEC-07 RAG audience/content admission; SEC-08 logging redaction; SEC-09 employee lookup minimization; SEC-10 evaluation/security coverage limits. Counts remaining in the documented register: **0 CRITICAL established, 0 HIGH from the two re-reviewed, 6 MEDIUM, 1 LOW, 1 INFORMATIONAL**. This is not a new comprehensive vulnerability count for the deployment.

**Production-connected BEFORE benchmark: not cleared.** Fixing the two HIGH findings does not prove the remaining privacy/confirmation/egress risks acceptable, that production evaluation cannot read/write real HR data, or that a safe execution harness exists. The historical full-gate FAIL is not automatically replaced with PASS by these tests. A separate gate decision must review the intended benchmark environment and remaining risks.

**Isolated synthetic BEFORE benchmark: conditionally safe**, with separately verified synthetic actors/storage, no production DB/cookies/documents/memory reachable, protected writes intercepted/isolated and provider inputs restricted to synthetic content. That harness was not built or verified here; this statement does not authorize executing it in this phase.

Fine-tuning has **NOT started**. No training dataset was created. Stop after Phase 1A.1.
