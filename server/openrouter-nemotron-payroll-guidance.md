# Nemotron payroll-guidance experiment

Benchmark only. Production prompts, schemas, local rules, permissions and AI_PROVIDER unchanged. No API keys are stored in these artifacts.

## Smallest guidance change

For a named or numbered employee's payroll-related question, including overtime hours or overtime pay, use employeeFile with reportType="payroll", even when the user does not ask for a "report". General or company-wide payroll analytics remain payrollInsights with the appropriate payrollTopic; never use payrollInsights for one employee.

The existing employeeFile wording mentions salary/payslip reports, while payrollInsights explicitly mentions overtime. The schema allows reportType=null. The added paragraph explicitly connects named-employee overtime to payroll reportType even without the word report. Schema validation is unchanged.

## Exact comparison

All 26 case IDs, expected plans, fixture hash, resolver hash, original prompt hashes and schema hashes matched. Seven deterministic local cases remain excluded. Reasoning stayed disabled; there were no retries or fallback.

| Metric | Before | After |
|---|---|---|
| Intent accuracy | 96.2% | 100.0% |
| Complete-plan accuracy | 76.9% | 100.0% |
| Zod, successful responses | 100.0% (25/25) | 100.0% (26/26) |
| Zod, all attempts | 96.2% | 100.0% |
| Average latency | 4.986s | 5.883s |
| Median latency | 1.302s | 1.621s |
| P95 (nearest rank) | 32.873s | 16.889s |
| Slowest request | 34.235s | 65.956s |
| HTTP/API errors | 1 HTTP 502 | 0 |
| HTTP 429 | 0 | 0 |
| Other HTTP errors | 0 | 0 |
| Timeouts | 0 | 0 |
| ar intent / complete | 85.7% / 71.4% | 100.0% / 100.0% |
| en intent / complete | 100.0% / 81.3% | 100.0% / 100.0% |
| mixed intent / complete | 100.0% / 66.7% | 100.0% / 100.0% |

## Overtime cases

Every overtime case retained the correct employeeFile intent, person and period. The changed field is reportType.

| Input | Before reportType | After reportType | Before complete | After complete |
|---|---|---|---|---|
| Show Ahmed's overtime last month | null | payroll | FAIL | PASS |
| كم أوفرتايم أحمد الشهر الماضي | null | payroll | FAIL | PASS |
| ورجيني overtime تبع أحمد الشهر الماضي | payroll | payroll | PASS | PASS |
| How many overtime hours did Lina have last month? | null | payroll | FAIL | PASS |
| How much was Mohammad's overtime this month? | null | payroll | FAIL | PASS |
| How many overtime hours did أحمد work last month? | null | payroll | FAIL | PASS |

## All cases

| Input | Before intent / complete / Zod | After intent / complete / Zod | Before latency | After latency | After error |
|---|---|---|---|---|---|
| Show Ahmed's overtime last month | PASS / FAIL / PASS | PASS / PASS / PASS | 1.453s | 1.682s |  |
| كم أوفرتايم أحمد الشهر الماضي | PASS / FAIL / PASS | PASS / PASS / PASS | 1.231s | 8.470s |  |
| ورجيني overtime تبع أحمد الشهر الماضي | PASS / PASS / PASS | PASS / PASS / PASS | 1.164s | 1.146s |  |
| How many overtime hours did Lina have last month? | PASS / FAIL / PASS | PASS / PASS / PASS | 1.138s | 1.430s |  |
| How much was Mohammad's overtime this month? | PASS / FAIL / PASS | PASS / PASS / PASS | 1.468s | 1.282s |  |
| How many overtime hours did أحمد work last month? | PASS / FAIL / PASS | PASS / PASS / PASS | 1.478s | 1.624s |  |
| What is my attendance this month? | PASS / PASS / PASS | PASS / PASS / PASS | 20.077s | 11.250s |  |
| How many days was I absent last month? | PASS / PASS / PASS | PASS / PASS / PASS | 1.037s | 1.452s |  |
| كم يوم غبت الشهر الماضي؟ | PASS / PASS / PASS | PASS / PASS / PASS | 1.093s | 1.242s |  |
| What is my attendance in month 8 of 2026? | PASS / PASS / PASS | PASS / PASS / PASS | 1.097s | 1.597s |  |
| كيف كان حضوري في الشهر 9 من 2026؟ | PASS / PASS / PASS | PASS / PASS / PASS | 10.485s | 65.956s |  |
| How many days have I been absent this year? | PASS / PASS / PASS | PASS / PASS / PASS | 1.146s | 1.902s |  |
| How many annual leave days do I have left? | PASS / PASS / PASS | PASS / PASS / PASS | 1.070s | 1.729s |  |
| قديش باقيلي أيام إجازة؟ | PASS / PASS / PASS | PASS / PASS / PASS | 1.535s | 8.594s |  |
| How much did I earn last month? | PASS / PASS / PASS | PASS / PASS / PASS | 2.439s | 1.156s |  |
| How many people work here? | PASS / PASS / PASS | PASS / PASS / PASS | 1.130s | 3.072s |  |
| How many staff are in each department? | PASS / PASS / PASS | PASS / PASS / PASS | 1.383s | 10.376s |  |
| Which members of my team are here now? | PASS / PASS / PASS | PASS / PASS / PASS | 1.692s | 1.619s |  |
| Which of my requests are awaiting approval? | PASS / PASS / PASS | PASS / PASS / PASS | 1.239s | 1.838s |  |
| شو حالة طلباتي؟ | PASS / PASS / PASS | PASS / PASS / PASS | 34.235s | 1.359s |  |
| كيف أقدم طلب إجازة؟ | PASS / PASS / PASS | PASS / PASS / PASS | 1.343s | 1.525s |  |
| What is the weather on Mars? | PASS / PASS / PASS | PASS / PASS / PASS | 5.029s | 1.167s |  |
| شو weather على Mars؟ | PASS / PASS / PASS | PASS / PASS / PASS | 1.161s | 1.630s |  |
| Can you explain quantum mechanics? | PASS / PASS / PASS | PASS / PASS / PASS | 1.261s | 16.889s |  |
| What is the situation with HR? | PASS / PASS / PASS | PASS / PASS / PASS | 32.873s | 1.517s |  |
| شو وضع الأمور بالموارد البشرية؟ | FAIL / FAIL / FAIL | PASS / PASS / PASS | 0.368s | 1.443s |  |

## Acceptance and interpretation

All specified targets passed: intent >=90%, full plan >=85%, successful-response Zod 100%, zero timeouts, average <=10s. No classification/schema regressions were observed on this fixed suite.

Five complete-plan gains are the targeted missing payroll reportType corrections. One additional successful case replaces the previous HTTP 502; that availability change is not evidence of a prompt effect. All 25 returned baseline responses already had correct intents.

Mean and median latency increased, and the slowest request took 65.956 seconds. Do not attribute provider latency changes or HTTP reliability to the wording change on one run. P95 is descriptive for only 26 samples.

## Recommendation

The generic clarification is a candidate for promotion to the shared prompt in a separate reviewed change, after OpenAI and held-out RBAC/company-payroll regression checks. The fixed-suite experiment is positive but is not evidence for integrating OpenRouter into production. Nothing was promoted in this task.

