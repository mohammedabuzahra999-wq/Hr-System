"""Portable, hash-locked train/dev loader; no application, DB or test dependency."""
import hashlib
import json
from pathlib import Path
from collections import Counter, defaultdict
from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
BASE = "Qwen/Qwen3-4B-Thinking-2507"
REVISION = "768f209d9ea81521153ed38c47d515654e938aea"
DATASET_SHA256 = "264400230331a4fbc638889ace7cce9d330f36a4916d204858daf78e541e5ee0"


class PackageError(ValueError):
    """Fixed error codes only; no prompt, record value or credential output."""


def require(condition, code):
    if not condition:
        raise PackageError(code)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def parse(text):
    def invalid_constant(_):
        raise PackageError("INVALID_JSON")
    try:
        return json.loads(text, object_pairs_hook=unique_pairs, parse_constant=invalid_constant)
    except (ValueError, TypeError):
        raise PackageError("INVALID_JSON") from None


def read_json(name):
    return parse((HERE / name).read_text(encoding="utf-8"))


def config():
    cfg = read_json("config.json")
    require((cfg["base_model"], cfg["revision"], cfg["dataset"]) == (BASE, REVISION, "dataset-v2"), "BASE_OR_DATASET_NOT_APPROVED")
    require(cfg["truncation"] is False and cfg["packing"] is False, "TRUNCATION_OR_PACKING_PROHIBITED")
    require(cfg["quantization"] == {"load_in_4bit": True, "bnb_4bit_quant_type": "nf4", "bnb_4bit_use_double_quant": True}, "QLORA_CONFIGURATION")
    require(cfg["training"]["per_device_train_batch_size"] == cfg["training"]["per_device_eval_batch_size"] == 1, "SINGLE_EXAMPLE_BATCH_REQUIRED")
    return cfg


def semantic_issues(plan):
    """Literal port of validateCopilotPlan semantic predicates; not RBAC."""
    issues = []
    if plan["period"] == "calendarMonth" and plan["month"] is None:
        issues.append("calendar_month_required")
    if plan["period"] != "calendarMonth" and (plan["month"] is not None or plan["year"] is not None):
        issues.append("calendar_fields_without_calendar_period")
    if plan["intent"] != "outOfScope":
        if plan["refusalReason"] is not None:
            issues.append("refusal_on_executable_intent")
        if plan["payrollTopic"] is not None and plan["intent"] != "payrollInsights":
            issues.append("payroll_topic_on_wrong_intent")
        if plan["rankBy"] is not None and plan["intent"] != "attendanceRanking":
            issues.append("ranking_on_wrong_intent")
        if plan["reportType"] is not None and plan["intent"] not in ["generateReport", "myReport", "employeeFile", "departmentAbsenceComparison"]:
            issues.append("report_type_on_wrong_intent")
        if plan["reportType"] == "payroll" and plan["intent"] != "employeeFile":
            issues.append("payroll_report_requires_employee_file")
        if plan["intent"] == "payrollInsights" and (plan["personName"] is not None or plan["employeeNumber"] is not None):
            issues.append("person_scoped_company_payroll")
    return issues


def validate_target(target, catalog=None):
    catalog = catalog or read_json("contracts.json")
    require(isinstance(target, dict) and set(target) == {"plan"}, "TARGET_WRAPPER")
    plan = target["plan"]
    require(isinstance(plan, dict) and set(plan) == set(catalog["questionFields"]), "INCOMPLETE_PLAN")
    validator = Draft202012Validator(catalog["questionJSONSchema"])
    require(validator.is_valid(plan), "PLAN_SCHEMA")
    require(not semantic_issues(plan), "PLAN_SEMANTICS")
    return plan


