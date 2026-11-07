# Local HR classifier benchmark

Preparation only: no models are downloaded and no production provider or source is changed.
Baseline: `qwen3:4b`. Candidates: `qwen2.5:1.5b` (~986 MB), `qwen2.5:3b` (~1.9 GB).
These are model file sizes, not total runtime RAM. Arabic/dialect accuracy is unproven.
References: [1.5B Ollama tag](https://ollama.com/library/qwen2.5:1.5b),
[3B Ollama tag](https://ollama.com/library/qwen2.5:3b),
[Qwen instruction-model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct).

## Fixed acceptance targets

- Intent accuracy >= 90%.
- Complete-plan accuracy >= 85% (all fields, including nulls and refusal reasons).
- Zod success 100% of scored attempts.
- Zero timeouts or transport errors.
- Average wall-clock latency <= 10 seconds, including failed attempts.

## Prepare and validate (no inference)

From the repository root:

```powershell
npm.cmd run benchmark:local --workspace=@hr/server -- --self-test
npm.cmd run benchmark:local --workspace=@hr/server
```

The default dry-run checks installed models and lists model-routed/excluded cases.
The self-test blocks network access during capture and checks scoring/thresholds.
Neither command pulls, loads or generates with a model. No `AI_PROVIDER` override is needed.

## Later, after models have been installed separately

```powershell
npm.cmd run benchmark:local --workspace=@hr/server -- --run --models qwen3:4b,qwen2.5:1.5b,qwen2.5:3b --out ollama-model-benchmark.json
```

`--models` accepts any installed exact Ollama tag, comma separated. Every requested model
must exist before ANY generation starts; there is no automatic installation or fallback.
Tests run sequentially, CPU-only (`num_gpu: 0`), 4096-token context, temperature 0,
native `/api/chat`, JSON Schema, `stream: false`, and a 120-second deadline.
Qwen3 retains tested `think: false` + `/no_think` controls; non-thinking models do not
receive Qwen3-specific controls. The text prompts/schema otherwise remain identical.
Cold-load warmup is recorded separately; the score measures warm-model classification.
Each benchmark model is released from memory afterward, never deleted.

The runner makes an in-memory copy of the current resolver and substitutes only its
provider lookup with a capture stub. All real local routing executes first. Requests
resolved locally are listed separately and never counted as model successes/failures.
No production function or prompt is edited. There are no database reads or writes.

Results record synthetic inputs, expected/actual plans, model digests, source/fixture/
prompt/schema hashes, CPU/RAM, timings, token counts and acceptance results.
Headers/first-response latency is measured; first-token latency is unavailable with
non-streaming transport and recorded as null, not misreported as a token timing.
Token averages use only responses with reported counts. Failures remain in accuracy
and wall-time denominators. Incomplete output fails even if its JSON happens to parse.

The generated comparison format is:

| Model | Intent Accuracy | Complete Plan Accuracy | Avg Latency | Zod | Timeouts |
|---|---|---|---|---|---|
| qwen3:4b | Pending | Pending | Pending | Pending | Pending |
| qwen2.5:1.5b | Not installed | Pending | Pending | Pending | Pending |
| qwen2.5:3b | Not installed | Pending | Pending | Pending | Pending |

This small synthetic screening suite is not production acceptance evidence by itself.
Review goldens and add held-out dialect/role cases before promoting any model.

## Phase 2 offline routing coverage

`npm.cmd run check:routing-coverage --workspace=@hr/server` measures the original 26
model-routed fixtures against current deterministic routing, without a real
provider call. It writes `server/hybrid-phase2-coverage.json`. Cases and goldens
are unchanged; the model benchmark now captures only unresolved cases. Historical
model scores therefore are not directly comparable to a future reduced-workload run.

Strict rules have priority over similarity/exact examples and abstention skips
older shortcuts. Period-specific payslip/request lists and historical leave balances
abstain because their existing executors do not honour those filters. `lastWeek`
also abstains because the existing plan/executor has no representation for it.

The live OpenRouter runner retains its 26-case safety guard and will stop before
inference with the reduced workload; review its scope explicitly before a future
cloud evaluation. Its mocked self-test exercises transport without network access.

## OpenRouter benchmark only

The separate runner uses the saved `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from
`server/.env`. It does not use or modify `AI_PROVIDER`, and is not registered with
production AI services. Never pass credentials as CLI arguments.

```powershell
npm.cmd run check:benchmark:openrouter --workspace=@hr/server
npm.cmd run benchmark:openrouter --workspace=@hr/server
```

The self-test is fully mocked. The live runner asserts the same 26 model-routed
cases, seven exclusions, original prompt/schema/fixture hashes and exact full-plan
scoring. Only synthetic fixtures and static routing instructions are transmitted.
It uses a fixed OpenRouter endpoint, the configured `:free` model, temperature 0,
non-streaming JSON-schema output when advertised, reasoning disabled, no model or
provider fallback, and the same 120-second deadline. No SDK is installed.

Requests are spaced at least 3.2 seconds apart to respect the documented free-model
rate limit. Intentional spacing is excluded from individual request latency.
No automatic retries hide failures. A global configuration/authentication/parameter
rejection stops the run and is reported as incomplete, not as 26 model failures.
Raw upstream errors, credentials, headers and reasoning text are never persisted.

`server/openrouter-nemotron-shared-prompt.json` records every attempted case, expected
and actual full plans, outcome flags, latency, token usage, and safe errors. Its
summary includes exact median, nearest-rank P95 (only with >=20 samples), slowest,
language-stratified intent/full-plan accuracy and each acceptance result. A single
26-case P95 is descriptive; it is not a stable service-level estimate.

Earlier Qwen diagnostic results cover a different five-case workload. Label them
historical when comparing; do not present them as a measurement on this 26-case suite.

## Shared payroll guidance

The validated generic payroll/overtime clarification now lives in the shared
`resolveQuestion` system prompt. The runner sends captured requests unchanged;
there is no benchmark-specific prompt injection or experimental guidance flag.
Historical baseline and experiment JSON reports remain available for comparison.
The new run writes `openrouter-nemotron-shared-prompt.json` and records shared
prompt provenance plus prompt, schema, fixture and resolver hashes.

Zod acceptance requires 100% validation of successful model responses.
`zodRate` also records the attempt-wide rate; `successfulResponseZodRate` excludes
unavailable HTTP/transport responses. Accuracy and latency include failed attempts.
Provider errors are never retried or hidden and are reported separately.
