# Phase 1C.3: controlled baseline and data-admission approval

Review date: **2026-10-25**, Asia/Riyadh. Review authority: technical review by Codex under the user's Phase 1C.3 instruction; this is not a fabricated independent human privacy/security sign-off. Scope: documentation, source inspection and integrity verification only.

**PHASE 1C.3: PASS WITH LIMITATIONS. Controlled Experimental Baseline v1: APPROVED AS A SPECIFICATION. Separate 160-case model-selection DESIGN: APPROVED with the corrections below. PHASE 1C.4: YES, for bounded offline asset creation and admission evidence only.**

No dataset is admitted by approving its design. The runnable controlled baseline, model selection, official BEFORE, fine-tuning, AFTER and production deployment remain **NOT CLEARED**. A new controlled asset and verified legacy-corpus exclusion are not implemented yet. No source, prompt, configuration, schema, dataset, historical report or harness was modified.

## 1. Review of the three Phase 1C.2 documents

Reviewed [01 — provenance](01-synthetic-dataset-provenance-plan.md), [02 — model selection](02-base-model-selection-plan.md), and [03 — lock/evidence](03-experiment-lock-and-evidence-plan.md). Their historical bytes remain unchanged. This new approval record resolves the following gaps for the proposed controlled experiment; it does not retroactively change the historical target or its FAIL decision.

| Review issue | Binding clarification/correction |
|---|---|
| Specification approval could be mistaken for an operational security PASS | Three distinct decisions: approve this specification now; admit each generated dataset later; approve a tested runnable target later. No absent asset, model, reviewer signature or implementation is represented as verified |
| Current harness still permits the unverified corpus | It is **not CEB-v1-ready**. Before any controlled resolver/model evaluation, implement and test a separately versioned isolated asset override/loader projection, remove native read access to the legacy asset and its compiled copy, and stop on unmapped access. A missing-file catch is not an experiment switch |
| No runtime-reference generation quota was fixed | Approve a bounded initial **R-320** design, defined below. Do not recreate 10,000 rows through repetition. Revisions require a new named generation/admission record, not silent padding |
| R is described as training-side, while partitions must remain separated | R may share only explicitly declared training-side lineage with a later T release. That is an allowlisted purpose-specific exception, not permission to copy R into a training export now. R must remain disjoint from V/I/S/F and fixed across BEFORE/AFTER |
| All 160 selection cases might be counted as model work | S-160 includes locally/terminally handled controls. Freeze its local/model-eligible partition offline under the admitted target before any candidate run. Only applicable model attempts enter primary model accuracy/latency; report local controls separately |
| Intent/language coverage and role balance can conflict | Each core intent/language case uses a role permitted for that positive intent. Denial cases belong in challenge strata. Role balance is a target subordinate to correct semantics; document any necessary deviation before freezing S |
| Avoiding all final-benchmark “semantics” is impossible in the same ontology | Shared HR intent labels, field types and ordinary vocabulary are allowed. Copying final episodes, texts, templates, entity constructions, translations/paraphrase families, gold answers or failure-driven designs is prohibited. Define family below the broad intent label |
| Historical scorer is not a full-plan scorer | `scoring.mjs` compares annotated `expected_entities` keys. It must not be advertised as strict complete-plan accuracy. S needs a separately implemented/tested full-plan scorer; F retains its frozen golds and original annotated-field meanings |
| Conceptual training labels do not match current schemas | `previous_month` is not a period; use `lastMonth`. There is no `employeeOvertime` intent or `employee` field. Named overtime/payroll uses `employeeFile`, `reportType=payroll`, `personName`/`employeeNumber`. No new ontology is approved |
| Placeholder master records may not be wire-valid | Symbolic dates/amounts/IDs must be rendered and type/semantic/capability checked before any model/service projection. Do not claim literal placeholder strings passed date/amount parsing |
| Model tag can alter thinking controls | Pin the actual request/template behavior. The adapter's Qwen3 regex is name-dependent; a derivative tag must preserve the same family policy or use an explicitly approved pre-lock adapter correction for both runs |
| Generated origin is not established by a seed/hash/negative scan alone | Require the complete permitted-input recipe, actual generator identity/version, creator declaration, review and byte-bound approval. LLM-assisted regeneration is not assumed bit-identical; no teacher/model calls are approved for Phase 1C.4 |
| Fixture-limited authorization could be overstated | Real registries and reviewed service guards stay authoritative; generic read scope labels and unimplemented resources do not certify all production SQL, human consent, MCP or RAG. Unavailable dimensions remain unavailable |

