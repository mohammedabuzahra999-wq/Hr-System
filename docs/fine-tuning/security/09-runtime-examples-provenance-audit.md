# Phase 1C.1: runtime examples provenance and privacy audit

**RUNTIME EXAMPLES PROVENANCE AUDIT: FAIL admission; offline inspection completed.**

**Provenance: PARTIAL. Security classification: UNVERIFIED — BLOCKING. MEDIUM finding status: STILL BLOCKING. CLEARED FOR PHASE 1D: NO.**

No evidence of real production-data derivation was found in the inspected artifacts. The static scan found no recognizable credentials, identifiers, contact details, concrete monetary values, dates or record-shaped health/attendance/leave facts. A broad name heuristic includes false positives and unresolved lexical candidates; it does not establish actual employee identities. Local Windows metadata supports a **ChatGPT download origin**, and the regular corpus structure suggests generation/templates, but neither proves that the original inputs were wholly synthetic. The synthetic-only policy is unchanged.

This is a new follow-up record. The [original findings](07-security-audit-findings.md), [HIGH remediation record](08-high-severity-remediation.md), [Phase 1C target decision](../benchmark/harness/target-configuration.md), historical manifest, runtime corpus and frozen benchmark were not rewritten.

## 1. Exact asset and cryptographic evidence

Project root: `C:\Users\PC-LAB\Downloads\hr-app-step2`.

| Evidence | Verified value |
|---|---|
| Exact application asset | `server/src/copilot/data/hr_agent_intents_10000.jsonl` |
| Absolute path | `C:\Users\PC-LAB\Downloads\hr-app-step2\server\src\copilot\data\hr_agent_intents_10000.jsonl` |
| Format | UTF-8 JSONL; one JSON object per nonempty line |
| SHA-256 | `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` |
| File size | **2,575,524 bytes** |
| Parsed nonempty rows | **10,000**; no JSON parsing failure |
| Unique exact texts | **3,440** |
| Unique normalized texts | **3,440**, using current resolver normalization |
| Duplicate rows beyond unique text | **6,560**, both exact and normalized |
| Final full audit timestamp | **2026-10-25T06:23:53.309Z**, equivalent to **09:23:53.309 Asia/Riyadh** |
| Filesystem creation timestamp | `2026-10-06T09:19:23.927Z` |
| Filesystem last-write timestamp | `2026-10-06T08:35:42.875Z` |
| Compiled deployment copy | `server/dist/server/src/copilot/data/hr_agent_intents_10000.jsonl`; same SHA-256 |

Filesystem timestamps and download metadata are mutable local evidence, not signed authorship or original creation attestations. An earlier last-write timestamp than local creation is consistent with copying/downloading an existing file; it does not identify the author or original source data. The content hash matches the frozen Phase 0 source fingerprint and was rechecked after inspection. The separate record here does not replace the historical manifest.

Normalization follows `training.ts:136-148`: locale lowercase, NFKD, Arabic diacritic/alef/ya/ta-marbuta handling, the existing spelling substitution, non-letter/non-number punctuation collapsed to spaces, and trim. No dataset normalization was written back to disk.

## 2. Runtime usage and actual exposure

| Source | Role in the current system |
|---|---|
| [training.ts](../../../server/src/copilot/training.ts), `loadTrainingSet()` | The application loader. Resolves the adjacent `data/` file, parses usable text/legacy labels, retains trimmed text up to 500 characters and normalized/token forms. Source IDs label examples; they are not employee identifiers |
| Same module, mappings and local lookup | Maps legacy labels into existing intent/action categories; exact/nearest-example routing and local action extraction use the corpus together with existing maintained supplemental examples. No corpus row is a permission grant or an execution instruction |
| [routes/copilot.ts](../../../server/src/routes/copilot.ts) | After terminal/strong deterministic routing, can use phrasebook/exact-training decisions or call `resolveQuestion()`. Candidates still traverse shared validation and RBAC |
| [resolve.ts](../../../server/src/copilot/resolve.ts) | `questionTrainingExamples()` selects **up to 10** examples. `trainingQuestionPrompt()` inserts their text and mapped intent/report/refusal annotations into the real system prompt; actions appear as `doAction`. The role, optional previous plan and current question are additional context |
| Same resolver, action stage | `actionTrainingExamples()` selects **up to 8** examples for the existing OpenAI action prompt when that path is configured. Current isolated harness supplies no OpenAI key, so this cloud path cannot run there |
| [copyCopilotTrainingData.mjs](../../../server/scripts/copyCopilotTrainingData.mjs) | Build-time byte copy into `dist`; **not a generator, anonymizer, provenance record or database export**. The script was inspected, not executed |
| Harness [policy](../benchmark/harness/policy.mjs) / [capsule](../benchmark/harness/capsule.mjs) | Explicit read allowance and read-only filesystem bridge for the unchanged asset; current source selects examples normally. No gold benchmark answer is supplied as question-model context |

