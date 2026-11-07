# Qwen3 4B / dataset-v2 QLoRA training package

The package is ready for **Colab runtime preflight**. No weights have been downloaded, no forward/backward training pass has run, and no training has started during preparation. Actual CUDA/4-bit kernel compatibility, selective-logit loss parity and VRAM use must pass the supplied GPU preflight in Colab. Local checks do not certify a GPU environment that has not been run.

The base and tokenizer are `Qwen/Qwen3-4B-Thinking-2507` at revision `768f209d9ea81521153ed38c47d515654e938aea`. All three original safetensors shards have pinned published SHA-256 identities. The exact conversion revision linking the BEFORE Ollama GGUF to this checkpoint remains an explicitly owner-accepted provenance limitation. This package does not change or replace BEFORE evidence.

## Included data and boundaries

Only the admitted **6,400 train** and **800 dev** prompt-completion examples are included. Both files are byte-for-byte copies of dataset-v2 exports and are checked against frozen hashes on every invocation. Each split contains all four languages equally. Lineage sidecars link every export line to its admitted record/family/hash, and train/dev families are disjoint.

The **800 internal-test payloads are not included, opened, tokenized, scored, or made selectable by the loader**. Their previously admitted hash/count appear in metadata only. The preparation helper read the original split-index metadata to project train/dev lineage; it did not open the internal-test examples. There is no internal-test evaluation command. Request a separate post-training test stage when training is complete.

No frozen 404, dataset-v1, historical 10K, production HR data, database connection, MCP, RAG documents, application `.env` or production credentials are packaged or loaded. The previously approved synthetic runtime examples embedded in the unchanged prompt exports remain **input context only**, never gold targets or assistant loss. The training objective is classification to the existing complete `{plan: CopilotPlan}`; all 48 action categories are question-stage `doAction` boundaries, not action execution or action-parameter training. Server RBAC and execution remain authoritative and untouched.

## Settings and expected resources

- NF4 4-bit base weights with double quantization; only LoRA parameters train.
- Rank 16, alpha 32, dropout 0.05; `q/k/v/o_proj`, `gate/up/down_proj` in all 36 layers (252 projections).
- Single NVIDIA GPU, microbatch 1, gradient accumulation 16, effective batch 16.
- Sequence limit 4,096, **no truncation, no packing, no dropped examples**. Measured maxima: train 3,458 / dev 3,427 tokens.
- FP16 on a T4; BF16 automatically selected only when supported. Resume preserves the original precision; a BF16 run cannot resume on an incompatible GPU.
- Gradient checkpointing with non-reentrant checkpoints, SDPA, paged 8-bit AdamW, learning rate 1e-4, 3 epochs, cosine schedule, warmup 3%.
- Full 800-dev loss validation and resumable checkpoint every 100 optimizer updates; at most three checkpoints retained. Best adapter chosen by lowest full-dev `eval_loss`. No automatic hyperparameter search or early stopping.
- 1,200 optimizer updates for a complete uninterrupted 3-epoch run. A free Colab session may not finish all epochs; resume from Drive across sessions.

**VRAM planning estimate: approximately 10–14 GiB; target a 16 GB T4 or larger.** This is an engineering estimate, not a measured GPU result. The entry point requires at least 14 GiB reported device memory and a T4-class or newer CUDA GPU. A nominal 16 GB T4 normally reports roughly 15 GiB. It stops on insufficient memory and never silently shortens examples, drops rows, offloads the model to CPU/disk, or changes settings. Allow roughly 15–25 GB of disk for the original checkpoint/cache, package and adapter checkpoints. Host RAM use benefits from streamed safetensors loading. Actual peaks and run time require the Colab check.

The custom loss asks pinned Qwen3 for logits only at positions predicting supervised completion tokens. This avoids allocating vocabulary logits for thousands of masked prompt tokens. The GPU preflight compares this loss with full next-token masked cross-entropy on a small tensor-only probe, without an optimizer/backward pass. No FlashAttention installation is needed.

## Completion-only mask and the thinking template

Thinking-2507 is a **thinking-only** checkpoint. Its pinned chat template ignores the generic non-thinking switch and opens the assistant turn with `<think>`. The unchanged full template renders our JSON-only assistant completion with an **empty** thinking block. The package therefore:

