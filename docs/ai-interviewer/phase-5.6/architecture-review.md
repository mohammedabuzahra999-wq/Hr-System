# Phase 5.6 architecture review

Review and verification only. Application source is frozen at accepted Phase 5.5
manifest SHA-256 `e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0`.
No real integration, feature, model installation, Ollama service or provider call
is authorized. This review continues the inspection begun with the truncated
specification; the complete seven-step specification is authoritative.

## Full flow

| Stage | Implemented path | Current supported state / boundary |
|---|---|---|
| HR setup | HrAiInterview PlanForm → staff routes → InterviewService.create/ready; approved job description/criteria/rubric/plan frozen transactionally | Implemented locally. HR writes the plan, including pre-authored follow-ups and clarifications. No LLM generation. |
| Invitation | Staff session/RBAC and service permission check → locked invite/revoke transaction → one-time random invite, purpose-separated hash and expiry | Implemented locally. UI displays the private link temporarily; delivery to the candidate is manual, not an email integration. |
| Candidate join | Invite exchange → hashed interview-scoped session → narrow HttpOnly/Secure-in-production/SameSite cookie → candidate allowlisted state/events | Implemented locally. Session expiry/revocation and candidate isolation enforced on server. Consent recorded separately. |
| Question delivery | Engine selects frozen question → durable PLAY → InterviewDeliveryGate reserves dispatch → bounded TTS/play adapter → independently fenced observations | Synthetic gate implemented. Production composition is disabled. No registered real adapter or trusted candidate transport. Dispatch is not playback completion. |
| Candidate response | Gate validates canonical WAV and frozen session/generation/version/turn context → bounded STT → final transcript/speech-finish observations → locked transaction → finalized DOMAIN answer and COMMAND receipt | Synthetic audio gate implemented. No production microphone capture, upload/stream, codec conversion, trusted worker or feedback path. Browser may not grant provider authority to itself. |
| Typed answer recovery | AnswerRecovery sessionStorage envelope → stable submission identity → submit/status → row lock + fingerprint/expected version → durable answer/receipt → explicit COMMITTED | Implemented for supported mock/text scope. Production submit/start routes remain unavailable; audio-v2 explicitly rejects typed authority. A browser copy is not a durable answer. |
| Follow-up / clarification | Runtime PROCESS_ANSWER → synchronous MockEvaluator and MockInterviewerPolicy → validated decision within frozen prompt IDs/counts | Mocked semantic decisions. The engine does not generate free text. Decision interface is synchronous and service dependencies are concrete mocks. |
| Timer / interruption / restart | Server clock/timer maintenance, durable PLAY/STOP, session/generation/owner/event-sequence fences, recovery to safe pause | Implemented/tested for local single runtime owner; live sound/device and abrupt transport behavior unvalidated. |
| Completion | Closing playback observations → COMPLETED plus durable pending evaluation input anchor/job | Implemented locally. Closing dispatch alone cannot complete the interview. |
| Evaluation | HR request freezes versioned report input/hash → durable attempt claim → bounded ReportEvaluator outside SQL transaction → independent evidence verification → fenced commit | Async job seam implemented, evaluator remains synthetic. Per-answer engine evaluation remains synchronous mock. |
| HR report | Separate staff session + recruitment RBAC + service application scope → report/trace/frozen weights/version → human review → safe cache headers/audit | Implemented locally with explicit MOCK report labels. Candidate credentials grant no report access. No real semantic assessment is validated. |

Core files: `services/hr-api/src/aiInterviewer/{routes,service,repository,engine,
authorization,interviewerPolicy,evaluator,delivery,deliveryContracts,runtime,
reportService,report,evaluationInput,recovery,health,shutdown}.ts`;
`packages/contracts/src/aiInterview*.ts`;
`apps/hr-web/src/features/aiInterviewer/{HrAiInterview,session,answerRecovery,
useInterviewSession,client}.*`; `AiInterviewPage.tsx` and `AiInterviewReportPage.tsx`.
The original UI and domain tests remain unchanged.

## Integration contracts

