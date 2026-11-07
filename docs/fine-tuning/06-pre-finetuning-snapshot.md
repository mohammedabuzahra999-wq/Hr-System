# Pre-fine-tuning baseline snapshot

| Field | Recorded value |
|---|---|
| Current phase | **Pre-Fine-Tuning Baseline** |
| Snapshot ID | `PRE-FT-20261022T112418Z` |
| Snapshot date/time (UTC) | `2026-10-22T11:24:18.150Z` |
| Snapshot date/time (Asia/Riyadh) | `2026-10-22T14:24:18.150+03:00` |
| File capture started (UTC) | `2026-10-22T11:24:17.951Z` |
| Project root | `C:\Users\PC-LAB\Downloads\hr-app-step2` |
| Git | Not initialized; no `.git` directory exists. No Git commands or initialization were performed for this snapshot |
| Current intent count | **32**, re-counted from `shared/src/copilot.ts` |
| Current action count | **48**, re-counted from `server/src/copilot/actions.ts` |
| Existing check/E2E file count | **29** entrypoint files; **2** additional fixture modules, **31** test/fixture files in total |
| Fine-tuning status | **NOT STARTED** in this project workflow; no training dataset created, upload performed, or fine-tuning job run |
| Project files hashed | **381**, including all six existing Phase 0 documents |
| Hash algorithm | SHA-256 over exact file bytes; no newline or encoding normalization of source files |
| Manifest | [pre-finetuning-file-hashes.sha256](pre-finetuning-file-hashes.sha256) |
| Manifest SHA-256 | `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47` |

This records the inspected source/configuration state before fine-tuning. It creates documentation and a hash manifest only. It does not modify application code, prompts, configuration, local routing, permissions, existing datasets, Voice behavior, services, or the database.

## Manifest coverage and exact format

Each manifest line is **project-relative path + one TAB + lowercase SHA-256**, followed by LF. Paths use `/`, are unique and sorted in ordinal ascending order. The file is UTF-8 without BOM, has no header, and ends in LF. Its 381 lines correspond to the 381 hashed files. The manifest hash above is computed from the saved manifest bytes.

| Included source tree / file group | Files |
|---|---:|
| `server/src/` | 143 |
| `hr-app/src/` | 132 |
| `shared/src/` | 24 |
| `server/scripts/` | 10 |
| `server/local-voice/` | 6 |
| `server/drizzle/` | 36 |
| `hr-app/public/` | 1 |
| Explicit root/workspace package/configuration/readme files and six Phase 0 documents | 29 |
| **Total** | **381** |

This covers AI adapters, the Copilot resolver/local rules/intent and action registries, prompt source, shared schemas, RAG/knowledge and MCP, Voice frontend/backend/worker, existing language/benchmark fixtures, checks, migration source, dependency manifests/lockfiles and development/build configuration. Hashing migration SQL/schema metadata does not connect to, read, migrate, or snapshot the database. Drizzle's `meta/*_snapshot.json` files are versioned schema-source metadata, not recovery snapshots.

The explicit standalone project files are:

* Root: `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `render.yaml`.
* Server: `package.json`, `tsconfig.json`, `drizzle.config.ts`, `README.dev.md`.
* Frontend: `package.json`, `package-lock.json`, `tsconfig.app.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `capacitor.config.ts`, `.oxlintrc.json`, `index.html`, `.gitignore`, `README.md`.
* Shared: `package.json`, `tsconfig.json`, `tsconfig.build.json`.
* Documentation: the six Phase 0 files verified below.

Excluded from selection: dependencies (`node_modules`), build/dist/Android build outputs, coverage, generated maps/build caches, logs, temporary/editor files, Python bytecode/caches, uploads/business records, backups, `.codex-snapshots`, recovery snapshots, local development/runtime/model directories, credential/secret files, keys/certificates/keystores/tokens, and **all `.env*` files, including example/production example files**. Native Android project files outside the listed trees are not in scope. Existing generated benchmark/performance reports at the server root are not source files and are not included. No symbolic links were followed (0 encountered in the selected trees).

Neither this document nor the manifest is an entry in the manifest: that avoids self-referential hashes. The six preceding Phase 0 documents are included and can be verified byte-for-byte. No secret file or `.env` file was hashed or copied. Only an allowlisted non-secret configuration summary and secret-presence booleans were read in memory for the section below.

## Current AI/model configuration

These values describe the saved development configuration and inspected defaults. They do not attest to configuration already loaded into every running process or to provider/model availability; no service, database or inference request was made.

