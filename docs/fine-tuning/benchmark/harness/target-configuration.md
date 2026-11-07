# Phase 1C: pre-benchmark target configuration and security gate

Review date: **2026-10-25**, Asia/Riyadh. Project root: `C:\Users\PC-LAB\Downloads\hr-app-step2`. Runtime: Windows, Node `v24.15.0`.

**TARGET CONFIGURATION: FAIL clearance; isolation verification remains PASS WITH LIMITATIONS.** The current local question model is available and all **42/42** harness self-tests pass. However, the actual resolver reads an existing 10,000-row language-example asset with unverified synthetic provenance. Its examples can become model context. The frozen benchmark's synthetic-data declaration does not establish the provenance of that separate asset. The strict requirement that only synthetic information enter the experiment is therefore not yet verified. This is an evidence gap, not a finding that actual employee data was detected or transmitted.

**CLEARED FOR PHASE 1D ISOLATED BEFORE BENCHMARK: NO.** Do not run either full configuration until this data-admission gap is resolved. Do not remove, redact or replace baseline examples to obtain clearance silently: that would change the system being measured. No production configuration, source, prompts, schemas, rules or harness implementation were changed in Phase 1C.

## 1. Current understanding pipeline and harness coverage

The entry point is [the authenticated HTTP Copilot route](../../../../server/src/routes/copilot.ts), not a direct call to a model. The following order is significant:

1. `requireAuth`, request-body validation, request limits and current-page/conversation context establish the authenticated actor and input. User text cannot grant a role.
2. `deterministicRoutingOutcome()` runs before classification. A terminal `needsClarification`, `unsupportedCapability` or `outOfScope` returns an existing response immediately, without question/action inference or knowledge fallback.
3. Pending-action continuation is considered when pending state exists. `continueTask()` currently depends on OpenAI; without its key it returns no continuation. The harness does not implement pending-task fixtures.
4. Maintained help, strict deterministic reads and selected-employee UI context are considered. Clear read grammars outrank phrasebook/training similarity. Ambiguous or unsupported reads can abstain. The route then considers phrasebook lookup, exact training matches and previously accepted instruction categories. These decisions are candidates, not authorization.
5. If those paths do not settle the question, [resolveQuestion()](../../../../server/src/copilot/resolve.ts) considers local help, supported conversational follow-ups, deterministic reads and local training routing. Certain closed report/action/refusal routes return locally. Otherwise [questionGenerationProvider()](../../../../server/src/ai/structuredProvider.ts) explicitly selects the configured question provider. With the saved configuration, this is Ollama; a connection/schema/timeout error does not select OpenAI instead.
6. Model input is the real role-specific system prompt and selected existing examples, optional previous-plan context and the delimited user question. The expected response is `{ plan: CopilotPlan }`, using the real schema. Entity/period extraction is performed by the existing local parsers or this structured model response; no new extractor is introduced by the harness.
7. `validateCopilotPlan()` applies shared Zod and semantic checks to candidates. The HTTP route validates again after contextual changes and before `mayAsk()`. These checks do not grant access.
8. For `doAction`, phrasebook/local action routing or `resolveAction()` selects the existing action and parameters. The special local payroll-adjustment path remains local. Otherwise `resolveAction()` uses OpenAI if configured, or existing local action extraction / `aiNotConfigured` when no key exists. `AI_PROVIDER=ollama` does not migrate this second stage to Ollama.
9. `proposeAction()` applies real `mayDo()`, required-field, identity and scope decisions. Missing details or ambiguous employees produce follow-up/choice states; complete protected proposals produce confirmation. Existing UI/notification exceptions can otherwise execute immediately. Ordinary execution and `/do` are outside this benchmark's permitted operations.
10. Reads dispatch through `mayAsk()` and the existing special report/employee guards or generic executor. Record/payroll restrictions remain server decisions. Legacy nonterminal unclear/refusal branches can attempt action/knowledge fallback; the early terminal outcomes cannot. Optional help/knowledge/narrative/prose calls are distinct from question classification.

