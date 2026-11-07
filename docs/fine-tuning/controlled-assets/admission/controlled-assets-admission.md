# Phase 1C.4 controlled asset generation and admission

Date: **2026-10-25**, Asia/Riyadh. Approval authority: [Phase 1C.3](../../design/04-controlled-baseline-and-data-admission.md).

**PHASE 1C.4 STATUS: FAIL for admission. Generation/evidence work completed. R-320: REJECTED. S-160: REJECTED. CLEARED FOR MODEL-SELECTION EXECUTION: NO.**

The approved counts were generated once in the isolated candidate location. Both assets pass structural/schema/semantic, duplicate, language-script and corrected static privacy/secret checks. **R has three unresolved collisions with the final 404.** Neither asset has the mandatory independent bilingual/privacy/semantic and purpose-specific admission review. S also lacks admin cases and misses the role-balance target. These gates were not waived, and no candidate was rewritten after exclusion feedback.

## 1. Outputs and cryptographic identity

| Asset | Rows / normalized unique / duplicates | Language distribution | SHA-256 | Admission |
|---|---|---|---|---|
| [Runtime references](../runtime-reference-v1.jsonl) | **320 / 320 / 0** | en 80; ar-MSA 80; ar-JO 80; mixed 80 | `342503dd6c810136d8b5ede8dea96005e593a2ee623f849640fcfd357bb826de` | **REJECTED** |
| [Model selection](../model-selection-v1.jsonl) | **160 / 160 / 0** | en 40; ar-MSA 40; ar-JO 40; mixed 40 | `8d50c67b4daa388c9cadcd3e992e0aa8504a08534b1beb4bdc2a022ac62928c6` | **REJECTED** |

Generator SHA-256: `1508cb0431d3267ba846a69718e39e19f6e4b47b41f82f161adb0d951abf0dcf`. Generation started `2026-10-25T07:29:38.478Z`, completed `07:29:38.593Z`. No PRNG/seed; fixed templates, field contracts, language order and placeholder indices. These are candidates, not production runtime files or a fine-tuning training dataset.

See [R provenance](../provenance/runtime-reference-v1-provenance.md), [S provenance](../provenance/model-selection-v1-provenance.md), [creator attestation](../provenance/creator-attestation-v1.md), [pre-generation manifest](../generation/pre-generation-manifest.json), and [generation result](../generation/generation-result.json). Exact source input hashes were verified again by the validator. The original generator/catalog/curated contract/guard are unchanged since generation.

## 2. Actual execution boundaries

The fixed offline launcher starts a fresh Node child with an OS-essential/test/timezone-only environment, native file read/write permissions and an import/fetch guard. The generator can read its own new code/catalog/curated contract, and can write only the two new candidate files and its two evidence records. Native probes denied reads of both legacy corpus paths, frozen F, `.env`, uploads and the local voice token; protected write permissions and child/worker capability are absent. HTTP imports and fetch fail before transport.

The pure contract extractor/validators load only Zod/TypeScript, shared schemas and the reviewed semantic/role/capability source graph in a VM; no application startup, DB client, auth session, MCP/RAG service, provider or resolver is loaded. They do not execute a proposal or a service. The sealed validator separately has **read-only** permission for F and the historical corpus for exclusion checks. Protected texts, matched IDs/golds and match-specific candidate IDs are never printed or placed in evidence outputs. This is a role/capability boundary for trusted pinned code, not proof against arbitrary hostile JS or a compromised OS/dependency.

| Security recheck | Result for this work |
|---|---|
| Production PostgreSQL | **BLOCKED / NOT ACCESSED**; no driver/client/session capability |
| Production MCP | **BLOCKED / NOT ACCESSED** |
| Production RAG | **BLOCKED / NOT ACCESSED**; shared knowledge type schema is not a RAG service |
| Real business writes | **BLOCKED / 0**; permitted filesystem writes are candidate/evidence files only |
| Production credentials | **EXCLUDED** from tool children; no secret file was read |
| Production HR data | **NOT USED** as source/input |
| Cloud model calls | **0** |
| Ollama/other model calls | **0** |
| Frozen benchmark execution | **0/404**; hashing/parsing/exclusion comparison is not execution |
| Fine-tuning | **NOT STARTED** |
| Production source/configuration | **UNCHANGED**; no `.env`, provider, prompt, resolver, service or frontend change |

Legacy-corpus exclusion is proven for the **generator process only**. It is **NOT YET VERIFIED for a controlled resolver/model run**: the existing historical harness still admits that dependency and no new runtime projection was integrated. Do not reuse that historical harness to claim CEB-v1 readiness.

