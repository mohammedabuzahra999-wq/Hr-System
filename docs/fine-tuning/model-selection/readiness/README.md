# Phase 1D.0 — base-model selection execution readiness

Date: **2026-10-25**, Asia/Riyadh. **PASS WITH LIMITATIONS.** Scope: test-only scorer, deterministic offline S partition, common executable payload contract, candidate policy and new evidence. **No candidate model evaluation, selection, fine-tuning or frozen-404 execution occurred.**

The prior [automated admission](../../controlled-assets/remediation-v1.1/admission/automated-readmission.md) and [protocol amendment](../../design/05-protocol-amendment-automated-admission.md) remain authoritative. Human review was **NOT PERFORMED and is NOT REQUIRED** for this controlled admission. Arabic/English/MSA/Jordanian/mixed naturalness was not independently human-reviewed. Automated admission does not certify perfect linguistic quality; future reports/publications must disclose this limitation. All prior evidence remains unchanged.

## Final artifacts

| Requirement | Final evidence | Status |
|---|---|---|
| Full-plan scorer | [scorer.mjs](scorer.mjs), `CEB-SCORE-1.0.0` | READY |
| Exact scoring specification | [scoring-specification.json](scoring-specification.json) | FROZEN before any model execution |
| Comprehensive scorer tests | [final scorer self-tests](scorer-selftest-final-results.json) | **179/179 PASS** |
| Every S record classified | [selection-partition.json](selection-partition.json) | FROZEN, all 160 unchanged |
| Actual shared prompt/model boundary | [rendered-model-requests.json](rendered-model-requests.json), [capture capsule](resolver-capsule.mjs), [source lock](source-lock.json) | 136 reproducible captures; no transport |
| Common model request contract | [run-contract.json](run-contract.json), [executable builder](execution-contract.mjs) | PINNED; no admitted candidate identity/run yet |
| Metrics and winner/tie rules | [metrics-and-winner-rules.md](metrics-and-winner-rules.md) | FROZEN |
| Candidate and adaptation eligibility | [candidate-policy.md](candidate-policy.md) | FROZEN; qwen3:4b CANDIDATE ONLY |
| Hardware/version reporting | [environment-capture.json](environment-capture.json), run-contract environment requirements | Local OS/Node/CPU/RAM/dependency capture; provider/candidate identity NOT freshly verified |
| Native/VM isolation and reproducibility | [final readiness checks](readiness-check-final-results.json) | **85/85 PASS** |
| Source/configuration/history integrity | [integrity-verification.json](integrity-verification.json) | **519/519 protected pre-existing files unchanged** |
| New evidence seal | [evidence-hashes.sha256](evidence-hashes.sha256) | New manifest only; no historical manifest rewritten |

## Exact identities

| Artifact | SHA-256 |
|---|---|
| Admitted Runtime v1.1, 320 / 320 unique | `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736` |
| Admitted Selection v1.1, 160 / 160 unique | `09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986` |
| Frozen F-404, integrity hashing only | `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05` |
| Historical 10K, excluded from readiness child/model input | `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` |
| Final full-plan scorer | `c2ad990cbe11f7a2055dcd3b6adcaa48503d55d3d269654b876686cba4fbd410` |
| Final scorer test report | `e05d2f1f851e9f9b7272d3221039adbc720fafd0f3ce649141e9d60c92662970` |
| Final partition | `2f00d20a30ee2e1bd30f998dc727e3c7e0bfd97c4dff1c7799279b3cfbb2a9ec` |
| Final run contract | `70bd199f7a68165ceb763f15e55d2376b29cb0c52db9a57c38dfe4fa8da80786` |
| Final readiness checks | `c5faa22aae49b6d51ad7b0194587a8a8f8ee2b372e33d0fe8ead9366524e7775` |

Neither F nor the old 10K was parsed/inspected for scoring design, partitioning, candidate policy or prompts. The trusted final integrity checker hashes their bytes only; the readiness children have no read permission for them. No rejected asset or current admitted asset was regenerated, relabelled or edited.

