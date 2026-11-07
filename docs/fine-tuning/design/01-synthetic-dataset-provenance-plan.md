# Phase 1C.2: synthetic dataset provenance and baseline plan

Date: **2026-10-25**, Asia/Riyadh. **DESIGN ONLY — no rows, training examples, generator, replacement asset or runtime change created.** Companion plans: [model selection](02-base-model-selection-plan.md) and [experiment lock/evidence](03-experiment-lock-and-evidence-plan.md).

Design status: **PASS WITH LIMITATIONS**. The design is specified; data admission and execution are not approved. The existing corpus remains **UNVERIFIED — BLOCKING** under the [Phase 1C.1 audit](../security/09-runtime-examples-provenance-audit.md). Neither a negative pattern scan nor a ChatGPT download marker certifies synthetic origin.

## 1. What the historical corpus changes

Exact asset: `server/src/copilot/data/hr_agent_intents_10000.jsonl`; SHA-256 `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b`. It contains 10,000 rows, 3,440 exact/normalized unique texts, 6,560 duplicates and no populated parameters. No row is newly approved for training.

| Dependency | Actual behavior and baseline consequence |
|---|---|
| [training.ts](../../../server/src/copilot/training.ts): `loadTrainingSet()` | Reads adjacent JSONL once at module initialization; maps usable legacy labels into routes, normalizes/tokenizes text and combines it with maintained supplemental groups in `EXAMPLES`. It is an active dependency, not unused historical data |
| `exactTrainingMatch()` / `exactTrainingAction()` | Corpus membership/order can affect local question/action routing and early permission refusals. Exact matches are checked against real role permissions; source roles do not authorize anything |
| `bestExample()` / local training plans/actions | Similarity ranking influences local fallback decisions. Thresholds, source IDs, order, normalization and tie breaking matter; source-role relevance bonus is ranking context, not RBAC |
| `questionTrainingExamples()` | Up to 10 selected example texts/mapped labels enter the actual `resolveQuestion()` prompt. A different corpus changes model inputs even if the prompt formatter is unchanged |
| `actionTrainingExamples()` | Up to 8 selected examples can enter the separate OpenAI action prompt when configured. The isolated current target has no OpenAI action key; local action behavior can still depend on this corpus |
| [routes/copilot.ts](../../../server/src/routes/copilot.ts) / [resolve.ts](../../../server/src/copilot/resolve.ts) | Strong terminal/deterministic decisions can finish first; other paths use exact/training routing or model fallback. Replacing the corpus can change both route proportions and predictions |
| [copyCopilotTrainingData.mjs](../../../server/scripts/copyCopilotTrainingData.mjs) | Copies the source asset into the compiled deployment. The existing compiled copy has the same hash; it is not evidence of authorship or a generator |
| [harness policy/capsule](../benchmark/harness/README.md) | Explicitly permit this asset. The current harness has no reviewed corpus-policy CLI option. Removing a permission or relying on a swallowed file-read error is not a valid configuration: isolation violations latch and must stop the run |

The production loader tolerates missing/unreadable corpus files and retains supplemental examples, but that error fallback is not a documented experiment switch. There is no existing supported environment variable for disabling just this asset. A future explicit, reviewed harness dependency override is technically possible; it must have a distinct target identity and native file-access policy. No such override was implemented here.

Removing/replacing the asset therefore changes the measured baseline. Calling that result the unchanged historical system would be misleading. “Legacy corpus disabled,” “all examples disabled,” “local/deferred diagnostic,” and “full hybrid target” are different configurations and cannot share one score.

## 2. Baseline-preservation options