| Component | What the isolated harness actually evaluates |
|---|---|
| Authentication | Real middleware with a trusted synthetic session actor; no real login, password or cookie |
| Terminal/local/help/phrasebook/training routing | Actual hash-verified source and existing language assets |
| Question fallback | Actual provider factory and Ollama structured adapter; transport deferred in `dry-run`, loopback inference only in explicit `ollama` mode |
| Plans | Existing CopilotPlan Zod schema, shared semantic validation and route revalidation |
| Action selection/proposals | Actual source, no OpenAI key, bounded synthetic identity lookups; unsupported resource requirements remain unavailable |
| Permissions | Actual `mayAsk`/`mayDo` registries and reviewed employee/payroll/report service guards |
| Generic reads | Synthetic placeholder result; scope labels are the adapter's interpretation, not proof of all production SQL |
| Business execution | Intercepted; no real writes. Even safe UI/notification effects are synthetic |
| Memory/review/audit | Empty/no-op substitutes; no historical questions or retained production context |
| Knowledge/RAG/embeddings/prose | Production paths blocked or replaced by a fixed synthetic fixture / no-op; no retrieval-quality or prose-quality claim |
| MCP / Voice | Not instantiated. Voice-style benchmark rows are text, not audio evaluations |
| Conversation | Supplied synthetic prior question plans only; each row has fresh process/module state |

See [harness contract](README.md) and [Phase 1B verification](isolation-verification.md). A 404-row isolated understanding evaluation is not a 404-row production-equivalent service E2E certification. A service-boundary row deliberately supplies its declared candidate to a service guard; that is a test input, never a model prediction, and is excluded from language accuracy.

## 2. Verified non-secret configuration and model readiness

The saved `server/.env` was parsed without importing application startup, logging secret values or connecting to PostgreSQL. Only allowlisted non-secret settings and presence booleans were inspected. No relevant provider/key overrides were inherited by the audit process. A previously launched backend process's environment was not inspected; these findings describe saved configuration plus current source behavior.

| Item | Saved application configuration / observation | Isolated target |
|---|---|---|
| Question provider | `AI_PROVIDER=ollama` | `ollama` |
| Question model | `OLLAMA_MODEL=qwen3:4b` | Exact same tag, subject to digest verification |
| Ollama endpoint | `http://localhost:11434`, no URL credentials/query/fragment | Exact `http://127.0.0.1:11434/api/chat`; loopback IPv4 normalization only |
| Environment | `NODE_ENV=development` | Application env substitute uses development; child process uses test |
| OpenAI model setting | `gpt-5.4` | `unconfigured`; no OpenAI transport admitted |
| OpenAI API key | Missing / no non-empty saved value | Excluded, not inherited |
| OpenRouter API key | Present; value neither reported nor copied | Excluded; provider unsupported and cloud blocked |
| Database/session secrets | Present; values neither reported nor copied | Excluded; no production session or DB client |
| Result-data sharing | `AI_SHARE_DATA` absent, therefore source default `true` | `false`; actual result prose/knowledge paths are outside this understanding measurement |
| Voice | Not evaluated here | Disabled inside capsule only |

Question fallback is therefore configured to use Ollama. `OPENAI_MODEL` alone does not enable OpenAI. With no usable OpenAI key in the saved configuration, action resolution retains its existing no-key local behavior; continuation/prose cannot authenticate to OpenAI. This is not a claim that the entire application has a universal no-cloud policy. The harness imposes its own independent transport boundary.

### Readiness checks performed without inference

* `GET http://localhost:11434/api/version`: **HTTP 200**, approximately **158 ms**, Ollama **0.40.8**.
* `GET http://127.0.0.1:11434/api/tags`: **HTTP 200**, approximately **432 ms**; exact `qwen3:4b` tag installed.
* Installed target digest: `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`.
* Metadata: local GGUF, Qwen3 **4.0B**, **Q4_K_M**, **2,497,293,931 bytes**. No pull/install/model replacement occurred.

These are metadata request timings, **not inference latency**. No `/api/chat` generation was sent. Presence is not a model-accuracy or latency PASS. Historical CPU-only Qwen results were poor; that is a baseline to measure, not a reason to substitute a higher-scoring model or label the current model suitable for production.

The existing adapter preserves native `/api/chat`, JSON Schema `format`, `stream:false`, Zod validation, 120-second timeout and controlled errors. Structured Qwen3 requests use top-level `think:false` plus the existing last-user-message `/no_think` control. Development residency is `keep_alive:30m`. No automatic provider fallback or retries are introduced.

## 3. Selected BEFORE configuration

**Primary target: B — current local routing plus the configured Ollama question fallback.** It is the closest supported representation of the saved pre-fine-tuning understanding system, with explicit synthetic-service and no-OpenAI-action limits. It is proposed, **not cleared to execute yet**.

