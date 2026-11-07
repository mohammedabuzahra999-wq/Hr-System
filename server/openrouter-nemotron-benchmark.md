# OpenRouter Nemotron synthetic benchmark

Model: nvidia/nemotron-3.5-super-vl:free. All 26 existing model-routed cases attempted; seven local results excluded. Production configuration unchanged.

## Summary

- Intent: 96.2% (25/26).
- Complete plan: 76.9% (20/26).
- Zod: 96.2% of attempts; 25/25 returned model responses valid.
- Average: 4.986s; median: 1.302s; P95 nearest rank: 32.873s. P95 is descriptive for this small sample.
- Slowest: 34.235s (ar-requests).
- Timeouts: 0; errors: 1 (HTTP 502).
- Reported token usage across 25 responses: 55259 prompt + 1670 completion = 56929. No reported reasoning tokens.
- Intentional request spacing is excluded from latency. No retries or fallback masked failures.

## Acceptance

| Criterion | Target | Observed | Verdict |
|---|---|---|---|
| Intent | >=90% | 96.2% | PASS |
| Complete plan | >=85% | 76.9% | FAIL |
| Zod | 100% of attempts | 96.2% | FAIL: one response unavailable |
| Timeouts | 0 | 0 | PASS |
| Average latency | <=10s | 4.986s | PASS |

## Language breakdown

| Language | Cases | Intent | Complete plan |
|---|---|---|---|
| en | 16 | 100.0% | 81.3% |
| ar | 7 | 85.7% | 71.4% |
| mixed | 3 | 100.0% | 66.7% |

Language rates include transport failures. The Arabic intent failure is the HTTP 502, not an incorrect returned classification.

## Historical comparison

| Model | Intent Accuracy | Complete Plan | Avg Latency | Zod | Timeouts | Verdict |
|---|---|---|---|---|---|---|
| qwen3:4b (historical five-case full-prompt diagnostic) | 20% | 20% | 86.313s | 3/5 attempts | 2 | FAIL |
| nvidia/nemotron-3.5-super-vl:free (current 26-case benchmark) | 96.2% | 76.9% | 4.986s | 25/26 attempts | 0 | FAIL |

The Qwen values come from ollama-resolve-diagnostics.json variant A. No Qwen measurement exists on the same 26-case suite, so this is not a controlled head-to-head comparison.

## Every case

Only non-null plan fields are displayed here; the companion JSON contains all expected/actual fields, hashes, usage and timing.

