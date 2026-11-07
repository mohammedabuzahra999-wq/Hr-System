# Copilot Functionality Coverage Matrix

**Inventory date:** 2026-10-15  
**Scope:** the authenticated HR application, its public recruitment flows, the
main Copilot, the Payroll Agent, MCP, knowledge retrieval, and voice.

This is an inventory, not an implementation plan disguised as a feature.  A
`FULL` entry means the Copilot uses the real application route/service and
enforces the same role rules. `PARTIAL` means a closely related capability
exists but does not yet cover all of the corresponding UI operation. `MISSING`
means the UI can do it but Copilot cannot. `NOT_SAFE_OR_APPROPRIATE` means it
should remain a direct browser or public-user interaction.

## Security baseline found in the repository

- The server-side `CAPABILITIES` table is the source of truth for role checks.
  Manual routes use it through `requireRole`; Copilot actions map to the same
  capabilities through `ACTION_CAPABILITY`.
- Reads are scoped in their services, including own-record, manager-team, and
  HR/admin organisation views. A user cannot obtain access by claiming another
  role in a prompt.
- Copilot actions are proposed first. Sensitive/destructive actions require a
  server-held, expiring confirmation token before `runAction` is called.
- Each Copilot action is audited. The assistant records unanswered questions
  separately for HR/admin review.
- Voice submits its final transcript to the same `/api/copilot/ask` pipeline
  as text. It does not have a separate business-action implementation.
- RAG retrieval applies each knowledge document's allowed-role audience on the
  server. MCP signs in as one real account and uses the same action/intent
  services.

## Coverage matrix

