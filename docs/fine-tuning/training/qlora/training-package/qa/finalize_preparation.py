"""Record preparation-only readiness without opening test/excluded payloads."""
import ast
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from data import read_json, sha, require


def main():
    # This repo-only helper is not part of the Colab training data path.
    root = HERE.parents[4]
    qlora = HERE.parent
    old = read_json("prior_evidence_lock.json")
    files = {
        "dataset_v2_evidence_manifest_sha256": qlora / "dataset-v2/evidence-hashes.sha256",
        "dataset_v2_manifest_sha256": qlora / "dataset-v2/dataset-manifest.json",
        "base_provenance_evidence_manifest_sha256": root / "docs/fine-tuning/training/base-model-provenance/evidence-hashes.sha256",
        "preparation_evidence_manifest_sha256": qlora / "evidence-hashes.sha256",
    }
    for key, path in files.items():
        require(sha(path) == old[key], "PRIOR_EVIDENCE_CHANGED")
    catalog = read_json("contracts.json")
    for name, digest in catalog["sourceHashes"].items():
        require(sha(root / name) == digest, "APPLICATION_CONTRACT_CHANGED")
    local = read_json("qa/tokenizer-results.json")
    tests = read_json("qa/unit-results.json")
    require(local["status"] == tests["status"] == "PASS", "LOCAL_QA_NOT_PASS")
    require(local["train"]["completion_masks_verified"] == 6400 and local["dev"]["completion_masks_verified"] == 800, "MASK_COUNTS")
    require(not (HERE / "data/internal-test.jsonl").exists(), "TEST_PAYLOAD_PACKAGED")
    python_files = list(HERE.rglob("*.py"))
    for path in python_files:
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    report = {"status": "READY_FOR_COLAB_PREFLIGHT_AND_EXPLICIT_TRAIN", "prepared_at": datetime.now(timezone.utc).isoformat(), "base_model": read_json("base_lock.json")["repository"], "revision": read_json("base_lock.json")["revision"], "dataset": "dataset-v2", "canonical_dataset_sha256": read_json("data_lock.json")["canonical_dataset_sha256"], "train": 6400, "dev": 800, "internal_test": {"examples": 800, "payload_opened": False, "packaged": False, "evaluated": False}, "checks": {"python_syntax": {"status": "PASS", "files": len(python_files)}, "unit_tests": tests, "zod_semantic_parity_fixtures": len(read_json("qa/semantic-parity-fixtures.json")["cases"]), "completion_masks_and_token_roundtrip": {"status": "PASS", "examples": 7200, "train_max_tokens": local["train"]["max_tokens"], "dev_max_tokens": local["dev"]["max_tokens"], "truncations": 0}, "prior_evidence_manifests_unchanged": True, "application_contract_sources_unchanged": len(catalog["sourceHashes"])}, "cuda_runtime_installed_or_tested_here": False, "gpu_loss_parity": "PENDING_COLAB_GPU_PREFLIGHT", "hf_autotokenizer": "PENDING_COLAB_PREFLIGHT; pinned fast backend + template verified locally", "model_weights_downloaded": False, "local_or_cloud_training_steps": 0, "model_inference_calls": 0, "frozen404_evaluation_runs": 0, "dataset_v1_or_historical10k_used": False, "application_config_prompts_or_before_evidence_modified": False, "estimated_vram_gib": "10-14 estimate; target 16 GB T4 or greater; not measured", "training_started": False}
    with (HERE / "preparation-results.json").open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"status": report["status"], "python_files": len(python_files), "protected_manifests_unchanged": len(files), "application_sources_unchanged": len(catalog["sourceHashes"]), "training_started": False}))


if __name__ == "__main__":
    main()
