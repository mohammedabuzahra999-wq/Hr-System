"""Read approved train/dev exports and public metadata only. Never open test data."""
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
QLORA = HERE.parent
ROOT = HERE.parents[4]
V2 = QLORA / "dataset-v2"
EXPECTED_DATASET = "264400230331a4fbc638889ace7cce9d330f36a4916d204858daf78e541e5ee0"


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path, data):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def main():
    manifest = json.loads((V2 / "dataset-manifest.json").read_text(encoding="utf-8"))
    decision = json.loads((V2 / "admission-decision.json").read_text(encoding="utf-8"))
    assert manifest["datasetSha256"] == EXPECTED_DATASET and decision["allDataAdmissionGatesPass"]
    assert sha(V2 / "dataset-manifest.json") == decision["manifestSha256"]
    identity_dir = ROOT / "docs/fine-tuning/training/base-model-provenance"
    identity = json.loads((identity_dir / "upstream-checkpoint-file-identities.json").read_text(encoding="utf-8"))
    assert identity["repository"] == manifest["baseModel"] and identity["revision"] == manifest["revision"]
    files = {f["file"]: f for f in identity["files"]}
    (HERE / "data").mkdir()
    (HERE / "tokenizer").mkdir()
    # Index carries lineage/hashes only; no internal-test example is opened.
    index_path = V2 / "admitted/split-index.jsonl"
    assert sha(index_path) == manifest["artifactHashes"]["admitted/split-index.jsonl"]
    index = [json.loads(line) for line in index_path.read_text(encoding="utf-8").splitlines()]
    artifacts = {}
    for split, count in [("train", 6400), ("dev", 800)]:
        source = V2 / ("admitted/" + split + ".jsonl")
        assert sha(source) == manifest["artifactHashes"]["admitted/" + split + ".jsonl"]
        selected = sorted((row for row in index if row["split"] == split), key=lambda row: row["splitLine"])
        assert len(selected) == count
        shutil.copyfile(source, HERE / "data" / (split + ".jsonl"))
        meta = []
        for i, row in enumerate(selected, 1):
            assert row["splitLine"] == i
            language = next(lang for lang in ["ar-MSA", "ar-JO", "mixed", "en"] if row["recordId"].endswith("-" + lang))
            meta.append({"line": i, "record_id": row["recordId"], "family_id": row["familyId"], "language": language, "example_sha256": row["modelExampleSha256"]})
        target = HERE / "data" / (split + "-metadata.jsonl")
        with target.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in meta))
        for p in [HERE / "data" / (split + ".jsonl"), target]:
            artifacts[p.relative_to(HERE).as_posix()] = sha(p)
    catalog = QLORA / "current-contract-catalog.json"
    assert sha(catalog) == "935b62daa020e4244f762e396ec7fd4e2461b966d083d78a2a5e44a9af151642"
    shutil.copyfile(catalog, HERE / "contracts.json")
    artifacts["contracts.json"] = sha(HERE / "contracts.json")
    tokenizer_hashes = {}
    for name in ["tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt", "config.json", "generation_config.json", "LICENSE"]:
        source = identity_dir / "public/upstream" / name
        assert sha(source) == files[name]["retrievedSha256"]
        shutil.copyfile(source, HERE / "tokenizer" / name)
        tokenizer_hashes[name] = sha(source)
    base_lock = {"repository": identity["repository"], "revision": identity["revision"], "tokenizer_revision": identity["revision"], "tokenizer_files": tokenizer_hashes, "weight_files": {name: row["publishedLfsSha256"] for name, row in files.items() if name.endswith(".safetensors")}, "index_file": {"name": "model.safetensors.index.json", "sha256": files["model.safetensors.index.json"]["retrievedSha256"]}, "before_ollama_digest": "359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7", "provenance_limitation": "Exact Ollama GGUF conversion revision cannot be cryptographically linked; accepted by project owner"}
    write_json(HERE / "base_lock.json", base_lock)
    for name in ["dataset-manifest.json", "admission-decision.json"]:
        target = HERE / ("dataset-v2-" + name)
        shutil.copyfile(V2 / name, target)
        artifacts[target.name] = sha(target)
    write_json(HERE / "data_lock.json", {"release": "dataset-v2", "canonical_dataset_sha256": EXPECTED_DATASET, "counts": {"train": 6400, "dev": 800}, "artifacts": artifacts, "internal_test": {"examples": 800, "sha256_from_admitted_manifest_only": manifest["artifactHashes"]["admitted/internal-test.jsonl"], "payload_opened": False, "included_in_package": False}, "split_metadata_only_read_for_lineage": True, "dataset_v1_or_404_or_10k_used": False})
    write_json(HERE / "prior_evidence_lock.json", {"dataset_v2_evidence_manifest_sha256": sha(V2 / "evidence-hashes.sha256"), "dataset_v2_manifest_sha256": sha(V2 / "dataset-manifest.json"), "base_provenance_evidence_manifest_sha256": sha(identity_dir / "evidence-hashes.sha256"), "preparation_evidence_manifest_sha256": sha(QLORA / "evidence-hashes.sha256"), "internal_test_payload_opened": False, "before_or_admitted_assets_modified": False})
    print(json.dumps({"bundle": "CREATED", "train": 6400, "dev": 800, "internal_test_included": False, "model_weights_downloaded": False, "training_started": False}))


if __name__ == "__main__":
    main()