| Module | Page | Manual functionality | UI execution / backend service | Permission | R/W | Sensitivity | Current AI support | Current voice support | Required AI capability | Execution method | Confirmation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Global navigation | All protected routes | Open a permitted page, payroll workspace, employee-home section, or role dashboard | React Router + `navigationPaths`; route guards | Destination route role | R | Low | Typed `openScreen` and capability page list | Same `openScreen`; fast local voice navigation | Navigate, tab/hash, period/filter context | Validated UI effect, never DOM clicking | No | PARTIAL |
| Global navigation | All protected routes | Open one named record, carry search/filter/sort/date context, open a modal, move the viewport | Per-page local React state and URL parameters | Page permission | R / UI | Low–Medium | Employee entity open, payroll period, leave tabs, employee/user search and role filters, recruitment-stage filters, and verified up/down/top/bottom scrolling use typed effects | Same pipeline with a fast voice path for scrolling | Remaining sort/date/dialog commands | Typed UI command registry per page | No | PARTIAL |
| Session & preferences | App layout, profile, settings | Change language; sign out; profile/settings preferences; theme/tour | Local state/auth API/browser storage | Own session | W / UI | Low | Language and sign-out actions | Same | UI-preference commands | Existing UI service where applicable | Sign-out: no; account changes: yes | PARTIAL |
| Employee self-service | Home | Check in and check out | `/attendance/check-in`, `/attendance/check-out` | `recordOwnAttendance` | W | Medium | `checkIn`, `checkOut` | Same | Attendance command | Shared action service | No | FULL |
| Employee self-service | Home | Request annual/sick/unpaid leave; request certificate/detail update; cancel a pending request | `/requests/leave`, `/requests/simple`, `/requests/:id/cancel` | Own record | W | Medium | `requestLeave`, `requestDocument`, `cancelRequest` | Same | Request workflow with missing-field questions | Shared action service | No | FULL |
| Employee self-service | Home | Read own attendance, balance, requests and payslips | Attendance/requests/payroll read APIs | Own record | R | Personal data | `myAttendance`, `myLeaveBalance`, `myRequests`, `myPayslips` | Same | Scoped read/query | Intent executor | No | FULL |
| Employee self-service | Home | Read, mark all read, delete notifications; view announcements | `/feed/notifications`, `/feed/inbox`, `/feed/notifications/read-all` | Own record | R/W | Low | `markAllNotificationsRead` uses `/feed/notifications/read-all`; individual delete remains unavailable | Same | Notification list/read/dismiss | Shared feed service | Dismiss: yes | PARTIAL |
| Employee self-service | Home | Print/download a payslip or browser-only display controls | Browser `window.print`, local component state | Own record | UI | Personal data | Read answer only | Same | Optional generated document export later | Browser interaction is not an HR service | N/A | NOT_SAFE_OR_APPROPRIATE |
| Manager workbench | Manager dashboard/team/attendance/leaves | View own team roster, attendance, leave, presence and pending approvals | `/stats/team`, `/attendance/team`, `/requests/inbox` | Team scope | R | Personnel data | Team intents and reports | Same | Scoped team query | Intent executor | No | PARTIAL |
| Manager approvals | Manager dashboard/approvals | Approve/reject a direct report's request | `/requests/:id/decide` | `decideRequests`; server verifies manager relationship | W | High | `decideRequest` | Same | Approve/reject workflow | Shared action service | Yes | FULL |
| Calendar | Manager calendar, HR calendar | List events by date range; create/delete owned or permitted event | `/calendar` | `manageCalendar` for W | R/W | Medium | Create/delete actions; no structured list/filter answer | Same | Calendar query, create/delete, date range | Shared service plus typed UI command | Delete: yes | PARTIAL |
| Announcements | Manager/HR/admin announcements | List, create, edit, delete announcement | `/feed/announcements` | `postAnnouncements`; manager ownership is verified | R/W | Medium | Create, delete, and a confirmed message-body edit using the existing PATCH route; manager ownership is rechecked there | Same | Read, create, edit, withdraw | Shared feed service | Delete/edit: yes | PARTIAL |
| People directory | HR employees, admin users | List/filter employees; inspect document and employee data | `/employees`, `/employees/:id`, `/employees/:id/documents`, lookup | `viewEmployees`, `lookUpEmployeeFile` | R | Personnel / payroll-adjacent | `employeeFile`, headcount/team reads | Same | Search/filter/open employee entity | Scoped read service + UI effect | No | PARTIAL |
| People administration | HR employees, admin users | Add employee; edit title/department; reset password; change application role | `/employees`, patch, reset-password | `manageEmployees`, `resetPassword` | W | High | All four actions exist | Same | People mutations with clarification | Shared action service | Reset password and role: yes; new/edit: no unless policy adds it | FULL |
| CV and employee documents | HR employees/recruitment | Upload/delete/download CV, view an employee's CV | `/cv` routes + upload storage | `manageCvFiles`; record scope on download | R/W | Sensitive documents | Employee-file read may mention CV; no file actions | No | Document selection/upload/delete/download | Shared CV service, never direct storage access | Delete/upload: yes | MISSING |
| Attendance oversight | HR attendance, manager attendance | Filter/team/org attendance, status chips, remind late checkout | `/attendance/team`, `/stats/*`, reminder route | `viewTeamAttendance`, `viewOrgStats`, `remindCheckout` | R/W | Personnel data | Team/org reads and `remindCheckout` | Same | Filter/sort/date selection; reminder | Query service + typed UI command | Reminder: yes | PARTIAL |
| Leave oversight | HR leaves, manager leaves | Read/filter requests/calendar; decide direct-report requests | Requests and calendar APIs | `viewRequests`, `decideRequests` | R/W | Personnel data | Team pending intent; decision action | Same | Filter by state/date/person, entity open | Existing request service | Decision: yes | PARTIAL |
| HR attention | HR attention | Read missing salary contracts, expiring contracts, pending leave/adjustments, audit findings; follow links | `/hr-attention` | `viewOrgStats` | R | Sensitive HR/payroll | Individual payroll/read intents, not the unified queue | No dedicated support | Read attention queue and navigate to exact item | Existing attention service + typed UI effect | No | PARTIAL |
| Payroll reads | HR payroll | Cycle, runs, salaries, contracts, adjustments, findings, totals, variance, employee pay | Payroll read services and Payroll Agent | `viewPayroll` / payroll intent role gate | R | Highly sensitive | Payroll Agent intents and employee-file payroll report | Same | Payroll specialised-agent query | Registered specialist capability | No | PARTIAL |
| Payroll operations | HR payroll | Calculate run, audit run, approve run, set salary/contract, add adjustment, approve adjustment, review/dismiss/explain finding, confirm settings, export report | `/payroll/*` business routes | `runPayroll`, `setSalary`, `managePayrollSettings` | W | Critical financial | Calculate/audit/approve, set salary, create/approve adjustment, and `reviewPayrollFinding` through the existing review route | Same | Full payroll workflow incl. review/settings/export | Payroll Agent registered actions, then same routes | Run, approve, salary, adjustment, and finding review: yes | PARTIAL |
| Reports & analytics | HR reports, manager reports | Run HR/team reports with periods; print/export; compare departments | Stats/report services and client print | Role-scoped reports | R / export | Sensitive aggregate data | `generateReport`, `myReport`, department/attendance analyses | Same | Query, report generation, chart/export request | Reporting service, then UI rendering/download | Export: no; scheduled/external delivery: yes | PARTIAL |
| Job descriptions | HR job descriptions | List/filter/view; generate/regenerate; edit sections; scorecard edit; approve/delete; create opening | `/job-descriptions/*` + generation service | `manageJobDescriptions` | R/W | Medium–High hiring policy | Generate, regenerate one named section, approve, delete, and create opening | Same | Remaining direct section edits and scorecard workflow | Existing job-description service | Regenerate/approve/delete/create opening: yes | PARTIAL |
| Recruitment openings | HR recruitment | List/create/edit/publish/close/delete job opening; copy public link | `/recruitment/openings/*` | `manageRecruitment` | R/W | High external publication | Create/update/publish/close/delete | Same | Vacancy lifecycle and entity opening | Shared recruitment service | Publish/close/delete: yes | PARTIAL |
| Applicants and CV matching | HR recruitment | List/filter candidates/applications; edit/delete candidate/application; move stage; analyse CV match | `/recruitment/candidates`, `/applications`, analyse route | `manageRecruitment` | R/W | Highly sensitive recruitment data | List applications, move stage, analyse application | Same | Candidate/application query, filters and safe stage workflow | Shared recruitment service | Reject/delete/offer/hire stage: yes | PARTIAL |
| Interview workflow | HR recruitment, candidate interview | Generate questions, view/evaluate results, approve/revise questions, schedule/send interview; candidate answers tokenised interview | Recruitment interview APIs + public `/interview/:token` | HR/admin for HR actions; anonymous token for candidate answer | R/W | Highly sensitive selection data | Generate draft, approve or regenerate one numbered question, evaluate completed answers, and schedule/send an approved interview through the existing routes | Same | Remaining interview-review navigation and result filters | Existing interview service | Generate/review/evaluate/send: yes | PARTIAL |
| Knowledge base / RAG | HR knowledge | List/upload text/file/delete source; ask policy/procedure questions with role audience | `/knowledge/*`; vector retrieval | `manageKnowledge` for management; source audience for reads | R/W | Potentially confidential | RAG answers are source-grounded; the Copilot can add a confirmed text article and remove a uniquely identified article through the same route | Same | Knowledge query plus safe text-source lifecycle | RAG service / knowledge service | Add/delete: yes; file upload and audience changes remain UI-only | PARTIAL |
| Assistant improvement inbox | HR assistant questions | Read questions the assistant could not answer | `/assistant-review/unanswered` | `reviewAssistantQuestions` | R | Sensitive user prompts | Navigation only | Navigation only | Review/filter/open unanswered question | Existing review service | No | MISSING |
| MCP integration | Server MCP | Discover allowed capabilities; query/read; propose/confirm actions from an external agent | `mcp/server.ts` calls the same resolve/execute/perform services | Signed-in MCP account's actual role | R/W | Matches invoked capability | Dynamic actions/intents; confirmation tokens | Voice is separate UI client but same underlying services | Capability discovery and delegation | MCP tool registry; no privileged account bypass | Same as action | PARTIAL |
| Public careers | Careers, job detail | Browse published jobs, choose language, submit an application and CV | Public careers APIs | Public visitor | R/W | Applicant PII | HR can read openings; no visitor-agent action | No | Keep as public applicant workflow, not authenticated HR Copilot action | Public route/token session | Applicant submits explicitly | NOT_SAFE_OR_APPROPRIATE |
| Candidate examination | Public interview | Read timed questions and submit own answers | Token-bound public interview API | Token holder only | W | Assessment integrity | Not available to HR Copilot | No | Keep candidate-owned, token-bound workflow | Public interview service | Answer submission is explicit | NOT_SAFE_OR_APPROPRIATE |
| Browser/system controls | All pages | Clipboard copy, print, visual tour, hover states, local modal animation, DOM-only controls | Browser/local React state | N/A | UI | Low | Not business capabilities | Not voice capabilities | None unless a page formally exposes a typed UI command | Never visual/DOM automation | N/A | NOT_SAFE_OR_APPROPRIATE |

