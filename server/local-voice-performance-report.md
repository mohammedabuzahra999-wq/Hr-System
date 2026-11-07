# Local Voice performance investigation

## Scope and method

No HR routing, prompt, schema, permission, service, navigation, confirmation,
RAG, MCP or OpenAI Realtime behavior was changed. Text inference remains
Ollama/qwen3:4b, independently of VOICE_PROVIDER=local. No cloud speech call
or confirmed HR write was made.

The automated STT comparisons use the SAME four cached, synthetic local Piper
clips: Arabic, Jordanian Arabic, English and Arabic/English switching. Mixed
source audio uses separate Arabic/English voices. Audio is 16 kHz mono PCM16,
1.632–2.944 seconds long. These clips are useful for controlled timing and
relative recognition comparisons; they do not establish human microphone
accuracy. Low-quality synthetic dialect pronunciation is a material limitation.

Timing uses time.perf_counter()/performance.now(), not wall-clock subtraction.
CPU tests run sequentially to avoid concurrent STT/Ollama inference. Profiling
results and synthetic transcripts contain no actual employee records or secrets.

## Why the original Whisper turns take 21–33 seconds

The Python HTTP/TTS worker was persistent, but it launched whisper-cli for
EVERY STT request. Each CLI process loaded small-q5_1 again and wrote temporary
WAV/JSON files. The process/model lifecycle was therefore inefficient.

However, measured reload/startup overhead is much smaller than the encoder:

| Component | Measurement |
|---|---|
| Audio duration | 1.632–2.944 s |
| CLI process/help startup median | 31 ms |
| Model load | 269–566 ms |
| Encoder | 16.23–20.48 s |
| Mel feature extraction | 4–13 ms |
| Sampling + batch decoder | approximately 0.6–1.3 s |
| Python synthetic WAV conversion | 24 ms on first measured clip; cached thereafter |
| Old controlled one-shot total | 17.58–22.31 s, mean 19.63 s |
| Recording/VAD | push-to-talk; no VAD/automatic endpointing stage |

Short clips still use Whisper's full encoder context and automatic language
detection. Encoder CPU work, rather than actual speech duration, reloads or
WAV conversion, dominates. The installed Release build already selects the
Haswell AVX2/FMA backend, appropriate for this i5-8250U (4 physical cores,
8 logical processors). Four active inference threads use about 47–50% of all
eight logical processors, consistent with sustained four-thread computation.
CPU percentage is measured process CPU time divided by elapsed time and eight
logical processors; it is not an instantaneous Task Manager reading.

The historical 21–33 s and current controlled 17.6–24.5 s measurements vary
with clip, decoding retries, sustained CPU conditions and runtime state.
They should not be presented as a guaranteed before/after speedup.

## Implemented persistence and evaluated settings

The audio worker now keeps whisper-server and its model resident. The existing
PCM16 WAV is forwarded in memory through a private random loopback path. There
is no per-turn Whisper process, model reload, resample, FFmpeg conversion or
temporary audio/JSON file. No native transcript output is logged. Redirects
and proxies are disabled; a Windows job kills the native child on worker death.
The existing 40 s worker and 45 s backend STT timeout boundaries are retained.
Timeouts do not cause hidden retries or a cloud fallback.

Preserving four threads and the existing decoding settings, resident small
measured 18.83–24.46 s (mean 22.89 s) on the four clips. Thus persistence fixes
the lifecycle defect but does NOT demonstrate a conversational latency gain.

Other measurements:

- Two threads: both selected diagnostic clips exceeded 40 s. Rejected.
- Eight threads: 22.49–26.02 s; no useful improvement over four. Rejected.
- Greedy decoding: 24.37–29.22 s; encoder remains dominant. Not selected.
- Shorter encoder context with automatic language detection: English 8.34 s,
  Arabic 18.85 s with worse word accuracy. Not selected.
- Known-language + shorter context: 4.69–5.35 s, mean 4.99 s. Diagnostic only:
  UI language is not proof of speech language. Forcing that hint would change
  automatic bilingual behavior and has not been validated for language switching.
- No silence-trimming heuristic was deployed. These source clips are already
  short, and chopping quiet Arabic consonants would risk recognition quality.
