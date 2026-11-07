# Frozen pre-fine-tuning evaluation dataset v1

**FROZEN EVALUATION DATA — DO NOT USE FOR TRAINING**

Dataset: [pre-finetuning-benchmark-v1.jsonl](pre-finetuning-benchmark-v1.jsonl)

SHA-256 of exact UTF-8/LF bytes:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

Status: **CREATED, STATICALLY VALIDATED, FROZEN FOR REVIEW. NOT EXECUTED AGAINST THE SYSTEM. FINE-TUNING NOT STARTED.**

The underlying 381-file system baseline remains unchanged, with manifest SHA-256 `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47`. See [baseline snapshot](../06-pre-finetuning-snapshot.md). Neither that manifest nor any preceding documentation was updated to include this later evaluation artifact.

## Purpose, size and language coverage

This is an independent, synthetic **evaluation** asset for later BEFORE/AFTER comparison of HR intent understanding, entity extraction, action selection and safe outcomes. It is not a training set, new prompt, new local rule, model benchmark result, database seed, or executable HR workflow.

There are **404 cases in 101 semantic families**:

* 32 current intents x 4 authored language variants = 128 intent cases.
* 48 current action subtypes x 4 authored variants = 192 action cases.
* 21 safety/ambiguity/capability families x 4 variants = 84 additional controls.

Four additional non-action microphone-check controls were included during authoring rather than forcing an arbitrary 400-case cap. Final language counts: **101 English, 101 Modern Standard Arabic, 101 Jordanian/colloquial Arabic, 101 Arabic-English mixed**. Arabic totals 202 excluding mixed. Every intent and action appears in each language group. See the complete [coverage report](benchmark-coverage.md).

The wording was authored for this evaluation, not selected from the existing 10,000 rows. Shared metadata within a family represents a deliberate semantic translation/paraphrase pairing, not a Cartesian template expansion. Different families cover permissions, negation, unsupported filters, missing slots, person ambiguity and contextual follow-up. A formal Arabic sentence can legitimately contain a quoted English synthetic title/name; language labels reflect the surrounding utterance, not script-only detection.

## No real personal data

All records have `synthetic_data: true`. No employee directory, production record, salary, policy content, conversation, voice recording, log or database was consulted to construct inputs. Natural-looking identities are **invented test strings**, never references to known employees:

* `Testara Veld`, `نيراف تجريبي`, `سيروان الاختباري`, `Zelvyn Testson`.
* Partial-name ambiguity uses `Testara`, with two hypothetical matching records in a future isolated fixture; it never selects a person from the live directory.
* Other scope tests use `Testara Veld-Example`, `نيراف ابن تجريبي`, `سيروان آل اختبار`, `Zelvyn O'Test` to include compound/hyphen/apostrophe forms.
* `EMP-990001` and `EMP-990004` are declared synthetic test identifiers, not copied employee IDs. Never look them up against production as part of this evaluation.
* The only email is `test.hire@example.invalid`. The `.invalid` domain is deliberately non-production.
* `1250` and `75` are fictional **instruction amounts**, explicitly described as test amounts; no case states a real person's salary or supplies a database pay answer.
* Titles, departments, locations, briefs and reason tokens prefixed with `Test`/`TEST-` are fabricated labels. `Test Office` is a symbolic fixture location, not an address. No actual medical details, phone numbers, national IDs, bank/account values or private HR records are included.

The four language variants can refer to different synthetic identities; do not infer a real bilingual identity mapping. Future fixtures reset per case and provide only the state needed by that case. No fixture records were created in this phase.

## Ground-truth schema

Each JSONL line is one complete object. `expected_intent` and `expected_action` use the **existing** 32/48 enums, never a replacement ontology. `lastMonth`, `calendarMonth` and other period labels are the current application values, not `previous_month`. Behavioral labels below are evaluation outcomes, not newly added executable intents.

