# qwen2.5:1.5b local benchmark

26 unchanged model-routed synthetic cases; seven deterministic exclusions. Real shared resolveQuestion messages and existing CopilotPlan schema. Existing createOllamaProvider adapter: JSON Schema format, stream false, Zod validation, original timeout/errors. No Qwen3 /no_think appended. No production configuration changes.

## Summary

| Metric | Result |
|---|---|
| cases | 26 |
| intentCorrect | 12 |
| completeCorrect | 2 |
| zodValid | 24 |
| averageSeconds | 6523.585913719232 |
| medianSeconds | 15.665285549999986 |
| p95Seconds | 3581.6981266000003 |
| slowest | mixed-weather |
| slowestSeconds | 165556.27876050002 |
| timeouts | 2 |
| promptTokens | 53194 |
| completionTokens | 1719 |
| usageSamples | 24 |
| completedResponseAverageSeconds | 19.802369566667437 |

Environment date advanced from October 18 to October 20 during the run. Two aborted requests measured 3581.698 and 165556.279 seconds despite nominal 120-second active timeout; suspension/interruption contaminated latency. No retries or replacements. Cause of suspension not independently verified.

All 24 returned responses passed Zod; attempt-wide validation was 24/26 (92.3%). Token totals cover 24 responses only; timed-out generation usage is unavailable. Completed-response mean is descriptive only and excludes the two interrupted failures, not an acceptance metric.

## Language accuracy

| Language | Intent | Complete plan |
|---|---|---|
| en | 10/16 (62.5%) | 2/16 (12.5%) |
| ar | 2/7 (28.6%) | 0/7 (0.0%) |
| mixed | 0/3 (0.0%) | 0/3 (0.0%) |

## All failed cases

Each field below shows expected ? actual. A valid nullable schema does not prevent invented values.