## 3. Structural, schema, role and quality checks

[Corrected validation](../validation/validation-results-v2.json) and [full envelope checks](../validation/envelope-results.json):

| Check | R | S |
|---|---|---|
| JSONL parse/required envelope/wire consistency | 320/320 PASS | 160/160 PASS |
| Declared language/script checks | PASS | PASS |
| Exact/normalized duplicate rows | 0 / 0 | 0 / 0 |
| Question reference/core coverage | 128 rows, all 32 intents | 128 core rows, all 32 intents |
| Action coverage | 192 references, all 48 actions | 0 direct action plans; `doAction` question stage only |
| Challenge cases | Not a separate R quota | 32; ownership/ambiguity, unsupported, voice/self-correction, context/entity conflict |
| Actual Zod/shared semantic question validations | 640 symbolic+wire PASS | 272 symbolic+wire PASS |
| Actual action-plan Zod validations | 384 symbolic+wire PASS | Not applicable |
| Model eligibility/local routing | NOT ASSESSED | NOT ASSESSED |

S contains 136 complete question-plan targets and 24 non-executable clarification/unsupported annotation controls. No fabricated terminal plan is passed as a model target. Source contracts allow `lastMonth`, `employeeFile/reportType=payroll`, and actual typed field names; no new intent/period is introduced.

R roles: employee 80, manager 32, HR 200, admin 8. S roles: employee 72, manager 20, HR 68, **admin 0**. All declared positive role/capability pairs pass the real registry checks; `outOfScope` is a universally available non-executable refusal, not an allowed read permission. Role balance is not achieved, and no independent role-target deviation approval was supplied. Existing code's synthetic scope interpretation is not proof of all production SQL.

Plan schema validity is not independent gold/capability review. No application read/proposal/confirmation executor ran. Typed placeholders intentionally limit natural-name extraction realism, and unresolved resource-dependent fields make some confirmation/clarification annotations conditional. The envelope/schema checks cannot certify Arabic dialect quality, semantic paraphrase independence or real-world classification accuracy.

## 4. Privacy and secrets

All rows' required fields, symbolic/wire consistency and allowed placeholder slots were validated. The scanner examines input/expected/wire strings for email/phone/employee/UUID/national/passport/IBAN/account/address forms, medical/disciplinary/record-shaped facts, URLs/internal endpoints, API keys/bearer/JWT/password/private-key/connection strings and opaque values. Structured metadata IDs/hashes and the exact declared invented reference date are validated separately; declared synthetic instruction amount/date/time renderings are checked against the fixed recipe. Unknown concrete identity slots fail.

**Corrected static result: PASS WITH REVIEW LIMITATIONS for both assets, zero unsafe-value pattern hits; secret scan PASS.** No real person, employee identifier, contact, salary/medical/leave/attendance fact, credential or production URL was identified in the controlled content. Four R password-reset references discuss an operation, not password values. Invented instruction amounts are not assertions of actual pay. Names/IDs remain typed placeholders.

The initial scanner flattened the fixed synthetic `referenceDate` metadata into a phone-number pattern, flagging all 320/160 records. That was a validator bug, not discovered telephone data. The initial validator and results remain intact:

* Initial validator: `eb0b668c87dfd6dd1bea7357ead1a2890856e48ab038f00c19294c199bd90918`.
* Initial result: `66ddceffcab98c1186793c73818f5acec383efa9bf5e9b12ac10ae2062fb98ba`.
* Validator v2: `f84fe1698bc0218195709393d479493b27c3443f90f86c0371cf7351f7d6d00a`.
* Corrected result: `9e1c01eed3d794c6872d41a59944515443fe3fd541e89e7b461b2220e01b53d7`.

Version 2 asserts the exact declared reference date before scanning free text; other phone/secret canaries still detect. Both versions passed 22 deterministic detector/normalization/near-match controls. The full envelope/schema supplement also PASSes. The candidate bytes and collision thresholds did not change, nor did the contamination counts. No sensitive text was exposed in failure output.

No static scan establishes complete PII absence or independent semantic review. Creator review by the same template author is not the required independent bilingual privacy/rights/capability/admission sign-off. Those remain **NOT PROVIDED**, so even S's automated PASS does not admit it.

## 5. Contamination methodology and outcomes

Thresholds implement the approved protocol, without model/embedding calls: exact raw text; resolver-compatible lowercase/NFKD/Arabic/punctuation normalization; entity-masked equality from declared slot spans; token 3-shingle Jaccard ≥0.80 for longer texts; character 3-shingle Dice ≥0.90 for short texts; normalized Unicode-code-point edit similarity ≥0.90. Both primary and declared wire forms and their masked forms are checked. Identity masking preserves repeated-entity relationships. The protected 10K reduces to 3,440 unique texts; F has 404. R contributes 340 distinct text forms when its 20 additional wire renderings are included.