`training.ts` is the application source module that loads the source corpus. Compiled code uses the corresponding copied asset. The new offline audit script also reads it solely for verification; it is not imported into application startup.

Only selected example text/mapped labels enter a model prompt, not all 10,000 rows or their whole metadata objects. This is still data admission: a fixed source file is not automatically privacy-approved. The existing comment/section name “approved labelled examples” describes routing usage, not an independent privacy/provenance certificate. No model request was made in this phase.

## 3. Provenance investigation: facts versus inferences

### Proven facts

* Source references, project documentation, scripts, comments and existing artifacts were searched read-only. References identify the loader, deployment copy and later audits; **no original generator, generation prompt, creator attestation, source export log, license/provenance note or source-data declaration was found for this exact corpus** in the inspected project material.
* The loader describes a supplied labelled language set and refers to the pre-existing 10k corpus. It does not certify synthetic authorship. The build script only copies bytes.
* None of the 10,000 rows contains a `synthetic`, `synthetic_data`, `source`, `provenance`, `generated` or `metadata` declaration. Their actual fields are `id`, `text`, `intent`, `parameters`, `role`, `language`, `requires_confirmation`, `category`, `tool` and `target`.
* The local file has a Windows `Zone.Identifier` alternate stream: **ZoneId 3** (Internet zone), with `HostUrl` and `ReferrerUrl` pointing to HTTPS **`chatgpt.com`**. Neither URL contains URL credentials or a query. Private paths/artifact/conversation identifiers are deliberately omitted. This stream was read locally; no URL was opened and no ChatGPT/cloud API was called.
* This provides partial download-origin evidence. An editable browser/download marker does not prove which model/author created the content, what the original instructions said, or whether real data was supplied upstream.
* There is no Git repository/history in this project. Git was not initialized. No external origin/service or production directory was consulted to fill the evidence gap.
* Corpus content and its build copy are byte-identical. The original baseline hash establishes continuity of this asset since the recorded snapshot, not pre-snapshot provenance.

### Inferences, not attestations

The following strongly suggest templated/programmatic generation: 36 ordinary labels have exactly 250 rows each; ambiguity and out-of-scope labels have 600 and 400; label-associated ID blocks are contiguous for 36/38 labels; all IDs cover the numeric range 1–10,000 but physical rows are shuffled; language counts are near-balanced; repeated short texts, empty parameters and uniform metadata recur. Download origin is consistent with an AI-generated deliverable.

**Most plausible appearance: A — generated synthetic examples. Established original source category: E — synthetic authorship/source inputs cannot be established from available evidence.** Manual authorship and mixed/derived input cannot be ruled out. Nothing found demonstrates category C (production-derived data), and no unsupported claim of category B or verified non-production provenance is made.

## 4. Offline sensitive-data scan

The security-only [audit script](runtime-examples-audit.mjs) reads **all rows and all JSON string values**, then reports only aggregates, safe corpus row IDs, allowlisted metadata and masked categories. It imports no application startup, env, DB, MCP, RAG, resolver or model module, and performs no write. Its `fetch` is fail-closed. The full audit was launched with an allowlisted child environment (OS essentials, fixed test/timezone values; no production credentials/proxies inherited).

