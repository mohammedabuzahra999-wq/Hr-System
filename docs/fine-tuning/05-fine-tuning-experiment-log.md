# Fine-tuning experiment log

This log records a documentation baseline only. It must never contain credentials, employee records, raw production conversations, voice recordings or reversible identity mappings.

## FT-P0-20261022: repository baseline audit

| Field | Recorded value |
|---|---|
| Date / local context | 2026-10-22, Asia/Riyadh |
| Experiment ID | `FT-P0-20261022` |
| Phase | 0: pre-fine-tuning documentation and baseline analysis |
| Git commit/hash | Unavailable: `git rev-parse` reports no Git repository in this checkout or its parents. No commit was invented/created |
| Current selected text provider/model | Saved `AI_PROVIDER=ollama`, `OLLAMA_MODEL=qwen3:4b`; no inference/connectivity verification in this phase |
| Other configured text model | `OPENAI_MODEL=gpt-5.4`; OpenAI key absent/blank; other call sites retain their existing selection logic |
| Current audio | Saved Voice provider unset; development default local Whisper.cpp small-q5_1 + Piper Arabic/English; production default differs. No audio service or hardware test performed here |
| Prompt version | `COPILOT_PROMPT_VERSION = 2026-10-11.1`; exact file fingerprint below also records later changes not captured by the version string |
| Resolver version | No independent numeric resolver version; fingerprint `resolve.ts`, routing/rules/training/schema files together |
| Current intent count | 32; role registry and shared enum |
| Current action count | 48; action capability registry |
| Current test count | 29 discovered check/E2E entrypoint files, plus 2 fixture modules; runner self-test mode separately. No unified assertion/test-case count claimed |
| Existing fixture counts | 122 handwritten corpus rows; 33 provider benchmark fixtures; 443 conversation example turns; 6 Voice transcript evaluation fixtures |
| Existing language asset | 10000 JSONL rows, 38 legacy labels, 3440 unique exact texts, 0 non-empty parameter objects; current loader usable/skipped = 10000/0 |
| Phrasebook count | 193 expanded entries |
| Dataset version for fine-tuning | **Not created / not assigned**. Existing runtime JSONL fingerprint recorded for provenance only; not approved for fine-tuning |
| Baseline benchmark version | Existing historical fixtures only; proposed independent frozen evaluation in document 04 is **not created or executed** |
| Changes made | Created the six Markdown documents in this directory only |
| Model training/results | No fine-tuning job, upload or model evaluation performed; new accuracy/latency results: not measured |
| Pure local observations | Existing module counts and five supplied language examples inspected without provider/network/database calls |
| Privacy status | No real HR records, prompts, logs or transcripts exported; only configuration presence/non-secret values and aggregate source statistics inspected |
| Important findings | Report subtype scope gap; raw-question retention; inconsistent sharing-flag coverage; MCP/HTTP validation parity gaps; existing entity-label and duplicate-split limitations |
| Notes | Do not treat saved historical fixture success as current unseen-model accuracy or a claim of universal authorization safety |

## Source fingerprints

SHA-256 of the inspected files, before documentation changes. These are source fingerprints, not Git commits or hashes of secret values. Dynamic prompt content also depends on actor role, selected examples and previous plan; the prompt version string alone is insufficient.

| Repository path | SHA-256 |
|---|---|
| `server/src/routes/copilot.ts` | `65f3988cff65af67e6b8a1c9e5371e5f071937590a6281236d148bea38fecf8a` |
| `server/src/copilot/resolve.ts` | `830292e0d09a9da626fbf83bd9a2e62d8edf687eb678c2667aabc3f97d20c90a` |
| `server/src/copilot/readRules.ts` | `d50d48cec428589c6ef8c156cdc002d2b67dfe00f28d00dded32e7ca9723158a` |
| `server/src/copilot/routingOutcome.ts` | `35510836fe3506f6c5e65e7a5eb256e487d69976d6794ea4696fe1495fdce377` |
| `server/src/copilot/training.ts` | `cf56c42ccfad1bee56317adcd2b3a09dfbb5c6eafafe2e314865d48af4bbee07` |
| `server/src/copilot/phrasebook.ts` | `96970fbbcbb75ff0d21a8a2b65893ab56674821cb06ad297baef4cc12ebf8a7b` |
| `server/src/copilot/validatePlan.ts` | `c8668f81f35074ba393206906b08b22852fcbbbdb94b16f8b1416fd288512719` |
| `shared/src/copilot.ts` | `9956b4cf95579b20c2769e9906ccf1e9804644e2ac7df4708001b0cfda25e27e` |
| `server/src/routes/voice.ts` | `234b8d7f9320cad496772b0b9ca2daf8d9100033b234d9254c41090659d2d66d` |
| `server/src/voice/realtime.ts` | `6fbf3ae3bc3c34f8ee0efab8f517a5b5b1855005bb6b469ebe54c4a03fd1d9b9` |
| `hr-app/src/features/copilot/useLocalVoiceCopilot.ts` | `40739988a9d4a6b0ec84f58e4a4e85d0bbeabf81ac4aa5904efac8efef5ecb5d` |
| `server/src/copilot/benchmark/cases.ts` | `e30d88c4957e5689e03f206077a39cdf55aa47e9f1d4d0924e8154fa94ab769f` |
| `server/src/copilot/data/hr_agent_intents_10000.jsonl` | `1fc3665f36b2b1814fdebe248ce46709a5dbdc7058d728620adc0ebf9b3fdb9b` |

## Verification ledger

| Check | Result / scope |
|---|---|
| Registry/data/test discovery | Completed by read-only parsing; all intent/action names inventoried |
| Pure module statistics | Completed; no environment/database/provider module invoked for those counts |
| Five supplied language probes | Completed at pure deterministic preflight only; results in document 00 |
| Git provenance | Not available in this workspace; source fingerprints substituted |
| First sandbox `tsx` count command | Failed with `uv_os_get_passwd` / `ENOMEM` before application module execution; same read-only command succeeded in allowed execution context |
| Existing TypeScript/regression/Voice/benchmark suites | Not rerun in documentation phase; no new application-test PASS claim |
| External provider / live model calls | 0 |
| Database/authentication/MCP calls | 0 |
| Documentation links | 114 relative links checked; 0 broken |
| Inventory completeness | All 32 runtime intents and 48 action subtypes present |
| Application-file equality | SHA-256 comparison of 623 pre-existing files in inspected source/configuration/report trees: 0 changed, 0 added outside `docs/fine-tuning/`; dependencies/build outputs/uploads were excluded |
| Documentation created | Exactly 6 Markdown files under `docs/fine-tuning/` |

## Future experiment record template

For a separately authorized experiment, append date, commit or source fingerprint bundle, experiment ID, dataset version/hash/provenance, frozen test version/hash, actual model/provider/runtime/quantization, prompt/schema/local-router versions, changed components, test population/denominators, intent/entity/complete-plan/language/clarification/safety/reliability/latency results, failures, privacy review and limitations. Leave unavailable values explicitly unavailable. Do not overwrite this baseline when an experiment changes rules/prompts, and do not store personal facts in its notes.
