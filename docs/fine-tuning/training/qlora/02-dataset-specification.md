# Clean question-plan dataset specification

Status: preparation specification; **zero training records or training exports created**. This document defines the next dataset, not an already admitted release.

## Objective and permitted sources

Learn natural-language HR request → **`{ "plan": CopilotPlan }`**, matching `resolveQuestion()` and its existing Zod/semantic validation. Learn intent, mentioned employee/entity spans, supported periods, department, ownership/scope, relevant parameters and conservative refusal. Do not learn HR record contents, factual answers, permissions enforcement, SQL, tool execution, RAG answers, speech, action proposals or response phrasing.

The current pure-contract inspection confirms **32 intents, 48 actions and 11 CopilotPlan fields**. Exact enums, schemas, per-role menus and source hashes are captured in `current-contract-catalog.json`. These existing contracts, intent descriptions, supported executor semantics, this specification and independently authored synthetic linguistic designs are the sources for future generation.

| Existing asset | Verified inspection | Treatment |
| --- | --- | --- |
| Runtime R v1.1 | 320 rows: 128 question references + 192 action references; 80 semantic families; 80 rows per language | Keep fixed as BEFORE/AFTER runtime references. Never convert its rows into training/dev/test targets or use its text as authoring seeds. The existing isolated prompt formatter may supply these admitted references as masked prompt context, exactly as in the controlled BEFORE target. |
| Selection S v1.1 | 160 rows, 40 families; 136 complete question plans + 24 intentional non-executable controls; 40 rows per language | Preserve its selection-only, never-training/dev/runtime designation even though multi-model selection was skipped. Not a template bank or tuning-feedback source. |
| Frozen F404 and its build/catalog/review/results artifacts | Integrity hashing only in this stage; no fixture parsing or execution | Never training/dev/test targets, prompt examples, linguistic templates, generation seeds or feedback-driven rewrites. Preserve the existing final evaluation unchanged. |
| Historical 10K and source/build copies | Quarantined; integrity hashing only, not parsed | Excluded from authoring, references, exports and training. |
| Production data, conversations, logs, voice transcripts, RAG/MCP, database, credentials | Not accessed | Prohibited as training sources. |

R and S are admitted under `CEB-AUTO-ADMISSION-1`, **for their stated purposes only**. Fresh inspection revalidated their wire plans and reran the existing pure privacy scanner. No real PII was found. Their existing zero-overlap reports remain hash-bound historical exclusion evidence; no contamination scan of an uncreated training dataset is claimed.

The assets are coverage references rather than extraction datasets. R's 128 question references contain only four populated personName values, no employeeNumber, month, year or department values, four payrollTopic values, and 40 period values. Most question slots remain null. One semantic family per intent translated four ways cannot demonstrate varied language understanding. R's action rows are second-stage action references, not 192 additional question-routing families. Create a fresh corpus instead of multiplying these rows.

## Recommended size and split

Recommend **8,000 complete model-contract examples**, representing **2,000 independently specified semantic families**, with one independently worded rendition per family in each of English, MSA Arabic, Jordanian Arabic and mixed Arabic/English. This is a quality-first initial engineering size, not a claim of statistically optimal sample size or guaranteed accuracy.

| Pool | Families | Total rows | Train | Dev | Internal test |
| --- | ---: | ---: | ---: | ---: | ---: |
| 29 substantive intents, 40 families per intent | 1,160 | 4,640 | 3,712 | 464 | 464 |
| Action-boundary language: all 48 action categories, eight families per category, question-stage gold `doAction` | 384 | 1,536 | 1,152 | 192 | 192 |
| Refusal/abstention: `outOfScope` | 256 | 1,024 | 864 | 80 | 80 |
| Greeting without an attached request | 40 | 160 | 128 | 16 | 16 |
| Contextual follow-up/entity/scope contrast cases across the same intent vocabulary | 160 | 640 | 544 | 48 | 48 |
| **Total** | **2,000** | **8,000** | **6,400** | **800** | **800** |

Each language contributes **2,000 rows: 1,600 train, 200 dev, 200 internal test**. The internal test is new and separate from F404 and S160; it is not a rerun or replacement of either. It stays locked during training selection. Dev supports checkpoint selection; F404 never does.