| Input | Expected plan | Actual plan | Intent / Complete / Zod | Latency | Error |
|---|---|---|---|---|---|
| Show Ahmed's overtime last month | {"intent":"employeeFile","period":"lastMonth","personName":"Ahmed","reportType":"payroll"} | {"intent":"employeeFile","period":"lastMonth","personName":"Ahmed"} | PASS / FAIL / PASS | 1.453s |  |
| كم أوفرتايم أحمد الشهر الماضي | {"intent":"employeeFile","period":"lastMonth","personName":"أحمد","reportType":"payroll"} | {"intent":"employeeFile","period":"lastMonth","personName":"أحمد"} | PASS / FAIL / PASS | 1.231s |  |
| ورجيني overtime تبع أحمد الشهر الماضي | {"intent":"employeeFile","period":"lastMonth","personName":"أحمد","reportType":"payroll"} | {"intent":"employeeFile","period":"lastMonth","personName":"أحمد","reportType":"payroll"} | PASS / PASS / PASS | 1.164s |  |
| How many overtime hours did Lina have last month? | {"intent":"employeeFile","period":"lastMonth","personName":"Lina","reportType":"payroll"} | {"intent":"employeeFile","period":"lastMonth","personName":"Lina"} | PASS / FAIL / PASS | 1.138s |  |
| How much was Mohammad's overtime this month? | {"intent":"employeeFile","period":"thisMonth","personName":"Mohammad","reportType":"payroll"} | {"intent":"employeeFile","period":"thisMonth","personName":"Mohammad"} | PASS / FAIL / PASS | 1.468s |  |
| How many overtime hours did أحمد work last month? | {"intent":"employeeFile","period":"lastMonth","personName":"أحمد","reportType":"payroll"} | {"intent":"employeeFile","period":"lastMonth","personName":"أحمد"} | PASS / FAIL / PASS | 1.478s |  |
| What is my attendance this month? | {"intent":"myAttendance","period":"thisMonth"} | {"intent":"myAttendance","period":"thisMonth"} | PASS / PASS / PASS | 20.077s |  |
| How many days was I absent last month? | {"intent":"myAttendance","period":"lastMonth"} | {"intent":"myAttendance","period":"lastMonth"} | PASS / PASS / PASS | 1.037s |  |
| كم يوم غبت الشهر الماضي؟ | {"intent":"myAttendance","period":"lastMonth"} | {"intent":"myAttendance","period":"lastMonth"} | PASS / PASS / PASS | 1.093s |  |
| What is my attendance in month 8 of 2026? | {"intent":"myAttendance","period":"calendarMonth","month":8,"year":2026} | {"intent":"myAttendance","period":"calendarMonth","month":8,"year":2026} | PASS / PASS / PASS | 1.097s |  |
| كيف كان حضوري في الشهر 9 من 2026؟ | {"intent":"myAttendance","period":"calendarMonth","month":9,"year":2026} | {"intent":"myAttendance","period":"calendarMonth","month":9,"year":2026} | PASS / PASS / PASS | 10.485s |  |
| How many days have I been absent this year? | {"intent":"myAttendance","period":"thisYear"} | {"intent":"myAttendance","period":"thisYear"} | PASS / PASS / PASS | 1.146s |  |
| How many annual leave days do I have left? | {"intent":"myLeaveBalance"} | {"intent":"myLeaveBalance"} | PASS / PASS / PASS | 1.070s |  |
| قديش باقيلي أيام إجازة؟ | {"intent":"myLeaveBalance"} | {"intent":"myLeaveBalance"} | PASS / PASS / PASS | 1.535s |  |
| How much did I earn last month? | {"intent":"myPayslips","period":"lastMonth"} | {"intent":"myPayslips","period":"lastMonth"} | PASS / PASS / PASS | 2.439s |  |
| How many people work here? | {"intent":"headcount"} | {"intent":"headcount"} | PASS / PASS / PASS | 1.130s |  |
| How many staff are in each department? | {"intent":"departmentBreakdown"} | {"intent":"departmentBreakdown"} | PASS / PASS / PASS | 1.383s |  |
| Which members of my team are here now? | {"intent":"teamPresentNow"} | {"intent":"teamPresentNow"} | PASS / PASS / PASS | 1.692s |  |
| Which of my requests are awaiting approval? | {"intent":"myRequests"} | {"intent":"myRequests"} | PASS / PASS / PASS | 1.239s |  |
| شو حالة طلباتي؟ | {"intent":"myRequests"} | {"intent":"myRequests"} | PASS / PASS / PASS | 34.235s |  |
| كيف أقدم طلب إجازة؟ | {"intent":"howDoI"} | {"intent":"howDoI"} | PASS / PASS / PASS | 1.343s |  |
| What is the weather on Mars? | {"intent":"outOfScope","refusalReason":"notHrData"} | {"intent":"outOfScope","refusalReason":"notHrData"} | PASS / PASS / PASS | 5.029s |  |
| شو weather على Mars؟ | {"intent":"outOfScope","refusalReason":"notHrData"} | {"intent":"outOfScope","refusalReason":"notHrData"} | PASS / PASS / PASS | 1.161s |  |
| Can you explain quantum mechanics? | {"intent":"outOfScope","refusalReason":"notHrData"} | {"intent":"outOfScope","refusalReason":"notHrData"} | PASS / PASS / PASS | 1.261s |  |
| What is the situation with HR? | {"intent":"outOfScope","refusalReason":"unclear"} | {"intent":"outOfScope","refusalReason":"unclear"} | PASS / PASS / PASS | 32.873s |  |
| شو وضع الأمور بالموارد البشرية؟ | {"intent":"outOfScope","refusalReason":"unclear"} | No response | FAIL / FAIL / FAIL | 0.368s | OpenRouter HTTP 502 |

## Conclusion

Worth further benchmark-only testing: all 25 returned responses chose the correct intent, with low median latency. Not ready for integration: five payroll requests omitted reportType=payroll, and the free endpoint returned one gateway failure with substantial latency outliers. No production prompts or routing were changed.