No contradiction requires changing production to resolve this review. The corrections are experiment/admission requirements, not new routing rules or benchmark-specific prompt guidance.

## 2. Controlled Experimental Baseline v1 definition

Identifier: **CEB-v1**, specification revision **1.0**. It is a new controlled experimental system, not an assertion that the unchanged historical application has been evaluated. Selection configurations may vary only their declared candidate model; official BEFORE must use one subsequently selected, locked base. AFTER changes only the declared learned weights/artifact identifier under equivalent inference conditions.

| Boundary | Approved CEB-v1 contract |
|---|---|
| Allowed runtime dataset | Only independently synthetic **R-320 v1** bytes that later pass the admission gate; actual file/hash is currently **PENDING**. No fallback to the historical corpus, build copy, sanitized derivative or unreviewed alternate file |
| Maintained source examples | Existing phrasebook, supplemental/conversation/help examples may be retained only as separately inventoried, privacy-reviewed fixed source dependencies. Their location in source is not an exemption. They are not seed text for generating R or S |
| Resolver components | Current authenticated HTTP orchestration, terminal preflight, deterministic reads/period/name parsing, context, help, phrasebook, training-category routing, role-filtered retrieval, question provider and proposal/permission guards, pinned by a new controlled source/override manifest. No expansion of local coverage |
| Corpus compatibility | A future reviewed projection must preserve typed modern routes and support the claimed 32-intent/48-action reference coverage. The legacy loader maps only 11 distinct query intents plus `doAction` and 12 action types; silently dropping unsupported labels is forbidden |
| Model fallback | Only the existing structured **Ollama question-generation** path at the approved loopback endpoint. Candidate ID/digest is pinned per selection attempt; final base is **UNSELECTED** until selection/lock. `qwen3:4b` remains candidate only. No OpenAI/OpenRouter/cloud fallback |
| Other AI calls | OpenAI action/continuation/prose remain unconfigured/blocked in the isolated target; knowledge/narrative/embedding paths remain synthetic/no-op as declared. No migration of those production calls or claim of their model-quality evaluation |
| Prompt/config | Existing formatter and role-specific prompt, `COPILOT_PROMPT_VERSION=2026-10-11.1`; actual source and rendered message hashes must be recorded. R changes are an explicitly declared new dependency. Production `.env` and `AI_PROVIDER` remain untouched |
| Request policy | JSON Schema `format`, `stream:false`, existing server Zod and semantic validation, temperature 0, existing 120s adapter/150s parent bounds, no retries and no automatic provider fallback. Pin supported seed/context/threads/cache/keep-alive and family-specific non-thinking behavior before model evaluation |
| Question output | Actual `{ plan: CopilotPlan }` wrapper, all existing typed fields/nulls/defaults and 32-value intent vocabulary. No SQL, service result, invented date/ID or executable terminal variant |
| Action understanding | Existing 48-value CopilotActionPlan, separate stage/task and wrapper. The first proposed fine-tuning target is question-plan generation; `doAction` accuracy is not full action extraction accuracy |
| Terminal outcomes | Existing non-executable routing/outcome type and existing API responses. Clarification/unsupported/out-of-scope controls cannot fall through to real writes, RAG or another provider |
| Identities and context | Reserved synthetic employee/manager/HR/admin actors, non-authenticating UUIDs and `.invalid` addresses; independent synthetic directory/ownership/ambiguity fixtures. UI context is advisory, never authorization. Fresh case state and fixed reference dates/timezone |
| Authorization | Existing `validateCopilotPlan()` → `mayAsk()` / `mayDo()` → employee/payroll/report scope and proposal checks → bounded synthetic services. Confirmation decisions remain enforced and protected execution intercepted |
| Isolation | Explicit module/file allowlists, stripped credentials/proxies, no production auth/session/client, no DB/MCP/RAG/internal HR API, no business writes, no external model transport, redirects forbidden, bounded input/output/deadlines, latched violations. Trusted hash-verified source is the threat model, not arbitrary hostile-code sandboxing |
| Scoring | **CEB-SCORE-1 specification**, defined below; executable implementation/hash currently PENDING. Preserve legacy F scorer meaning in a separate profile; no changed golds or invented complete-plan targets |
| Environment | Supported pinned Node permission-model runtime (observed Node 24.15.0), exact dependency lock, Windows/CPU/RAM target, approved Ollama build and model/export provenance. Re-attest exact versions, resources, cold/warm policy and concurrency before calls; historical metadata is not a fresh readiness check |

