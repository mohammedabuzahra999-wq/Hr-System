# RAG, MCP and Voice security

Phase 1A static review, 2026-10-22. No services were started or called, no documents/audio/records were uploaded or retrieved, and no behavior was changed. Statements concern inspected source, not deployment/network/vendor certification.

## RAG: permissions, context and data reuse

[routes/knowledge.ts](../../../server/src/routes/knowledge.ts) requires authentication and `manageKnowledge` (HR/admin) for list/create/upload/delete. Uploads accept validated PDF/DOCX/TXT/MD, at most 8 MB, extracting at most 80,000 text characters in [extract.ts](../../../server/src/knowledge/extract.ts). Original uploaded bytes are not retained by this knowledge flow; extracted text, title, filename, chunks and optional vectors are retained. This is not a claim about separate CV/HR upload storage.

[service.ts](../../../server/src/knowledge/service.ts) chunks text (1,500 characters, 180 overlap, at most 60) and optionally embeds it when `AI_SHARE_DATA` permits. `findKnowledge` uses the trusted role as a SQL audience predicate in both vector and keyword paths. A role excluded from a document's `visibleTo` is not supposed to retrieve it through these queries. Query embedding occurs before retrieval and can send sensitive raw question text to OpenAI when enabled.

Retrieved context is limited to selected documents, and answer generation sends source titles/excerpts plus the question, not the entire knowledge database. Without a model, relevant excerpts can still be returned. The answer prompt treats source instructions as untrusted reference data; this is useful defense but not a replacement for SQL access control.

Important limits:

* Audience is role-level, not per-employee/per-case ACL. A broad audience cannot safely represent an individual's confidential HR file. No PII screening/redaction gate was found before embedding/storing source content.
* `parseAudience` defaults a missing upload audience to all four roles. A trusted uploader can unintentionally publish employee/restricted contents broadly (SEC-07). SQL then correctly enforces an overly broad label; that is still a disclosure risk.
* Authorized excerpts can contain PII and reach a provider; authentication alone does not approve that egress. Embeddings are derived data, not proof that the original text has become anonymous.
* Normal retrieval does not explicitly log full source chunks. Error strings are not centrally redacted. Database source retention and any external provider retention are separate concerns.
* No automatic RAG-to-fine-tuning export was found. Future exports of chunks, retrieved contexts, questions or answers are prohibited under [training policy](03-fine-tuning-data-policy.md).
* Job-description retrieval in [ai/retrieval.ts](../../../server/src/ai/retrieval.ts) is a separate approved-JD example system, not the knowledge audience service. Do not infer one system's ACL/sharing checks from the other.

**Status:** role-filtered knowledge retrieval exists; content classification, safer audience admission and egress/minimization controls need work. No unauthorized live document retrieval was attempted.

## MCP: identity, tools and confirmation

[mcp/server.ts](../../../server/src/mcp/server.ts) is a stdio MCP server. It signs in using `HR_MCP_EMAIL` / `HR_MCP_PASSWORD` through ordinary HTTP login, holds the cookie and returned `SessionUser`, and registers tools from that role. It is not an anonymous HTTP SQL gateway. The default API URL is local; endpoint/deployment trust remains an operator responsibility.

Available tool families:

| Tool family | Actual path / guarantee |
|---|---|
| `hr_capabilities` | Captured role's descriptions |
| `hr_ask` | `resolveQuestion` -> captured-role `mayAsk` -> direct `executeIntent` -> optional `phraseAnswer`; `doAction` redirects to proposal |
| `hr_<intent>` | Generated for registered role-allowed inputs in [schemas.ts](../../../server/src/mcp/schemas.ts); `questionPlanFor` -> direct `executeIntent` |
| `hr_<action>` | Role-generated typed actions -> `proposeAction` -> direct execution if not in `DESTRUCTIVE`, otherwise pending token |
| `hr_propose` / `hr_confirm` | Resolve/propose, server-stored action plan, random token expiring after five minutes, consume once, `runAction` |

These tools are available to an external client/agent. They are **not** tools supplied to the in-app structured question request or OpenAI Realtime session.

Verified risks and limits:

1. Identity and role are captured once at startup. Direct reads do not recheck session expiry, account disablement or role revocation (SEC-02). Domain writes carried over the cookie run their route checks again; that does not make direct reads fresh-authenticated.
2. MCP bypasses parts of HTTP orchestration: typed reads have no shared `validateCopilotPlan` semantic call; HTTP terminal routing, special report/knowledge branches and HTTP rate/audit handling are not identical (SEC-03). Fixed-query direct access is not arbitrary SQL, but calling a lower-level executor requires all its admission preconditions.
3. All `hr_propose` actions use pending tokens; only `DESTRUCTIVE` typed actions always do so. “Non-destructive” includes business writes, not just reads. Agent possession of a token does not prove a person reviewed it (SEC-04). Proposal missing optional fields can be automatically declined by `proposeOverTool`.
4. Tool arguments can contain names, amounts, reasons and contacts; returned results/details can contain authorized employee/payroll data. An external agent may pass these to its model and retain them. `AI_SHARE_DATA=false` does not disable MCP result delivery. Approval and minimization must cover the MCP client as a recipient.
5. No central MCP tool-call audit with controlled identifiers and outcomes was found for all reads. Protocol stdout carries structured tool content; it is not a safe anonymized log. Startup and login-failure stderr include the account email. External client logging is outside repository control.

