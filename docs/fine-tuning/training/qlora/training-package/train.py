"""Explicit Colab GPU QLoRA entry point. Default mode only validates data."""
import argparse
import hashlib
from importlib import metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import time

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["USE_TORCH"] = "1"
os.environ["USE_TF"] = "0"
os.environ["USE_FLAX"] = "0"

from data import HERE, BASE, REVISION, config, load_data, read_json, require, sha, PackageError
from masking import tokenize_records, CompletionCollator


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def verify_package():
    entries = (HERE / "package-hashes.sha256").read_text(encoding="utf-8").splitlines()
    for line in entries:
        name, digest = line.split("\t")
        path = (HERE / name).resolve()
        require(path.is_relative_to(HERE) and sha(path) == digest, "PACKAGE_INTEGRITY")


def package_versions():
    versions = {}
    for line in (HERE / "requirements.txt").read_text(encoding="utf-8").splitlines():
        if "==" not in line or line.startswith("#"):
            continue
        name, expected = line.split("==")
        require(metadata.version(name) == expected, "DEPENDENCY_VERSION_" + name.upper().replace("-", "_"))
        versions[name] = expected
    require((3, 10) <= tuple(map(int, platform.python_version_tuple()[:2])) <= (3, 12), "USE_PYTHON_310_TO_312")
    return versions


def output_path(value):
    path = Path(value).expanduser().resolve()
    require(not path.is_relative_to(HERE) and not any(path.is_relative_to(HERE.parent / name) for name in ("dataset-v1", "dataset-v2")), "OUTPUT_MUST_BE_OUTSIDE_FROZEN_ASSETS")
    path.mkdir(parents=True, exist_ok=True)
    return path


def checkpoint_for_resume(output, request, identity_hash):
    if request == "latest":
        candidates = [p for p in output.glob("checkpoint-*") if re.fullmatch(r"checkpoint-\d+", p.name) and (p / "checkpoint_identity.json").is_file()]
        require(bool(candidates), "NO_COMPLETE_CHECKPOINT")
        path = max(candidates, key=lambda p: int(p.name.split("-")[-1]))
    else:
        path = Path(request).expanduser().resolve()
    require(path.parent == output and re.fullmatch(r"checkpoint-\d+", path.name) is not None, "CHECKPOINT_PATH")
    record = json.loads((path / "checkpoint_identity.json").read_text(encoding="utf-8"))
    require(record["identity_sha256"] == identity_hash and record["complete"] is True, "RESUME_IDENTITY")
    for name, digest in record["files"].items():
        require(Path(name).name == name and sha(path / name) == digest, "CHECKPOINT_HASH")
    return str(path)


def gpu_environment(cfg, output):
    require(platform.system() == "Linux" and Path("/content").exists(), "TRAIN_ONLY_IN_COLAB_GPU_RUNTIME")
    versions = package_versions()
    import torch
    require(torch.cuda.is_available() and torch.cuda.device_count() == 1, "ONE_NVIDIA_GPU_REQUIRED")
    require(int(os.environ.get("WORLD_SIZE", "1")) == 1, "SINGLE_GPU_PACKAGE")
    properties = torch.cuda.get_device_properties(0)
    require(properties.total_memory / 1024 ** 3 >= cfg["minimum_vram_gib"], "GPU_VRAM_TOO_SMALL")
    require(torch.cuda.get_device_capability(0) >= (7, 5), "T4_OR_NEWER_REQUIRED")
    old = output / "run_identity.json"
    precision = cfg["precision"]
    if precision == "auto" and old.is_file():
        precision = json.loads(old.read_text(encoding="utf-8"))["precision"]
    elif precision == "auto":
        precision = "bf16" if torch.cuda.is_bf16_supported() else "fp16"
    require(precision in ("fp16", "bf16"), "PRECISION")
    require(precision != "bf16" or torch.cuda.is_bf16_supported(), "RESUME_REQUIRES_BF16_GPU")
    dtype = torch.bfloat16 if precision == "bf16" else torch.float16
    environment = {"python": platform.python_version(), "versions": versions, "cuda_runtime": torch.version.cuda, "gpu": properties.name, "vram_gib": properties.total_memory / 1024 ** 3, "precision": precision}
    return dtype, environment


