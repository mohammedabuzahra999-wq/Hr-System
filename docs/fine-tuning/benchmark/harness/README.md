# Isolated pre-fine-tuning understanding harness

Phase 1B, 2026-10-22. **ISOLATED BENCHMARK HARNESS: PASS WITH LIMITATIONS.**

Built and verified with Node **24.15.0** on Windows. The frozen **404 cases have not been executed**. No live model, production database, production HR account, MCP tool, real RAG source or real business action was used. No fine-tuning or training-data construction has started. See [isolation verification](isolation-verification.md) for actual checks and clearance boundaries.

## Purpose and evaluation boundary

This evaluates current source logic in a restricted test process, not a running production application. Understanding, downstream fixture decisions and real action execution are distinct:

```text
Pinned frozen synthetic row (later, explicitly requested run only)
  -> new permission-restricted Node child, stripped environment
  -> allowlisted source modules in a new VM module graph
  -> synthetic authenticated persona
  -> actual HTTP Copilot terminal/local/phrasebook/training/model routing
  -> actual CopilotPlan Zod + semantic validation and intent/action role gates
  -> actual action proposal / supported synthetic identity lookups
  -> synthetic reads or explicit unavailable-fixture result
  -> intercept every execution attempt; never perform a business write
  -> per-case structured result + aggregate metrics in a later result directory
```

The harness transpiles the unchanged TypeScript source in memory. It appends observation wrappers to resolver/validation/proposal exports, substitutes the generic read executor, and replaces `runAction` with an interceptor. It does **not** change prompts, schema definitions, local rules, training examples, registry mappings or production files. The input goes through the real HTTP body validation and route orchestration; authentication is a trusted synthetic fixture instead of a production cookie/login.

The real [resolver](../../../../server/src/copilot/resolve.ts), [HTTP route](../../../../server/src/routes/copilot.ts), [validation](../../../../server/src/copilot/validatePlan.ts), [proposal logic](../../../../server/src/copilot/perform.ts), [employee guards](../../../../server/src/reports/employeeFile.ts) and remediated [report builder](../../../../server/src/reports/build.ts) remain the source of their respective decisions.

**This is not a production E2E authorization certification.** Generic read results are synthetic, scope labels for those reads come from the test adapter, resource-dependent fixtures are intentionally incomplete, and actual writes are unreachable. Do not treat a synthetic read result as proof that all production SQL is correct.

## Files

| File | Responsibility |
|---|---|
| [policy.mjs](policy.mjs) | Frozen hashes/current approved baseline, source allowlist, child environment and native permission grants |
| [fixtures.mjs](fixtures.mjs) | Synthetic personas/directory, bounded in-memory user lookups, explicit unsupported-query errors |
| [capsule.mjs](capsule.mjs) | VM module graph, actual-source observation, mocks, model transport and protected-operation interception |
| [child.mjs](child.mjs) | Restricted child protocol, independent live-row verification, native and capsule isolation probes |
| [scoring.mjs](scoring.mjs) | Zod result contract, comparison rules, safety flags, metrics and denominators |
| [run.mjs](run.mjs) | Safe verification default, explicit future full-run switch, child deadlines and exclusive result output |
| [self-test.mjs](self-test.mjs) | Isolation, role/ownership, smoke, schema, scoring and timeout checks; no frozen-case execution |
| [README.md](README.md) | Architecture, use and limitations |
| [isolation-verification.md](isolation-verification.md) | Verification evidence, integrity and safety decision |

## Fail-closed controls

1. The launcher copies only minimal Windows runtime paths plus fixed test/timezone settings into the child. It excludes `.env`, `NODE_OPTIONS`, proxy settings and database/session/API/MCP/cloud credentials. It does not load dotenv or inherit application configuration.
2. Native Node permissions deny filesystem writes, subprocess creation, workers, addons and unapproved reads. Read access is limited to reviewed source files, the pinned JSONL, the harness and five third-party dependency directories. The entire `node_modules` tree is **not** granted: workspace junctions could otherwise expose `server/.env`.
3. The VM linker permits an explicit static source graph and narrow bridges to required libraries. Production DB/auth/retention/RAG/internal-API boundaries are replaced. Unknown imports, MCP modules, dotenv, networking/process modules and dynamic imports fail. Source-file reads from application code are limited to the existing pinned local example JSONL.
4. The DB object contains synthetic directory reads only; connection, query/execute, insert/update/delete and other unexpected methods throw. Unsupported read fixtures throw `fixtureUnavailable`; they do not return production data or pretend a query succeeded.
5. Real RAG ingestion/retrieval/embedding modules are not available. A fixed synthetic policy answer is available only for the declared `knowledge_visible` fixture. MCP is not instantiated. Internal HR API calls throw.
6. Protected action execution always fails before a business operation. Existing safe UI/notification effects are recorded as intercepted synthetic outcomes, without browser effects or database writes. Attempt flags remain visible to scoring.
7. Isolation violations are latched outside application exception handling. An application catch cannot turn a blocked attempt into an isolation PASS. A later full run stops on an isolation violation.
8. The parent imposes a monotonic **150-second child deadline**, kills an interrupted child and caps its timeout duration. Request timing uses `performance.now()`, with a **130-second validity bound**; oversized/invalid elapsed values become timeouts. The real Ollama adapter retains its **120-second** timeout. Result validation rejects multi-hour durations.

