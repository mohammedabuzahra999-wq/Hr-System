# Repository migration checklist

Phase 2A establishes documentation and ignore rules only. All later stages need
separate approval. This checklist must not trigger deployment, database changes,
provider requests, downloads, evidence regeneration or training.

## Phase 2A scope

- Modify root `.gitignore` only.
- Create the five documents in `docs/repository/`.
- Keep production packages, environment files and historical evidence in place.
- Compare file inventory and non-secret content hashes; report exclusions.
- Validate ignore examples with a disposable Git context if metadata is absent.
- Stop for review; do not proceed to package migration.

## Before Phase 2B

- [ ] Locate authoritative Git history and establish a reversible branch.
- [ ] Approve exact stage-specific paths and edits before moving packages.
- [ ] Capture a secret-safe file/content baseline and evidence inventory.
- [ ] Verify retained evidence without rewriting manifests or regenerating runs.
- [ ] Define isolated synthetic test fixtures and a disposable database if needed.
- [ ] Resolve working-directory assumptions without moving or reading secrets.

## Dependency checklist

| Dependency | Required migration review |
|---|---|
| Root workspaces/lockfile | Package paths and installation resolution |
| Frontend Vite alias | `../../packages/contracts/src/index.ts` |
| Backend TypeScript | `rootDir`, shared includes and emitted directory layout |
| Production start | `dist/services/hr-api/src/index.js` entry point |
| Static web discovery | Backend search for `apps/hr-web/dist` |
| Build-copy script | Runtime JSONL and `dist/services/hr-api/drizzle` |
| Migration runner | Relative `../../drizzle`; preserve SQL/meta bytes |
| Voice launch/setup | `.local-voice`, worker path and virtualenv location |
| Voice browser checks | Cross-package frontend source paths |
| dotenv/uploads | Launch working directory and storage resolution |
| Capacitor/Gradle | Native source, dependency paths and copied assets |
| ML scripts/policies | Root discovery, path allowlists and frozen manifests |
| Render | Build includes database migration; never deploy during validation |

## Future staged migration

1. Shared contracts moved to `packages/contracts` in Phase 2B; package name and exports retained.
2. Frontend moved to `apps/hr-web` in Phase 2C with its Android shell; static discovery and source checks updated.
3. Node API selectively relocated to `services/hr-api` in Phase 2D-2; legacy worker/runtime/evidence remain under `server`. Structural checks only; Phase 2D-3 has not started.
4. Separate Python worker; retain local model/runtime installation paths.
5. Index/archive reviewed historical reports with immutable identities.
6. Introduce new ML workflows separately; retain legacy evidence paths.
7. Consolidate cross-component validation and current-status documentation.
8. Consider an exact deletion list only after verified retention and approval.

Each stage must remain independently reviewable and reversible. Do not combine
business logic, security behavior changes or database changes with folder moves.

## Validation gates after approval

- [ ] Contract move: workspace resolution, type/lint checks and shared build.
- [ ] Web/API move: full build, emitted entry point and runtime asset parity;
      isolated dev and production smoke tests, static assets and API proxy.
- [ ] HR/security: permissions, payroll, report security, sessions and role scope.
- [ ] Copilot: gate, plans, rules, local reads, corpus, runtime loader and routing.
- [ ] MCP: authorization security check, stdio discovery and role/scope parity.
- [ ] RAG: synthetic ingestion/retrieval with authorization parity.
- [ ] Voice: worker/STT, browser audio/VAD, queue/session ownership and E2E checks.
- [ ] Android: asset/config consistency, Gradle tests and debug assembly.
- [ ] ML: package/data/tokenizer hashes, admission, provenance and split isolation;
      run only reviewed tests in disposable output locations.
- [ ] Final: clean isolated install, approved regression suite, no secret staging,
      unchanged historical evidence and complete old/new path mapping.

The root `npm run check` does not execute every security, voice or ML check.
Review each test for writes, database/provider access and output paths first.
Do not rerun official baseline experiments or start training for validation.
