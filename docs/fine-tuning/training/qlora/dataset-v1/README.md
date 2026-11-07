# QLoRA synthetic dataset v1 — rejected candidate

**8,000 NEW synthetic candidate examples were created. Admission FAILED; this is not an admitted training dataset. Do not train on this release.**

The sealed exclusion check found two strong near-matching candidate rows against frozen F404, and one against the combined runtime-reference releases. These counts may overlap; they are not a claim of three distinct affected rows. Exact, normalized and entity-masked matches are zero against every excluded corpus. Historical 10K and selection-release comparisons detected zero matches under all fixed checks.

No held-out texts, labels, case IDs, matching candidate IDs or rewrite suggestions were disclosed. No generation text, gold target, threshold or source recipe was changed after receiving protected-corpus results. The entire candidate is quarantined rather than silently dropping cases, weakening checks, manufacturing an 8,000-row PASS or targeting held-out wording. The approved specification prohibits iterative rewrites against held-out feedback; a separately declared independent successor release is the next decision.

## Candidate identity and counts

- Base: `Qwen/Qwen3-4B-Thinking-2507`, revision `768f209d9ea81521153ed38c47d515654e938aea`. The owner-accepted exact GGUF conversion-provenance limitation remains unchanged.
- Canonical candidate: `candidate/dataset.jsonl`, SHA-256 `21a5bb1b466d92b2b838df663c1326c47fcf891419553413bd1203eefc4f5a8a`.
- Unique examples: 8,000; 2,000 semantic construction families with four language renditions each.
- Splits assigned before rendering: 6,400 train, 800 dev, 800 internal test. Each language has 1,600/200/200 rows.
- English / MSA / Jordanian / mixed: 2,000 each.
- Intents: 32/32. Action-boundary categories: 48/48, all targeting `doAction` at question classification stage. This does not train second-stage action-plan extraction.
- Complete existing targets: `{plan: CopilotPlan}` with all 11 fields, unused values null.

The candidate contains canonical inputs, trusted synthetic role, optional synthetic previous plan, full target, entity spans, scope/ownership annotations and split/construction lineage. It has per-record split labels. No admitted split exports or runnable training job were created because admission failed.

## Passed candidate-only gates

All 8,000 targets passed strict existing Zod schema and shared `validateCopilotPlan()` semantic checks. Positive roles/action categories, unique employee identifiers, named-vs-company payroll boundaries, declared synthetic context, non-execution annotations and explicit entity spans were checked. All 32 intents and all 48 action-boundary categories occur in each language and split.

All 12 calendar months, seven supported period values, eight report types, eleven payroll topics and three ranking values are covered. Per language there are 176 named/numbered-person plans, 100 department plans and 226 calendar-month plans. Per-slot and per-split counts are in `validation/local-results.json`.

Exact duplicate requests: zero. Normalized duplicates: zero. Entity-masked duplicates: zero. Translation-family and declared construction-group split leakage: zero. Strong near-matches across train/dev/internal-test splits: zero under the established fixed policy. These checks do not prove complete semantic independence of naturally similar HR concepts.

The existing privacy/secret detectors passed for all canonical records, including metadata and synthetic previous plans. Only the exact, declared synthetic reference date `2027-06-15` is treated as typed metadata rather than a phone-number pattern. New request/target entity values use typed placeholders exclusively; no real names, employee identifiers, salary facts, HR records or secrets were read as generation inputs. No natural-name extraction capability is claimed.

## Generation and isolation evidence

Generation used only the newly authored grammar/lexicons and the approved curated contract catalog. It did not copy runtime/selection rows, historical 10K, F404 or their derivative examples as inputs or targets. The native-permission generation worker demonstrated that reads of the legacy corpus, F404, R/S and `.env` are denied. Its environment contained no production credentials. No external teacher API, Ollama inference, model download or training was used.

The grammar is deterministic (seed 42) and template-composed. It includes syntax partitions, supported typed parameters, self/team/company/named-person scope, prior-plan follow-ups, all action boundaries, ambiguity and refusal. The owner's latest placeholder-only instruction supersedes the prior suggestion to invent natural names.

Before freezing the generation recipe, an internal precheck flagged long fixed annotation enum strings as opaque tokens. Only those annotation labels were shortened; requests and gold plans were unchanged. The failed and passing precheck records are preserved. No privacy threshold was changed, and no protected-corpus feedback had been received at that time.

The pure existing prompt formatter was separately prechecked without inference: 8,000 one-to-one prompt/completion projections passed privacy scanning. It preserved the real shared prompt, role menus, approved R context and existing `/no_think` wire suffix. R was used only in this isolated prompt-format compatibility check, never for authoring or target generation. Its already admitted synthetic date renderings and the fixed source-schema `EMP-1001` illustration are documented static prompt exceptions; new request/target values have no such exceptions. These model-facing split exports were **not admitted or saved as training exports** after the contamination failure.

The sealed exclusion worker alone accessed protected corpora, with native filesystem restrictions and aggregate-only output. It executed no benchmark cases or model calls. The comparison uses the established exact/normalized/entity-mask checks, token 3-shingle Jaccard ≥0.80, short-input character 3-shingle Dice ≥0.90, and Unicode edit similarity ≥0.90. Safe set-size prefilters accelerate the same predicates; 169 comparison parity cases passed against the existing checker. Comparison code and thresholds were frozen before protected comparisons.

## Frozen rejection evidence

- `generation/pre-generation-manifest.json`: exact source/checker hashes and generation allowlist.
- `candidate/generation-result.json`: canonical hash, 8,000 count and denied-read canaries.
- `validation/local-results.json`: schema/semantics, privacy, duplicates, coverage and family/split results.
- `validation/sealed-exclusion-results.json`: all excluded-corpus comparison counts and hashes.
- `dataset-manifest.json`, `admission-decision.json`: explicit rejection, not training clearance.
- `integrity-verification.json`: prior evidence/source preservation and fail-closed admission test.
- `evidence-hashes.sha256`: all release evidence hashes; candidate files also receive read-only attributes.

All earlier project source/configuration, BEFORE evidence, model provenance and preparation artifacts remain unchanged. F404 is not rerun. No training starts. Human review was not performed, is not claimed and is not the reason for rejection; the failure is the unchanged automated contamination gate.