Refusal families: 96 `unclear` (384 rows), 96 `notPermitted` (384), 64 `notHrData` (256). Split each 96-family subgroup 80/8/8; the 64-family subgroup 56/4/4. Core intent families split 32/4/4 per intent. Action-category families split 6/1/1 per action. Greeting families split 32/4/4 and context families 136/12/12. This preserves the global 80/10/10 split while representing every intent, action-boundary category and language in each split.

Translations, paraphrases, entity swaps, minimal contrasts and whole conversation episodes sharing a construction remain in the **same split**. Allocate splits before rendering names or paraphrases. Any connected lineage groups spanning planned families must be merged before quota validation; never split siblings merely to meet row counts. Redundant template replication does not count as independent families. Use split-specific construction and synthetic identity pools; also check cross-language/transliteration duplicates. Fixed seed and split algorithm must be recorded before generation.

## Coverage requirements

- Cover self, manager's own team/direct reports, explicitly named department, company and one named/numbered employee. Scope is expressed through current intent/fields; **do not add a `scope` or `ownership` field to CopilotPlan**. Keep explicit scope/ownership annotations in the dataset sidecar.
- Names must be independently invented without real records or lookup tables. Cover single/multiple components, Arabic name structures, English possessives, apostrophes, hyphens, transliteration, two distinct mentioned people, negation and corrections. Symbolic names alone are insufficient for extraction learning. Any concrete employee numbers must be independently invented, documented synthetic wire-valid values; never infer an ID from a name or imply that an employee exists in the application.
- Copy the mentioned personName/department span in its original language; keep unrelated fields null. Distinguish personName from employeeNumber. Annotate spans, corrections and distractors so extraction labels can be checked independently of intent.
- Use only `today`, `thisWeek`, `thisMonth`, `lastMonth`, `lastSixMonths`, `thisYear`, `calendarMonth`. Each supported relative period must occur across all four languages and applicable intents. Calendar-month records must cover all 12 months, named and numbered wording, Arabic/Western numerals, absent year and explicitly stated year within 2000–2100. `lastWeek`, arbitrary ranges and invented dates are not supported period labels.
- For named/numbered employee payroll/overtime, use `employeeFile` plus `reportType:"payroll"`, the mentioned identifier and supported period. For company analytics use `payrollInsights` with the correct one of the 11 payrollTopic values and no employee identifier. Preserve payrollReadiness, payrollRunSummary, payrollAuditSummary and payrollFindings as distinct existing intents.
- Cover all eight reportType values where supported, all three rankBy values, all 11 payrollTopic values, and both stated and unstated parameters. Reject semantically incompatible combinations. Avoid making every record a report or defaulting missing periods to thisMonth.
- Cover natural MSA morphology and requests; Jordanian possessives, particles, shortened questions and paraphrases; realistic code switching rather than mechanical word substitution. Include spelling/punctuation variation and terse transcript-like text authored independently, never copied recordings.
- Include HR-vs-general-topic contrasts, quoted/misleading instructions, claimed-role attacks, unsupported intents/fields and contradictory subjects. A scientific term in a job/skills/training request is not automatically out of scope. Neither a weather word nor an imperative alone is a label.
- Use trusted synthetic role separately from user text. Positive cases must fit the actual role menu and service capability. Refusal golds follow current role-aware behavior; do not manufacture denied positives merely to balance roles. Record-level membership is unknown until server lookup: the model must not infer employee/team membership from a name.

Coverage overlays are not extra rows. Before admission require, per language, at least 120 named/numbered-person records across applicable core/context/refusal families, at least 40 explicit calendar-month records, at least 20 examples of each supported relative period, and at least 20 supported explicit department mentions. Include each payrollTopic, reportType and rankBy value at least four times per language. Count overlays only where semantic and executor constraints allow them. The coverage report must show split-level counts and any gap before training.

## Clarification and capability boundaries