| Setting | Snapshot observation |
|---|---|
| `NODE_ENV` | `development` |
| `AI_PROVIDER` | `ollama` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `qwen3:4b` |
| `OPENAI_MODEL` | `gpt-5.4` configured; OpenAI API key absent/blank |
| `OPENAI_EMBEDDING_MODEL` | Unset; inspected schema default `text-embedding-3-small` |
| `AI_SHARE_DATA` | Unset; inspected schema default `true` |
| OpenAI / Anthropic API key presence | Both absent/blank; no secret values recorded |
| OpenRouter | Benchmark-only; key present, configured model `nvidia/nemotron-3.5-super-vl:free`; not a production provider |
| `VOICE_PROVIDER` | Unset; current development default `local` (production default is `openai`) |
| `LOCAL_VOICE_URL` | Unset; inspected default `http://127.0.0.1:8766` |
| `VOICE_ENABLED` / `VOICE_SHARE_AUDIO` | Both `true` |
| `VOICE_DEV_MOCK` | `true`; separate development-only adapter, not the real microphone path |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1`; preserved alternate audio path, not local Voice inference |
| `OPENAI_VOICE_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` |
| `OPENAI_REALTIME_VOICE` | Unset; inspected default `marin` |
| `VOICE_REALTIME_TRANSPORT` | `ephemeral` |

Local worker defaults in source are Whisper.cpp `ggml-small-q5_1.bin`, 4 CPU threads, language auto-detection, and Piper `ar_JO-kareem-low` / `en_US-lessac-low`. Worker override variables are unset in the saved server environment file; the launcher can also inherit allowlisted process-environment overrides, which were not queried from a running worker. Installed model binaries are excluded, so their bytes/availability are not attested by this source manifest.

Configuration definitions and provider behavior are captured through `server/src/env.ts`, `server/src/ai/structuredProvider.ts`, `server/src/ai/ollama.ts`, `server/src/voice/realtime.ts`, the worker/launcher and frontend Voice source. The actual `.env` values are intentionally outside the hash baseline.

## Current resolver architecture

Authenticated request -> request validation/rate limiting -> conservative terminal preflight -> pending-task/context handling -> deterministic reads, phrasebook, maintained help, training/exact matches and accepted routing memory -> unresolved `resolveQuestion()` -> explicitly selected structured-generation provider -> candidate `CopilotPlan` -> shared Zod/semantic validation and revalidation after rewrites -> `mayAsk()` -> record scope -> existing service/executor/database query.

The current prompt version string is `COPILOT_PROMPT_VERSION = 2026-10-11.1`. Exact resolver, prompt, schema, rules and example bytes are in the manifest; the version string alone is not an exact prompt fingerprint because the request also depends on role, selected examples and previous plan.

Named-person payroll/overtime uses `employeeFile` + `reportType: payroll` and extracted name/employee number; general/company payroll uses existing `payrollInsights`. The model does not author SQL or learn an employee's payroll facts as part of classification. Question provider selection does not migrate every AI feature: action resolution, task continuation, result/report wording, guide prose and other feature calls retain their current provider-specific implementation. There is no automatic Ollama-to-OpenAI provider fallback.

Actions follow the separate `doAction` -> action plan -> `mayDo()`/proposal -> clarification/choice/confirmation -> `runAction()`/existing authenticated API path. Existing UI/navigation exceptions remain unchanged. Deterministic terminal outcomes stop before legacy action/RAG/model fallback and do not execute an HR plan. MCP is a separate stdio entry point and does not uniformly apply the HTTP terminal/shared semantic path.

This snapshot preserves existing limitations as well as behavior. In particular, the Phase 0 report subtype scope finding, sharing/retention concerns and MCP parity gaps are **not fixed** by this snapshot. See [architecture](02-current-ai-architecture.md) and [privacy audit](03-privacy-and-pii-audit.md); this document does not claim that hashing source proves authorization safety.

## Current Voice architecture

The selected development default is the local hands-free pipeline:

Browser microphone -> AudioWorklet/energy VAD and end-of-turn WAV -> authenticated owned local STT endpoint -> loopback Python worker/resident Whisper.cpp -> final transcript -> owned Voice turn endpoint -> existing trusted Copilot classification/validation/RBAC/services (or maintained safe navigation/scroll/active-choice handling) -> structured on-screen answer and short trusted spoken text -> owned local TTS endpoint -> loopback Piper WAV -> browser speaker, then listening resumes.

Local audio uses authenticated HTTP, one admitted worker operation with bounded queueing and existing timeouts; it has no automatic cloud audio fallback. Protected actions retain server-created proposals, review/exact spoken confirmation and user-bound execution deduplication. Browser dictation in the text input is a separate SpeechRecognition mechanism.

The preserved alternate OpenAI Voice path uses WebRTC audio/data-channel events, Realtime transcription and supplied response speech; tools are disabled, and final transcripts still return to the HR backend. Text and Voice providers are independent. The development mock injects typed final transcripts and bypasses real capture/STT/Realtime audio; it is not evidence of microphone accuracy or live spoken-response performance. No audio service, microphone or live model was tested for this snapshot.

## Dataset observations carried forward from Phase 0

| Observation | Value / status |
|---|---|
| Existing runtime JSONL | `server/src/copilot/data/hr_agent_intents_10000.jsonl`; hashed in place, not copied or modified |
| Nonempty rows | 10,000; aggregate count rechecked |
| Source labels | 38 legacy labels, mapped to current intents/actions; rechecked |
| Distinct exact text values | 3,440; 6,560 repeated rows; rechecked |
| Non-empty `parameters` objects | 0; rechecked |
| Phase 0 loader statistics | 10,000 usable / 0 skipped; historical observation, not re-imported here |
| Phase 0 phrasebook / conversation observations | 193 expanded phrasebook entries; 443 conversation turns (426 question + 17 continuation) |
| Existing corpus / benchmark | 122 handwritten role-aware corpus rows; 33 provider fixtures, historically 26 model cases + 7 exclusions/controls |
| Saved historical hybrid partition | 18 local plans + 8 terminal outcomes across the historical 26 cases; not a new evaluation or general traffic estimate |
| Training readiness | Not an approved fine-tuning dataset; entity labels, duplicate-family splits, provenance and anonymization still require review |
| Fine-tuning dataset / jobs | **None created or started in this workflow** |

Raw employee records, salaries, HR documents, real conversations, recordings and secrets were not exported into this snapshot. The proposed future evaluation and anonymization strategy remain documentation only; existing runtime language assets were neither expanded nor relabeled.

## Verification of existing Phase 0 documents

All six were present and nonempty before capture, are included in the manifest, and were not modified:

1. [00-current-system-baseline.md](00-current-system-baseline.md)
2. [01-intent-inventory.md](01-intent-inventory.md)
3. [02-current-ai-architecture.md](02-current-ai-architecture.md)
4. [03-privacy-and-pii-audit.md](03-privacy-and-pii-audit.md)
5. [04-baseline-benchmark-plan.md](04-baseline-benchmark-plan.md)
6. [05-fine-tuning-experiment-log.md](05-fine-tuning-experiment-log.md)

The 29 check/E2E entrypoint files and two fixture modules were counted by filename in the selected source trees, using the same Phase 0 discovery categories (`*.check.ts`, `*.check.mjs`, `*.e2e.ts`, `checkLocalVoice*.mjs`, `*_check.py`, and the two named fixture modules). This is not a count of runtime assertions. No test suite was rerun because this task changes no application code or behavior.

## Read-only verification recipe (PowerShell)

This validates the manifest against the pinned hash, then checks every listed file. Run from any working directory; change the project root only if the unchanged project has been moved.

```powershell
$projectRoot = 'C:\Users\PC-LAB\Downloads\hr-app-step2'
$manifestPath = Join-Path $projectRoot 'docs\fine-tuning\pre-finetuning-file-hashes.sha256'
$expectedManifestHash = 'cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47'
$actualManifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualManifestHash -ne $expectedManifestHash) { throw 'Manifest hash mismatch' }

