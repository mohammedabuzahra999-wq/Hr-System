# Authorization and RBAC boundary

Static audit, 2026-10-22. **AI understanding is not authorization.** Model refusal is a defense layer; deterministic backend authorization is the security boundary. This principle is implemented in important paths, but is not fully satisfied across all report and MCP paths. No live exploit, database query or application change was performed.

## HTTP text flow, in execution order

| Stage | Actual enforcement and evidence |
|---|---|
| Browser input | [CopilotPanel.tsx](../../../hr-app/src/features/copilot/CopilotPanel.tsx) submits text and advisory context. UI visibility, selected employee IDs and client-claimed scope are not authority. |
| Authentication | [routes/copilot.ts:77](../../../server/src/routes/copilot.ts) applies `requireAuth` to all routes. [middleware.ts:31](../../../server/src/middleware.ts) resolves the signed session before the handler. [auth/session.ts](../../../server/src/auth/session.ts) verifies signed cookie, stored token hash, expiry, active account and current database user/role. |
| Input and admission | Body Zod and per-user rate limits apply. Session and contextual lookups are server-side. These are not permission grants for a requested HR record. |
| Early terminal handling | `deterministicRoutingOutcome` in [routes/copilot.ts:415](../../../server/src/routes/copilot.ts) returns fixed out-of-scope / clarification / unsupported responses before model, RAG or action resolution. Audit/unanswered metadata or text may still be retained. |
| Candidate production | Deterministic reads/help, phrasebook, exact training, accepted imperative routing memory, contextual follow-up and finally `resolveQuestion` produce candidates. [resolve.ts](../../../server/src/copilot/resolve.ts) uses the explicit selected question provider. Pending task continuation and action resolution remain separate OpenAI paths. |
| Shared plan boundary | [validatePlan.ts:15](../../../server/src/copilot/validatePlan.ts) uses existing CopilotPlan Zod plus semantic checks. HTTP calls it for incoming candidates and again after contextual/legacy rewrites ([routes/copilot.ts:660](../../../server/src/routes/copilot.ts), lines 744 and 780). `resolveQuestion` also validates local and model candidates. |
| Intent authorization | [routes/copilot.ts:789](../../../server/src/routes/copilot.ts) calls `mayAsk(actor.role, plan.intent)` from [intents.ts:114](../../../server/src/copilot/intents.ts) before ordinary business execution. Role comes from authentication, not generated fields or claims in the question. |
| Record and operation scope | Own reads use `actor.id`; team reads constrain manager relationships in [execute.ts](../../../server/src/copilot/execute.ts). Employee reports check manager ownership; employee payroll reports additionally require HR/admin in [employeeFile.ts:265](../../../server/src/reports/employeeFile.ts). Reports and actions take their own service paths. Exceptions below matter. |
| Response | Fixed result structures return to the caller. Optional `phraseAnswer` / report narration can receive authorized results when configured/sharing enabled; this is a separate egress decision. Voice skips these prose paths. |

Legacy nonterminal model `outOfScope` can attempt role-filtered knowledge; `unclear` can attempt `resolveAction`, then knowledge. The early deterministic terminal result does not fall into these paths. A successful schema parse alone neither proves intent correctness nor permits data access.

## What shared semantics enforce, and what they do not

Current checks reject missing `calendarMonth.month`, calendar fields on other periods, refusal reasons on executable intents, payroll topics/ranking on incompatible intents, report types on unsupported intents, payroll reports outside `employeeFile`, and person-scoped company `payrollInsights`.

They do **not** authenticate an actor, evaluate `mayAsk`, check employee/team/document scope, prove confirmation, reject every unsupported filter, or authorize report subtypes for a role. `routingSource` and `routingRule` are observability, not trusted capabilities. A malicious but well-shaped plan can pass this boundary and must still be denied at execution.

## Concrete authorization outcomes

* An employee plan requesting `payrollInsights` is denied by `mayAsk` before its payroll query. A model choosing that intent incorrectly cannot elevate the HTTP actor.
* A manager's `employeeFile` is limited to self/direct reports; ambiguous or inaccessible identity returns no data. `reportType: payroll` takes `buildEmployeePayrollReport`, whose HR/admin guard denies a manager even though the broader `employeeFile` intent allows managers.
* Self attendance, balances, requests and payslips use the authenticated actor ID rather than a model-selected employee ID. A generated name does not change those queries' owner.
* `proposeAction` checks `mayDo` before preparing action details. [perform.ts:2109](../../../server/src/copilot/perform.ts) rechecks `mayDo` in `runAction`; writes call fixed domain routes through [internalApi.ts](../../../server/src/internalApi.ts) with the signed-in cookie, where current auth, domain validation and permissions run again. HR/admin cannot approve leave through a manager-only `decideRequest` capability merely because a model proposes it.
* Knowledge access uses the authenticated role in retrieval SQL. It cannot be widened by a user claiming another role in source text; incorrect broad document labeling remains a separate risk.

