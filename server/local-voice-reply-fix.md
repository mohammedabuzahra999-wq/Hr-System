# Local Voice playback recovery

The reported absence of audible replies was investigated without changing HR
routing, permissions, providers, prompts or speech engines. Browser access was
unavailable, so physical microphone/speaker playback has not been verified.
The precise cause of the user's browser failure is not yet established.

## Confirmed findings

- A synthetic 2.528-second Arabic clip passed the authenticated STT endpoint
  in 32.095 seconds. The persistent native inference portion was 30.695 seconds.
  This explains a long wait before any transcript; it does not prove a hang.
- Authenticated local TTS produced valid, non-silent PCM WAV in both languages:
  English HTTP 200, 1.595 seconds, RMS 5556; Arabic HTTP 200, 1.336 seconds,
  RMS 4664. No actual HR records were used or saved.
- The frontend previously classified browser playback rejection as a local
  speech-service outage, claimed speaking before play() succeeded, and provided
  no recovery using the already-generated audio. A missing audio element was
  also silently treated as successful completion.
- STT, Copilot and TTS waiting stages previously shared an indistinct status.
  Development engine/mock details were always expanded.

Browser playback can reject even when speech generation succeeds; the
[HTMLMediaElement.play documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)
recommends handling the returned promise and user-initiated playback when
automatic playback is blocked. This is a supported failure condition, not a
claim that it was observed in the user's browser.

## Changes

- Distinguish blocked/failed playback from unavailable STT/TTS; only mark
  speaking after play() succeeds.
- Keep failed reply audio in memory and show **Play the reply**. Its click
  calls play() directly and never repeats STT, Copilot, review or confirmation.
  Stop, next recording and playback completion still release the audio URL.
- Show the actual local phase: transcription, Copilot, or speech preparation.
- Collapse existing development/mock details under a summary; retain them for
  diagnosis. Real Voice and the mock remain separate.

Changed existing files:

- `hr-app/src/features/copilot/localVoiceAudio.ts`
- `hr-app/src/features/copilot/useLocalVoiceCopilot.ts`
- `hr-app/src/features/copilot/useVoiceProvider.ts`
- `hr-app/src/features/copilot/PersistentVoiceCopilot.tsx`
- `hr-app/src/features/i18n/dictionary.ts`
- `server/package.json` (offline test command only)

Created `server/scripts/checkLocalVoiceTurn.mjs` and this report.

## Validation

- Workspace TypeScript/lint: PASS; the same existing GapForm/ScorecardEditor
  warnings remain. No new warning remains in the local Voice hook.
- Frontend production build: PASS; existing large-bundle warning remains.
- Local Voice regression suite: PASS, including actual-hook deferred-stage,
  ordinary playback, blocked playback/recovery, cancellation and confirmation
  checks. The browser/media transports are mocked; no live cloud call is made.
- Existing Voice session/ownership/exact-confirmation suite: PASS.
- General suggestion wording check: FAIL with the same eight pre-existing
  missing entries: payrollInsights, payrollReadiness, payrollRunSummary,
  payrollAuditSummary, payrollFindings, departmentAbsenceComparison,
  openJobOpenings and knowledge. Removing only the new Voice dictionary lines
  in memory reconstructs the exact pre-change SHA256 and the same failures.
  Those unrelated suggestions were not changed.
- The development frontend serves the updated component and hook with HTTP 200.
  Backend database health and the Whisper/Piper worker remain ready.
- Hash checks confirm `.env`, backend Voice routes, OpenAI Realtime, the OpenAI
  Voice hook and Copilot resolver/routes unchanged.

## Manual readiness

Use http://localhost:5175 and refresh the page before starting Local Voice.
Record a short turn, then Finish and send. The displayed phase identifies where
it is waiting. If the browser blocks the prepared reply, press **Play the reply**.
No claim of physical audibility or reduced Whisper/Ollama CPU latency is made.