| Field | Meaning |
|---|---|
| `id`, `version`, `family` | Unique stable ID, artifact version and reserved semantic family |
| `language`, `category`, `input` | Authored language label, intent/action/safety category, exact user text |
| `actor_role` | Trusted fixture role; never inferred from claims inside `input` |
| `context` | Explicit advisory page, synthetic previous plan and pending-task state. All pending tasks are null; the four follow-up records supply a full prior attendance plan |
| `reference_date`, `timezone` | Frozen `2026-10-22`, `Asia/Riyadh`; later evaluation must control its clock in an isolated harness, not edit production time handling |
| `evaluation_layer` | The precise component/outcome being annotated, defined below |
| `expected_intent` | Semantic/plan intent where unique and meaningful; null explicitly means no unique intent asserted at this layer |
| `expected_action` | Actual second-stage action subtype, including a partially specified instruction that needs clarification; null for non-actions |
| `expected_entities` | Important slots, using current CopilotPlan/CopilotActionPlan field names and types. No arbitrary employee UUIDs or SQL |
| `expected_scope` | Self, direct reports, company, department grouping, named employee/applicant, knowledge, system or none |
| `expected_behavior` | Required read/help/knowledge/greeting, proposal/UI effect, or safety/capability outcome under declared preconditions |
| `requires_clarification`, `clarification_fields` | Whether a clarification/choice is needed and which missing meaning/slot must be supplied |
| `requires_confirmation` | Whether the **current complete text proposal** waits for review/confirmation. False for missing-slot/choice cases until resolved; not a statement that the later completed protected action may bypass confirmation |
| `permission_sensitive` | Role/record/document/signed-in ownership matters; not equivalent to “expected denied” |
| `voice_style` | Transcript-style input characteristic only; no audio is generated or STT quality asserted |
| `fixture` | Declarative isolated-state requirement; not a real account or executable seed |
| `negative` | Safety/regression control, including positive HR counterexamples to over-refusal; not synonymous with an expected refusal |
| `forbidden_effects` | No unauthorized read, no unconfirmed protected write, no invented employee identifier |
| `requested_capability` | Underlying forbidden capability in denial controls; does not authorize it or make it `expected_action` |
| `expected_ui_page` | Current canonical destination ID for selected navigation/filter tests; avoids pretending a raw screen alias must be one fixed extraction string |
| `notes` | Case-specific distinction/known limitation; contains no observed benchmark result |

### Evaluation layers must remain separate

| Layer | Ground truth and later scoring rule |
|---|---|
| `question` | Current intent/entity meaning or safe non-action response. No claim about which local shortcut/provider will be used. Microphone checks have null intent because greeting/refusal acknowledgement is acceptable; no action/data access is requested |
| `action` | Intent `doAction` plus the current action subtype and important action-plan slots. Complete protected actions must produce a proposal, not run it; missing fields/identity collisions clarify first |
| `conversation` | Same semantic classification with the explicit synthetic previous plan; no real chat history |
| `local_boundary` | Assert deterministic abstention only. Compound subjects and unsupported `lastWeek` must not be forced into a local plan. Null intent is intentional; do not score the model's later answer against a fabricated single intent |
| `service_boundary` | Evaluate the stated candidate/identity scenario against the existing builder's scope and ambiguity behavior. It is **not a model-intent accuracy sample**; an earlier permission refusal is safe but belongs in a separate end-to-end measure |
| `capability` | Underlying semantic subject plus existing unsupported-filter outcome. No unfiltered list may count as a correct answer. This is not an assertion that every new wording already hits the current terminal grammar |

For example, period-specific own pay semantically concerns `myPayslips`, but its current executor cannot apply the requested period. Those records expect `unsupported` and no misleading unfiltered answer. A manager's named payroll candidate is an `employeeFile/reportType=payroll` **service-boundary** test: the existing payroll builder returns no data to managers. General employee-file ambiguity likewise returns `noData`; only the file-navigation action provides an existing choice flow. We did not relabel these as successful execution or invent a clarification implementation for a read builder.

Some fresh paraphrases may expose current prompt/local/terminal weaknesses. Gold annotations describe the supported capability contract and inspected safety boundaries, **not a prediction that the current model succeeds**. Known limitations are called out explicitly. No baseline outputs have been collected or used to adjust the examples.

### Slot comparison and false-action boundaries

Gold entities are semantic assertions, not recorded backend results. Period/month/year, rank, payroll topic, report type, action enums and numeric/string types must match the current schema. Preserve copied synthetic identifiers/names exactly after Unicode NFC and surrounding whitespace normalization. Opaque `TEST-*` body/brief markers exclude punctuation delimiting the instruction; natural dictated body sentences retain their shown content. Canonical `expected_ui_page` is separate from free-form `screen` aliases.

For a later full question-plan comparison, start from the application's null-field plan and overlay only meaningful question slots; action records compare the first-stage `doAction` plan separately from second-stage action slots. Service defaults (e.g. absent year, optional calendar end) must not be mistaken for values extracted from the user. Do not construct a made-up plan for the 12 records with null intent. Final scoring code and any equivalence rules require review **before** collecting performance, without changing these frozen inputs/golds.

False-action metrics must distinguish an incorrect proposal from an actual protected execution. Reads, refusals, capability limitations, clarification and microphone checks do not authorize a write. Local-boundary records measure local routing and must not be silently counted as model successes/failures. Safe UI navigation/filter/scroll/open-file and the existing notification-read marker are explicitly distinguished from protected HR writes.

## Required isolated fixture assumptions for a later run

These are declarative preconditions, not data created now. Never satisfy them by querying/altering production.