| Option | Scientific validity / BEFORE–AFTER comparability | Privacy / effect on history | Reproducibility / implementation risk |
|---|---|---|---|
| **A. Keep the historical corpus quarantined until independently admitted** | Most faithful historical baseline if provenance is established. Same bytes must remain in both runs. Until then no official execution | Preserves all history; no unsupported synthetic claim. Evidence may never become available | Hash continuity is strong; source-input origin remains unresolved. Lowest code risk, open-ended evidence dependency |
| **B. Independently author a synthetic runtime-reference asset and declare a NEW controlled baseline** | Valid experiment about that new baseline, not about unchanged historical behavior. Freeze the new asset before model selection and keep it identical BEFORE/AFTER | Old bytes/reports remain immutable and unadmitted. New material must have its own full provenance/privacy gate; no filtering or relabeling the old corpus as synthetic | Reproducible recipes and manifests possible. Requires separately approved dataset work, an explicit asset/loader compatibility decision and new reviewed target; medium implementation risk |
| **C. Explicitly evaluate without the legacy corpus** | Valid named ablation, not historical full-system performance. Supplemental examples and deterministic rules must be explicitly retained/excluded, not left ambiguous. Use the exact same mode AFTER | Avoids unverified corpus input only if reads are genuinely denied/substituted by design. Changes routing and prompt examples | No reviewed toggle exists today. Future isolated shim must be versioned and tested; silently triggering the missing-file catch is unsafe. Moderate risk and reduced representativeness |
| **D. Immutable isolated experiment copy with an explicit dependency manifest** | A mechanism supporting A/B/C, not permission to ignore provenance. A newly versioned target can faithfully compare its own BEFORE/AFTER while distinguishing history | Original application/configuration remains untouched. Only admitted assets and bounded synthetic fixtures enter the child; the old asset may be hashed by an integrity verifier but never read as resolver/model context | Prefer a narrow asset mapping plus native deny-by-default permissions. Snapshot actual source, dependency overrides and mocks. Requires a new reviewed harness version and isolation tests before execution |

**Recommendation: B implemented later through D, with A preserved as a historical evidence track.** Make one bounded attempt to recover original generation instructions/creator evidence. If that does not establish admission, do not keep reinterpreting appearance as proof. Request separate approval to author an independent asset and declare a new controlled experimental baseline. C is useful only as an optional separately reported ablation, not the primary historical BEFORE result.

Do not modify `.env`, the original asset, source rules or the historical manifest to implement this recommendation now. A future isolated dependency override may redirect the loader's logical asset request to a separately hashed approved file; it must record actual supplied bytes/path and remove native read permission for the old corpus. A modern loader change, if required, is a separately approved new source version. Current preflight deliberately rejects unreviewed source drift; use a new experiment manifest/policy, not a rewritten original manifest or weakened hash check.

## 3. Future dataset purpose and contract

Teach **language understanding**, not HR answers: existing intent/action choice, extracted spans/typed parameters, ownership/scope language, supported periods, ambiguity and required clarification. No employee facts, completed database answers, learned permissions, SQL, RAG content or actual execution belongs in targets.

Recommended first fine-tuning target: **`resolveQuestion()` structured plan generation only**, with the present `{ plan: CopilotPlan }` contract. This is a proposed future scope, not provider integration approval. All 48 action categories can appear as input semantic categories with question-stage intent `doAction`; this alone does not train/measure second-stage action extraction. Keep optional `action_plan` records in a separately designated task partition for a later explicit decision. Do not mix incompatible target formats into one untagged training export.

| Proposed record field | Specification, not a generated example |
|---|---|
| `record_id`, `dataset_version` | New experiment namespace; never reused employee IDs or old `HR_#####` labels |
| `task` | `question_plan` or separately approved `action_plan`; terminal/orchestration controls are distinguished from trainable model rows |
| `family_id`, `episode_id`, `template_id`, `generation_batch` | Stable construction lineage; bind translations, paraphrases, entity variants and all turns before splitting |
| `language`, `style_tags` | Explicit `en`, `ar-MSA`, `ar-JO`, `mixed`; voice-transcript/negation/self-correction/context tags as applicable |
| `input` | Independently authored request text; synthetic trusted role; approved page/context and synthetic prior plan only where needed |
| `expected.question_plan` | Full existing CopilotPlan fields and nulls; validated with actual shared Zod and semantic checks. Model export wrapper is `{ plan: ... }` |
| `expected.action_plan` | Full existing CopilotActionPlan only for that separate task; its model wrapper is also `{ plan: ... }`. Null/not applicable for question-only rows |
| `expected.orchestration` | Annotation-only expected resolution/clarification/unsupported/out-of-scope/abstention, missing fields, confirmation decision, capability and synthetic record-scope result |
| `entity_annotations` | Mention spans, typed slots, ownership, supported period/calendar slots and ambiguity; optional missing values stay missing |
| `symbolic_slots`, `render_profile` | Symbolic design tokens separated from concrete wire-valid synthetic rendering; no real-value lookup map |
| `provenance`, `review` | Generator/template/seed and permitted-input hashes; synthetic declaration, reviewer IDs, privacy/schema/semantic decisions and approved split |

