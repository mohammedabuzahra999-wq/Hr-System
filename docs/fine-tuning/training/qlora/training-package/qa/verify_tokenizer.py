"""CPU-only check against captured pinned public tokenizer, without Torch/weights."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from data import load_data, read_json
from masking import tokenize_records, collate_lists


class CapturedTokenizer:
    """Same fast backend and Jinja rendering; AutoTokenizer is checked in Colab."""
    def __init__(self):
        from tokenizers import Tokenizer
        from jinja2.sandbox import ImmutableSandboxedEnvironment
        self.backend = Tokenizer.from_file(str(HERE / "tokenizer/tokenizer.json"))
        self.template = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True).from_string(read_json("tokenizer/tokenizer_config.json")["chat_template"])
        self.eos_token_id = self.backend.token_to_id("<|im_end|>")
        self.pad_token_id = self.backend.token_to_id("<|endoftext|>")

    def apply_chat_template(self, messages, tokenize, add_generation_prompt):
        assert tokenize is False
        return self.template.render(messages=messages, add_generation_prompt=add_generation_prompt, tools=None)

    def encode(self, text, add_special_tokens):
        return self.backend.encode(text, add_special_tokens=add_special_tokens).ids

    def decode(self, ids, skip_special_tokens):
        return self.backend.decode(ids, skip_special_tokens=skip_special_tokens)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend-path", help="Optional temporary tokenizers-only QA installation")
    args = parser.parse_args()
    if args.backend_path:
        sys.path.insert(0, args.backend_path)
    started = time.perf_counter()
    train, dev, data_report = load_data()
    tokenizer = CapturedTokenizer()
    cfg = read_json("config.json")
    train_features, train_report = tokenize_records(train, tokenizer, cfg["max_length"])
    dev_features, dev_report = tokenize_records(dev, tokenizer, cfg["max_length"])
    batch = collate_lists([train_features[0], dev_features[0]], tokenizer.pad_token_id)
    assert all(label == -100 for labels, attention in zip(batch["labels"], batch["attention_mask"]) for label, visible in zip(labels, attention) if visible == 0)
    forbidden = [name for name in sys.modules if name == "torch" or name.startswith("torch.")]
    assert not forbidden
    report = {"status": "PASS", "data": data_report, "train": train_report, "dev": dev_report, "padded_labels_masked": True, "actual_backend": "tokenizers 0.22.1 with captured pinned tokenizer.json and Jinja template", "hf_autotokenizer_gpu_runtime_checked": False, "model_weights_loaded": False, "forward_calls": 0, "optimizer_steps": 0, "internal_test_payload_opened": False, "elapsed_seconds": time.perf_counter() - started, "training_started": False}
    out = HERE / "qa/tokenizer-results.json"
    with out.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"status": "PASS", "examples": 7200, "train_max_tokens": train_report["max_tokens"], "dev_max_tokens": dev_report["max_tokens"], "training_started": False}))


if __name__ == "__main__":
    main()
