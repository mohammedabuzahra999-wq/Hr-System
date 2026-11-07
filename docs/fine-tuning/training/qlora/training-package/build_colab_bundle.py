"""Freeze and archive only this package. Never traverse the HR project."""
import hashlib
import json
from pathlib import Path
import zipfile

HERE = Path(__file__).resolve().parent
EXCLUDED = {"package-hashes.sha256", "colab-training-package.zip", "colab-training-package.zip.sha256"}


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    files = sorted(p for p in HERE.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.name not in EXCLUDED and p.suffix not in (".pyc", ".tmp"))
    assert not any("internal-test.jsonl" == p.name for p in files)
    # No model weights, application secrets or arbitrary repository inputs.
    assert not any(p.suffix in (".safetensors", ".gguf", ".pt", ".pth", ".env") for p in files)
    manifest = HERE / "package-hashes.sha256"
    with manifest.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("".join(p.relative_to(HERE).as_posix() + "\t" + sha(p) + "\n" for p in files))
    target = HERE / "colab-training-package.zip"
    with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for p in files + [manifest]:
            archive.write(p, "hr-qlora-training-package/" + p.relative_to(HERE).as_posix())
    with (HERE / "colab-training-package.zip.sha256").open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("colab-training-package.zip\t" + sha(target) + "\n")
    print(json.dumps({"package_files": len(files), "package_manifest_sha256": sha(manifest), "zip_sha256": sha(target), "zip_bytes": target.stat().st_size, "training_started": False}))


if __name__ == "__main__":
    main()