The current harness's historical `--execute-frozen-before` path is **not approved** for this new target. Hashing a quarantined historical artifact for integrity is permitted in the trusted verifier; parsing it as examples, returning its text to the resolver, using it in generation or exposing it to a model is not.

### Source anchors for the proposed target

These are verified reference hashes, not a new runtime lock or a replacement historical manifest:

| File | SHA-256 |
|---|---|
| `shared/src/copilot.ts` | `9956b4cf95579b20c2769e9906ccf1e9804644e2ac7df4708001b0cfda25e27e` |
| `shared/src/actions.ts` | `1af23cc6343127f5fb6078fdd2dcd24849f55dd0b32e690ad4edcd93bb892737` |
| `server/src/copilot/intents.ts` | `848946826f105bb51d721626d08d752853f5d163b2bfdb045c1fce20400c7a82` |
| `server/src/copilot/actions.ts` | `ea182a2d40f98bffe9cfd94acf67fc2d1abf1da10856af7abcb592657b07a41c` |
| `server/src/copilot/validatePlan.ts` | `c8668f81f35074ba393206906b08b22852fcbbbdb94b16f8b1416fd288512719` |
| `server/src/copilot/resolve.ts` | `830292e0d09a9da626fbf83bd9a2e62d8edf687eb678c2667aabc3f97d20c90a` |
| Historical harness `scoring.mjs` | `3a5c9e9174b246d79f3c9c99789d3d7eabda0d7730cafedd8a3363a66c209777` |

Any future approved loader/override/scorer change receives a new controlled manifest with an explicit diff, tests and approval. Keep it constant across official BEFORE/AFTER. Do not rewrite source history to make a controlled change appear pre-existing.

## 3. Mandatory dataset-admission gate

Applies to **every** runtime, selection, training, validation, internal evaluation and final-evaluation dataset, plus context/identity fixtures and data-bearing prompt assets. Approval is purpose-specific and bound to exact bytes. A previously approved artifact changing by one byte returns to candidate status. Dataset admission does not approve a run.

Lifecycle: **PROPOSED → GENERATED/STAGED → REVIEWED → ADMITTED**, or **REJECTED/QUARANTINED**. Only an ADMITTED hash may enter the declared experiment role. No nonexistent asset is currently ADMITTED by this record. F retains its separate historical frozen/static-privacy record and purpose restriction; it is not admitted as training/selection/generation input.

| Mandatory evidence | Acceptance requirement |
|---|---|
| Identity and permitted purpose | Versioned dataset ID, task/profile, intended role R/S/T/V/I/F, creator/reviewer IDs, timestamp and source/output paths; no ambiguous “training” filename used for every purpose |
| Origin | Explicit independently synthetic authorship, permitted-input inventory/hashes, rights/source declaration, creation method and absence of real HR/user/document/secret input. Unknown origin is a rejection, not a warning |
| Generator | Actual script/template/grammar name/version/hash, deterministic ordering/serialization, PRNG/version/seed or justified no-randomness declaration, environment/locale. Any model involvement requires exact model/prompt/settings provenance and separate approval; not authorized for Phase 1C.4 |
| Counts | Raw/generated/admitted/rejected totals, UTF-8 format, byte size, parse/schema failures, row IDs, exact and resolver-normalized unique/duplicate counts, family/episode counts and rejected reasons |
| Coverage | Language/script/style, 32-intent and applicable 48-action categories, trusted role, slot/period/ownership, clarification/confirmation/unsupported/RBAC matrices; absent/inapplicable cells explicit |
| Duplicates | R and S: zero exact/normalized duplicate texts and unique IDs; translation/episode relations declared. Other releases require a predeclared weighting policy, not hidden repeated rows. No duplicate padding to meet quotas |
| Validation | 100% parse and envelope-schema validity; all executable expected plans pass actual Zod and semantic checks. Unsupported-capability and role/scope expectations independently reviewed, not inferred from model outputs or a successful local match |
| Privacy | All fields/context/metadata scanned offline plus bilingual human review of all release texts and residual candidates. Negative regex results alone are insufficient. Unresolved identity/sensitive-content findings block admission |
| Credentials | Secret/API-key/token/password/connection/endpoint scans of all content, paths, diagnostics and provenance. Reject any discovered real secret; report only category/count/safe ID/redacted evidence |
| Contamination | Fixed exact/normalized/entity-masked/near-duplicate and lineage checks across splits, existing examples and sealed F exclusion; reviewed disposition, zero unresolved forbidden overlap |
| Cryptographic identity | SHA-256 of exact release bytes and manifests, generation/validation/scan tools and results; checksum verification after writing and before each permitted use |
| Attestation and approval | Creator attestation tied to hashes and permitted inputs; independent privacy/semantic/admission review recorded truthfully. Approval ID/status/scope/timestamp and named or pseudonymous accountable reviewer. Missing independent review remains PENDING; do not invent sign-offs |
| Retention and release | Restricted staging/access/retention owner, controlled failure logs and explicit publication status. No automatic export, upload or runtime activation |

