# Phase 1C.2: experiment lock, security gates and evidence plan

Date: **2026-10-25**, Asia/Riyadh. **DESIGN ONLY. No lock artifact, dataset, model run, training job, repository or upload is created.** See [provenance/baseline plan](01-synthetic-dataset-provenance-plan.md) and [selection protocol](02-base-model-selection-plan.md).

## 1. Evidence identities and immutable history

Keep three identities distinct:

* **Historical system:** original snapshot/manifest plus the two explicitly approved HIGH security fixes. Its unverified runtime corpus remains unadmitted; no official 404 results exist.
* **New controlled experimental baseline (recommended future path):** explicitly reviewed source/dependency/fixture manifest, independently synthetic runtime-reference asset, selected base checkpoint and frozen inference configuration. It is not unchanged historical behavior.
* **AFTER target:** same controlled baseline with only the predeclared tuned model/adapter weights and necessary model artifact identifier changed. Any rule, prompt, runtime-example or backend change is a different experiment/confound, not a hidden improvement.

Historical hashes verified in this phase:

| Artifact | SHA-256 |
|---|---|
| Frozen 404 JSONL | `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05` |
| Existing 10k runtime corpus | `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` |
| Historical manifest | `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47` |

Do not regenerate the historical manifest, overwrite prior reports or change frozen golds. A future controlled target needs its own named/versioned manifest referencing original hashes, approved differences and reasons. Existing `verifyFrozen()` accepts exactly two HIGH-remediation hashes and rejects other source drift; it must not be weakened to make an experimental fork look historical. New data-policy support requires a new reviewed harness/target version and fresh isolation evidence.

## 2. Proposed experiment lock

The lock occurs **after base-model selection and before the official BEFORE benchmark**. Required fields for a future lock record (no record instantiated here):

| Area | Must be pinned and reviewed |
|---|---|
| Identity | Experiment ID/version, UTC/timezone, purpose/hypothesis, owner/reviewers, historical-versus-controlled designation, approved deviations |
| Learning target | Question-plan-only scope or separately approved task heads; exact structured contract/registry/schema hashes; no claim that question training migrates action/continuation/prose providers |
| Base checkpoint | Canonical model ID/revision, original weights and tokenizer/config/template hashes, rights/license review, model family and supported training method |
| Runtime artifacts | BEFORE GGUF/other inference digest, exact tag, quantization, converter/toolchain/version/recipe, runtime build; explicit base-checkpoint-to-artifact provenance |
| Inference | System/chat template and prompt bytes/hash, role lists, example retrieval and fixed asset hash, schema/format, temperature/seed support, thinking policy, context/threads/batch/cache/keep-alive, stream flag, deadlines and no-retry/no-fallback policy |
| Resolver | All deterministic/terminal/phrasebook/training/context sources and priorities; explicit corpus policy and actual supplied bytes; authoritative validation, RBAC, scope, confirmation and capability contracts |
| Data | Separate T/R/V/I/S manifests, lineage/split/quarantine decisions, synthetic attestations, overlap scans and privacy reviews; F path/hash/count and sealed-access policy |
| Execution fixture | Synthetic identities/roles/ownership, fixed dates/timezone/page/prior context, fresh process policy, supported services and explicit unavailable cases, no-op/mocked boundaries |
| Metrics | Denominators/equivalences, model-versus-local partition, missing/error handling, complete-plan definition, language/layer breakdown, latency/resource policy, accepted statistical method |
| Training protocol | Trainer/dependency versions, original checkpoint, adapter/target modules if applicable, optimizer/scheduler, precision/quantization, learning-rate/search space, epochs/steps/batch/accumulation, seeds, budget and V-only early stopping/checkpoint choice |
| Environment | OS/Node/Ollama/training-library versions, CPU/RAM/training hardware, deterministic settings and concurrency/power policy; omit host/user/serial/secret identifiers |
| Security | Stage approvals, input admission, isolation test versions/results, six MEDIUM statuses and scope, deny-by-default capabilities, evidence-access/retention roles |
| Integrity | Source/config/harness/dependency hashes excluding secrets, manifest self-hash, artifact hashes, sign-off/attestation binding and later chain of custody |

