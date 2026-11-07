# Development attempts retained

Final acceptance uses only the completed frozen-source `final-20261105` results. Earlier attempts are retained under `runs/development-*`; their failures are not counted as final PASS and no accepted test assertion was weakened.

| Attempt | Result and correction |
|---|---|
| 1 | Contracts 23/23 passed; new DB fixture failed before assertions because it selected the last unordered event. New fixture now orders by sequence. |
| 2 | 14 DB assertions passed, then expired-session work threw during admission. Production claim now returns no work for an expired session and makes no provider call. |
| 3 | DB 19/19 passed at that development stage. |
| 4 | 18 DB assertions passed; discovery test incorrectly assumed its interview would be selected before other existing fixture rows. The new discovery test was isolated first, retaining its assertion that real dispatcher discovery launches without awaiting model work. |
| 5 | DB 24/24 passed. |
| 6–7 | New browser suite stopped after 17 passes. Its new wait helper treated an async predicate as truthy before the DOM/state changed; an inherited polling helper accepts synchronous predicates. Replaced only the new helper with an awaited state-and-DOM predicate. |
| 8 | Contracts 24/24 and DB 24/24 passed. Browser stopped after 19 passes waiting for the explicit HR retry. Added safe diagnostics and awaited 400ms polling to the new helper without relaxing its 20s bound or assertion. Excess request pressure was suspected; a root cause for that individual attempt is not proven. |
| 9 | DB 24/24 and browser 24/24 passed. |
| 10 | Expanded DB 26/26 and full workspace type/lint checks passed. |

Initial type-check findings (unused binding and nullable actor) were corrected before the final source freeze. Final tests include durable provider-profile changes and physical admission across three interviews. Synthetic SDK checks grew from 23 to 24, and DB coverage from 19 to 24 to 26; no earlier assertion was removed to obtain PASS.

The previously accepted TTS package already contains the Phase 3 clarification warning/version investigation and atomic-warning correction. This task does not change that fix or accepted failure evidence. Final Phase 3/4/recovery/playback runs retain their original assertions. New browser helper failures above are separate from the historical warning/grace failure; they do not establish a new root cause for that historical instability.

`prepare-browser.mjs` records creation of the new LLM harness from the existing authenticated setup; it does not alter the old harness. `prepare-evidence.mjs` is the initial scaffold generator; the final verifier/report helpers add LLM-specific checks and are the authoritative reproducible evidence commands. All development logs use the same secret redaction/output confinement as final runs.
