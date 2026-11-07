# AI Interviewer — Phase 3

The first HR and standalone candidate browser experience uses the Phase 1 engine,
Phase 2 transactions/security and deterministic mocks. No Phase 4 report/review UI
or Phase 5 provider/audio integration is included.

## HR workflow

Use the existing `/hr/recruitment` page as HR/Admin. Each application has an
**AI Interview** action opening the existing native-dialog component in a wider
layout. Manager/employee roles retain no recruitment access.

1. Select job requirements from that opening's approved job description.
2. Configure interview language (en/ar/mixed), questions and types.
3. Review explicit answer duration, remaining-time warning, speaking grace,
   follow-up count/duration, clarification count/duration and approved prompts.
4. Create the interview, review the saved plan, then approve/make READY.
5. Generate an invitation and copy its private link. The plaintext link is held
   only while that dialog is open, clears after one minute, and clears immediately
   after copying or revocation. It is never placed in browser storage or logs.
6. Revoke, cancel or refresh operational status. The panel polls while open.
   Completed/cancelled attempts can be followed by a new attempt.

Question-type presets populate visible plan fields (technical 180 seconds,
behavioral 120, experience/job-specific 90); they do not silently change a saved
plan. Shared `createAiInterviewSchema`/`interviewPlanSchema` validate submission.
Questions and follow-up/clarification banks remain HR-reviewed text, not model-
generated content. The mock evaluator rubric remains synthetic. No scoring or
evidence dashboard is presented. Evaluation is shown at status level only.

## Candidate flow and routes

```text
/interview/join?token=...
  → one-use Phase 2 exchange
  → replace navigation to /interview/session
  → persisted consent
  → confirm configured interview language
  → mock readiness check
  → interview room
  → completion
```

Static join/session routes take precedence over the unchanged written
`/interview/:token` route. The candidate entry does not initialize employee
AuthProvider or employee SSE. It has no HR sidebar, assistant or employee links.
An employee cookie, if already present in the same browser, grants no candidate
authority. Candidate APIs still validate their own interview-bound cookie.

The token is read only for exchange. StrictMode initialization shares one pending
exchange, preventing duplicate consumption. Success removes the query with replace
navigation; failed exchanges also remove the credential URL. No token is put in
localStorage/sessionStorage, analytics, UI state snapshots or manual headers.
An uncertain exchange cannot fall back to a previous candidate's cookie: the
candidate must ask for a new invitation if exchange could not be confirmed.

The candidate API client only calls `/api/ai-interview/*`, with credentials,
no-store and no-referrer. It has separate errors/cache from employee auth.
Expired/revoked sessions clear the room, draft UI, events and retry state.
Candidate entry HTML avoids third-party font requests and sets a no-referrer
policy. The ordinary application's existing font choice is preserved.

## Consent, language and readiness

Consent uses the existing ACCEPT_CONSENT command and `ai-interview-v1` policy.
The screen describes AI-assisted evaluation, finalized answer processing,
independent answers, time limits and the absence of raw audio storage. It also
identifies the current development simulation. Backend consent remains required
before start, and refresh reloads the persisted consent.

Interview language is the frozen HR choice. Candidate confirms it rather than
mutating the approved plan. Display language can independently be English or
Arabic using the existing I18nProvider. Mixed mode allows both languages; no
script-based answer filter is introduced. Questions/answers use `dir=auto`, and
Arabic UI uses RTL without changing the spoken-language setting.

The mock readiness screen checks the authenticated state, backend reachability
and mock capability. It never calls getUserMedia, STT, TTS or WebRTC and never
claims a real audio connection. Production has no real provider yet, so starting
delivery is unavailable there.

## Room and authoritative timing

The room renders only server-approved current question/delivery, current turn,
progress counts, lifecycle/phase, speaking state and safe timer metadata. It
distinguishes AI speaking, listening, processing, follow-up, clarification, pause,
reconnection, recoverable failure and completion. Future prompts, rubric, weights,
evaluation, HR notes and application decisions are never candidate DTO/UI fields.

`InterviewTimer` animates from backend remainingMs anchored to performance.now()
at receipt. The browser never starts a fresh question timer, extends a deadline,
finalizes at zero or assigns a timeout score. Server grace state controls the
grace display. PAUSED/FAILED freezes the displayed saved duration, and resume
uses the new server deadline. Fresh state is accepted only for the pinned
interview and nondecreasing version/server timestamp.

The development auto-play checkbox schedules **media observations** only:
playback started/finished. These pass through the gated mock route and the
existing MockRealtimeProvider/observation mapper. They do not select questions
or transition state in the browser. The backend remains authoritative for all
question selection, limits, evaluation and completion.

## Events and cache/concurrency safety

The existing SSE infrastructure is staff-authenticated and not a durable candidate
channel. Phase 3 deliberately uses polling plus Phase 2 ordered replay rather than
weaken that boundary or add a WebSocket server. Active sessions poll about every
1.5 seconds; READY polls less often, and terminal views stop polling.

