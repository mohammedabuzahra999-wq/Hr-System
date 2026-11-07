# Phase 0: current system baseline

Audit date: 2026-10-22. Experiment: `FT-P0-20261022`. Scope: repository inspection and documentation only. No training, new dataset, model benchmark, provider request, database query, migration, or application change was performed for this audit.

## Read this first

The system already separates language interpretation from HR facts. A classifier produces a closed `CopilotPlan`; application code validates it, checks the authenticated role, resolves record scope, and queries existing services. Payroll amounts are database results, not facts a classifier should learn.

The actual labels are **32 Copilot intents** and **48 action subtypes**, not the illustrative `get_employee_payroll` label in the request. A named employee's payroll/overtime read is `employeeFile` with `reportType: payroll`, `personName` or `employeeNumber`, and the requested supported period. `lastMonth` is the existing period name. Introducing a different training vocabulary would need a separately reviewed mapping; none was added.

Repository evidence does **not** establish universal scope safety. In particular, the report builder has a static scope gap described below. Fine-tuning must not be used to compensate for server authorization gaps.

## Documentation map

| Document | Contents |
|---|---|
| [Intent inventory](01-intent-inventory.md) | Every intent; fields, execution, permissions, routing, and clarification; action subtype appendix |
| [Current architecture](02-current-ai-architecture.md) | Text, local/model selection, Voice, RAG, MCP, context, errors and confirmation |
| [Privacy and PII audit](03-privacy-and-pii-audit.md) | Actual data transmission/storage paths and proposed future anonymization |
| [Benchmark plan and test inventory](04-baseline-benchmark-plan.md) | Existing checks, limitations, missing coverage, proposed frozen evaluation |
| [Experiment log](05-fine-tuning-experiment-log.md) | Configuration presence, versions, hashes, counts, evidence and audit limitations |

## Current configuration snapshot

Read only selected non-secret fields and secret-presence booleans from the saved `server/.env`; never copied the file or a key. These describe saved configuration plus schema defaults, **not attestation of every already-running process**.