$lines = @(Get-Content -LiteralPath $manifestPath -Encoding UTF8)
if ($lines.Count -ne 381) { throw 'Unexpected manifest entry count' }
$rootPrefix = [IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
$seen = @{}
foreach ($line in $lines) {
    $parts = $line.Split([char]9)
    if ($parts.Count -ne 2 -or $parts[1] -cnotmatch '^[0-9a-f]{64}$') { throw 'Invalid manifest entry' }
    $relative = $parts[0]
    if ([IO.Path]::IsPathRooted($relative) -or $seen.ContainsKey($relative)) { throw 'Invalid or duplicate path' }
    $seen[$relative] = $true
    $fullPath = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside project' }
    $actual = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    if ($actual -ne $parts[1]) { throw "File mismatch: $relative" }
}
'PASS: manifest and all 381 listed file hashes match.'
```

New files are not represented by old entries: future comparisons must also enumerate the documented source/configuration scope and report added files separately. This is a content fingerprint, not a backup of file contents, a signed/timestamp-authority attestation, a database snapshot, or evidence about excluded secret/model/runtime files. Preserve the manifest hash independently (it is also reported in the completion response).

## Changes and completion checks

Files created:

* `docs/fine-tuning/06-pre-finetuning-snapshot.md`
* `docs/fine-tuning/pre-finetuning-file-hashes.sha256`

Existing files modified: **none**. Completion verification re-read every manifest entry, checked the selected file set for additions/removals, verified all six Phase 0 documents, and confirmed no `.git` directory was created. Environment files were excluded from hashing and were not written. No database, authentication, MCP, AI/audio model or fine-tuning call was performed. **Fine-tuning has NOT started.**
