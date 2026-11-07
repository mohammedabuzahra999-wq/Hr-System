# Privacy, PII and future anonymization audit

Date: 2026-10-22. Source inspection only. No employee data, live database, private document, voice recording, routing-memory row, or unanswered-question record was exported. No provider API was called. Findings describe reachable code, not proof that a particular employee's information has been transmitted.

## Data sent to language/audio providers

| Path and code evidence | Data that can leave the application boundary | Existing gate / limitation | Finding |
|---|---|---|---|
| [resolve.ts](../../server/src/copilot/resolve.ts) `resolveQuestion` + [structuredProvider.ts](../../server/src/ai/structuredProvider.ts) | Raw user question, actor role, selected language examples, prior structured plan (can contain name/employee number/department) | Explicit OpenAI/Ollama selection; allowed-intent prompt; Zod output checks | No input PII redaction; `AI_SHARE_DATA=false` does not suppress classification text. Local Ollama is a separate process; its configured URL is not intrinsically required to be loopback |
| Same file `resolveAction` | Instruction including supplied name, amount, email, employee number, title/free text; role/date/page context | OpenAI key; local candidate recovery when key absent; action permission gates later | OpenAI-only; not controlled by `AI_PROVIDER`; permission gates do not anonymize the request already sent |
| Same file `continueTask` | Reply plus collected action-plan fields and the missing-field question | OpenAI key; current action category retained | Collected fields can contain PII and sensitive reasons; no `AI_SHARE_DATA` guard here |
| Same file `phraseAnswer` | Raw question and up to 4000 serialized result characters | `AI_SHARE_DATA` and OpenAI key; Voice bypasses this step | Names, pay/statistics/results can be sent when enabled; truncation is not redaction |
| [reports/narrate.ts](../../server/src/reports/narrate.ts) | Report section data, up to 12000 serialized characters | `AI_SHARE_DATA` + OpenAI key; Voice bypasses narration | Employee file sections can include name, employee number, email, leave/pay/document facts. Output rules do not remove PII from the input |
| [knowledge/service.ts](../../server/src/knowledge/service.ts) | Uploaded knowledge chunks for embeddings; query for semantic retrieval; retrieved title/excerpts for answer writing | Sharing gate/key; SQL filters `visibleTo` by actor role before returned passages | Document audience prevents cross-role retrieval, but an allowed source can itself contain employee data. No upload-time PII sanitizer found |
| [ai/retrieval.ts](../../server/src/ai/retrieval.ts), [ai/openai.ts](../../server/src/ai/openai.ts), [ai/claude.ts](../../server/src/ai/claude.ts), [routes/jobDescriptions.ts](../../server/src/routes/jobDescriptions.ts) | Job-description briefs, regeneration instructions/current content, approved example text, titles for embeddings/suggestions | Key-based provider choice; approved-doc retrieval | JD can include company/person facts in free text. These paths do not consistently consult `AI_SHARE_DATA`; it is not a global provider-egress switch |
| [ai/analyseCv.ts](../../server/src/ai/analyseCv.ts), [ai/screening.ts](../../server/src/ai/screening.ts) | Extracted full CV text and role criteria, plus aggregate past-hire evidence | `AI_SHARE_DATA` and OpenAI key | Prompt says ignore protected characteristics, but raw CV text is still transmitted when enabled; not anonymized on input |
| [ai/interviewReview.ts](../../server/src/ai/interviewReview.ts), [recruitment/interview.ts](../../server/src/recruitment/interview.ts) | Professional evidence from stored CV analysis, criteria, question-revision instructions | OpenAI key; approved/reviewed hiring workflow | No `AI_SHARE_DATA` guard found in these paths/callers. “Never name employer/school” is an output instruction, not input removal |
| [ai/interview.ts](../../server/src/ai/interview.ts) | Criteria and CV-analysis evidence in the legacy generator | OpenAI key | Source exists; current recruitment flow uses `generateAssessmentQuestions` in interviewReview. Do not count the older function as confirmed active production traffic |
| [ai/evaluateInterview.ts](../../server/src/ai/evaluateInterview.ts) | Written interview questions/answers and criteria | OpenAI key; interview state conditions | Answers can disclose personal/medical/contact information. No sharing gate or content anonymizer found here |
| [payroll/auditAi.ts](../../server/src/payroll/auditAi.ts) | Finding facts and deterministic explanation | `AI_SHARE_DATA` + OpenAI key | “Do not include names/numbers” limits output, not facts in request |
| [guide/answer.ts](../../server/src/guide/answer.ts) | Question, role, current page, role-visible guide entries | Local help first, then OpenAI key | Maintained guide entries have no employee records; user's own question can still contain PII |
| [voice/realtime.ts](../../server/src/voice/realtime.ts), [useVoiceCopilot.ts](../../hr-app/src/features/copilot/useVoiceCopilot.ts) | Microphone audio and dictated incidental information; supplied trusted spoken response | Explicit OpenAI Voice + enabled + audio sharing + key; tools empty, tracing null | Text-provider selection does not prevent audio being sent to OpenAI when this separate provider is chosen. `tracing:null` is not a guarantee of provider-wide retention/training policy |
| [voice/local.ts](../../server/src/voice/local.ts), [worker.py](../../server/local-voice/worker.py), [stt_runtime.py](../../server/local-voice/stt_runtime.py) | Audio to loopback worker/native Whisper, text to local Piper | Authenticated owned session, worker bearer credential, loopback-only URL; no proxy/redirect, bounded payload | No cloud audio egress in local path. Transcript can subsequently reach chosen text model or retention tables. Native logs suppressed; per-turn audio handled in memory |
| [benchmark/openrouter.ts](../../server/src/copilot/benchmark/openrouter.ts), runner | Synthetic captured benchmark prompts, labels and synthetic identifiers only by intended runner design | Benchmark-only modules, fixed fixture guard; not production provider | Existing synthetic data does not establish a sanitizer for future imported cases. Never replace fixtures with production questions casually |

