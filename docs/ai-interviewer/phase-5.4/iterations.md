# Development iterations

Original Phase 1–4/5.1–5.3 assertions were not changed.

- Initial API compile caught a new Zod discriminated-union tuple typing error,
  observation-union narrowing and an unused test import. Corrected in new code.
- development-1: 15 new checks passed, then the new in-flight deadline test
  attached its rejection assertion too late for its 30 ms native timeout. Node's
  unhandled-rejection exit interrupted test cleanup. Raw failure retained.
- development-2: the rejection was consumed, revealing a race between that native
  timeout pause and the test's independently advanced engine clock. Raw failure
  retained. Corrected the new test to wait for provider entry and use the normal
  provider deadline while deliberately testing the separate engine deadline.
- development-3: 46/46 new checks passed. Review then added durable gate close,
  pre-play TTS revalidation, issued-play acknowledgement fencing and canonical
  WAV validation; five additional security/race checks were added.
- development-4: 51/51 new checks and API type checking passed. The final code
  additionally retains only the newest binding per interview instead of retaining
  every replaced binding in the gate's shutdown collection.
- final-20261103: authoritative complete regression on frozen final source.

The aborted first fixture's uniquely generated database is removed using
cleanup-aborted.mjs only after verifying the exact new-phase prefix and zero
connections. Its cleanup result is retained. No developer/application database,
previous evidence package or original regression assertion is a cleanup target.