| ID / synthetic input | Intent expected ? actual | Incorrect fields | Seconds |
|---|---|---|---|
| en-overtime: Show Ahmed's overtime last month | employeeFile ? myRequests | intent: "employeeFile" ? "myRequests"; month: null ? 8; year: null ? 2023; department: null ? "HR"; employeeNumber: null ? "EMP-1001"; rankBy: null ? "late"; refusalReason: null ? "notPermitted" | 67.667 |
| ar-overtime: كم أوفرتايم أحمد الشهر الماضي | employeeFile ? doAction | intent: "employeeFile" ? "doAction"; month: null ? 1; year: null ? 2023; department: null ? "HR"; personName: "أحمد" ? "Ahmad"; employeeNumber: null ? "EMP-1001"; rankBy: null ? "present"; refusalReason: null ? "notPermitted" | 20.154 |
| mixed-overtime: ورجيني overtime تبع أحمد الشهر الماضي | employeeFile ? doAction | intent: "employeeFile" ? "doAction"; month: null ? 1; year: null ? 2023; department: null ? "HR"; personName: "أحمد" ? "Ahmad"; employeeNumber: null ? "EMP-1001"; rankBy: null ? "late"; refusalReason: null ? "notPermitted" | 15.082 |
| en-overtime-lina: How many overtime hours did Lina have last month? | employeeFile ? myPayslips | intent: "employeeFile" ? "myPayslips"; period: "lastMonth" ? "calendarMonth"; month: null ? 1; year: null ? 2023; department: null ? "HR"; employeeNumber: null ? "EMP-1001"; rankBy: null ? "late"; refusalReason: null ? "notPermitted" | 18.985 |
| en-overtime-current: How much was Mohammad's overtime this month? | employeeFile ? myPayslips | intent: "employeeFile" ? "myPayslips"; period: "thisMonth" ? "calendarMonth"; month: null ? 8; year: null ? 2023; department: null ? "HR"; employeeNumber: null ? "EMP-1002"; rankBy: null ? "late"; refusalReason: null ? "notPermitted" | 15.045 |
| mixed-overtime-name: How many overtime hours did أحمد work last month? | employeeFile ? myRequests | intent: "employeeFile" ? "myRequests"; month: null ? 8; year: null ? 2023; department: null ? "HR"; personName: "أحمد" ? "Ahmad"; employeeNumber: null ? "EMP-1001"; rankBy: null ? "late"; refusalReason: null ? "notPermitted" | 15.612 |
| en-attendance: What is my attendance this month? | myAttendance ? myAttendance | period: "thisMonth" ? "calendarMonth"; month: null ? 8; year: null ? 2023; department: null ? "HR Department"; personName: null ? "John Doe"; employeeNumber: null ? "E123456"; rankBy: null ? "absent"; reportType: null ? "attendance"; refusalReason: null ? "notPermitted" | 47.447 |
| en-absence: How many days was I absent last month? | myAttendance ? myAttendance | month: null ? 1; year: null ? 2023; department: null ? "HR"; personName: null ? "John Doe"; employeeNumber: null ? "E123456789"; rankBy: null ? "absent"; reportType: null ? "newHires"; refusalReason: null ? "notPermitted" | 15.122 |
| ar-absence: كم يوم غبت الشهر الماضي؟ | myAttendance ? myLeaveBalance | intent: "myAttendance" ? "myLeaveBalance"; month: null ? 12; year: null ? 2023; department: null ? "HR"; personName: null ? "John Doe"; employeeNumber: null ? "123456789"; rankBy: null ? "absent"; reportType: null ? "payroll"; refusalReason: null ? "notPermitted" | 15.208 |
| ar-calendar: كيف كان حضوري في الشهر 9 من 2026؟ | myAttendance ? myReport | intent: "myAttendance" ? "myReport"; reportType: null ? "newHires" | 15.045 |
| en-leave: How many annual leave days do I have left? | myLeaveBalance ? myLeaveBalance | period: null ? "thisMonth"; month: null ? 12; year: null ? 2023; department: null ? "HR Department"; personName: null ? "John Doe"; employeeNumber: null ? "E123456"; rankBy: null ? "late"; reportType: null ? "payroll"; refusalReason: null ? "notPermitted" | 19.199 |
| ar-leave: قديش باقيلي أيام إجازة؟ | myLeaveBalance ? myLeaveBalance | period: null ? "thisMonth"; month: null ? 1; year: null ? 2023; department: null ? "HR Department"; personName: null ? "John Doe"; employeeNumber: null ? "E123456"; rankBy: null ? "absent"; reportType: null ? "payroll"; refusalReason: null ? "notPermitted" | 15.719 |
| en-pay: How much did I earn last month? | myPayslips ? myPayslips | month: null ? 1; year: null ? 2023; department: null ? "HR"; personName: null ? "John Doe"; employeeNumber: null ? "E123456"; rankBy: null ? "present"; reportType: null ? "payroll"; refusalReason: null ? "notPermitted" | 13.182 |
| en-headcount: How many people work here? | headcount ? headcount | period: null ? "thisYear"; rankBy: null ? "present"; reportType: null ? "attendance"; refusalReason: null ? "notPermitted" | 12.669 |
| en-departments: How many staff are in each department? | departmentBreakdown ? departmentBreakdown | period: null ? "lastSixMonths"; month: null ? 1; year: null ? 2023; department: null ? "Sales"; rankBy: null ? "present"; reportType: null ? "attendance" | 8.492 |
| en-team: Which members of my team are here now? | teamPresentNow ? teamPresentNow | period: null ? "today"; rankBy: null ? "present"; reportType: null ? "attendance"; refusalReason: null ? "notPermitted" | 39.110 |
| en-requests: Which of my requests are awaiting approval? | myRequests ? myRequests | period: null ? "thisMonth" | 10.481 |
| ar-requests: شو حالة طلباتي؟ | myRequests ? myRequests | period: null ? "today" | 11.221 |
| ar-help: كيف أقدم طلب إجازة؟ | howDoI ? doAction | intent: "howDoI" ? "doAction"; period: null ? "thisMonth"; month: null ? 1; year: null ? 2023; department: null ? "HR"; personName: null ? "John Doe"; employeeNumber: null ? "E12345"; rankBy: null ? "late"; reportType: null ? "leave"; refusalReason: null ? "notPermitted" | 13.083 |
| en-weather: What is the weather on Mars? | outOfScope ? no response | 120-second timeout | 3581.698 |
| mixed-weather: شو weather على Mars؟ | outOfScope ? no response | 120-second timeout | 165556.279 |
| en-science: Can you explain quantum mechanics? | outOfScope ? knowledge | intent: "outOfScope" ? "knowledge"; period: null ? "lastSixMonths"; rankBy: null ? "present"; reportType: null ? "attendance"; refusalReason: "notHrData" ? "notPermitted" | 14.483 |
| en-ambiguous: What is the situation with HR? | outOfScope ? knowledge | intent: "outOfScope" ? "knowledge"; period: null ? "lastSixMonths"; rankBy: null ? "present"; reportType: null ? "attendance"; refusalReason: "unclear" ? "notPermitted" | 20.274 |
| ar-ambiguous: شو وضع الأمور بالموارد البشرية؟ | outOfScope ? myReport | intent: "outOfScope" ? "myReport"; period: null ? "thisMonth"; month: null ? 1; year: null ? 2023; department: null ? "HR"; personName: null ? "Ahmad"; employeeNumber: null ? "EMP-1001"; rankBy: null ? "present"; reportType: null ? "attendance"; refusalReason: "unclear" ? "notPermitted" | 18.476 |

Only en-calendar and en-year matched the entire plan. All six overtime cases chose the wrong intent, and Arabic/mixed names were transliterated instead of copied. Common failures included invented month/year, department, employeeNumber, rankBy and refusalReason.

## Historical comparison

| Model | Intent | Complete plan | Average | Zod | Timeouts | Verdict |
|---|---|---|---|---|---|---|
| qwen2.5:1.5b (26 current cases) | 12/26 (46.2%) | 2/26 (7.7%) | 6523.586s, interruption-affected | 24/26 (92.3%) | 2 | FAIL |
| qwen3:4b (historical full-prompt variant A, five cases) | 1/5 (20%); derived from recorded plans | Not measured with current exact-plan scoring | 86.313s | 3/5 (60%) | 2 | FAIL |

The Qwen3 diagnostic used an older prompt, five cases, and partial expected-field scoring; it is not an apples-to-apples 26-case comparison. No missing measurements are inferred.

## Checks and scope

TypeScript PASS after removing the obsolete benchmark response parser. Offline benchmark self-test PASS. Live benchmark FAIL (exit 1). No retries. Only benchmark/run.ts changed; no production adapter or resolver changes. New artifacts: this report and ollama-qwen2.5-1.5b-benchmark.json.

Acceptance fails intent >=90%, complete plan >=85%, attempt-wide Zod=100%, timeouts=0 and recorded mean<=10s. Even completed responses average above 10s. Not suitable for this workload; no production integration.

Post-run checks PASS: all 26 prompt/schema hashes match fresh real shared captures; mocked existing adapter preserves Qwen2.5 messages without /no_think, JSON Schema, stream:false and Zod. An initial ad hoc check omitted dotenv and failed env validation; rerunning with normal dotenv initialization passed. No configuration was edited.