Current saved configuration has no usable OpenAI/Anthropic key, so the corresponding live calls cannot authenticate. That is current absence of capability, not a durable privacy control if a key is added later. No inference was attempted here. Provider retention, account training settings and deployment policies cannot be verified from this repository. No explicit provider fine-tuning/upload/job creation code was found in the inspected application source.

## Data retained locally or in the database

| Location | Actual retained information / evidence | Risk for later dataset extraction |
|---|---|---|
| [copilot/memory.ts](../../server/src/copilot/memory.ts), `assistantMemory` in [schema.ts](../../server/src/db/schema.ts) | Normalized full question text, role, intent/action, acceptance/rejection/refusal counters, timestamps | “Never parameters” means no separate parameter columns, **not** removal of names/amounts embedded in the question. Not anonymous. Acceptance of a read is weak implicit feedback, not reviewed ground truth |
| [copilot/unanswered.ts](../../server/src/copilot/unanswered.ts), `assistantUnansweredQuestions` | Exact question, actor linkage, role, chosen intent/refusal | Can contain any PII typed or transcribed. Terminal refusals/clarifications also reach this store. [assistantReview.ts](../../server/src/routes/assistantReview.ts) restricts review to HR/admin but does not anonymize it |
| [copilot/audit.ts](../../server/src/copilot/audit.ts), `assistantAuditEvents` | User ID/role/time, event/intent/action/status/reason/channel/ephemeral Voice session ID | Safer than chat logs; still linkable personal metadata. Not raw-text training material |
| [copilot/idempotency.ts](../../server/src/copilot/idempotency.ts), `assistantActionExecutions` | User-bound operation/action/status plus serialized action outcome | Despite compact-storage comments, outcome can contain free-form messages/navigation paths/created identifiers. Review before export; not a blanket “no PII” guarantee |
| [routes/jobDescriptions.ts](../../server/src/routes/jobDescriptions.ts), `aiGenerations` | Generation input object, actor/job-description link, model/prompt version, usage/timing/outcome | Retains free-text input; not the complete rendered prompt, but can still contain sensitive text |
| HR tables / uploads / CV analyses / interviews / knowledge chunks | Names, numbers, email; candidate phone; payroll records; leave/request reasons; uploaded documents; full knowledge text; CV evidence and written interview answers | These are business records, not language-training sources. Avoid copying actual contents at all |
| [copilot/conversation.ts](../../server/src/copilot/conversation.ts), [context.ts](../../server/src/copilot/context.ts), [voice/session.ts](../../server/src/voice/session.ts) | In-memory prior plan, pending action fields/UI references, cached Voice transcript+answer, proposals | Process-local and expiring (5-minute context, 20-minute Voice session), but sensitive while present; can enter continuation prompts |
| [CopilotPanel.tsx](../../hr-app/src/features/copilot/CopilotPanel.tsx), Voice hooks | Browser component state, transcript, authorized result, temporary audio object URLs | Not persistent localStorage chat history here. Screen capture/devtools/manual exports can still reveal data |
| Source JSONL / phrasebook / corpus / conversation fixtures / saved reports | Existing language examples, synthetic names and annotations; diagnostic transcripts/results summaries | Existing training-like assets need provenance/license/PII review. Names that look synthetic are not proof that every row is anonymous |
| Error/development logs | Hono logs method/path/status; routing/validation emits fixed codes. Other handlers stringify errors, CV extraction logs filenames; MCP sign-in error includes configured email | No universal redaction layer demonstrated. Upstream/DB errors or filenames may contain sensitive details. Do not export `.local-dev` logs or backups as datasets |

