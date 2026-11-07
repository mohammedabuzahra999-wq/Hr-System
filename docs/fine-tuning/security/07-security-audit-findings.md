# Phase 1A security audit findings and gate

Audit date: 2026-10-22, Asia/Riyadh. Root: `C:\Users\PC-LAB\Downloads\hr-app-step2`. Current phase: security audit and policy documentation, before the frozen benchmark and before fine-tuning. Review is static: application source, existing Phase 0 documentation, frozen artifact metadata/content and SHA-256 integrity. No runtime exploit, database inspection, AI/provider request, benchmark run or remediation was performed.

## Security gate

**SECURITY GATE: FAIL for production-connected evaluation or real-data training reuse.** Two high-severity authorization gaps prevent declaring the current system safe at every entry point. The policy documentation and synthetic frozen artifact are usable; their integrity is not the reason for this gate result.

| Next activity | Decision |
|---|---|
| Run the BEFORE benchmark against live/production-connected HR services or ordinary MCP accounts | **NO.** Synthetic questions alone do not prevent production reads, external disclosure, retained text or accidental writes. Resolve the high findings or prove effective isolation before admitting this execution mode. |
| Later run a component-only or fully isolated synthetic BEFORE evaluation | **Conditionally safe**, after a separately reviewed harness proves no production DB, accounts, cookies, memory, documents, uploads or writes are reachable; authorization cases use isolated service fixtures, not model scores. That harness/isolation was not built or verified here. Do not run it in this phase. |
| Begin constructing independent, synthetic/placeholder-only training data in a later approved phase | **YES under the documented policy**, with provenance/privacy review and strict frozen-evaluation quarantine. This does not depend on exporting HR records. No training data is created now. |
| Construct training data by exporting application records, logs, transcripts, CVs, RAG or MCP results | **NO.** No approved anonymization/export/retention pipeline exists. Ordinary HR permissions do not authorize that reuse. |
| Upload data, start fine-tuning or deploy a model | **NOT AUTHORIZED by this audit. Fine-tuning has not started.** |

An isolated BEFORE run should measure the unchanged baseline and record known failures, not silently fix the baseline or adjust gold answers. If later remediation changes baseline files, record a new version/snapshot and distinguish its evaluation from this frozen state.

## Finding counts

| Severity | Count | IDs |
|---|---:|---|
| CRITICAL | 0 | None established in the inspected paths |
| HIGH | 2 | SEC-01, SEC-02 |
| MEDIUM | 6 | SEC-03 through SEC-08 |
| LOW | 1 | SEC-09 |
| INFORMATIONAL | 1 | SEC-10 |

No critical finding established is not a certification that the entire deployment has no critical vulnerability. No finding was fixed in this phase.

## Findings register

### SEC-01 — Report subtype can discard self/team scope

* **Severity:** HIGH. **Component:** Copilot report authorization.
* **Description:** All roles may use `myReport`; managers may use `generateReport`. A schema-valid recruitment/department report subtype reaches builders that ignore the already computed self/direct-report scope.
* **Evidence:** [intents.ts:76](../../../server/src/copilot/intents.ts), [intents.ts:89](../../../server/src/copilot/intents.ts); [routes/copilot.ts:1046](../../../server/src/routes/copilot.ts) passes subtype and `self`; [build.ts:460](../../../server/src/reports/build.ts) calls `buildRecruitment(p)` / `buildDepartment(p)` without scope and labels them whole company; their queries begin at lines 262 and 315. [validatePlan.ts:15](../../../server/src/copilot/validatePlan.ts) does not reject these role/scope/subtype combinations.
* **Risk:** A wrong or malicious plan can expose company vacancy/application aggregates or department workforce/attendance aggregates to a caller admitted only for self/team reporting. This is a backend scope defect, independent of LLM refusal. Individual salary disclosure through this path was not demonstrated.
* **Recommended remediation:** In a separate phase, authorize report subtype and scope at the service boundary; scope applicable builders and deny unsupported self/team subtypes. Add malicious-schema-valid-plan tests for employees and managers, including calls that bypass normal prompt expectations. Do not use training to hide the defect.