**Optional separate diagnostic: local/deferred hybrid routing in `dry-run` mode.** This is not a faithful standalone provider-disabled resolver: it follows the same hybrid control flow and defers transport if the question model is reached. Report it as **LOCAL/DEFERRED DIAGNOSTIC ONLY**, never as full-system accuracy or a successful model response. It also reads the existing example asset, so the synthetic-only admission gap applies to it too.

If both are later authorized, retain two independent outputs and denominators (option C for reporting). Do not merge their predictions, discard failures or choose the better result per row. No cloud/OpenAI/OpenRouter configuration is cleared by this document.

### Exact future command — documented only, NOT executed

From the project root, **only after resolving the admission blocker and receiving a later execution instruction**:

```powershell
node docs/fine-tuning/benchmark/harness/run.mjs --execute-frozen-before --mode ollama --model qwen3:4b
```

Optional separate diagnostic, under the same gate:

```powershell
node docs/fine-tuning/benchmark/harness/run.mjs --execute-frozen-before --mode dry-run --model qwen3:4b
```

The runner would use all 404 unchanged rows, sequentially, with no retries, fresh child/capsule state per row, fixed row reference dates and `Asia/Riyadh`, 120-second adapter timeout and 150-second parent deadline. Latency uses a monotonic clock; module setup and timeout accounting have the distinctions documented in the harness. Provider errors, unavailable fixtures, deferred work and isolation failures remain visible; none count as fabricated successes. An isolation failure stops the run.

### BEFORE/AFTER comparability contract

Preserve the frozen bytes and row order, expected labels/entities, evaluation-layer definitions, synthetic actors/ownership fixtures, supplied context, source prompts/rules/registry/schema, scoring and denominators, timeout/retry policy, timezone/reference dates and harness version. Record Windows/CPU/runtime, Ollama version, model tag **and digest**, quantization and residency/cold-start conditions; use equivalent resource conditions without simultaneous model profiling. The CLI selects a tag, not an immutable digest, so verify the tag still resolves to the digest above immediately before and after any later BEFORE run.

Record any subsequently approved tuned model/checkpoint as the deliberate experimental change; do not silently combine it with prompt/rule/fixture fixes. Preserve every raw per-case outcome, including model errors and unavailable service dimensions, and report language/layer/local-versus-model breakdowns separately. This phase produces no BEFORE score, and fine-tuning remains unauthorized/not started.

## 4. Mandatory isolation/security verification

Fresh checks on 2026-10-25:

```powershell
node docs/fine-tuning/benchmark/harness/self-test.mjs
node docs/fine-tuning/benchmark/harness/run.mjs --verify
```

**42/42 PASS**, including six synthetic HTTP probes using four self-test utterances, mocked model transport, malformed model output rejected by Zod, deferred transport, permission/scope guards, intercepted actions and monotonic timeout controls. These probes are not execution of the frozen 404 rows. Verification reported **INTEGRITY VERIFIED; NO CASES EXECUTED**. No `results/` directory exists.

| Required boundary | Status | Evidence and interpretation |
|---|---|---|
| Production PostgreSQL | **BLOCKED** | Production DB module substituted; pool/query/write attempts throw and latch violations; reviewed synthetic user lookups only |
| Production MCP | **BLOCKED** | Real module imports/tools unavailable; no MCP session started |
| Production RAG | **BLOCKED** | Real ingestion/retrieval/imports unavailable; only a fixed synthetic policy answer fixture |
| Real business writes | **BLOCKED** | Native child writes/process spawning denied; domain execution intercepted; no `/do` execution or DB write fallback |
| Production credentials | **EXCLUDED** | Child env constructed from a narrow allowlist; `.env`, workspace-alias reads, dotenv and secret env access denied |
| Real employee data | **INACCESSIBLE from production stores** | No DB/API/RAG/files/history/account access. This does **not** certify the provenance of existing static language examples; that separate admission check remains unverified |
| Cloud/non-approved network calls | **BLOCKED** | Network modules/unknown imports denied, OpenAI construction blocked; broker rejects other destinations/credentials and redirects |
| Approved loopback model network | **NOT BLOCKED in explicit `ollama` mode only** | Exact `http://127.0.0.1:11434/api/chat`, verified frozen row, actual structured adapter. Deferred in `dry-run`; no live generation this phase |
| Synthetic identities | **VERIFIED** | Four TEST roles, reserved invented UUIDs, `.invalid` addresses, documented fictional directory; not production-authenticatable |
| RBAC/scope evaluation | **ACTIVE, bounded coverage** | Real registries and tested employee outside-team / manager-payroll / employee-company-report denials. Generic executor scope labels are synthetic; unsupported resources remain unavailable |
| Benchmark mutation | **BLOCKED within the reviewed harness** | Restricted worker has no filesystem write capability; trusted parent writes only new exclusive result paths; frozen hashes checked before/after. This is not a machine-wide immutable ACL |
| Historical baseline manifest | **UNCHANGED** | Original 381-entry manifest hash matches; not regenerated |