- During server experimentation, verbose_json was found to perform an extra
  language-probability encoder pass in the pinned native server. The final
  runtime uses plain JSON and disables word/language-probability output.

## Smaller multilingual models

All were tested as resident processes with four threads and the same decoding
policy. No English-only model was used. WER is normalized word error rate,
lower is better; insertion errors can make WER exceed 100%.

| Model | Weight size | Mean STT | Arabic WER | Jordanian WER | English WER | Mixed WER |
|---|---:|---:|---:|---:|---:|---:|
| small-q5_1 | 190.1 MB | 22.89 s | 33.3% | 75% | 20% | 100% |
| base-q5_1 | 59.7 MB | 8.50 s | 66.7% | 100% | 0% | 100% |
| base multilingual | 148.0 MB | 7.00 s | 100% | 125% | 0% | 100% |
| tiny multilingual | 77.7 MB | 3.08 s | 166.7% | 150% | 0% | 100% |
| small multilingual / faster-whisper CPU int8 | 483.5 MB | 11.25 s | 33.3% | 75% | 40% | 100% |

Base misidentified synthetic Jordanian Arabic as Turkish. Tiny produced
non-Arabic-script gibberish for Arabic/dialect and omitted mixed-language
content. None was selected merely to meet a speed target. Small remains the
best of these tested whisper.cpp options for retaining Arabic behavior, though
its synthetic Arabic/mixed recognition is still imperfect.

The optimized-runtime comparison used faster-whisper 1.2.1 / CTranslate2
4.8.3, CPU int8, four threads, one worker, automatic language detection,
beam/best-of five, and the same held audio clips. Model initialization took
3.855 s once; subsequent Arabic/Jordanian/English/mixed STT took
12.576/12.564/9.967/9.884 s. Measured CPU use was 43.3–49.5% of eight logical
processors. The downloaded official small multilingual weights were pinned
to revision 536b0662742c02347bc0e980a01041f333bce120 and SHA256-verified.

This is an experiment, NOT a new active speech backend. Runtime packages
(approximately 60 MB of wheels) and weights/tokenizer (approximately 486 MB)
were added only to the ignored project-local environment. Normal setup and
the running worker still use whisper.cpp. Although faster than resident
whisper.cpp in this comparison, it still missed the five-second target and
the English transcript regressed. It was not automatically promoted.

Each table cell is one fixed synthetic clip, not a population accuracy score.
Arabic/dialect synthesis and CPU variability limit conclusions. No tested
automatic bilingual configuration demonstrated both acceptable recognition
and less than five seconds; a safe hardware minimum cannot be inferred from
the fast but inaccurate tiny-model result.

See `local-voice-stt-performance.json` for every transcript and CPU/timing row.
The two timeout rows in the optimize phase belong to the two-thread setting;
the profiler was subsequently improved to label that setting on future errors.

## Slow Ollama requests

An isolated diagnostic process ran the CURRENT unchanged Copilot router and
resolver functions with an authenticated development employee, real local
Ollama and existing scoped read services. Audit/training writes and confirmed
actions were blocked only in the profiler. It never prints returned HR data.
Diagnostic streaming measured the first token; production remains stream:false.

| Synthetic transcript case | Total Copilot | Resolve question | Prompt processing | Generation | Other/wait | Output tokens |
|---|---:|---:|---:|---:|---:|---:|
| Arabic ASR typo | 121.77 s | 120.18 s | incomplete at timeout | no response token observed | knowledge lookup 1.34 s | unavailable |
| Jordanian ASR wording | 87.19 s | 85.73 s | 24.53 s | 36.97 s | 23.97 s provider residual | 81 |
| Mixed ASR wording | 47.63 s | 46.22 s | 10.75 s | 35.03 s | 0.05 s provider residual | 80 |
| Ambiguous HR question | 70.26 s | 70.09 s | 29.82 s | 39.94 s | 0.04 s provider residual | 80 |
| Deterministic weather control | 0.079 s | not called | not called | not called | local terminal only | 0 |

Each model-routed case made ONE /api/chat request, with zero automatic retries.
Messages: two, no previous conversation plan. Prompt characters: 7,113–7,858;
schema: 1,864 characters. Retrieved training examples: zero or ten. Completed
API responses reported 1,675–1,902 total prompt tokens; Ollama's log separately
showed only 110–337 newly evaluated tokens when a shared prefix was cached.
CPU prompt evaluation in the observed logs was roughly 10–15 tokens/s;
generating the required structured plan took roughly 2.0–2.3 tokens/s.

