# AI data classification

Phase 1A security audit, 2026-10-22 (Asia/Riyadh). Project: `C:\Users\PC-LAB\Downloads\hr-app-step2`. Static source and artifact inspection only; no database reads, model calls, benchmark execution, or remediation. Classification below is a proposed policy, not an assertion that all controls are implemented.

The frozen system has 32 intents and 48 action subtypes. The model's job is to understand language and propose a typed plan. Neither its output nor its training data establishes a person's permissions. See [authorization boundary](04-authorization-and-rbac-boundary.md).

## Levels applied to actual data

| Level | Actual examples and source | Handling rule |
|---|---|---|
| L1 — Public / low sensitivity | Generic page names, public navigation terminology, public vacancy text, genuinely published company information. Maintained page/task descriptions: [guide/pages.ts](../../../server/src/guide/pages.ts), [guide/tasks.ts](../../../server/src/guide/tasks.ts) | Public only after publication review. Internal page capabilities can still depend on role. Generic policy wording is not automatically public merely because it is generic. |
| L2 — Internal | Department labels, internal workflows, role capability maps, non-sensitive operational totals, unpublished vacancy descriptions and internal policy text. [intents.ts](../../../server/src/copilot/intents.ts), [knowledge/service.ts](../../../server/src/knowledge/service.ts), [reports/build.ts](../../../server/src/reports/build.ts) | Require internal access and appropriate document audience. Small-group totals can become L3 through inference. |
| L3 — Confidential employee / applicant | Names, employee numbers, contact information, manager relationships, attendance, leave balance, overtime hours, request history, performance/interview assessments, CVs, HR documents and identifying document metadata. [schema.ts](../../../server/src/db/schema.ts), [employeeFile.ts](../../../server/src/reports/employeeFile.ts), [execute.ts](../../../server/src/copilot/execute.ts) | Purpose-limited role and record scope. No real values in fine-tuning data. Medical reasons and monetary pay details escalate to L4. |
| L4 — Restricted | Salary agreements, payslips, payroll adjustments, overtime pay, deductions, bank details if supplied in free text/files, national-ID/passport documents, medical/disciplinary details, passwords/hashes, session cookies/tokens, API keys and connection credentials | Narrow backend authorization plus minimum necessary processing. Secrets are never model, speech-output, logging or training content. A user typing a restricted value does not make onward disclosure permissible. |

Sources include [shared schemas](../../../shared/src/index.ts), [database schema](../../../server/src/db/schema.ts), [CV analysis](../../../server/src/ai/analyseCv.ts), and [interview evaluation](../../../server/src/ai/evaluateInterview.ts). No real record values were inspected or copied for this audit.

There is no dedicated bank/IBAN or employee-address column identified in the inspected schema; those values can still enter uploads, CVs, request reasons, interviews or speech. National-ID document types exist. Absence of a dedicated column is not a privacy control. A sick-leave category is employee data; a diagnosis is restricted medical information. Overtime hours and overtime pay must not be treated as the same sensitivity category.

## Derived and mixed data

Use the highest sensitivity present in a payload, including metadata and combinations. An anonymous-looking department total can identify a person in a one-person department. A filename, exact date, job title, location and event description can jointly identify someone. A hash or pseudonym with a retained mapping remains linkable data; it is not automatically anonymous.

An employee identifier inside a plan is L3 even if no employee record has yet been fetched. A salary amount inside an instruction is L4 even when it is not a stored payroll result. Raw questions, model outputs and transcripts inherit the sensitivity of their contents, not the name of the table or service holding them.

## Where data actually flows

```text
Browser text / microphone
  -> authenticated HTTP Copilot / Voice route
  -> terminal or deterministic/phrasebook/training resolver
  -> if unresolved: selected question model (question + role + examples + optional prior plan)
  -> candidate plan -> shared Zod + semantic validation
  -> mayAsk / mayDo -> service record-scope checks -> fixed database queries / domain routes
  -> authorized result -> optional narration / knowledge answer -> browser / speech

Knowledge upload: HR/admin -> extract text -> audience + chunks -> optional embeddings -> DB
Knowledge question: authenticated role -> optional query embedding -> audience-filtered retrieval
  -> optional external answer generation from authorized excerpts -> response

MCP client -> startup login -> captured actor + role-filtered tools
  -> direct fixed read executor / action proposal -> domain write routes -> tool result to client
```

Authentication precedes HTTP classification, not the reverse: [middleware.ts:31](../../../server/src/middleware.ts), [routes/copilot.ts:77](../../../server/src/routes/copilot.ts), [routes/voice.ts](../../../server/src/routes/voice.ts). Question-model input is sent before intent-specific permission checking; it should therefore contain language input rather than fetched HR results. Current raw input is not automatically masked. Session validation itself necessarily reads authentication records before business authorization.

The diagram is the normal design, **not a blanket security guarantee**. The report-subtype scope gap, cached MCP identity and pre-scope employee lookup are documented in [findings](07-security-audit-findings.md). MCP reads do not fully traverse the HTTP validation and reauthentication path.

## Ownership and release decisions

HR/data owners classify business records and source audiences; security owners classify credentials and approve egress; experiment owners admit only reviewed synthetic data. Ordinary self-service authorization does not authorize publishing records to a model vendor or training set. A locally hosted model still needs data minimization, restricted access and retention rules.

The [access matrix](02-ai-access-matrix.md) defines intended component access. The [training policy](03-fine-tuning-data-policy.md) is stricter than operational access: real L3/L4 facts are prohibited even when an authorized HR user can view them in the application.
