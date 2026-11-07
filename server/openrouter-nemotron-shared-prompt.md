# Shared resolveQuestion payroll clarification validation

Only the generic validated paragraph was appended to the shared system prompt.
The experiment helper was removed; the benchmark sends captured messages unchanged.
All 26 message and schema hashes exactly match the previous validated experiment.
No provider configuration, API keys, schemas, local rules or other AI calls changed.

## Regression checks

PASS: TypeScript; Copilot gate, corpus, training, conversation training, local reads;
permissions registry; structured-provider OpenAI compatibility; benchmark self-test;
OpenRouter mocked checks including employeeFile/payrollInsights role distinctions.
These cover person-scoped/company payroll, Arabic/English/mixed wording, refusals,
local deterministic precedence, action boundaries and permissions.
The legacy live Ollama check was not run: it requires switching AI_PROVIDER to ollama;
this task preserves the configured production provider.

## Live Nemotron benchmark

26 original synthetic model-routed cases attempted; seven local cases excluded.
All 26 requests returned HTTP 429. No retries, no successful model responses,
no tokens returned and zero timeouts. Exit status: FAIL.
Intent and complete-plan attempt-wide accuracy: 0/26 (0%); model classification
accuracy and successful-response Zod validation are not measurable.
Arabic: 0/7 available; English: 0/16 available; mixed: 0/3 available.
The previous experiment's 26/26 result is historical, not a result of this run.

Error-response latency: average 0.086842s; median 0.044348s; slowest 0.575168s (en-overtime). These are HTTP rejection timings, not generation latency.

OpenAI still uses responses.parse with the same model setting, temperature, message structure, Zod format and error semantics. Only the shared system text changed. OpenRouter remains benchmark-only. Re-run this same benchmark once the provider rate limit permits requests.