The deterministic scan checks common email/phone/employee-ID/national-ID/passport/UUID/IBAN/account forms, URL/connection/internal-host/path forms, API-key/token/password/private-key/opaque-value patterns, concrete and some spelled monetary assertions, address patterns, medical/disciplinary terminology, date formats and record-shaped attendance/leave assertions. Arabic/Persian digits are folded for matching; text itself is never rewritten. Broad bilingual name-context patterns identify candidates separately from verified identities. An audit-only functional-word vocabulary distinguishes some generic wording from residual candidates; it never affects routing.

### Scan results (row counts)

| Category | Matches | Interpretation |
|---|---:|---|
| Email / phone | 0 / 0 | No recognizable literal contact values |
| Employee ID / national ID / passport / UUID | 0 / 0 / 0 / 0 | Corpus `HR_#####` row IDs are not employee identifiers; other values were checked too |
| IBAN / bank account | 0 / 0 | No recognizable values |
| Connection string / URL / internal host-IP-path | 0 / 0 / 0 | No recognizable production URL, local/internal endpoint or connection value |
| API key / token / password-private key | 0 / 0 / 0 | No recognizable literal credential values |
| Credential-topic wording / long opaque value | 0 / 0 | Additional broad checks also negative |
| Concrete numeric money / spelled-money assertion | 0 / 0 | No detected compensation amounts or these assertion forms |
| Address | 0 | No detected street/address value pattern |
| Medical detail / broad health topic | 0 / 0 | No detected clinical facts or these health terms |
| Record-shaped attendance / leave facts | 0 / 0 | HR query topics are not themselves employee records |
| Disciplinary detail / concrete calendar date | 0 / 0 | No detected detail/date forms |
| Broad person-context heuristic | **497 rows; 236 exact texts; 22 distinct candidate spans** | Not 497 real names or people |

No text contains a Unicode numeric character at all. This supports the negative concrete-number checks; it does not by itself rule out alphabetic identifiers, fully spelled facts or arbitrary secret formats. No explicit placeholder syntax (`<NAME>`, template braces, etc.) was detected. Thus the corpus cannot be certified synthetic merely on a placeholder convention.

### Redacted suspicious-match review

* **417** of the 497 broad candidate rows contain only reviewed generic/functional words in the detected spans (personal/new/current adjectives, employee/record nouns and politeness suffixes). These are heuristic false positives for identity detection.
* **80** rows (**32** unique texts, **9** distinct candidate spans) remain unclassified by that functional-word review. Representation: **`<UNCLASSIFIED_LEXICAL_SPAN_REDACTED>`**. They are **not confirmed person names, real employees or concrete person-specific facts**. A missing dictionary word is not a privacy finding, and a word-list match is not an authorship attestation.
* Representative safe corpus row IDs, one per residual span: `HR_05182`, `HR_08500`, `HR_08447`, `HR_05241`, `HR_05196`, `HR_08475`, `HR_01538`, `HR_01650`, `HR_01622`. The script provides up to 30 safe residual row IDs without the underlying text.
* No concrete person-specific salary, attendance, leave, medical or disciplinary fact was identified by the scan/comparisons. This is a bounded negative finding, not proof that regex/dictionary checks recognize every possible identity or fact.

Static inspection cannot determine whether an ordinary name is a real employee, whether a short generic question came from a real user's conversation, or what data was supplied to an earlier generation process. Case-insensitive names, unusual Arabic morphology, transliteration, context-dependent identifiers, images and unsupported secret forms can evade these detectors. No NER/model/API was used. These limitations are why no VERIFIED SYNTHETIC label is assigned.

## 5. Local project-artifact cross-check

Cross-checks stayed offline and never executed seed/application code or connected to services. `.env`/key/token files, logs, backups, recovery snapshots, caches, binaries, recordings and model contents were excluded from content comparison. There is no exhaustive claim about excluded artifacts or files outside this project.

| Local comparison | Scope | Matching dataset rows |
|---|---|---:|
| Documented demo seed identity names | 26 bilingual name literals from `server/src/db/seed.ts`, compared in memory using normalized whole spans | **0** |
| Demo seed emails | 13 literals | **0** |
| Demo seed employee numbers | 13 literals | **0** |
| Local uploads | Both existing PDF files extracted locally with installed `unpdf`, credentials/network unavailable; filenames/content never printed | **0** exact runtime-text, candidate-person-span or identifier matches |

