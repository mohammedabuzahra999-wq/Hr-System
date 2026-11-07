# AI component access matrix

Audit date: 2026-10-22. **This is the proposed access policy. It is not a new runtime enforcement mechanism.** The observed implementation and gaps are separated below. Data levels are defined in [classification](01-ai-data-classification.md).

## Decision vocabulary

* **ALLOW**: permitted for the declared purpose; normal access controls still apply.
* **ALLOW AFTER AUTHORIZATION**: the backend must verify current identity, capability and record/document scope before releasing data.
* **MINIMIZE**: include only indispensable fields/segments; no bulk record/context transfer.
* **MASK**: remove or replace identifying values before this boundary. Reversible mapping, if needed, stays on the authorized server.
* **DENY**: no intentional delivery or retention in this component.

Approval for business use, consent to audio transport and approval for external-model processing are separate decisions. Credentials are DENY in every AI/data-export component; authentication services are the narrow exception that must process them for authentication.

## Proposed component policy

| Component | L1 public | L2 internal | L3 employee/applicant | L4 payroll / identity / health | Credentials / tokens |
|---|---|---|---|---|---|
| Local deterministic / phrasebook / training resolver | ALLOW | MINIMIZE | MINIMIZE identifiers supplied in request; no record fetch for language routing | MINIMIZE indispensable instruction slots; DENY unrelated record contents | DENY |
| External LLM intent/action resolver | ALLOW | MINIMIZE role/capability descriptions | MASK names/contact/IDs where a reviewed mapping can preserve extraction; otherwise separately approve minimum necessary input | DENY real records; MASK indispensable instruction amounts/identifiers before approved egress | DENY |
| Future fine-tuned inference model, local | ALLOW | MINIMIZE | MINIMIZE request entities only; no assumed access to records | MINIMIZE necessary typed request slots; DENY unrelated restricted context | DENY |
| Future fine-tuned inference model, external | ALLOW | MINIMIZE | MASK under the same external-resolver policy | DENY real restricted facts; MASK necessary request slots | DENY |
| Role-filtered knowledge retrieval / local RAG storage | ALLOW | ALLOW AFTER AUTHORIZATION | DENY individual HR records in the current role-only knowledge collection; a future record-ACL design would need separate approval | DENY restricted employee records in this collection | DENY |
| External embeddings / RAG answer model | ALLOW | MINIMIZE authorized source excerpts and query | MASK incidental PII; DENY individual HR records in current collection | DENY | DENY |
| MCP read/write service and returned tool result | ALLOW AFTER AUTHORIZATION | ALLOW AFTER AUTHORIZATION | ALLOW AFTER AUTHORIZATION, restricted to task and record scope | ALLOW AFTER AUTHORIZATION only for explicitly permitted payroll/HR operations; MINIMIZE | DENY; authentication session stays server-side |
| Local STT | MINIMIZE captured audio | MINIMIZE | MINIMIZE authenticated user's necessary utterance | MINIMIZE unavoidable incidental speech; no retention or onward reuse | DENY intentional capture; treat accidental speech as restricted |
| External Realtime / STT | MINIMIZE with approved audio transport | MINIMIZE with approved audio transport | MINIMIZE only after separate egress approval; no claim that business RBAC pre-screens speech | DENY intentional restricted record dictation; incidental audio needs restricted-data controls | DENY |
| Local TTS | ALLOW | MINIMIZE | ALLOW AFTER AUTHORIZATION, prefer short acknowledgements | MINIMIZE only authorized necessary speech, prefer on-screen restricted details | DENY |
| External TTS / Realtime output | ALLOW | MINIMIZE | MASK or use generic acknowledgements | DENY restricted values in the default policy | DENY |
| Backend HR/payroll service | ALLOW AFTER AUTHORIZATION | ALLOW AFTER AUTHORIZATION | ALLOW AFTER AUTHORIZATION | ALLOW AFTER AUTHORIZATION at role + record + operation scope | MINIMIZE within authentication-only functions; no business-result export |
| Operational logs | ALLOW fixed codes | MINIMIZE | MASK identifiers; DENY raw record/prompt/transcript text | DENY raw values | DENY |
| Security audit store | MINIMIZE | MINIMIZE | MINIMIZE access-restricted actor linkage and controlled outcome codes | DENY business values; record only permission decision codes | DENY |
| Analytics / experiment metrics | ALLOW aggregate measures | MINIMIZE | MASK / aggregate; suppress identifying small groups | DENY raw values | DENY |
| Training / annotation / validation-data pipeline | ALLOW reviewed non-evaluation material | MINIMIZE reviewed generic language | DENY real values; use independent synthetic entities / placeholders | DENY real values, including real salaries | DENY, including secret fragments |