Failure in any required cell means **NOT ADMITTED**. Keep the candidate version and redacted rejection record; do not silently sanitize, relabel, substitute a different file or continue using an old approved hash after edits. A corrected release is a new version and must rerun the full gate.

## 4. Privacy/security requirements

Prohibit real employee/applicant names or IDs, contact details, employee profiles/records, salaries/compensation, attendance and leave histories, bank/IBAN/account values, national/passport IDs, addresses, medical/disciplinary narratives, credentials/API keys/tokens/passwords/connection strings, production RAG documents and production HR outputs. No real-record transformation, pseudonym map, CV, recording/transcript, user conversation, review inbox, routing memory, log or backup is a permitted generation source.

Use indexed typed placeholders: `<EMPLOYEE_NAME_1>`, `<APPLICANT_NAME_1>`, `<EMPLOYEE_ID_1>`, `<RECORD_ID_1>`, `<DATE_1>`, `<DEPARTMENT_1>`, `<COMPANY_1>`, `<SALARY_AMOUNT_1>`, `<ADJUSTMENT_AMOUNT_1>`, `<EMAIL_1>`, `<PHONE_1>`, `<ADDRESS_1>`. Preserve distinct entities and within-episode identity consistently. Never map these to real people.

Dates/amounts may be deterministically rendered into invented wire-valid values solely to test requested-operation extraction. They must not become claims about actual pay or records. Natural-form names require an independently constructed, documented synthetic morphology pool and reviewer approval; accidental name resemblance does not establish a real identity, but no source directory or known person may be used. Reserved synthetic IDs cannot authenticate or address production; contacts default to placeholders or reserved `.invalid` email. Prefer excluding bank/national/passport values entirely; do not generate plausible working identifiers. Minimal `<SENSITIVE_REASON_1>` may replace an indispensable generic reason, never a clinical/disciplinary narrative. Secrets are excluded rather than masked into training material.

The approval-level privacy/security gate is **PASS for this specification and the constrained offline creation scope**. Generated-asset privacy approval and runnable-target security remain **PENDING**, not PASS. A future model accuracy result cannot waive any privacy, semantic, RBAC, record-scope, confirmation or executor check.

## 5. Frozen-404 contamination gate

F is `docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl`, 404 frozen synthetic cases, SHA-256 `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05`.

**Never use F for training, validation, model selection, prompt optimization, hyperparameters, generation seeds, paraphrase/translation generation, phrasebook/runtime examples or RAG.** No scores or case failures may drive changes. The historical 26 optimized cases and old 10k corpus are also excluded as seed/gold sources for R/S. Shared ontology and generic HR words are permitted; inherited question/episode/template families are not.

Binding offline comparison procedure, fixed before candidate generation/results:

1. Compare byte-exact text and exact normalized text using the versioned current resolver normalization (lowercase/NFKD/Arabic handling/punctuation/trim). Compare all turns/context, not only the last question.
2. Compare entity-masked normalized text and construction/template/translation/episode lineage. Known synthetic slot maps preserve whether repeated mentions refer to the same entity; a common placeholder type alone is not a duplicate. Rendered entity pools are split-specific.
3. For texts longer than five normalized tokens, flag token **3-shingle Jaccard ≥0.80** or normalized code-point Levenshtein similarity **≥0.90**. Similarity is `1 - distance / max(lengths)`; empty strings are invalid input. For short texts, require exact/masked checks and flag character **3-shingle Dice ≥0.90** or the same edit threshold. Record tokenizer, shingle and Unicode implementations/hashes.
4. Independently review flagged/cross-language cases and lineage for translation/close paraphrase overlap; language scripts do not prove independence. Use offline bilingual review, not the candidate model, cloud embedding, production RAG or final-benchmark optimization. Any unresolved prohibited collision blocks the release.
5. A fixed sealed F exclusion check is run by the evaluation custodian, not the generator. Authors receive only aggregate pass/fail/collision counts, no final text/golds/row IDs/similarity suggestions. Quarantine entire colliding candidate families; do not paraphrase around the final case or query the checker repeatedly as a membership oracle. Excessive/uncertain collisions require a new reviewed protocol, not threshold relaxation.