Each session owns its in-memory cache, pinned interview id and lastSeenSequence.
Replay pages are sorted/deduplicated, including cursor advancement across filtered
internal records. Every sync reconciles an authoritative snapshot; event gaps do
not cause the UI to invent transitions. Older responses cannot overwrite a newer
version, and a different candidate cookie cannot populate an existing cache.

Each action uses the current server version and a stable command id. A 409 fetches
the latest state and explains the conflict; the action is not blindly retried.
The developer retry control explicitly resends the identical saved envelope to
exercise durable idempotency. No optimistic local version increment is used.

Refresh at Q3 reloads that question/turn and remaining duration from the backend;
it does not recreate the plan or submit an answer. Pause/disconnect simulation
first persists the Phase 2 pause. Reconnect fetches/replays, and the candidate
explicitly resumes. Actual unreachable-network messages do not falsely claim
that the server has already paused; real transport loss detection remains later
work. Unfinalized text is intentionally not saved across refresh.

## Development flags and security boundary

Both must be explicitly enabled in development:

```text
API: AI_INTERVIEW_DEV_MOCK=true
Web: VITE_AI_INTERVIEW_DEV_MOCK=true
```

Defaults are false. The frontend additionally requires import.meta.env.DEV, so a
production build removes MockControls even if VITE_AI_INTERVIEW_DEV_MOCK=true was
supplied. The API requires `production=false` and its mock flag; production never
registers the mock route, even with the environment flag set. Candidate START is
refused with provider-unavailable when no permitted runtime exists.

The development-only POST `/api/ai-interview/dev/mock` accepts a closed set of
observations, not arbitrary engine commands. It checks the same session scope,
revocation, lifecycle, current playback/turn, expectedVersion and durable command
receipt in the same transaction. Its internal capability is not part of a
candidate request. Normal candidate commands remain allowlisted and cannot mark
ready, choose questions, fail interviews, evaluate or set scores.

Scenario tools cover playback, example answers, silence via the actual deadline,
speaking/grace, interruption, disconnect, provider failure, pause/resume, duplicate
retry and refresh. They neither request real audio nor provide an HTTP endpoint
to change time. Short demo timings are explicit HR plan values. Browser tests
advance an injected server clock through private test-process stdin, never through
the application API or frontend.

## Backend additions

No database schema or migration change was required. Migration 0026 and the Phase
1 engine remain unchanged. Additions are:

- HR GET `/api/recruitment/applications/:applicationId/ai-interviews` summaries.
- HR GET `.../ai-interviews/configuration` approved criterion labels/keys.
- Candidate GET `/api/ai-interview/config` nonsecret runtime capability.
- Development-only POST `/api/ai-interview/dev/mock` scoped mock observations.
- Safe DTO metadata: server clock, speaking, resumability, pause reason, progress
  counts and whether current delivery started. Existing private fields remain
  excluded.
- Maintenance accepts an injected service/clock for isolated verification; its
  default production behavior and transaction/version rules are preserved.

## Manual local demo

Use the portable PostgreSQL cluster provisioned for Phase 2, or any local test
PostgreSQL server. The fixture refuses remote DATABASE_URLs and creates only a
uniquely named synthetic database. It never loads `server/.env`.

From the repository root, start PostgreSQL:

```powershell
& '.\.local-dev\ai-interviewer-postgres\pgsql\bin\pg_ctl.exe' -D '.\.local-dev\ai-interviewer-postgres\data' -l '.\.local-dev\ai-interviewer-postgres\postgres.log' -o '-h 127.0.0.1 -p 55442' start -w
```

Terminal 1 — synthetic API:

```powershell
$env:AI_INTERVIEW_TEST_DATABASE_URL='postgresql://phase2_test@127.0.0.1:55442/postgres'
npm.cmd run demo:ai-interviewer:ui -w @hr/server
```

Terminal 2 — frontend:

```powershell
$env:VITE_API_TARGET='http://127.0.0.1:8793'
$env:VITE_AI_INTERVIEW_DEV_MOCK='true'
npm.cmd run dev -w hr-app -- --host localhost --port 5179 --strictPort
```

Open `http://localhost:5179/login`. Synthetic HR login:
`hr.interview@example.invalid` / `Synthetic-Demo-3!`. Admin, manager and employee
use the same synthetic password and corresponding `admin.interview`,
`manager.interview`, `employee.interview` email prefixes.

1. Open `http://localhost:5179/hr/recruitment`, then Demo Candidate → AI Interview.
2. Configure/review questions and timings. Add a third question for refresh checks.
3. Create, approve/make READY, generate and copy the invitation.
4. Open it in a separate/incognito browser. Confirm URL becomes
   `http://localhost:5179/interview/session` with no token.
5. Accept consent, confirm Mixed language, confirm mock readiness and start.
6. Observe AI speaking, listening and the server timer. Open Mock scenario tools.
7. For the RAG scenario submit `I used RAG in an HR assistant.`; then
   `I checked some results.` for a clarification; then
   `I measured recall@5 on labeled queries and reviewed incorrect retrievals.`.
8. Exercise interruption while AI speaks, speaking through grace, pause,
   simulated disconnect, reconnect/resume, retry and refresh at Q3.