* Every case starts with a synthetic authenticated actor of `actor_role`, independent context, no stale memory/pending task, and clock fixed to the reference date. The four follow-ups deliberately add only their shown previous plan.
* `authorized_read`: suitable synthetic self/team/company rows so “no records” does not obscure semantic classification; no real figures are stored in this dataset.
* `employee_unique` / `employee_id_unique`: exactly one authorized active synthetic match for the named/numbered target. `direct_report_unique` additionally binds `managerId` to the actor; `employee_outside_actor_team` binds it elsewhere.
* `two_employees_same_partial_name`: exactly two synthetic authorized employees match `Testara` (e.g. Testara Veld and Testara Veld-Example). Read file returns no data; open-file action offers a choice. Never pick the first match automatically.
* `one_own_pending_request` / `direct_report_one_pending`: exactly one appropriate pending request; actor/manager ownership enforced. `one_pending_bonus` and `one_open_payroll_finding` similarly avoid an unintended record-choice confound.
* Owned announcement/event fixtures match the exact synthetic title and are created by the manager actor. Calendar events have a valid date. New-employee/vacancy fixtures have no number/email/title collisions.
* Job-description fixtures match the specified draft/approved/unique state; the approved-without-opening fixture has no linked vacancy. Vacancy publication has all mandatory fields; an open vacancy accepts applications before a close proposal.
* Applicant fixtures uniquely match the supplied synthetic name and provide the declared CV, approved requirements, draft question 3, completed interview or reviewed interview as appropriate. These are **proposal/understanding** cases: no model generation, email sending, hiring decision or private interview data is run/created in this phase.
* Payroll fixtures distinguish calculable cycle, calculated draft and review-ready draft; October 2026 maps to `startDate: 2026-10-01`. No approval/payroll calculation runs during this dataset phase.
* `knowledge_visible` is a synthetic source visible to the actor role. Scientific/weather vocabulary remains legitimate in company training/safety references. No real policy text or RAG corpus was copied. Management article fixtures identify only the fabricated title.
* `none` means no business record is necessary for the annotated outcome. The generic `action_ready` default means the selected action's normal preconditions above are satisfied; it is not a global unrestricted account.

When later authorized, evaluate protected writes up to proposal/clarification using isolated services/test doubles. Do not submit `/do` or speak confirmations against production merely to obtain a benchmark score. Intent/action recognition coverage is not a claim of complete destructive-operation or provider-quality coverage.

## Leakage prevention and freeze policy

**Never include this JSONL, its translations/paraphrases, gold labels, authoring catalog (`build.mjs`) or family-specific examples in fine-tuning training OR validation data, prompt examples, phrasebook/routing patterns, RAG materials, or verbatim synthetic-training generation seeds.** Do not optimize production rules against this set. Reserve complete families and paired variants, not merely individual IDs. Reviewers and future dataset builders must preserve this separation.

Static novelty checks found zero normalized duplicates within v1 and zero exact normalized matches against the existing 10k texts and string literals in current phrasebook/training/corpus/conversation/benchmark/Voice fixture sources. This does not prove absence of semantic overlap or all dynamically expanded example overlap; intentional topic overlap is necessary to test the same taxonomy. No new phrases were added to those sources. Any future training proposal needs its own family/near-duplicate leakage review.

The JSONL is the authoritative frozen artifact. Do not overwrite v1 to repair labels or add cases after review; create a new version with a new hash and explicit changes. No results are embedded in this dataset. The authoring script refuses to overwrite an existing dataset and is retained only for provenance; **do not run it to regenerate frozen v1**.

## Static verification only

From the project root:

```powershell
node --check docs/fine-tuning/benchmark/build.mjs
node --check docs/fine-tuning/benchmark/validate.mjs
node docs/fine-tuning/benchmark/validate.mjs --self-test
Get-FileHash -LiteralPath 'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl' -Algorithm SHA256
```

The validator reads source text through TypeScript AST to check existing enums/roles and uses an isolated Zod dataset schema. It never imports a production resolver, starts the application, authenticates, contacts a provider, reads a database or generates audio. It verifies all 381 frozen system files, record shape/types, IDs, normalized uniqueness, exact known-text overlap, declared synthetic names/IDs/email/amounts, obvious PII/credential shapes, language/taxonomy coverage, and label consistency. Eleven deliberately invalid in-memory mutations test its rejection paths. Name allowlists plus human source review reduce accidental PII; the scanner is not a general proof of anonymization for arbitrary imported language.

Validation is **not executing the benchmark**. The benchmark has not been sent to the application, OpenAI, Ollama, OpenRouter, MCP or a Voice service. No timing/accuracy/provider results exist for v1. Reviewer approval and a separately scoped evaluation harness are required before collecting PRE-FINE-TUNING results. Fine-tuning has **NOT** started.
