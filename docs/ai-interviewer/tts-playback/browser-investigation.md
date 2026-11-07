# Phase 3 warning/grace investigation and atomic fix

All accepted historical failures remain byte-identical. No original assertion,
wait, deadline, grace period or expected-version check was weakened.

The first TTS final run and its isolated expanded-browser retry both failed at
20/21, in `Warning and grace are backend-authoritative`, on pre-fix source
ab72e7acb5a92064feb8180032747320d3d87838c8aaef38992fa7b145d1cd88.

The retry's safe metadata trace proves this ordering:

1. Clarification playback ends at version 23 with LISTENING/speaking=false.
2. The intentionally stale command receives 409; reconciliation returns 23.
3. The next unmodified speech-start also uses 23 and receives 409.
4. Fresh state is 24/speaking=false; the new event is ANSWER_WARNING.

The trace is retained at
`runs/browser-recheck-20261105/answer-browser-cdp-metadata.json`. It records only
path/method/time/command type/expected version/status/phase/speaking/error and
allowed event types. The intentionally tampered first request's recorded version
is from before the test's CDP rewrite; the second request is not tampered. No raw
response body, answer, credential or provider receipt is retained. Extra read-only
CDP response observations can affect timing but do not change assertions.

The pre-fix controlled PostgreSQL check reproduces the same possibility: a 30s
clarification clamps warningAtSec to 30, making it immediately due; maintenance
emits it after the listening response and bumps the version. This establishes the
mechanism for the traced retry. Older untraced failures are consistent but cannot
be individually attributed with certainty.

The smallest engine correction persists an already-due warning in the SAME engine
transition/transaction as ANSWER_LISTENING_STARTED, before returning the client
version. It does not change time limits or grace, waive version checks, retry a
candidate command or change tests. Non-immediate warnings retain existing timing.

The corrected targeted PostgreSQL check proves one warning at the listening
version, an actual InterviewMaintenance pass leaving that version unchanged, and
the next speech-start accepted. The original 37/37 engine suite passes unchanged.
The corrected full regression run independently records the 44/58/56 original
browser results; only completed results are reported.

A separate corrected-source native TTS run timed out in its initial HR setup
assertion (0/1), before audio tests. That original result remains; isolated native
28/28 passed on unchanged source. Its exact setup-timeout cause is not claimed.