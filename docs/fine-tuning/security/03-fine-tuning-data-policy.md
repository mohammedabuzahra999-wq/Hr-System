# Fine-tuning data admission policy

Phase 1A, 2026-10-22. **Policy only: no training data was created and no fine-tuning, upload or model request was performed.** This document does not authorize a training job or an export from production.

## Purpose and permitted learning targets

Teach the current 32-intent / 48-action vocabulary, entity types, typed parameter structure, ownership language, supported periods, Arabic/English/Jordanian/mixed interpretation, negation, conservative abstention, clarification and confirmation. Use the existing [Copilot schemas](../../../shared/src/copilot.ts), [intent registry](../../../server/src/copilot/intents.ts), [action registry](../../../server/src/copilot/actions.ts) and actual service capabilities as the contract.

A model may identify a requested employee or salary operation; it must not learn that a specific real employee earns an amount, has a diagnosis, took leave or belongs to a sensitive case. Output targets are language/plan outcomes, not employee facts or completed database answers. Clarification and unsupported-capability labels must preserve real executor limitations. Training cannot add a missing status filter, supported period, identity resolver or permission.

## Prohibited sources and contents

Do not admit actual employee/applicant names where identifiable, IDs/UUIDs, email, phone, national/passport numbers, bank/account/IBAN data, salaries or pay histories, medical/disciplinary details, addresses, authentication credentials, password hashes, session/access/refresh tokens, API keys, connection strings or private HR records. This applies to inputs, outputs, context, metadata, filenames, reviewer notes and provider batch manifests.

Do not bulk-export users, payslips, attendance, requests, CVs, interview answers, uploads, RAG chunks, MCP results, voice recordings/transcripts, `assistantMemory`, `assistantUnansweredQuestions`, action outcomes, or `aiGenerations` as training material. HR/admin read permission does not authorize training reuse. Existing review/memory records are not anonymous, and successful execution is not a reviewed classification label.

Secrets are rejected and handled through the separate security process, never retained as masked prefixes or useful training examples. Do not create examples by inspecting `.env`, production logs, backups, live employee records or private documents.

## Placeholders and independent synthetic material

| Type | Approved placeholder convention |
|---|---|
| Person | `<EMPLOYEE_NAME_1>`, `<APPLICANT_NAME_1>` |
| Employee / record identifier | `<EMPLOYEE_ID_1>`, `<RECORD_ID_1>` |
| Contact | `<EMAIL_1>`, `<PHONE_1>`, `<ADDRESS_1>` |
| Instruction amounts | `<SALARY_AMOUNT_1>`, `<ADJUSTMENT_AMOUNT_1>`; preserve amount/currency type, never an actual salary fact |
| Calendar / organizational values | `<DATE_1>`, `<DEPARTMENT_1>`, `<COMPANY_1>` where identity is unnecessary |
| Restricted identifiers | `<NATIONAL_ID_1>`, `<PASSPORT_ID_1>`, `<BANK_ACCOUNT_1>`; exclude whole unnecessary passages instead of retaining detail |
| Sensitive reason | `<SENSITIVE_REASON_1>` only if indispensable; remove clinical/disciplinary narrative |

Keep distinct people distinct and map entities consistently across input, expected slots and all turns of one episode. Preserve possessives, negation, role distinctions, conjunctions and ambiguity. Pseudonymization with a retained lookup table is not anonymization. No lookup table or runtime substitution mechanism was created here.

Prefer authoring independently invented language and identities without consulting real records. A later approved dataset may include independently invented natural-name structures to test extraction; placeholder-only training can otherwise teach trivial marker recognition. Do not reuse identities, wording or translation families from the frozen evaluation set. Synthetic amounts must be documented as invented instruction values, never asserted real employee pay.

## Admission and review workflow for a later phase

1. Record source/provenance, rights, author, purpose and synthetic status before admission. Existing datasets need this review too; do not assume a filename proves consent or anonymity.
2. Author language/plan pairs independently. If any real-source transformation is ever proposed, require separate explicit authorization and local redaction before annotation or external processing. Default is no real-source export.
3. Scan every field with structured identifier/secret detectors and Arabic/English entity review. Regex alone cannot establish that names, medical details and combinations are anonymous. Reject uncertain records rather than guessing.
4. Check target labels against current intent/action registries, schema, executor support and backend refusal/confirmation behavior. Missing information must not be invented. Client-claimed role is never trusted authority.
5. Group duplicate/paraphrase/translation families, entity sets, complete conversation episodes and any paired audio/transcript before splitting. Independently review each split for leakage and label conflicts.
6. Conduct privacy and security review with no sensitive originals embedded in review logs. Store only admitted synthetic artifacts in a restricted experiment location; assign retention/deletion owners, hashes and version records.
7. Separately review chosen provider retention, region/access, upload handling and account policies before a future external upload. These cannot be established from repository code. No provider-specific promises are made here.
8. Approve dataset construction, dataset release, baseline evaluation, training and deployment as distinct stages. A trained model must still pass shared runtime validation, backend RBAC, record scope and action safeguards.

## Existing material is not ready-made gold data

Phase 0 found 10,000 existing JSONL rows, 38 legacy labels mapped into the runtime vocabulary, only 3,440 distinct exact texts, and zero rows with populated `parameters`. Runtime prompts already draw from existing examples. A random row split would not establish unseen generalization, and empty entity slots are not extraction gold. See [baseline](../00-current-system-baseline.md) and [privacy audit](../03-privacy-and-pii-audit.md). These observations were read, not modified or converted into training records.

## Frozen evaluation quarantine

[The 404-case benchmark](../benchmark/README.md) is **FROZEN EVALUATION DATA — DO NOT USE FOR TRAINING**. Its JSONL, authoring catalog, expected labels/entities, translations, paraphrase families and review notes are excluded from training/dev data, prompt examples, phrasebooks, routing patterns, RAG and any training-data generator. Do not improve a prompt or rule by copying its cases and then claim an independent BEFORE/AFTER evaluation.

Expected SHA-256 remains:

```text
b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05
```

Integrity and static privacy review do not constitute a benchmark run. The [security gate](07-security-audit-findings.md) distinguishes safe independent synthetic-data authoring from unsafe live-data export and production-connected execution. Fine-tuning has **not started**.
