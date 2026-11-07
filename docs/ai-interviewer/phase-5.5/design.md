# Phase 5.5 security and operations policy

Scope is the existing local single-process runtime. No real provider, voice,
WebRTC, distributed owner, retention implementation or Phase 5.6 is activated.
Accepted Phase 5.1–5.4 evidence is read-only. Both release blockers remain OPEN.

## Proxy and client identity

| Mode/case | Policy |
|---|---|
| direct (default) | Use normalized socket peer. Ignore X-Forwarded-For, Forwarded and X-Real-IP. |
| trusted-proxy | Require an explicit list of up to 32 exact IPs in TRUSTED_PROXY_ADDRESSES. Only a matching socket peer can make XFF relevant. Peel configured proxy hops from the right; select the nearest untrusted hop. |
| untrusted peer in proxy mode | Ignore all address headers; use its socket identity. |
| malformed/missing XFF from trusted peer | Refuse with safe 400; never substitute a browser-provided identity. XFF <=1,024 characters and 16 valid IPs. |
| malformed config | Startup refuses empty proxy list, wildcard/CIDR/hostname/zone identifiers, contradictory direct-mode list or unsupported mode. |
| no socket | Use a resolved authenticated internal user if present, otherwise one shared unknown bucket. Headers never supply that fallback. |

IPv4, canonical IPv6 and IPv4-mapped IPv6 normalize consistently. Only XFF is
supported; Forwarded/X-Real-IP/X-Forwarded-Proto never establish authority.

**Deployment assumption:** an allowlisted peer must actually be a trusted proxy
with exclusive/appropriately restricted ingress. It must append its observed
client address or replace untrusted forwarding input. Do not allowlist end-user
addresses/shared client networks or let untrusted clients connect with a trusted
proxy source identity. Syntax validation cannot prove network topology. No
managed-platform IP range is guessed. The Render blueprint deliberately defaults
to direct mode until real socket peers and edge behavior are verified. NAT/proxy
clients may share conservative limits in direct mode; this is an availability
tradeoff, not authorization. A real loopback proxy test uses distinct socket
clients and proves changing a forged prefix cannot change the selected identity.

## Bounded process-local abuse budgets

Existing fixed windows remain process-local and reset on process restart. There
is no Redis/shared store or distributed guarantee. Memory contains hashed keys,
at most 10,000 normal identities plus one conservative overflow bucket per fixed
operation scope. Expiry sweep and saturation prevent unbounded key/count growth;
live identities are not evicted to reset their limits. Request subkeys are bounded.

| Protected operation | Budget |
|---|---|
| Candidate routes (existing) | 300/min per socket/proxy client |
| Invite/session exchange (existing) | 10/min per client, including invalid invites |
| Candidate command/answer submit/status/mock (existing) | 120/min, with general client budget also applying |
| Provider readiness GET | 60/min per client; reads cached state, never starts provider work |
| Staff interview/report address | 600/min |
| Staff interview/report authenticated user | 240/min, independent of address changes; after auth/RBAC |
| Trusted provider observations | 600/min per interview across generations, including malformed/rejected payloads, before parsing/SQL |
| Trusted provider context reads | 1,200/min per interview, before SQL |
| Provider health operations | 600/min per process/database plus existing two-physical-call cap |
| Operational DB/readiness probes | 120/min per client, single physical DB probe, one-second cache |

Trusted orchestrator intents are distinct from provider observations. Shutdown
CLOSE can bypass observation/context budgets, but cannot bypass candidate/session,
generation, owner or lifecycle authorization. Its raw capability is held only by
the server gate; no HTTP field or provider output grants it. This prevents a
malfunctioning provider flood from preventing a safe close.

Rate limiting only refuses work. Every admitted operation independently checks
its existing candidate/staff/provider authorization. Reset/fresh budgets never
grant a session or permission. Process restart behavior is tested with actual OS
children; it does not imply distributed rate limiting.

## Audit-event coverage and privacy

| Operation | Storage/event |
|---|---|
| Create/configure/freeze | Existing transactional CREATED / PLAN_FROZEN |
| Invite issue/replace/revoke | INVITATION_GENERATED / new INVITATION_REPLACED / INVITATION_REVOKED |
| Invite exchange/session establishment | New transactional INVITATION_EXCHANGED / CANDIDATE_SESSION_ESTABLISHED |
| Start/pause/resume/complete/cancel | Existing authoritative DOMAIN events plus explicit transactional lifecycle AUDIT records |
| Evaluation/retry/review | Existing job/attempt/recovery/review audit plus explicit REEVALUATION_REQUESTED |
| Authorized report response prepared | report_accessed operational event after successful authorization/read transaction; interview/evaluation/version/actor UUIDs only |
| Session/invite rejected/expired/revoked | Closed operational event/code; no submitted credential or lookup token |
| Provider connection/close | Existing transactional DELIVERY_BOUND / DELIVERY_OBSERVED / DELIVERY_CLOSED |
| Provider rejected/readiness transition | New closed operational events; invalid/stale/auth/throttled code and known scope only |
| Shutdown | started/completed/incomplete operational events |

