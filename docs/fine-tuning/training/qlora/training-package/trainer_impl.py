"""GPU runtime only. Project data/contract utilities do not import this module."""
import json
import math
from pathlib import Path
import torch
import torch.nn.functional as F
from transformers import Trainer, TrainerCallback
from data import require, sha


class CompletionTrainer(Trainer):
    """Project only next-token positions that have a supervised label.

    Qwen3 4.57.1 supports tensor logits_to_keep. Avoiding prompt logits is
    particularly useful for its 151,936-token vocabulary on a 16 GB T4.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.model_accepts_loss_kwargs = False  # Trainer handles accumulation.
        self.dev_totals = None

    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        labels = inputs["labels"]
        positions = torch.nonzero((labels[:, 1:] != -100).any(dim=0), as_tuple=False).flatten()
        require(positions.numel() > 0, "NO_SUPERVISED_NEXT_TOKEN")
        targets = labels.index_select(1, positions + 1)
        outputs = model(input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"], logits_to_keep=positions, use_cache=False)
        logits = outputs.logits.float()
        require(logits.shape[:2] == targets.shape, "SELECTIVE_LOGITS_SHAPE")
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), targets.reshape(-1), ignore_index=-100)
        if self.dev_totals is not None and not model.training:
            with torch.no_grad():
                mask = targets != -100
                count = int(mask.sum().item())
                self.dev_totals[0] += float(loss.item()) * count
                self.dev_totals[1] += count
                self.dev_totals[2] += int(((logits.argmax(-1) == targets) & mask).sum().item())
        return (loss, {"loss": loss}) if return_outputs else loss

    def evaluate(self, eval_dataset=None, ignore_keys=None, metric_key_prefix="eval"):
        self.dev_totals = [0., 0, 0]
        metrics = super().evaluate(eval_dataset=eval_dataset, ignore_keys=ignore_keys, metric_key_prefix=metric_key_prefix)
        nll, tokens, correct = self.dev_totals
        self.dev_totals = None
        require(tokens > 0, "NO_DEV_SUPERVISION")
        extra = {metric_key_prefix + "_completion_token_nll": nll / tokens, metric_key_prefix + "_completion_perplexity": math.exp(min(nll / tokens, 80)), metric_key_prefix + "_teacher_forced_token_accuracy": correct / tokens, metric_key_prefix + "_supervised_tokens": tokens}
        metrics.update(extra)
        self.log(extra)
        return metrics


class CheckpointEvidence(TrainerCallback):
    def __init__(self, identity_sha256):
        self.identity_sha256 = identity_sha256

    def on_save(self, args, state, control, **kwargs):
        folder = Path(args.output_dir) / ("checkpoint-" + str(state.global_step))
        required = ["trainer_state.json", "optimizer.pt", "scheduler.pt", "rng_state.pth", "adapter_config.json", "adapter_model.safetensors"]
        require(all((folder / name).is_file() for name in required), "INCOMPLETE_CHECKPOINT")
        files = {p.name: sha(p) for p in folder.iterdir() if p.is_file() and p.name != "checkpoint_identity.json"}
        record = {"identity_sha256": self.identity_sha256, "step": state.global_step, "files": files, "complete": True}
        temporary = folder / "checkpoint_identity.json.tmp"
        temporary.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        temporary.replace(folder / "checkpoint_identity.json")
