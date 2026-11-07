# Local Voice for development

Voice provider selection is independent of the text AI provider. No new HR
agent, routing rules, prompts or direct database access are introduced.

```
microphone → AudioWorklet / PCM16 WAV → authenticated local STT endpoint
  → loopback whisper.cpp worker → transcript
  → SAME /voice/session/:id/turn (or reviewed /confirm)
  → existing Copilot validation, RBAC, scope, services and navigation
  → authenticated local TTS endpoint → loopback Piper → WAV → browser speaker
```

## Setup and start

From the repository root, with Python and Node installed:

```powershell
npm run voice:setup --workspace=@hr/server
npm run voice:local --workspace=@hr/server
```

Keep the worker terminal running. In another terminal run the existing app:

```powershell
npm run dev
```

The currently verified development servers use ports 8788 and 5175 because
other development servers were already using the defaults. They are already
running. To reproduce those ports after stopping them, use separate terminals:

```powershell
# Backend terminal, repository root
$env:PORT='8788'
npm run dev:api
```

```powershell
# Frontend terminal, repository root
$env:VITE_API_TARGET='http://localhost:8788'
npm run dev --workspace=hr-app -- --port 5175 --strictPort
```

Development defaults to `VOICE_PROVIDER=local`; production defaults to
`openai`. Explicit configuration in `server/.env`, if desired:

```dotenv
VOICE_PROVIDER=local
VOICE_ENABLED=true
LOCAL_VOICE_URL=http://127.0.0.1:8766
```

No OpenAI key or `VOICE_SHARE_AUDIO=true` is needed for local audio.
`AI_PROVIDER`, `OLLAMA_MODEL` and existing AI privacy settings are unchanged.
The current development text configuration is Ollama / qwen3:4b.
Model-routed text turns can still be slow on this CPU.

Worker process options are shell environment variables, deliberately not read
from the application's secret-bearing `.env`: `LOCAL_VOICE_PORT` (8766),
`LOCAL_STT_MODEL` (ggml-small-q5_1.bin), `LOCAL_STT_THREADS` (4), `LOCAL_TTS_AR_VOICE`
(ar_JO-kareem-low), and `LOCAL_TTS_EN_VOICE` (en_US-lessac-low). A custom
worker port must also match `LOCAL_VOICE_URL`. Selected files live under
`.local-voice/models`. The worker only binds IPv4 loopback.

## Use

Sign in on **localhost**, press the Voice microphone button once, and allow
microphone access. Speak naturally. About one second of silence ends the turn
automatically; there is no Record/Finish/Send step. The existing voice orb shows
listening, hearing you, processing and speaking. After the reply finishes,
listening resumes on the same microphone without another click.

Browser energy-based VAD keeps 300 ms of pre-roll, rejects brief clicks/noise,
trims surplus ending silence and caps each utterance at the existing 30-second
limit. Only completed speech clips are sent to the same authenticated local
STT endpoint. The microphone is gated during STT/Copilot/TTS and playback so
the assistant cannot transcribe its own reply. This initial local mode waits
for each reply; it does not offer spoken interruption while processing or
speaking. Stop with the orb's X button. Leaving the tab or signing out releases
the microphone and cancels the session. No cloud SpeechRecognition is used.

Endpointing adapts to the idle microphone noise floor and speech level, so
background sound does not have to become digital silence. A 30-second
wall-clock guard bounds an active turn even if sample delivery slows. Missing
microphone frames for 2.5 seconds stop capture with a microphone-specific error;
partial stalled audio is not submitted as a request.

Local Voice and the existing Development Voice Mock have separate controls.
The mock accepts typed final transcripts and bypasses microphone, STT and TTS.
Development diagnostics, the local transcript and mock controls are hidden in
the normal interface. Developers can explicitly add `?voiceDebug=1` to the
current local page URL, then expand Voice diagnostics to see engine/model
readiness and Ollama availability. This opt-in is ignored in production builds.
Use **Refresh audio status** after restarting the worker.

Action proposals still require the existing visible review and exact spoken
confirmation phrase. Local Voice never automatically confirms. Navigation
continues to use the existing authorized UI-effect pipeline. In particular,
the existing Voice fast-navigation behavior may open attendance for a spoken
"show my attendance" request rather than returning an attendance table.