Mutation audits share the existing SQL transaction, so rollback cannot leave a
false successful audit/receipt. Report reads do not mutate interview versions or
sequences: their access diagnostic is not a claim that a human read the screen.
Operational logs carry UTC time and closed identifiers/enums. Sink failure never
changes authority. Rejection/readiness diagnostics are limited to three identical
scope/code events per minute, and report access to 240 per actor/interview per
minute. They are bounded best-effort logs, not a new durable compliance log or
distributed audit service; deployment log collection/persistence must be supplied
by operations. Existing durable answer content remains in DOMAIN/snapshot records,
not these metadata payloads. No secrets, raw Authorization/cookies, prompts,
answers, raw provider exceptions or SQL parameter values are logged here.

## Headers, caching and safe errors

Interview candidate/HR/report APIs, including errors: Cache-Control private,
no-store,max-age=0; Pragma no-cache; Referrer-Policy no-referrer; X-Frame-Options
DENY; X-Content-Type-Options nosniff; CSP default-src 'none', frame-ancestors 'none'.
Standalone candidate HTML has frame-ancestors 'none', base-uri 'self', object-src
'none'. It intentionally does not impose a new script/style policy that would
break current React/dynamic styles. A nonce-based broader CSP requires separate
application validation. Global framework security defaults/HSTS remain.

Candidate cookies retain HttpOnly, production Secure, SameSite=Lax, narrow path
and expiry. Production routes refuse insecure cookie options. Staff's existing
separate signed HttpOnly cookie/Android policy remains unchanged. Origin is exact
for non-GET interview operations; missing/foreign Origin is refused.

Candidate foreign/nonexistent interview targets use the same safe 401 externally.
Candidate/staff/report/provider errors remain static codes, no SQL/stack/secret
data. The parent server also sanitizes interview errors in development. Candidate,
HR interview/report and health URLs are excluded from generic HTTP logging so
arbitrary query values cannot be copied into logs. DB idle/prune logs are safe
constant messages. Other application behavior is not refactored.

## Production startup validation

CLIENT_ADDRESS_MODE defaults direct. TRUSTED_PROXY_ADDRESSES defaults empty.
AI_INTERVIEW_PROVIDER_MODE defaults disabled; synthetic is forbidden in production,
and real is refused because no real adapter is registered, regardless of key
presence. AI_INTERVIEW_RUNTIME_OWNERS must be one; this declares a deployment
contract, not a distributed leader lock. Reject production interview/voice mock,
debug/test and frontend mock switches. Reject frontend VITE variables whose names
indicate secrets, tokens, credentials, private/API keys or DB URLs. SESSION_SECRET
keeps its minimum length and production rejects known placeholders/low diversity;
operators must still generate a cryptographically random secret. Origin values
are exact HTTP(S) origins, HTTPS in production; the existing exact Capacitor
localhost origin remains supported. Errors identify safe policy codes, never
configuration values. No retained environment file or real secret is inspected
by this evidence workflow. Synthetic startup children test accepted and refused
configurations without starting a provider or application database connection.

## Health and readiness

| Endpoint | Semantics |
|---|---|
| GET /health/live | Process alive; no DB/provider query. Not release readiness. |
| GET /health | Backward-compatible ok flag for bounded DB availability and non-draining process; no stream count/infra details. |
| GET /health/ready | DB availability, recent runtime timer/discovery progress, provider configuration/health/scope, draining state and explicit production/release blocker flags. Always 503 while release gate is blocked. |
| GET /api/ai-interview/delivery/readiness | Safe cached provider status/mode/liveValidated; disabled in current production composition. |

DB probe has a 1,500ms logical bound, one physical query, a one-second cache and
driver query timeout. An unresolved query is quarantined rather than multiplied
by polling. DB select 1 does not validate migrations. Runtime health requires a
successful timer/discovery pass within ten seconds; per-interview maintenance
failure makes timer health false. This is maintenance progress, not proof that
every evaluation/provider is available or that arbitrary load has real-time
latency. Provider configuration is not health: ready requires a validated health
result; known STT/TTS failures degrade status, and authenticated rebind rechecks
health before proceeding. Cached health is last observed state, not continuous
proof of a real transport. Real provider/live connection validation is still
BLOCKED. No endpoint exposes connection strings, credentials, candidate data,
owners, addresses, stack traces or raw infrastructure configuration.

## Shutdown and restart

Signal starts a one-shot draining state; new interview mutations receive safe
503 while admitted requests finish. HTTP listener close is awaited. Stop runtime
admission, cancel/drain all tracked owner evaluation tasks (including HTTP-launched
jobs), close provider generations, then close DB. Newly committed PENDING jobs
cannot start under a quiesced owner and remain durable for the next owner.
Overall grace is ten seconds. Failure/deadline forces connections closed and
exits unsuccessfully; late settlement cannot change that result to success.

Controlled real-PostgreSQL tests cover ACTIVE, pending typed answer, PLAY, STOP,
running external evaluation and provider work in flight. Typed answer completion
waits for actual commit and one receipt; retry after new owner confirms it once.
Evaluation cancellation has no report, preserves hash/version and supports retry
under a new owner. Pending effects and paused duration survive; late provider/
evaluator output is fenced. These tests exercise the coordinator and durable
service state, not OS kill/live transport termination. OS kill/DB outage can
interrupt drain; existing transactional durability/owner fencing is the recovery
boundary. In-process JS cannot preempt synchronous CPU stalls. Two permanently
uncancellable provider/evaluator calls may still require process restart.

The two release blockers remain OPEN. Phase 5.5 local hardening PASS is not
production release approval. Phase 5.6 is not started.
