# TTS delivery before-state

Inspected engine playback/start/finish/pause/resume/interruption, candidate room,
HttpOnly/Origin/service authorization, registered speech contracts/runtime, durable
audio upload/recovery, server delivery gate and Phase 5.6 integration checklist.
The accepted read-only candidate-audio verifier passed before any source changes:
fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17.
All accepted evidence including the candidate-audio package is preserved.

Current registered TTS returns bounded canonical WAV but has no candidate downlink.
Mock playback uses server commands, not browser audio. Audio-v2 provider bindings
have independent owner/session/generation/version provenance; browser events cannot
be promoted to trusted-provider receipts. Production delivery START remains closed.

Implement a default-off authenticated buffered TTS downlink using existing durable
events/receipts and registered TTS, no migration. One exclusive document lease per
playback; explicit user Play, native audio, local immediate STOP and durable server
invalidation/pause. Refresh/lease expiry closes uncertain playback, never auto-replay.
Server duration and scope constrain completion; browser ended is an untrusted
observation, never proof the candidate heard audio or a trusted provider event.
Retain production fail-closed gate and readiness limitations. No real call/credential,
LLM/evaluation integration, WebRTC, model installation or distributed work.
