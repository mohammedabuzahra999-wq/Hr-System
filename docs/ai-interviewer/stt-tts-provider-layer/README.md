# STT/TTS provider layer

Implementation scope: server-only speech operations and registration. No candidate
transport, LLM orchestration or evaluation integration is introduced. The full
interview delivery gate stays disabled; real delivery selection remains blocked.

## Server contracts and registration

- `speechContracts.ts`: independent SpeechToTextProvider/TextToSpeechProvider,
  typed transcript/canonical WAV output, fixed safe errors, limits and readiness.
- `speechConfiguration.ts`: explicit validated selectors/required configuration
  and a server-only credential accessor that is omitted by JSON serialization.
- `speechProviders.ts`: OpenAI SDK adapters, bounded request/response processing,
  safe status mapping, cancellation, two shared physical slots, shutdown and PCM
  conversion. Unknown provider response fields never become application authority.
- `speechRuntime.ts`: one registered pair per server process, instantiated without
  I/O. index.ts imports it at startup and closes admission/aborts calls on shutdown.
- `env.ts`: startup validates the new server configuration without printing input
  values. Existing authentication, DTOs, provider ingress and mock modes are unchanged.

Server code can import `interviewSpeechProviders` from speechRuntime.ts. Its
`transcribe({audio,language?},signal)` accepts canonical PCM16 mono 16kHz WAV up to
8,000,000 bytes, with optional en/ar hint (omit for autodetection/mixed language).
It returns trimmed final text up to 16,000 characters and `uncertain: true`:
there is no calibrated confidence policy, so plain text does not fabricate certainty.

`synthesize({text},signal)` accepts 1–4,096 trimmed characters. The adapter requests
raw PCM24k/S16LE, bounds the body to 2,999,934 bytes, averages each 1.5-input-sample
interval and emits metadata-free PCM16 mono 16kHz WAV up to 2,000,000 bytes, matching
the existing delivery boundary. Tests verify signed samples, duration/headers and
maximum size. Live acoustic quality/language/device behavior remains unvalidated.

These methods return data only. They cannot bind a candidate, emit trusted events,
acknowledge PLAY/STOP, finalize an answer or advance interview state. A future
authorized transport-capable adapter can delegate its STT/TTS operations to this
pair while retaining all gate/service fences. That composition is not implemented
or enabled here. No new browser/provider HTTP endpoint is exposed.

## Server-only configuration

| Variable | Requirement |
|---|---|
| AI_INTERVIEW_STT_PROVIDER | disabled (default) or openai |
| AI_INTERVIEW_TTS_PROVIDER | disabled (default) or openai; independently selectable |
| AI_INTERVIEW_SPEECH_API_KEY | Required only if a cloud role is selected; future server secret, never VITE or a URL |
| AI_INTERVIEW_STT_MODEL | Explicit model ID required when STT=openai; no inferred/default model |
| AI_INTERVIEW_TTS_MODEL | Explicit model ID required when TTS=openai |
| AI_INTERVIEW_TTS_VOICE | Required for TTS=openai; validated built-in voice name |
| AI_INTERVIEW_SPEECH_BASE_URL | Only https://api.openai.com/v1 is supported; arbitrary/private/credential-bearing endpoints rejected |
| AI_INTERVIEW_SPEECH_TIMEOUT_MS | Integer 1–15000; default 15000; includes response reading/conversion |

No actual credential belongs in this document, frontend, logs or test artifacts.
Defaults require no key and preserve existing behavior. Generic OPENAI_API_KEY,
VOICE settings and AI_PROVIDER do not select speech or supply its credential.
When selected, missing key/model/voice or malformed settings refuse startup with
one fixed safe configuration code. No implicit fallback to mocks or local models.
Registration of a complete cloud configuration still performs no network call.

Client destination is pinned independently of ambient OPENAI_BASE_URL; redirects
are refused. SDK logging is explicitly off, including under ambient debug settings.
SDK and per-request automatic retries are zero. Caller retryability hints are
closed codes, not an automatic retry mechanism or authorization/idempotency proof.
The future caller must reconcile durable state before retrying ambiguous work.

