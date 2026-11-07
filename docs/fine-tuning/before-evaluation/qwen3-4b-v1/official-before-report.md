# Official BEFORE result — owner-selected qwen3:4b

**BASE MODEL: PINNED. BEFORE: COMPLETE WITH LIMITATIONS, 404/404 unique cases, one pass, no retries. Fine-tuning: NOT STARTED.** Decision recorded 2026-10-25; run finalized 2026-10-26, Asia/Riyadh. Multi-model selection was intentionally skipped by the project owner to measure adaptation of the existing model rather than compare model families.

## Model and immutable inputs

| Identity | Recorded value |
|---|---|
| Model/tag | `qwen3:4b` |
| Serving manifest digest | `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7` |
| Architecture / parameter count | Qwen3 / 4,022,468,096 (4.0B display) |
| Format / quantization | GGUF / Q4_K_M |
| Ollama | 0.40.11; binary hash unchanged before/after |
| Capacity metadata | Context 262144; embedding width 2560; completion/tools/thinking capabilities |
| License | Apache 2.0 in the installed license blob |
| Runtime R-v1.1 SHA-256 | `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736` |
| Frozen F-404 SHA-256 | `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05` — unchanged |
| Baseline lock SHA-256 | `a22e7fd74d21d8a30cb17ac2d910e31526ebadfaf1d612037287878369465681` |

[Original metadata](model-metadata.json), [pre-run blob integrity](model-artifact-integrity.json), [post-run verification](post-run-model-verification.json), [environment](environment-capture.json) and [owner decision](../../design/06-owner-selected-qwen3-baseline.md) preserve the exact evidence. All five model/config/template/license/parameter blobs were hashed before and after, including the 2,497,280,480-byte model. The legacy downgrade-anchor file is recorded separately; it is not confused with the serving manifest ID. No model artifact was changed.

Evaluation settings were locked before the first F case, using the existing Phase 1D.0 contract: temperature 0, top_p 1, seed 42, 512 output-token cap, context 8192, eight CPU threads, batch 128, GPU layers 0, keep_alive 30m, native JSON Schema, `stream:false`, `think:false` and existing Qwen3 `/no_think`. The installed defaults (temperature .6, top_p .95, top_k 20 and recorded stops) remain separately recorded. The model retained its installed top_k/template/stops unless explicitly overridden by the locked request. Request/full-body timeout 120s, parent timeout 150s; no warm-up removes the first scored cold/load cost. Nothing was optimized after results began.

## Isolation and execution

**Isolation: PASS for this controlled profile.** Preflight passed **55/55**, including actual role registries, employee/payroll/report denials, sticky violations, native read/write/process restrictions, credential stripping and exact loopback transport. Six evaluation scripts passed syntax checks. The run recorded zero isolation failures, false action selections/proposals/attempts or real HR executions. This is not production SQL/RBAC/RAG certification.

Production DB, MCP, RAG, authentication/credentials and real writes were blocked. The original 10K/source/build copies were excluded; only admitted R-v1.1 supplied runtime examples. Unadmitted maintained phrasebook/conversation/help arrays were excluded by the declared override. Synthetic fixtures, fixed case dates and trusted synthetic actors were used. Only exact `127.0.0.1:11434` model chat and read-only version/tags endpoints were allowed; no cloud provider, retry, redirect, fallback, pull or training call occurred. S-160 was not executed or used as runtime context. Application/source/prompt/schema/configuration and production behavior are unchanged.

[The single-use marker](results/execution-started.json) and 404 ordered, unique raw/scored records prove one pass. There were **384 actual model requests**, 378 returned HTTP responses and six timeout cases. The remaining 20 records were declared local/service component checks, not end-user local-routing successes. Their results do not inflate model accuracy. In particular, local coverage on this independent controlled language workload must not be inferred from the historical optimized 26-case set.

## Primary results and denominators

