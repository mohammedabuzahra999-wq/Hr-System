# qwen2.5:3b HR Copilot benchmark

## Scope and preflight

Model installed (1,929,912,432 bytes). Existing-adapter smoke PASS in 8.300s: {"status":"OK"}, JSON Schema + Zod, stream:false, no /no_think suffix. Smoke excluded from classification metrics.

26 original model-routed cases; seven deterministic exclusions. All case identities, inputs, roles, expected plans, fixture hash, prompt hashes and schema hashes exactly match the previous qwen2.5:1.5b run. Real shared resolveQuestion prompt; no benchmark guidance. Existing createOllamaProvider used without production/configuration edits.

## Measurements

| Metric | Result |
|---|---|
| cases | 26 |
| intentCorrect | 18 |
| completeCorrect | 9 |
| successfulModelResponses | 25 |
| successfulResponseZodRate | 1.0 |
| attemptWideZodRate | 0.9615384615384616 |
| averageSeconds | 35.68573305384615 |
| completedResponseAverageSeconds | 32.313162376 |
| medianSeconds | 28.214747800000012 |
| p95Seconds | 91.37951819999994 |
| slowestValidRequest | en-team |
| slowestValidSeconds | 91.37951819999994 |
| timeouts | 1 |
| errors | 1 |
| promptTokens | 55836 |
| completionTokens | 2171 |
| usageSamples | 25 |
| accepted | False |

performance.now monotonic elapsed; 120-second Promise deadline plus existing adapter timeout; reject late results after host resume; timeout accounting capped at 120 seconds, with deadlineOverrun flag. All-attempt statistics include timed-out cases at capped deadline, not multi-hour suspension time. No retries.

Median/P95 use all 26 attempts (P95 nearest rank). Slowest valid request excludes the timeout. Prompt/completion totals cover 25 returned responses; usage of the timed-out request is unavailable.

## Acceptance

| Target | Result |
|---|---|
| intentAccuracy | FAIL |
| completePlanAccuracy | FAIL |
| successfulResponseZod | PASS |
| noTimeouts | FAIL |
| completedResponseLatency | FAIL |

## Comparison

| Model | Intent | Complete plan | Completed-response average | Successful-response Zod | Timeouts | Verdict |
|---|---|---|---|---|---|---|
| qwen2.5:1.5b (historical) | 46.2% (12/26) | 7.7% (2/26) | 19.80s | 100% (24/24) | 2 (interruption-affected) | FAIL |
| qwen2.5:3b | 69.2% (18/26) | 34.6% (9/26) | 32.313s | 100% (25/25) | 1 | FAIL |

The 1.5b full-run latency and timeouts were contaminated by environment suspension. Its reported completed-response average excludes those failures. Timing policy now caps expired requests; do not compare the old overall average to the new overall average. Accuracy, goldens and prompt/schema hashes use the same workload.

## Language accuracy

| Language | Intent | Complete |
|---|---|---|
| en | 12/16 (75.0%) | 5/16 (31.2%) |
| ar | 5/7 (71.4%) | 3/7 (42.9%) |
| mixed | 1/3 (33.3%) | 1/3 (33.3%) |

Historical 1.5b Arabic intent: 28.6%; mixed intent: 0%.

## Every failed case: exact field differences

