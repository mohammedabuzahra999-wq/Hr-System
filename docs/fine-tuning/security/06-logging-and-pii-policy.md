# Logging, PII and retention policy

Static audit, 2026-10-22. The source-level sinks below were inspected; live logs, database contents, historical backups and provider dashboards were not mined. **No logging behavior or retention job was changed.** Recommended policy is distinct from current behavior.

## Actual sinks

| Sink / evidence | Contents currently possible | Security interpretation |
|---|---|---|
| [copilot/audit.ts](../../../server/src/copilot/audit.ts), `assistantAuditEvents` | User ID, role, event/intent/action/status, controlled reason, channel, ephemeral Voice session ID and timestamp | Deliberately avoids raw questions, names, parameters and answers. Still linkable personal metadata; access/retention required. |
| Routing/validation console events, [routes/copilot.ts](../../../server/src/routes/copilot.ts) | Routing source/rule/outcome, fixed validation codes, role, selected intent/action, success/refusal | Suitable basis for safe observability. Do not add candidate/prompt/result dumps to diagnose failures. |
| [unanswered.ts](../../../server/src/copilot/unanswered.ts), review inbox [assistantReview.ts](../../../server/src/routes/assistantReview.ts) | Exact question, actor ID/role, intent/reason | Can contain employee names/IDs, salary, medical text or a Voice transcript. HR/admin review is restricted, but text is not anonymized. |
| [memory.ts](../../../server/src/copilot/memory.ts), `assistantMemory` | Normalized full question, role, learned intent/action, acceptance/rejection/refusal counters | Normalization does not remove entities. Text can retain names/amounts; no separate parameter columns does not mean no PII. |
| [conversation.ts](../../../server/src/copilot/conversation.ts), [context.ts](../../../server/src/copilot/context.ts), [voice/session.ts](../../../server/src/voice/session.ts) | Expiring prior plans, selected context, pending fields, Voice transcript/answer/proposal caches | Sensitive in-memory state, not anonymous telemetry. Voice cache roughly five minutes/session twenty; conversation context roughly five. |
| [idempotency.ts](../../../server/src/copilot/idempotency.ts), `assistantActionExecutions` | User-operation-action linkage, state and serialized outcome | Messages/paths/created identifiers can be identifying. Not a training dataset. |
| [routes/jobDescriptions.ts](../../../server/src/routes/jobDescriptions.ts), `aiGenerations` | Generation input object, actor/document links, model/prompt version, usage/duration/outcome | Not the complete rendered prompt, but free text in the input can contain PII. |
| CV analyses, interview answers/evaluations, HR tables, knowledge chunks | Business content, applicant evidence, names, attendance/payroll or source text depending on table | Business records, not safe logs. Model output stored here can be sensitive even if structured. |
| [index.ts:60](../../../server/src/index.ts), `logger()` and error handler | HTTP method/path/status/timing; full unhandled error on console; non-production error response may include stack | Paths can contain IDs; error objects can include SQL/provider context/parameters. Production browser errors are generic; developer stacks are not redacted. |
| Model/RAG/report error catches | Truncated `String(error)`; some full error objects | Truncation is not redaction. Upstream error text may quote inputs. No universal secret/PII sanitizer was demonstrated. |
| [analyseCv.ts:166](../../../server/src/ai/analyseCv.ts) | Filename and extraction reason/detail | Filenames often identify applicants; paths/details can be sensitive. |
| [mcp/server.ts](../../../server/src/mcp/server.ts) | Login/startup account email; stdout tool arguments/results as protocol content | Protocol output may contain names/payroll and reach an external agent. Not a dedicated minimized tool audit. External client logs/retention are unknown. |
| Local speech worker | Content logging disabled; native stdout/stderr suppressed; health/timing codes | Positive control for the worker only. Downstream Copilot stores still receive transcripts. |
| Existing diagnostic/profile scripts and reports | Synthetic prompts/transcripts/results/timings by intended fixture design | Do not substitute real recordings or copied user questions. No diagnostic run or new report was created here. |

No automatic purge/retention schedule was found for the inspected unanswered/memory/generation stores. Deployment database retention/backups and provider-side retention were not verified. No separate third-party analytics integration was established; token/timing/audit counters are analytics-like metadata.

## Required field policy

| Class | Rule | Examples |
|---|---|---|
| **SAFE TO LOG** | Controlled enums, aggregate counters, monotonic durations, non-secret versions | Routing source/rule, selected intent/outcome, fixed schema/semantic issue code, allow/deny reason code, HTTP/provider status, timeout flag, model/provider name, input/output token counts, dataset version/hash |
| **MASK BEFORE LOGGING** | Use purpose-limited, access-restricted identifiers; normalize route templates; suppress small identifying groups | Actor/employee/record/session IDs, email, phone, filenames, paths containing IDs, department-level small counts, correlation IDs linked to an individual. Prefer keyed pseudonyms for analytics; hashing alone is not anonymity. |
| **DO NOT LOG** | No raw content or secret-bearing error object in ordinary operational/analytics logs | Raw prompts, questions, transcript/audio, model response bodies, salary/pay tables, attendance rows, CV/interview answers, medical/disciplinary narrative, RAG chunks, full MCP arguments/results, tokens/cookies/passwords/API keys/connection strings |

An authorized HR business record or security case may require restricted storage of a specific event. That must be a separately governed record with a defined purpose/access/retention, not an exception allowing raw content in general console logs. Existing review text and generation inputs need that decision; this policy does not pretend they have been removed.

## Recommended implementation controls for a later approved phase

1. Define centralized allowlisted events and sanitize unexpected errors before logging or development-client return. Record controlled error categories/provider status, not response bodies or SQL bind values. Reject all credentials rather than retaining useful prefixes.
2. Separate security audit, product diagnostics, user review and business-record storage. Give each an owner, access policy and explicit retention/deletion schedule, including backups and exports. Expiring process memory is not deletion of separately persisted questions.
3. Preserve accountability through restricted actor linkage in the security audit; aggregate/pseudonymize for analytics. Do not silently remove the evidence needed to investigate unauthorized operations.
4. Minimize or tokenize review/memory text before any future research export. Consent and role permissions do not automatically authorize fine-tuning reuse. Default training export is DENY.
5. Add controlled MCP tool name/decision/duration/correlation audit without argument/result payloads, and remove account-email console output. Review the external client's logs independently.
6. Test failure paths with synthetic canaries for names, payroll, health and credentials. No real secret should be used as a test marker. Keep test artifacts away from the frozen evaluation set.

## Safe experiment observability

For a later approved isolated run, retain fixture ID, expected/actual intent and non-sensitive synthetic fields, validation result, permission outcome, routing source, timeout/error category, monotonic latency and token counts. Do not attach production user IDs, real record values, raw Voice recordings or secret headers. Provider error diagnostics should whitelist safe status/rate-limit metadata, not dump a complete response or request object.

These recommendations correspond to SEC-05/06/08 in [findings](07-security-audit-findings.md). They were documented only; no logger, schema, database row, retention setting or existing experiment artifact was altered.