Thresholds are screening rules, not proof of semantic independence. Repeated harmless HR words alone are not a violation. Within-split translations are allowed with lineage. **Only R-to-future-T reuse explicitly declared in a later T admission is an allowed cross-role overlap**; R↔V/I/S/F, S↔T/V/I/F and other evaluation/train crossings are forbidden. No final exclusion-only check or decontamination result has been executed in this phase.

## 6. Approved Phase 1C.4 asset designs

### A. R-320 v1: controlled synthetic runtime references

Approve **320 prospective records**: **128 question-reference records (32 intents × 4 languages)** and **192 action-reference records (48 actions × 4 languages)**. This is nominal ontology coverage, not evidence of exhaustive parameter competence. Do not claim it replaces a fine-tuning dataset. Do not emit rows now.

Each record has a new namespaced ID, independently authored text, language/style, construction/family lineage, applicable trusted-role context, typed route and relevant expected parameter/clarification/confirmation annotations. Action references retain their actual existing action type; their question-stage representation is `doAction`. All wire projections must preserve actual schemas and null/default behavior. No source row's role or confirmation tag overrides server authority.

Use independent semantic-construction families below the intent/action label; translations may share their declared family within R. Every text must be distinct after normalization. Test supported periods, scope and stated-versus-missing slots without guessing IDs or dates. If a required coverage cell cannot be authored safely/validly, keep the release NOT ADMITTED and document the gap—do not invent a label, duplicate a row or silently change the 320 budget.

R is a new isolated reference dependency, not a production replacement. Actual file format/projection implementation is a future reviewed compatibility decision; a legacy-shaped export that drops modern routes cannot pass coverage. No loader/source/harness change is authorized by this document-only phase.

### B. S-160 v1: separate model-selection evaluation

**DESIGN APPROVED**, exactly **160 prospective cases**, **40 per language** (`en`, `ar-MSA`, `ar-JO`, `mixed`):

* **128 core**: 32 intent/language pairs, one per pair with a valid permitted role and fully specified applicable gold.
* **32 challenge**: eight per language—two ownership/ambiguity, two unsupported/out-of-scope, two voice-style/self-correction and two context/entity-conflict cases. Cross-cutting tags are recorded without double counting the case budget.

S uses independent constructions, templates, rendered identities and episodes, not R or F translations/paraphrases. Keep whole episodes together; one case may supply a bounded synthetic prior plan, but an extra turn is not an undisclosed extra scored case. Four-role balance is a documented target subordinate to role-valid intent semantics; record any deviation before freezing.

When generated, S must produce: raw/candidate/admitted counts; exact/full case and metadata schema; row/family/episode IDs; all gold plans/expected outcomes and review decisions; language/role/intent/slot/safety coverage; normalization/duplicate report; R/T/V/I/source-example overlap and sealed F clearance; generator/seed/source/attestation evidence; all file hashes and purpose-specific approval. No candidate output is gold.

Model eligibility is determined only after R is admitted and a controlled router is implemented/tested. Freeze one offline local/terminal/model partition before scores exist. Primary selection includes only unresolved cases with applicable question-plan targets; local/terminal and service-only cases have separate denominators. Require at least ten model-eligible cases per language as in the approved design; insufficient coverage means **INCONCLUSIVE**, not forced model calls or borrowing final cases. Generation approval is not permission to execute this preflight now.

The 32/48 nominal R coverage and 32-intent S design do not approve second-stage action fine-tuning, service execution or a model winner. `qwen3:4b` is candidate only. No 160-case data exists or was executed in this phase.

## 7. Future training schema and target approval rules

A future training release requires its own gate and execution approval. Phase 1C.4 creates runtime/selection assets only; it must not emit a fine-tuning export or claim that R is already admitted for learning.