Local STT cannot redact speech before recognizing it. Its MINIMIZE policy therefore means limited recording, authenticated processing, no default storage and no secondary use, rather than a nonexistent pre-transcription PII filter. Current TTS is not a content classifier; a short response is a minimization convention, not a proof that all spoken text is non-sensitive.

## Observed implementation versus policy

| Area | Implemented now | Gap / implication |
|---|---|---|
| Question providers | [structuredProvider.ts](../../../server/src/ai/structuredProvider.ts) selects OpenAI or Ollama explicitly; schema validation is performed, no automatic provider fallback | `AI_PROVIDER` governs question generation, not every AI call. Raw questions and optional prior plans can contain real names/IDs. No masking/restoration bridge exists. |
| Action resolution / continuation / prose | [resolve.ts](../../../server/src/copilot/resolve.ts) retains OpenAI action/continuation paths. `phraseAnswer` checks `AI_SHARE_DATA`; [narrate.ts](../../../server/src/reports/narrate.ts) does too | Input classification and task continuation are not suppressed by that flag. Authorized results can enter external prose when sharing is enabled. Approval to query is not itself approval for egress. |
| Other AI | CV analysis checks sharing; interview generation/evaluation and embedding helpers do not consistently check it. [interviewReview.ts](../../../server/src/ai/interviewReview.ts), [evaluateInterview.ts](../../../server/src/ai/evaluateInterview.ts), [retrieval.ts](../../../server/src/ai/retrieval.ts) | Do not treat `AI_SHARE_DATA=false` or local question routing as a system-wide no-cloud guarantee. Defaults and prior key presence are not durable security controls. |
| Knowledge | [service.ts](../../../server/src/knowledge/service.ts) uses trusted role audience in both retrieval SQL branches and sharing checks around its embedding/answer calls | Role ACL does not provide per-employee scope or detect sensitive source contents. Upload audience can default to all roles. |
| MCP | Startup authentication and role-generated tools exist; tools return business results to the client | Cached identity, direct read executor, uneven semantic/HTTP-boundary parity. External agent/model receives tool results regardless of `AI_SHARE_DATA`. |
| Voice | Local Whisper/Piper and optional OpenAI Realtime are separate audio paths; owned sessions and normal Copilot business checks | Raw speech is potentially L3/L4; transcripts can reach retained Copilot questions. Local question provider does not force local audio or every subsequent model call. |
| Logs / analytics | Controlled routing and audit metadata exist; timing/token counters exist | Raw review questions, normalized memory, generation inputs and unredacted error paths are separate from those safe metadata logs. No separate external analytics service was established by this review. |
| Fine-tuned model / training | No new model, dataset export or fine-tuning pipeline was started for this experiment | Matrix rows are future requirements, not claims of implemented redaction or approved training. |

The complete per-path evidence and required fixes are in [authorization](04-authorization-and-rbac-boundary.md), [RAG/MCP/Voice](05-rag-mcp-voice-security.md), [logging](06-logging-and-pii-policy.md), and [findings](07-security-audit-findings.md). No settings, prompts or access rules were changed.
