# Authenticated TTS downlink and playback

This task connects the existing server TTS registry to buffered authenticated WAV
delivery and native browser playback. It is synthetic-tested for the existing
single-process scope. It does not make the whole interview production-ready.

## Configuration and scope

`AI_INTERVIEW_TTS_PLAYBACK_ENABLED` defaults false. True requires the existing
server-only TTS provider/model/voice/dedicated credential configuration. Missing or
invalid configuration fails startup without printing values. Registration does
not probe a cloud endpoint or mean provider health. Synthetic adapters are injected
only in tests. The production real-delivery START gate stays closed; no mock/test
authority is promoted to production authority. Existing mocks are unchanged with
the new flag off. With it on, old mock autoplay is disabled and the candidate uses
explicit Prepare/Play controls for already-active server playback intents.

## Protocol and authority

The existing HttpOnly candidate cookie, exact Origin policy, independent service
authorization, RBAC separation and no-store/security headers cover every endpoint.
All endpoints are JSON POST under `/api/ai-interview/playback/`. Only `/audio`
returns canonical `audio/wav`; no public/signed media URL or browser key exists.

| Operation | Input | Result |
|---|---|---|
| prepare | Interview/session/playback/question/turn scope; stable request UUID; expected version | Durable generation reservation, server-owned frozen text to registered TTS, validated READY audio |
| status | Scope plus ephemeral document UUID | Authorized durable status; refresh by a new document stops an uncertain active lease |
| audio | Scope, generation, document UUID | Fresh authorization/state/generation checks, then bounded private WAV bytes |
| start | Same generation-bound scope | Exclusive document lease and one durable server playback-start transition |
| pulse | Same scope | Renew a 5s lease; no completion or timer invented |
| end | Same scope | An untrusted browser-ended observation; only accepted after server PCM duration and all live lease/scope checks |
| stop | Same scope | Durable STOPPED plus pause, generation fenced and pending TTS aborted |
| cancel | Original prepare body | Cancel an unknown-response reservation; a tombstone fences delayed prepare |

Browser observations are **not trusted provider receipts or proof of audibility**.
The server knows which canonical audio it generated and the earliest permitted
completion time. It validates elapsed duration, exclusive document, generation,
runtime owner, session, playback/question/turn and ACTIVE state before dispatching
engine playback transitions. No browser-supplied text, audio URL, duration, hash,
receipt, evaluation or arbitrary engine event is accepted. Audio-v2 additionally
checks its existing independently server-bound delivery generation. New events use
`candidate-tts-schedule`, not forged `DELIVERY_OBSERVED` provider provenance.

The server advances the engine only for a valid timed completion, not on TTS
generation/download alone. Listening timers begin in the engine after question
completion. STOP pauses rather than pretending the question finished; existing
resume creates a new playback ID. Full production start/resume/worker composition
and independently validated actual audibility remain outside this transport.

Audio-v2's independent trusted STOP effects are not cleared by a browser claim.
They retain their existing provider-only acknowledgement requirement. Browser
STOP revokes this downlink generation and pauses safely; full trusted worker
composition/acknowledgement still needs independent live validation.

## Durability, retry and limits

Existing PostgreSQL events and command receipts store reservations, status and
transitions. No table or migration is added. Stable request identity plus fingerprint
rejects conflicting reuse; concurrent prepares coalesce. Provider I/O stays outside
SQL locks. Generation completion rechecks frozen version and current scope.
Playback completion, domain events, state and receipt commit atomically. Duplicate
start/end cannot replay or advance twice. The SQL failure test proves rollback.

Registered TTS receives only server-owned text (1–4096 characters). Canonical PCM16
mono 16kHz WAV has exact RIFF/data lengths, no embedded metadata, <=2,000,000 bytes
and <=62,498.625ms of samples. Two physical TTS calls and eight total reserved/cache
slots bound memory. Logical TTS timeout is <=15s. Uncancellable calls keep physical
slots until settlement/process exit; late output stays fenced. Explicit retries use
fresh generations after a durable error, never hidden provider retries.

Audio expires after at most 120s or session expiry, whichever is sooner. Raw audio
stays only in bounded server memory and a temporary browser Blob/object URL; it is
never written to application DB/server disk/browser storage. Metadata contains a
server hash, not audio/text/credentials. Browser media and URLs are released on
STOP, completion, failure and navigation. Existing durable transcript/answer and
evaluation evidence remain unchanged.

Per candidate-session minute: prepare 12; status/pulse 90 each; other playback
operations 30 each, plus the existing general limiter. Limits do not authorize a
request. Authorization and scope checks independently reject invalid access.

## Browser recovery

States: IDLE, GENERATING, READY, PLAYING, STOPPED, COMPLETED, ERROR. No implicit
autoplay occurs. Native autoplay rejection pauses the server lease and explains
explicit resume/Play. Decode/playback errors stop safely. Before playback, audio
download and the server start lease must succeed; epochs fence late browser work.

READY refresh recovers the server generation and fetches bytes only on explicit
Play. PLAYING refresh/new-document ownership stops the old lease and pauses rather
than blindly replaying an unknown position. In-page reconnect can reconcile an
already durable end receipt without native replay. Unknown upload/prepare response
can be cancelled by original request identity. STOP releases local audio immediately;
its UI distinguishes pending server confirmation or network failure. Failed pulses
release local audio and the server expires the lease without a fabricated finish.

A 1s server sweep expires leases; regular browser pulses run every 1.5s. Cross-tab
or server-side state changes stop local media when polling detects them, bounded
by the lease rather than an instantaneous distributed STOP guarantee. Another
document opening the same active playback intentionally stops it. Audio is not
saved across browser/profile loss, and refresh does not resume at an assumed offset.

## Remaining limitations and release blockers

One process and one runtime owner remain required. Cache is process-local; restart
recovers/pauses domain state and closes old pending/READY generations, requiring
explicit resume and new audio. Synchronous CPU cannot be preempted. Shutdown closes
admission and invalidates cached/pending generations; the existing global shutdown
deadline can terminate unfinished I/O without fabricating success.

There are no real provider calls, credentials or local models in verification.
Real account/model/voice support, browser/device acoustic behavior, production
worker/transport composition and live health/error/latency tests remain unvalidated.
LLM orchestration/evaluation integration are unchanged and out of scope.

**OPEN / BLOCKED:** pgvector/full migration chain and Live Voice E2E. Synthetic
native audio does not prove a candidate heard a real cloud-generated question.

## Evidence

`run.mjs RUN init` records source/protected/environment/inventory; `all` runs isolated
guarded suites. New run IDs preserve failed attempts. `integrity` compares source
and protected files; `evidence.mjs` and read-only `verify.mjs` generate/check the new
report and artifact manifest. All prior suite output is redirected here. No accepted
Phase 1–5.6, provider-layer or candidate-audio evidence is changed.
