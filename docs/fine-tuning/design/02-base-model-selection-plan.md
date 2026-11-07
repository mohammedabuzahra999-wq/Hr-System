# Phase 1C.2: base-model selection plan

Date: **2026-10-25**, Asia/Riyadh. **DESIGN ONLY. No evaluation set, model download, model call, benchmark run or winning model selected.** Read with the [dataset plan](01-synthetic-dataset-provenance-plan.md) and [lock/evidence plan](03-experiment-lock-and-evidence-plan.md).

## 1. Selection question and present evidence

Choose a fine-tunable language model for structured HR understanding under the intended deployment constraints. **Ollama is the inference runtime/provider; it is not the base model or a training method.** Freeze the admitted resolver/runtime-example target first; then select the model; then create the experiment lock; only then may the official 404 BEFORE run be considered.

The currently observed local candidate is **`qwen3:4b` — CANDIDATE ONLY**. Phase 1C recorded a reachable Ollama 0.40.8 installation, Qwen3 4.0B Q4_K_M local GGUF and digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. These are prior observations, not a new reachability/generation check or a final checkpoint choice. Do not silently treat this installed quantized artifact as the original trainable weights.

The CPU-only target is user-specified. Read-only OS inventory in this phase reports Windows `10.0.19045`, x64, Intel Core i5-8250U @ 1.60GHz, 8 logical processors, **21,343,473,664 OS-reported memory bytes (~19.9 GiB)**. This is not free-memory, GPU, thermal or inference-capacity certification. Those conditions must be measured later without exposing host/user/serial identifiers.

Historical local results are context, not the new selection experiment:

| Historical candidate | Reported prior result | Interpretation |
|---|---|---|
| qwen2.5:1.5b | Intent 46.2%; complete plan 7.7%; completed mean 19.80s | Failed prior workload; not a new selection result |
| qwen2.5:3b | Intent 69.2%; complete plan 34.6%; completed mean 32.31s; 1 timeout | Failed prior workload; not a new selection result |
| qwen3:4b | Prior poor real-prompt accuracy/CPU latency | Keep as observed candidate only; do not invent missing historical measurements |

Those runs used earlier prompts/workloads and are not apples-to-apples with a future independent set or the frozen 404. Do not repeat larger local-model benchmarking now or claim that fine-tuning will make slow inference fast.

## 2. Candidate admission characteristics

Pre-register a short list of **at most three** candidates after the permitted runtime asset is available. No new model name/tag is recommended as a verified capability claim here; no external catalog, cloud endpoint or model was queried. Any future candidate shortlist must verify primary model/runtime documentation, licenses and exact artifact compatibility before admission.

| Criterion | Required future evidence |
|---|---|
| Arabic / English / code switching | Separate MSA, Jordanian, English and mixed intent/slot results; no inference from “multilingual” marketing or parameter count |
| Instruction/classification ability | Correct closed intent, ownership and parameter extraction; ambiguity/refusal handling without fabricated values |
| Structured output | Native constrained JSON Schema behavior compatible with actual CopilotPlan; successful parsing plus server-side Zod/semantic checks |
| Local privacy | Offline weights/tokenizer/template, local-only inference; no hidden remote execution, telemetry dependency or credential-bearing endpoint |
| Practical CPU deployment | Measured latency, RAM/peak working set, load behavior and context limits on the same target; benchmark the real prompt, not a short hello-only request |
| Fine-tuning support | Obtainable original trainable checkpoint/tokenizer/revision, suitable rights, verified trainer/adapter support, and a tested route back to the chosen inference format |
| Artifact identity | Model revision/hash, tokenizer and template hashes, quantization/export recipe, runtime versions and manifest |
| Small deployment footprint | Prefer candidates plausibly within the existing small-model CPU envelope. A larger model is not admitted by default and is not assumed to meet the latency target |

Suggested candidate **classes**, not selected products: (1) installed Qwen3 4B candidate if its full training/export provenance is verified; (2) one small non-reasoning multilingual instruction model with independently verified Arabic and JSON suitability; (3) at most one alternative compact model with a clearly justified deployment/training advantage. Existing installed smaller models need not be re-run merely to fill the list. No candidate satisfying the gates is a valid outcome.