def load_gpu_model(cfg, dtype, evaluation_only=False, adapter=None):
    import torch
    from huggingface_hub import snapshot_download
    from transformers import AutoModelForCausalLM, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
    lock = read_json("base_lock.json")
    wanted = list(lock["weight_files"]) + [lock["index_file"]["name"], "config.json", "generation_config.json"]
    snapshot = Path(snapshot_download(repo_id=BASE, revision=REVISION, allow_patterns=wanted, token=False))
    require(snapshot.name == REVISION, "SNAPSHOT_REVISION")
    for name, digest in lock["weight_files"].items():
        require(sha(snapshot / name) == digest, "BASE_WEIGHT_HASH")
    require(sha(snapshot / lock["index_file"]["name"]) == lock["index_file"]["sha256"], "BASE_INDEX_HASH")
    for name in ("config.json", "generation_config.json"):
        require(sha(snapshot / name) == lock["tokenizer_files"][name], "BASE_CONFIG_HASH")
    # No remote code, Hub upload, CPU/disk offload or unpinned model revision.
    model = AutoModelForCausalLM.from_pretrained(str(snapshot), local_files_only=True, trust_remote_code=False, use_safetensors=True, quantization_config=BitsAndBytesConfig(**cfg["quantization"], bnb_4bit_compute_dtype=dtype), device_map={"": 0}, torch_dtype=dtype, attn_implementation="sdpa", low_cpu_mem_usage=True)
    require(model.config.model_type == "qwen3" and model.config.num_hidden_layers == 36, "MODEL_ARCHITECTURE")
    model.config.use_cache = False
    require(getattr(model, "is_loaded_in_4bit", False), "FOUR_BIT_LOAD_REQUIRED")
    if evaluation_only:
        model = PeftModel.from_pretrained(model, str(adapter), is_trainable=False, local_files_only=True)
    else:
        targets = cfg["lora"]["target_modules"]
        require(sum(name.rsplit(".", 1)[-1] in targets for name, _ in model.named_modules()) == 252, "LORA_TARGET_MODULE_COUNT")
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})
        model = get_peft_model(model, LoraConfig(**cfg["lora"], task_type="CAUSAL_LM"))
        trainable = [(name, p) for name, p in model.named_parameters() if p.requires_grad]
        require(bool(trainable) and all("lora_" in name for name, _ in trainable), "BASE_PARAMETERS_MUST_BE_FROZEN")
    return model


def loss_parity(model, feature, tokenizer, dtype):
    """Colab-only forward checks; no optimizer, backward pass or training step."""
    import torch
    import torch.nn.functional as F
    from masking import collate_lists
    model.eval()
    ids = feature["input_ids"][:8] + feature["input_ids"][-16:]
    labels = [-100] * 8 + ids[8:]
    batch = {k: torch.tensor(v, device="cuda") for k, v in collate_lists([{"input_ids": ids, "attention_mask": [1] * len(ids), "labels": labels}], tokenizer.pad_token_id).items()}
    positions = torch.nonzero((batch["labels"][:, 1:] != -100).any(dim=0), as_tuple=False).flatten()
    with torch.no_grad():
        with torch.autocast("cuda", dtype=dtype):
            full = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"], use_cache=False).logits.float()
            small = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"], logits_to_keep=positions, use_cache=False).logits.float()
        a = F.cross_entropy(full[:, :-1].reshape(-1, full.shape[-1]), batch["labels"][:, 1:].reshape(-1), ignore_index=-100)
        b = F.cross_entropy(small.reshape(-1, small.shape[-1]), batch["labels"][:, positions + 1].reshape(-1), ignore_index=-100)
        require(torch.isfinite(a).item() and torch.isfinite(b).item() and torch.isclose(a, b, rtol=.003, atol=.03).item(), "SELECTIVE_COMPLETION_LOSS_PARITY")
    del full, small, batch
    torch.cuda.empty_cache()
    return {"selective_vs_full_loss": "PASS", "optimizer_steps": 0, "backward_calls": 0}


