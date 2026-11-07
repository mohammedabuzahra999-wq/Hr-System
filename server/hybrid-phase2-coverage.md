# Hybrid Copilot Phase 2 validation

Offline only; no live OpenAI, OpenRouter, Ollama, DB or RAG calls.

New-rule regression suite: 47 exact local plans, 46 abstentions, zero incorrect plans or forced ambiguities. HTTP/shared-validation suite: 90 checks PASS. TypeScript, gate/corpus/training, conversations, local reads, permissions, provider compatibility and both benchmark self-tests PASS. Fixture hash unchanged; remaining 10 requests retain exact pre-Phase-2 prompt/schema hashes.

## Original 26 model-routed fixtures

Local: 16/26 (61.5%). Still model-routed: 10/26. Incorrect local results: 0. Every local result matches every expected field and passes shared validation.

| Category | Newly local |
|---|---:|
| employeeFile | 6 |
| myAttendance | 6 |
| myLeaveBalance | 2 |
| departmentBreakdown | 1 |
| myRequests | 1 |

| Fixture | Route | Rule / expected intent |
|---|---|---|
| en-overtime | deterministic | employee_payroll |
| ar-overtime | deterministic | employee_payroll |
| mixed-overtime | deterministic | employee_payroll |
| en-overtime-lina | deterministic | employee_payroll |
| en-overtime-current | deterministic | employee_payroll |
| mixed-overtime-name | deterministic | employee_payroll |
| en-attendance | deterministic | self_attendance |
| en-absence | deterministic | self_attendance |
| ar-absence | deterministic | self_attendance |
| en-calendar | deterministic | self_attendance |
| ar-calendar | deterministic | self_attendance |
| en-year | deterministic | self_attendance |
| en-leave | deterministic | self_leave_balance |
| ar-leave | deterministic | self_leave_balance |
| en-pay | model | myPayslips |
| en-headcount | model | headcount |
| en-departments | deterministic | department_breakdown |
| en-team | model | teamPresentNow |
| en-requests | model | myRequests |
| ar-requests | deterministic | self_requests |
| ar-help | model | howDoI |
| en-weather | model | outOfScope |
| mixed-weather | model | outOfScope |
| en-science | model | outOfScope |
| en-ambiguous | model | outOfScope |
| ar-ambiguous | model | outOfScope |

## Boundaries and risks

Last-week requests abstain: lastWeek is absent from the existing plan/executor; no dates are invented or schemas expanded. Current leave balances and company counts are snapshots, and the self-request/payslip executors ignore periods/status filters: period/filter-specific variants abstain instead of pretending to apply filters. Bare company scope such as here is insufficient. Unicode name syntax is not identity resolution: existing record lookup, duplicate-name behavior and scopes remain authoritative. Uncertainty markers/conjunctions reject names conservatively.

Dedicated existing report, payroll and action paths remain in place; new read abstention is sticky through the resolver and HTTP shortcuts. Scope/permission/confirmation services were not changed. Classification bypass does not imply bypass of later narration AI calls.

The measurement is resolveQuestion routing, not a claim about real traffic or the entire HTTP pipeline; guide/context shortcuts can resolve additional requests elsewhere. All 33 original fixtures and goldens remain unchanged. The live OpenRouter runner still refuses a changed workload via its existing 26-case guard; no cloud evaluation was performed.