## Confirmed exceptions and pre-authorization reads

**Report subtype scope widening (HIGH, SEC-01).** `myReport` is allowed to every role and `generateReport` includes managers. [routes/copilot.ts:1046](../../../server/src/routes/copilot.ts) passes `self` and report type to [buildReport](../../../server/src/reports/build.ts). Its `resolveScope` is correct for the ordinary scoped builders, but `buildRecruitment(p)` and `buildDepartment(p)` do not receive that scope. They query company recruitment/department data and label the result “Whole company.” Existing Zod/semantics accept these subtype combinations. A wrongly chosen or malicious schema-valid subtype can therefore widen a self/team report. Data includes vacancy/status/application aggregates and department workforce/attendance aggregates; this audit did not demonstrate an individual salary leak through this path.

**MCP (HIGH, SEC-02; MEDIUM, SEC-03).** [mcp/server.ts](../../../server/src/mcp/server.ts) authenticates once, then direct reads use the captured actor indefinitely. They do not re-resolve HTTP sessions or current role. Typed read plans do not go through shared semantic validation. `executeIntent` assumes an admitted caller and has no independent `mayAsk` check. Do not claim that every entry point already shares the complete HTTP boundary.

**Employee lookup minimization (LOW, SEC-09).** [employeeFile.ts:44](../../../server/src/reports/employeeFile.ts) fetches up to two global `users` matches before checking a manager's record scope. It does not return an unauthorized report, but broad rows can already be loaded into application memory before that scope check. Action lookup uses earlier SQL scoping. Authentication/intent permission precedes this lookup; record authorization does not.

Session-table/user reads are necessary to authenticate. Routing memory and selected-context lookups can also occur before final intent admission. External question embedding/classification processes raw user text before knowing whether its requested business operation is allowed. None of these facts should be described as “no data is touched before authorization.”

## Action confirmation is distinct from authorization

Text protected actions normally stop at a proposal/choice. Safe UI effects and the existing notification-read marker have automatic paths. `/copilot/do` validates client parameters and rechecks permissions, but does not verify a stored server proposal or human-review proof; the operation ID provides idempotency, not consent. See [routes/copilot.ts:1204](../../../server/src/routes/copilot.ts).

Voice adds owned, expiring, reviewed confirmations and exact confirmation phrases before calling `/copilot/do`. MCP uses expiring pending tokens for destructive/proposed actions, but an agent can possess/call those tokens itself; some non-destructive business writes execute directly through typed tools. These are different confirmation guarantees, not permission to bypass role/domain checks. A later policy must explicitly distinguish human-reviewed and intentionally autonomous tools (SEC-04).

## Model to database: verified status

| Question | Static conclusion |
|---|---|
| Can a model emit SQL-looking text? | Yes, any generative model could emit text. It has no execution significance here. |
| Is arbitrary model SQL accepted or executed? | No arbitrary SQL/`executeSQL` tool was found in the inspected resolver/provider/MCP paths. Zod plans contain controlled enums and fields, not SQL statements. |
| Can the question model connect to PostgreSQL? | No connection/tool is supplied by the application. [db/client.ts](../../../server/src/db/client.ts) is server-side. No DB credentials are included in the model contract. Host/provider compromise is outside this static conclusion. |
| Can a model directly write records? | No direct write API is attached to classification. An approved action plan is interpreted by fixed backend code and domain routes. |
| Can an external MCP agent reach business data? | Yes, through role-registered tools and fixed executor queries. Results can then enter the external agent's model context; cached identity weakens revocation. |
| Is every path service/validation/auth equivalent? | No. MCP direct reads and the report subtype flaw are documented deviations. No arbitrary SQL is needed to exploit a scope mistake. |

The source inspection covered [structured provider](../../../server/src/ai/structuredProvider.ts), [Ollama adapter](../../../server/src/ai/ollama.ts), [resolver](../../../server/src/copilot/resolve.ts), [executor](../../../server/src/copilot/execute.ts), [performer](../../../server/src/copilot/perform.ts), and [MCP server](../../../server/src/mcp/server.ts). No dynamic penetration test was performed.

## Prompt injection boundary

Prompts mark user/source text as data and deny role-changing instructions; Realtime has no business tools. These reduce model mistakes but are not authorization. Claims such as “ignore permissions” must be harmless even if the model complies. The ordinary company-payroll gate and person-payroll service guard provide that protection; the report and stale-MCP findings prevent a blanket assertion that every malicious plan is safely denied. Training the model to avoid those cases would not repair the boundary.
