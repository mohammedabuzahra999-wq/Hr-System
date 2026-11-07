# Verified reconstruction of the official BEFORE source

Created: 2026-11-01 (Asia/Riyadh). This ZIP was assembled today from previously preserved source bytes; it was not created before training.

All 52 application source files listed in the official BEFORE baseline-lock.json match that lock byte for byte. Historical backend source comes from docs/repository/recovery/phase-2d-2-source.zip. Remaining contract files come from current paths only after their bytes match the historical lock.

Scope: the locked evaluation source and its lock/provenance only. This is NOT a complete runnable application backup, database backup, model checkpoint, dependency bundle, or training package. The original evaluation harness, evaluation data, recorded settings and result evidence remain in docs/fine-tuning/before-evaluation/qwen3-4b-v1 and their referenced locations.

Use this source in a separate evaluation workspace with the same locked harness, prompts, scorer, data and runtime conditions for original-versus-tuned comparisons. Preserve the historical BEFORE results. Do not extract over the development application or replace the historical lock with hashes of new application code.

No benchmark or model inference was run to assemble this reference. No training/evaluation data, credentials, .env files, production HR data, or weights are included.