### SEC-02 — MCP direct reads retain stale authenticated identity

* **Severity:** HIGH. **Component:** MCP session/role lifecycle.
* **Description:** MCP signs in once and closes over returned `user` and `cookie`. Read tools call the database executor directly with that captured actor, without current session/account/role validation.
* **Evidence:** [mcp/server.ts](../../../server/src/mcp/server.ts), `signIn`, `startMcpServer`, `hr_ask` and generated intent handlers; [execute.ts:183](../../../server/src/copilot/execute.ts) assumes an admitted actor. Contrast [auth/session.ts](../../../server/src/auth/session.ts), `resolveSession`, called on ordinary HTTP requests.
* **Risk:** Session expiry, logout/revocation, account disablement or role downgrade does not itself stop already-running direct MCP reads. Initial role-filtered registration does not provide ongoing authorization. Cookie-authenticated domain writes have an additional fresh check, so read and write behavior must not be conflated.
* **Recommended remediation:** Revalidate identity and current role on every tool invocation and enforce capability/scope within shared read services. Reject expired/disabled/revoked identities, refresh available tools as needed, and test revocation without restarting the MCP process.

### SEC-03 — MCP read entry points lack complete validation/orchestration parity

* **Severity:** MEDIUM. **Component:** MCP typed reads and executor admission.
* **Description:** Typed tools use SDK input shapes and `questionPlanFor`, then directly call `executeIntent`; they do not call shared semantic plan validation or the HTTP terminal/special-service pipeline. `hr_ask` does use validated `resolveQuestion` and `mayAsk`, but still dispatches directly to the generic executor.
* **Evidence:** [mcp/server.ts](../../../server/src/mcp/server.ts), generated `hr_<intent>` / `hr_ask`; [mcp/schemas.ts](../../../server/src/mcp/schemas.ts); [execute.ts:183](../../../server/src/copilot/execute.ts); contrast [routes/copilot.ts:660](../../../server/src/routes/copilot.ts).
* **Risk:** Cross-field/capability behavior, rate limits and safe audit coverage differ by channel; future tools can rely on checks absent at the lower-level executor. This is not evidence of arbitrary SQL or an already demonstrated unrestricted typed-tool query.
* **Recommended remediation:** Admit all candidates through a common validated, freshly authorized business boundary, while preserving non-executable terminal outcomes and specialized report/knowledge dispatch. Add channel-parity tests; do not just copy HTTP prompts into MCP.

### SEC-04 — Human confirmation guarantees differ across execution channels

* **Severity:** MEDIUM. **Component:** text `/do`, MCP and Voice action consent.
* **Description:** Text presents proposals but `/do` accepts schema-valid client parameters without server-stored human-review proof. MCP directly executes typed actions outside `DESTRUCTIVE`, including business writes; a caller can also submit its own pending confirmation token. Voice separately verifies reviewed owned confirmations and an exact phrase.
* **Evidence:** [routes/copilot.ts:1204](../../../server/src/routes/copilot.ts); [mcp/server.ts](../../../server/src/mcp/server.ts), typed action handlers / `hr_confirm`; [actions.ts:81](../../../server/src/copilot/actions.ts), `DESTRUCTIVE`; [voice/session.ts:209](../../../server/src/voice/session.ts), `beginConfirmation`; [routes/voice.ts](../../../server/src/routes/voice.ts), confirm endpoint.
* **Risk:** A model/tool agent can trigger a permitted but unintended change without the same human review expected in the UI. Role/domain authorization still applies; this is a consent/intent guarantee gap, not evidence of role escalation. Existing design deliberately treats the text card as a UI safeguard.
* **Recommended remediation:** Decide explicitly which clients may act autonomously. For protected human-reviewed writes, bind expiring server proposals to actor/action/parameters and a separate trusted confirmation event, then reauthorize at execution. Preserve deliberate safe UI exceptions and document automation separately.