## Bounds, failures and operational meaning

One process registry admits at most two physical STT/TTS operations combined.
Timeout/cancel reject the logical call and abort its request. Unsettled physical
work keeps its slot; late results cannot become successful or update readiness.
Shutdown closes admission, cancels current calls and permanently fences results.
Permanently uncancellable work can still require process exit; synchronous CPU
cannot be preempted. No distributed registry/capacity guarantee is claimed.

Both JSON and PCM bodies are bounded while reading, including absent Content-Length;
JSON is capped at 128,000 bytes before SDK parsing. Invalid media, truncated/odd
PCM, malformed transcript, oversize input/output and unsafe response metadata fail
safely. HTTP 400-class rejection/auth, 429, timeout, cancellation, capacity and
unavailable failures map to fixed codes. Raw SDK exceptions/body/headers/credentials
are never attached as public causes or returned to a browser.

`readiness()` contains only per-role provider/status, `liveValidated:false` and
`transportReady:false`. States distinguish disabled, configured, last-call-succeeded,
unhealthy and closed. Last-call-succeeded is not continuous health or Live Voice
readiness. Existing application health/release gates remain blocked.

## Offline reproduction and evidence

Read [REPORT.md](runs/final-verified-20261105/REPORT.md),
[summary.json](runs/final-verified-20261105/summary.json),
[source changes](runs/final-verified-20261105/source-changes.json).

```powershell
node docs/ai-interviewer/stt-tts-provider-layer/verify.mjs final-verified-20261105
npm.cmd run check:ai-interviewer:speech -w @hr/server
```

The contract suite replaces HTTP with synthetic SDK responses and forbids real
network use. It does not require a key: credentials are random in-memory test
values and are never recorded. Do not set production provider variables to run it.
The read-only evidence verifier requires no DB/browser/provider.

To reproduce all regressions, choose a NEW run ID and use the already initialized
disposable loopback PostgreSQL cluster, never an application database:

```powershell
& ./.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D ./.local-dev/ai-interviewer-postgres/data -l ./.local-dev/ai-interviewer-postgres/server.log -o '-h127.0.0.1 -p55442' -w start
node docs/ai-interviewer/stt-tts-provider-layer/run.mjs NEW_RUN_ID init
node docs/ai-interviewer/stt-tts-provider-layer/run.mjs NEW_RUN_ID all
node docs/ai-interviewer/stt-tts-provider-layer/run.mjs NEW_RUN_ID integrity
node docs/ai-interviewer/stt-tts-provider-layer/run.mjs NEW_RUN_ID cleanup
```

Start that cluster only if stopped. Installed dependencies and Chrome are needed
for the full browser/regression suites. Child environments exclude real credentials
and retained .env files; legacy evidence writes are redirected to the new run,
credential fixtures/screenshots suppressed, and network limited to suite-specific
loopback ports. The build gets only synthetic server canaries, including the new
dedicated speech credential, then both original and new canary scans run. All old
assertions are unchanged; accepted Phase 1–5.6 evidence must never be regenerated.

`evidence.mjs RUN_ID` intentionally generates this new package's report/manifest;
run it only when finalizing new evidence. resource-finalize.mjs records one-time
cleanup after tests, checks no other database sessions and only removes resolved
own profile directories/stops its exact test cluster. No app database is dropped.

## Protocol references and remaining blockers

The installed OpenAI SDK 7.20.0 types and official OpenAI Docs establish the
[transcription JSON request](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
and [speech PCM output format](https://developers.openai.com/api/docs/guides/text-to-speech).
No provider inference endpoint was called while implementing or testing.

Future gaps: trusted candidate capture/upload/playback/STOP transport and its
server composition, live credential/account/model/voice validation, acoustic and
multilingual uncertainty validation, LLM decisions and real evaluation integration.
No API key alone enables a candidate interview. The existing pgvector/full-chain
and Live Voice E2E worker/trusted candidate transport validations remain OPEN /
BLOCKED. This implementation does not claim production or Live Voice E2E readiness.