**Status:** initial authentication, role tool selection and fixed service operations exist; revocation, boundary parity, client data governance and explicit confirmation policy are not sufficient for a blanket security pass. No MCP login or tool invocation was performed.

## Local Voice: actual processing path

```text
Microphone permission -> browser PCM/VAD -> mono WAV
  -> authenticated owned /voice/local/session/:id/stt
  -> bearer-protected loopback worker -> resident whisper.cpp -> transcript
  -> owned /voice/session/:id/turn
  -> role-filtered safe navigation/scroll/choice OR /copilot/ask with same cookie
  -> normal plan validation + intent/action/record gates -> authorized UI result
  -> short spokenText -> owned local TTS endpoint -> Piper -> WAV -> browser speaker
```

Sources: [useLocalVoiceCopilot.ts](../../../hr-app/src/features/copilot/useLocalVoiceCopilot.ts), [localVoiceAudio.ts](../../../hr-app/src/features/copilot/localVoiceAudio.ts), [routes/voice.ts](../../../server/src/routes/voice.ts), [voice/local.ts](../../../server/src/voice/local.ts), [worker.py](../../../server/local-voice/worker.py), [stt_runtime.py](../../../server/local-voice/stt_runtime.py).

The local worker binds loopback, uses a random bearer token kept outside source, and its native STT subservice uses a random private request path. Local URL validation and forbidden redirects limit intended audio egress. Worker/native logs suppress content. The launcher passes an allowlisted runtime environment rather than HR API/DB/session secrets. This protects the intended path; it does not prove host, downloaded binaries, OS swap or unrelated diagnostics cannot capture data.

Audio is processed in browser/Node/Python memory; current worker uses `BytesIO` and forwards WAV to resident STT without per-turn audio files. Piper produces in-memory WAV. No normal audio persistence was identified in this path. Audio models, runtime binaries and the worker token are files; they are not user recording storage. Temporary browser object URLs are released by the hooks. Separate profiling/evaluation scripts are not evidence of a production recording archive.

**Transcripts are sensitive and can be retained.** The Voice session caches transcript and answer for about five minutes; session lifetime is twenty minutes. Normal Copilot unanswered-question and routing-memory stores can persist submitted transcript text. Do not interpret a worker's no-content-logging comment as a system-wide “no transcript storage” guarantee. Development UI diagnostics/transcript state and user screenshots can also expose text.

STT is necessarily before HR intent authorization and may hear accidental names, salary, health or secrets. Authentication/owned Voice-session checks occur before worker use. The policy is to minimize recording, forbid secondary training reuse and treat accidental restricted speech as restricted data, not to claim STT can pre-authorize words it has not recognized.

`spokenText` normally uses brief acknowledgements and avoids speaking full HR tables. Action messages/missing-field text can still contain sensitive values. The authenticated local TTS endpoint accepts caller text up to 500 characters; it is not limited to a server-signed non-sensitive acknowledgement. Thus “TTS never receives PII” would be incorrect. Prefer generic speech and authorized on-screen details.

Voice action confirmation is stronger than ordinary text proposal possession: owned expiring confirmation, review and exact final phrase are checked before forwarding fixed parameters to `/copilot/do`. Idempotency is separate from permission. This was inspected, not dynamically tested in this audit.

## Alternate audio paths

[voice/realtime.ts](../../../server/src/voice/realtime.ts) supports OpenAI Realtime over WebRTC with transcription and speech output. It requires the configured enable/share-audio/key controls; tools are empty, automatic model business response is disabled and tracing is null. Final transcripts still enter the backend Copilot path. OpenAI can receive microphone speech and supplied output text; `AI_PROVIDER=ollama` does not prevent that audio egress or govern external-client retention. No paid/live API was called.

[useVoiceDictation.ts](../../../hr-app/src/features/copilot/useVoiceDictation.ts) also supports browser `SpeechRecognition` / `webkitSpeechRecognition` for dictation. Browser/vendor processing cannot be certified local by this code. The development mock supplies typed transcripts and tests session/Copilot/confirmation orchestration while bypassing microphone, STT and real audio transport; it is not an audio-privacy or recognition test.

**Voice status:** intended local audio handling is minimized; transcript persistence and optional cloud/browser speech processing must be included in privacy and data-export policy. Nothing in this audit changes Voice behavior.