| Envelope component | Required future contract |
|---|---|
| Identity/provenance | Dataset/task/version, row/family/episode/template lineage, generator/input hashes, synthetic declaration, creator/reviewer approvals and split assignment |
| Input | Independently synthetic text, trusted synthetic role/context, optional synthetic prior plan and current page; no real conversation or record data |
| Question target | Actual `{ plan: CopilotPlan }`, all current fields with exact types/nulls/defaults. Current periods only: `today`, `thisWeek`, `thisMonth`, `lastMonth`, `lastSixMonths`, `thisYear`, `calendarMonth` |
| Action target | Actual `{ plan: CopilotActionPlan }` in a **separate explicitly approved task/export**, not mixed untagged with question targets. All 48 action names from the registry, with only stated applicable fields |
| Entities/parameters | Mention spans, personName/employeeNumber/department, supported period/month/year, report/rank/payroll enums and action-specific slots; symbolic and rendered forms distinguished |
| Orchestration annotation | Missing fields, clarification, unsupported/abstention, permission/scope, confirmation and no-execution expectations. Annotation is not a new model output field or authorization grant |
| Validation | Existing schemas, shared semantic rules and actual capability/permission contracts; reject unsupported combinations and unreviewed labels |

The request's conceptual `previous_month`, `employeeOvertime` and `employee` are **not approved runtime targets**. Translate the meaning to existing `lastMonth` and `employeeFile` + `reportType=payroll` + `personName`/`employeeNumber`. Company-wide payroll remains `payrollInsights` with an appropriate `payrollTopic` and no named employee. Do not add executor support for currently unsupported periods/status filters through gold labels.

The recommended first experiment teaches question intent and applicable slots, with action-language inputs represented as `doAction`. It does not train `resolveAction()`, `continueTask()`, `phraseAnswer()` or learn authorization. Clarification/confirmation/control labels are reviewed separately; model-output training occurs only where the existing wire contract applies. Deterministic terminal rows may be orchestration controls without being model-training rows. Real employee facts or service answers are never targets.

## 8. Scoring version and reproducibility requirements

**CEB-SCORE-1** is an approved specification, not implemented code or measured results:

* **S profile:** evaluate the complete expected question plan after existing Zod normalization, comparing every defined field, including nulls/defaults, period, person, reportType and scope-relevant parameters. Tolerate JSON object key order and NFC/trim for string equality; no guessed missing values, transliteration, broadened periods or post-result equivalence changes. If multiple plans are legally equivalent, enumerate that equivalence before any candidate score.
* Record actual JSON/Zod/semantic validity separately. Existing Zod defaults/unknown-key behavior remain unchanged; raw-format/extraneous-field diagnostics may be reported separately without secretly making production validation stricter or weaker.
* Intent/complete-plan denominators include every applicable attempted model case; provider errors, invalid outputs and timeouts cannot disappear into successful-response-only percentages. Report both successful-response and attempt-wide validity, all failures and local versus model coverage. No retries or best-response selection.
* **F profile:** keep frozen expected labels/entities/actions/outcomes unchanged. The historical scorer's key-subset entity result is **annotated-field correctness**, not full-plan correctness. If complete gold fields are absent, strict complete-plan accuracy is **NOT AVAILABLE**, not fabricated by filling unspecified fields with null. Any proxy must be explicitly named; no benchmark mutation to create fuller golds.
* Service-boundary supplied candidates and terminal/local controls are not model predictions. Unsupported fixtures remain unavailable; generic scope labels do not certify production SQL. False selection/proposal/attempt and actual execution are separate observations; actual business execution stays zero.

Before use, implement and hash the profile code, add positive/negative/default/null/error/denominator tests and pin its result schema. Do not change scoring after observing a candidate or F failure. No scorer implementation is created here.

Before each major stage freeze an experiment/run ID, UTC/timezone, approvals, all source/override/data/fixture/scorer hashes, exact configuration/prompt/schema version and rendered prompt hash, model checkpoint/tokenizer/template/digest, runtime and quantization/export recipe, inference settings/timeouts/seed support, environment/resources, security status and allowed input/output paths. Fields unavailable at specification time remain PENDING and block the stage needing them.

For later execution preserve every raw per-case outcome/attempt/abort, bounded monotonic latency, token/resource observations and separately hashed derived metrics with explicit denominators. Declare raw result locations before execution; no fake raw file/result hash can exist beforehand. Pin a run manifest before launch and finalize output hashes/completion/error status afterward. No wall-clock subtraction for request durations or multi-hour interrupted-request values.