| Meaning | Training target / annotation |
| --- | --- |
| Vague HR question with no identifiable subject | Existing `outOfScope` plan with refusalReason `unclear`; no guessed parameters |
| Conflicting people/ownership or unsupported time interpretation | Preserve the existing schema and refusal semantics; no guessed employee, widened scope or rounded period |
| Action understood but missing required execution detail | Question-stage `doAction`; missing action details/confirmation remain separate orchestration annotations and later server responsibilities |
| Named employee with possible database name collision | Extract the supplied name; never fabricate a resolved ID. Existing server record lookup/choice owns disambiguation |
| Supported report intent with a genuinely omitted optional/detail field | Preserve null where the current flow supports clarification/default behavior; do not invent the detail |
| Deterministic `needsClarification`, `unsupportedCapability` or terminal `outOfScope` before model invocation | Non-executable annotation/control only; **exclude from the 8,000 model-output exports** rather than invent terminal fields or an executable plan |
| Period-filtered self payslip or status-filtered own requests that executor cannot honor | Unsupported-capability control; never successful unfiltered myPayslips/myRequests gold |

Terminal outcomes are defined in `routingOutcome.ts`, outside CopilotPlan. No new intent, refusal enum or schema is proposed. The refined label rubric must use actual capabilities when the prompt and executor differ; uncertain records are quarantined rather than silently choosing a convenient executable target.

## Record envelope and export format

Future canonical records must carry: record/dataset version; task=`question_plan`; family/episode/template/construction lineage; language/style; trusted synthetic role; independently authored request; optional synthetic previous plan/context; the **complete 11-field gold plan**; entity spans, ownership/scope and period annotations; model eligibility; expected orchestration (annotation only); synthetic source declaration; source/recipe hashes; split; and automated gate results. No real record or authorization outcome belongs in model text.

The model-facing JSONL should use **conversational prompt–completion format**:

- `prompt`: the exact current controlled resolveQuestion system message, optional synthetic follow-up system context, and current QUESTION/END QUESTION user block.
- `completion`: one assistant message whose content is the JSON string `{"plan": <complete existing CopilotPlan>}`. Every field is present; unused values are null, including payrollTopic. No extra keys, explanation, Markdown, SQL, factual HR answer, authorization flag or chain-of-thought.
- Provenance, expected permissions, spans, split and orchestration stay in sidecar records, not the assistant target.

This is a **format specification, not a generated training pair**. No example sentences are authored in this stage.

Use the unchanged real shared prompt and version `2026-10-11.1`, existing allowed-intent descriptions and generic employee payroll clarification. Prompt rendering must use the **controlled isolated dependency mapping** and admitted R hash from the official BEFORE lock, never the production historical loader or unadmitted maintained arrays. R may appear as masked runtime-reference prompt context; its rows may not become targets or authoring templates. No benchmark-specific guidance or new production prompt is permitted.

## Admission before any training

Freeze generator input allowlist, independent construction catalog, synthetic name/identifier rules, seed, family split and coverage quotas **before generation**. Separate authoring from exclusion checking. Then require:

1. 100% strict JSON/envelope and exact existing Zod + `validateCopilotPlan()` semantic validity of all model targets; full field/null consistency and source-hash checks.
2. Independent intent/entity/ownership/period rubric checks, real capability alignment, safe action boundaries and explicit abstention handling. No auto-labels copied from the model being trained.
3. All-field privacy/secrets scanning, synthetic lineage and rendering checks, no real HR sources. Preserve `humanReviewPerformed:false` unless human review actually occurs; human review remains optional under the owner's amendment, never a new blocker inferred here.
4. Zero exact, normalized, entity-masked and strong-near overlap with frozen F, its protected derivative material, historical 10K, R/S and across splits, using the established fixed screening policy. A sealed checker may access protected corpora **only for exclusion**, with aggregate results; the author/generator/trainer must not receive their texts, golds, matches or case IDs. Do not relax thresholds or iteratively rewrite against held-out feedback. Quarantine contaminated construction families.
5. Family/episode/translation separation, language and ontology quotas, no contradictory labels, no repeated rows disguised as volume. Disclose that automated checks cannot prove perfect bilingual naturalness or semantic independence.
6. Exact pinned-tokenizer rendering, token-budget and completion-loss-mask checks described in `03-qlora-preparation.md`. No silently truncated target or lost EOS.
7. New immutable dataset/admission/split/export/tokenizer/source manifests and hashes. No publication/upload or training as an admission side effect.

The preparation-stage contamination result is PASS because no training data was created and protected evaluation was excluded/unchanged. **A future generated dataset has no contamination PASS yet and must satisfy these checks.**
