# Phase 1C.4P — automated re-admission of unchanged v1.1 assets

Date: **2026-10-25**, Asia/Riyadh. Policy: **CEB-AUTO-ADMISSION-1**, approved by the project owner's explicit instruction and recorded in [protocol amendment 05](../../../design/05-protocol-amendment-automated-admission.md).

**PHASE STATUS: PASS WITH LIMITATIONS. Amendment: APPROVED. Runtime v1.1: ADMITTED. Model Selection v1.1: ADMITTED. Human review: OPTIONAL / NOT PERFORMED.** This is automated dataset admission for the isolated controlled experiment, not production approval or an executable model-run clearance.

## Decision and exact bytes

The prior mandatory human-review gate is superseded for this controlled scope. All old documents, rejected v1 evidence, historical v1.1 decisions, gates, reviewer register and optional human-review interface remain unchanged. No independent human reviewer/signature is invented and no human validation is claimed. The older v1.1 rejection remains an accurate historical result under its earlier policy; the new decision below is the current purpose-specific admission authority.

| Asset | Rows / unique / duplicates | Language distribution | SHA-256 | New admission |
|---|---|---|---|---|
| [Runtime v1.1](../runtime-reference-v1.1.jsonl) | 320 / 320 / 0 | 80 EN, 80 MSA, 80 Jordanian, 80 mixed | `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736` | **ADMITTED — runtime-reference-only** |
| [Model Selection v1.1](../model-selection-v1.1.jsonl) | 160 / 160 / 0 | 40 each | `09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986` | **ADMITTED — selection-only, never training/validation/runtime examples** |

Machine-readable authority: [admission-decision.json](automated-policy-v1/admission-decision.json), ID `CEB-1C4P-RS-v1.1`, SHA-256 `d61374754b7454e77404562402df2617fd615ed334c4859ed064cbd2f46d1bf3`. The decision binds both asset hashes, the exact amendment, checkers, raw results, purpose restrictions and methodology limitation. It is owner-authorized automated admission, not a human-review certificate.

**No asset was regenerated or edited.** Read-only recipe verification compared existing lines with the frozen parent/delta/catalog contract, including all 317/88 inherited lines and 3 runtime / 72 selection-role edits already made in Phase 1C.4R. It invoked no generator and wrote no JSONL release. Both expected whole-file SHA-256 values match exactly.

## Required automated gates

[Fresh validation](automated-policy-v1/validation-results.json), [detector/supplement self-tests](automated-policy-v1/selftest-results.json), [exclusion preflight](automated-policy-v1/evaluation/preflight-isolation-results.json), and [real admitted-runtime verification](automated-policy-v1/evaluation/runtime-exclusion-results.json):

| Gate | Runtime | Selection / common evidence |
|---|---|---|
| Existing Zod schema | PASS: 640 question and 384 action symbolic/wire checks | PASS: 272 question checks |
| Shared semantic consistency | PASS | PASS |
| Strict envelope / wire consistency | 320/320 PASS | 160/160 PASS |
| Exact/normalized duplicates | 0 / 0, PASS | 0 / 0, PASS |
| Privacy/PII text/context/plans/metadata | PASS, zero static pattern hits | PASS, zero static pattern hits |
| Secrets/credentials | PASS | PASS |
| Frozen-404 contamination | 0 detected, PASS | 0 detected, PASS |
| Historical-10K contamination | 0 detected, PASS | 0 detected, PASS |
| Runtime/selection overlap | 0 detected, PASS | 0 detected, PASS |
| Actual roles/capabilities and deterministic scope | PASS | PASS; 40 of each role, 10 per role/language |
| Placeholders / stated entity consistency | PASS | PASS |
| Language-label/script and quotas | PASS | PASS |
| Restricted-process isolation | PASS | 55/55 preflight checks plus 31/31 successor-profile checks |
| Legacy 10K/build-copy exclusion | VERIFIED | New isolated automated-policy profile only |
| Fail-closed exclusion | PASS | Caught violations stay fatal; unmapped imports cannot continue |
| Integrity / reproducibility evidence | PASS | Fixed input hashes plus read-only exact recipe conformance; no release rewrite |

The supplemental checks reject unstated target placeholders, missing named-employee identifiers, incompatible self/team/company scope, unsupported self-service filter golds, invalid action-stage/confirmation combinations and executable control flags. Existing Zod and shared runtime semantic validation remain unchanged. These checks validate a structured contract and bounded scope rules; they do not certify arbitrary natural-language meaning or production SQL.

Runtime retains all **32 intents** and **48 direct action types**, with 128 question and 192 action references. Selection retains 128 core cases plus 32 challenge controls; 136 complete question-plan targets and 24 non-executable clarification/unsupported controls. No null control is fabricated into an executable/model plan. No local/model eligibility partition, model score or latency was calculated.

Contamination thresholds are unchanged: raw exact, resolver-compatible normalized and known entity-mask equality; token-3-shingle Jaccard ≥0.80 for longer inputs, short-input character-3-shingle Dice ≥0.90 and Unicode edit similarity ≥0.90. Primary and declared wire forms are checked. All exact/normalized/masked/additional-near counts are zero in all five comparisons. These are fixed exclusion scans, not an adaptive membership oracle; no asset or threshold changed after feedback. Only aggregate protected-corpus results are output.

Privacy raw status remains `PASS_STATIC_WITH_REVIEW_LIMITATIONS`; under policy 05 this satisfies the deterministic privacy gate while preserving the linguistic/PII limitations. No old scanner result is relabelled or overwritten. Declared synthetic metadata dates/instruction amounts and typed lineage IDs/hashes are verified exceptions, not real HR facts. The quarantined 10K is read only by the sealed exclusion checker; it is never admitted as generation/model/reference context.