Inference fit does not imply training fit. Before the experiment lock, verify original checkpoint → training framework/adapter → export/conversion → equivalent quantized inference using separate non-evaluation smoke controls. A supported GPU/training machine, if needed, requires a separately approved environment; production credentials/data and an unapproved cloud training service are not assumed available. Never try to fine-tune an inference GGUF merely because Ollama can load it.

## 3. Independent small model-selection set: proposed S-160

**Design budget: 160 synthetic cases, 40 per language (`en`, `ar-MSA`, `ar-JO`, `mixed`)**, independently authored from capability contracts. No case text, translation, synthetic name, expected plan or generator output is created here.

Proposed strata:

* 128 core cases: one independent realization per current intent/language pair (32 × 4), with admissible roles and varied applicable slots. Action-entry coverage is `doAction`; direct 48-action extraction is not silently scored as question-plan accuracy.
* 32 challenge cases: eight per language, balancing ownership/ambiguity, unsupported/out-of-scope boundaries, voice-style/self-correction and synthetic context/entity conflicts. Overlapping tags are recorded; challenge examples must not copy final benchmark semantics/wording families.
* Balance trusted roles where compatible (target ten cases per role/language, document necessary constraints), supported periods/calendar forms, named-person versus company payroll, missing fields, negation and uncommon but ordinary paraphrases.

The core includes locally solvable intents deliberately to verify integration. **Locally handled or terminal cases never inflate model accuracy.** Before any candidate run, freeze a pure offline preflight partition of S into local/terminal and unresolved/model-eligible cases under the admitted fixed router/asset. This partition must be the same for every model. Report its size and language/intent distribution; do not force production routing just to call a model.

Primary selection uses **only model-eligible cases with a representable current question-plan target**. Local/terminal correctness is reported as a separate integration diagnostic. A separately declared forced-classification diagnostic may later assess broader model capability, but it is not current hybrid traffic, cannot include executable made-up terminal outputs, and cannot be merged into primary accuracy.

Require at least ten model-eligible cases per language and report uncertainty; if the planned small set cannot support meaningful coverage or produces too few eligible cases, mark selection **INCONCLUSIVE** and review a new independent protocol before any candidate score is seen. Do not claim one case per intent/language establishes production reliability. Do not fill gaps with final 404 cases or the previously optimized 26 cases.

S may select the base model only. It is not training/dev data, a runtime prompt library, a fine-tuning validation set or the final test. Each family/translation/episode/entity group stays wholly in S, distinct from training/validation/runtime assets and F. Apply the sealed overlap procedure in the [dataset plan](01-synthetic-dataset-provenance-plan.md); return no final-case clues to authors. No selection run is permitted while the unverified old corpus remains an active dependency.

## 4. Fair comparison protocol (future)

1. Pre-register candidate IDs, compatibility exclusions, S hashes/partition, primary metrics, acceptance gates, tie breaking, timeouts, resource limits and run ordering **before scores exist**.
2. Use the same admitted resolver, role-specific real shared prompt and fixed runtime-reference asset/retrieval; same system/user messages, context, output schema, normalization and scoring. No per-model HR hints, extra examples or rewritten questions. Record rendered prompt hashes and sizes, not secrets.
3. Preserve temperature 0 and equivalent supported deterministic settings. Record seed support rather than assuming determinism. Retain non-streaming structured output and current timeout policy (120s model / 150s parent). No automatic retries or provider fallback; failed compatibility/JSON parameters are exclusions/errors, not silently adjusted successful runs.
4. Use only approved loopback inference and synthetic fixture actors. Preserve JSON Schema `format`, Zod and semantic validation, authoritative RBAC, record scope and action-confirmation decisions. Never execute a business action. This is understanding selection, not service authorization certification.
5. Keep the same Windows/CPU/RAM limits, runtime build, thread/context/batch/cache settings, power state and concurrent-work policy. Run sequentially; disable unrelated speech/model profiling during timing. Pre-register a candidate order or counterbalanced order. Use a separate fixed generic warm-up, then one primary scored pass; record first/cold load separately. No warm-up contains S/F cases or their golds.
6. Record installed artifacts and exact quantization; compare the same quantization class where feasible. If formats/settings differ materially, report separate tracks rather than attributing runtime/quantization differences solely to model quality. Never discard a slow first case without declaring the cold/warm rule in advance.
7. Use `performance.now()` or equivalent monotonic timing across request and body reading, bounded per-request deadlines, and explicit process termination. Record total attempted and completed latency, median/p95/slowest, errors/timeouts, token usage and load/prompt/eval metrics when exposed safely. `stream:false` does not provide user-visible token streaming/TTFT; mark unavailable measures unavailable.