### SEC-05 — Review/routing stores retain potentially sensitive raw language

* **Severity:** MEDIUM. **Component:** Copilot retention and future dataset export.
* **Description:** Exact unanswered questions and normalized routing-memory questions persist with role and/or actor linkage. Voice transcripts submitted as questions can enter the same stores. No automatic purge or anonymized training-export gate was found in these inspected paths.
* **Evidence:** [unanswered.ts](../../../server/src/copilot/unanswered.ts), `saveUnansweredQuestion`; [memory.ts](../../../server/src/copilot/memory.ts), `remember`; [assistantReview.ts](../../../server/src/routes/assistantReview.ts); [schema.ts](../../../server/src/db/schema.ts), assistant tables.
* **Risk:** Names, payroll/medical details or accidentally typed secrets can persist and be reused as apparently useful training/review text. HR/admin inbox restrictions do not make the text anonymous. Historical “accepted” reads are not reliable gold labels.
* **Recommended remediation:** Define purpose/access/retention/deletion for each store; minimize text and prohibit direct training export. Any later approved transformation must redact locally, reject secrets, review bilingual entities and prove independent dataset provenance.

### SEC-06 — Local provider and sharing flags are not comprehensive egress controls

* **Severity:** MEDIUM. **Component:** external AI inputs and privacy configuration.
* **Description:** `AI_PROVIDER` selects question generation only. Action/continuation/help/interview and embedding paths can still use external AI when configured. Raw input can contain PII; no general masking gate exists. `AI_SHARE_DATA` guards some result/context calls, not every external call.
* **Evidence:** [structuredProvider.ts](../../../server/src/ai/structuredProvider.ts); [resolve.ts](../../../server/src/copilot/resolve.ts), `resolveAction` / `continueTask` versus guarded `phraseAnswer`; [guide/answer.ts](../../../server/src/guide/answer.ts); [interviewReview.ts](../../../server/src/ai/interviewReview.ts); [evaluateInterview.ts](../../../server/src/ai/evaluateInterview.ts); [retrieval.ts](../../../server/src/ai/retrieval.ts). Knowledge and report prose have their own guards.
* **Risk:** An operator can misinterpret local question routing or disabled result sharing as a system-wide no-cloud guarantee. User-authored PII/CV evidence/interview answers can reach a provider without a common purpose/minimization decision. This is a documented coverage limitation; no current key value or live transmission was inspected.
* **Recommended remediation:** Define explicit per-feature egress policy, approved recipients and field-level minimization; enforce it at every transport, including embeddings and continuation. Document the current flag scope accurately and test synthetic restricted inputs under each setting. Do not infer privacy from missing keys.

### SEC-07 — Role-only RAG audience can broadly admit sensitive contents

* **Severity:** MEDIUM. **Component:** knowledge ingestion/content governance.
* **Description:** Authenticated HR/admin curators can upload free text/documents. Missing upload audience defaults to all roles; no PII screening or employee-record ACL exists before storing/embedding contents.
* **Evidence:** [routes/knowledge.ts](../../../server/src/routes/knowledge.ts), `parseAudience` and upload handler; [knowledge/service.ts](../../../server/src/knowledge/service.ts), `createKnowledge` / `findKnowledge`; [knowledge/extract.ts](../../../server/src/knowledge/extract.ts).
* **Risk:** A mislabeled document can disclose confidential employee text to every role and possibly an external embedding/answer provider. Audience SQL works for its configured label; it does not determine whether the uploader selected a safe audience.
* **Recommended remediation:** Require explicit reviewed sensitivity/audience, restrict this role-only collection to suitable policy material, detect/quarantine PII and prohibit employee/restricted records until a separate record-level authorization design is approved. Preserve SQL audience checks.

### SEC-08 — Error and diagnostic logging lacks universal PII/secret redaction

