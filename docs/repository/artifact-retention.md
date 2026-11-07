# Artifact and retention policy

This policy authorizes no deletion, relocation, upload, training or regeneration.
Retention periods require an owner decision; no automatic expiry is introduced.

| Class | Examples | Retention and storage |
|---|---|---|
| Maintained source | Application code, checks, generators, migration files | Version in Git |
| Immutable scientific evidence | Official results, hashes, admission decisions, provenance, security evidence | Preserve indefinitely until explicit retention approval |
| Large versioned ML assets | Datasets, tokenizer/package copies, future checkpoints | Git LFS or immutable controlled artifact storage after approval |
| Private operational data | Uploads, recordings, review identities/events | Restricted access; owner-approved retention; never public Git |
| Local installations | Virtualenvs, downloaded models, binaries | Local and ignored; preserve manifests/licenses and reproducible setup |
| Disposable output | Caches, builds, synthetic fixture work, browser profiles | Ignore; delete only after explicit cleanup approval and evidence review |
| Recovery archives | Backups and snapshot ZIPs | Restricted archive; checksum and restore verification before cleanup |

## Fine-tuning preservation contract

Preserve benchmarks, raw/scored cases, BEFORE and any future AFTER evaluations,
experiment logs, model/config identifiers, source locks, tokenizer identities,
dataset versions/splits, admission and rejection records, security evidence,
checkpoint metadata, licenses, provenance and package hashes exactly as recorded.
Do not rewrite historical manifests or reports to fit a new directory structure.

Duplicate admitted data and tokenizer files in a self-contained training package
can be intentional. Do not deduplicate or replace them with links without a
separately approved reproducibility change. Preserve `.codex-snapshots/hr6`,
including its package, archive hash, checkpoint metadata and handoff explanation.

New evidence must have a separate run/version identity. A future relocation must
add an old-path/new-path manifest with matching content hashes and retain an
original-layout verification option. Adapted harnesses receive new identities.
Never regenerate an official experiment just to make its paths look current.

## Artifact records

Before approved externalization, record original path, immutable object/version
identifier, SHA-256, byte size, purpose, source/model/config identity, license,
access classification and retrieval/verification instructions. Verify retrieval
before removing any local copy. A hash is not a backup.

Review logs, browser profiles, review events and archives for sensitive data in
a private workflow before publication. Ignoring disposable fixture work does not
make it approved for deletion. Keep evidence outputs and required screenshots
separate from regenerable browser profile state.
