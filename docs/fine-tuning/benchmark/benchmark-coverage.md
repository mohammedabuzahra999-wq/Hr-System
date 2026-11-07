# Frozen benchmark v1: coverage and validation

**FROZEN EVALUATION DATA — DO NOT USE FOR TRAINING**

Created/frozen for review on 2026-10-22. Dataset: [pre-finetuning-benchmark-v1.jsonl](pre-finetuning-benchmark-v1.jsonl). Protocol and fixture assumptions: [README.md](README.md).

**Dataset SHA-256:** `b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05`

**System baseline SHA-256:** `cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47` (all 381 listed files verified unchanged).

## Design and denominators

404 independently authored input cases = 128 intent cases (32 x four languages) + 192 action cases (48 x four languages) + 84 controls (21 x four languages). Four explicit microphone-check/no-operation controls were added during authoring for a final 404 rather than omitting that behavior merely to reach 400. The same semantic family has four separately worded language variants; all variants remain reserved evaluation data.

No dataset case has been submitted to the application, a resolver, provider, database, MCP or Voice service. There are no v1 accuracy, latency, model-routing or BEFORE/AFTER results. Static validation is not a system benchmark run.

## Required coverage totals

| Measure | Cases / result |
| --- | --- |
| Total cases | 404 |
| Semantic families | 101 |
| English | 101 |
| Modern Standard Arabic | 101 |
| Jordanian/colloquial Arabic | 101 |
| Arabic excluding mixed | 202 |
| Mixed Arabic/English | 101 |
| Voice-style transcripts (no audio) | 84 |
| Clarification / choice | 28 |
| Complete proposals awaiting confirmation | 172 |
| RBAC/ownership/audience-sensitive | 392 |
| Explicit permission-denied controls | 8 |
| Safety-category cases | 84 |
| Safety/regression or negative flag | 88 |
| Out-of-scope outcomes | 8 |
| Unsupported-capability outcomes | 8 |
| Local-abstention controls | 8 |
| No-operation microphone checks | 4 |
| Scope/ambiguity no-data controls | 12 |
| Self-service scope | 76 |
| Named-employee scope | 64 |
| Named-applicant scope | 24 |
| Current intents covered | 32 / 32 |
| Current actions covered | 48 / 48 |
| Normalized duplicate inputs | 0 |
| Exact normalized known-text matches | 0 |

The 88 safety/regression flags comprise 84 safety-category cases plus four core out-of-scope cases. Some controls intentionally expect a legitimate read/knowledge/follow-up rather than refusal. Do not report all 88 as rejected requests. The 392 permission-sensitive cases include ordinary ownership checks, not 392 denial tests. The 12 null-intent records are eight local-boundary controls and four microphone checks; null is not a new intent.

## Cases per intent

Counts use `expected_intent` and include meaningful capability/service annotations; do not treat every row as a model accuracy attempt. Each named intent has at least one authored case in each of the four language groups.

| Current intent | Cases |
| --- | --- |
| `myAttendance` | 8 |
| `myLeaveBalance` | 4 |
| `myRequests` | 12 |
| `myPayslips` | 8 |
| `payrollInsights` | 4 |
| `payrollReadiness` | 4 |
| `payrollRunSummary` | 4 |
| `payrollAuditSummary` | 4 |
| `payrollFindings` | 4 |
| `teamPresentNow` | 4 |
| `teamAttendance` | 4 |
| `teamOnLeave` | 4 |
| `teamPendingApprovals` | 4 |
| `teamRoster` | 4 |
| `headcount` | 4 |
| `departmentBreakdown` | 4 |
| `departmentAbsenceComparison` | 4 |
| `orgAttendance` | 4 |
| `orgLeaveSummary` | 4 |
| `recruitmentSummary` | 4 |
| `openJobOpenings` | 4 |
| `listApplications` | 4 |
| `whoIsPresentNow` | 4 |
| `attendanceRanking` | 4 |
| `generateReport` | 4 |
| `myReport` | 4 |
| `employeeFile` | 16 |
| `knowledge` | 12 |
| `howDoI` | 4 |
| `doAction` | 212 |
| `greeting` | 4 |
| `outOfScope` | 24 |
| No unique intent asserted | 12 |

## Cases per action

Counts use `expected_action`. All 48 actions have four core language variants; missing-slot/choice controls add cases for selected actions. Forbidden requested capabilities are separately annotated and are not counted as successful action selections.

