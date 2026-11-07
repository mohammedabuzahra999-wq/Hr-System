"""Exact pinned-template rendering with explicit assistant-completion loss masks."""
from data import require

END = "<|im_end|>"
EMPTY_THINK_SUFFIX = "\n</think>\n\n"


def encode_record(row, tokenizer, max_length):
    prefix = tokenizer.apply_chat_template(row["prompt"], tokenize=False, add_generation_prompt=True)
    full = tokenizer.apply_chat_template(row["prompt"] + row["completion"], tokenize=False, add_generation_prompt=False)
    content = row["completion"][0]["content"]
    require(prefix.endswith("<|im_start|>assistant\n<think>\n"), "PINNED_THINKING_TEMPLATE_CHANGED")
    # Thinking-2507 has no hard non-thinking switch. Its unchanged template
    # renders an empty assistant reasoning block for our JSON-only gold reply.
    # Supervise its closing control so inference can exit thinking immediately.
    suffix = EMPTY_THINK_SUFFIX + content + END
    require(full == prefix + suffix + "\n", "CHAT_TEMPLATE_SEAM")
    # Separate encoding deliberately preserves the inference prompt token prefix
    # across BPE whitespace merges at the boundary. The decoded bytes must still
    # be exactly the unchanged full chat rendering. Nothing is truncated.
    prompt_ids = tokenizer.encode(prefix, add_special_tokens=False)
    completion_ids = tokenizer.encode(suffix, add_special_tokens=False)
    trailing_ids = tokenizer.encode("\n", add_special_tokens=False)
    ids = prompt_ids + completion_ids + trailing_ids
    require(tokenizer.decode(ids, skip_special_tokens=False) == full, "TOKENIZATION_ROUNDTRIP")
    require(completion_ids[-1] == tokenizer.eos_token_id, "EOS_NOT_SUPERVISED")
    require(len(ids) <= max_length, "SEQUENCE_TOO_LONG_NO_TRUNCATION")
    labels = [-100] * len(prompt_ids) + completion_ids + [-100] * len(trailing_ids)
    require(len(ids) == len(labels) and any(x != -100 for x in labels), "EMPTY_COMPLETION_MASK")
    require(tokenizer.decode([x for x in labels if x != -100], skip_special_tokens=False) == suffix, "COMPLETION_MASK_CONTENT")
    return {"input_ids": ids, "attention_mask": [1] * len(ids), "labels": labels, "prompt_ids": prompt_ids, "supervised_tokens": len(completion_ids)}


def tokenize_records(rows, tokenizer, max_length):
    result = [encode_record(row, tokenizer, max_length) for row in rows]
    lengths = sorted(len(x["input_ids"]) for x in result)
    stats = {"examples": len(rows), "min_tokens": min(lengths), "max_tokens": max(lengths), "mean_tokens": sum(lengths) / len(lengths), "supervised_tokens": sum(x["supervised_tokens"] for x in result), "truncated_or_dropped": 0, "completion_masks_verified": len(result), "seam_policy": "Separate prefix/suffix encoding; exact full-template text roundtrip", "reasoning_traces": 0, "empty_assistant_thinking_closure_supervised": True}
    return result, stats


def collate_lists(features, pad_token_id, multiple=8):
    size = max(len(f["input_ids"]) for f in features)
    size = (size + multiple - 1) // multiple * multiple
    batch = {key: [] for key in ("input_ids", "attention_mask", "labels")}
    for f in features:
        pad = size - len(f["input_ids"])
        batch["input_ids"].append(f["input_ids"] + [pad_token_id] * pad)
        batch["attention_mask"].append(f["attention_mask"] + [0] * pad)
        batch["labels"].append(f["labels"] + [-100] * pad)
    return batch


class CompletionCollator:
    def __init__(self, pad_token_id):
        self.pad_token_id = pad_token_id

    def __call__(self, features):
        import torch
        return {key: torch.tensor(value, dtype=torch.long) for key, value in collate_lists(features, self.pad_token_id).items()}