The unchanged historical F scorer evaluates existing labels and annotated entity/parameter keys. It does **not** have complete unannotated CopilotPlan golds. **Strict full-plan accuracy: NOT AVAILABLE.** No expected answer or missing gold field was changed/filled.

| Metric | Result |
|---|---|
| Intent, attempt-wide applicable cases | **325/380 — 85.5%** |
| Intent, observed/scorable cases | 325/379 — 85.8%; interrupted attempt unavailable |
| Annotated entity/parameter correctness, observed | **172/361 — 47.6%** |
| Supplementary all-frozen-annotation conjunction | **105/404 — 26.0%**; includes errors/unavailable outcomes as non-passes; not full-plan accuracy |
| JSON + existing Zod, returned responses | **378/378 — 100%** |
| Existing semantic validation, returned responses | **361/378 — 95.5%** |
| Validated structured plan, all actual model requests | **361/384 — 94.0%**, including timeouts |
| Action extraction | 0/211 observed; one additional action attempt timed out. The Qwen provider is question-stage only; downstream OpenAI action stages were deliberately unconfigured |
| Clarification decisions, observed both positive/negative | 141/152 — 92.8%; 252 unavailable/not observed |
| Required-clarification positive cases, attempt-wide | **2/28 — 7.1%**; 2/8 observed positives — 25%; 20 positives unavailable |
| Unsupported-capability handling, attempt-wide | **0/8** |

The high observed clarification rate is dominated by negative cases and excludes unavailable outcomes; it is not successful handling of all required clarifications. Similarly, overall intent includes action-entry `doAction`, not extraction of an executable action. Question-layer intent alone is **117/156 — 75.0%**, and its observed annotated entities are **119/145 — 82.1%**. These task/denominator differences matter when interpreting future fine-tuning effects; the unchanged question provider cannot improve an unconfigured separate action model by itself.

| Language | Total cases | Intent, attempt-wide | Annotated entities, observed | All-annotation conjunction |
|---|---:|---:|---:|---:|
| English | 101 | 85/95 — **89.5%** | 44/90 — 48.9% | 27/101 — 26.7% |
| MSA Arabic | 101 | 78/95 — **82.1%** | 38/89 — 42.7% | 26/101 — 25.7% |
| Jordanian Arabic | 101 | 80/95 — **84.2%** | 44/92 — 47.8% | 24/101 — 23.8% |
| Mixed Arabic/English | 101 | 82/95 — **86.3%** | 46/90 — 51.1% | 28/101 — 27.7% |

Each language has 101 benchmark records, but 95 applicable expected intent labels after excluding component/non-intent cases. Errors/timeouts remain in the attempt-wide denominator. Entity correctness follows only the frozen annotated keys, including empty-key cases; it is not every conceivable slot or a strict full plan. Many action-parameter observations are limited by the unconfigured second stage.

## Failures, validity and latency

**252 case-level errors**, preserved without retry:

| Class | Count | Interpretation |
|---|---:|---|
| `aiNotConfigured` | 210 | Downstream OpenAI-only stage unavailable in the isolated target; not an Ollama connection failure |
| `aiInvalidOutput` | 17 | Server semantic rejection; JSON/Zod were valid |
| `fixtureUnavailable` | 17 | Synthetic service fixture missing; no production fallback |
| `aiUnavailable` | 5 | Normal model requests timed out at the fixed bound |
| Parent `timeout` | 1 | Overnight-interrupted case 174, capped at 150s; also present in provider-failure ledger, counted once |
| `applicationError` | 2 | Post-classification application/harness errors; retained, not retried or repaired |

[Offline structured-output audit](structured-output-audit.json) used the unchanged pure Zod/semantic contracts on raw responses, with no golds or inference: all 378 outer/content JSON objects and Zod plans were valid; 361 were semantically valid. Across 17 rejected responses, aggregate issue flags include report type on the wrong intent (16), payroll report requiring employeeFile (11), and ranking on the wrong intent (1). Flags overlap; they are not 28 separate failed responses. No corrective prompt/schema/routing change was made.

