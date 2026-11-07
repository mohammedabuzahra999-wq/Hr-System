# Complete current intent inventory

Date: 2026-10-22. The authoritative names are [copilotIntentSchema](../../shared/src/copilot.ts) and [INTENT_ROLES / INTENT_DESCRIPTIONS](../../server/src/copilot/intents.ts): **32 intents**. Actions are a separate 48-value second-stage vocabulary under `doAction`, listed below. No label/schema change is proposed or made here.

## Field, permission and routing notation

All plan fields are present in the structured contract, normally null when irrelevant: `intent`, `period`, `month`, `year`, `department`, `personName`, `employeeNumber`, `rankBy`, `payrollTopic`, `reportType`, `refusalReason` (`payrollTopic` also has a null default). “Required” below means required to serve the requested meaning, not that Zod makes every intent a separate required-field union. Calendar periods require `month`; `year` can be omitted and is resolved to the current year. Schema validation alone is not capability validation.

Roles: **All** = employee, manager, HR, admin; **MHA** = manager, HR, admin; **HA** = HR, admin. These are intent admissions; record/service restrictions still apply. Managers' team intents use their own direct reports, including when HR/admin uses a team intent as their own manager identity. `employeeFile` read permission differs from the stricter `openEmployeeFile` action permission.

Routing: **D** = dedicated deterministic recognizer exists; **P** = exact question entry exists in the current phrasebook; **T** = mapped/selected training route exists; **M** = provider can choose the intent when available to the role. D/P/T indicate possible matching paths, not guaranteed coverage of every paraphrase or a guarantee that all downstream model calls are avoided. `resolveAction`, continuation, narration, guide/RAG prose are separate costs. Fixed terminal outcomes are not new intents.

Examples below are explanatory documentation only, not new training/benchmark rows. `<NAME>` and `<NUMBER>` are placeholders, not real people and not literal strings expected to pass production name grammar.

## Self-service and payroll

| Intent and actual answer | Example request | Required fields | Optional / honored fields | Executor/service | Role | Local/model route | Ambiguity / limits |
|---|---|---|---|---|---|---|---|
| `myAttendance`: own recorded present/late/absent/hours | “Show my attendance this month”; «كيف كان حضوري هالشهر؟» | No person; actor forced | `period`, calendar `month/year` | `executeIntent` -> `attendanceBetween`, `summarize` | All | D/P/T/M | Unsupported periods abstain; server defaults to current month when absent |
| `myLeaveBalance`: current annual/sick balance and used days | “What is my remaining leave balance?”; «قديش باقيلي إجازات؟» | None | No historical-period filter | `executeIntent` -> `balanceFor(actor.id)` | All | D/P/T/M | Historical balance cannot be inferred; current balance only |
| `myRequests`: ten most recent own requests/statuses | “Show my requests”; «شو حالة طلباتي؟» | None | No implemented status/period subset | `executeIntent`, `requests.userId = actor.id` | All | D/P/T/M | Recognized status-subset requests terminate unsupported in neutral context; not every paraphrase is covered |
| `myPayslips`: six recent own net-pay slips | “Show my recent payslips”; «بدي كشف راتبي» | None | No implemented requested-period filter | `executeIntent`, `payslips.userId = actor.id` | All | D/P/T/M | Period-specific asks may terminate unsupported; model selecting a period does not add filtering |
| `payrollInsights`: controlled company Payroll Agent view | “Show company overtime totals”; «اعرض ملخص الرواتب» | Meaningful `payrollTopic`; null defaults summary | `period`, calendar fields; topic-specific cycle/month logic | `executeIntent` -> fixed payroll run/adjustment/contract/audit queries | HA | D/T/M | Never named-employee payroll. Invalid person+company-payroll combination rejected semantically |
| `payrollReadiness`: cycle readiness/status/settings and urgent findings | “Are payroll figures ready for review?”; «هل الرواتب جاهزة للمراجعة؟» | None if current month meant | Supported `period`, calendar fields | `executeIntent`, payroll run/settings/adjustments, `latestAuditForRun` | HA | D/P/T/M | Missing month defaults; this reads readiness, does not approve payroll |
| `payrollRunSummary`: stored run gross/deductions/net/count for cycle | “Show the payroll run for month 8”; «ملخص رواتب الشهر 8» | Calendar `month` when calendar period selected | `period`, `month/year` | `executeIntent`, `payrollRuns` and stored result | HA | D/P/T/M | No matching run -> no data; no run calculation |
| `payrollAuditSummary`: latest audit severity counts | “Show the payroll audit summary”; «ملخص تدقيق الرواتب» | None | Executor uses latest overview, not arbitrary requested period | `executeIntent` -> `auditOverviews()` | HA | D/P/T/M | A selected period is not evidence that this branch applies it |
| `payrollFindings`: open findings of latest audit | “Which payroll findings need review?”; «شو ملاحظات الرواتب المفتوحة؟» | None | Latest audit only in this executor | `executeIntent` -> `auditOverviews`, `latestAuditForRun` | HA | D/P/T/M | Empty/no audit -> no data; reviewing a finding is a separate action |

