# CEB candidate eligibility policy 1.0.0

Frozen before any candidate score. No winner or candidate admission is made in Phase 1D.0. **qwen3:4b remains CANDIDATE ONLY.** Existing installation and historical timing are not evidence of current training compatibility. No model was queried or downloaded in this phase.

At most three candidates may be registered, in the small CPU track: no more than 4 billion parameters, local Ollama, Q4_K_M, native JSON Schema, and identical supported inference options from the run contract. A different quantization/runtime/settings class needs a separately frozen track before any score; never silently compare it as equivalent. Do not run larger models just to fill a shortlist.

Each candidate needs a byte-bound identity record **before** execution:

| Required field | Evidence |
|---|---|
| Family, exact tag/version, parameter size | Exact installed manifest/config, no floating alias as sole identity |
| Inference artifact | Full content digest, quantization, model/template/tokenizer identities and export chain |
| Runtime | Ollama version and binary/build SHA-256; common hardware/environment capture |
| Trainable source | Original checkpoint repository, immutable revision and weights-file manifest hash; GGUF installation alone is insufficient |
| License | SPDX/precise terms plus authoritative evidence file/hash and verified rights for the intended adaptation/deployment |
| Adaptation | Verified fine-tuning or controlled-adaptation method/toolchain, support evidence and export/conversion recipe SHA-256 |
| Privacy | Local=true, cloud=false; no remote execution, production credentials or undisclosed telemetry |
| Compatibility | Native schema support, supported common options/seed and verified non-thinking policy; fixed generic smoke controls only in a later authorized phase |

The executable `assertCandidate()` requires all these fields and verification flags, plus `status=APPROVED_FOR_CONTROLLED_SELECTION`. A statement in a JSON file is not a signature or proof by itself: the custodian must inspect the bound evidence and pin its hash in the candidate run manifest. No such approved record is fabricated here.

The common track uses seed 42. A candidate without seed support is ineligible for this track; record support accurately and propose a separate track before scores rather than silently omitting settings. Seeds do not establish bit-level determinism across different architectures. All candidates receive the same captured role-specific shared prompt, R retrieval and S input. The existing Qwen3 non-thinking family control is transport/template behavior only; no candidate-specific HR examples/instructions or prompt tuning are permitted. Family control is recorded explicitly rather than guessed from a derivative tag.

Current candidate inventory contains **no newly verified/admitted candidates**. Historical qwen3 identity is historical evidence only. Candidate identity/license/checkpoint/export admission and final execution-run instantiation remain mandatory before calls; this phase freezes their requirements and validates the contract with unmistakably synthetic canaries.

No F input/gold/result or old 10K example is permitted for choosing candidates, compatibility adjustments or selection. No training release, official BEFORE, fine-tuning or production approval follows from eligibility.