Near-match computation uses length/q-gram pruning and bounded edit distance. Exact/normalized/masked counts can overlap; additional near flags exclude already exact/masked candidates. Counts are per candidate record, not number of protected matches. Cross-language semantic paraphrases beyond these lexical/declared-lineage checks require independent review. Family IDs and a common ontology alone do not prove independence.

| Comparison | Exact | Normalized | Masked exact | Additional strong near | Distinct candidates flagged |
|---|---:|---:|---:|---:|---:|
| R → frozen 404 | 1 | 1 | 1 | 2 | **3** |
| R → historical 10K | 0 | 0 | 0 | 0 | **0** |
| S → frozen 404 | 0 | 0 | 0 | 0 | **0** |
| S → historical 10K | 0 | 0 | 0 | 0 | **0** |
| S → R primary/wire forms | 0 | 0 | 0 | 0 | **0** |

Only aggregate results were returned to the author. No F/10K text, expected label, protected ID or match-specific candidate ID is reported. R/S were not repaired, reworded, dropped or regenerated after these checks. The same frozen comparison was repeated only as part of the transparent validator metadata correction, with identical thresholds and candidates—not an adaptive membership/optimization loop.

## 6. Separate admission decisions

**R — REJECTED.** Mandatory final-benchmark contamination gate failed (three unresolved records). Independent bilingual privacy/semantic/rights and purpose-specific approval also absent. No automatic “synthetic” declaration or source assertion overrides overlap. Keep this candidate version as rejected evidence; any future protocol must avoid using private collision text as rewrite guidance.

**S — REJECTED.** No automated contamination, schema or unsafe-value failure remains, but mandatory independent review/admission is absent; role-balance/admin coverage also needs disposition. Do not admit it “with limitations” merely because the scanner passed. Its purpose remains model-selection-only; it must never be recycled into training/validation/runtime examples.

Input-admission/exclusion MEDIUM: **STILL BLOCKING**. Neither asset is admitted, and controlled-resolver legacy exclusion has not been implemented/verified. No broader production finding is closed and the overall production security gate is not PASS. qwen3:4b remains a candidate only, not a selected model. **CLEARED FOR MODEL-SELECTION EXECUTION: NO.**

## 7. Reproducibility, limitations and integrity

Tools actually run: pure-contract export; generator restricted-process preflight and single generation; validator self-tests/v1; validator-v2 self-tests/full comparison; full envelope/language/slot-consistency check; syntax and integrity checks. No benchmark runner, HR route, model classification, AI generation tool, training job or provider startup ran. No 160-case local/model routing accuracy/latency/coverage metric exists.

Generation uses exclusive-create outputs and intentionally cannot rerun in place. Replay requires a separate clean isolated workspace with the exact hashed inputs/permissions/runtime; no clean replay was executed here. The launcher was extended after generation for validator-v2 and envelope modes; generator/catalog/guard/contracts bytes stayed unchanged. Its final hash is recorded, but the pre-generation manifest did not separately bind the parent launcher's earlier hash. This evidence limitation is disclosed, not retroactively repaired. The child recorded its actual deny probes and hashed generation inputs before output.

Final integrity checks confirm all **414 pre-existing protected files unchanged**, including application source, schemas, prompts, resolver/service/configuration, historical manifests/reports and all four approval/design records. Only the new `controlled-assets/` tree was written. No `.env` or production provider setting changed; no Git initialization/upload.

* Frozen F SHA-256: `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05` — unchanged.
* Historical corpus SHA-256: `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` — unchanged.
* Original baseline manifest SHA-256: `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47` — unchanged, not regenerated.

Every new artifact, including this report, is hashed in [evidence-hashes.sha256](evidence-hashes.sha256). The manifest excludes itself to avoid a hash cycle. Raw v1/v2 evidence, provenance and rejected candidate bytes are retained; public release remains unapproved.

**Production data used/accessed: NO. DB/MCP/RAG accessed: NO. Real business writes: 0. Cloud model calls: 0. Ollama/model calls: 0. Frozen 404 executed: NO — 0/404. Fine-tuning: NOT STARTED. Historical files changed: NO. Legacy exclusion for controlled resolver: NOT YET VERIFIED. Input-admission finding: STILL BLOCKING. Model-selection execution: NOT CLEARED.**

Stop after Phase 1C.4 evidence. No further asset generation/repair or model selection is authorized by this report.
