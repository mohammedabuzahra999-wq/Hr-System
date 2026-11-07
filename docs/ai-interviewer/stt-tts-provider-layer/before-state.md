# STT/TTS provider-layer implementation baseline

The user authorized implementation after Phase 5.6, limited to STT/TTS contracts,
server registration/configuration, bounded failures and synthetic tests. No API
key is available. Candidate transport, LLM orchestration and evaluation integration
are excluded. Accepted Phase 1–5.6 evidence is immutable.

Before edits, the requested architecture-review.md, integration-checklist.md and
Phase 5.6 REPORT.md were read. The 438-file accepted source SHA-256 was
`e2fb83906f162898c273378814a824ebd69fd8afdd682061eb1dcf52144760a0`.
Accepted Phase 5.6 artifact manifest SHA-256:
`b91247cb3b1b155d360825b54cc70e2fdb682e212b47de27d6fc3f5b25aaee6c`.
No app test runner/browser/PostgreSQL process was active at initial inspection.
No applicable AGENTS.md was found. No dependencies or local models are installed.

Existing seams: delivery.ts's InterviewDeliveryAdapter combines health,
transcribe/synthesize and playback/STOP. The gate supplies 15-second bounds,
physical capacity, durable dispatch and event/turn/owner/session fences.
routes.ts constructs a disabled gate; index.ts owns startup and shutdown;
env.ts validates deployment; the existing mock policy/evaluator/adapter tests are
kept unchanged. The combined live-provider flag still refuses real mode without
a transport-capable delivery adapter.

Implementation separates server speech operations from candidate transport.
OpenAI is the first explicit cloud selector because its SDK is already installed;
the cloud protocol is tested through injected HTTP responses, never a provider
endpoint. Registration creates no traffic and grants no session/event/playback
authority. No generic AI/Realtime key silently selects or authenticates speech.

New evidence helpers are copied into this new directory and redirect all legacy
test outputs here. Source/evidence baselines remain in runs/final-20261105;
development runs are separate from the frozen final regression. The source
manifest format is compatible with Phase 5.5/5.6. Earlier 608 protected files and
all six accepted phase packages are verified separately.

Development notes: initial TypeScript checks found missing contextual parameter
types in the new frozen provider object; fixed with explicit interface context.
development-1 passed 54 new checks. Body cleanup/credential snapshot were hardened
and four additional cases added; development-2 passed 58 checks with 31 synthetic
SDK requests. No pre-existing assertion was changed or weakened.

Final regression notes: the first Phase 3 browser attempt stopped at the unchanged
warning/grace speaking observation (20/21). It is retained, and the unchanged
isolated recheck passed 44/44. A timing/version conflict is an inference; a root
cause was not proven and no application/test change was made for that result.
The early canary scan preceded the new build; a separate completed post-build
scan verifies the dedicated speech canary and preserves the preliminary output.

Official OpenAI documentation and installed SDK definitions were inspected for
transcription JSON and raw PCM speech formats. Documentation reads are distinct
from inference/provider API execution, which remains zero. No key was requested
or provisioned. Both existing release validation blockers remain OPEN.