Unresolved compatibility or training feasibility means no lock. Pin the untuned inference artifact before BEFORE; pin the tuned checkpoint, adapter merge and exported artifact **before AFTER is opened**. Record exact quantizer/template equivalence; a tag alone is insufficient and must never be overwritten in place.

The BEFORE/AFTER controlled pipeline must be identical except for declared learned weights. Keep R examples, prompts, schemas, local routing, services, fixture limits, runtime/converter/quantization and all scoring/timeout settings fixed. A changed model name must not alter Qwen3 non-thinking detection inadvertently; validate equivalent adapter controls before lock. If later drift is necessary, stop the paired experiment, preserve evidence and issue a new protocol/version rather than repair one side silently.

## 3. Final-benchmark protocol and leakage control

F is **FROZEN EVALUATION DATA — DO NOT USE FOR TRAINING**. No selection, validation, prompt mining, hyperparameter tuning or repeated optimization may use its 404 rows, translations, expected plans, identities or failure analysis.

Pre-register one primary BEFORE and one primary AFTER pass under equivalent conditions; any planned replicates/seeds must be specified before unblinding, never chosen after a bad score. No automatic retries hide failures. All attempted runs, aborts and exclusions are evidence. A security/isolation error aborts immediately; inability to execute a fixture is reported separately from a model error.

Recommended blinding: a custodian runs the official BEFORE only after the lock, stores raw results/quality metrics sealed and provides developers only necessary integrity/isolation/operational status. Developers select training hyperparameters/checkpoints using T/V under the predeclared rules; no BEFORE accuracy/failure feedback. After the tuned checkpoint/export hashes are locked, the custodian runs AFTER and releases paired analysis. If BEFORE quality information is disclosed earlier, record who saw it and prohibit using it for development; do not pretend this was fully blind.

Use all frozen cases under their declared evaluation layers. Model-only denominators exclude deterministic/terminal resolutions and service-boundary supplied candidates; service-boundary expected candidates are explicit inputs, not predictions. Generic read results/scope labels and incomplete resource fixtures cannot certify production SQL/RBAC end to end. Report fixtureUnavailable/not-observed separately, plus attempt-wide metrics so missing work cannot inflate success. Keep model understanding, orchestration, permission checks, confirmation decisions and real execution as separate claims; real execution is always disabled in isolated evaluation.

A contamination custodian may perform the fixed exclusion-only F overlap check described in document 01 before admission, without revealing content/golds to authors or optimizing generation against results. Preserve that decision trail. No future publication should claim that a synthetic benchmark/model score alone proves access-control security, no PII egress, voice quality or unseen real-user generalization.

## 4. Mandatory security gates

Every gate needs a dated PASS/FAIL decision, evidence hashes and an accountable reviewer. Absence of a key or an accuracy gain is not a security control. A gate approval authorizes only that stage's defined scope, not the next stage automatically.

| Stage | Required gate before work | Failure behavior |
|---|---|---|
| **A. Synthetic generation** | Approve protocol/task/quotas, allowed source manifest, placeholder/render policy, generator/environment/seed, synthetic-only authoring, T/R/V/I/S separation and no access to F/old corpus/production data. Any teacher requires separate local model/input approval | Do not generate; no real-source sanitization/export as a shortcut |
| **B. Model selection** | Admit R and S with provenance/PII/schema/semantic/contamination reviews; remove old corpus from resolver/model read access; pin candidate/weights/rights, fixture target and scoring; verify isolation. Non-F smoke controls only, no real actions | No candidate calls; unknown runtime/structured capability remains unsupported, not silently adjusted |
| **C. Official BEFORE** | Approved new target or verified historical admission, completed selection decision, signed/hash-bound experiment lock, exact base artifact, same frozen F hash, fresh isolation/RBAC/fixture checks, sealed results policy | No 404 execution; never substitute local-only for full hybrid or silently accept unverified examples |
| **D. Fine-tuning** | Separate execution approval; admitted T/V only, F/S/I unavailable to trainer, pinned checkpoint/recipe/budget, safe training environment, outputs/retention rules, no real records or credentials. No BEFORE-score-driven tuning | No training/upload; independent synthetic-data clearance is not permission for real HR export |
| **E. AFTER** | Freeze chosen checkpoint on V-only criteria, scan/verify model/export and exact runtime controls, verify unchanged router/R/prompt/schema/fixtures/scorer, recheck F/manifest/isolation and predeclared comparison | Stop on drift/security failure; preserve original attempts and declare any new experiment |
| **F. Production deployment** | Separate authorization/security/privacy/performance/change review; re-audit affected MEDIUM findings, all relevant channels and real service authorization/consent, no silent provider fallback; reviewed staging/canary/rollback/monitoring | No deployment. Isolated accuracy cannot waive validation, RBAC, record scope, action confirmation or privacy |

