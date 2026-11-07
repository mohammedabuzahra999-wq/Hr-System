# R-320 v1 provenance — rejected candidate

**Purpose: runtime references for the NEW controlled baseline only. Not a fine-tuning training dataset. Admission: REJECTED. Do not activate in production or a model prompt.**

| Identity | Value |
|---|---|
| Asset | `../runtime-reference-v1.jsonl` |
| Version / schema | `v1` / `CEB-assets-v1` |
| Created | `2026-10-25T07:29:38.478Z` generation manifest; completed `07:29:38.593Z` (Asia/Riyadh UTC+03) |
| Size | 758,352 bytes, UTF-8 JSONL, LF, no BOM |
| SHA-256 | `342503dd6c810136d8b5ede8dea96005e593a2ee623f849640fcfd357bb826de` |
| Rows / normalized unique / duplicates | **320 / 320 / 0** (exact unique also 320) |
| Languages | **80 each:** English, MSA Arabic, Jordanian Arabic, Arabic-English mixed |
| Families / coverage | **80** declared families; 128 question references covering **32 intents**; 192 action references covering **48 actions** |
| Trusted fixture roles | employee 80; manager 32; HR 200; admin 8; no production identity |

## Origin and deterministic method

The current Codex assistant authored a new fixed literal template catalog from the approved ontology/field/capability contracts and controlled placeholder vocabulary. The separate Node generator expands the fixed language order (`en`, `ar-MSA`, `ar-JO`, `mixed`), completes nullable plan fields from the curated contract, assigns namespaced record/family IDs and indexed placeholders, and serializes one record per line. **No randomness, PRNG or seed is used.** The algorithm uses Node **24.15.0**. Asset bytes contain no generation timestamp; timestamps are separate evidence, so rerunning the same recipe in a clean isolated workspace has a deterministic byte construction. A separate clean-workspace regeneration was not performed.

Generator: [generate-controlled-assets.mjs](../generation/generate-controlled-assets.mjs), SHA-256:

```text
1508cb0431d3267ba846a69718e39e19f6e4b47b41f82f161adb0d951abf0dcf
```

Source inputs frozen in [pre-generation-manifest.json](../generation/pre-generation-manifest.json):

| Input | SHA-256 |
|---|---|
| Literal catalog `templates-v1.mjs` | `005e2d590396f6a75d96b62545d1f5625aafd7a605d5ff15855cc0a0240b2536` |
| Curated contract `contracts-v1.json` | `935b62daa020e4244f762e396ec7fd4e2461b966d083d78a2a5e44a9af151642` |
| Offline import/network guard | `df0aa6c3f85876e36f5e702fa0141e2fc278d16be2039fecafb2d08ffe3015ac` |

The curated contract was exported by [contracts.mjs](../validation/contracts.mjs) from **28 pure schema/semantic/permission source files**, whose hashes are embedded in the curated JSON. It contains types/enums/role capabilities and JSON Schema, not production records or corpus examples. Extraction used a restricted source-module VM, no app startup, provider, DB, MCP or RAG services.

The generator's native permission preflight denied reads of `.env`, both legacy corpus paths, frozen F, uploads and the voice token; protected writes, child/worker capability, credential inheritance and network imports/fetch were blocked. Only the generator/catalog/curated contract/guard were data inputs. New files were created with exclusive-write flags. [generation-result.json](../generation/generation-result.json) binds the two output hashes to the frozen inputs. No generation retry or post-comparison text edit occurred.

**Production data was not used. The quarantined 10K and frozen 404 were not generation sources.** Their later read-only use was solely in the separate sealed contamination validator, after output hashes were frozen. This is a procedural source claim, not proof that independently composed ordinary phrases cannot coincide with a protected question; the comparison found such coincidences.

## Representation and placeholders

Each record contains a synthetic trusted role/page/reference date, namespaced IDs, declared lineage, a symbolic master input/expected plan, orchestration annotations and a declared wire projection. Question targets use the actual CopilotPlan schema; action references retain real action categories, with question-stage `doAction`. This does not invoke or train either resolver.

Indexed placeholders include employee/applicant name, employee ID, department, date, amount, title, text, job title, location, datetime and email. No natural person names or real contacts are inserted. Dates/times and two instruction-amount renderings are explicitly invented constants, recorded per affected row in `syntheticRendering`; **20 records** use such rendering. They express requested operations, not anyone's salary, leave or attendance facts. The fixed reference date is invented metadata validated separately. Other placeholders remain symbolic; this is not certification that every downstream service accepts an unresolved placeholder.

Confirmation is conditional (`reviewIfProposalComplete` or an existing safe-UI exception); incomplete/resource-dependent proposals are marked required/fixture-dependent clarification. Actual proposal/service/confirmation decisions were not executed or certified. Runtime-loader compatibility, independent bilingual correctness, semantic family independence and realistic-name generalization remain unverified.

## Validation and rejection

* Full envelope, wire/symbolic consistency, declared script/language presence and all 320 required records: PASS.
* Actual Zod/shared semantic question-plan checks: 640 symbolic/wire validations PASS. Action-plan Zod: 384 validations PASS. No required count/coverage/normalized-duplicate failures.
* Corrected static privacy scan: PASS WITH REVIEW LIMITATIONS; zero unsafe-value pattern hits or concrete identity slots. Secret/credential scan PASS. Four password-reset references are operation topics without password values. No independent bilingual privacy/semantic sign-off exists.
* Frozen 404 comparison: **1 exact/normalized/entity-masked matching candidate and 2 additional strong near candidates; 3 distinct runtime records flagged**. No matching text, protected IDs or candidate match IDs were exposed. These remain unresolved, not waived.
* Historical 10K comparison: **0** flagged candidates against 3,440 unique texts.

The validator's initial phone scan incorrectly counted the declared reference-date metadata. Initial code/results are preserved. Version 2 validates that exact synthetic metadata field separately; no asset text, threshold or contamination decision changed. See [validation-results-v2.json](../validation/validation-results-v2.json), [envelope-results.json](../validation/envelope-results.json) and [admission report](../admission/controlled-assets-admission.md).

**REJECTED:** unresolved final-benchmark collisions plus missing independent privacy/semantic/admission review. No rows were deleted, rewritten, padded or added to chase the checker. This candidate's declared provenance does not override contamination policy.

See [creator attestation](creator-attestation-v1.md). All files, including the admission report, are hashed externally in [evidence-hashes.sha256](../admission/evidence-hashes.sha256); no self-referential report hash is asserted here.

