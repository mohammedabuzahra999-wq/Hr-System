# Future API integration implementation and validation checklist

Planning artifact only. No items below authorize implementation, credential
provisioning or a live call in Phase 5.6. No local models or Ollama are needed.
Complete the missing code before treating credentials as usable integration.

## Provider capabilities and application changes

- [ ] Select hosted STT, TTS and LLM capabilities and document supported English,
  Arabic and mixed-language behavior, uncertainty, formats, payload/latency limits,
  quotas, cancellation and provider-side idempotency. Streaming is not supplied by
  the current buffered-WAV adapter contract.
- [ ] Implement and server-register a real InterviewDeliveryAdapter implementing
  health/transcribe/synthesize/play/stop. Validate all untrusted responses, convert
  codecs explicitly, keep credentials/service/principal/SQL out of adapter input,
  and preserve context and delivery-key semantics.
- [ ] Add explicit production composition to routes/runtime; retain disabled
  defaults and production mock rejection. A production start/resume/rebind flow
  must authenticate the candidate and establish trusted transport before START.
  Replace deployment.ts's unconditional realInterviewProviderNotRegistered refusal
  only with validation of an explicitly registered trusted real capability; do
  not remove fail-closed validation. Update routes.ts's hardcoded disabled gate
  and mock configuration DTO, and the candidate readiness UI, truthfully.
- [ ] Add asynchronous LLM generation/decision orchestration outside synchronous
  InterviewEngine.dispatch and locked database transactions. Freeze/approve base
  question text and permitted follow-ups; validate decisions/counts/IDs against
  the plan. Fence late output and ensure one decision per committed answer.
- [ ] Implement the async ReportEvaluator adapter using frozen input and signals.
  Introduce truthful separately versioned real-evaluator/provenance contracts and
  UI labels: current report mode/version/frozen-config literals are MOCK-only.
  Preserve independent exact-quote/UTF-16 offsets, criterion/turn identity,
  inputHash, rubric/version and human-review checks. Do not relabel mock results.

## Server-side configuration and credentials

- [ ] Define validated Interviewer-specific server settings for adapter, endpoint,
  model/voice/languages, limits, timeouts and bounded retries. These are future
  settings, not existing environment variables that can already activate voice.
- [ ] Load future credentials solely from the server's approved secret mechanism;
  never VITE variables, browser storage, URLs, logs or evidence. Validate missing,
  malformed and mismatched configuration safely without printing values.
- [ ] Configure trusted worker identity and deployment ingress/origins/proxy peers.
  Browser-controlled forwarded headers cannot establish client/provider authority.
  Choose and implement the worker authentication protocol; no network worker
  authentication scheme is currently supplied by the server-only binding closure.
- [ ] Verify production Secure/HttpOnly candidate cookies, exact Origin policy,
  separate staff authorization and independently authenticated provider ingress.
  Rate limiting never substitutes for any of these checks.

## Candidate audio transport and STT/TTS

- [ ] Implement browser device permission/capture and a supported secure bounded
  uplink; perform canonical PCM16 mono 16kHz WAV conversion/validation or explicitly
  version a reviewed alternate protocol. Handle denial, no device and device loss.
- [ ] Implement authenticated downlink/playback and STOP with delivery-key
  deduplication, ordering, session/generation/owner/turn binding and bounded queues.
  A server dispatch is not proof the candidate heard audio. Define exactly what
  trusted playback observations prove and validate that provenance end to end.
- [ ] Connect STT finals/uncertainty and speech lifecycle to the trusted ingress;
  browser-supplied text or claimed source must not masquerade as provider output.
  Preserve final answer/receipt commit before acknowledging durable acceptance.
- [ ] Carry no raw audio in the durable answer/metadata audit by accident. Document
  transient audio handling in the future integration design; retention/deletion
  implementation is not part of Phase 5.6.
- [ ] Implement transport disconnect/reconnect/rebind and pending PLAY/STOP recovery
  using existing fences. Do not blindly replay an uncertain external playback.

## Health and live E2E procedure

- [ ] On an isolated authorized synthetic candidate/application and nonproduction
  deployment, validate the exact full migration chain on pgvector PostgreSQL.
- [ ] Provision the selected trusted media/provider adapter and server credentials.
  Probe authenticated actual STT/TTS/transport health. Configuration presence alone
  cannot set ready; retain productionGate=blocked until required validation exists.
- [ ] HR creates and freezes a plan/rubric, issues a fresh single-use invite;
  candidate joins through the secure cookie exchange and explicit audio consent.
- [ ] Play introduction/question through actual downlink; capture candidate speech
  through actual microphone/uplink/STT, verify one durable final answer and receipt;
  run a validated LLM follow-up/clarification and exercise real barge-in/STOP.
- [ ] Finish all turns and closing; run the real asynchronous report evaluator,
  independently verify input/evidence/version and open the staff-only report.
  Check candidate isolation and prevent application/hiring status auto-advancement.
- [ ] Capture sanitized results, exact versions, timings, test IDs and actual call
  counts. A successful secret scan, synthetic gate or legacy health endpoint is
  not a substitute for live microphone-to-report acceptance.

## Failure and recovery procedure

- [ ] Disconnect before send, mid-audio, after final commit/before acknowledgement;
  refresh/reconnect/retry and verify one final answer/receipt with explicit UX.
- [ ] Inject unavailable/timeout/malformed STT, TTS, LLM and report output; test
  quotas/capacity, cancellation, bounded SDK retries and late completion fencing.
- [ ] Test playback acknowledgement loss, duplicate dispatch keys, STOP timeout,
  barge-in races and generation replacement without duplicate external playback.
- [ ] Test duplicate/conflicting identities, stale versions/turns, two tabs,
  revoked/expired sessions, forged worker events and cross-candidate access.
- [ ] Restart during answer commit, pending PLAY/STOP and evaluation/provider I/O;
  verify durable receipts, safe pause/rebind, unchanged evaluation input hashes,
  owner/attempt fences, truthful readiness and unsuccessful incomplete shutdown.
- [ ] Check slow/uncancellable calls and real provider latency against existing
  bounds. Single-process counter/owner and non-preemptible CPU limitations remain;
  do not claim distributed runtime support.
- [ ] Rerun relevant frozen regression/browser/build/security/secret suites. Review
  and explicitly close the full-chain and Live Voice E2E blockers only after their
  actual successful validation; preserve prior evidence and record a new package.