| Setting | Observed / effective default |
|---|---|
| `AI_PROVIDER` | `ollama` |
| `OLLAMA_MODEL` | `qwen3:4b` |
| `OPENAI_MODEL` | `gpt-5.4`, configured but no OpenAI key present |
| `OPENAI_API_KEY` | Absent/blank |
| `ANTHROPIC_API_KEY` | Absent/blank |
| OpenRouter key | Present; benchmark-only path, not a production provider |
| `AI_SHARE_DATA` | Unset; schema default `true` |
| `VOICE_PROVIDER` | Unset; default `local` outside production, `openai` in production |
| `VOICE_ENABLED` / `VOICE_SHARE_AUDIO` | Both `true` |
| `VOICE_DEV_MOCK` | `true`; separately blocked in production |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1`; not active local speech inference |
| `VOICE_REALTIME_TRANSPORT` | `ephemeral`; relevant to the OpenAI audio path only |
| Embedding model | Unset; default `text-embedding-3-small` |

Source: [env.ts](../../server/src/env.ts), [structuredProvider.ts](../../server/src/ai/structuredProvider.ts), [useVoiceProvider.ts](../../hr-app/src/features/copilot/useVoiceProvider.ts). No provider connectivity or model availability was tested in this audit.

## Inventory counts and provenance

| Item | Count | Meaning |
|---|---:|---|
| Runtime intents | 32 | `copilotIntentSchema`, also explicitly role-gated in `INTENT_ROLES` |
| Runtime actions | 48 | `ACTION_CAPABILITY`; second-stage `doAction` subtypes |
| Existing JSONL language rows | 10,000 | Existing file only; no new training data created |
| Distinct source labels in JSONL | 38 | Legacy labels mapped by `training.ts`, not the runtime intent enum |
| Usable / skipped source rows | 10,000 / 0 | Existing loader's read-only module statistics |
| Distinct exact source texts | 3,440 | 6,560 repeated texts; split leakage risk |
| Source rows with non-empty `parameters` | 0 | The file is not an entity-extraction gold dataset |
| Phrasebook entries | 193 | Expanded `PHRASEBOOK_ENTRIES`; lookup/prefix rules also exist |
| Conversation examples | 443 | 426 question turns + 17 continuation turns |
| Handwritten role-aware corpus | 122 | `CORPUS` cases; not 122 complete-plan/E2E assertions |
| Existing benchmark fixtures | 33 | Historical 26 model cases + 7 former exclusions/controls |
| Check/E2E entrypoint files | 29 | Static inventory; plus 2 fixture modules, 31 files total |

Counts were obtained by source inspection, aggregate file parsing, and importing pure local routing modules. No employee directory or production records were read. Arabic/Latin character counts in the JSONL are not language-quality or mixed-language accuracy measurements.

## Current local versus model behavior

The saved [Phase 3D coverage artifact](../../server/hybrid-phase3d-coverage.json) reports the historical 26-case slice as:

| Outcome | Count |
|---|---:|
| Resolved local plans | 18 |
| Unsupported capability | 2 |
| Clarification required | 3 |
| Deterministic out of scope | 3 |
| Unresolved | 0 |
| Incorrect local plans | 0 |

This is **historical, fixture-specific offline evidence**, not current general-traffic coverage or fresh model accuracy. The eight terminal outcomes are server routing decisions separate from executable plans. They do not mean the underlying unsupported data filters now work. Context can deliberately disable terminal handling. The normal provider capture benchmark starts inside `resolveQuestion()` and does not alone measure the HTTP terminal preflight.

## Arabic and English findings

Code supports English, Arabic, Jordanian vocabulary and selected mixed constructions through Unicode normalization, maintained patterns, phrasebook/training examples and model prompts. This does not imply equal coverage or accuracy across dialects.

Read-only probes of the five supplied self-service examples, with role `employee` and **no pending task, previous plan, or UI context**, gave:

| Supplied wording | Current preflight result |
|---|---|
| `كم راتبي الشهر الماضي؟` | Unresolved; strict read rule abstains |
| `ورجيني راتبي الشهر الماضي` | `unsupportedCapability / payslip_period_unsupported` |
| `Show my salary last month` | Same unsupported-period outcome |
| `بدي payslip تبعي` | Unresolved; strict read rule abstains |
| `Show attendance تبعي last month` | `myAttendance`, `period: lastMonth`, rule `self_attendance` |

These are pure preflight observations, not end-to-end model results. Unresolved cases enter the remaining pipeline; no model was called. The differing Arabic salary paraphrases expose a terminal-language coverage gap. The current `myPayslips` executor returns six recent payslips and does not honor a period, so a fine-tuned classifier alone cannot make period-specific self-pay answers correct.

Other limitations: `lastWeek`/yesterday and arbitrary ranges have no corresponding current period enum; person parsing conservatively rejects uncertain ownership/conjunctions; transliteration between Arabic and English names is not a general identity-resolution service. Some Arabic literals in `perform.ts` contain apparent mojibake even when read as UTF-8. They need separate UI/encoding verification, not normalization into future training labels.

## Findings requiring attention before a training experiment

1. **Report-scope gap, high priority:** `myReport` is allowed for every role, and `generateReport` for managers. `buildReport()` calculates self/team scope but `recruitment` and `department` branches call global builders and label their result whole company. `validateCopilotPlan()` does not prohibit these report-type/scope combinations. A narrow intent gate is insufficient for those branches. This is a static control-flow finding; no live data exposure was attempted.
2. **Raw text retention:** unanswered questions and normalized routing memory can contain names, pay, contact or medical details typed by users. They are not anonymous training sources.
3. **Sharing is not a universal privacy switch:** `AI_SHARE_DATA` gates several result/CV/RAG operations, but classification sends user text; interview generation/evaluation and job-description embedding paths do not consistently read that flag. Missing keys currently stop those OpenAI calls, not a universal redaction layer.
4. **MCP is not identical to HTTP Copilot:** typed read tools build plans and call `executeIntent()` directly; the HTTP terminal preflight and shared semantic boundary are not applied there. Special report/knowledge/help branches also live in the HTTP route, not the generic executor. This needs independent coverage, not assumptions of parity.
5. **Dataset limitations:** repeated texts, legacy label mappings, empty entity parameters, and runtime use of examples mean the existing files cannot simply be split randomly and called unseen fine-tuning evidence.

## Audit execution and limits

No existing test suite or live Voice/model benchmark was rerun. This preserves the documentation-only scope and avoids test scripts that write reports outside this directory, authenticate, or issue API/database requests. Existing test results are identified as historical evidence, not new PASS claims. One pure-module count command hit the known sandbox `tsx` OS-user lookup error; the same read-only command succeeded with the permitted execution context. Git reports that this checkout is not a repository; source SHA-256 fingerprints are recorded instead of inventing a commit.

Only the six Markdown files in this directory were created. Application/source/configuration hashes are checked for equality at audit completion. No model was trained; no facts about any employee were exported or included here.