The VM is a capability boundary for **trusted, hash-verified application source**, not a general sandbox for adversarial JavaScript/plugins or compromised dependencies/OS. User/model text is parsed as data, never evaluated as code. Native permission checks provide another boundary; they are not a substitute for operating-system/container isolation in a hostile-code threat model.

## Synthetic actors, ownership and fixtures

Uses the actual four roles: `employee`, `manager`, `hr`, `admin`, with `TEST_EMPLOYEE`, `TEST_MANAGER`, `TEST_HR`, `TEST_ADMIN`, reserved `.invalid` addresses and declared synthetic UUIDs. These IDs are not taken from live accounts and cannot authenticate to production.

The invented directory follows the frozen fixture declarations (unique match, two partial-name matches, direct report or outside-team ownership). Input text never grants the fixture role. The real `mayAsk`/`mayDo` registries and employee/payroll/report guards are exercised. Empty routing memory, prior context and pending-state isolation reset for every case. Only the supplied synthetic prior plan is seeded for conversation cases. Clock is fixed to the row's reference date, timezone `Asia/Riyadh`.

Fixture data is evaluation-only, **not fine-tuning material**. Do not copy this harness, its probes, fixture identities or frozen gold annotations into training, prompts, phrasebooks or RAG.

## Evaluation layers

* `question`, `action`, `capability`, `conversation`: real HTTP classification/control flow, actual extraction, validation, proposal/clarification and permission gates. Downstream reads/prose/retention are isolated. No `/do` call is submitted.
* `local_boundary`: real deterministic decision only. Abstention is measured as abstention, not a forced model label.
* `service_boundary`: the declared candidate is supplied to the real employee service guard with synthetic rows. Candidate intent/entities are **test inputs**, not model predictions, and are excluded from language accuracy. A safe denial is evaluated separately from intent selection.

No gold intent/entities are given to question/action model inference. Gold is consulted by the scorer after observation; the service-boundary exception follows the frozen dataset's explicitly declared component contract.

## Model strategy and configuration parity

| Mode | Meaning |
|---|---|
| `dry-run` | Actual local/HTTP logic; if question fallback reaches the real Ollama adapter, request construction is observed but transport is deferred. No model inference. Not a model BEFORE accuracy result. |
| `mock` | Self-test only. Real provider selection/Ollama JSON Schema/Zod path with declared synthetic model responses. Forbidden in the full-run CLI. Not a model quality measurement. |
| `ollama` | Future explicit run only. Real existing Ollama adapter; only `http://127.0.0.1:11434/api/chat`, no credentials, no redirects/retries/fallback. The child independently verifies its exact row against the pinned frozen JSONL before permitting transport. |

The real structured adapter retains JSON Schema `format`, `stream:false`, server Zod validation, timeout/error handling and its model-specific non-thinking behavior. Prompt text and examples remain the actual source's text; the harness logs only request hash/size/model/usage metadata, never model request bodies. Context consists of the frozen synthetic row, role, maintained source prompts/examples and optional synthetic prior plan; no production DB/RAG/history is available.

The isolated target is **question provider Ollama**, default `qwen3:4b`, **OpenAI action fallback unconfigured**, result-data sharing off and Voice off. Result prose is outside this understanding evaluation. These are harness-only settings. **Application `AI_PROVIDER`, `.env`, model configuration and behavior are untouched.** The default matches the prior recorded local question-provider target, but this phase does not read current `.env` to attest its latest state. Before a model BEFORE run, confirm the declared non-secret target settings match the intended current baseline.

No external API is needed for the supported loopback question path. However, production `resolveAction`/continuation can use OpenAI when a key is configured. This harness deliberately supplies no such key; its no-key local action behavior is real source behavior. **Cloud APIs/OpenRouter are disabled, and a cloud-configured action/question baseline is not cleared here.** A future cloud evaluation needs a separately approved dedicated test credential, review of static prompt/example provenance and a constrained transport implementation. Existing source examples can contain name-like strings; they have not been certified for cloud release by this harness. Missing keys are not treated as successful model responses.

## Result contract and metrics

[resultSchema in scoring.mjs](scoring.mjs) validates every future record. It preserves:

