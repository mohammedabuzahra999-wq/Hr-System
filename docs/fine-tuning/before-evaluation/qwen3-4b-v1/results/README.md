# Official BEFORE result artifacts

Single pass only. `execution-started.json` is the exclusive execution marker. No retry, overwrite, resume or best-response selection is automatic.

| Planned file | Meaning |
|---|---|
| `raw-per-case.jsonl` | Every completed/failed/timed-out case, raw observation, scored result and provider diagnostics |
| `scored-per-case.jsonl` | Unchanged historical F scorer's validated per-case output |
| `request-events.jsonl` | Fsynced request starts, raw provider bodies and failures; survives an interrupted child |
| `aggregate-metrics.json` | Completion/incomplete status, original metrics/denominators and named supplemental metrics |
| `language-breakdown.json` | English, MSA Arabic, Jordanian Arabic and mixed breakdowns |
| `failures-timeouts.json` | Errors, unavailable fixtures, parent/model timeouts; no hidden retries |
| `result-hashes.sha256` | SHA-256 for finalized result artifacts |

Raw outputs are controlled synthetic evaluation evidence, not training material. Do not use frozen-case failures to optimize prompts, rules, settings or training. A partial file is not a completed 404 run; consult the aggregate status. Fine-tuning is not started.
