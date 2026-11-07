# Phase 1C.4R — remediation and re-admission

Date: **2026-10-25**, Asia/Riyadh. Authority: user Phase 1C.4R, with [04-controlled-baseline-and-data-admission.md](../../../design/04-controlled-baseline-and-data-admission.md) otherwise unchanged.

**STATUS: FAIL for final admission — HUMAN REVIEW REQUIRED.** The bounded data remediation, fixed automatic checks and technical exclusion preflight are complete. Both v1.1 candidates remain **REJECTED pending independent human review/admission**. No model-selection execution is cleared.

## What failed and what changed

The rejected runtime v1 had three F collisions: one exact and two additional strong near-matches. Selection v1 had no static collision, but no admin actors. Both lacked mandatory independent bilingual privacy/semantic/admission review. All rejected assets, scanners/results, reports and the old manifest remain unchanged.

| Release | Parent SHA-256 | New SHA-256 |
|---|---|---|
| [Runtime v1.1](../runtime-reference-v1.1.jsonl) | `342503dd6c810136d8b5ede8dea96005e593a2ee623f849640fcfd357bb826de` | `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736` |
| [Selection v1.1](../model-selection-v1.1.jsonl) | `8d50c67b4daa388c9cadcd3e992e0aa8504a08534b1beb4bdc2a022ac62928c6` | `09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986` |

**Runtime:** only the three previously excluded candidate slots were replaced: MSA `requestLeave`, mixed `scrollPage`, English `markAllNotificationsRead`. Their controlled action/slot contracts, targets, roles, language labels and annotations were retained. Their text/wire text and version/template/provenance metadata changed. The other **317 lines are byte-for-byte inherited**. The sealed selector returned only our candidate handles/hashes, no F text/golds/IDs/scores. The user's targeted three-record remediation instruction permits this bounded exception to the prior aggregate-only/family-quarantine procedure. No author inspected F content for wording and no replacement was revised after the scan.

**Selection:** **72 roles changed**, with updated version/template/parent-hash metadata; **88 lines inherited unchanged**. All 160 texts, symbolic/wire targets and challenge annotations are unchanged. Per language: five self-service core families move employee→manager; knowledge/help/greeting move employee→HR; ten company payroll/workforce core families move HR→admin. Every resulting role/intent pair passes the real registry. This achieves **10 employee / 10 manager / 10 HR / 10 admin per language**, 40 each overall, without changing scope or adding cases. All 32 intent core cells and 32 challenge cells remain.

See the predeclared [remediation plan](../generation/remediation-plan.json), [replacement catalog](../generation/replacement-catalog.json), [row-by-row hash deltas](../generation/row-deltas.json), [pre-generation input manifest](../generation/pre-generation-manifest.json), [generation completion](../generation/generation-result.json) and [creator attestation](creator-attestation-v1.1.md). No randomness; fixed order, UTF-8 LF and exclusive-create outputs. The pre-generation manifest now also binds the original launcher. Changed rows carry `assetVersion=v1.1`; unchanged rows retain v1 metadata so their original bytes are preserved. The file/release version is v1.1; this is not a silent full-row rewrite.

## Automatic validation and exclusion

[Immutable validation result](../validation/validation-results.json):

| Check | Runtime | Selection |
|---|---:|---:|
| Rows / normalized unique / duplicates | 320 / 320 / 0 | 160 / 160 / 0 |
| EN / MSA / Jordanian / mixed | 80 / 80 / 80 / 80 | 40 / 40 / 40 / 40 |
| Core intent coverage | 32, 128 question rows | 32, 128 core rows |
| Direct action coverage | 48, 192 action rows | Not second-stage action evaluation |
| Clarification/unsupported/etc. challenge controls | Inherited annotations | 32 retained |
| Full strict record envelope / wire consistency | 320/320 PASS | 160/160 PASS |
| Actual shared Zod + question semantic checks | 640 PASS | 272 PASS |
| Actual action Zod checks | 384 PASS | Not applicable |
| Exact / normalized duplicates | 0 / 0 | 0 / 0 |
| Static privacy / metadata scan | PASS, zero pattern hits | PASS, zero pattern hits |
| Secret/credential scan | PASS | PASS |
| Independent review | HUMAN REVIEW REQUIRED | HUMAN REVIEW REQUIRED |

