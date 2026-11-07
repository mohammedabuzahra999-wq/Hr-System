# Trusted candidate audio transport — before state

Requested candidate room, authentication/session, provider contracts, service,
transaction/receipt flow and Phase 5.6 checklist were read before code changes.
Current source manifest is 9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627.
The read-only accepted STT/TTS evidence verifier passed before implementation:
all Phase 1–5.6 evidence and the speech-layer evidence are unchanged. The latter
artifact manifest is e9f1a26ef155286ee7f7992eef8855bfe7efd2153d81401f6fe7dba5bcb4738c.
No task test runner/browser/PostgreSQL process was active at inspection.

Existing room is mock-only, with no microphone use. Candidate authentication is
a scoped HttpOnly session, exact Origin checks and independent service-level auth.
Typed answers have stable identities and atomic SQL answer/receipt persistence.
Audio-v2 delivery has generation/owner/version/turn fences; no browser event may
assert provider provenance. The registered server STT pair is disabled by default.

Chosen transport: explicit permission, bounded complete browser recordings decoded
locally to canonical WAV, authenticated binary HTTPS upload. No WebRTC/streaming
server, codec decoder on server, raw audio DB/server disk or new migration. The
server checks actual PCM duration/size and computes content fingerprints itself.
Capture reservation, attempts, failure/cancel and final commit use existing event
rows and receipts; a reserved/processing receipt never means an answer committed.
STT stays outside SQL locks; its validated text/finalization/receipt commit together.
Session/generation/owner/turn/version/attempt/deadline fences are checked again.

Audio remains explicit opt-in and requires a configured server STT. Existing mock
fixtures default to no capture. The opt-in control records per-capture audio consent.
This uplink can operate on a currently active/listening mock or trusted-delivery
turn; it does not invent trusted playback, production start or a TTS downlink.
Live production interview start remains blocked until that delivery composition is
implemented/validated. No LLM or evaluation integration is added.

Browser recovery will keep only a scoped expiring capture envelope and temporary
WAV Blob in IndexedDB. No invite/session/API credential is stored. Same-origin XSS
could access the temporary audio; server authority never depends on browser data.
Refresh during unfinished recording is explicitly interrupted, not saved. Completed
recordings and uncertain requests reconcile with authenticated durable server state.
All new evidence stays in this directory. Known pgvector and Live Voice E2E blockers
remain open. No external provider call, real key, local model or Ollama is used.