`payrollTopic` values: `summary`, `readiness`, `adjustments`, `overtime`, `bonuses`, `deductions`, `highestNetPay`, `lowestNetPay`, `contracts`, `variance`, `findings`. They are views, not database field names supplied by the model. Named overtime/payroll belongs to `employeeFile/reportType=payroll`.

## Team and organization

| Intent and actual answer | Example request | Required fields | Optional / honored fields | Executor/service | Role | Local/model route | Ambiguity / limits |
|---|---|---|---|---|---|---|---|
| `teamPresentNow`: direct reports' online/recent/offline presence | “Which of my team are online now?”; «مين من فريقي موجود هسا؟» | Explicit team meaning for strict D route | No historical presence period | `executeIntent` -> `directReports`, `presenceOf(lastSeenAt)` | MHA | D/P/T/M | Presence is app activity, not physical check-in or attendance |
| `teamAttendance`: aggregate direct-report attendance | “How was my team's attendance this month?”; «كيف حضور فريقي؟» | Team subject | `period`, calendar fields | `executeIntent` -> `directReports`, `attendanceCounts` | MHA | M; familiar local wording can be learned/matched | Vague scope may need rephrase/model; never expands to another team |
| `teamOnLeave`: recorded leave days for direct reports in period | “Who on my team was on leave?”; «مين بإجازة من فريقي؟» | Team subject | `period`, calendar fields | `executeIntent`, scoped `attendanceDays.status=leave` | MHA | P/T/M | Description mentions approved future leave, but executor reads attendance-day records; do not promise all approved future requests |
| `teamPendingApprovals`: pending direct-report request counts by kind | “What is waiting for my approval?”; «شو ناطر موافقتي؟» | None | No time filter in this branch | `executeIntent`, scoped `requests.status=pending` | MHA | P/T/M | Viewing counts is not deciding; `decideRequest` is manager-only |
| `teamRoster`: direct-report names/job titles | “Who reports to me?”; «مين بفريقي؟» | None | None | `executeIntent` -> `directReports` | MHA | P/T/M | No named alternative manager/team selection |
| `headcount`: active company employee total and departments | “How many employees work in our company?”; «كم موظف في الشركة؟» | Explicit company scope for strict D route | Executor is current company count; no department/date filter | `executeIntent`, active `users`, grouped counts | HA | D/P/M | “Here” has deterministic clarification only in neutral context; no location guessing |
| `departmentBreakdown`: active employee counts per department | “List employee counts by department”; «عدد الموظفين حسب الأقسام» | Explicit grouping for strict D route | `department` name filter on grouped results | `executeIntent`, active `users` grouped by department | HA | D/P/M | Does not add attendance statistics merely because description suggests them |
| `departmentAbsenceComparison`: department report including recorded comparison/chart | “Compare absence between departments this year”; «قارن الغياب بين الأقسام» | Department comparison meaning; route forces report type | `period`, calendar fields | HTTP branch -> `buildReport('department')`, optional `narrate` | HA | D/T/M | No causal explanation is computed; company-wide report, not a manager-team report |
| `orgAttendance`: company/department aggregate attendance | “Show company attendance last month”; «حضور الشركة الشهر الماضي» | Organization meaning | `period`, calendar fields, `department` | `executeIntent`, active-user department filter + `attendanceCounts` | HA | P/M | Unknown department returns empty; should not widen to company |
| `orgLeaveSummary`: company recorded leave-day total + pending leave count | “Summarize company leave”; «ملخص إجازات الشركة» | Organization meaning | Leave days use `period`; pending request count is current/unfiltered | `executeIntent`, `attendanceDays`, `requests` | HA | M | It is not a complete person list/status-filter service; department parameter is not used |
| `recruitmentSummary`: open vacancy and application-stage totals | “How is recruitment progressing?”; «ملخص التوظيف» | None | Current aggregate counts; no period/department filtering here | `executeIntent`, `jobOpenings`, `applications` | HA | P/T/M | Counts, not candidate ranking or hiring decisions |
| `openJobOpenings`: up to twenty open vacancies/title/department/location | “Which vacancies are open?”; «شو الوظائف المفتوحة؟» | None | Current open jobs | `executeIntent`, `jobOpenings.status=open` | HA | P/T/M | Legacy `GET_OPEN_JOBS` maps to `recruitmentSummary`, a documented label mismatch |
| `listApplications`: up to twenty-five recent applicants and stages | “Show recent applicants”; «ورجيني المتقدمين» | None | No implemented stage/title filter in this Copilot executor | `executeIntent`, applications/candidates/openings joins | HA | P/T/M | No candidate scoring/ranking. MCP exposes a stage argument but `questionPlanFor`/executor do not honor it |
| `whoIsPresentNow`: currently online/recent company users | “Who is online in the company?”; «مين موجود بالنظام هسا؟» | Organization meaning | Current app presence only | `executeIntent`, active `users`, `presenceOf` | HA | P/M | App activity is not proof of attendance or physical location |
| `attendanceRanking`: top ten by recorded attendance-day status | “Who has the most late days this month?”; «مين الأكثر تأخيراً؟» | Ranking meaning | `rankBy` present/absent/late (default present), `period`, calendar fields | `executeIntent`, scoped attendance counts | MHA | P/M | Manager scope forced to own reports; ties ordered by name; all-zero results not ranked |