For isolated stages B/C/E, production PostgreSQL, MCP, RAG, real writes, external HR APIs, cloud inference and credential inheritance must remain blocked. Only approved loopback inference with admitted synthetic input is allowed. Keep native child write/process restrictions, explicit static module graph, file read allowlist, synthetic actors, bounded fixture queries, independent transport enforcement and latched isolation errors. Do not trust `AI_PROVIDER`/`AI_SHARE_DATA` as systemwide egress policy. If a remote training/inference environment is later proposed, it is a new approval/privacy/transport scope, not covered by this local plan.

Six MEDIUM findings are not remediated by these documents:

| Finding | Required treatment |
|---|---|
| SEC-03 MCP validation/orchestration parity | MCP blocked for isolated work; mitigate/re-audit before production MCP evaluation |
| SEC-04 human consent/confirmation channel differences | No business execution in isolation; mitigate before protected production execution evaluation |
| SEC-05 raw-language retention/export | Real stores unavailable; no training export. Any future real-source proposal needs a separate retention/redaction/governance gate |
| SEC-06 provider/egress and unresolved example admission | Still open. A newly admitted isolated asset would resolve that target's legacy-input exposure only, not certify the old corpus or fix production-wide egress |
| SEC-07 RAG content/audience governance | Real RAG blocked; mitigate before production RAG evaluation or proposed document reuse |
| SEC-08 logging/redaction | Controlled synthetic-only isolated outputs; mitigate/re-audit before production-connected diagnostics/data use |

Security remains independent of learning quality. A safe schema does not authorize a record; local rules and model plans both need the same server validation → RBAC → record scope → existing service boundary. No higher score justifies relaxing any check or adding missing production capabilities.

An experimental result using a new runtime-reference asset must not be claimed to describe production while production still uses the old corpus. Any eventual rollout of the new asset, checkpoint or provider configuration requires its own explicit release approval and matching security/performance validation. No production asset replacement or provider migration is implied by this design.

## 5. Evidence structure for later private storage and publication

Proposed layout only; none of these future experiment/data/result files or directories is created now:

```text
experiment-<ID>/
  protocol/             hypotheses, stage approvals, amendments, custodian roles
  manifests/            historical references, controlled source/data/model hashes
  provenance/           generator recipes, allowed inputs, attestations, rejects
  security/             audits, gate decisions, isolation/RBAC evidence
  datasets/             admitted T/R/V/I/S manifests and approved release files
  final-benchmark/      frozen metadata/hash; access-restricted raw F/golds
  model-selection/      pre-registration, candidates, all attempts, metrics, decision
  lock/                 immutable experiment lock and hash-bound sign-offs
  before/               sealed raw case outcomes, metrics, environment/resource data
  training/             recipe/dependencies/seeds, logs, checkpoint/export manifests
  after/                checkpoint lock, raw outcomes, metrics, environment data
  comparison/           paired results, uncertainty, limitations and negative results
  publication/          explicitly reviewed public bundle and redaction mapping
```

Store immutable raw results separately from derived metrics; hash both and record scorer/version/denominators. Per-case evidence should distinguish expected versus observed plans/entities, routing source/rule/terminal outcome, validation, permission/scope/confirmation, model attempts/tokens/errors, monotonic latency and intercepted-execution flags. Admit only synthetic content, suppress credentials and production HR record contents, and review hallucinated outputs too. Keep unavailable metrics unavailable; never invent Qwen historical measurements or claim model execution from dry-run/mocks.

