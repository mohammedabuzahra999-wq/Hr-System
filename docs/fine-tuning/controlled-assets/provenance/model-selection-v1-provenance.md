# S-160 v1 provenance — rejected candidate

**Purpose: BASE MODEL SELECTION ONLY, never fine-tuning/validation/runtime prompt data. Admission: REJECTED. No case was executed.**

| Identity | Value |
|---|---|
| Asset | `../model-selection-v1.jsonl` |
| Version / schema | `v1` / `CEB-assets-v1` |
| Creation | `2026-10-25T07:29:38.478Z`; generation completed `07:29:38.593Z` |
| Size | 278,244 bytes, UTF-8 JSONL, LF, no BOM |
| SHA-256 | `8d50c67b4daa388c9cadcd3e992e0aa8504a08534b1beb4bdc2a022ac62928c6` |
| Rows / exact unique / normalized unique / duplicates | **160 / 160 / 160 / 0** |
| Languages | **40 each:** English, MSA Arabic, Jordanian Arabic, mixed |
| Families / strata | **40** declared families; 128 core (32 intents × 4 languages), 32 challenge cases |
| Roles | employee 72; manager 20; HR 68; **admin 0** |

## Source and construction

Same offline generator and curated type/role contracts as R, but **separate literal selection constructions and declared family/episode namespaces**, distinct placeholder index pools and different applicable period/slot conditions. No R text was supplied to a paraphrasing/model tool. R and S share an abstract contract/catalog author; family independence is a declared construction property requiring independent semantic review, not proved by different IDs or zero lexical matches.

Generator [generate-controlled-assets.mjs](../generation/generate-controlled-assets.mjs), SHA-256 `1508cb0431d3267ba846a69718e39e19f6e4b47b41f82f161adb0d951abf0dcf`. Catalog SHA-256 `005e2d590396f6a75d96b62545d1f5625aafd7a605d5ff15855cc0a0240b2536`; curated-contract SHA-256 `935b62daa020e4244f762e396ec7fd4e2461b966d083d78a2a5e44a9af151642`. Exact method, source hashes, timestamp, Node version and permission probes are in [pre-generation-manifest.json](../generation/pre-generation-manifest.json) and [generation-result.json](../generation/generation-result.json).

**No random seed: no randomness is used.** Fixed literal order and serialization define deterministic bytes; full clean-workspace replay was not performed. Model/teacher: **none invoked**. Templates were assistant-authored in this session; exact underlying assistant revision was not available and is not invented. The process made no separate model-generation API call.

**Production data was not used. The quarantined 10K and frozen 404 were not generation sources.** Native generator permissions deny their reads. Only a subsequent sealed validator inspected them for exclusion checks, returning aggregate results after both asset hashes were frozen. No protected content was used to revise S.

## Gold, privacy and quality

Question targets use the full current CopilotPlan field set and existing vocabulary. No `employeeOvertime` or `previous_month` label is invented. Period/employee/payroll examples are requested-operation language, not answers or employee facts. Person/identifier mentions use indexed typed placeholders; no contact/real identity is rendered. The invented reference date is metadata. Entity types and placeholder index pools differ from R; no model learned or generated these golds.

The 32 challenge cases cover two ownership/ambiguity, two unsupported, two voice-style/self-correction and two context/entity-conflict families in four languages. **136** cases have a complete question-plan target; **24** clarification/unsupported controls have a deliberately null model plan and annotation-only expected outcome. This avoids manufacturing executable terminal outputs. No second-stage action-plan corpus or fine-tuning export was generated.

All 160 required envelopes, symbolic/wire consistency, language-script checks and normalized uniqueness PASS. Actual shared question Zod/semantic validation: **272** symbolic/wire plan checks PASS. Action count is **0 direct action plans**, intentionally; `doAction` is an umbrella question intent, not 48-action extraction evidence. Actual resolver routing, model-eligible subset, 10-per-language model-eligibility floor and service/confirmation outcomes were not measured.

Role balance misses the design's ten-per-role/language target, and there are no admin actor cases. Role assignments were fixed in the template bytes before generation, but no independent necessity/deviation approval exists. This is a coverage/admission concern, not permission to relabel or rewrite cases after comparison. Dialect authenticity, close semantic paraphrase independence and gold/capability correctness remain pending independent review.

## Scan and contamination results

* Privacy: **PASS_STATIC_WITH_REVIEW_LIMITATIONS**; no unsafe-value/credential/record pattern hits and no concrete identity slots. Independent bilingual/privacy/semantic review: PENDING.
* Secret scan: **PASS**.
* Frozen 404: **0** exact, normalized, masked or strong-near flagged candidates.
* Historical 10K: **0** flagged candidates.
* R comparison: **0** flagged candidates, including primary and declared wire representations (340 distinct R text forms).

These are bounded static checks, not proof against all cross-language semantic contamination. The same initial reference-date/phone false positive and transparent validator-v2 correction described in the [admission report](../admission/controlled-assets-admission.md) apply; S bytes never changed.

**REJECTED:** missing independent bilingual/privacy/semantic review and purpose-specific admission sign-off, with role-coverage limitations requiring disposition. Zero automated contamination flags is insufficient to waive the approved gate. S remains quarantined from models, training, validation and runtime prompts, even if a future R version is admitted.

See [creator attestation](creator-attestation-v1.md), [corrected validation results](../validation/validation-results-v2.json), [envelope checks](../validation/envelope-results.json) and [hash evidence](../admission/evidence-hashes.sha256).