S retains 136 question-plan targets plus 24 null-plan clarification/unsupported controls. Those controls are not executable plans or model outputs. No model-eligible/local partition was measured. Role/context expectations remain annotations until reviewed; permission and confirmation tags do not authorize anything.

Thresholds are unchanged: raw exact, resolver-compatible normalized equality, known entity-mask equality; >5-token token-3-shingle Jaccard ≥0.80; short-text character-3-shingle Dice ≥0.90; Unicode edit similarity ≥0.90; primary and declared wire forms. Near counts exclude exact/masked flags. No embeddings, model judging or adaptive threshold tuning.

| Fixed comparison | Exact | Normalized | Masked exact | Additional near | Flagged rows |
|---|---:|---:|---:|---:|---:|
| Runtime v1.1 → frozen F | 0 | 0 | 0 | 0 | **0** |
| Runtime v1.1 → historical 10K | 0 | 0 | 0 | 0 | **0** |
| Selection v1.1 → frozen F | 0 | 0 | 0 | 0 | **0** |
| Selection v1.1 → historical 10K | 0 | 0 | 0 | 0 | **0** |
| Selection v1.1 → runtime v1.1 | 0 | 0 | 0 | 0 | **0** |

These are **zero detected lexical matches**, not proof of cross-language semantic independence. The sealed validator alone reads protected corpora; generation and resolver tests cannot. Protected texts/golds/F IDs/match suggestions are not in outputs. The three old candidate handles are retained privately only as the bounded remediation selectors. No candidate was regenerated after results.

The scanner reuses corrected v2 patterns and declared reference-date/amount handling, with extra metadata scanning and strict envelope/parent binding. Symbolic identities remain typed placeholders. Known lineage IDs/hashes/enums and invented dates are validated separately; negative regex results cannot certify absence of all PII. Independent review must inspect every field. Existing maintained phrasebook/conversation/help example arrays are excluded from the new exclusion-preflight target, not silently admitted. Their privacy/lineage inventory and full-baseline parity remain later target-review work.

Detector/normalization controls: **26/26 PASS**. New-module syntax: **12/12 PASS**. The first validation launcher stopped fail-closed on a missing read permission for the candidate-only selector evidence, before F/10K comparison or a result write. A separate check launcher corrected only that evidence-input allowlist; the frozen generation launcher and asset bytes remained intact. [Attempt record](../validation/check-launcher-failure.json). The final fixed scan completed; no provider failures/retries or model calls occurred.

## Independent review and admission

The authority explicitly requires “bilingual human review of all release texts and residual candidates.” The assistant who authored the templates cannot self-certify this. No actual independent human review was available in this session.

Created an [independent review checklist](../review/independent-review-checklist.md), [480-row hash-bound review register](../review/review-register.json) and [summary](../review/review-summary.json), with **12 pending criteria per row, zero completed human reviews**. They cover all four language styles, PII/secrets, placeholders, intent/actions, slots, role/scope, clarification/unsupported, confirmation, lineage and rights. Reviewers/approval/signature fields are null, not fabricated. Inherited rows require review too.

**Runtime: REJECTED pending human review. Selection: REJECTED pending human review.** Admin coverage and static contamination issues are remediated, but the independent review/semantic-lineage/admission gate is still unmet. No “with limitations” status waives it. The [admission gate](admission-gate.json) explicitly blocks loading either actual release for execution. S remains model-selection-only and never training, validation or runtime examples.

## Legacy exclusion — verified scope and limits

Created a separate, test/evaluation-only [controlled loader](../evaluation/controlled-loader.mjs), [resolver capsule](../evaluation/resolver-capsule.mjs), [hash-pinned target lock](../evaluation/target-lock.json) and [self-tests](../evaluation/self-test.mjs). No historical harness or production module was edited.

The new profile substitutes the logical `training.ts` dependency with a modern typed R projection, preserving full plans and direct action types rather than mapping through old labels. Original training source, legacy JSONL/build copy, F, credentials and service modules have no native read permission. No missing-file catch or fallback enables the old corpus. Unmapped imports and legacy references fail closed; a caught violation leaves a sticky failure that prevents further resolution.