## Functionality gaps by priority

1. **Typed UI-command coverage:** page/tab/entity/filter/sort/date/modal
   commands need a central schema and page handlers. This is the largest gap
   behind “open payroll review but actually land in the chosen review state.”
2. **Payroll parity:** adjustment approval, audit finding review/dismiss/
   explanation, payroll-setting confirmation, salary-contract lookup, and
   report export need to be registered under the existing Payroll Agent.
3. **Recruitment parity:** candidate/application filters and edits, CV-file
   operations, and the complete HR-side interview workflow need safe
   capabilities. Candidate-facing interview answers must stay outside the
   authenticated Copilot.
4. **Job-description parity:** update, regenerate section and scorecard
   operations are present in the UI but not in the action registry.
5. **Operational pages:** notifications, announcement editing, HR attention,
   knowledge-source administration and unanswered-question review need shared
   commands/services.
6. **Reporting:** structured filters/chart/export parameters should be carried
   by the service result, rather than inferred only in prose.

## Proposed Phase 2 architecture

**Foundation completed on 2026-10-15:** `server/src/copilot/capabilities.ts`
now exposes a role-filtered, transport-neutral registry for UI navigation,
read intents and actions. It declares owner (including the Payroll Agent and
RAG), permission, confirmation rule, inputs, result contract and existing
executor. `/api/copilot/capabilities` and MCP capability discovery expose the
same registry. This does not widen any permission or bypass the existing
route/service validation.