* **Severity:** MEDIUM. **Component:** backend errors, AI errors and MCP diagnostics.
* **Description:** Controlled Copilot audit events are minimized, but other paths stringify/full-log error objects, CV filenames or the MCP account email. Development HTTP errors can include a stack. Truncating a string does not remove sensitive values.
* **Evidence:** [index.ts:117](../../../server/src/index.ts), global error handler; [analyseCv.ts:166](../../../server/src/ai/analyseCv.ts); [resolve.ts](../../../server/src/copilot/resolve.ts), catch blocks; [knowledge/service.ts](../../../server/src/knowledge/service.ts), answer error; [mcp/server.ts](../../../server/src/mcp/server.ts), login error / startup output. Further sinks are catalogued in [logging policy](06-logging-and-pii-policy.md).
* **Risk:** Database/provider errors or identifying filenames can expose PII, prompt fragments or potentially secret-bearing diagnostics in console/aggregated logs or developer responses. No actual leaked secret was read or reproduced by this audit.
* **Recommended remediation:** Allowlist event fields and controlled error codes; sanitize errors centrally, normalize paths, mask permitted identifiers, remove account-email output, define log access/retention and test synthetic canaries in failure paths.

### SEC-09 — Employee lookup reads broad rows before manager scope check

* **Severity:** LOW. **Component:** employee report lookup minimization.
* **Description:** Global name/number matching selects full `users` rows (up to two) before checking the unique matched person's manager relationship. The users schema includes authentication-related fields that report matching does not need.
* **Evidence:** [employeeFile.ts:44](../../../server/src/reports/employeeFile.ts), `employeeForReport`; [schema.ts](../../../server/src/db/schema.ts), users table. Payroll guard remains at [employeeFile.ts:265](../../../server/src/reports/employeeFile.ts).
* **Risk:** Unnecessary confidential/authentication fields enter server memory before record-scope authorization; ambiguity can be influenced by out-of-scope records. This audit found no return of a forbidden employee report or password hash to the caller through this lookup.
* **Recommended remediation:** Select only necessary identity/scope fields and apply actor scope in the lookup query before matching/counting. Preserve conservative ambiguity behavior and the separate payroll gate.

### SEC-10 — Frozen synthetic benchmark is not a complete security test

* **Severity:** INFORMATIONAL. **Component:** experiment evidence/coverage.
* **Description:** The artifact is synthetic and includes important safety cases, but no execution results exist and it does not cover every channel or newly catalogued authorization gap.
* **Evidence:** [benchmark README](../benchmark/README.md), [coverage](../benchmark/benchmark-coverage.md), immutable [JSONL](../benchmark/pre-finetuning-benchmark-v1.jsonl), existing [Phase 0 plan](../04-baseline-benchmark-plan.md).
* **Risk:** High intent accuracy, valid Zod output or passing these 404 cases could be misreported as proof of authorization, MCP revocation, no PII egress or secure Voice processing. The self-report subtype issue and MCP post-revocation behavior require separate service/security tests.
* **Recommended remediation:** Preserve this benchmark unchanged. Separately define isolated security regression coverage and report model understanding, service authorization and action execution as distinct measures. No new tests/cases were created here.

## Frozen benchmark privacy and safety review

**Static privacy result: PASS for the reviewed artifact, with provenance and execution limits.** All 404 records declare synthetic data; the authored catalog/README identify invented test identities, two reserved test employee numbers, one `.invalid` email and fictional instruction amounts. No real employee records, salaries, conversations, recordings or policy contents were used by the documented authoring process. No actual employee database was consulted to check name coincidences. A synthetic flag alone is not proof; this conclusion also uses the authoring catalog, declared allowed values and static content checks.

Read-only JSON parsing and pattern checks confirmed:

