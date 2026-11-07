# BEFORE model provenance verification

Decision: **NOT VERIFIED for exact upstream conversion ancestry; QLoRA preparation is not cleared by this record.**

The installed artifact, its official Ollama release identity, tokenizer, and configuration are verified. The outstanding gap is narrower: no captured publisher record binds the exact GGUF weight blob to an immutable upstream training-checkpoint revision. Matching metadata and tokenizer do not prove weight ancestry. This record does not claim a mismatch.

## Scope and identity

Evidence captured on 2026-10-26; exact UTC timestamps are recorded in the JSON captures. Project root: `C:/Users/PC-LAB/Downloads/hr-app-step2`.

| Item | Observed value |
| --- | --- |
| Official BEFORE local tag | `qwen3:4b` |
| Serving manifest SHA-256 | `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7` |
| Model GGUF SHA-256 | `3e4cb14174460404e7a233e531675303b2fbf7749c02f91864fe311ab6344e4f` |
| Model GGUF bytes | 2,497,280,480 |
| Exact name embedded in GGUF | `Qwen3 4B Thinking 2507` |
| Embedded finetune / version | `Thinking` / `2507` |
| Architecture / parameters | `qwen3` / 4,022,468,096 |
| Runtime format / quantization | GGUF v3 / Q4_K_M |
| Capacity / actual BEFORE context setting | 262,144 / `num_ctx: 8192` |
| Fresh local Ollama version | `0.40.11` |
| Embedded license link | `Qwen/Qwen3-4B-Thinking-2507/blob/main/LICENSE` |

This discovery identifies the artifact already used for BEFORE. It does not switch models. In particular, the plain local tag must not be taken to identify the original April Qwen3-4B release, Qwen3-4B-Base, Qwen3-4B-Instruct-2507, or any Qwen2.5 checkpoint.

## Chain established

