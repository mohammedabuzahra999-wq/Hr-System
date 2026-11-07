# Repository architecture

Status: Phase 2A organization foundation. Contracts are in `packages/contracts` and the web app is in `apps/hr-web`; the API is in `services/hr-api`. The residual `server/` retains private runtime data, the Python worker and historical evidence.
Node workspace relocation is complete structurally; broader backend validation and worker relocation remain separate approved stages.

## Current runtime architecture

The root npm workspace contains `apps/hr-web` (React/Vite), `services/hr-api` (Hono API),
and `packages/contracts` (Zod schemas and TypeScript contracts). The API serves the web
build in production and integrates PostgreSQL through Drizzle.

Copilot orchestration, AI providers, voice sessions, MCP tools, and knowledge
retrieval remain backend modules. MCP has a distinct stdio entry point.
The Python STT/TTS worker is launched separately from `server/local-voice`.
The browser voice UI belongs to the web app. Capacitor/Android wraps that app.

## Future layout

```text
apps/hr-web/                 current web app, including Android shell
services/hr-api/             current Node API, retaining internal modules
services/voice-worker/       existing Python local voice worker
packages/contracts/         current contracts; package name stays @hr/shared
ml/                         future maintained datasets/training/evaluation
tests/                      future cross-component and security suites
docs/                       maintained project documentation
docs/fine-tuning/            frozen legacy evidence at original paths
scripts/                    repository-wide tooling when needed
artifacts/                  disposable outputs; reviewed evidence exception
```

The three Node workspaces now occupy their target directories. Other entries
remain planned; `server/local-voice/` has not moved. Do not introduce separate AI services solely for folder symmetry.
Keep package-specific configuration and scripts with their owning package.
Keep `package.json`, the workspace lockfile, README, `.gitignore`, and
`render.yaml` at root. Add `infra/` or `config/` only when concrete ownership
requires them.

## Boundaries to preserve

- Authentication, authorization, RBAC, trusted action execution, API contracts,
  database schema and migration history remain unchanged by organization work.
- RAG remains `services/hr-api/src/knowledge` plus retrieval/provider integration.
- Runtime Copilot JSONL remains a production dependency, not an ML scratch file.
- Local `.local-voice`, uploads and environment files retain their current paths.
- Historical evidence remains byte-for-byte unchanged. New ML work must be
  versioned separately and must not overwrite official baseline results.

See [ownership](directory-ownership.md), [retention](artifact-retention.md),
[Git policy](git-tracking.md), and [migration checklist](migration-checklist.md).