| Current action | Cases |
| --- | --- |
| `checkIn` | 4 |
| `checkOut` | 4 |
| `requestLeave` | 8 |
| `requestDocument` | 4 |
| `cancelRequest` | 4 |
| `openScreen` | 4 |
| `filterScreen` | 4 |
| `scrollPage` | 4 |
| `openEmployeeFile` | 8 |
| `setLanguage` | 4 |
| `signOut` | 4 |
| `markAllNotificationsRead` | 4 |
| `decideRequest` | 4 |
| `postAnnouncement` | 4 |
| `updateAnnouncement` | 4 |
| `deleteAnnouncement` | 4 |
| `addCalendarEvent` | 8 |
| `remindCheckout` | 4 |
| `resetPassword` | 4 |
| `addEmployee` | 8 |
| `setSalary` | 8 |
| `createPayrollAdjustment` | 4 |
| `approvePayrollAdjustment` | 4 |
| `reviewPayrollFinding` | 4 |
| `updateEmployeeDetails` | 4 |
| `generateJobDescription` | 4 |
| `regenerateJobDescriptionSection` | 4 |
| `addKnowledgeText` | 4 |
| `deleteKnowledgeText` | 4 |
| `approveJobDescription` | 4 |
| `createOpeningFromJobDescription` | 4 |
| `deleteJobDescription` | 4 |
| `createJob` | 4 |
| `updateJobOpening` | 4 |
| `publishOpening` | 4 |
| `moveApplication` | 4 |
| `analyseApplication` | 4 |
| `generateInterview` | 4 |
| `reviewInterviewQuestion` | 4 |
| `evaluateInterview` | 4 |
| `sendInterview` | 4 |
| `runPayroll` | 4 |
| `auditPayroll` | 4 |
| `approvePayroll` | 4 |
| `deleteCalendarEvent` | 4 |
| `changeEmployeeRole` | 4 |
| `closeOpening` | 4 |
| `deleteOpening` | 4 |

## Expected behavior and evaluation layers

| Expected behavior | Cases |
| --- | --- |
| `abstain` | 8 |
| `clarify` | 28 |
| `greeting` | 4 |
| `help` | 4 |
| `knowledge` | 12 |
| `no_action` | 4 |
| `no_data` | 12 |
| `notification_metadata` | 4 |
| `out_of_scope` | 8 |
| `permission_denied` | 8 |
| `propose_action` | 172 |
| `read` | 116 |
| `ui_effect` | 16 |
| `unsupported` | 8 |

| Evaluation layer | Cases |
| --- | --- |
| `action` | 212 |
| `capability` | 8 |
| `conversation` | 4 |
| `local_boundary` | 8 |
| `question` | 160 |
| `service_boundary` | 12 |

| Trusted actor role | Cases |
| --- | --- |
| employee | 128 |
| manager | 60 |
| hr | 200 |
| admin | 16 |

Behavior labels are evaluation outcomes, not application intents. A proposal is not an executed write; a local abstention is not an assertion about the later model response. The service-boundary and capability cases must not silently inflate classifier accuracy. Voice-style is an overlapping input characteristic, not an audio test channel.

## Safety and ambiguity families

| Family | IDs | Layer | Expected behavior | Cases |
| --- | --- | --- | --- | --- |
| `edge-unsupported-week` | BENCH-0321–BENCH-0324 | local_boundary | abstain | 4 |
| `edge-payslip-period` | BENCH-0325–BENCH-0328 | capability | unsupported | 4 |
| `edge-request-filter` | BENCH-0329–BENCH-0332 | capability | unsupported | 4 |
| `edge-scope-here` | BENCH-0333–BENCH-0336 | question | clarify | 4 |
| `edge-hr-subject` | BENCH-0337–BENCH-0340 | question | clarify | 4 |
| `edge-missing-leave` | BENCH-0341–BENCH-0344 | action | clarify | 4 |
| `edge-missing-amount` | BENCH-0345–BENCH-0348 | action | clarify | 4 |
| `edge-missing-account-fields` | BENCH-0349–BENCH-0352 | action | clarify | 4 |
| `edge-ambiguous-read` | BENCH-0353–BENCH-0356 | service_boundary | no_data | 4 |
| `edge-ambiguous-open` | BENCH-0357–BENCH-0360 | action | clarify | 4 |
| `edge-employee-company-pay` | BENCH-0361–BENCH-0364 | question | permission_denied | 4 |
| `edge-hr-request-decision` | BENCH-0365–BENCH-0368 | question | permission_denied | 4 |
| `edge-outside-team` | BENCH-0369–BENCH-0372 | service_boundary | no_data | 4 |
| `edge-manager-pay` | BENCH-0373–BENCH-0376 | service_boundary | no_data | 4 |
| `edge-compound-reads` | BENCH-0377–BENCH-0380 | local_boundary | abstain | 4 |
| `edge-negated-write` | BENCH-0381–BENCH-0384 | question | read | 4 |
| `edge-science-in-hr` | BENCH-0385–BENCH-0388 | question | knowledge | 4 |
| `edge-weather-in-hr` | BENCH-0389–BENCH-0392 | question | knowledge | 4 |
| `edge-follow-up` | BENCH-0393–BENCH-0396 | conversation | read | 4 |
| `edge-external-write` | BENCH-0397–BENCH-0400 | question | out_of_scope | 4 |
| `edge-microphone-check` | BENCH-0401–BENCH-0404 | question | no_action | 4 |

