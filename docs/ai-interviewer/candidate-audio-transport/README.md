# Trusted candidate audio upload

This implements the candidate microphone **uplink** for an authenticated interview that is already ACTIVE/LISTENING. Verification uses synthetic STT and Chrome's virtual microphone. It does not establish Live Voice E2E or production readiness. Default mock rooms retain their previous behavior because capture is disabled by default.

## Activation and authority

`AI_INTERVIEW_AUDIO_UPLOAD_ENABLED=false` is the default. Enabling it requires the existing server-only STT selection, dedicated speech credential and model configuration. Invalid or incomplete configuration fails startup. No credential is returned to the browser. Registration constructs the provider without a health claim or network call. The complete real delivery-provider gate remains closed: live START, TTS delivery/playback/STOP and worker composition are still unfinished. A key alone cannot enable a live interview.

The API's existing HttpOnly candidate cookie, Origin policy and candidate DTO allowlist remain authoritative. Staff, unrelated candidates, expired/revoked/replaced sessions and stale runtime owners cannot authorize an upload. Interview, session version, current question/turn, server generation, expected version, status and deadline are checked in PostgreSQL transactions. Browser audio is candidate input, not proof of who spoke or of microphone authenticity. Browser transcripts, evaluation results and provider receipts are never accepted by the audio endpoints.

## HTTP contract

All endpoints are under the existing candidate interview API and require its cookie and exact allowed Origin. Responses use existing no-store/security headers and sanitized errors.

| Endpoint | Request | Meaning |
|---|---|---|
| POST `/audio/begin` | Strict JSON: interviewId, submissionId, sessionVersion, expectedVersion, questionId, turnId, explicit audio-upload consent | Reserve one capture for this listening turn; return server generation and deadline. No answer is committed. |
| POST `/audio/upload` | Strict query: interviewId, submissionId, generationId; binary `audio/wav` body | Validate audio, claim a bounded STT attempt, invoke server-registered STT, atomically finalize the server transcript. |
| POST `/audio/status` | Strict JSON: interviewId, submissionId | Reconcile with durable reservation/commit receipts and current authorized state. |
| POST `/audio/cancel` | Same identity as status | Cancel pending work, fence late STT, or return the already committed result. A pre-reservation cancel writes a tombstone that fences a delayed begin. |

No endpoint accepts an invite token as upload authority. The short-lived stable submission identifier is correlation, not a credential. Upload query identifiers contain no secrets or answer text; existing request logging omits query strings.

## Capture and bounds

The candidate explicitly checks audio-upload consent and presses Record before `getUserMedia`. Permission denial creates no reservation. MediaRecorder captures supported WebM/MP4/Ogg locally; AudioContext decodes it and converts it to canonical PCM16 mono 16kHz WAV. Candidate-facing states distinguish permission, recording, a local recording not yet submitted, upload, STT processing, durable commit, retry, closure and failure. Re-recording requires fresh explicit consent. Hiding/unmounting the page, device loss and refresh stop recording/tracks; a late permission grant is immediately released. Refresh never reopens the microphone automatically.

Server validation requires canonical RIFF/WAVE, PCM16 mono 16kHz and exact data/container lengths. Duration is derived from PCM sample count, not client metadata: 250–120,000ms; maximum 3,840,044 bytes. Encoded browser capture is limited to 8MB before decoding. A complete upload is bounded to 15s and two process-local readers. STT has a maximum 15s logical deadline and two physical slots. An uncancellable provider retains its slot until settlement/process exit; late completion cannot commit. Existing provider body/response bounds still apply. Per candidate session, uploads allow six attempts/minute, begin/cancel twenty, status sixty, in addition to the existing general limiter. Rate limits supplement independent authorization.

## Durable commit and recovery

Existing command receipts/fingerprints and event persistence implement this protocol; no new database table or migration is introduced. A stable UUID identifies a capture. Reservation is not an answer. Each attempt pins server-computed audio SHA-256, a fresh attempt UUID, owner/generation, frozen expected version and deadline. Same-identity/same-byte concurrent requests invoke STT once. Different bytes under the same identity fail explicitly. Different capture identities cannot reserve the same turn concurrently. Typed/mock answer commands are blocked while that turn has an active capture.