Select a base using S only, then freeze its training-compatible checkpoint and inference artifact and the full experiment lock **before** F BEFORE. Seal BEFORE quality outputs from training developers until the tuned checkpoint/export is frozen; V alone selects training hyperparameters/checkpoints. AFTER preserves R, prompts, rules, schemas, runtime/scoring/fixtures and equivalent quantization/settings, changing only declared weights/artifact identity. Any other change is an amended/new experiment, not hidden fine-tuning benefit.

## 9. Remaining MEDIUM findings and stage decisions

The [original six MEDIUM findings](../security/07-security-audit-findings.md) and [runtime-input follow-up](../security/09-runtime-examples-provenance-audit.md) remain historically OPEN. Isolation containment is not a production fix. The current historical target is still blocked, and the current harness does not yet enforce CEB-v1 legacy exclusion.

| Finding | Current controlled-execution classification | Before fine-tuning | Before production-connected deployment/evaluation |
|---|---|---|---|
| **SEC-03 MCP validation/orchestration parity** | **MITIGATED BY ISOLATION** when MCP modules/tools remain blocked | No additional application fix for the approved synthetic-only scope | **MUST FIX BEFORE PRODUCTION** in MCP scope |
| **SEC-04 human confirmation differs by channel** | **MITIGATED BY ISOLATION**: proposals/decisions only, no protected execution | No live human-consent/execution claim permitted | **MUST FIX BEFORE PRODUCTION** protected execution/consent |
| **SEC-05 raw-language retention/export** | **MITIGATED BY ISOLATION**: no real stores/history, no-op retention | No additional fix for independent synthetic T/V. Any real-source export is prohibited and would require a new gate/remediation | **MUST FIX BEFORE PRODUCTION** retention/reuse scope |
| **SEC-06 egress and legacy-example admission** | **BLOCKS CONTROLLED BASELINE execution** until R/S admission and verified old-corpus read exclusion/transport controls exist | **MUST FIX BEFORE FINE-TUNING** the experiment's input-admission/isolation gap; does not require certifying or modifying old bytes, nor claim production egress fixed | **MUST FIX BEFORE PRODUCTION** comprehensive feature egress/privacy |
| **SEC-07 RAG content/audience governance** | **MITIGATED BY ISOLATION**: no real RAG, synthetic fixture only | No real-document training reuse allowed | **MUST FIX BEFORE PRODUCTION** RAG scope |
| **SEC-08 diagnostic/error redaction** | **MITIGATED BY ISOLATION**: controlled synthetic-only outputs, no credential inheritance | Use reviewed bounded redacted logs; uncertainty blocks data admission | **MUST FIX BEFORE PRODUCTION** connected logging/diagnostics |

Counts: **6 total; 1 currently blocking runnable controlled evaluation; 1 must be resolved before fine-tuning (the same SEC-06 experiment-input prerequisite, not an additional finding); all 6 require fixes before their affected production-connected scope.** Five are contained for the intended isolated scope. No application fix is performed or finding closed here.

This does not block the bounded offline creation of candidate R/S assets needed to resolve input admission. Their creation is not a resolver/model evaluation or a declaration that the operational blocker is closed. After CEB-specific controls are implemented and verified, SEC-06 may be recorded as contained for that target in a new follow-up, while its broader production finding remains open. The old corpus remains unverified regardless.

## 10. Phase 1C.4 clearance and exact limits

**YES — proceed in a later Phase 1C.4 to create candidate R-320 and S-160 plus their generation/admission evidence. Do not create them in this phase.**

Within that later phase, first freeze a pre-generation allowed-input manifest, generator/grammar version/hash, deterministic order and seed/no-randomness declaration, planned quotas and new staging paths. A deterministic local generator or independent synthetic authoring is allowed. **No model/teacher calls, downloads, cloud service, old-corpus-derived text or production input is approved by this clearance.** AI-assisted authoring/tool identity must be recorded honestly if applicable; do not fabricate an exact generator model/version when unavailable.

Before its first row, the authoring process must prove a narrow read allowlist (curated enums/field contracts/capability definitions, approved generator and dependencies only), no `.env`/credentials/proxies, no access to old corpus/build copies, frozen cases/golds, uploads, logs, real records, RAG/MCP or application startup. Do not import `training.ts` or `resolve.ts` as a convenient generator dependency. Static contract extraction may be reviewed; natural-language source example arrays are not seed data. Block networking/process escape; permit writes only to new versioned experiment staging/evidence paths, never historical/application paths. Record the checks. If the preflight cannot establish these restrictions, stop before generation; this approval is not permission to skip them.