* Case ID/language/voice-style/evaluation layer.
* Expected and predicted intent/action, extracted entities, clarification, confirmation, scope/behavior/authorization.
* Per-dimension correctness (`true`, `false`, or unavailable/not-applicable `null`).
* `LOCAL` / `MODEL` / `OTHER`, routing source/rule, validation PASS/FAIL/NOT_OBSERVED.
* Monotonic latency, controlled error, model attempted/completed/deferred/mocked, optional token usage.
* Separate false action selection, complete proposal and intercepted execution-attempt flags. `realExecution` is always false by construction.

Accuracy is based on each applicable dimension and reports its evaluated/unavailable denominator. Entity accuracy compares **annotated input slots**, with Unicode NFC/trim normalization, against extraction rather than resolved IDs or service defaults. It is not a full unannotated-plan equivalence score. Missing observed clarification/confirmation is null, never invented. Provider HTTP errors or missing responses are retained; no automatic retries conceal reliability.

`attemptWideIntentAccuracy` also counts unavailable/deferred/error attempts as unsuccessful, excluding null-intent and non-language service candidates. Thus scorable-only accuracy cannot hide missing model work. All available dimensions break down by English, MSA, Jordanian, mixed, voice-style and evaluation layer.

Local resolution rate counts completed error-free LOCAL language requests; local routing rate separately includes local candidates whose downstream fixture failed. Model fallback rate counts actual question model-transport attempts, including deferred requests. Unconfigured model needs are counted separately. Service/local-boundary fixtures are excluded from the routing-rate denominator.

False-action metrics flag wrong selection/proposal/attempt when the expected state is clarification, denial, abstention, unsupported capability, no action or a non-action read. A proposal is distinguished from an execution attempt; neither performs a real write. Classification of an incomplete intended action is not automatically equated with an executed action.

Latency summary provides mean, median and nearest-rank p95 over valid bounded observations, including bounded timeout durations; token usage is null when unavailable. P95 for a small group is descriptive only. No BEFORE metrics exist from this phase.

## Verification and later execution

Safe commands used in Phase 1B, from project root:

```powershell
node docs/fine-tuning/benchmark/harness/run.mjs --verify
node docs/fine-tuning/benchmark/harness/self-test.mjs
```

Default runner behavior is verification only, even with no arguments. Self-tests use four independent utterances in six requests (valid local/action/terminal/model, deferred-model and invalid-output paths), plus direct isolation/permission probes. They do not evaluate frozen cases or create BEFORE results.

**Future commands below were NOT executed and require a later user request.**

```powershell
# Local/deferred diagnostics, not complete model BEFORE accuracy:
node docs/fine-tuning/benchmark/harness/run.mjs --execute-frozen-before --mode dry-run --model qwen3:4b

# Real loopback question-model evaluation, after confirming target configuration:
node docs/fine-tuning/benchmark/harness/run.mjs --execute-frozen-before --mode ollama --model qwen3:4b
```

Later outputs are exclusive new `.jsonl` and `.summary.json` files under `harness/results/`, with dataset hash, current source hashes and exact isolated configuration. No frozen artifact is overwritten. Runs are sequential; no retries. Unknown imports/isolation failures stop the run. Provider failures and unsupported fixtures remain recorded and must not be relabeled model errors or successes.

## Known limitations and clearance

* The synthetic query engine deliberately supports reviewed **user identity/manager lookups only**. Attendance/payroll/resource-dependent proposal/report queries and joins can return `fixtureUnavailable`. Understanding already observed remains available; downstream clarification/confirmation/scope observations can be unavailable. Complete 404-case service/outcome scoring is **not guaranteed**. Do not describe fixture gaps as model failures.
* Generic HR reads return synthetic placeholders, not actual SQL/service results. Their scope labels express the adapter's interpretation, not proof of record-level enforcement. Dedicated service-boundary guards are real; full business E2E tests remain separate.
* Cloud/OpenAI-configured understanding is unsupported here; current `.env` parity is not automatically established. No model reachability or latency was tested.
* RAG is a synthetic response fixture, not a retrieval/ACL/embedding benchmark; MCP is blocked, not evaluated. Voice-style inputs are text, not microphone/STT/TTS quality tests.
* Only declared prior-plan conversation fixtures are implemented; non-null pending-task fixtures fail explicitly. This does not alter frozen expectations.
* The original 381-file manifest remains historical. Preflight accepts exactly the two separately documented HIGH-remediation hashes, and rejects any other unreviewed baseline change. A later approved source change requires a new reviewed target declaration, not rewriting the historical manifest or gold data.

**Safety clearance:** isolated understanding runs in the supported modes are cleared **with these limitations and configuration-parity checks**. This is not clearance for a production-connected run, complete production-equivalent E2E metrics or a cloud-configured model baseline. The broader security gate is not changed. **Do not execute the 404 cases during Phase 1B.**