def evaluate_dev(model, tokenizer, rows, encoded, cfg, output):
    import torch
    from metrics import score_response, aggregate
    model.eval()
    catalog = read_json("contracts.json")
    results = []
    target_path = output / "dev-generations.jsonl"
    with target_path.open("x", encoding="utf-8") as stream:
        for row, feature in zip(rows, encoded):
            ids = torch.tensor([feature["prompt_ids"]], device="cuda")
            torch.cuda.synchronize()
            start = time.perf_counter()
            text, error, limit = "", None, False
            try:
                with torch.inference_mode():
                    generated = model.generate(input_ids=ids, attention_mask=torch.ones_like(ids), do_sample=False, max_new_tokens=cfg["dev_generation"]["max_new_tokens"], max_time=cfg["dev_generation"]["max_time_seconds"], eos_token_id=tokenizer.eos_token_id, pad_token_id=tokenizer.pad_token_id, use_cache=True)
                new_ids = generated[0, ids.shape[1]:].tolist()
                if tokenizer.eos_token_id in new_ids:
                    new_ids = new_ids[:new_ids.index(tokenizer.eos_token_id)]
                else:
                    limit = True
                text = tokenizer.decode(new_ids, skip_special_tokens=False)
            except torch.cuda.OutOfMemoryError:
                raise PackageError("DEV_GPU_OOM_STOPPED_NO_RETRY") from None
            except RuntimeError:
                error = "GENERATION_RUNTIME_ERROR"
            torch.cuda.synchronize()
            elapsed = time.perf_counter() - start
            score = score_response(text, row["target"], catalog)
            # Bound-triggered/failed generations cannot be counted as successes.
            if error or limit:
                score.update(intent_correct=False, plan_correct=False, parameters_correct=False, field_correct={})
            result = {"record_id": row["metadata"]["record_id"], "language": row["metadata"]["language"], "expected": row["target"], "raw_output": text, **score, "latency_seconds": elapsed, "error": error, "limit_hit": limit}
            stream.write(json.dumps(result, ensure_ascii=False) + "\n")
            stream.flush()
            results.append(result)
    report = aggregate(results)
    report["dataset"] = "dataset-v2/dev only; not internal test or frozen 404"
    report["timeout_note"] = "HF max_time is a stopping criterion checked between GPU steps, not a hard process watchdog"
    write(output / "dev-generation-metrics.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check-data", action="store_true")
    modes.add_argument("--preflight", action="store_true", help="Tokenizer/mask checks only; no weights")
    modes.add_argument("--gpu-preflight", action="store_true", help="Colab GPU forward checks; no training")
    modes.add_argument("--train", action="store_true", help="Explicitly start QLoRA, in Colab only")
    modes.add_argument("--evaluate-dev", action="store_true", help="After completed training, score saved best adapter on dev only")
    parser.add_argument("--resume", help="latest or a complete checkpoint path in output directory")
    parser.add_argument("--output-dir")
    parser.add_argument("--report-dir")
    args = parser.parse_args()
    require(not args.resume or args.train, "RESUME_REQUIRES_EXPLICIT_TRAIN")
    verify_package()
    cfg = config()
    train_rows, dev_rows, data_report = load_data()
    if not any((args.preflight, args.gpu_preflight, args.train, args.evaluate_dev)):
        print(json.dumps({"data_validation": "PASS", **data_report, "training_started": False}, indent=2))
        return
    from transformers import AutoTokenizer, set_seed
    tokenizer = AutoTokenizer.from_pretrained(str(HERE / "tokenizer"), local_files_only=True, use_fast=True, trust_remote_code=False)
    require(tokenizer.eos_token_id == 151645 and tokenizer.pad_token_id == 151643, "TOKENIZER_SPECIAL_IDS")
    tokenizer.padding_side = "right"
    train_features, train_stats = tokenize_records(train_rows, tokenizer, cfg["max_length"])
    dev_features, dev_stats = tokenize_records(dev_rows, tokenizer, cfg["max_length"])
    preflight = {"data": data_report, "train_tokenization": train_stats, "dev_tokenization": dev_stats, "training_started": False}
    if args.preflight:
        if args.report_dir:
            write(Path(args.report_dir) / "preflight.json", preflight)
        print(json.dumps(preflight, indent=2))
        return
    output = output_path(args.output_dir or cfg["output_dir"])
    dtype, environment = gpu_environment(cfg, output)
    identity = {"base": BASE, "revision": REVISION, "data_lock_sha256": sha(HERE / "data_lock.json"), "base_lock_sha256": sha(HERE / "base_lock.json"), "config_sha256": sha(HERE / "config.json"), "package_sha256": sha(HERE / "package-hashes.sha256"), "versions": environment["versions"], "precision": environment["precision"]}
    identity_hash = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    if (output / "run_identity.json").exists():
        require(json.loads((output / "run_identity.json").read_text(encoding="utf-8")) == identity, "RUN_IDENTITY_MISMATCH")
    else:
        require(not args.resume and not args.evaluate_dev, "EXISTING_RUN_REQUIRED")
        require(not any(output.iterdir()), "FRESH_OUTPUT_REQUIRED")
        write(output / "run_identity.json", identity)
        write(output / "environment.json", environment)
        write(output / "preflight.json", preflight)
    if args.train and (output / "training_complete.json").exists():
        raise PackageError("TRAINING_ALREADY_COMPLETE_USE_EVALUATE_DEV")
    resume = checkpoint_for_resume(output, args.resume, identity_hash) if args.resume else None
    if args.train and not args.resume:
        require(not any(output.glob("checkpoint-*")), "EXPLICIT_RESUME_REQUIRED")
    set_seed(cfg["seed"])
    adapter = output / "best-adapter"
    if args.evaluate_dev:
        complete = json.loads((output / "training_complete.json").read_text(encoding="utf-8"))
        require(complete["identity_sha256"] == identity_hash, "TRAINING_RECEIPT_IDENTITY")
        for name, digest in complete["adapter_files"].items():
            require(Path(name).name == name and sha(adapter / name) == digest, "ADAPTER_HASH")
    model = load_gpu_model(cfg, dtype, args.evaluate_dev, adapter)
    if args.evaluate_dev:
        evaluate_dev(model, tokenizer, dev_rows, dev_features, cfg, output)
        print(json.dumps({"dev_evaluation": "COMPLETE", "internal_test_opened": False, "new_training_started": False}))
        return
    parity = loss_parity(model, train_features[0], tokenizer, dtype)
    if args.gpu_preflight:
        write(output / "gpu-preflight.json", {**environment, **parity, "training_started": False})
        print(json.dumps({"gpu_preflight": "PASS", "training_started": False}))
        return
    import torch
    from transformers import TrainingArguments
    from trainer_impl import CompletionTrainer, CheckpointEvidence
    class EncodedDataset:
        def __init__(self, features):
            self.features = features
        def __len__(self):
            return len(self.features)
        def __getitem__(self, index):
            return {key: self.features[index][key] for key in ("input_ids", "attention_mask", "labels")}
    arguments = TrainingArguments(output_dir=str(output), **cfg["training"], seed=cfg["seed"], data_seed=cfg["seed"], bf16=environment["precision"] == "bf16", fp16=environment["precision"] == "fp16", label_names=["labels"], remove_unused_columns=False, save_safetensors=True, ignore_data_skip=False)
    trainer = CompletionTrainer(model=model, args=arguments, train_dataset=EncodedDataset(train_features), eval_dataset=EncodedDataset(dev_features), processing_class=tokenizer, data_collator=CompletionCollator(tokenizer.pad_token_id), callbacks=[CheckpointEvidence(identity_hash)])
    result = trainer.train(resume_from_checkpoint=resume)
    trainer.save_model(str(adapter))
    tokenizer.save_pretrained(str(adapter))
    trainer.save_state()
    dev_metrics = trainer.evaluate()
    trainer.save_metrics("train", result.metrics)
    trainer.save_metrics("eval", dev_metrics)
    receipt = {"training_complete": True, "identity_sha256": identity_hash, "global_step": trainer.state.global_step, "best_checkpoint": trainer.state.best_model_checkpoint, "checkpoint_selection": "Lowest full-800-dev eval_loss only", "adapter_files": {p.name: sha(p) for p in adapter.iterdir() if p.is_file()}, "train_examples": 6400, "dev_examples": 800, "internal_test_opened": False, "frozen404_used": False, "dataset_v1_used": False, "historical10k_used": False}
    write(output / "training_complete.json", receipt)
    print(json.dumps({"training": "COMPLETE", "adapter": str(adapter), "step": trainer.state.global_step, "internal_test_opened": False}))
    # Generation-based metrics are explicit and separate from teacher forcing.
    # Run --evaluate-dev after training, so a Colab interruption cannot hide or
    # restart the finished training run. No internal-test entry point exists.


if __name__ == "__main__":
    try:
        main()
    except (PackageError, metadata.PackageNotFoundError) as error:
        raise SystemExit("STOPPED: " + str(error)) from None
