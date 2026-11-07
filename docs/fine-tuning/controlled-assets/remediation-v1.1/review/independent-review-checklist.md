# Independent human review — REQUIRED, not completed

Authority: [approved admission specification](../../../design/04-controlled-baseline-and-data-admission.md), §3: “All fields/context/metadata scanned offline plus bilingual human review of all release texts and residual candidates.” §3 also requires independent privacy/semantic/admission review. The same assistant authored these templates; its checks cannot satisfy that independence requirement.

Status: **HUMAN REVIEW REQUIRED** for both v1.1 releases. No reviewer, signature, approval time or admission is invented. The generated [review register](review-register.json) contains all 480 record handles, row/asset hashes and 12 pending criteria per row. [Summary](review-summary.json) reports zero completed human rows.

An accountable human reviewer or review team independent of template authorship must cover English, MSA Arabic, Jordanian Arabic and natural Arabic/English switching. Record competence, reviewer pseudonym/identity, independence, scope, timestamp and evidence privately. Do not publish reviewer identity without consent. A static scan, schema PASS or a second automated pass does not replace this review.

For **every** row, inspect the full input/context/metadata, symbolic and wire plans and annotations:

1. Language meaning and naturalness: does the requested operation/scope/period match the target? For Arabic distinguish MSA and Jordanian wording; mixed text must preserve one coherent request.
2. Privacy/PII and secrets: verify all fields contain only approved placeholders and declared invented instruction dates/amounts. Exclude any actual name/ID/contact/pay/health/attendance/leave fact, credential or internal endpoint. A password-reset topic is not a password value.
3. Placeholders: verify types, repeated-entity identity, stated versus missing slots, symbolic-to-wire rendering and no guessed employee identity or date.
4. Intent/action and parameters: use the real current registries and schemas, including payroll `employeeFile` versus company `payrollInsights`, exact supported periods, null fields, rank/report/payroll enums. Action references retain their action and question-stage `doAction`.
5. Role/scope: the new trusted actors have only real registry permissions. A manager's self-service remains self-scoped; company payroll references use HR/admin. Review ambiguous ownership and any authorization-versus-clarification tension rather than automatically accepting a permitted intent.
6. Clarification/unsupported: null plans are non-executable controls. Unsupported period/status filters must not imply executor support or return unfiltered data. Missing resource-dependent fields may need clarification.
7. Confirmation: annotations do not authorize execution. Check safe-UI exceptions versus protected proposals; no business action may run in this experiment.
8. Independence/lineage and rights: check construction families, inherited v1 lineage and source declarations. Shared ontology is expected, but close paraphrase across prohibited splits is not. A sealed benchmark custodian handles protected overlap; do not ask authors to view F or optimize around it.

Mark each criterion PASS/FAIL, with rationale. Use NOT_APPLICABLE only with an explicit reason for genuinely inapplicable action/confirmation criteria. Record residual concerns; do not erase failed checks. All release texts require review, including the 317 inherited runtime rows and all unchanged selection texts.

Any unresolved unsafe value, incompatible gold, unsupported executor capability or prohibited overlap rejects that release. If changes are needed, create a separately versioned candidate/report and rerun its gates; preserve v1 and v1.1 evidence.

After review, an independent admission authority must bind the exact two asset hashes, source/recipe hashes, validation and review evidence, decision, purpose, timestamp, approval ID and accountable reviewer. Record separate R/S decisions. Do not change the pending register in place; create a signed successor artifact. The evaluation target must explicitly pin that approved artifact before it can load R.

The selection set remains **model-selection-only, never training/validation/runtime examples**. Reviewer approval does not authorize a model run; a later execution gate must also approve the controlled target and frozen local/model partition.