**Self-tests: 30/30 PASS. Prior exclusion mechanics rerun: 55/55 PASS. New admitted-runtime profile: 31/31 PASS. New JS syntax: 9/9 PASS.** One new entry-point import initially failed before any candidate/protected data was read; its [attempt record](automated-policy-v1/validation-attempt-001.json) is preserved. Only that relative import was corrected; no check logic/threshold/asset changed. Expected Node experimental-VM warnings are not test failures.

## Technical exclusion and new loader version

The old human-policy loader, old rejection gate and historical harness were not edited. A separately versioned [automated loader](automated-policy-v1/evaluation/controlled-loader.mjs), [resolver capsule](automated-policy-v1/evaluation/resolver-capsule.mjs) and [target lock](automated-policy-v1/evaluation/target-lock.json) consume the new hash-bound automated decision. The capsule loads the current production resolver source unchanged, substitutes only the isolated typed reference dependency, excludes unadmitted maintained example arrays, disables all model/provider transports and blocks all production services.

The public loader checked the actual admitted R bytes, all 320 projected references and 32/48 coverage. S, legacy source/build copies, F, credentials, DB/MCP/RAG and the original training loader have no native read permission in that runtime child. No alternate asset path or fallback exists. Decision/evidence/asset drift, forged projections, encoded legacy references and unapproved modules fail closed. The loaded source graph contains no original training loader or legacy bytes. Four separate deterministic canaries and an unresolved canary verified resolver/validation operation without a model or HR execution. **No S fixture or F fixture was executed.**

The historical-profile 55-test rerun still includes assertions that its old human gate blocks loading: that is preserved historical-policy behavior, not the new admission decision. The 31-test successor profile proves the actual admitted runtime can load under the amended policy. The broad historical harness remains unsuitable for the controlled experiment; do not reuse its legacy read permission or silently modify it.

## Limitations that must remain visible

**Arabic/English semantic naturalness was not independently human-reviewed, including MSA, Jordanian and mixed phrasing. Automated checks cannot fully replace human linguistic judgment. Admission does not prove perfect linguistic quality, absence of every possible PII form or complete cross-language semantic independence.** Script matching is not dialect/fluency validation; symbolic names limit natural-name realism. Scope/confirmation annotations and pure-contract checks are not proofs of every production service or SQL guard.

Future experiment/run reports must retain `admissionPolicy=CEB-AUTO-ADMISSION-1`, `humanReviewPerformed=false` and the decision's `linguisticLimitation` disclosure. The loaded projection also retains that disclosure in its identity metadata. Any paper, presentation or publication must accurately describe **automated admission**, never these assets as “human validated.” Public release remains separately controlled; nothing is uploaded.

## MEDIUM finding and separate execution clearance

**SEC-06 input admission/exclusion: MITIGATED FOR CONTROLLED EXPERIMENT**, specifically the admitted hashes and tested automated isolated profile. The prior data-admission/human-gate blocker is removed under the owner's new policy and technical exclusion passes. This does not mark SEC-06 fixed for production or close the other production findings. **Production security status: UNCHANGED.** Any later provider/runtime change must retain the tested input/transport boundaries.

**CLEARED FOR BASE-MODEL SELECTION EXECUTION: NO.** The asset/security gate now passes, but the unamended [Phase 1C.3 §6/§8 requirements](../../../design/04-controlled-baseline-and-data-admission.md) remain unimplemented/unfrozen:

1. A tested, hash-pinned **CEB-SCORE-1 complete-plan scorer**, including null/default/error/denominator tests. The existing historical `benchmark/harness/scoring.mjs` compares annotated entity subsets and cannot supply strict full-plan S scoring.
2. A frozen **local/terminal/model-eligible partition of S** under the admitted target, with the required minimum applicable model coverage per language. No such partition was executed/frozen here.
3. A final **executable model-selection run lock** with candidate checkpoint/digest, provider transport, settings/timeouts, source/fixture/scorer hashes and run identity. The present verification profile deliberately has no model transport.

These are retained execution requirements, not a new human-review gate. This phase does not design/implement scoring, run selection preflight, select a model or waive them. No model is called even though the assets are admitted.

## Integrity and evidence

All **498 pre-existing protected files** remain unchanged, including the four earlier design records, every rejected v1/v1.1 report/result/manifest, the original pending review register and immutable human-review tool files. The live optional review store and temporary workflow/browser fixtures are not read or changed by this phase. See [final integrity](automated-policy-v1/integrity-verification.json) and [new evidence manifest](automated-policy-v1/evidence-hashes.sha256); no historical manifest is regenerated.

| Evidence | SHA-256 |
|---|---|
| Fresh validation | `37011aa65eb5febab06e2d3f8d52930117b866230b886ddfb86521c800d78542` |
| Fresh validator | `d4b3e0e36f939df55baa1f937fcc55549702302765726055e1df37ca926691ee` |
| Supplemental checks | `4abbcf660598475bc293ac8903ba18c6e14db54858c53342a82d40e8a76a84ff` |
| Runtime exclusion verification | `a1eddf2c97b9f6b35fdb7b858b21235efe27ae5fa62ce092b0d99730dfd4f705` |

Frozen F remains `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05`. Historical 10K remains `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b`. Candidate hashes are unchanged as above. Hashing/exclusion comparison is not benchmark execution.

**Human review performed: NO. Required for this controlled admission: NO. Limitation documented: YES. Production data used as generation/model input: NO. Production DB/MCP/RAG accessed: NO. Real HR actions: 0. Cloud/Ollama/model calls: 0. F executed: NO — 0/404. Fine-tuning: NOT STARTED. Source/prompts/configuration/AI_PROVIDER/.env/production behavior: UNCHANGED. Git initialization/publication: NO.** Stop after Phase 1C.4P.
