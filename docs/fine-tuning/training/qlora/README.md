# QLoRA preparation

**READY for the next controlled dataset-creation stage. No training dataset has been created, admitted or exported; training is not started and an executable GPU training environment is not yet validated.**

The accepted trainable base is `Qwen/Qwen3-4B-Thinking-2507` at `768f209d9ea81521153ed38c47d515654e938aea`, including its tokenizer. The project owner explicitly accepts the unresolved exact Ollama conversion-revision link. That limitation is recorded without modifying the earlier provenance decision or any official BEFORE evidence.

- [Owner decision and accepted limitation](01-owner-decision.md)
- [Dataset source inspection, coverage, split, format and admission specification](02-dataset-specification.md)
- [QLoRA, tokenization, loss masking and future environment preparation](03-qlora-preparation.md)
- [Machine-readable preparation plan](preparation-plan.json)
- [Fresh offline asset inspection](asset-inspection.json)
- [Current contract catalog and source hashes](current-contract-catalog.json)
- [Environment readiness limits](environment-readiness.json)
- [Final integrity and preparation checks](integrity-verification.json)
- [Evidence hashes](evidence-hashes.sha256)

Recommended dataset: **8,000 independently authored model-contract examples / 2,000 semantic families**, split into **6,400 train, 800 dev and 800 internal test**, balanced across English, MSA Arabic, Jordanian Arabic and mixed Arabic/English. This includes 29 substantive intents, all 48 action categories as question-stage `doAction` boundaries, greeting, refusals and contextual/entity contrasts. Targets remain the complete existing `{plan: CopilotPlan}` contract.

Existing 320-row runtime and 160-row selection assets retain their purpose restrictions and are not training targets or authoring seeds. Fresh inspection revalidated 456 complete question plans and 192 action plans; the remaining 24 selection records are intentional non-executable controls. All 480 records passed the existing static privacy scan with no real PII found. These results do not certify perfect linguistic naturalness or every possible PII form; no independent human review is claimed or made a new blocking gate.

The frozen 404 and historical 10K were not parsed, executed or used as authoring/training sources. Integrity hashing confirms their existing identities. Previous R/S contamination results were inspected, not recomputed or reinterpreted as a future training-dataset clearance. **Preparation contamination: PASS (no training data created; protected material excluded). Future dataset contamination: pending generation and sealed admission checks.**

All preparation artifacts are confined to this directory. No application source, prompt, provider, environment file, database, Voice, RAG/MCP, frontend, official BEFORE result or existing evidence is modified. No model calls, training, downloads, uploads or production data access were performed.

Next step: independently author/generate the specified synthetic corpus under a frozen allowlist/recipe/family split, validate its complete plans, privacy, language/slot coverage and contamination, and freeze an admitted training export. Keep generation and protected-corpus exclusion checking separated. Do not start training as a side effect.