The capsule runs trusted, pinned application source with explicit module capabilities and restricted native child permissions. It is not a general hostile-code/compromised-dependency/OS sandbox. The trusted parent runner is not itself a machine-wide filesystem/network sandbox. No claim is made that these controls secure an arbitrary unrelated process or a modified harness.

**Technical isolation passes; the mandatory synthetic-only data-admission requirement does not yet pass.** No production-sensitive runtime path was found accessible, and no production HR record was read. Broader production-connected evaluation remains not cleared.

## 5. The six remaining MEDIUM findings

The historical [findings register](../../security/07-security-audit-findings.md) is preserved. The two HIGH remediations remain pinned; this phase does not reclassify them or automatically fix MEDIUM findings.

| Finding | Isolated benchmark decision | Impact and required later mitigation |
|---|---|---|
| **SEC-03 — MCP validation/orchestration parity** | **NON-BLOCKING FOR ISOLATED BENCHMARK** | MCP is blocked. This harness cannot certify MCP parity. **REQUIRES MITIGATION BEFORE PRODUCTION EVALUATION** involving MCP |
| **SEC-04 — human confirmation differs by channel** | **NON-BLOCKING FOR ISOLATED BENCHMARK** | Real proposal/confirmation decisions can be observed, but no protected action executes and no human-consent security claim follows. **REQUIRES MITIGATION BEFORE PRODUCTION EVALUATION** of protected execution/consent |
| **SEC-05 — raw-language retention/export risk** | **NON-BLOCKING FOR ISOLATED BENCHMARK** | Memory, unanswered-review and audit persistence are no-ops; no retained real questions imported. **REQUIRES MITIGATION BEFORE FINE-TUNING** if any real stores/transcripts are proposed as sources; independent reviewed synthetic construction remains a separate permitted option |
| **SEC-06 — provider/sharing flags are not comprehensive egress controls** | **BLOCKING FOR ISOLATED BENCHMARK at the input-admission gate** | Harness transport controls contain cloud egress independently of flags. However, the actual model prompt includes existing examples whose synthetic provenance is unverified; local hosting does not establish synthetic-only input. Resolve provenance/admission before this run. Comprehensive feature egress/minimization also **REQUIRES MITIGATION BEFORE PRODUCTION EVALUATION**, and before any real-data training/export |
| **SEC-07 — RAG audience/content governance** | **NON-BLOCKING FOR ISOLATED BENCHMARK** | Real RAG content inaccessible; fixture is invented. No retrieval/ACL quality claim. **REQUIRES MITIGATION BEFORE PRODUCTION EVALUATION** involving RAG and before any proposed real-document training reuse |
| **SEC-08 — incomplete log/error redaction** | **NON-BLOCKING FOR ISOLATED BENCHMARK** | Application console suppressed, controlled result/error fields, no production credentials/records in runtime inputs. Output privacy still depends on input admission. **REQUIRES MITIGATION BEFORE PRODUCTION EVALUATION** and any real-source export workflow |

Counts: **6 MEDIUM total; 1 blocking the requested synthetic-only isolated run; 5 contained/non-blocking for this isolated scope; all 6 have later production/data-use conditions.** This is not a claim that the repository example asset contains real PII or that SEC-06's production weakness has been remediated. Source provenance approval may resolve the immediate admission blocker without changing code. Production-connected evaluation and real-data training reuse remain separate gates; a synthetic model benchmark cannot close these findings.

## 6. Exact data exposure and the unresolved admission gap

