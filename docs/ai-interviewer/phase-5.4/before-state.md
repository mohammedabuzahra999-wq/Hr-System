# Phase 5.4 before-state — inspected before application changes

Accepted state: 5.1 BLOCKED by the two environment validations; 5.2 PASS;
5.3 PASS for supported local single-process operation. Their evidence is immutable.
Accepted 5.3 source manifest SHA-256:
`b121f79f7d8fef4bad55357e37ecffc33ecb528b5bd1d704c9809ced3265e2e8`.

## Inspected path and reusable authority

Phase 5A (`../phase-5a.md`) separates employee Realtime Voice, employee local
STT/TTS/Copilot and candidate interviews. It proposes trusted server ingress,
durable media generations, scoped provider events and a fail-closed delivery
gate. Employee voice sessions/routes/tools must not become candidate authority.
Its WebRTC extraction is a future transport choice, not existing functionality.

InterviewEngine synchronously accepts normalized commands. It owns question
selection, follow-up/clarification limits, playback identities, listening timers,
barge-in, finalized answers and completion. Question playback finish begins
listening; interruption emits STOP_PLAYBACK and starts an interrupted listening
turn. Final transcript plus speech finish finalizes once. Late/stale turn or
playback commands fail. Provider/model output is never authorization.

InterviewService restores this engine within PostgreSQL row locks, authorizes
the candidate/staff, checks expected versions and existing receipt fingerprints,
appends durable events/receipts and atomically saves snapshots. Phase 5.2 typed
submission already has one commit boundary; PROCESS_ANSWER remains separate and
idempotent. Candidate sessions are hashed, interview-bound, expiring/revocable,
HttpOnly cookies. Candidate DTO/replay allowlists hide internal data.

Phase 5.3 independently schedules timer work and bounded evaluation discovery.
Completed interview evaluation remains a frozen/versioned/evidence-verified
separate path. Runtime-owner changes pause ACTIVE interviews at lastObservedAt;
PAUSED duration remains frozen. One live process/owner is required.

## Mock-only path and missing pieces

Candidate routes expose intent commands, typed submission/status and a gated
development mock endpoint. Production START already fails closed. Candidate
commands currently permit browser speech/final transcript for mock use. There is
no trusted provider principal, ingress, connection binding or event cursor.

MockRealtimeProvider emits validated synthetic media; harness.ts maps these to
engine commands and synchronously consumes PLAY/STOP. executeMock uses a private
development capability. Service.apply currently persists only PLAY effects and
replaces pendingEffects for each command; durable STOP reconciliation is missing.

The candidate page/controller displays mock-v1 consent, mock readiness and typed
controls, polls authoritative state, handles bounded local answer recovery and
never requests a microphone. Polling failure changes transport UX, not a trusted
server disconnect. There is no real candidate media transport. Existing local
STT/TTS worker helpers belong to employee voice and cannot simply be mounted here.

Missing for real delivery: explicit provider registration/configuration and
health/provenance requirements; scoped generations and ordered idempotent ingress;
bounded STT/TTS calls and stale-result fencing; durable STOP intent; safe playback
acknowledgement/reconnect semantics; separately versioned audio consent. No
authenticated candidate worker/audio bridge or actual trusted connection source
is currently installed for interviews. Live voice E2E remains BLOCKED.

## Minimal implementation decision

Add a server-only gate/adapter interface plus service-owned, transactional ingress
using existing control events/receipts (no parallel idempotency table). Provider
adapters receive immutable request data and return closed observations, never a
database/engine capability. Bind each ingress closure to candidate/session,
generation and runtime owner. Persist an ordered cursor and use existing receipts;
reject late/reordered/conflicting events. Keep mock behavior/old tests intact.

Require explicit audio-v2 consent for provider-bound delivery. Browser commands
and typed/mock media cannot impersonate that path. Real START/RESUME go through
the server gate; production synthetic/absent/invalid providers fail closed.
Preserve durable PLAY and STOP only on this new path, with explicit acknowledgement.
Bound physical asynchronous calls and consume late settlement. Do not introduce
LLM generation: existing deterministic plan/policy remains engine-limited.

Synthetic adapters will prove the gate separately from real media delivery. No
WebRTC stack, employee voice/Copilot/MCP coupling, provider credential, worker
download or production activation is needed for synthetic tests. Trusted real
connection state cannot be inferred from polling and remains unvalidated without
a real adapter. Preserve both release blockers and stop after Phase 5.4.