No automatic deletion/retention policy was found in the inspected memory/unanswered/generation logging paths. This is a code finding, not a complete deployment/backups/DB-policy audit. Historical backups/recovery snapshots were not mined for personal data.

## PII categories specifically checked

| Category | Current representation / reachable exposure |
|---|---|
| Employee names / IDs | Explicit `users` fields, entity plans, report sections, user questions, routing memory, MCP results |
| Email | Users/candidates, add-employee instructions, employee-file details, CV text, possible logs |
| Phone | Explicit candidate phone; CV/interview/free text can carry additional phone values |
| Salaries / allowances / deductions | Salary agreements, payslips, payroll runs/adjustments, person payroll reports, narration/input text |
| Bank data / IBAN | No dedicated bank/IBAN column was found in the inspected shared schema/DB schema; uploaded documents, CVs or free text can still contain it. Absence of a column is not protection |
| National IDs | Document-kind enum includes `nationalId`; file contents/user text can carry actual identifiers |
| Addresses | No dedicated employee address column found in inspected user schema; CVs/documents/free text may carry addresses |
| Medical information | Sick leave category, request reasons, attachments, CVs/interview answers and incidental voice speech can reveal it; no specific safe-to-export medical dataset exists |
| Other HR records | Attendance/activity, manager/team membership, dates of employment, requests, hiring stages, interview responses and document metadata can identify people in combination |

No real values from these categories are reproduced in this documentation.

## Authorization and exposure findings

**Static report scope gap:** [routes/copilot.ts](../../server/src/routes/copilot.ts) allows `myReport` for all roles through `mayAsk`, passes `self:true` into `buildReport`, and allows a schema-valid report subtype. [reports/build.ts](../../server/src/reports/build.ts) resolves a narrow scope, but `buildRecruitment(p)` and `buildDepartment(p)` do not accept/use it and the result is explicitly whole company. A manager admitted to `generateReport` has the same subtype issue. Shared semantics do not reject these combinations. This needs subtype/record-scope tests before any safety claim; do not train the model to avoid a path and treat that as authorization enforcement. No live exploit/record access was performed.

**Employee read lookup minimization:** employee report matching queries global users first (up to two matches) and then checks manager ownership before returning a report; action lookup instead scopes SQL first. Neither authorizes arbitrary model-supplied IDs. The former is a minimization/ambiguity behavior difference, not evidence that a manager receives forbidden payroll. `buildEmployeePayrollReport` explicitly admits HR/admin only.

**RAG:** role audience is part of SQL, but sources have role-level rather than per-employee row scope. A document visible to everyone must not contain an individual's confidential HR records merely because an uploader selected that audience. Source text is untrusted reference content; prompts resist embedded instructions, but no proof of comprehensive prompt-injection resistance was established here.