### 1. Central Capability Registry

Extend the existing derived `capabilitiesFor(role)` into a typed registry with
one entry per capability:

```ts
{
  id: 'payroll.reviewFinding',
  owner: 'payroll-agent',
  kind: 'read' | 'ui' | 'action',
  inputSchema,
  resultSchema,
  permission: 'runPayroll',
  confirmation: 'required',
  executor: 'payroll.reviewFinding',
  uiEffect: { type: 'navigate', page: 'payrollReview' }
}
```

The registry must be metadata only. The existing route/service remains the
enforcement and source of truth. Action executors call the same domain service
as the UI; UI commands return validated effects that the client applies with
React Router and page state.

### 2. Capability router

`Text/Voice final transcript -> resolve -> capability router -> specialist or
service -> structured result -> client UI effect -> concise response`.

- First attempt exact/phrasebook and typed UI command matching for navigation,
  tabs, periods and filters. This path must not call RAG, a specialist, or an
  LLM when it is not needed.
- Route payroll requests to the Payroll Agent registry entries; route future
  specialists in the same way. The main Copilot orchestrates but never
  reimplements their business rules.
- Use RAG only for a knowledge/policy question or when a registered capability
  explicitly requires a knowledge source.
- When a capability is ambiguous, return a structured disambiguation question,
  never a false success.

### 3. Uniform confirmation and audit

Every write capability has a declared confirmation policy.  The backend creates
the proposal and token, rechecks the real route/business state on confirmation,
then writes an audit event containing actor, capability, target, validated
arguments and outcome. A spoken success response may be produced only after
the service returns success and any UI effect is applied successfully.

### 4. Page adapters, not DOM automation

Each page registers supported typed commands such as `employees.open`,
`employees.filter`, `payroll.selectPeriod`, and `recruitment.openInterview`.
The page converts only valid command payloads to its existing query/state and
uses the normal data source. This allows keyboard, text and voice to share UI
behaviour without simulated clicking or brittle selectors.

### 5. Verification before declaring parity

For every registry entry, add tests for role denial, scope isolation,
validation, proposal/confirmation, service failure, UI-effect acknowledgement,
and text/voice parity. Add an evaluation set containing Arabic dialect phrases,
English phrases, typos such as `التوضيف`, follow-up references, ambiguous names,
and prohibited salary/employee-data requests.

## Phase 2 delivery order

1. Register typed UI commands and implement the navigation/entity/filter/tab/
   period surface across all protected pages.
2. Move all existing Payroll UI operations into the Payroll Agent registry.
3. Add job-description and recruitment/interview/CV capabilities.
4. Add operational capabilities for notification, announcements, knowledge and
   assistant-review pages.
5. Complete report parameters, exports and UI-effect acknowledgements.
6. Run the parity/security/voice evaluation suite and update this matrix with
   verified `FULL` statuses only.