1. Fresh loopback metadata reports the exact BEFORE tag, digest and Ollama version. Only `/api/version`, `/api/tags` and `/api/show` were accessed; there were no inference calls. See `fresh-loopback-metadata.json`.
2. The saved BEFORE serving manifest hashes to the owner-provided digest. All five local config/model/template/license/parameter blobs independently hash to their manifest digests, with matching byte sizes. See `local-artifact-verification.json` and `before-serving-manifest.json`.
3. Public official registry manifests for both `4b` and `4b-thinking-2507-q4_K_M` are byte-identical to the local serving manifest, including the full 64-character digest. These are much stronger evidence than matching a shortened tag-page ID. See `public/ollama-alias-manifest.json`, `public/ollama-release-manifest.json`, and `public-capture-index.json`.
4. Direct bounded parsing of the content-addressed GGUF finds 33 metadata entries. Its name, finetune, version and publisher license URL identify Thinking-2507. No upstream revision, source checkpoint hash, converter version, conversion command or build attestation is embedded. See `local-gguf-metadata.json`.
5. The official trainable release corresponding to that identity is [Qwen/Qwen3-4B-Thinking-2507](https://huggingface.co/Qwen/Qwen3-4B-Thinking-2507). Its immutable publisher snapshot is [768f209d9ea81521153ed38c47d515654e938aea](https://huggingface.co/Qwen/Qwen3-4B-Thinking-2507/tree/768f209d9ea81521153ed38c47d515654e938aea). It supplies BF16 Safetensors for `Qwen3ForCausalLM` with the same parameter count and configuration. This snapshot is a verified existing candidate pin, **not an asserted Ollama conversion-source commit**.
6. Publisher history and per-file last-change metadata show that the three Safetensors shards, index, configuration and tokenizer components are unchanged since first upload `a847ed9e9f50a0cdd07e38aba12f9e6755e3c141`. The pinned head has a README update. The first-upload and head file IDs were compared, not merely commit titles. See `upstream-release-history-comparison.json`.

Primary Ollama release pages: [release tag](https://ollama.com/library/qwen3:4b-thinking-2507-q4_K_M), [model blob metadata](https://ollama.com/library/qwen3:4b-thinking-2507-q4_K_M/blobs/3e4cb1417446). Public response URLs, UTC capture times, status codes, selected non-sensitive headers and exact response SHA-256 hashes are preserved in `public-capture-index.json`.

## Upstream candidate pin and tokenizer

Repository: `Qwen/Qwen3-4B-Thinking-2507`.

Immutable snapshot: `768f209d9ea81521153ed38c47d515654e938aea`.

Original weight/config/tokenizer upload: `a847ed9e9f50a0cdd07e38aba12f9e6755e3c141`.

Trainable weights: BF16, three Safetensors shards. Published LFS SHA-256 IDs:

| File | Publisher-reported SHA-256 |
| --- | --- |
| `model-00001-of-00003.safetensors` | `98178c1cddbca8ad76102afdbf76e4df79b64b82377ad4dca34c755cac00571a` |
| `model-00002-of-00003.safetensors` | `57b5bd1f667d420350f169342a90b50e5ffc2aa202ba1819da1af3367ff2261f` |
| `model-00003-of-00003.safetensors` | `e3cccb84e8926f3f18c334465639939a68af310b0729938fccc2de66a9a31953` |

These weight files were not downloaded or independently hashed. The IDs above are authenticated-transport public Hub metadata, not a claim to have inspected original weight bytes. Complete file identities and download status are in `upstream-checkpoint-file-identities.json`.

Tokenizer: use the same repository and immutable revision, containing `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt`, added-token definitions and the embedded Jinja chat template. Its declared class is `Qwen2Tokenizer`, BPE; this is a shared tokenizer class name and does not imply a Qwen2.5 model. `tokenizer.json` SHA-256 is `aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4`, independently computed from its downloaded bytes and matched to the publisher LFS ID.

Offline comparisons all passed (30/30):

- All 151,643 base token strings and IDs match the installed GGUF.
- All 26 added tokens and IDs match.
- All 151,387 ordered BPE merges match.
- The remaining 267 GGUF vocabulary slots are unused `[PAD<id>]` entries; total embedding vocabulary is 151,936.
- The embedded GGUF Jinja template is byte-identical to the upstream tokenizer template.
- EOS, padding, automatic BOS, architecture, dimensions, native context and parameter count match.
- Every retrieved upstream component matches its immutable Git blob ID or LFS SHA-256.

See `tokenizer-and-config-comparison.json`. This verifies tokenizer/config compatibility, not the ancestry of lossy-quantized weights.

## Remaining provenance gap and decision

Neither the official serving manifest/config nor the complete GGUF metadata records an upstream commit or source weight hash. No captured official conversion attestation maps GGUF `3e4cb141...` to the three upstream Safetensors hashes. The official library page identifies the release but provides no immutable upstream revision or conversion recipe. A registry request by manifest digest returned HTTP 404; the successful tag requests independently reproduced the full expected manifest hash, so that 404 does not invalidate the local identity verification.

Although all available evidence consistently identifies the Thinking-2507 release and one unchanged publisher weight set, claiming the **exact original conversion source revision** would exceed the available evidence. The overall exact-provenance gate is therefore `NOT VERIFIED`, and `safeToPrepareQLoRATraining` is `false` under the requested exact-match requirement.

To close this gap, obtain a publisher conversion/build provenance record binding the installed GGUF SHA-256 to the immutable upstream checkpoint and weight hashes, or separately authorize a controlled conversion/weight verification procedure with pinned tools. Neither activity was performed here. Do not substitute a different Qwen release to close the gap.

## Inference and template caution

The existing BEFORE inference configuration is preserved verbatim in `before-inference-configuration-reference.json`; no setting was changed. It records `think:false`, the existing `/no_think` control, temperature 0, seed 42, `num_ctx:8192`, output limit 512, and the original timeouts. These recorded controls do not establish that the model supports disabling reasoning.

The [pinned official model card](https://huggingface.co/Qwen/Qwen3-4B-Thinking-2507/blob/768f209d9ea81521153ed38c47d515654e938aea/README.md) describes this release as thinking-only and its Jinja generation prefix opens a thinking block. Ollama executes a separate Go template (`before-template.txt`), also containing the opening thinking block. Preserve this distinction for a future training/evaluation plan; it was not used to alter prompts, settings or the completed BEFORE run.

## Integrity and activity limits

All 585 previously protected project/evidence files were verified unchanged before inspection and are checked again in `integrity-verification.json`. The frozen F404 SHA-256 remains `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05`. The existing BEFORE lock, outputs and result manifests are untouched.

Only new evidence and read-only inspection helpers under this directory were created. No application source, prompt, configuration, `.env`, database, RAG/MCP, Voice, provider selection or existing evidence was changed. No model weights were downloaded, no model was selected or installed, no inference or F404 rerun occurred, no training data was created, and fine-tuning has not started.

`evidence-hashes.sha256` covers every evidence file in this directory except itself. Paths are relative to the project root and separated from SHA-256 by a tab. The helpers use exclusive creation for captures so existing evidence is not silently overwritten. They are inspection scripts, not training or benchmark runners.
