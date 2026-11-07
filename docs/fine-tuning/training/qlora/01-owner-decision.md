# Owner acceptance of the base-model provenance limitation

Recorded 2026-10-26. Authority: the project owner's current explicit instruction to proceed with the identified upstream release and revision despite the documented conversion-provenance gap.

Trainable base: **`Qwen/Qwen3-4B-Thinking-2507`**.

Model and tokenizer revision: **`768f209d9ea81521153ed38c47d515654e938aea`**.

Official BEFORE runtime remains `qwen3:4b`, serving manifest SHA-256 `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, GGUF SHA-256 `3e4cb14174460404e7a233e531675303b2fbf7749c02f91864fe311ab6344e4f`, Q4_K_M, Ollama 0.40.11. Neither its evidence nor inference configuration is amended.

The owner accepts that the exact Ollama GGUF conversion source revision cannot be cryptographically linked to the upstream snapshot. The 30/30 tokenizer/configuration compatibility checks and official release identification remain the available evidence. **This is an accepted provenance limitation, not a newly verified conversion chain. It is no longer a blocker for this controlled experiment's preparation.**

The earlier [provenance decision](../base-model-provenance/provenance-decision.json), including its historical `NOT VERIFIED` and `safeToPrepareQLoRATraining:false` assessment, is preserved byte-for-byte. This later owner decision supersedes that gate for the requested controlled preparation; it does not rewrite the earlier assessment or claim stronger provenance.

No other base model is selected. In particular, the April Qwen3-4B checkpoint, Instruct-2507, Qwen2.5 and other Qwen variants are not substitutes. The upstream tokenizer class name `Qwen2Tokenizer` does not change this model selection.

The accepted limitation must appear in the eventual dataset manifest, training run manifest and experiment report. The experiment can measure adaptation of this accepted matching upstream release relative to the pinned BEFORE runtime; it cannot claim a fully attested byte-level GGUF-to-Safetensors conversion lineage.

Current authorization: inspect controlled synthetic assets and current contracts; specify the clean training dataset and future QLoRA procedure. **No training is authorized or started now.** No F404 execution, training use of frozen evaluation or historical 10K, real HR data, production change, model download, external upload or deployment occurs in this stage.