| Capability | Existing contract and protections | Readiness |
|---|---|---|
| Base questions / follow-ups | InterviewerPolicy.chooseNextBase/afterAnswer are synchronous; only frozen plan IDs allowed; MockInterviewerPolicy selects fixture responses | PARTIAL seam; asynchronous LLM generation/decision adapter and production composition missing. No API-key switch exists. |
| Per-answer evaluation | AnswerEvaluator.evaluate is synchronous; verifyAnswerEvaluation checks answer identity and exact source spans | PARTIAL mock seam. Network work cannot be inserted into engine dispatch/locked SQL transaction. |
| Report LLM | ReportEvaluator.evaluateReport accepts frozen input, report identity and optional AbortSignal, returns untrusted unknown/Promise; strict verifier before commit | PARTIAL async seam. Real adapter, prompt/model policy and real provenance schema absent. Report enum accepts only mock-report-v1/v2; mode is literally MOCK; frozen configuration is phase2-mock-v1/mock-v1. |
| STT | InterviewDeliveryAdapter.transcribe({context,audio},signal); canonical PCM16/mono/16kHz WAV, max 8,000,000 bytes; strict text<=16,000 and uncertainty result | Synthetic boundary verified; no real adapter/authenticated audio ingress. This is buffered WAV, not a streaming STT protocol. |
| TTS | synthesize({context,text},signal) → strict WAV max 2,000,000 bytes; play({context,bytes,mimeType,deliveryKey},signal); stop(...,signal) | Synthetic boundary verified. Real provider codec conversion and transport playback/STOP contract missing. |
| Trusted events | Closed providerObservation schema; interview/session/generation/owner/version/sequence/question/turn/playback checks, durable fingerprints/receipts | Implemented server-only capability. There is deliberately no browser/provider-events HTTP endpoint. A network worker bridge with independent authentication and replay protection is missing. |
| Candidate transport | Gate has abstract play/stop and data context; browser currently polls JSON and exposes development-only mocks | BLOCKED for live audio. No getUserMedia/MediaRecorder/audio playback/stream connection in the AI Interviewer feature. Other employee voice modules are not a candidate-authorized transport. |
| Provider config/auth | Deployment validates mode and denies realInterviewProviderNotRegistered; routes always construct disabled delivery gate; health distinguishes configured from ready | Fail-closed is implemented. Credential loading, real endpoint/adapter selection and provider/worker authentication are not implemented for the Interviewer. |
| Timeouts/capacity | Provider 15s max, 2 physical calls per database object; evaluator 30s max, 2 physical slots; AbortSignal and late-settlement/owner fences | Implemented local asynchronous bounds. Hung uncancellable calls hold slots; synchronous CPU cannot be preempted. |
| Retries/recovery | Stable event/command fingerprints, durable PLAY reservation, STOP acknowledgement retry, restart pause/rebind, explicit report retry preserving input hash | Implemented domain recovery. No general real-provider HTTP status/backoff/SDK retry policy, external idempotency bridge or provider session recovery adapter exists. Blind replay of ambiguous PLAY is unsafe. |

`providers.ts` / MockRealtimeProvider is a deterministic engine harness, not an
SDK or real media channel. Existing generic HR AI/OpenAI/Ollama/employee voice
modules do not supply missing Interviewer composition, authentication or transport.
They are not activated or used to claim integration readiness in this phase.

## Exact missing work, separated by category

1. **Missing application implementation:** registered real InterviewDeliveryAdapter;
   production route/runtime injection and authenticated start/resume/rebind flow;
   candidate microphone permission/capture, supported codec-to-WAV conversion,
   bounded secure uplink/downlink and playback lifecycle; trusted worker/transport
   bridge with generation-bound server capabilities and STOP idempotency; real STT
   and TTS SDK/HTTP response conversion, errors/cancellation/retry handling;
   asynchronous LLM plan/decision orchestration outside engine/transactions;
   real report evaluator adapter and separately versioned non-MOCK contracts,
   frozen provenance and truthful UI/report labels. Existing mock synchronous
   dependencies cannot be replaced by an HTTP call in place.
2. **Missing configuration:** selected provider/model/voice/languages/capabilities,
   approved prompt/rubric/version policy, server-only endpoint/authentication
   configuration, worker trust/proxy/origin topology, codecs, payload limits and
   timeouts/retry ceilings. These Interviewer settings have not been implemented;
   generic app AI settings do not register an Interviewer adapter.
3. **Missing credentials:** future provider API credentials and authenticated worker
   identity, supplied server-side after code/configuration exists. No API key is
   required for this review; no credential is present in these artifacts.
4. **Missing infrastructure:** pgvector-enabled PostgreSQL for exact migration
   chain; running trusted STT/TTS/media service or equivalent external adapter;
   secure candidate audio transport and deployment ingress/TLS/proxy configuration.
   Local AI model/Ollama installation is not a requirement or proposed solution.
5. **Missing real-world validation:** complete untouched migrations; authenticated
   candidate microphone-to-STT and TTS-to-speaker path; English/Arabic/mixed
   transcripts/uncertainty and timing; interruptions/STOP; response loss/reconnect/
   restart/revocation/races; provider outages/quotas/malformed output; real model
   rubric/evidence behavior, latency, health and operational deployment checks.

**API integration readiness: PARTIAL. Live provider activation and overall release
remain BLOCKED.** Useful synthetic seams exist, but a key alone cannot deliver a
real interview. No incomplete integration is marked READY.