1. Renders the original prompt with `add_generation_prompt=True`; all these tokens, including the assistant header and opening `<think>`, receive label `-100`.
2. Supervises only the assistant suffix: an empty thinking closure, the unchanged JSON gold completion, and `<|im_end|>`. No reasoning trace or extra rationale is created.
3. Masks the trailing template newline and all padding. The base pad token stays distinct from EOS.
4. Separately encodes the prompt and suffix to preserve the exact inference prompt token prefix across BPE whitespace merges. The concatenation must decode to the exact full pinned-template rendering. Every example is checked; nothing is truncated.

The empty closing control is supervised so a trained model can leave thinking immediately when using its original generation prefix. This is training serialization, not a production prompt change. Colab preflight repeats the checks using the actual pinned Hugging Face AutoTokenizer. `/no_think` already present in the admitted user-message exports is preserved verbatim; the trainer does not assume it disables this thinking-only checkpoint.

## Colab: run instructions

Upload **`colab-training-package.zip` only**, not the entire HR project. Select a Python GPU runtime in Colab (Runtime → Change runtime type → GPU). This pinned package supports Python 3.10–3.12 on Linux x86_64. If Colab offers a different Python/CUDA environment, stop and prepare a separately qualified dependency update rather than dropping pins.

**Cell 1 — inspect the allocated GPU and unpack**

```python
from google.colab import files
uploaded = files.upload()  # select colab-training-package.zip
```

```bash
!nvidia-smi
!unzip -q /content/colab-training-package.zip -d /content
%cd /content/hr-qlora-training-package
```

If no NVIDIA GPU is available, stop. Free allocation, GPU type and session duration are not guaranteed. No local CPU training fallback exists.

**Cell 2 — install exact versions in a fresh runtime**

```python
# Remove optional preinstalled audio/vision packages whose Torch pins may conflict.
%pip uninstall -y torchvision torchaudio torchtext
%pip install -r /content/hr-qlora-training-package/requirements.txt
```

Restart the Colab session once after installation, then return to the package directory. Do not reinstall packages after a resumed run has begun. The trainer checks the installed versions. Dependency pins are a tested-source/API target; the full CUDA stack has not been installed/executed on this local CPU machine.

**Cell 3 — mount your own Drive for resumable artifacts**

```python
from google.colab import drive
drive.mount('/content/drive')
```

Use a private directory in your own Drive. There is no Hub push, WandB, remote experiment tracker or telemetry. The public base checkpoint needs no API key; the download explicitly passes `token=False`. Training artifacts stay in the selected output directory.

**Cell 4 — validate hashes, counts, strict plan shape/semantics and families**

```bash
!python train.py --check-data
```

**Cell 5 — actual AutoTokenizer and loss-mask preflight, without weights**

```bash
!python train.py --preflight --report-dir /content/qlora-token-preflight
```

Require PASS, 6,400 train / 800 dev, no dropped/truncated rows, and verified completion masks. This also verifies bundled tokenizer-file hashes. Inspect only counts/metrics; no need to print requests.

**Cell 6 — GPU/4-bit/LoRA/forward preflight, without training**

```bash
!python train.py --gpu-preflight --output-dir /content/drive/MyDrive/hr-qlora/qwen3-4b-dataset-v2-run01
```

This **future Colab command** downloads the three pinned original model shards (about 8 GB), verifies their SHA-256 identities and architecture, loads the NF4 base, freezes base parameters, checks 252 LoRA targets, and runs numerical loss parity using forward passes only. Require `gpu_preflight: PASS`. It performs no optimizer/backward step. No such command was executed during package preparation.

**Cell 7 — explicitly begin the actual training, when you choose to start**

```bash
!python train.py --train --output-dir /content/drive/MyDrive/hr-qlora/qwen3-4b-dataset-v2-run01
```

This is the only command that invokes `trainer.train()`. Merely opening the notebook, unpacking the zip or running default checks does not train. Do not run it on the Windows HR application machine. Save the default config before the run; every resume is bound to identical package/config/data/base/dependency identities.

**After a Colab interruption**

Repeat unpack/install/restart/Drive setup with the exact same package, then:

```bash
!python train.py --train --resume latest --output-dir /content/drive/MyDrive/hr-qlora/qwen3-4b-dataset-v2-run01
```