Record original trainable/inference artifact identities, exact runtime/training environment, load/resource settings, every run/abort, elapsed times/seed support, all checkpoint selection choices, independent reviews and approved deviations. Keep a provenance chain from permitted recipe to dataset to model to inference export to comparison. Hashes prove byte identity, not truth, source consent or secrecy; signed/approved evidence and reproducible recipes address different questions.

## 6. Future Git/GitHub publication gate

No Git initialization, commit, remote or upload is performed in this phase. The project currently has no Git history; use hashes for present continuity. A later explicit publication approval should create a **separate sanitized allowlisted evidence bundle**, rather than blindly staging the application workspace.

Before any future public upload require:

1. Secret and credential scans across content, filenames, metadata, notebook/output/log cells, archives and any proposed Git history. Reject real secrets; do not publish environment files or secret hashes as evidence.
2. Bilingual PII and production-data review, source/provenance/rights review and model/dataset license review. Synthetic declarations/regex scans alone are insufficient. Exclude the old unverified corpus, uploads, DB exports, RAG sources, real conversations/audio, local tokens/caches and application credential material.
3. Explicit `.env`/environment-file inventory and exclusion check (including production examples that might accidentally contain values), key/certificate/token files, URLs with embedded credentials and generated logs/backups. Use sanitized configuration templates with value-free secrets only after review; do not copy actual `.env`.
4. Review security report disclosure and exact source/asset publish permissions; publishing full exploitable details or unreviewed private literal examples is a separate decision. Redact local user paths/identifiers and reviewer identities where appropriate without modifying private historical originals.
5. Keep a private original-hash → public sanitized-hash mapping with transformation/reason and review. Public derivatives receive new hashes and are labeled redacted; never claim they equal the original manifest bytes.
6. Keep F cases/golds and BEFORE outputs private until the tuned checkpoint/AFTER lock and evaluation are complete. Decide later whether to release full F or metadata only; publication affects future uncontaminated use. Do not claim a publicly reused final set remains unseen for later experiments.
7. Independent release sign-off, explicit file allowlist and post-build verification. No broad workspace upload, implicit credential inclusion or model weights without rights. Store restricted evidence with access/retention/backup policy; Git history is not a secret-removal mechanism.

## 7. Phase 1C.2 outputs, verification and unresolved decisions

Created exactly three design documents: this file, document 01 and document 02. No existing report, source/config, prompt, schema, rule, dataset, harness implementation or historical manifest is modified. All **410 pre-existing protected files** were compared before/after and remain unchanged. Frozen-artifact preflight reports **INTEGRITY VERIFIED; NO CASES EXECUTED**; the three hashes above match. No new result directory or Git repository was created. Existing isolation tests are historical/recent Phase 1C.1 evidence (42/42), not a new 404 execution or a claim that future unimplemented harness options already pass.

Unresolved items requiring later decisions: old creator evidence; controlled-baseline approval and target override implementation; independent synthetic family quotas/rights/privacy review; generator and teacher choice; training scope/toolchain/hardware; candidate shortlist and actual S-eligible coverage; original-to-inference artifact correspondence; independent review/custodian and storage/retention owner. No exact base or winning model is selected. No later gate is implicitly passed by completing this design.

**Recommended next phase: Phase 1C.3 — approve the controlled-baseline/provenance protocol and its isolation/admission acceptance criteria.** A subsequent explicitly authorized phase may implement the generator and create/review independent synthetic data; selection and lock must follow before official BEFORE. The current historical Phase 1D clearance remains **NO**.

**Design status: PASS WITH LIMITATIONS. Synthetic generation: NOT STARTED. qwen3:4b: CANDIDATE ONLY. 404 executed: NO. Training data created: NO. Fine-tuning started: NO. Production data accessed: NO. Production behavior modified: NO. Security gates: DEFINED. Evidence/GitHub plan: DEFINED.**