The public loader requires a hash-bound independent admission/review record **before** reading the fixed R path, rejects other purposes, hashes/counts and redirected paths, and checks 32-intent/48-action retention. It has no alternate path or S-as-runtime option. Current admission is pending, so the actual release was correctly rejected before read. Future approved evidence and explicit native read permissions require a separately reviewed successor target lock; no model execution path exists here.

Positive proof used **five fixed in-memory canaries**, explicitly not admitted assets or a benchmark. The real current `resolveQuestion()`, deterministic read rules and shared validation ran within the new capsule; controlled exact matches retained person/report/period/amount and existing role restrictions. No S/F row was executed. The actual R/S candidates were not loaded into the resolver. This distinguishes technical exclusion verification from an admitted-baseline run.

[Isolation results](../evaluation/isolation-results.json): **55/55 PASS**, including original/build/encoded/absolute legacy references, native read denials, pending-admission rejection, forged-projection rejection, module denials, sticky failure after caught violations, four-role canaries, deterministic validation and unresolved requests with provider disabled. Native guard probes fail before transport. No source training loader or legacy bytes appear in the loaded module graph. Node emitted its expected experimental-VM warning; no test failed.

**Legacy 10K exclusion: VERIFIED FOR THE NEW EVALUATION CAPSULE ONLY. Fail-closed exclusion test: PASS.** This does not retrofit the historical harness or certify a production-connected/full-fidelity CEB execution target. Maintained language-example arrays, help/conversation data and live provider/services are excluded; the lock labels this an exclusion preflight, not production-equivalent behavior. Production continues unchanged. Full baseline admission, source-example inventory, scoring/partition lock and model authorization remain separate gates.

## Security, integrity and evidence

| Recheck | Result |
|---|---|
| Production data used/accessed | **NO** |
| Production DB / MCP / RAG | **BLOCKED / NOT ACCESSED** |
| Real business writes | **0**; filesystem writes limited to this new evidence tree |
| Production credentials | **EXCLUDED**; no `.env`/secret was read |
| Cloud / Ollama / other model calls | **0 / 0 / 0** |
| Frozen benchmark executed | **NO — 0/404** |
| Fine-tuning started | **NO** |
| Production behavior/source/configuration | **UNCHANGED** |
| Historical v1 assets/results/manifests | **UNCHANGED** |
| Git initialized / uploaded | **NO / NO** |

The native deny/import controls apply to trusted, hash-pinned tools; they are not a claim of a machine-wide ACL or a general hostile-JS sandbox. Pure shared knowledge/voice type schemas are contracts, not production RAG/voice service access. The guard's fake network probes throw before transport. A sealed read-only hash/comparison is not frozen-case execution.

Final [integrity verification](integrity-verification.json) binds **435 pre-existing protected files**, including all 21 v1 evidence files. All remain unchanged. Frozen F remains `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05`; historical 10K remains `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b`; historical baseline manifest remains `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47`. No historical manifest was regenerated.

| New tool/result | SHA-256 |
|---|---|
| Generator | `19ccbab95ac069e29576af7aaa4f81b81c7b8c3203cec6c96a98e10788a697f4` |
| Sealed validator | `f69f644d3b4192b788c8f42b077908926cb09d2f5f13d9d78b81206c6afa17ba` |
| Fixed validation core | `7dd0dcb6add3dd413af9e586ded3e2e668e0d91a0686a764fe075e3f906de444` |
| Validation result | `6539e36628c24e986735d49fa82584a3b2b62f90b6cb174380f54664f85fe3ca` |
| Isolation result | `948157f84f9c5402fce511473d599e57ae6736a45a88f5b78d30f537b0ba29ec` |

All new files, including this report, are sealed in the new [evidence hash manifest](evidence-hashes.sha256); it excludes itself to avoid a cycle. Old hashes/manifests remain intact. No public release is authorized.

**MEDIUM input-admission finding: STILL BLOCKING. CLEARED FOR MODEL-SELECTION EXECUTION: NO.** Technical legacy exclusion in the new preflight does not close missing asset review/admission or the broader production finding. No candidate model, benchmark run or fine-tuning starts after this report.