STT runs outside the transaction. Final transcript, speech finish, final answer, commit receipt, committed status and interview snapshot are persisted in one transaction. Failure rolls back all these effects; no successful receipt or UI acknowledgement is fabricated. A retry after response loss, completion or a new runtime owner can return COMMITTED only after checking the durable receipt and exactly one matching finalized answer. Pending work from an old runtime owner is closed, not silently resubmitted or acknowledged. Cancellation, pause, turn advancement, replacement delivery generation, expiry and a newer attempt all fence stale results.

The UI polls authorized status before retrying. It claims success only for server COMMITTED. Disconnect, unknown response or interrupted upload retain the same identity and bytes when safe. Repeated clicks are suppressed for UX; database locking and receipts enforce correctness. Recording still in progress at refresh cannot preserve unflushed MediaRecorder data: recovery explicitly reports interruption and offers a new recording within the same still-valid reservation. Authoritative interview timers continue during recording/upload/STT and can close the turn.

## Exactly what is stored in the browser

| Storage | Contents | Lifetime / cleanup |
|---|---|---|
| sessionStorage `hr:ai-audio-tab` | Random nonsecret per-tab correlation UUID | Browser tab session; never authorization. |
| IndexedDB `candidate-interview-audio-v1`, object store `recovery`, per-tab slot | Versioned recovery envelope: interview/session/question/turn identifiers, stable submission UUID, consent constant, expected version, server generation, expiry/max duration, temporary WAV Blob (or null), expiry marker | WAV expires at the earlier server capture/turn/session deadline (at most 120s). Metadata remains no longer than the candidate session expiry (existing maximum 2h). Success, acknowledged cancellation or auth failure attempts removal. Lazy cleanup on active state updates and the next database open deletes expired session envelopes and removes expired WAVs. |

No key, invite/session credential, provider receipt, transcript or evaluation is placed in this store. New tabs use separate slots. An envelope's interview/session is checked against freshly authenticated state before use; it cannot authorize recovery. Writes are serialized per store instance and cleanup compares capture identity to avoid deleting a newer record. Storage/quota denial prevents sending an unpreserved recording and displays a safe recovery error. Cleanup failure is visible even if the server has durably committed.

Temporary audio is accessible to the same origin and browser profile, so XSS and shared-profile access remain relevant. HttpOnly session protections are unchanged. Physical deletion cannot execute while the browser is closed: expired records are removed when the database is next opened. Browser storage is best effort and cannot guarantee recovery after profile deletion, private-storage eviction or device loss. Server memory holds audio only during upload/STT; raw audio is not written to application DB, logs or disk. The finalized server transcript uses existing durable answer/evidence persistence. A future real provider's own retention policy needs separate review.

## Verification and reproduction

`run.mjs RUN_ID init` records a fresh source/environment/inventory baseline. `run.mjs RUN_ID all` executes guarded synthetic contracts, PostgreSQL/security tests, native Chrome tests, existing regression suites, type checks/builds, post-build secret scans and the unchanged full migration probe. Use a new run ID for rechecks; never overwrite a failed result. `integrity` verifies source stability and prior protected files. The runner allowlists child environment variables, injects no real key, refuses nonlocal Node requests, redirects old-suite output into this new package and suppresses fixture credentials/screenshots. Browser page requests are intercepted; Chrome background traffic is not independently packet-captured.

Final results and exact source changes are in `runs/final-20261105/REPORT.md` and machine-readable summaries. `evidence.mjs` generates the report and artifact manifest; `verify.mjs` independently rechecks source, every accepted package, test results, manifest entries, privacy and cleanup without writing evidence.

## Remaining scope

Supported deployment remains one process and one runtime owner. Limits are process-local; synchronous CPU cannot be preempted. A 10s global HTTP shutdown grace can terminate an outstanding 15s upload/STT operation; no success is fabricated, committed work reconciles durably and old pending generations close after restart. No distributed or uninterrupted pending-provider restart guarantee is claimed.

Live downlink/TTS/playback/STOP and full production delivery composition, real worker/provider validation, real-device/browser/acoustic testing, LLM orchestration and evaluation-provider integration remain gaps. **pgvector/full migration-chain validation and Live Voice E2E remain OPEN / BLOCKED.** No retention/deletion or distributed work is included.