Or pass the full path of a trusted `checkpoint-N` directory. Full checkpoints include adapter weights, optimizer, scheduler, trainer state, RNG state and a completed-checkpoint hash marker. `latest` selects the newest complete marker; an unfinished save is preserved and skipped. Corrupt or mismatched complete checkpoints stop the run. `ignore_data_skip=False` retains correct data progress. Do not use adapter-only output as a resumable optimizer checkpoint, and never load third-party pickle checkpoint state.

Drive sync or runtime termination during a save can leave a partial directory. It is not considered complete until the marker is written after all hashes. Checkpoint rotation intentionally retains only the configured number. Resume is not bitwise deterministic across different GPUs/drivers; the original math precision must remain supported.

**Cell 8 — after training completes, score the saved best adapter on dev**

```bash
!python train.py --evaluate-dev --output-dir /content/drive/MyDrive/hr-qlora/qwen3-4b-dataset-v2-run01
```

This requires the completed-training receipt and its adapter hashes. It generates on all 800 dev examples only. It writes every raw synthetic result and scores intent, exact complete plan, exact parameter set, per-field accuracy, JSON validity, schema+semantic validity, refusal/clarification, languages, latency, errors and generation limits. All attempts remain in the denominator; no automatic retries. `max_new_tokens=256` bounds output. The 30-second HF `max_time` limit is checked between steps, not a hard process watchdog. Partial raw output is preserved on interruption; the command refuses to overwrite an existing dev result file. Preserve it and request a separate recorded continuation rather than deleting failed attempts.

During training, validation metrics are full-dev mean completion loss, token-weighted NLL/perplexity and **teacher-forced token accuracy**. Teacher-forced token accuracy is not intent/plan accuracy. Generation metrics are reported separately after the best adapter is saved; neither kind is a frozen-404 or internal-test measurement. The Python schema/semantic port has 58 parity fixtures against existing Zod/server predicates; this does not replace production Zod or RBAC.

## Outputs and recovery

The selected Drive output directory contains `run_identity.json`, package/data/config identities, `environment.json`, preflight reports, hash-marked `checkpoint-N` directories, trainer logs/state, `train_results.json`, `eval_results.json`, `best-adapter/` and `training_complete.json`. Generation validation adds `dev-generations.jsonl` and `dev-generation-metrics.json`.

`best-adapter/` contains PEFT safetensors/config and the pinned tokenizer, not a merged full model, GGUF or an Ollama deployment. No merge, quantization, Ollama import, application configuration change, 404 evaluation or internal-test run happens automatically. The eventual AFTER conversion and evaluation remain separate stages.

## Files and checks

- `requirements.txt`, `config.json`: explicit environment and training configuration.
- `train.py`, `trainer_impl.py`: guarded entry point, efficient completion loss, checkpoints/resume.
- `data.py`, `masking.py`, `metrics.py`: strict loading, semantic validation, token masks and scoring.
- `base_lock.json`, `data_lock.json`, `contracts.json`, copied admission records: immutable identities.
- `data/`: train/dev exports and lineage sidecars only.
- `tokenizer/`: captured pinned public tokenizer/config/license; no weights.
- `qa/`: tokenizer results, ten regression tests, 58 Zod semantic parity vectors and source exporter.
- `prepare_bundle.py`: repository-only packaging helper; already executed once; do not rerun in Colab.
- `build_colab_bundle.py`, `package-hashes.sha256`, `preparation-results.json`: portable archive and integrity evidence.

The dataset is placeholder-only/template-composed and has no independent human linguistic review. Passing static data/mask tests does not establish natural-name extraction quality, training convergence, classification accuracy or runtime safety. Those remain measured outcomes. No new approval gate is introduced by these disclosures.

Primary technical references: [pinned Qwen model card](https://huggingface.co/Qwen/Qwen3-4B-Thinking-2507/blob/768f209d9ea81521153ed38c47d515654e938aea/README.md), [PEFT quantized training](https://huggingface.co/docs/peft/v0.17.0/developer_guides/quantization), [Transformers 4.57.1 Trainer](https://huggingface.co/docs/transformers/v4.57.1/en/main_classes/trainer), [pinned Qwen3 forward API](https://github.com/huggingface/transformers/blob/v4.57.1/src/transformers/models/qwen3/modeling_qwen3.py), [bitsandbytes hardware support](https://huggingface.co/docs/bitsandbytes/v0.48.1/installation), [PyTorch CUDA 12.6 wheels](https://pytorch.org/get-started/previous-versions/), [Colab availability/limits](https://research.google.com/colaboratory/faq.html).