The timed-out first request had processed only 1,536 prompt tokens at 114.4 s,
before producing an answer token. An already-loaded model can therefore still
hit the 120 s timeout on the uncached full prompt. This is prompt computation,
not unnecessary reasoning output: think:false and the existing /no_think
control were present, and all completed responses had zero thinking characters.

The 23.97 s residual/pre-generation wait followed the canceled request and is
consistent with queue/cancellation tail work. Ollama does not expose a distinct
queue_ms field, so this is an estimate, not a precisely measured queue counter.
Other calls had only about 40–50 ms residual. No concurrent STT/model benchmark
was running during this measurement. Old successful server-log records also
show 17–53 s prompt evaluation plus 26–31 s generation, matching the original
45–86 s observations.

Stage tracing found no repeated model invocation, no phraseAnswer call (Voice
bypasses it), no continueTask/resolveAction call in these profiled turns, and
no accidental OpenAI wait/fallback. Those latter functions still have their
existing key guards and local behavior. After the failed classifier,
knowledgeReply performed an existing scoped lookup in 1.34 s; no cloud
embedding/knowledge generation occurred because OpenAI was unconfigured.
Successful read services took about 1.27–1.31 s in this isolated cold-pool
process; that time is separate from classification. RBAC remained in the route.

## Warm/cold behavior and fix

Ollama initially had no resident model. Explicit load-only warmup took 12.01 s.
The empty warmup response did not return load_duration, so no fabricated
load-duration split is reported. Loaded model context was 4096; VRAM usage was
zero (CPU). Warm classification load_duration was only 10–19 ms.

Development structured requests now set keep_alive="30m". This preserves
qwen3:4b, all prompt/schema/options/thinking controls, provider selection and
the 120 s timeout. Production retains its previous residency policy. The
configured model's new expiration was verified through /api/ps. This reduces
idle unload/reload churn; it does not preload after an Ollama restart and
does not eliminate prompt or generation cost.

A short structured control using the same selected provider completed in
3.562 s: load 9.5 ms, prompt 1.346 s, generation 1.897 s, 18 prompt tokens and
10 output tokens. This explains how ordinary short Ollama interaction can feel
fast while the unchanged full classification workload is slow.

Raw route/provider measurements: `local-voice-copilot-profile-warm-stream.json`.
Short control: `local-voice-ollama-short-profile.json`.

## Post-change end-to-end check and real microphone test

One actual authenticated local Voice/API check with synthetic input
"What is the weather on Mars?" passed: correct transcription, deterministic
notHrData refusal, and nonempty local response audio. STT 31.547 s, Copilot
0.423 s, TTS WAV available 2.068 s, total 34.040 s. These are measurements,
not a claimed speedup. See `local-voice-performance-e2e.json`.

The current development UI has safe per-turn timings for recording duration,
captured audio duration, WAV conversion, STT, Copilot, TTS-to-first-playback,
and total response latency. Total begins when Finish is pressed; it excludes
recording time and does not include the full spoken reply duration. Timings
clear before the next turn. No prompt, employee ID or HR row is added to logs.

After all CPU profiling is idle, open http://localhost:5175, sign in, start
Local Voice and refresh audio status if necessary. For EACH phrase:

1. Choose Record a turn and permit microphone access.
2. Speak naturally, then immediately choose Finish and send.
3. Note the transcript and Recording/STT/Copilot/TTS/response timings. Confirm
   audibility and the visible result. Do not share actual HR record contents.

Phrases:

- ورجيني رصيد إجازاتي
- قديش ضايل إلي إجازات؟
- Show my attendance this month
- ورجيني attendance تبعي هالشهر

The app was left idle for the requested microphone test. The user subsequently
reported testing was finished or blocked and authorized automated checks to
continue, but supplied no microphone transcripts, timings or error details.
Consequently physical microphone/speaker results remain unverified. Synthetic
speech does not establish real Arabic/dialect/mixed accuracy or subjective
naturalness. Automated CPU profiling is now finished and idle again.