Provider-specific compatibility controls must be semantically equivalent and documented. Current structured adapter uses `think:false` for requests and applies `/no_think` only for model names matching `^qwen3(?::|$)`. Do not apply Qwen3-specific text to other families. Verify reasoning is suppressed when supported; no benchmark-only domain guidance. A future custom derivative tag can change this regex behavior: BEFORE and AFTER must use distinct non-overwritten tags while preserving the selected family control, or an approved adapter correction must occur **before both runs are locked**.

The current harness supports only dry-run/mock/explicit loopback Ollama modes and the historical asset. It does **not** yet implement S-160, a new corpus policy, candidate batching or modern dataset projection. A future version requires review/tests; no new runner is implemented by this plan. `dry-run` is local/deferred diagnostic, never model success.

## 5. Metrics, acceptance and choice rule

Primary metrics on the same model-eligible partition:

| Metric | Definition / predeclared target |
|---|---|
| Intent accuracy | Correct existing intent / all applicable attempted model cases; failures cannot disappear. **≥90%** |
| Complete-plan accuracy | Correct full applicable plan and required slots/nulls under predeclared equivalence rules, not just intent or partial entities. **≥85%** |
| Structured validity | Successful responses: JSON + existing Zod **100%**; semantic validity separately **100%**. Also report attempt-wide validity so connection/provider failures stay visible |
| Reliability | **0 timeouts and 0 provider/transport errors** for candidate qualification; retain every failure, no hidden retry |
| Completed mean latency | **≤10s** on target CPU and declared warm/cold policy; also publish attempted mean, median/p95, slowest and timeout denominators |
| Language/slot behavior | Intent, complete-plan and entity extraction by English/MSA/Jordanian/mixed, ownership, period and name/number forms; publish counts and uncertainty |
| Safety | No unauthorized read/write or false execution; conservative clarification/unsupported handling. Security failures disqualify regardless of accuracy |

Score slots with frozen canonicalization and span/enum equivalence; tolerate harmless JSON key ordering, not missing `reportType`, invented entities, unsupported periods, widened payroll scope or dropped null distinctions. Action selection/extraction and confirmation annotations are separate from question-stage `doAction`; do not claim second-stage improvement from this model-selection task.

Report both model-conditional and full S integration denominators. Small language strata warrant Wilson intervals for proportions and paired family-level comparisons; pre-register statistical/bootstrap rules and seeds rather than chasing significant differences. Ties within uncertainty use lower latency/memory first, then stronger training/export reproducibility; preserve the decision record. Do not choose the best individual response across candidates.

If no model meets all gates, **select no winner**. Report the accuracy/latency/resource tradeoff and request a separately approved deployment or experiment revision. Do not increase timeouts, weaken privacy/RBAC or use F to rescue selection. A declared research-only target outside production latency requirements requires its own explicit justification/lock; it cannot be relabeled as meeting production acceptance.

## 6. Lock prerequisites and scope limits

Selection decision must identify the original trainable checkpoint revision/hashes, tokenizer/template, inference conversion/quantization and export feasibility, not merely an Ollama tag. Prefer generating both the untuned and later tuned inference artifacts through the same frozen conversion path. If the installed Qwen3 artifact cannot be mapped reproducibly to the trainable checkpoint, it remains a diagnostic candidate until that gap is resolved; do not assume weight equivalence.

Freeze the selected base and training task, source/prompt/asset/scorer versions, selection data and decision, tuning search/early-stopping rules, training budget, privacy gates and hardware before official BEFORE. Final 404 quality outputs should remain sealed from developers until the tuned checkpoint is frozen, preventing BEFORE failures from influencing hyperparameters or prompt/rule edits. No official BEFORE command is issued in this design phase.

Unresolved: admitted runtime target, actual shortlist and authoritative compatibility/license evidence, candidate artifact availability, fine-tuning hardware/toolchain, eligible sample size, independent bilingual review and final custodian. **qwen3:4b remains CANDIDATE ONLY; model selection, data creation and execution remain NOT STARTED.**