## Scoring boundary

Every defined normalized plan field is compared, including period/month/year, department/person/employee placeholder, reportType/payrollTopic, nulls and defaults. JSON/Zod/semantic/contract validity, stage, intent/action, parameters/entities, scope and symbolic/wire correctness are separate metrics. Existing Zod and `validateCopilotPlan()` are loaded from pinned source; no production validation is changed. Extraneous fields/duplicate keys remain explicit raw-contract failures rather than being silently counted as successful complete plans.

Wrong outputs, missing fields, wrong nulls, wrong employees/periods, all 48 action enum values, every action field omission/mutation, permission denials, observed confirmation bypass, malformed wrappers, terminal-control shapes, timeouts/provider errors, denominator handling, missing/duplicate attempts, symbolic projection and invalid elapsed times have deliberately positive/negative self-tests. They use separate in-memory canaries, never S/F cases or production data.

`resolveQuestion` returns a question plan. `doAction` does not reveal the second-stage action, and `knowledge` does not reveal a document-grounded answer. S contains **no actionPlan targets**, so action extraction accuracy is **N/A**, not 100%. Clarification/unsupported null-plan targets are separate orchestration controls, not invented model-output variants. Actual manager record membership, service SQL, document access and human confirmation are not certified by plan comparison; existing downstream guards remain authoritative, and no service can execute here.

## Frozen partition

| Language | MODEL_ELIGIBLE | CONTROL_ONLY | RESOURCE_DEPENDENT |
|---|---:|---:|---:|
| English | 34 | 6 | 0 |
| MSA Arabic | 34 | 6 | 0 |
| Jordanian Arabic | 34 | 6 | 0 |
| Mixed Arabic/English | 34 | 6 | 0 |
| **Total** | **136** | **24** | **0** |

Eligible roles: employee 16, manager 40, HR 40, admin 40. The 24 controls are employee-role cases: 16 clarification and 8 unsupported. Role/language imbalance after partitioning is visible, not repaired by changing roles or targets. All four languages exceed the previously required ten eligible cases.

The unchanged admitted target's actual terminal preflight and resolver were run **offline**, with only R projected into the typed reference dependency, unadmitted maintained example arrays excluded, and the provider replaced by a capture-only object. The production prompt source, ontology and local rules were not edited. Each of the 136 complete-plan cases reached the real question-provider boundary under this profile. The captured messages, schema and input hashes reproduce exactly. This S set is independent of the historical 26-case workload; their local coverage numbers are not interchangeable.

**Known control limitation: 0/24 terminal controls are recognized as their expected terminal kind under the current narrow router; all remain unresolved.** Their null targets cannot be fairly scored as provider plans. They are CONTROL_ONLY, are not sent to a model, and cannot inflate primary model accuracy. [Partition diagnostics](partition-diagnostics.json) retain this limitation; the final checker reverified it with the final strict scorer. No rule or gold was changed to improve it. None of these cases requires a production resource merely to classify the HR subject; unavailable downstream service answers are outside this model-only task, hence zero RESOURCE_DEPENDENT records.

## Common run contract and fair comparison

All candidates must use the exact captured per-case role-specific shared system instruction, QUESTION block, admitted R retrieval, no previous conversation, neutral `/assistant` context, fixed reference date and identical input JSON schema. No gold is in a model request. Temperature 0, top_p 1, seed 42, maximum output 512 tokens, context 8192, eight CPU threads, batch 128, GPU layers 0, `stream:false`, `think:false`, 30-minute residency, 120-second request/full-body timeout and 150-second parent bound are pinned. Missing supported options exclude a candidate from this track; no hidden parameter downgrade occurs.

The existing Qwen3 `/no_think` family/template control is appended only after the shared user block for a verified Qwen3 policy. It is not HR prompt optimization and is not applied to non-Qwen3 families. Actual final transport-body hashes must be recorded. No common instruction was tuned using S results or F.

