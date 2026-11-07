"""Dev-only structured generation scoring; teacher-forced scores are separate."""
import math
from collections import defaultdict
from data import parse, validate_target, PackageError, read_json


def score_response(text, target, catalog=None):
    # The generation prefix already contains <think>. Only an empty closure is
    # accepted; invented reasoning is not silently removed to improve scores.
    empty_thinking = False
    if "</think>" in text:
        before, text = text.split("</think>", 1)
        if before.strip():
            return {"json_valid": False, "schema_semantic_valid": False, "intent_correct": False, "plan_correct": False, "parameters_correct": False, "field_correct": {}, "reason": "nonempty_reasoning", "actual": None}
        empty_thinking = True
    actual = None
    json_valid = False
    try:
        actual = parse(text.strip())
        json_valid = True
        plan = validate_target(actual, catalog)
    except PackageError as error:
        return {"json_valid": json_valid, "schema_semantic_valid": False, "intent_correct": False, "plan_correct": False, "parameters_correct": False, "field_correct": {}, "reason": str(error), "actual": actual}
    fields = {key: value == target["plan"][key] for key, value in plan.items()}
    return {"json_valid": True, "schema_semantic_valid": True, "intent_correct": fields["intent"], "plan_correct": all(fields.values()), "parameters_correct": all(value for key, value in fields.items() if key != "intent"), "field_correct": fields, "reason": None, "actual": actual, "empty_thinking_closure": empty_thinking}


def aggregate(results):
    n = len(results)
    if not n:
        return {"examples": 0}
    mean = lambda key: sum(bool(row.get(key)) for row in results) / n
    fields = read_json("contracts.json")["questionFields"]
    latencies = sorted(row["latency_seconds"] for row in results)
    refusals = [row for row in results if row["expected"]["plan"]["intent"] == "outOfScope"]
    report = {"examples": n, "json_validity": mean("json_valid"), "schema_semantic_validity": mean("schema_semantic_valid"), "intent_accuracy": mean("intent_correct"), "complete_plan_accuracy": mean("plan_correct"), "entity_parameter_exact_accuracy": mean("parameters_correct"), "per_field_accuracy": {key: sum(r.get("field_correct", {}).get(key, False) for r in results) / n for key in fields}, "refusal_plan_accuracy": sum(r["plan_correct"] for r in refusals) / len(refusals) if refusals else None, "errors": sum(bool(r.get("error")) for r in results), "generation_time_or_length_limits": sum(bool(r.get("limit_hit")) for r in results), "mean_latency_seconds": sum(latencies) / n, "median_latency_seconds": (latencies[(n - 1) // 2] + latencies[n // 2]) / 2, "p95_latency_seconds": latencies[math.ceil(n * .95) - 1], "slowest_seconds": max(latencies), "score_denominator": "All 800 dev attempts, including errors/limits; invalid results score zero"}
    by_language = defaultdict(list)
    for row in results:
        by_language[row["language"]].append(row)
    report["languages"] = {language: {"examples": len(rows), "intent_accuracy": sum(r["intent_correct"] for r in rows) / len(rows), "complete_plan_accuracy": sum(r["plan_correct"] for r in rows) / len(rows)} for language, rows in by_language.items()}
    report["empty_thinking_closure_rate"] = mean("empty_thinking_closure")
    report["structured_completion_protocol_validity"] = sum(bool(r.get("empty_thinking_closure")) and r["schema_semantic_valid"] and not r.get("limit_hit") and not r.get("error") for r in results) / n
    for reason in ("unclear", "notHrData", "notPermitted"):
        subset = [r for r in refusals if r["expected"]["plan"]["refusalReason"] == reason]
        report[reason + "_plan_accuracy"] = sum(r["plan_correct"] for r in subset) / len(subset) if subset else None
    return report
