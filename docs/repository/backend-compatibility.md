# Backend relocation compatibility

Status: Phase 2D-2 selective Node package relocation. The backend is now
`services/hr-api`, package identity `@hr/server`; contracts remain `@hr/shared`
at `packages/contracts`, and the frontend remains `apps/hr-web` (`hr-app`).
Phase 2D-3's broader validation and service startup have not been performed.

`server/` intentionally retains `.env`, uploads, `.tmp`, old generated output,
historical result files and `local-voice/`. The Python worker has NOT moved.
No runtime data or historical evidence is copied into the new package.

The immutable [2D-1 baseline](baselines/phase-2d-1-before.json) and
[2D-2 migration record](baselines/phase-2d-2-before.json) describe prior paths.
The latter identifies a source-only recovery ZIP and its SHA-256. Environment
file contents and private/runtime payloads are excluded from that recovery copy.
Environment templates were moved as existing files and checked by file identity.

## Compiled layout

`scripts/repositoryPaths.mjs` derives the package-relative emitted tree from the
repository-root compiler layout:

```text
services/hr-api/dist/
  services/hr-api/src/index.js
  services/hr-api/src/copilot/data/hr_agent_intents_10000.jsonl
  services/hr-api/drizzle/
  packages/contracts/src/
```

The active TypeScript root is now `../..`, with contracts included from
`../../packages/contracts/src`. Both manifest `main` and production start target
`dist/services/hr-api/src/index.js`. The migration runner still resolves
`../../drizzle` from its `src/db` module. SQL/metadata and runtime JSONL are
unchanged. The asset-copy script's `--dry-run` performs no copy or removal.
A fresh backend build is deferred to its separately approved stage.

## Retained environment and uploads

Environment-dependent runtime commands explicitly load `runtimePreload.mjs`.
Pure checks and builds do not. Never import the preload in offline validation.

The preload selects retained `server/.env` by default, honors explicit
`DOTENV_CONFIG_PATH`/`dotenv_config_path` selection, and invokes the original
`dotenv/config` entry point once through Node's module cache. Inherited values
win by default; explicit dotenv override options retain the installed library's
behavior. Default logging/debug output is suppressed. Later application imports
reuse the cached loader, preventing a second override from undoing upload-path
anchoring.

After environment loading, relative `UPLOAD_DIR` values are anchored at retained
`server/`; absolute values remain absolute. The default remains `server/uploads`.
The initializer never prints or returns secret values. Structural validation
uses only synthetic environment objects and injected loaders; it does not load
the real environment or start an API, MCP server or worker.

Use supported package commands for runtime work. Direct source invocation that
bypasses the preload does not provide the retained environment contract.
Database/provider/benchmark commands remain prohibited during migration validation.

## Voice and frontend boundaries

Node orchestration is under `services/hr-api/src/voice`. The launcher still
targets `server/local-voice/worker.py`, using repository `.local-voice` for the
existing virtualenv, models and token. The worker environment allowlist is
unchanged. Token discovery recognizes the relocated API marker.

Frontend inspection checks now account for the deeper API directory. The web
wording check reads `../../services/hr-api/src/copilot/intents.ts` from its
workspace. No dictionary, intent, UI logic or check assertion is changed.
Existing wording and guide/tour coverage debt remains unrelated and unrepaired.

## Structural validation boundary

The compatibility check calculates emitted filenames without emitting files,
checks retained paths with synthetic environments, reviews runtime-only preload
wiring, and invokes only the asset-copy dry run. JSON/TypeScript parsing,
workspace links, source inventories and protected hashes are also structural.

Broader type/lint/security suites, backend builds, database-backed integration,
service startup, deployment, worker setup, model calls and training are separate
stages. Historical hashes and frozen harness paths are never rewritten to fit
the new layout. Future worker relocation and artifact cleanup require approval.