Sources for the tables: [execute.ts](../../server/src/copilot/execute.ts) `executeIntent`, `directReports`, `resolvePeriod`; [reports/build.ts](../../server/src/reports/build.ts); [teamPresence.ts](../../server/src/copilot/teamPresence.ts); [training.ts](../../server/src/copilot/training.ts). Phrasebook presence was counted from existing entries, not inferred from descriptions.

## Reports, person reads, help and control intents

| Intent and actual answer | Example request | Required fields | Optional / honored fields | Executor/service | Role | Local/model route | Ambiguity / limits |
|---|---|---|---|---|---|---|---|
| `generateReport`: report about others/company/team | “Make a team attendance report”; «اعمل تقرير حضور للفريق» | Report subject; null `reportType` defaults attendance | `reportType`, `period`, calendar fields, `department` | HTTP -> `buildReport`, optional `narrate` | MHA | D/T/M | **Scope gap:** recruitment/department builders ignore calculated team scope. Not all report types are safe merely because this intent is allowed |
| `myReport`: report about authenticated self | “Give me a report on my attendance”; «تقرير عن حضوري» | Self meaning | `reportType`, `period`, calendar fields; self ignores department | HTTP -> `buildReport(...,{self:true})`, optional `narrate` | All | D/T/M | Self scoping works only in builders that use it; recruitment/department branches are global. Must be covered before claiming universal self-only safety |
| `employeeFile`: one authorized person's details/records or payroll report | “Show `<NAME>`'s overtime last month”; «ملف `<NAME>`» | `personName` OR exact `employeeNumber`; payroll meaning requires `reportType=payroll` | Supported `period`, calendar fields; general file otherwise | HTTP -> `buildEmployeeFile` OR `buildEmployeePayrollReport`; optional `narrate` | MHA; payroll HA only | D/T/M | Read lookup needs exactly one match; missing/ambiguous/inaccessible returns `noData`, not automatic choose. Manager sees self/direct reports, no pay. General file includes broader sections than only requested attendance |
| `knowledge`: role-visible source-grounded policy/reference answer | “What does our leave policy say?”; «شو سياسة الإجازات؟» | Relevant user question/source, not employee entity | Sources selected internally, not a model-written source ID | `knowledgeReply` -> `answerFromKnowledge` | All + document audience | T/M; legacy fallback may reach RAG | No authorized match -> no data; keyword/excerpt fallback can answer without model prose |
| `howDoI`: maintained software help/navigation instructions | “Where do I submit annual leave?”; «كيف أقدم طلب إجازة؟» | Useful task/page reference; question stays outside plan | Advisory current path | `answerGuide`, maintained tasks/pages; optional OpenAI explanation | All, visible pages/tasks filtered | D/T/M; guide recognition in HTTP | No maintained context/key -> unclear; asking how differs from commanding navigation |
| `doAction`: instruction, not an executed change | “Submit annual leave”; «قدّملي طلب إجازة» | Second-stage `action` and action-specific fields | `CopilotActionPlan`, collected fields, current date/page | `resolveAction` -> `proposeAction` -> confirm/choose -> `runAction` | All for intent; per-action capability | D/P/T/M (P action entries) | Missing values prompt/form; identity collisions choices; authorization rechecked. No classifier may grant confirmation |
| `greeting`: greeting without a data question | “Hello”; «السلام عليكم» | None | None | HTTP fixed greeting | All | M; matching local examples may also supply category | No data query; greeting with an attached request is not merely greeting |
| `outOfScope`: refusal/not permitted/unclear result | “Explain unrelated astronomy”; «شو وضع الأمور بالموارد البشرية؟» | Meaningful `refusalReason` for model refusal | Refused plan may retain contextual fields | Terminal fixed response OR legacy refusal/action/RAG path | All | D terminal, T/M | `unclear` legacy model plans can attempt action resolution; terminal clarification cannot. Not a blanket keyword classifier |