| Recipient | Information it can receive | Excluded information |
|---|---|---|
| Local resolver | Frozen synthetic input; TEST actor/role; synthetic current page/prior plan; unchanged registry/prompts/help/phrasebook/conversation examples and existing runtime JSONL; bounded invented identity fixtures when a service asks | Live sessions, DB contents, real routing history, uploads/logs, production RAG documents, credentials |
| Ollama, if later cleared | Actual role-specific prompt and selected existing labelled phrasing examples; frozen synthetic user text; optional synthetic previous plan; real JSON Schema; model/options/non-thinking control | Gold expected answer, scorer outcome, production HR service results, real records/docs/history, API/DB/session credentials. Fixture role is provided; no production actor identity is substituted |
| Scorer | Frozen expected labels/entities and the observed candidate/terminal/action/proposal/permission outcomes, bounded synthetic fixture observations, latency/error/routing/validation metadata | Any production result store, account or document. Service-boundary golds are supplied only as that layer's declared input and excluded from language accuracy |
| Result files, only in a later full run | Case ID/language/layer, expected/observed labels and extracted entities, correctness/clarification/confirmation/scope/authorization, routing/validation, bounded monotonic latency, controlled errors, model/token/safety flags; summary hashes/configuration | Raw model request/response bodies, real HR records, credentials, audio, full prompt logs or production SQL results. Results are not training data |

### Admission evidence

The frozen 404 rows are unchanged and retain the previously documented synthetic authorship/privacy review. Synthetic fixtures likewise have documented invented identities. Neither guarantees that *all other resolver input context* is synthetic.

The current baseline also reads `server/src/copilot/data/hr_agent_intents_10000.jsonl`:

* SHA-256: `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b`.
* 10,000 rows, 3,440 distinct exact texts; no populated parameter golds per Phase 0.
* A metadata-only check found **zero** rows with `synthetic`, `synthetic_data`, `source`, `provenance`, `generated` or `metadata` declarations. This absence does not prove the material is real; it means the file itself does not attest synthetic provenance.
* Existing source/example context includes name-like wording. No real employee directory was queried to match it, and no name/record/secret values are reproduced here. Static names in examples cannot be certified fictional merely because the asset is checked into the project or called training data.

**Required next evidence:** a documented provenance/privacy review attesting that the unchanged runtime example asset and maintained prompt/example literals contain only generic or independently synthetic phrasing, with no actual employee identities/records/secrets. If that cannot be established, a separately approved target/snapshot decision is needed. Do not silently sanitize the BEFORE target, disable its examples, change prompts, manufacture a provenance claim or weaken the synthetic-only condition. No existing material is newly approved for fine-tuning by this review.

There is no identified path to real salaries, attendance, leave, bank/national IDs, medical records, production credentials or RAG contents through the isolated service fixtures. Nevertheless, **absence of live record access is not proof that an unreviewed static text asset is PII-free**. This is why clearance is withheld rather than conditionally asserted as already satisfied.

## 7. Integrity, changes and final decision

Frozen benchmark SHA-256, verified by the runner:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

Historical manifest SHA-256, verified without regeneration:

```text
cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47
```

The manifest still has 381 entries. Current source verification accepts exactly the two previously approved HIGH fixes (`server/src/reports/build.ts`, `server/src/mcp/server.ts`); the other 379 original source/config entries match the historical baseline. All 407 pre-existing protected source/config/documentation/harness files were checked before and after Phase 1C and remain unchanged. The sole new file is this document. No `.env` values or application settings were changed; Git was not initialized.

| Final item | Result |
|---|---|
| Target configuration | **FAIL — synthetic-only provenance/admission not verified** |
| Technical harness isolation | **PASS WITH LIMITATIONS; 42/42 checks PASS** |
| Proposed primary BEFORE target | Actual local routing + current Ollama `qwen3:4b` question fallback; OpenAI action fallback unconfigured |
| Model metadata availability | **YES**, installed local GGUF; inference capability/accuracy not tested this phase |
| Synthetic-only admission | **NOT VERIFIED** for pre-existing runtime examples; frozen inputs/fixtures themselves verified |
| Existing protected files modified | **0** |
| Frozen benchmark cases executed | **NO — 0/404** |
| Live model generation / cloud calls | **0 / 0**; two local metadata GET requests only |
| Production HR data accessed | **NO**; secret configuration presence inspected locally without exposing values |
| New fine-tuning data created | **NO** |
| Fine-tuning started | **NO** |
| Cleared for Phase 1D isolated BEFORE benchmark | **NO** |

Stop after Phase 1C. The commands above are documentation, not authorization or evidence of execution.