## Engines and downloads

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.2),
  Windows x64 CPU binary archive: about 8.2 MB, pinned v1.9.2.
- [Multilingual Whisper small-q5_1](https://huggingface.co/ggerganov/whisper.cpp):
  about 190.1 MB. The initial 59.7 MB base model was tested but misrecognized
  basic Arabic; small improves recognition at a substantial CPU latency cost.
- [Piper](https://github.com/OHF-Voice/piper1-gpl), piper-tts 1.8.0 Windows
  wheel: about 34.1 MB, with ONNX Runtime CPU 1.31.0 (about 15.3 MB), NumPy
  (about 12.7 MB) and small supporting packages in a project-local Python venv.
- `ar_JO-kareem-low.onnx`: about 63.2 MB; `en_US-lessac-low.onnx`: about
  63.2 MB, plus configuration and model cards. Low-quality voices are selected
  to keep local CPU/memory costs modest. Arabic and English use separate voices.

The selected engines/models total roughly 390 MB of compressed downloads plus
supporting packages; installed disk usage is larger. Installer verifies SHA256
for whisper binaries and model weights. Review upstream engine licenses and
the downloaded per-voice MODEL_CARD files before redistribution. Piper engine
is GPL; the voice cards have their own dataset/license references.

## Security and failures

- Browser audio requests require loopback UI and API URLs, forbid redirects,
  and require the existing authenticated cookie and owned Voice session.
- Local endpoints perform size/format validation, rate limiting and bounded
  worker calls. No audio endpoint imports HR services or database code.
- Worker uses an internal random token, binds 127.0.0.1, has no CORS, and
  receives an allowlisted environment without application/API/DB secrets.
- Microphone chunks, the existing PCM16 WAV, transcripts and TTS audio stay in
  memory. The worker now keeps one native whisper-server process/model loaded;
  it no longer starts whisper-cli or writes temporary WAV/JSON files per turn.
  The native process uses a random private loopback route, no proxy/redirects
  and no native transcript logs. A Windows job terminates it if its worker dies.
  Raw audio/transcripts are not added to logs. Existing Copilot audit remains.
- STT worker timeout: 40 seconds; backend STT timeout: 45 seconds. TTS: 15
  seconds. Failures return `localVoiceUnavailable`, `localVoiceBusy`,
  `localVoiceNoSpeech` or `localVoiceInvalidAudio`; there is no cloud fallback.
- The backend serializes local STT/TTS through one bounded admission queue
  (three pending operations, at most 45 seconds waiting before inference).
  Worker busy metadata is checked before submitting audio, including native
  work remaining after a development-server restart. Only health is polled;
  the audio/text POST and any HR action are never automatically retried.
  Queue overflow/expiry stops microphone capture instead of submitting new
  automatic speech turns repeatedly. Existing engine execution deadlines stay
  unchanged. Idle readiness and active-operation metadata contain no HR data.
- Worker uploads have a five-second read/write socket timeout. Incomplete
  request bodies are read and rejected before acquiring the inference slot,
  so an interrupted upload cannot leave the speech engine locked.
- Local loopback checks assume a trusted local development/Vite proxy. Do not
  reconfigure that proxy to forward local audio to another machine.

## OpenAI Voice

Select `VOICE_PROVIDER=openai`, with the existing OpenAI key, voice enablement
and audio-sharing configuration. `/voice/prepare`, `/voice/connect`, unified
SDP, ephemeral credentials, WebRTC and Realtime session code are retained.
Local mode cannot warm or start those connections. No paid Voice request is
made by the offline regression checks.

## Validation

```powershell
npm run check
npm run check:voice:local --workspace=@hr/server
npm run check:voice --workspace=@hr/server
```

With the development app and worker running, the synthetic integration check:

```powershell
$env:LOCAL_VOICE_TEST_ORIGIN='http://localhost:5175'
npm run check:voice:local:e2e --workspace=@hr/server
```

It uses local Piper-generated audio, real Whisper, the authenticated existing
Voice/Copilot API and local output TTS. It never submits a confirmed HR write.
Only synthetic test text/transcripts, outcome codes and timings are saved in
`services/hr-api/local-voice-validation.json`; returned HR records and session cookies
are not printed or saved. This is a smoke check, not a model benchmark.

Timings use a monotonic timer: recording duration, captured audio duration,
WAV conversion, STT round trip; Copilot round trip; TTS until
the complete short WAV is available / browser play begins; total from capture
completion to first playback (not recording time or complete reply duration).
In hands-free mode, response timing starts at the automatically detected end
of the utterance; the diagnostic recording duration includes the endpointing
pause and audio duration describes the trimmed speech clip.
Physical microphone quality, speaker audibility and naturalness require a
human check in the browser; synthetic audio does not prove those properties.

Arabic dialect and code-switch recognition remain imperfect, especially with
low-quality synthetic Arabic speech. Arabic Piper may pronounce English words
poorly. Short Arabic/mixed test clips took roughly 21–34 seconds for STT on
this machine, and misrecognized transcripts can trigger much slower existing
Ollama classification. Treat readiness as engine availability, not a claim of
production-grade Arabic accuracy or latency. No routing patterns were added
to compensate for recognition errors.

## Performance profiling

The active model remains multilingual small-q5_1, CPU, four threads, automatic
language detection and the existing decoding settings. Keeping it resident
eliminates per-turn reload/startup but does not make its encoder inexpensive.
The controlled CPU comparison measured roughly 19–24 seconds with the resident
small model. Faster multilingual base/tiny models were not selected because
Arabic/dialect/mixed recognition regressed. Known-language/cropped-context
experiments are diagnostic only; the UI language is not proof of speech language.

A separate faster-whisper/CTranslate2 CPU int8 small-model experiment averaged
11.25 seconds on those same synthetic clips. It still missed the latency target
and one English transcript regressed, so it was not selected. Its packages and
weights remain in the ignored local environment for diagnosis; normal setup
and the active worker continue using whisper.cpp. No automatic engine switch
or cloud fallback was added.

Development Ollama structured requests now use `keep_alive: "30m"` to retain
the same configured model between turns. Production retains its previous
residency policy. This does not change prompts, context, thinking controls,
schemas, generation options, timeouts or routing, and cannot remove CPU prompt
processing/generation costs. It does not preload after an Ollama restart.

Synthetic-only profiling commands, run one at a time to avoid CPU contention:

```powershell
.local-voice/venv/Scripts/python.exe server/local-voice/profile_stt.py --phase baseline
.local-voice/venv/Scripts/python.exe server/local-voice/profile_stt.py --phase persistent
.local-voice/venv/Scripts/python.exe server/local-voice/profile_stt.py --phase optimize
.local-voice/venv/Scripts/python.exe server/local-voice/profile_stt.py --phase models
.local-voice/venv/Scripts/python.exe server/local-voice/stt_runtime_check.py
.local-voice/venv/Scripts/python.exe server/local-voice/worker_check.py
```

Optional diagnostic phases `--phase hints` and `--phase fast` reproduce the
known-language/short-context and optimized-runtime comparisons respectively.
The latter requires the already downloaded project-local faster-whisper
packages and pinned small model; it is not part of normal setup.

Optional base/tiny comparison weights are downloaded only for the experiment,
not installed or selected by the normal setup command. Synthetic clips/results
live under the ignored `.local-voice` directory. No real microphone recordings
are saved by this profiler.

The Copilot profiler runs unchanged route code in an isolated process with an
authenticated development actor, real local Ollama and existing scoped reads.
It blocks confirmed actions, audit/training writes and cloud requests. It logs
only synthetic questions, outcome codes, sizes, token counts and durations:

```powershell
cd server
node --conditions=development --import tsx scripts/profileVoiceCopilot.mjs --warm --stream-metrics
```

The streaming flag is diagnostic transport only (to measure first token);
production remains `stream:false`. Do not run profiling while measuring real
microphone turns. See `server/local-voice-performance-report.md` for results
and the four real-microphone instructions. Conversational latency targets have
not been demonstrated for automatic bilingual recognition on this CPU.