`reportTypeSchema` includes attendance, leave, employees, newHires, recruitment, department, payroll and employeeFile. The last two are not equivalent to generic report-builder support: person payroll takes the specialized employee builder; generic buildReport has no payroll/employeeFile sections. A valid enum value is not proof the selected intent+builder supports it.

No existing intent is called `get_employee_payroll`, `get_salary`, or `previous_month`. Future labels must map to this vocabulary explicitly, with server validation and subtype scoping still authoritative.

## Complete action subtype appendix (48)

All actions use [perform.ts](../../server/src/copilot/perform.ts) `proposeAction` / `runAction` and the corresponding switch branch; ordinary writes call existing authenticated API routes. Field lists describe core understanding/identification needs. Defaults, record selection and domain conditions remain in that branch; they are not universal Zod non-null requirements. Missing required details use existing form/gap/choice handling. Source: [actions.ts](../../server/src/copilot/actions.ts), [capabilities.ts](../../server/src/copilot/capabilities.ts), [forms.ts](../../server/src/copilot/forms.ts), [shared/actions.ts](../../shared/src/actions.ts).

| Action | Meaning / core fields (optional marked `?`) | Capability / roles |
|---|---|---|
| `checkIn` | Own arrival; no employee target | `recordOwnAttendance` / All |
| `checkOut` | Own working-day departure; not app sign-out | `recordOwnAttendance` / All |
| `requestLeave` | `leaveKind`, `startDate`, `endDate`, `text?` | Self / All |
| `requestDocument` | `documentKind`, `text?`; certificate/detailsUpdate only | Self / All |
| `cancelRequest` | Resolve own pending request | Self / All |
| `openScreen` | `screen`, role-visible destination | UI / All |
| `filterScreen` | `screen`, `text?`, `role?`, `stage?`; permitted screen filters | UI / All |
| `scrollPage` | `scrollTarget` up/down/top/bottom | UI / All |
| `openEmployeeFile` | `personName` or `employeeNumber`; protected full-file navigation | `lookUpEmployeeFile` / HA |
| `setLanguage` | `language` en/ar | UI / All |
| `signOut` | End own session | Self / All |
| `markAllNotificationsRead` | Own inbox/read marker | Self / All |
| `decideRequest` | Employee/request identity, `decision`, `text?` | `decideRequests` / manager only, own reports |
| `postAnnouncement` | `text`, `title?` | `postAnnouncements` / MHA |
| `updateAnnouncement` | Unique `title`, replacement `text` | `postAnnouncements` / MHA + record ownership rules |
| `deleteAnnouncement` | Unique `title` | `postAnnouncements` / MHA + record rules |
| `addCalendarEvent` | `title`, `startDate`, `endDate?` | `manageCalendar` / MHA |
| `remindCheckout` | Remind outstanding check-outs | `remindCheckout` / HA |
| `resetPassword` | Person identifier | `resetPassword` / HA |
| `addEmployee` | `personName`, `email`, `employeeNumberNew`, `jobTitle`, `department`, `role?` | `manageEmployees` / HA |
| `setSalary` | Person, `amount`, `startDate?` | `setSalary` / HA |
| `createPayrollAdjustment` | Person, `payrollAdjustmentKind`, `amount`, reason `text`, `startDate?` | `runPayroll` / HA |
| `approvePayrollAdjustment` | Person, `payrollAdjustmentKind?`; uniquely pending item | `runPayroll` / HA |
| `reviewPayrollFinding` | Person/finding, `decision`, `text?` | `runPayroll` / HA |
| `updateEmployeeDetails` | Person, changed `jobTitle?`/`department?` | `manageEmployees` / HA |
| `generateJobDescription` | `title`, collected brief `text?` | `manageJobDescriptions` / HA |
| `regenerateJobDescriptionSection` | Unique `title`, `jobDescriptionSection`, `text?` | `manageJobDescriptions` / HA |
| `addKnowledgeText` | `title`, `text`; permitted audience handled by service | `manageKnowledge` / HA |
| `deleteKnowledgeText` | Unique source `title` | `manageKnowledge` / HA |
| `approveJobDescription` | Unique description `title` | `manageJobDescriptions` / HA |
| `createOpeningFromJobDescription` | Approved description `title` | `manageJobDescriptions` / HA |
| `deleteJobDescription` | Unique description `title` | `manageJobDescriptions` / HA |
| `createJob` | `title`, `department`, `location?`, `employmentType?` | `manageRecruitment` / HA |
| `updateJobOpening` | Unique `title`, changed location/type/date fields | `manageRecruitment` / HA |
| `publishOpening` | Unique vacancy `title` | `manageRecruitment` / HA |
| `moveApplication` | Applicant `personName`, `stage` | `manageRecruitment` / HA |
| `analyseApplication` | Applicant/application identity | `manageRecruitment` / HA |
| `generateInterview` | Applicant identity; approved job requirements and CV analysis required downstream | `manageRecruitment` / HA |
| `reviewInterviewQuestion` | Applicant, `questionNumber`, `decision`, rejection reason `text` when rejecting | `manageRecruitment` / HA |
| `evaluateInterview` | Applicant with completed interview | `manageRecruitment` / HA |
| `sendInterview` | Applicant, exact `opensAt`, `durationMinutes`; reviewed draft | `manageRecruitment` / HA |
| `runPayroll` | Cycle `startDate?`; default current month when omitted | `runPayroll` / HA |
| `auditPayroll` | Cycle `startDate`; already calculated cycle | `runPayroll` / HA |
| `approvePayroll` | Cycle `startDate`; applicable audit/readiness gates | `runPayroll` / HA |
| `deleteCalendarEvent` | Unique event `title` | `manageCalendar` / MHA + creator scope for manager |
| `changeEmployeeRole` | Person identifier, target `role` | `manageEmployees` / HA |
| `closeOpening` | Unique vacancy `title`; keep records | `manageRecruitment` / HA |
| `deleteOpening` | Unique vacancy `title`; destructive deletion | `manageRecruitment` / HA |

Role `hr` cannot approve/reject another employee's leave: that is specifically their manager's capability, not an assumed HR privilege. Available intent/action lists in prompts provide defense in depth; server permission gates are the authority.

## Clarification versus capability versus authorization labels

Future annotations must distinguish: uncertain semantic subject, missing action field, multiple authorized identity matches, absent record, unsupported filtering, forbidden intent, and forbidden target scope. They can currently share a UI refusal (`unclear`/`noData`) without having the same root cause. In particular, an `employeeFile` ambiguity currently returns no data; do not label it as a successfully executed plan or claim it always asks the user which person.