**MCP:** role-filtered tools can return full authorized HR results to an external client/agent. `AI_SHARE_DATA=false` does not disable MCP result delivery. Typed reads bypass the HTTP terminal/shared semantic path; captured sign-in actor can become stale for direct DB reads after role/session changes. MCP write routes reauthenticate the cookie. The external client's retention/model policies are not governed by the application flags. No MCP service was started or called in this audit.

## Proposed anonymization strategy (future work only)

The training target should be language understanding: existing intent/action, ownership/scope, extracted spans/slots, supported periods, and clarification need. It must not contain database answers, salaries actually earned, identity profiles, bank/national IDs, documents, CVs or completed employee records.

| Source value type | Future replacement in reviewed examples |
|---|---|
| Employee/applicant name | `<EMPLOYEE_NAME_1>` / `<APPLICANT_NAME_1>`; distinct indexes for distinct people |
| Employee number / record UUID | `<EMPLOYEE_ID_1>` / `<RECORD_ID_1>` |
| Email / phone | `<EMAIL_1>` / `<PHONE_1>` |
| Salary/adjustment amount supplied in an instruction | `<SALARY_AMOUNT_1>` / `<ADJUSTMENT_AMOUNT_1>`; preserve semantic amount type/currency, never real pay facts |
| IBAN/bank account / national ID / address | `<BANK_ACCOUNT_1>` / `<NATIONAL_ID_1>` / `<ADDRESS_1>`; prefer excluding unnecessary text entirely |
| Medical detail / reason | Exclude clinical detail; only a reviewed minimal task label or `<SENSITIVE_REASON>` when language structure requires it |
| Company/department/customer/project names | Neutral typed markers where specific identity is unnecessary |

Proposed workflow:

1. Start with documented synthetic/consented language patterns, not a bulk export of HR tables, logs, CVs, recordings or unanswered questions. Any later source export requires separate approval/access control and provenance review.
2. Redact **before** third-party annotation or dataset upload. Use structured field rules plus Arabic/English entity recognition, deterministic email/phone/ID/account detectors and human review. Regex alone will not reliably find names or medical details. Reject secrets wholesale; do not retain masked credential fragments.
3. Replace the same entity consistently within a turn and multi-turn episode, including gold outputs. Keep distinct people distinct and preserve self/team/company possessives, negation, conjunctions, role-dependent expected decisions, and required clarification. Do not globally collapse two employees into the same marker.
4. Preserve language signals (Jordanian constructions, code switching, apostrophes/hyphens, Arabic orthography) without preserving identity facts. Future wholly invented names/IDs can supplement placeholders if specifically authorized. No such examples were created here.
5. Placeholder-only training can make extraction unrealistically easy and fail on real names. Future evaluation must include held-out, entirely synthetic natural name forms and span-level extraction, not reward a model for always emitting `<PERSON>`. If a future runtime uses pre-tokenized identities, mapping/restoration must be server-side and validated; there is no such bridge in current production code.
6. A pseudonym map stays local, access-restricted and outside dataset/model storage; prefer discarding it after review. A stable reversible mapping is pseudonymization, not proof of anonymization. Remove combinations of exact dates, departments, titles and rare events that re-identify a person.
7. Independently review gold intent/entities against the actual registry/executor limits. Empty historical `parameters` cannot be accepted as extraction truth. Reject conflicting labels; do not infer a correct label from implicit “accepted” memory.
8. Group normalized duplicates, paraphrase/template families, translations, all turns of an episode and paired audio/transcript together **before** train/dev/test splitting. Existing 10k rows have only 3440 distinct exact texts. The runtime also sees many of these examples, so “held out from fine-tuning” alone is insufficient.
9. Scan every input/output/metadata column for PII/secrets; manually inspect stratified samples; store only approved files in a dedicated restricted experiment location with retention/deletion decisions. Preserve counts/hashes/provenance, not original sensitive text in the experiment log.
10. Approve the dataset and chosen provider's retention/training policy separately before any upload. Model fine-tuning must never grant permissions or replace database retrieval.

All items in this section are proposals. No redactor, export, dataset, token mapping, training job or application privacy behavior was implemented.