Every row also forbids unauthorized reads, unconfirmed protected writes and invented employee IDs. Named scope controls include synthetic compound, hyphen and apostrophe forms. Missing slot cases preserve the intended action while blocking execution. Science/weather-in-HR controls guard against overly broad refusal; compound read controls assert conservative local abstention only. No executable status filter or lastWeek plan value is invented.

## Period and entity coverage

| Supported period annotation | Cases |
| --- | --- |
| `today` | 4 |
| `thisWeek` | 4 |
| `thisMonth` | 12 |
| `lastMonth` | 20 |
| `lastSixMonths` | 4 |
| `thisYear` | 8 |
| `calendarMonth` | 12 |

| Entity feature | Cases |
| --- | --- |
| Name slot | 84 |
| Existing employee-number slot | 8 |
| New employee-number slot | 4 |
| Calendar month/year | 12 |
| ISO date fields | 36 |
| Exact scheduled interview timestamp | 4 |
| Fictional instruction amount | 8 |
| Explicit synthetic previous plan | 4 |

## Grounding and meaning limits

Intent/period/plan fields come from [shared Copilot schemas](../../../shared/src/copilot.ts) and [intent registry](../../../server/src/copilot/intents.ts). Action labels/slots come from [shared action schemas](../../../shared/src/actions.ts), [action capability registry](../../../server/src/copilot/actions.ts), [permissions](../../../server/src/permissions.ts), and [proposeAction/runAction](../../../server/src/copilot/perform.ts). Outcome/confirmation distinctions come from [HTTP Copilot flow](../../../server/src/routes/copilot.ts), [terminal routing](../../../server/src/copilot/routingOutcome.ts), [read executor](../../../server/src/copilot/execute.ts), and [employee builders](../../../server/src/reports/employeeFile.ts). All remain byte-identical to the baseline.

No intent or action name was omitted. What is not meaningfully claimed: real destructive execution, real candidate/employee/payroll facts, live RAG answer quality, live email/model generation, MCP transport parity, real microphone/STT/TTS performance, all enum combinations, or exhaustive RBAC role cross-products. Those require separately approved isolated tests. The known generic report subtype scope gap from Phase 0 is not normalized into a supposedly safe self-report golden: self-report examples use attendance, and company-report examples use authorized HR scope. Other unsafe subtypes remain a documented audit gap, not a newly fixed capability.

Core actions cover the current text route proposal/confirmation behavior, including confirmation for some non-destructive actions; the capability registry destructive flag alone is not used as the text confirmation oracle. Safe navigation/filter/scroll/open-file and the existing notification marker retain their current automatic paths. Ambiguous employee-file reads deliberately expect noData; ambiguous open-file navigation expects a choice.

## Validation performed

* Valid JSONL: 404 nonempty records, UTF-8/LF with final newline; no duplicate IDs or normalized inputs.
* Static AST extraction of actual 32 intents, 48 actions, role/capability lists and controlled enums; no production module imports.
* Isolated Zod record validation, meaningful slot names/types, supported period/report combinations and role-consistent gold labels.
* Declared synthetic identity/ID/email/amount allowlists, obvious credential/email/long-number/IBAN scans and encoding checks: PASS. No real personal data was used; automated scans do not prove arbitrary imported text anonymous.
* Exact normalized novelty check against 10k texts and inspected phrasebook/training/corpus/conversation/old benchmark/Voice source literals: zero matches. Dynamic expansions and near-semantic overlap are not claimed absent.
* All four languages represented for every intent/action; all seven current period enums represented.
* Eleven in-memory validator rejection self-tests: duplicate ID, duplicate input, invalid intent, invalid action, missing required field, unreviewed email, long numeric identifier, invalid period label, unreviewed employee ID, false synthetic declaration, and known-text leakage. PASS.
* Node syntax checks for authoring/validation tools: PASS.
* All 381 original manifest entries and its pinned hash: PASS, unchanged.
* Dataset hash is recorded in both this report and README.
* Benchmark/system/model execution: NOT RUN. Fine-tuning: NOT STARTED.

## Freeze and review boundary

All five files in this directory are new evaluation documentation/data/tooling. Existing source, prompts, resolvers, permissions, database, RAG, MCP, Voice, configuration, secrets and baseline files were not modified. The JSONL contains inputs and gold annotations only, with no measured predictions. Do not use these cases or the authoring catalog as training/validation data, runtime examples or synthetic training seeds. Review the fixed design before authorizing a later isolated baseline run; v1 edits require a new version/hash rather than silently changing the frozen artifact.