Final readiness checks returned HTTP 200 from the frontend at
http://localhost:5175, database-backed backend health at
http://localhost:8788/health, authenticated loopback audio-worker health,
and Ollama's version endpoint. STT reports resident whisper.cpp small-q5_1
ready; both local Piper voices report ready. These checks establish service
availability, not microphone permissions, audibility or conversational speed.

## Validation and unchanged boundaries

Workspace TypeScript/lint, backend/frontend builds, 15 existing offline Voice,
Copilot, validation/RBAC/scope, read, training/conversation and benchmark
self-test suites PASS. New resident lifecycle/private transport/timeout tests
PASS; a real Windows child-process test proved cleanup on abrupt worker exit.
Browser audio resampling/local-only/cleanup tests PASS. Existing OpenAI
ephemeral/unified Voice paths and confirmation checks PASS with offline mocks.
No paid/live OpenAI Voice API was called. Existing two React lint warnings and
the frontend chunk-size warning remain.

SHA256 comparison against the pre-task source snapshot confirmed 296 existing
files unchanged and exactly the ten existing source/script/document files
listed below changed. Shared contracts, HR routing/services/permissions,
RAG/MCP, navigation and OpenAI Realtime source were unchanged.

### Files changed

- `server/local-voice/worker.py`: use resident native STT, in-memory transport
  and safe scalar profiling metadata, retaining TTS and auth/size limits.
- `server/scripts/startLocalVoice.mjs`: allow explicit LOCAL_STT_THREADS only.
- `server/src/voice/local.ts`: validate optional safe STT timing metadata.
- `hr-app/src/features/copilot/localVoiceAudio.ts`: measure recording/audio and
  WAV conversion without changing recording behavior.
- `hr-app/src/features/copilot/useLocalVoiceCopilot.ts`: separate monotonic
  timing stages, clear stale timing, unchanged trusted turn/confirmation calls.
- `hr-app/src/features/copilot/PersistentVoiceCopilot.tsx`: expand the existing
  development timing text; no UI redesign.
- `server/src/ai/ollama.ts`: development-only 30-minute model residency.
- `server/src/ai/structuredProvider.check.ts`: prove residency-only change and
  unchanged OpenAI/provider/prompt/schema behavior offline.
- `server/src/voice/local.e2e.ts`: optional safe report filename to preserve
  earlier test artifacts.
- `server/local-voice/README.md`: updated setup/lifecycle/profiling instructions.

Created: `server/local-voice/stt_runtime.py`, `stt_runtime_check.py`,
`profile_stt.py`, `server/scripts/profileVoiceCopilot.mjs`, this report,
`server/local-voice-stt-performance.json`,
`server/local-voice-copilot-profile-warm-stream.json`,
`server/local-voice-ollama-short-profile.json`, and
`server/local-voice-performance-e2e.json`. Comparison models/clips remain under
ignored `.local-voice`; no real microphone recordings are stored.

### Conclusion

The whisper.cpp persistence defect is fixed, but a safe automatic bilingual
configuration meeting <3–5 s has not been demonstrated. Small remains much
slower; tiny meets timing but fails Arabic. Known-language cropped-context
results are not enabled automatically. The optimized CPU int8 runtime reduced
the synthetic mean to 11.25 s but still missed the target and did not preserve
all transcripts, so it remains diagnostic only. Resident whisper.cpp small,
four threads and automatic language detection remain active for compatibility;
this is not a claim of adequate mixed-language accuracy.

The unchanged large Copilot prompt is also not conversational on this CPU even
with a warm model. Deterministic Copilot responses can meet the sub-second
target (0.079 s isolated control / 0.423 s actual Voice check); model-routed
ones cannot in these measurements. Local TTS was about 2.07 s until WAV
availability in the latest API check; physical first sound is not measured.
The full automated Voice turn still took 34.04 s. The application is available
for manual testing, but a natural conversational experience has NOT been
achieved. No further architecture, routing, model or speech-feature changes
were made to mask these hardware and recognition limitations.

Sources for runtime interfaces/options: [pinned whisper.cpp server](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/server/server.cpp),
[Ollama chat metrics/keep_alive](https://docs.ollama.com/api/chat),
[faster-whisper](https://github.com/SYSTRAN/faster-whisper),
[CTranslate2 CPU support](https://opennmt.net/CTranslate2/hardware_support.html).