`expected.orchestration` is not an instruction for the model to bypass the current contract. Existing deterministic terminal outcomes are non-executable and have a separate type. If a row ends before model inference, mark it inapplicable to model-only training/accuracy. Unsupported executor capability must not be mislabeled as a successful read. An unresolved question may use the existing refusal schema where appropriate; do not invent terminal JSON for the production provider.

### Ontology corrections to the conceptual request

The request's illustrative `employeeOvertime`, `employee`, and `previous_month` are **not current schema fields/labels**. Use the existing ontology:

| Meaning | Current representation |
|---|---|
| Previous month | `period=lastMonth` |
| Named employee overtime/payroll | `intent=employeeFile`, `reportType=payroll`, `personName` or exact `employeeNumber`; period only when stated |
| General/company payroll analytics | `intent=payrollInsights`, appropriate existing `payrollTopic`, no person identifier |
| Question about doing an action | `intent=doAction`; actual action/parameters are the separate action stage |
| Numbered/named calendar month | `period=calendarMonth`, valid `month`, optional stated `year` |

Current periods are `today`, `thisWeek`, `thisMonth`, `lastMonth`, `lastSixMonths`, `thisYear`, `calendarMonth`. `lastWeek`, arbitrary ranges and a new period vocabulary are not silently added. No model-invented dates/IDs, unsupported payslip-period filter or request-status filter should become successful gold. Schemas, registries and real executor capability together decide labels; valid Zod alone does not establish a supported feature or authorize access.

## 4. Coverage and independent generation protocol

Before generating anything, pin a coverage matrix for all **32 current intents and 48 actions**, four languages, four roles and applicable entities/periods. Quotas count independent semantic families rather than duplicate rows. Exact total size and per-cell minimums must be approved before generation; do not target 10,000 by repeating text. Inapplicable role/feature combinations are documented, not fabricated.

Required dimensions:

* Self/team/company/named-person scope; generic name structures, missing/ambiguous identifiers, distinct people, explicit versus implicit ownership and conflicting subjects.
* Each applicable plan/action parameter, absence/nulls, supported enum boundaries, calendar bounds and invalid/incompatible combinations as rejection controls. Use typed annotations, not empty parameter golds.
* Independently authored English, MSA Arabic, Jordanian Arabic and natural code switching. A bilingual reviewer verifies meaning rather than mechanically translating word order. Keep every translation/paraphrase family in one split.
* Voice-style **synthetic text** with ordinary disfluency, self-correction and punctuation loss. No real recordings/transcripts; this measures text interpretation, not STT/TTS quality.
* Clarification, ambiguity, negation, compound requests, unsupported capability, safe abstention and out-of-scope boundaries that preserve legitimate HR/document/skills context.
* Action completeness versus missing details, existing confirmation requirements and safe UI exceptions. Never copy the old corpus's uniform `requires_confirmation:false` as gold. No action executes to obtain labels.
* RBAC/scope-sensitive language, role claims inside untrusted text, employee versus company payroll, outside-team references and permission denials. Trusted fixture roles come from the harness; model output is not authority.
* Synthetic multi-turn episodes preserving person/period changes without leaking real history. Unsupported pending-task fixture work requires separate review; annotations do not create harness capability.

Proposed generation stages (all future, currently NOT STARTED):