| Check | Result |
|---|---|
| Cases / languages | 404; 101 each English, MSA, Jordanian Arabic and mixed |
| Ontology coverage | Existing 32 intents / 48 actions; no new runtime labels |
| Synthetic declarations | 404/404 true |
| Identity/contact values | Only the declared two synthetic employee numbers and one reserved-domain email; invented names/provenance described in frozen README |
| Credential patterns | No API-key, bearer-token, private-key or PostgreSQL credential-URL patterns found |
| Other identifiers | No UUID or IBAN patterns found; no real phone/national/passport/bank/medical record introduced by declared content |
| Permission-sensitive cases | 392; sensitivity does not mean every one is a denial |
| Explicit denial controls | 8 `permission_denied` cases |
| Negative/safety controls | 88 flagged, including positive HR counterexamples to over-refusal |
| False-action controls | Negated writes, microphone-only input, ambiguity, out-of-scope/unsupported cases; 172 complete proposals require confirmation |
| Other outcomes | 28 clarification, 8 abstention, 8 unsupported, 8 out-of-scope, 12 no-data, 4 no-action |
| Voice | 84 transcript-style text cases; no audio or real speaker data |

Pattern scanning cannot establish privacy mathematically or verify external provenance by itself. This audit did not weaken schemas, edit expected fields, generate new identities, execute the validator as a benchmark, run a resolver or collect predictions. The benchmark remains evaluation-only; its authoring files/golds must not become training or prompt material.

## Integrity verification and preservation

The initial audit check and final read-only rehash verify the original **381/381** baseline files against [the existing manifest](../pre-finetuning-file-hashes.sha256), without rewriting it. Missing/mismatched baseline files: **0**. The six original Phase 0 documents remain present and unchanged. Snapshot and five existing benchmark artifacts are also protected by before/after hashes: **388 pre-existing files** checked in total, including the manifest itself.

Manifest SHA-256:

```text
cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47
```

Frozen benchmark SHA-256 — exact match to the required value:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

The manifest deliberately excludes secrets, `.env` files, build outputs, runtime/log/backup data and later artifacts. This result verifies its declared scope; it is not a database or complete deployment snapshot. No `.env` or credentials were read/printed/modified for this phase. No Git repository was initialized. No production/application/source/configuration/prompt/RBAC/Voice/RAG/MCP/database/frontend change was made.

## Final status and deliverables

| Area | Conclusion |
|---|---|
| Model -> DB | No arbitrary SQL or direct model DB credentials/tools found; fixed backend queries remain. Scope flaws do not require arbitrary SQL. |
| RBAC | Ordinary HTTP gates and key employee/payroll checks exist; not complete across report subtypes/MCP identity lifecycle. |
| MCP | Requires fixes for fresh authorization and channel parity; external result recipient must be governed. |
| RAG | SQL role filtering verified; source sensitivity/audience and egress governance gaps remain. |
| Voice | Local audio minimized in intended path; sensitive transcripts can persist; alternate cloud/browser paths require separate privacy approval. |
| Logging/PII | Safe audit metadata exists; raw-text stores and error/diagnostic sinks need policy enforcement. |
| Training policy | Defined; independent synthetic authoring can proceed only in a later authorized phase. Real-data/log export and fine-tuning are not cleared. |
| Benchmark privacy/integrity | Static review PASS; exact required hash preserved; no benchmark execution. |

Created only these seven documents under `docs/fine-tuning/security/`:

1. [01-ai-data-classification.md](01-ai-data-classification.md)
2. [02-ai-access-matrix.md](02-ai-access-matrix.md)
3. [03-fine-tuning-data-policy.md](03-fine-tuning-data-policy.md)
4. [04-authorization-and-rbac-boundary.md](04-authorization-and-rbac-boundary.md)
5. [05-rag-mcp-voice-security.md](05-rag-mcp-voice-security.md)
6. [06-logging-and-pii-policy.md](06-logging-and-pii-policy.md)
7. [07-security-audit-findings.md](07-security-audit-findings.md)

**Pre-existing files modified: none.** Application tests, the 404-case benchmark and model calls were not run in this documentation-only phase. The checks performed were static source review, aggregate JSON/privacy checks, documentation link checks and SHA-256 comparisons. Fine-tuning has **not started**. Stop after Phase 1A; remediation, isolated harnesses, training-data construction and any training job are separate future work.