Future execution must be sequential, one predeclared generic warm-up and one scored pass, fixed candidate/S order, no retries or fallback. Use `performance.now()` through full body read; invalid/multi-hour wall-clock durations are rejected. Capture both attempted/completed summaries, lower nearest-rank P50, nearest-rank P95, slowest, errors, tokens and available Ollama duration counters. TTFT is unavailable with non-streaming output. Hardware/runtime/dependency versions and resource/load/power conditions require fresh reporting before each future run.

Accuracy denominators keep errors/timeouts/missing attempts. Primary qualification requires intent >=90%, full-plan >=85%, successful structured/semantic/contract validity 100%, zero timeouts/errors/safety failures and completed mean <=10s. Publish Wilson intervals, dependent-family caveats and language/role breakdowns. Predeclared paired-family comparison and tie rules prioritize accuracy and safety; no qualifying model means no winner. Latency cannot rescue unauthorized/widened scope.

## Isolation and execution decision

Readiness checks prove native denies for `.env`, old corpus/source/build copies, F, DB/MCP/RAG/training modules and protected writes. VM imports are allowlisted and source-hashed; caught encoded legacy and module violations stay fatal. Fetch/network/process/worker/provider imports are blocked before transport. Windows-injected profile/PATH keys are stripped by a new readiness-only preload; secret values are never inspected or printed. The only admitted runtime is the exact R hash. S golds remain host-side scoring data, not resolver examples. No HR action, real write or production authentication occurs.

**CLEARED FOR BASE-MODEL SELECTION EXECUTION: NO.** The scorer, eligible partition and common run/payload contract are ready and frozen. A common contract is not a populated real candidate run. There are **zero admitted real candidate identities**: no fresh checkpoint/digest/license/adaptation/export evidence was verified, and no final candidate-bound run manifest exists. A future loopback-only live transport also needs reviewed implementation/verification before any inference; the present profile intentionally blocks every transport. No unimplemented live safety control is labelled tested.

**Next recommended phase: Phase 1D.1 — non-generating candidate provenance/identity admission, final run-manifest binding and loopback-transport verification using mocks/metadata only.** Verify the exact artifact, original trainable checkpoint, tokenizer/template/quantization, license, adaptation/export evidence and provider build without running evaluation. Do not choose a winner, pull a model, call inference or execute S/F until those run-specific gates and explicit execution scope are satisfied. Human review is not reintroduced as a requirement.

## Audit trail and limits

The initial scorer run passed 118/119; the test incorrectly assumed admins could `decideRequest`. The actual registry correctly rejected it. The corrected test selects an allowed role and separately proves admin denial. An intermediate suite passed 120/120. The final pre-execution audit added all action-field checks and strict terminal/confirmation/scoped-target checks, reaching 179/179. Earlier reports are preserved; no candidate score informed these changes.

The first partition launch failed closed during a pinned package-metadata read, before S was loaded; the exact non-data dependency grant was added. The first readiness verification stopped on Windows-injected environment keys, before S was loaded; only the readiness preload changed. Contract drafts, the original partition draft and prior 84-check report remain preserved. Finalization changed scorer/hash bindings only, not the 160 records, classification membership, golds or captured messages. Node's experimental VM warning is expected, not a failed test.

`run-offline.mjs` has only fixed scorer-selftest, partition and readiness-verification modes; no live model/evaluation mode exists. Evidence outputs use exclusive creation: these sealed output paths are intentionally not overwritten by a repeat invocation. Any repeat needs new versioned evidence paths and a newly bound manifest, not deletion of old results.

**Production data accessed: NO. Production DB/MCP/RAG: BLOCKED. Real writes/actions: 0. Historical 10K: EXCLUDED. Model calls: 0. Candidate models executed: 0. Frozen F executed: NO — 0/404. Fine-tuning: NOT STARTED. Production source, prompts, rules, schemas, permissions, AI_PROVIDER, .env and behavior: UNCHANGED. Git initialization/publication: NO.** Stop after Phase 1D.0.