def verify_inputs():
    lock = read_json("data_lock.json")
    require(lock["canonical_dataset_sha256"] == DATASET_SHA256, "DATASET_IDENTITY")
    require(lock["counts"] == {"train": 6400, "dev": 800}, "DATASET_COUNTS")
    # Explicit finite allowlist; even a modified lock cannot add another split.
    names = {"data/train.jsonl", "data/dev.jsonl", "data/train-metadata.jsonl", "data/dev-metadata.jsonl", "contracts.json", "dataset-v2-dataset-manifest.json", "dataset-v2-admission-decision.json"}
    require(set(lock["artifacts"]) == names, "INPUT_ALLOWLIST")
    for name in sorted(names):
        p = (HERE / name).resolve()
        require(p.is_relative_to(HERE), "INPUT_PATH_ESCAPE")
        require(sha(p) == lock["artifacts"][name], "INPUT_HASH_MISMATCH")
    decision = read_json("dataset-v2-admission-decision.json")
    require(decision["allDataAdmissionGatesPass"] is True and decision["datasetSha256"] == DATASET_SHA256, "DATA_NOT_ADMITTED")
    require(sha(HERE / "dataset-v2-dataset-manifest.json") == decision["manifestSha256"], "ADMISSION_MANIFEST_HASH")
    base = read_json("base_lock.json")
    require(base["repository"] == BASE and base["revision"] == base["tokenizer_revision"] == REVISION, "BASE_LOCK")
    for name, digest in base["tokenizer_files"].items():
        require(Path(name).name == name and sha(HERE / "tokenizer" / name) == digest, "TOKENIZER_HASH")
    return lock


def load_split(split, catalog=None):
    require(split in ("train", "dev"), "SPLIT_FORBIDDEN")
    catalog = catalog or read_json("contracts.json")
    expected = {"train": 6400, "dev": 800}[split]
    raw_lines = (HERE / "data" / (split + ".jsonl")).read_bytes().splitlines(keepends=True)
    meta_lines = (HERE / "data" / (split + "-metadata.jsonl")).read_text(encoding="utf-8").splitlines()
    require(len(raw_lines) == len(meta_lines) == expected, "SPLIT_COUNT")
    records = []
    for number, (line, meta_line) in enumerate(zip(raw_lines, meta_lines), 1):
        row, meta = parse(line.decode("utf-8")), parse(meta_line)
        require(meta["line"] == number and hashlib.sha256(line).hexdigest() == meta["example_sha256"], "LINEAGE_HASH")
        require(set(row) == {"prompt", "completion"}, "WIRE_FIELDS")
        require(isinstance(row["prompt"], list) and 2 <= len(row["prompt"]) <= 3, "PROMPT_SHAPE")
        require(row["prompt"][0]["role"] == "system" and row["prompt"][-1]["role"] == "user", "PROMPT_ROLES")
        require(len(row["completion"]) == 1 and row["completion"][0]["role"] == "assistant", "COMPLETION_SHAPE")
        for message in row["prompt"] + row["completion"]:
            require(set(message) == {"role", "content"} and isinstance(message["content"], str), "MESSAGE_SHAPE")
            require(not any(s in message["content"] for s in ("<|im_start|>", "<|im_end|>", "<|endoftext|>", "<think>", "</think>")), "RESERVED_CONTROL_IN_DATA")
        target = parse(row["completion"][0]["content"])
        validate_target(target, catalog)
        records.append({**row, "target": target, "metadata": meta})
    return records


def load_data():
    verify_inputs()
    catalog = read_json("contracts.json")
    train, dev = load_split("train", catalog), load_split("dev", catalog)
    families = []
    report = {"splits": {}, "internal_test_opened": False, "forbidden_corpora_used": False}
    for name, rows in [("train", train), ("dev", dev)]:
        groups = defaultdict(list)
        for row in rows:
            groups[row["metadata"]["family_id"]].append(row)
        require(all(len(g) == 4 and len({r["metadata"]["language"] for r in g}) == 4 and len({json.dumps(r["target"], sort_keys=True) for r in g}) == 1 for g in groups.values()), "FAMILY_TRANSLATION_CONSISTENCY")
        families.append(set(groups))
        counts = Counter(r["metadata"]["language"] for r in rows)
        require(counts == {l: len(rows) // 4 for l in ["en", "ar-MSA", "ar-JO", "mixed"]}, "LANGUAGE_QUOTAS")
        require(set(r["target"]["plan"]["intent"] for r in rows) == set(catalog["intents"]), "INTENT_COVERAGE")
        report["splits"][name] = {"examples": len(rows), "languages": dict(counts), "families": len(groups), "schema_and_semantics": "PASS"}
    require(not (families[0] & families[1]), "TRAIN_DEV_FAMILY_LEAKAGE")
    return train, dev, report
