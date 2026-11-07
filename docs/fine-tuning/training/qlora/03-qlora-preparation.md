# QLoRA procedure preparation — no training execution

## Fixed base and experiment boundary

Use only `Qwen/Qwen3-4B-Thinking-2507`, immutable revision `768f209d9ea81521153ed38c47d515654e938aea`, for both trainable weights and tokenizer. Load the original BF16 Safetensors checkpoint into a future 4-bit NF4 training runtime. The accepted provenance limitation in `01-owner-decision.md` remains disclosed; no stronger GGUF ancestry is claimed.

QLoRA's NF4 training representation and Ollama's Q4_K_M GGUF runtime representation are different formats. Do not train the installed GGUF, relabel NF4 as Q4_K_M, or use the runtime quantized artifact as the original trainable checkpoint. The future adapter must record the exact upstream revision and weight hashes.

The supervised objective is the classifier response only. Fine-tuning does not replace deterministic routing, terminal outcomes, Zod/semantic validation, mayAsk(), record scope, payroll restrictions, services or action confirmation. It does not train resolveAction(), continueTask(), phraseAnswer(), knowledgeReply(), tools, Voice or factual HR answering. Improvements to those downstream paths are outside this experiment's claim.

## Tokenization and thinking-mode seam

The [pinned official model card](https://huggingface.co/Qwen/Qwen3-4B-Thinking-2507/blob/768f209d9ea81521153ed38c47d515654e938aea/README.md) describes a thinking-only release. Its tokenizer's Jinja template opens a thinking block for generation; the installed Ollama runtime executes its own Go template. Existing BEFORE `think:false` and `/no_think` controls remain unchanged evidence, not proof that this upstream release has a supported non-thinking switch.

Keep assistant target content as the existing JSON plan, with **no authored reasoning trace**. The pinned Jinja template can render empty reasoning delimiters around a final assistant response. Before any training, qualify the exact serialized prompt/completion boundary: render the prompt and the complete conversation with the same pinned tokenizer; compare token prefixes; inspect delimiter/EOS placement; and prove exactly which completion tokens receive loss. Do not silently add another `<think>` opening, drop a closing delimiter, or put reasoning tags inside the plan JSON. Adapting this checkpoint toward short structured responses is an experiment objective, not an already measured capability.

Use completion-only supervised loss, with prompt/system/reference/context tokens masked to `-100`. A conversational prompt–completion dataset is supported by [TRL's versioned SFT documentation](https://huggingface.co/docs/trl/v0.28.0/en/sft_trainer). The trainer must preserve the qualified template and explicitly verify masks. Do not assume `assistant_only_loss=True` works with the unmodified pinned template: generation-mask support depends on the template/trainer. No automatic template replacement or helper patch is accepted without checking serialized equivalence and recording its identity. A pre-tokenized export with explicit masks is an alternative only if needed after that qualification.

Tokenize once with the pinned template; avoid duplicated special tokens. Preserve EOS `<|im_end|>` (ID 151645), pad `<|endoftext|>` (ID 151643), and the original vocabulary. Do not add task/terminal tokens. Measure actual token lengths before selecting a training sequence budget; retain the BEFORE effective 8192-token context as the compatibility target. Quarantine overlength examples rather than truncating a JSON target. Packing stays off for the first experiment to simplify mask and episode auditing.

## Draft training recipe for a later authorized stage

The following is a proposed initial recipe, **not installed, executed or represented as hardware-validated**:

| Setting | Proposed preparation value |
| --- | --- |
| Method | SFT with PEFT LoRA, frozen base weights |
| Training quantization | 4-bit NF4, double quantization |
| Compute | BF16 only after verifying device support |
| Adapter rank / alpha / dropout | 16 / 32 / 0.05 |
| Target projections | q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj |
| Embeddings / output head | Keep frozen; no vocabulary changes |
| Initial learning rate / schedule | 1e-4 / cosine, warmup ratio 0.03 |
| Maximum epochs | 3; select on new dev complete-plan performance and loss, never F404 or S160 |
| Microbatch / gradient accumulation | 1 / 16; gradient checkpointing enabled |
| Gradient clipping | 1.0 |
| Packing | Disabled initially |
| Loss | Completion-only, explicitly audited token masks |
| Random seed | Proposed 42; freeze in the future run manifest before training |
| Logging / upload | Local aggregate metrics; no W&B/Hub upload or prompt/record logging |

The seven target projection names must be checked against the pinned checkpoint's tensor index and loaded module graph before attaching the adapter. They are not arbitrary modules to be inferred from another Qwen variant.

Use the standard k-bit model preparation step before attaching LoRA. NF4, double quantization and k-bit preparation are documented by the [official PEFT quantization guide](https://huggingface.co/docs/peft/developer_guides/quantization). The recipe values above are engineering proposals for this experiment, not performance guarantees or values tuned against BEFORE failures.

## Environment and readiness

Observed Windows host: Intel i5-8250U, eight logical processors, approximately 20 GiB RAM; the project owner reports CPU-only use. NVIDIA CLI was not found on PATH, and CIM device inventory was denied by the sandbox. No independent CUDA-capability certification is claimed. No dependency, driver, GPU service, weight or training runtime was installed.

A practical training environment still needs to be selected and verified. Plan a supported GPU runtime with enough memory for the chosen sequence length; 16–24 GiB GPU memory is a planning estimate rather than a measured minimum, and 8192-token training may require more memory or a lower microbatch. Do not launch a long CPU training job on this machine under the label of a ready GPU QLoRA environment. Provisioning is a later decision, not a blocker to preparing the dataset design now.

Before a future run, lock the actual Python, PyTorch, CUDA, Transformers, PEFT, TRL, bitsandbytes, datasets and tokenizer versions, wheel/environment hashes, device identity and memory checks. Use `trust_remote_code=False`, local-only reporting and bounded local data paths. Validate the pinned tokenizer, target modules, adapter-only trainable parameters and loss masks without a training step. The current preparation does not create an executable trainer or a requirements lock it has not tested.

## Later artifact and evaluation plan

After separately authorized training, preserve adapter weights/config, base/tokenizer revision and hashes, data/split/export manifests, seed, hyperparameters, environment, dev metrics and selected-checkpoint justification. Any local internal-test measurement uses the new held-out split, never an adaptive F404 loop.

The eventual AFTER conversion would merge the adapter into the accepted original checkpoint at appropriate precision, then use pinned conversion/quantization tools to produce Q4_K_M GGUF. Capture a new artifact hash and isolated Ollama tag; do not overwrite the official BEFORE tag/artifact. Same quantization class does not imply identical quantization bytes or bit-level conversion lineage. Keep the approved inference profile, prompt, runtime reference asset, schemas, local rules, services and frozen F404 unchanged for the eventual separately authorized comparison.

**This stage performs none of training, checkpoint download, merge, quantization, model import or evaluation. The frozen 404 is not rerun.**