1. Approve source contracts, capability matrix, language/style quotas, permitted-input manifest, privacy threat model, split policy and generation budget. Authors/generators receive no frozen-case texts, golds, old corpus, real records, logs, uploads or prior production conversations.
2. Prefer a versioned deterministic grammar/template generator plus independently authored bilingual linguistic families. Assign family/episode identity and split **before** paraphrase/translation/rendering. Randomness uses a named PRNG/version and explicit seed, with deterministic ordering/serialization.
3. Derive gold from the semantic construction recipe and actual contracts, not a candidate model's guess or a historical accepted-memory label. Independently review semantic correctness and expected permission/clarification/confirmation behavior using bounded synthetic fixtures.
4. If model-assisted wording is later proposed, separately approve a local teacher/checkpoint, exact prompts/settings and synthetic-only inputs. No cloud teacher is assumed approved. Preserve raw intermediate outputs privately and record every rejection/revision. Teacher outputs are not automatically gold.
5. Apply schema/semantic/capability checks, entity consistency and bilingual review; scan every column/metadata/context for PII/secrets and record counts. Quarantine uncertainty, do not silently scrub a generated release into a different untracked dataset.
6. Apply the separation/decontamination process below; freeze admitted files, recipes, attestations and hashes. Release only after independent sign-off. No actual generator or data file is created by this design.

## 5. Privacy and typed placeholders

| Information | Preferred convention / future rendering policy |
|---|---|
| People | Indexed `<EMPLOYEE_NAME_1>`, `<APPLICANT_NAME_1>`; a later reviewed synthetic-name morphology pool may test natural extraction without using real directories, public biographies or frozen identities |
| Employee/record IDs | `<EMPLOYEE_ID_1>`, `<RECORD_ID_1>`; concrete forms only in a reserved experiment namespace that cannot authenticate or address production |
| Dates / departments | `<DATE_1>`, `<DEPARTMENT_1>`, `<COMPANY_1>`; deterministic invented rendering within schema bounds and fixed synthetic reference dates |
| Instruction amounts | `<SALARY_AMOUNT_1>`, `<ADJUSTMENT_AMOUNT_1>`; optional invented wire-valid amounts for parsing tests, explicitly requested-operation values rather than assertions of anyone's actual pay |
| Contact | `<EMAIL_1>`, `<PHONE_1>`, `<ADDRESS_1>`; only reserved `.invalid` email rendering if needed. Prefer placeholders for phone/address rather than accidentally dialable/reachable values |
| Bank/national/passport identifiers | Prefer exclusion; symbolic `<BANK_ACCOUNT_1>`, `<NATIONAL_ID_1>`, `<PASSPORT_ID_1>` only when strictly needed for rejection/type handling. Do not generate plausible working identifiers |
| Health/disciplinary material | No clinical/narrative facts. Minimal `<SENSITIVE_REASON_1>` only when indispensable; generic leave/request category is sufficient otherwise |
| Passwords/API keys/tokens/connection strings | **Exclude completely**, including copied secrets, reversible masking and fake credential-looking values in training. Separate detector canaries, if approved, are security tests, not training input |

Use indexed entities consistently across input, annotation and every episode turn; preserve distinct people. Never pseudonymize real records into this release. No reconstruction table to real identities may exist. Real salaries, attendance/leave histories, medical/disciplinary facts, addresses, bank/national IDs, credentials and production HR records remain prohibited even when ordinary application RBAC would permit viewing them.

A symbolic master record is not automatically a model/service-wire-valid example. Dates and numeric amount fields must be rendered/type-checked before projection; do not pass literal placeholder text into date/amount execution parsing and claim validation passed. The approved synthetic identity fixture, not a model, resolves any rendered test ID. Placeholder-only accuracy must be reported separately from independent synthetic natural-form accuracy; neither guarantees real-world extraction quality.

## 6. Provenance evidence per release

