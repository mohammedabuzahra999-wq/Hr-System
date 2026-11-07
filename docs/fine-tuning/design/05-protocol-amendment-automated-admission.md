# Phase 1C.4P — automated admission protocol amendment

Decision recorded: **2026-10-25T08:57:50Z** (**11:57:50 Asia/Riyadh**). Authority: the project owner's explicit Phase 1C.4P instruction. Policy ID: **CEB-AUTO-ADMISSION-1**. **AMENDMENT APPROVED for the isolated controlled engineering experiment only.**

## Decision and preserved history

The original [Phase 1C.3 protocol](04-controlled-baseline-and-data-admission.md) required independent bilingual human privacy/semantic review and an independent admission sign-off. That requirement correctly blocked earlier releases under the then-current policy. The [v1 rejection](../controlled-assets/admission/controlled-assets-admission.md), [v1.1 rejection](../controlled-assets/remediation-v1.1/admission/remediation-and-readmission.md), human-review checklist/register and local review tool remain unchanged historical evidence.

The project owner now removes **mandatory independent human review/admission sign-off as a blocking gate** for future controlled-experiment data admission. Reason: **reduce unnecessary manual review burden for this controlled engineering experiment**. Human review is **OPTIONAL**, not a prerequisite. This supersedes the human-review-dependent parts of the earlier privacy, linguistic/semantic, lineage and approval clauses for this isolated experimental scope. It does not claim that the old decisions were PASS under their old policy.

**Human review was NOT performed. No independent human validation is claimed.** The creator's attestation remains an authorship/source declaration, not human validation. Original asset metadata saying review is pending is preserved; a new hash-bound policy decision supplies the superseding status. The optional review UI is not used to fabricate decisions or signatures.

## Automated admission gate

Each exact asset/purpose must PASS all applicable checks, with immutable results and executable checker hashes:

1. Actual existing Zod schema validation and shared semantic consistency checks.
2. Strict record-envelope, JSONL/count, duplicate/normalized-uniqueness and field/null/default consistency.
3. Privacy/PII and secret/credential scanning of text/context/plans/metadata, with fixed, validated synthetic rendering exceptions only.
4. Fixed exact, normalized, entity-masked and near-duplicate screening against frozen F, historical 10K and runtime/selection cross-overlap: **zero accepted matches**. No threshold relaxation, decontamination rewrite loop or protected text/gold disclosure.
5. Actual role/capability checks, deterministic scope/confirmation constraints, placeholder and symbolic/wire consistency, and language/script-label checks where deterministic checking is possible.
6. Restricted-process isolation tests, native denial of legacy/build-copy reads, no fallback, and fail-closed exclusion tests. Only an admitted controlled runtime hash may become a resolver example dependency; S must never become runtime examples.
7. Asset/source/checker/input hash integrity, creator/source provenance and read-only deterministic recipe-conformance evidence. No new model-generated text, release regeneration or corpus edits are authorized merely to obtain admission.

Any genuine unsafe value, schema/semantic failure, incompatible scope, prohibited overlap, integrity drift, failed exclusion or unknown source input rejects the affected release. The amendment removes human sign-off; it does not waive automated failures or turn missing evidence into PASS. No production data, secret, DB/MCP/RAG access, HR service execution, model call, frozen-case execution or fine-tuning is part of these checks.

A new owner-authorized **automated admission decision**, separately versioned and bound to the exact assets, policy, raw validation/isolation results and checker hashes, may admit a release. No reviewer identity, human signature or linguistic approval is invented. Historical admission-gate files/loaders are preserved; a new isolated evaluation-policy version is necessary where old code explicitly required human review.

## Exact re-evaluation scope

* Runtime v1.1: **320 rows**, SHA-256 `f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736`; runtime-reference-only, not a fine-tuning dataset.
* Model Selection v1.1: **160 rows**, SHA-256 `09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986`; model-selection-only, never training, validation or runtime examples.

No candidate bytes, old reports/manifests, frozen F, quarantined 10K, production source/configuration or prompts change. Read-only recipe verification checks the existing release against its already frozen parent/deltas/catalog; it does not invoke the generator, create another JSONL release or use F/10K as generation input.

## Limitations and research/publication disclosure

**Arabic/English semantic naturalness, including MSA, Jordanian Arabic and code switching, was not independently human-reviewed. Automated checks cannot fully replace human linguistic judgment. Admission does not prove perfect linguistic quality, correct interpretation of every paraphrase or complete cross-language semantic independence.** Script/label tests are not proficiency assessments; typed placeholders limit natural-name realism. Static privacy patterns can miss forms of PII; schema/scope checks do not certify all production SQL or service behavior.

These limitations must remain visible in later experiment/run reports and any public release. A paper, presentation or repository methodology must accurately describe **automated admission rather than independent human review**. Never describe these assets as “human validated.” A suitable disclosure is:

> Controlled synthetic assets were admitted using deterministic automated schema, semantic, privacy/secret, contamination, integrity and isolation checks. No independent human linguistic review was performed; automated admission does not establish perfect linguistic quality or complete semantic independence.

No publication/upload or broader research-validity claim is authorized here. Public release, source/model rights and the frozen final-benchmark separation rules remain unchanged.

## Security and execution boundaries retained

If the exact new automated gates and technical legacy exclusion PASS, **SEC-06 input admission/exclusion may be recorded as MITIGATED FOR CONTROLLED EXPERIMENT** for the named isolated profile. This is not a production fix or an overall production security PASS. Production remediation and other findings remain separate and unchanged.

Dataset admission still **does not approve an executable run**. The unamended Phase 1C.3 §6/§8 requirements remain: implement/test/hash the full-plan CEB-SCORE-1 scorer; freeze S's local/terminal/model-eligible partition with adequate per-language coverage; pin the executable target, candidate checkpoint/digest, transport, settings/timeouts and run manifest before any candidate call. A missing executable requirement cannot be replaced by an asset PASS. Model eligibility, scores, accuracy/latency, model selection, F BEFORE/AFTER and fine-tuning are not executed in Phase 1C.4P.

The new [automated re-admission report](../controlled-assets/remediation-v1.1/admission/automated-readmission.md) records actual gate results, purpose-specific asset decisions, the scoped MEDIUM reassessment and separate execution clearance. No AI_PROVIDER/.env/prompt/application behavior changes, Git initialization or publication occur.
