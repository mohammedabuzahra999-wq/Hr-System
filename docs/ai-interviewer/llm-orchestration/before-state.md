# Asynchronous LLM orchestration before-state

Inspected engine/policy, server/provider registry, candidate/session persistence,
answer recovery/STT upload, TTS playback, accepted evidence and Phase 5.6 checklist.
The accepted TTS package's read-only verifier passed before edits; source was
55f7d754e37e38b185095b6b5410c0d59bf82fc576567cb3c48203aabfeacf14.

Existing policy/evaluator execute synchronously inside PROCESS_ANSWER and a locked
transaction. Base question order, approved prompt catalogs, caps and timers are
engine-owned. Provider gate production START remains disabled. Speech adapters
are independently registered server-side and default disabled. All previous
evidence remains immutable; new outputs go only here.

Chosen implementation: asynchronous staff-requested question-text proposals before
READY, quarantined for explicit HR approval; live model decisions select ONLY IDs
from frozen approved prompt catalogs. The engine owns all progression/timing.
No real evaluation integration, candidate authorization from model text, model tools,
new raw audio storage, local model or external inference call. Existing events and
receipts store bounded durable attempts/identity, hashes and results; no migration.
Provider I/O stays outside SQL locks and timer loops, with explicit timeout/retry,
owner/session/version/answer fences, cancellation and bounded physical admission.

Official Chat Completions structured-output documentation was read (public docs,
not an inference API call); installed SDK is reused with injected HTTP tests.
