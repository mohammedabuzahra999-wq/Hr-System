import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import data
from data import PackageError, read_json, validate_target, load_data
from masking import collate_lists
from metrics import score_response, aggregate
from train import checkpoint_for_resume, output_path, gpu_environment


def plan(intent="employeeFile", **fields):
    return {"plan": {**dict.fromkeys(read_json("contracts.json")["questionFields"]), "intent": intent, **fields}}


class PackageTests(unittest.TestCase):
    def test_schema_and_semantics(self):
        validate_target(plan(personName="<EMPLOYEE_NAME_1>", period="lastMonth", reportType="payroll"))
        for bad in [{"plan": {}}, plan(period="calendarMonth"), plan(month=5), plan("payrollInsights", personName="<EMPLOYEE_NAME_1>"), plan("headcount", payrollTopic="summary"), plan("greeting", refusalReason="unclear"), plan("headcount", reportType="payroll")]:
            with self.assertRaises(PackageError):
                validate_target(bad)

    def test_strict_json(self):
        with self.assertRaises(PackageError):
            data.parse('{"plan":1,"plan":2}')
        with self.assertRaises(PackageError):
            validate_target({**plan("greeting"), "extra": 1})
        for nonstandard in ("NaN", "Infinity", "-Infinity"):
            with self.assertRaises(PackageError):
                data.parse(nonstandard)

    def test_internal_test_rejected_before_read(self):
        with patch.object(Path, "read_bytes", side_effect=AssertionError("FS access")):
            for split in ["test", "internalTest", "internal-test", "dataset-v1", "frozen404"]:
                with self.assertRaises(PackageError):
                    data.load_split(split)

    def test_all_inputs_valid_no_test_payload_read(self):
        original = Path.open
        seen = []
        def guarded(path, *args, **kwargs):
            seen.append(str(path))
            self.assertNotIn("internal-test.jsonl", str(path))
            self.assertNotIn("dataset-v1/", path.as_posix())
            self.assertNotIn("pre-finetuning-benchmark-v1.jsonl", str(path))
            return original(path, *args, **kwargs)
        with patch.object(Path, "open", guarded):
            train, dev, report = load_data()
        self.assertEqual((len(train), len(dev)), (6400, 800))
        self.assertFalse(report["internal_test_opened"])

    def test_selective_padding_does_not_supervise_pad(self):
        f = [{"input_ids": [2, 7, 9], "attention_mask": [1, 1, 1], "labels": [-100, 7, 9]}, {"input_ids": [3, 5], "attention_mask": [1, 1], "labels": [-100, 5]}]
        batch = collate_lists(f, 0)
        self.assertEqual(batch["labels"][0][:3], [-100, 7, 9])
        self.assertTrue(all(label == -100 for labels, attention in zip(batch["labels"], batch["attention_mask"]) for label, visible in zip(labels, attention) if not visible))

    def test_metrics_do_not_hide_invalid_plans_or_reasoning(self):
        expected = plan(period="lastMonth", reportType="payroll", personName="<EMPLOYEE_NAME_1>")
        self.assertTrue(score_response("\n</think>\n\n" + json.dumps(expected), expected)["plan_correct"])
        self.assertFalse(score_response("let me reason </think>" + json.dumps(expected), expected)["schema_semantic_valid"])
        wrong = copy.deepcopy(expected)
        wrong["plan"]["reportType"] = None
        result = score_response(json.dumps(wrong), expected)
        self.assertTrue(result["intent_correct"])
        self.assertFalse(result["plan_correct"])
        self.assertTrue(score_response("null", expected)["json_valid"])
        self.assertFalse(score_response("null", expected)["schema_semantic_valid"])

    def test_resume_hash_and_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp).resolve()
            checkpoint = out / "checkpoint-100"
            checkpoint.mkdir()
            payload = checkpoint / "optimizer.pt"
            payload.write_bytes(b"synthetic checkpoint integrity fixture; no actual tensor")
            record = {"identity_sha256": "run", "complete": True, "files": {payload.name: data.sha(payload)}}
            (checkpoint / "checkpoint_identity.json").write_text(json.dumps(record))
            (out / "checkpoint-200").mkdir()  # interrupted save; not complete
            self.assertEqual(checkpoint_for_resume(out, "latest", "run"), str(checkpoint))
            with self.assertRaises(PackageError):
                checkpoint_for_resume(out, "latest", "different")
            payload.write_bytes(b"corrupted")
            with self.assertRaises(PackageError):
                checkpoint_for_resume(out, "latest", "run")

    def test_output_cannot_overwrite_package_or_data(self):
        for path in [HERE, HERE / "data", HERE.parent / "dataset-v2/output"]:
            with self.assertRaises(PackageError):
                output_path(path)

    def test_local_training_guard(self):
        with patch("platform.system", return_value="Windows"):
            with self.assertRaisesRegex(PackageError, "TRAIN_ONLY_IN_COLAB_GPU_RUNTIME"):
                gpu_environment({}, HERE)

    def test_javascript_semantic_parity(self):
        fixtures = read_json("qa/semantic-parity-fixtures.json")
        for item in fixtures["cases"]:
            try:
                validate_target({"plan": item["plan"]})
                valid = True
            except PackageError:
                valid = False
            self.assertEqual(valid, item["valid"], item["id"])


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(PackageTests))
    with (HERE / "qa/unit-results.json").open("x", encoding="utf-8") as stream:
        json.dump({"status": "PASS" if result.wasSuccessful() else "FAIL", "tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors), "gpu_runtime_tested": False, "training_started": False}, stream, indent=2)
        stream.write("\n")
    raise SystemExit(0 if result.wasSuccessful() else 1)