Both documents were readable: 27,243 bytes and 1,498 extracted characters each. They are treated as potentially sensitive local artifacts, not asserted to be production records or original corpus sources. No OCR, cloud extraction, RAG ingestion, embedding, model request or export was performed. Matching used exact/normalized spans; absence of matches does not rule out paraphrased/translated derivation. Common-name overlap would not prove copying either.

Additionally, **411** other eligible project text/source artifacts were checked for exact runtime text overlap. Seven test/evaluation artifacts contained **10** distinct runtime texts; fourteen application/project-source artifacts contained **16**. These counts are per group and need not be disjoint. Ordinary HR phrases recur in maintained examples/tests; overlap alone proves neither production provenance nor copying direction. Fine-tuning audit reports and the frozen 404 artifact were excluded from this overlap comparison; the frozen artifact was read only for integrity verification.

**Real production-data evidence found: NO within the inspected scope.** Demo seed literals are explicitly demo references and cannot verify the production directory. No live user/employee matching was attempted.

Operational handling note: an early preparatory source excerpt included a hardcoded demo credential outside the runtime dataset. Raw excerpts were then stopped; subsequent comparisons used only counts/redacted output. No credential value is repeated in this report, copied into the audit artifact or used to authenticate. The dataset credential scan is negative. This audit does not claim that the entire project lacks credentials.

## 6. Dataset structure and quality observations

| Item | Verified result |
|---|---|
| Source language tags | English **3,304**; Arabic **3,304**; mixed **3,392**. Arabic tag does not separately certify MSA/Jordanian |
| Actual character-script composition | Latin-only **3,304**; Arabic-only **2,842**; both **3,854**. Technical Latin words in Arabic-tagged text are not automatically a labeling error |
| Source role tags | Admin **3,439**; HR **3,169**; Employee **1,854**; Manager **1,538** |
| Legacy labels | **38**; 36 × 250 rows, `AMBIGUOUS_REQUEST` 600, `OUT_OF_SCOPE` 400 |
| Source category counts | action **2,500**; navigation **2,500**; query **2,000**; safety/clarification **1,000**; report **750**; AI action **750**; help **250**; RAG **250** |
| Parameters | All **10,000** are empty `{}`; no populated extraction gold |
| Confirmation metadata | All **10,000** have `requires_confirmation:false`, even action categories; this is not trustworthy confirmation supervision and is not runtime authority |
| Row IDs | 10,000 unique `HR_#####` values covering 1–10,000, shuffled in physical order; not employee IDs |
| Text lengths | **9–53** characters; no >500-character truncation outlier |
| Normalized cross-label conflicts | **0** exact normalized texts assigned multiple legacy labels |
| Numeric text / placeholder rows | **0 / 0** |
| Replacement / NUL/bidi-control text outliers | **0 / 0** |

The real loader maps **16 legacy query labels** into **11 distinct query intents**: `employeeFile`, `generateReport`, `howDoI`, `knowledge`, `listApplications`, `myAttendance`, `myLeaveBalance`, `myPayslips`, `myRequests`, `outOfScope`, `recruitmentSummary`. The **22 legacy action labels** map into **12 action types**: `addEmployee`, `analyseApplication`, `cancelRequest`, `checkIn`, `checkOut`, `createJob`, `decideRequest`, `generateJobDescription`, `openScreen`, `publishOpening`, `requestLeave`, `updateEmployeeDetails`. In question prompts action examples become `doAction`, giving 12 mapped question-stage intents including that umbrella.

These are corpus subsets, not the application's full 32-intent/48-action registry. Legacy actions cover CV analysis, leave approval/rejection/cancel/request, attendance check-in/out, employee create/update, job creation/publication, JD generation and ten navigation labels. Legacy queries cover attendance, leave status/balance, payslip/salary, employee search/profile, vacancies/ranking, policy/help, three report categories and two safety categories. No new mapping was added.

Large duplication, empty parameters, incomplete ontology coverage and uniform false confirmation flags are experiment-quality limitations. They do not establish privacy provenance. This phase creates no training pairs, split, gold correction or resolver improvement; none of these rows is newly approved for fine-tuning.