Record generator name/version and source SHA, permitted-input file inventory/hashes, template/grammar/ontology versions, exact generation instructions, PRNG/version/seed and order, generation UTC/timezone, dataset ID/version, creator/reviewer attestations, row and exact/normalized unique/duplicate counts, language/intent/action/role/slot distribution, raw/admitted/rejected counts with controlled reasons, schema/semantic/capability/privacy test results and every output SHA-256.

For model assistance also record exact base/teacher revision and weights/tokenizer hashes, runtime/template/quantization, settings and seed support, prompt bytes/hash, hardware and accepted/rejected intermediates. A seed or provider name does not guarantee bit-identical LLM output; distinguish exact deterministic regeneration from replayable archived output and procedural reproducibility.

Creator attestation must bind this release's hashes and declare permitted synthetic inputs, no production/person/history/document/secret sources, no old corpus/frozen-evaluation reuse, rights to inputs and review responsibility. Attestation is evidence to review, not automatic proof. Public reviewer identities require consent; no employee identities enter training metadata.

## 7. Separation and contamination safeguards

| Partition | Allowed use | Forbidden use |
|---|---|---|
| **T: training** | Fine-tuning after model/base lock and security approval | No S/F samples, labels, paraphrases or entities imported |
| **R: fixed runtime-reference asset** | Explicitly designated, admitted subset of training-side families; same bytes/prompt retrieval BEFORE and AFTER | Never populated from validation, selection or final evaluation; no runtime replacement mid-experiment |
| **V: validation** | Training early stopping and predeclared hyperparameter selection | Not runtime prompt examples, training or final claims |
| **I: optional internal held-out test** | One-time development confirmation after choices freeze | No iterative tuning; not the final 404 benchmark |
| **S: small model-selection set** | Base model selection under the companion protocol | No fine-tuning, validation, prompt examples or later hyperparameter tuning; it is consumed by selection, not claimed as final independent evidence |
| **F: frozen 404** | Locked official BEFORE/AFTER only | No training, validation, model selection, hyperparameter choice, prompt examples, paraphrase mining or repeated optimization |

Assign independent family/episode/entity/template lineages before wording. T/V/I ratios and the R subset must be pre-registered based on adequate per-label family counts, not shuffled row percentages alone. Keep all translations, voice-style variants and turns together. S is independently authored with different families and identities; F is never a generation source. Also exclude the old 10k corpus and historical 26 optimized benchmark questions as seed text/gold.

Before admission, a sealed offline contamination check compares normalized exact text, character/token shingles, entity-masked templates and lineage across partitions and maintained prompt/phrasebook assets. Predeclare thresholds (for example token-shingle Jaccard ≥0.8 and normalized edit similarity ≥0.9 for sufficiently long texts) and short-text exact-match rules before inspecting matches; bilingual review addresses translation/paraphrase overlap these metrics miss. Shared intent labels/HR vocabulary alone are not contamination.

A final-benchmark custodian may run a **fixed exclusion-only** check against F. Return only aggregate pass/fail/counts to data authors—no case texts, golds, row IDs or similarity suggestions. Quarantine colliding candidate families automatically; never paraphrase around a revealed final case or use the check as an adaptive membership oracle. Excessive/uncertain overlap halts release for independent review. Keep exclusion records private until AFTER is locked. This design does not claim contamination was tested or that a new split already exists.

## 8. Decision and next phase

Unresolved: recovery of original creator evidence; new baseline approval; modern versus legacy-compatible runtime projection; exact family quotas/splits; first training task scope; independent reviewer/custodian; local teacher need and rights; complete synthetic service fixtures. The current legacy loader only maps 38 old labels (11 distinct query intents plus `doAction`, 12 action types), so a full modern structured corpus is **not** a drop-in legacy JSONL replacement. A future projection/loader contract must explicitly reject unsupported mappings; do not silently lose the remaining 32/48 coverage.

**Next recommended phase: Phase 1C.3 — review/approve the new controlled baseline and generation/admission protocol**, while preserving a separate attempt to establish old provenance. Only a subsequent explicit authorization may generate data or implement the isolated target. See [security gates](03-experiment-lock-and-evidence-plan.md). Current Phase 1D clearance remains **NO**.
