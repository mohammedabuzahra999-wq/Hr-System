# Directory responsibility guide

Ownership here means technical responsibility, not assignment to a named person.
Current paths remain authoritative until a separately approved migration.

| Current path | Responsibility | Future destination |
|---|---|---|
| `apps/hr-web/src`, `public` | Web UI, routes, i18n, browser Copilot/voice | `apps/hr-web` |
| `apps/hr-web/android`, Capacitor config | Native shell, resources and build integration | Inside `apps/hr-web` |
| `services/hr-api/src/routes`, `auth`, domain modules | API and trusted HR business operations | `services/hr-api/src` |
| `services/hr-api/src/ai` | Providers and feature AI integrations | Same module under API |
| `services/hr-api/src/copilot` | Routing, validation, actions, runtime language assets | Same module under API |
| `services/hr-api/src/voice` | Voice session ownership, queues and orchestration | Same module under API |
| `services/hr-api/src/mcp` | MCP transport, schemas, tools, authorization | Same module under API |
| `services/hr-api/src/knowledge`, `ai/retrieval.ts` | Knowledge ingestion and retrieval | Same modules under API |
| `services/hr-api/src/db`, `services/hr-api/drizzle` | Schema, migration runner and immutable migration history | Inside API package |
| `server/local-voice` | Python STT/TTS runtime and worker checks | `services/voice-worker` |
| `packages/contracts/src` | Shared schemas and contracts | `packages/contracts` |
| `services/hr-api/scripts` | Package build, diagnostics and operational tools | Inside API package |
| Colocated checks and fixtures | Component regression coverage | Keep colocated initially |
| `docs/fine-tuning` | Historical ML designs, datasets, tooling and evidence | Retain original paths |
| `.codex-snapshots/hr6` | Training package handoff and checkpoint metadata | Preserve pending verified archival |
| Backend root benchmark/voice reports | Historical evaluations | Later reviewed evidence archive |
| `.local-voice`, `.local-dev` | Machine-local runtime and logs | Keep local and ignored |
| `server/uploads` | Private application documents | Keep operational; never commit |
| `dist`, Android builds, dependencies | Regenerable outputs | Ignored build/artifact storage |
| `_backups`, recovery and snapshot ZIPs | Recovery material | Restricted archival after verification |

Package manifests, TypeScript, Vite, Capacitor, Gradle and Drizzle configuration
stay with their packages. SQL `drizzle/meta` snapshots are maintained migration
history, not disposable recovery snapshots.

Future top-level tests should cover cross-component boundaries. Existing tests
must not be moved merely to populate that directory.