## 7. Security decision and finding follow-up

| Question | Decision |
|---|---|
| Provenance investigation result | **PARTIAL:** local ChatGPT download marker + unchanged baseline identity; original source inputs/authorship still unverified |
| Content appears generated/template-based? | **YES, inference only** |
| Proven production-derived data? | **NO evidence found** |
| Verified non-production provenance? | **NO**; host/format/negative scans do not prove the original inputs were non-production |
| Exact security classification (one) | **UNVERIFIED — BLOCKING** |
| Synthetic-only policy satisfied? | **NOT VERIFIED** |
| Specific MEDIUM admission finding | **SEC-06 follow-up: STILL BLOCKING / OPEN**; not mitigated or verified safe |
| Phase 1D recommendation | **NO clearance**, including local/deferred mode, because that path also reads the unchanged corpus |

The broader SEC-06 per-feature egress finding remains open independently. The offline scanner is not a deployed redactor, anonymizer, egress control or provenance mechanism. The other five MEDIUM findings retain their previously documented isolated-scope conditions; no historical finding was silently rewritten or fixed.

**Recommended next evidence:** obtain the original generation instructions/artifact history or an accountable creator attestation tied to this exact SHA-256, establishing that no real HR records, employee identities, user histories, secrets or private documents were inputs, with an independent privacy review of any residual lexical candidates. Review any supplied evidence locally without contacting cloud services. A credible attestation is evidence to assess, not an instruction to accept a synthetic label automatically. If provenance cannot be established, retain the block and make a separately approved target decision; do not sanitize/replace the frozen baseline covertly.

## 8. Reproducibility, security boundary recheck and integrity

Created offline audit script SHA-256:

```text
bbe9f6798d74beb2a19f2d48615be422ee6eadfdb826faa3c70156f4fa3c219b
```

Checks actually executed:

```powershell
node --check docs/fine-tuning/security/runtime-examples-audit.mjs
node docs/fine-tuning/security/runtime-examples-audit.mjs --self-test
node docs/fine-tuning/security/runtime-examples-audit.mjs
node docs/fine-tuning/benchmark/harness/self-test.mjs
node docs/fine-tuning/benchmark/harness/run.mjs --verify
```

The full audit command was launched through a child with a stripped environment; it writes no result/data file. Its **28 detector canary checks PASS**; they are artificial static-pattern controls, not new benchmark/training cases. Node syntax check PASS. Final full scan parsed all 10,000 rows and both documents successfully; an intermediate PDF cleanup problem in the new audit script was fixed before the final comparison. Existing harness **42/42 isolation/self-tests PASS** again. No source change required TypeScript compilation; application tests were not relabeled as newly executed.

| Required security boundary | Reverified result |
|---|---|
| Production DB | **BLOCKED** |
| Production MCP | **BLOCKED** |
| Production RAG | **BLOCKED**; parsing local files for comparison did not invoke RAG |
| Real business writes | **BLOCKED** |
| Production credentials | **EXCLUDED** from isolated children |
| Cloud model calls | **BLOCKED**; no local model generation or metadata call needed in this phase either |
| Frozen benchmark | **UNCHANGED** |
| Historical manifest | **UNCHANGED**, not regenerated |

Frozen benchmark SHA-256:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

Historical baseline manifest SHA-256:

```text
cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47
```

Before/after checks confirm all **408 pre-existing protected source/config/documentation/harness files remain unchanged**, including the Phase 1C decision. The existing two approved HIGH remediation hashes remain accepted by preflight; the other original baseline entries still match. The runtime source and compiled corpus hashes are unchanged. Git was not initialized. Application behavior, prompts, rules, permissions, model/provider configuration, `.env`, database and frontend were not modified.

Only two files were created: this report and `runtime-examples-audit.mjs`. No new training data, redacted replacement corpus, persistent extracted PDF text or benchmark result was created.

**404 benchmark executed: NO (0/404). Production DB/MCP/RAG accessed: NO. External API/model calls: 0. Real writes: 0. Fine-tuning started: NO. CLEARED FOR PHASE 1D: NO.**

Stop after Phase 1C.1.