A separate sealed validator/custodian may inspect candidate releases and F for the fixed exclusion-only scan, with the restricted reporting defined above; F must remain unavailable to the authoring process. Missing independent reviewers/custodian or incomplete scans means outputs stay STAGED/QUARANTINED, never self-certified ADMITTED. Creator attestations bind actual output hashes after generation; no signature is invented in advance.

Not cleared by Phase 1C.4 scope: production asset replacement/loader activation, `AI_PROVIDER` or `.env` changes, new routing/prompts/permissions, candidate model execution/selection, training exports or fine-tuning, the 404 BEFORE/AFTER, real action execution, production access or Git/GitHub operations. Later phases need their own evidence-bound gate. The current historical Phase 1D decision remains **NO**.

## 11. Git/GitHub evidence and disclosure gate

Evidence requirements are **DEFINED**, not permission to initialize or upload. Preserve private immutable recipes, attestations, source/data/model/lock hashes, gate decisions, all attempts/raw results, derived metrics and BEFORE/AFTER comparisons under distinct experiment identities.

Before any future publication require a separate explicit release review: secret scan, credential scan, bilingual PII scan/review, `.env`/environment-file inventory and exclusion, production-data/document/history review, source/model/dataset rights, security-report disclosure review and an explicit sanitized file allowlist. Exclude old unverified examples, real uploads/logs/transcripts/RAG/DB records, credential files and unreviewed raw model outputs. Do not upload the workspace wholesale or assume `.gitignore` is sufficient.

Hash public redacted derivatives separately and preserve a private original-to-public transformation record; do not overwrite historical reports or claim redacted bytes equal original hashes. Keep F/golds/quality results restricted until the AFTER checkpoint and comparison are locked. Public release affects future contamination claims. No Git repository, publication bundle, remote or upload is created now.

## 12. Integrity and final approval record

Verified before/after this review:

| Artifact | SHA-256 / result |
|---|---|
| Frozen 404 benchmark | `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05` — **UNCHANGED** |
| Historical runtime corpus | `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` — **UNCHANGED / QUARANTINED BY ADMISSION POLICY** |
| Historical manifest | `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47` — **UNCHANGED**, not regenerated |
| Existing protected files | **413/413 unchanged**, including the three reviewed plans and all prior security/target reports |

“Quarantined” here means not admitted to the new experiment; no file was moved/deleted, no production behavior changed and no machine-wide ACL is falsely claimed. Technical experiment read exclusion is still an operational prerequisite. The existing two HIGH-remediation exceptions remain separately documented; no new source exception was accepted.

Only `docs/fine-tuning/design/04-controlled-baseline-and-data-admission.md` was created. Verification uses source inspection, protected-file hash comparisons and `run.mjs --verify` (static integrity only, **NO CASES EXECUTED**). Recent 42/42 isolation tests are Phase 1C.1 evidence; no new unimplemented CEB features are claimed tested. No model, generation, training or runtime benchmark was run. No training input/output example is authored in this report; tables describe contracts/quotas only.

| Final decision | Status |
|---|---|
| Phase 1C.3 | **PASS WITH LIMITATIONS** |
| Controlled Experimental Baseline v1 | **APPROVED — specification only; operational gate pending** |
| Historical 10K | **QUARANTINED** for new-experiment admission; source bytes unchanged |
| Data admission gate | **DEFINED** |
| Privacy/security gate | **PASS for specification/offline-creation scope; asset/runtime gates PENDING** |
| 404 contamination protections | **DEFINED** |
| 160-case selection design | **APPROVED**, not generated |
| Remaining MEDIUM | **6 total / 1 operational blocker / 1 same prerequisite before fine-tuning / 6 affected-production fixes** |
| Evidence/GitHub requirements | **DEFINED** |
| 404 executed / synthetic data generated / model selection executed | **NO / NO / NO** |
| Fine-tuning started / production data accessed / production behavior modified | **NO / NO / NO** |
| NEXT PHASE CLEARED | **PHASE 1C.4 YES — bounded offline candidate-asset creation only** |

Stop after this approval document. Do not generate assets or execute models in Phase 1C.3.
