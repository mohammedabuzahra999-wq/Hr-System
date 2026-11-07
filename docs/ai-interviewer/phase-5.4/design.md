# Phase 5.4 provider gate — architecture and limits

This is a **synthetic provider gate**, not live microphone/WebRTC delivery. The
candidate room remains the accepted mock-v1 UI; no microphone/real transport is
activated. Production routes construct a disabled gate and still refuse START.
No real provider, worker credential or model endpoint is registered. Real Voice
E2E and full-chain migration validation remain separate OPEN release blockers.

## Authority and provenance

Candidate media -> server-registered adapter -> closed normalized observation ->
InterviewService row lock/authorization/receipt -> unchanged InterviewEngine ->
durable snapshot/events/effects -> adapter -> playback observation.

Adapters receive immutable request context and bounded audio/text only. They
receive no service, database, principal, candidate credential, authorization
decision or evaluation capability. The server orchestration owns the unforgeable
in-process ingress closure. There is no HTTP provider-event or browser transcript
bridge to that closure. Registered adapter code is trusted application code;
provider responses remain untrusted input. This is not sandboxing arbitrary JS.

Audio delivery requires explicit `ai-interview-v2-audio` consent. Existing mock
consent remains v1. Audio-v2 sessions reject browser START/RESUME/media, typed mock
submission, consent downgrade and development mock operations at service level.
Public production/non-mock routes also refuse browser transcript/speech/typed
submission even for legacy mock-v1 rows. Read-only answer reconciliation remains
available. Candidate/staff authentication, HttpOnly cookies, Origin, body/rate
limits and DTO/replay allowlists remain intact. No employee Voice/Copilot/MCP
session, route or tool is imported into the new boundary.

## Durable binding and ordering

Bind under the existing interview lock after candidate authorization. The row
must be READY/PAUSED, frozen and audio-consented. Persist DELIVERY_BOUND metadata
in the existing AUDIT record type: generation UUID, candidate session version and
runtime owner. No secret or audio is persisted. Each ingress independently
rechecks candidate cookie hash/expiry/revocation, latest generation, session
version and owner under the same lock.

Every event includes generation/interview, UUID, exact next cursor, expected
version and question/turn/playback correlation. Existing COMMAND receipts store
only a fingerprint/result version. Same identity/body retries are deterministic;
conflicting reuse, new-ID duplicates, out-of-order cursors, stale versions and
foreign/stale correlations fail without writes. Events are never automatically
rebased to a newer turn. Concurrent events serialize in PostgreSQL. Provider
callbacks can only choose the closed observation union; lifecycle START/RESUME
are separate server-orchestrated candidate intents.

DELIVERY_OBSERVED stores only cursor, generation, observation type, connected flag
and playback ID. Domain answer events retain finalized content through existing
rules. No raw provider exception, credential, SDP, provider URL, audio bytes,
prompt or transcript is placed in operational metadata/logs.

## STT/TTS bounds

Each asynchronous provider operation has a **15,000 ms** maximum. Trusted tests
may lower it, never raise/disable it. Two physical calls are admitted across gate
objects sharing the single database. Timeout aborts the optional signal and
returns only a safe code. Uncancellable calls retain their slot until settlement;
two permanent hangs require process restart. Late resolve/reject is consumed.
TTS synthesis and playback submission have separate bounds (up to 30 seconds
combined plus finite SQL/scheduling latency); health and STOP are also bounded.

Audio uses canonical 44-byte-header PCM16 mono 16kHz WAV, no metadata chunks.
STT input is at most 8,000,000 bytes; TTS output at most 2,000,000 bytes. These are
bounded utterance/output envelopes, not a continuous stream or a promise that
all 30-minute engine turns fit one envelope. A real transport must segment input
without changing engine deadlines. Audio exists only in bounded process memory.

STT returns only validated text (1..16,000 characters) and an uncertainty flag.
The frozen context is checked before provider work and again transactionally on
observation acceptance. Final transcript and speech finish can arrive in either
order; only engine rules finalize an answer. Timeout/unavailable/malformed output
cannot create a successful answer; the still-current context may pause safely.
If the context has changed, even failure cannot rebase itself onto newer state.

## PLAY, STOP and interruption

The application owns PLAY. Before external synthesis/play, RESERVE_PLAY is
durably recorded; another dispatch of that playback in the same generation is
refused, including ambiguous response loss. Adapter playback uses the stable
generation/playback idempotency key. Its `accepted` response means dispatched,
never started/completed. Acknowledgements require the actual current effect and
a recorded dispatch. START must precede FINISH; engine controls timer start.
After synthesis, revalidate generation/version/cursor before calling play.

For audio-v2 only, apply preserves outstanding STOP intents and current PLAY.
Speech during an allowed question playback invokes the unchanged engine's
interruption rule, atomically persists STOP and starts the interrupted listening
turn. Late playback finish cannot start another timer. STOP acknowledgement
removes only that pending effect; loss retains durable intent for idempotent
retry. New-ID stale acknowledgements fail. STOP dispatch is explicit in this gate;
there is no claimed production background transport/effect dispatcher.

## Disconnect, reconnect, shutdown and restart

Only a trusted provider observation establishes connection loss. Browser polling
failure never pauses the server. DISCONNECTED pauses via engine rules; CONNECTED
changes only transport metadata and never resumes. Explicit gate resume requires
trusted connection state; it preserves frozen duration and generates a fresh
playback ID when delivery must replay. Refresh rebinds a new generation after
authorized pause/recovery; old callbacks and pre-refresh STT are fenced.

Graceful gate close marks local callbacks unavailable, aborts waits and attempts
durable CLOSE/PAUSE in order (three finite conflict retries). Once committed,
DELIVERY_CLOSED permanently fences that generation. Database outage can prevent
durable close; new process-owner recovery still fences the former owner. No
claim of guaranteed physical transport termination during an outage is made.
Only the newest binding per interview is retained for gate shutdown.

Same single-process/runtime-owner assumption as Phase 5.3. Restart proof uses a
new service owner over real PostgreSQL, not OS kill or distributed failover.
Asynchronous timers cannot preempt synchronous CPU loops, event-loop stalls or
database outages. Trusted adapter implementations must return/yield promptly.

## Readiness and live gate

Configuration is an explicit server composition object: mode disabled/synthetic/
real, production flag, a registered adapter and trusted-STT/connection/idempotent-
playback capabilities. Synthetic mode is refused in production. Health yields
configured -> ready/unhealthy. Missing/invalid requirements yield unavailable.
The candidate-safe GET `/delivery/readiness` exposes only status, mode and
liveValidated=false; it has no provider address or credential. Current production
composition is disabled, regardless of employee voice/mock flags.

Real provider registration, authenticated candidate audio transport, the audio-v2
browser disclosure/gesture/media UI, trusted connection bridge and actual worker
integration remain unvalidated. Local model files exist, but no worker listener
was found on 8766, and an isolated interview real-engine/connection configuration
is absent. The existing employee local.e2e test logs into employee Copilot routes;
running it would not prove the requested candidate interview lifecycle. It is not
used as substitute evidence. Live Interview Voice E2E remains BLOCKED.

No LLM is introduced. Existing deterministic plan/policy produces fixture follow-
ups/clarifications under unchanged engine limits. Real LLM validation is separately
BLOCKED/unconfigured. Evaluation remains completed durable interview -> frozen
input/hash -> versioned job -> evidence verification/NOT_ASSESSED -> HR report.

No migration, dependency, provider credential, automatic mock fallback,
distributed owner, retention implementation or Phase 5.5 work is added.