| Case / input | Expected intent | Actual intent | Incorrect fields (expected -> actual) | Seconds |
|---|---|---|---|---|
| en-overtime: Show Ahmed's overtime last month | employeeFile | no response | 120-second timeout | 120.000 |
| ar-overtime: كم أوفرتايم أحمد الشهر الماضي | employeeFile | payrollInsights | intent: "employeeFile" -> "payrollInsights"; period: "lastMonth" -> "calendarMonth"; month: null -> 1; year: null -> 2023; personName: "أحمد" -> "Ahmed" | 32.523 |
| mixed-overtime: ورجيني overtime تبع أحمد الشهر الماضي | employeeFile | payrollInsights | intent: "employeeFile" -> "payrollInsights"; period: "lastMonth" -> "calendarMonth"; month: null -> 1; year: null -> 2023 | 29.502 |
| en-overtime-lina: How many overtime hours did Lina have last month? | employeeFile | payrollInsights | intent: "employeeFile" -> "payrollInsights"; period: "lastMonth" -> "calendarMonth"; month: null -> 8; year: null -> 2023 | 30.822 |
| en-overtime-current: How much was Mohammad's overtime this month? | employeeFile | payrollInsights | intent: "employeeFile" -> "payrollInsights"; period: "thisMonth" -> "calendarMonth"; month: null -> 8; year: null -> 2023 | 28.527 |
| mixed-overtime-name: How many overtime hours did أحمد work last month? | employeeFile | payrollInsights | intent: "employeeFile" -> "payrollInsights"; period: "lastMonth" -> "calendarMonth"; month: null -> 1; year: null -> 2023 | 27.766 |
| en-absence: How many days was I absent last month? | myAttendance | myAttendance | rankBy: null -> "absent"; reportType: null -> "attendance" | 27.838 |
| ar-absence: كم يوم غبت الشهر الماضي؟ | myAttendance | myAttendance | period: "lastMonth" -> "calendarMonth"; month: null -> 1; year: null -> 2026; rankBy: null -> "absent"; reportType: null -> "newHires"; refusalReason: null -> "notHrData" | 27.902 |
| en-calendar: What is my attendance in month 8 of 2026? | myAttendance | knowledge | intent: "myAttendance" -> "knowledge"; rankBy: null -> "present"; reportType: null -> "newHires" | 26.377 |
| ar-calendar: كيف كان حضوري في الشهر 9 من 2026؟ | myAttendance | knowledge | intent: "myAttendance" -> "knowledge"; rankBy: null -> "present"; reportType: null -> "newHires" | 26.010 |
| en-year: How many days have I been absent this year? | myAttendance | myAttendance | rankBy: null -> "absent"; reportType: null -> "attendance" | 26.612 |
| en-leave: How many annual leave days do I have left? | myLeaveBalance | myLeaveBalance | period: null -> "thisYear" | 25.777 |
| en-pay: How much did I earn last month? | myPayslips | myPayslips | period: "lastMonth" -> "thisMonth"; month: null -> 1; year: null -> 2023; reportType: null -> "payroll" | 27.170 |
| en-team: Which members of my team are here now? | teamPresentNow | teamPresentNow | rankBy: null -> "present" | 91.380 |
| en-requests: Which of my requests are awaiting approval? | myRequests | myRequests | rankBy: null -> "present"; reportType: null -> "newHires" | 28.587 |
| en-ambiguous: What is the situation with HR? | outOfScope | outOfScope | refusalReason: "unclear" -> "notHrData" | 31.486 |
| ar-ambiguous: شو وضع الأمور بالموارد البشرية؟ | outOfScope | outOfScope | refusalReason: "unclear" -> "notHrData" | 29.293 |

All six overtime cases failed (one timeout, five company-wide payrollInsights misclassifications). Remaining errors include unrelated rankBy/reportType fields, wrong periods, calendar-date invention, and ambiguous questions refused as notHrData instead of unclear. Valid schema does not imply semantic correctness.

## Validation and changes

TypeScript PASS. Offline benchmark self-test PASS including simulated multi-hour monotonic deadline overrun. Workload/provenance comparison PASS. Live benchmark FAIL (exit 1), no retries.

Changed: server/src/copilot/benchmark/run.ts only (benchmark deadline/timing accounting and safe response/error markers). Created: ollama-qwen2.5-3b-smoke.json, ollama-qwen2.5-3b-benchmark.json, this Markdown report. Production code, prompt, schemas, expected cases, local rules, .env/AI_PROVIDER/OLLAMA_MODEL, OpenAI/OpenRouter, RAG, voice, DB and frontend unchanged. No production integration.
