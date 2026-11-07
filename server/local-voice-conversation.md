# One-click local Voice conversation

The local provider now uses one microphone click for a sequence of automatic
speech turns. After permission, the existing orb listens; sustained speech
starts a turn and about one second of silence ends it. The same local Whisper
endpoint transcribes the clip, the same trusted Copilot endpoint handles it,
and Piper speaks the reply. Capture resumes only after playback finishes.
There are no Record/Finish/Send buttons in the local conversation UI. The
internal transcript remains available inside collapsed development details.

## Implementation

- One native-rate AudioContext/microphone per session; existing PCM16 conversion
  produces the same validated 16 kHz WAV for the backend.
- Local energy VAD: 120 ms sustained onset, 240 ms minimum voiced content,
  300 ms pre-roll, one-second ending pause and 250 ms retained ending audio.
  Brief clicks and silent waiting submit no request. Utterances retain the
  existing 30-second cap. No words, names, intents or benchmark patterns are used.
- Capture is gated during STT, Copilot, TTS and reply playback. This initial
  mode waits for each reply; spoken interruption is not implemented.
- Stop, tab hiding, unmount and device failure release capture. Late microphone
  permission or STT results cannot reopen a stopped session. Expired/auth-failed
  requests stop capture. Audio remains in memory only.
- Existing blocked-playback recovery reuses the same reply audio and resumes
  listening after it finishes. It cannot repeat a backend request/action.
- Action proposals do not arm automatically. Visible review and the existing
  server-verified exact confirmation phrase remain required. The microphone is
  paused while the assistant speaks that phrase.

Changed files:

- `hr-app/src/features/copilot/localVoiceAudio.ts`
- `hr-app/src/features/copilot/useLocalVoiceCopilot.ts`
- `hr-app/src/features/copilot/useVoiceProvider.ts`
- `hr-app/src/features/copilot/PersistentVoiceCopilot.tsx`
- `server/scripts/checkLocalVoiceBrowser.mjs`
- `server/scripts/checkLocalVoiceTurn.mjs`
- `server/local-voice/README.md`

Created `hr-app/src/features/copilot/localVoiceVad.ts`, this report, and the
synthetic API smoke result `server/local-voice-conversation-e2e.json`.

Hash comparisons confirm all backend/shared source, `.env`, provider adapters,
HR routing/services, RBAC, RAG/MCP and OpenAI Realtime hook unchanged.
AI_PROVIDER, OLLAMA_MODEL and Voice provider selection were not changed. No new
package, cloud speech service, model download or automatic fallback was added.

## Validation

- Workspace TypeScript/lint: PASS. Existing GapForm/ScorecardEditor warnings
  remain. A TypeScript parameter-property restriction found during development
  was corrected without changing compiler options.
- Frontend production build: PASS; existing large-bundle warning remains.
- Local Voice regression suite: PASS. Includes 48 kHz microphone conversion,
  automatic endpointing, natural short pauses, silence/noise rejection, 30-second
  bound, echo gating and resource cleanup.
- Real local Voice hook with mocked media/transports: PASS for multiple turns
  from one microphone, automatic reply/listening, deferred STT/Copilot/TTS,
  blocked playback recovery, unreviewed action refusal, reviewed confirmation,
  cancellation and delayed microphone permission cleanup.
- Existing Voice session ownership and exact-confirmation suite: PASS.
- Existing authenticated synthetic API smoke: PASS. STT 17.663 s, Copilot
  0.378 s, response WAV 0.479 s, total 18.521 s. Correct terminal out-of-scope
  response; no confirmed HR write or cloud audio request. This API check does
  not exercise a physical microphone/speaker; automated browser capture tests
  use mock hardware. No live model benchmark was run.

## Manual use and limits

Open http://localhost:5175, refresh, and press the round Voice microphone once.
Allow microphone access, speak a short HR request, then pause. Wait for the
spoken reply; speak again after it finishes. Use X to stop. If browser playback
is blocked, use Play the reply. Keep the app tab visible.

Physical microphone sensitivity/audibility remains for user verification; no
browser-control surface was available. Energy VAD may need calibration for a
quiet microphone or noisy room. Existing CPU STT/model latency remains: this
change removes manual turn submission and does not make the engines realtime.

## Endpointing correction

A controlled regression reproduced a stuck hearing state: idle RMS 0.01,
speech RMS 0.05, then background RMS 0.01 never met the original fixed 0.007
silence threshold. Endpointing now uses the learned idle floor and relative
speech level. The same regression ends the utterance against non-zero noise.
Both browser/capture and actual-hook regression checks pass.

The capture helper also enforces a 30-second wall-clock bound and a 2.5-second
missing-frame watchdog. Stalled/disconnected input releases capture, reports a
microphone-specific error and never submits partial audio or a model request.
This is a demonstrated code failure and correction, not a measurement of the
user's physical room noise. Backend, providers, HR routing and permissions were
not changed by this correction.

## Busy-service correction

The worker previously rejected every overlapping STT/TTS request immediately.
Browser cancellation/reload does not itself stop native inference already
forwarded by the backend. During diagnosis the worker had already become idle;
the exact earlier request was not logged or reconstructed from private audio.
A separate confirmed defect held the inference semaphore while reading an
unbounded upload; a partial upload could therefore block every other operation.

`server/src/voice/localQueue.ts` now admits local audio operations serially,
with three pending slots and a 45-second admission deadline. Safe worker busy
metadata is polled before the single audio/text submission, so leftover native
work can finish. The slot is held until the response body is consumed. Existing
40-second native STT, 45-second backend STT and 15-second TTS deadlines remain;
the additional wait happens before submitting inference. There is no POST retry,
provider fallback or HR action replay. Overflow/expiry stops automatic capture.

`server/local-voice/worker.py` exposes only operation type/duration and busy
state on authenticated health. Uploads have a five-second socket timeout and
are fully read before locking inference. Truncated uploads cannot occupy the
slot. The worker was restarted with the existing models and secret-free launcher.

Offline queue, actual-hook, Voice ownership/confirmation, real-loopback worker
concurrency/partial-upload tests and workspace TypeScript checks pass. Backend
build passes. Two simultaneous authenticated synthetic TTS requests both
returned HTTP 200 with non-silent PCM (1.458 s and 2.752 s), zero 429 responses.
See `server/local-voice-concurrency.json`. No physical speaker claim is made.
The real-engine synthetic Voice smoke also passed after restart: STT 23.816 s,
Copilot 0.396 s, response audio 0.581 s, total 24.795 s, no busy response.
See `server/local-voice-queue-e2e.json`. Final worker health was ready and idle;
all inference checks were then stopped for manual use.

This correction changes local audio admission/worker handling, the frontend's
busy-error stop behavior, regression scripts and documentation. Copilot routing,
RBAC, schemas, providers, `.env`, database and OpenAI Realtime are unchanged.