9. Complete the remaining questions/closing, then return to HR and refresh status:
   interview COMPLETED, evaluation PENDING. No detailed review UI is shown.
10. Stop the fixture with Ctrl+C; it closes its server and drops only its generated
    synthetic database. Stop Vite and the test PostgreSQL cluster when finished.

For the ordinary configured application instead, set the two development flags
on its API/frontend processes, use its normal ports (8787/5173 by default), and
use actual authorized HR credentials. Do not point test commands at that database.

## Checks and visual evidence

```powershell
npm.cmd run check
$env:VITE_AI_INTERVIEW_DEV_MOCK='true'
npm.cmd run build -w hr-app
npm.cmd run check:ai-interviewer:ui -w @hr/server
$env:AI_INTERVIEW_TEST_DATABASE_URL='postgresql://phase2_test@127.0.0.1:55442/postgres'
npm.cmd run check:ai-interviewer:browser -w @hr/server
npm.cmd run check:ai-interviewer -w @hr/server
npm.cmd run check:ai-interviewer:persistence -w @hr/server
npm.cmd run demo:ai-interviewer -w @hr/server
npm.cmd run check:voice -w @hr/server
npm.cmd run check:scorecard -w @hr/server
npm.cmd run check:permissions -w @hr/server
```

Run Local Voice with synthetic process-only DATABASE_URL/SESSION_SECRET, and MCP's
existing `authorization.security.check.ts` as documented in Phase 2. No API key is
needed. Browser checks use the already-installed Chrome and its local debugging
protocol; no browser test framework/package was installed. Vite's existing HMR and
Chrome's debug protocol are not an application WebSocket server.

The browser script starts a local synthetic fixture and dev/production-preview
frontends, uses isolated browser contexts, real login/session cookies, the actual
Phase 2 service/PostgreSQL transactions and the new UI. It captures HR planning,
consent, readiness, speaking/listening, warning/grace, pause, refresh/Q3, mobile,
Arabic and completion views under `.local-dev/ai-interviewer-phase3/screenshots`.
The test fixture uses synthetic legacy parent tables (unused vector/enum columns
are nullable text), and applies migration 0026 verbatim. Its local-only stdin
clock controls and production-policy probe are not mounted by the application.

Candidate pages must complete zero external requests and invoke no microphone or
RTCPeerConnection. The backend fixture denies all non-PostgreSQL outbound sockets
and all fetch. Existing HR third-party font requests are blocked before they leave
the browser and counted separately. No model is contacted. Browser results are in
`.local-dev/ai-interviewer-phase3/browser-results.json`; source hashes, commands,
final counts and regression results are in `phase-3-verification.json`.

## Limits and deferred phases

- This is a mock browser experience, not production voice. No microphone, STT,
  TTS, WebRTC, real AI/evaluator or WebSocket server was added.
- Interview language is confirmed from the frozen plan; changing it requires an
  HR-approved new attempt rather than a hidden candidate-side plan mutation.
- Real network loss cannot prove server pause while offline. The UI restores
  actual backend state and makes no false timing guarantee.
- Polling and the existing per-process rate limiter are not a distributed
  transport solution; Phase 2's single-process runtime limit still applies.
- A one-use invitation with an unconfirmed exchange may require HR to issue a
  replacement. Credentials are not retained to make a silent retry possible.
- No final evidence report, ranking, override or hiring workflow was added.
- No Phase 4 or Phase 5 work was started. Frozen training/benchmark/model-selection
  artifacts and the existing written/Voice/Copilot/MCP behavior are preserved.

## Recorded Phase 3 result

| Verification | Result |
| --- | --- |
| UI/cache/timer logic checks | 23/23 PASS |
| Real Chrome + local PostgreSQL browser checks | 44/44 PASS |
| Phase 1 deterministic regression | 37/37 PASS |
| Phase 2 persistence/security, including written routes | 65/65 PASS |
| Existing MCP authorization | 18 scenarios PASS |
| Voice, Local Voice, permissions and scorecard | PASS |
| Contracts/API/web typechecks and production web build | PASS |

The two existing web lint warnings remain in GapForm.tsx and ScorecardEditor.tsx;
neither file was modified. The build also reports its existing-size-threshold
advisory for the large application chunk. A production rebuild with the mock flag
explicitly true produced byte-identical JS/CSS/HTML to the verified production
preview, with no MockControls chunk or provider-failure control text.

The browser suite completed the whole HR → candidate → HR lifecycle, including
the explicit A/B isolation checks, Q3 refresh at approximately 75 seconds, five-
minute paused time preservation, grace expiry, silence, recovery, RTL/mobile,
production fail-closed checks and final HR status. Candidate external requests
and microphone/WebRTC invocations were zero; backend fixture outbound attempts
were zero. Existing HR font requests were intercepted and blocked separately.

No schema, migration, dependency or frozen training artifact changed. The Phase 1
engine was not modified. New/modified file lists and hashes are recorded in the
verification JSON; an unrelated editor settings file observed during work is
listed separately and was not edited as part of this feature.