Per-case monotonic latency over all 404 records: **mean 52.11s, median 53.29s, P95 72.48s, slowest 150s (interrupted timeout)**. Component checks are included. The reconciled model-request mean over 384 actual attempted cases is **54.83s**; the exact completed-response mean is in [requested metrics](requested-metrics.json). All 404 scored durations are finite, nonnegative and <=150s. `stream:false` means TTFT is unavailable. Returned usage totals are **914,888 prompt tokens and 31,245 completion tokens** across 378 responses; six timed-out requests have no returned usage. Token totals are reported usage, not a fabricated count for failed requests.

**Important interruption limitation:** the host/tool environment suspended overnight between cases 173 and 174 and resumed on 2026-10-26. [Interruption evidence](interruption-record.json) is preserved. Case 174 remains an unretried failed attempt with bounded 150s case latency. Its raw provider diagnostic contains an approximately 9.57-hour elapsed value (`34437258.841ms`); this raw evidence is preserved verbatim, flagged invalid and **excluded from latency statistics**. The run is complete but not uninterrupted. Do not treat the host interruption or unavailable stages as causal effects of model weights.

## Reconciliation, raw evidence and hashes

The original [aggregate](results/aggregate-metrics.json) and [per-case scored output](results/scored-per-case.jsonl) are unchanged. Their core model-attempt count is 383 because the parent timeout returned without the child's final diagnostics. The separately fsynced [event ledger](results/request-events.jsonl) proves **384** unique model-request starts, one per requested case, including case 174. [Requested metrics](requested-metrics.json) transparently reconcile that missing attempt flag: attempt-wide structured validity uses **384**, not 383. No original result is rewritten, no timeout is counted twice and no failed request disappears.

| Result artifact | SHA-256 |
|---|---|
| [Raw per-case observations and provider output](results/raw-per-case.jsonl) | `615abee4b89645dc1f585bced5c52d94e9caca026171ce1daf878576041fcff8` |
| Original aggregate | `34b6ecc99cd3c143d143c1b5ebac4147594801464c08de78495656abb08ab75d` |
| [Original result manifest](results/result-hashes.sha256) | **`a39155957ef1811a13adfa5bf6901dbdd5387f1529aa92715c14dee2c36ce043`** |

Other retained files include [language breakdown](results/language-breakdown.json), [errors/timeouts](results/failures-timeouts.json), the full provider event ledger, exact installed manifest/metadata, pre/post model hashes and the source/configuration lock. The original result manifest verifies eight original result artifacts. The later derived audits/report have their own entries in the [final evidence manifest](evidence-hashes.sha256); the original result seal is not regenerated.

All **553 protected pre-existing files remain unchanged**, including F, R/S assets, old 10K, production source/configuration and all historical reports/manifests. See [final integrity](integrity-verification.json). New work is limited to isolated evaluation/evidence files and the explicit owner-decision document. No Git initialization or publication occurred.

## Next step and scope limits

Preserve the exact untuned artifact, all raw outputs, the baseline lock and hashes. Review this limited BEFORE baseline, then establish the matching original trainable checkpoint/tokenizer/template/license and reproducible export chain before proposing controlled adaptation. Generate/admit any later training/validation data independently under the protocol; never derive it from F failures, raw responses or golds. No second BEFORE pass, prompt/settings optimization, provider migration, production change, training export or fine-tuning is performed here.

Human review was not performed and is not required for controlled admission. Automated checks do not establish perfect bilingual naturalness or production security. Disclose those limitations, source-example exclusions, unavailable action/services and the interruption in any future report/publication. **Fine-tuning started: NO. Production data accessed: NO. Real HR actions/writes: 0. Historical 10K: EXCLUDED from evaluation runtime/model input. OpenAI/OpenRouter/cloud calls: 0.**
