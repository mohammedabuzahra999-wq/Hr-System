# Evaluation integration before-state

Accepted source: f5b6eea089f5ef95f56230f7a087a4d8b5d2f1542175bcb0e64ab520208ce337. Before edits the accepted LLM package's read-only verifier passed: 45 passing commands, all prior evidence intact. The new baseline manifest matches that exact SHA-256.

Inspected Phase 4 report contracts/service/evaluator, evaluationInput, committed answer/event persistence, report UI/routes, Phase 5.3 worker execution/recovery tests, LLM configuration/SDK/dispatcher, speech and playback architecture, and the Phase 5.6 integration checklist.

On completion, the existing engine creates a PENDING legacy evaluation row. Authorized HR RUN builds a closed frozen report input from committed final-answer and selected-question domain events plus approved frozen rubric/criteria/weights. Partial text is excluded. inputHash covers the canonical input. Existing report versions, request receipts, independently verified exact quotes/UTF-16 offsets, NOT_ASSESSED/null and human review are durable. The asynchronous report worker already owns timeout/cancellation, physical admission, attempt token/deadline, restart fencing and timer-independent discovery.

Before this task only MockReportEvaluator and MOCK report versions were registered. The verifier checked report identity, exact citations, criterion identity, trace and coverage; arbitrary model score/narrative could not be safely accepted as a production evaluation. Existing report/provider config and UI literals were explicitly mock-only. LLM interview orchestration was independently default-off, with dedicated server credentials and structured SDK contracts.

Chosen change: reuse the report worker and existing SQL envelope. Add a separately versioned llm-report-v1 input with frozen nonsecret provider configuration, a narrow evidence/anchor selection contract, independent reconstruction of server narrative and provisional scores, dedicated default-off registration and truthful synthetic/LLM labels. No candidate endpoint accepts evaluation input/output. No model-generated prose finding, hiring outcome or aggregate is allowed. Exact quote/anchor checks prove provenance/structure, not semantic correctness; HR review remains necessary. Legacy frozen mock metadata is retained as source provenance, never relabelled as cloud evaluation.

All new outputs stay in this package. Accepted Phase 1–5.6, speech, audio, TTS and LLM evidence remains immutable. Real inference calls, local models, distributed runtime and live voice activation are outside scope.
