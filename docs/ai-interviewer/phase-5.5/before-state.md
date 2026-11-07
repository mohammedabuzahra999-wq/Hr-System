# Phase 5.5 before-state security and operations audit

Inspection completed before application edits. Accepted Phase 5.4 source SHA-256:
`9c7c675970cbc16c1b5d42715ce2183b7c01b1f50cd50ea39f15dfb61fa3923c`.
Accepted Phase 5.1–5.4 evidence is immutable. This phase does not activate voice,
LLM, WebRTC, distributed ownership, retention or Phase 5.6.

## Address identity and rate limits

rateLimit.ts uses a process-global fixed-window Map with a five-minute expiry
sweep. In production callerKey blindly selects the left-most X-Forwarded-For
value, with no configured trusted socket/proxy allowlist. It ignores that header
outside production and uses @hono/node-server getConnInfo, then authenticated
internal user or a shared unknown key. Arbitrary forwarded identity in production
can rotate counters. The Map has no capacity cap. Extra request keys may contain
unbounded client-controlled strings. Restart clears all windows; no distributed
limiting exists.

Candidate router: 300/min general, 10/min invite exchange, 120/min command/answer
submit/status and development mock. Some subkeys use the browser cookie's claimed
interview prefix, not authenticated scope; the general address limit still applies.
Staff interview/report router has authentication/RBAC but no dedicated limiter.
Provider ingress is a server-only capability with no HTTP endpoint. Its physical
work is capped at two calls, but malformed/duplicate observation rate is uncapped.
Public provider readiness only returns the disabled gate's cached safe status.

## Authentication, cookies, Origin and errors

Candidate credential is random, hashed with purpose separation, interview-bound,
expiring/revocable and held in an HttpOnly/Secure-in-production/SameSite=Lax cookie
at /api/ai-interview. Staff uses separate signed HttpOnly cookie and DB sessions;
production SameSite=None supports the existing employee Android origin. Candidate
and staff authority remain separate; every service command reauthorizes.

Candidate/staff interview routers require exact configured Origin for non-GET,
apply body/rate limits, no-store and no-referrer, and sanitize domain/SQL/provider
errors. Missing interview can return 404 while a foreign one returns 401, creating
an unnecessary external existence distinction. Parent recruitment auth errors may
be handled by the global error handler. Global development errors can return
stacks and global logs retain raw exceptions. General HTTP logging excludes
candidate URLs but not all HR interview/report URLs. DB idle/prune errors are
logged as raw errors/messages.

## Headers and cache

Global secureHeaders supplies framework defaults. Interview APIs independently
set Cache-Control private,no-store and Referrer-Policy no-referrer. Pragma,
explicit API frame/MIME protections and a narrow standalone candidate HTML frame
policy are not declared locally. A strict application-wide script/style CSP has
not been validated against the React UI; imposing one without browser regression
would be unsafe. Sensitive API responses must stay uncacheable, including errors.

## Audit and diagnostics

Durable audit exists for create/freeze/invite/revoke/cancel, evaluation requests,
attempts/timeouts/retries/recovery and HR review. Lifecycle DOMAIN events also
record start/pause/resume/completion. Session exchange/establishment and explicit
invite replacement lack dedicated audits. Report reads have no access audit.
REEVALUATE shares EVALUATION_REQUESTED without an explicit operation label.
Provider binding/accepted events/close have closed AUDIT metadata, but rejected
events and readiness transitions lack operational diagnostics. Existing evaluator
diagnostics are sanitized identifiers/codes. Candidate text belongs only in the
established durable interview records, never general operational/audit metadata.

## Configuration, health and runtime

env.ts validates DB presence, session-secret length, enum flags and loopback local
voice URL. WEB_ORIGIN is not structurally validated; proxy trust, single-owner
deployment and unsafe production test/mock/debug combinations are not startup
policy. Routes independently forbid production interview mocks and real START.
Production provider composition is disabled; configuration alone cannot establish
real health/provenance. runtimePreload is the explicit retained-env loader; no
retained .env/secret value was read during this inspection.

/health performs unbounded-by-handler select 1 and returns DB/process success
plus stream count/time; it does not separate liveness, runtime progress, provider
readiness and production release blockers. Runtime has independent one-second
timer/job passes and bounded evaluation execution, but exposes no health snapshot.

Shutdown clears pruning, calls server.close without awaiting HTTP drain, awaits
interview maintenance, closes DB and exits. It has no draining admission flag,
overall shutdown deadline or registered provider-gate close. Phase 5.2 receipts,
Phase 5.3 attempt/runtime fencing and Phase 5.4 generation fencing remain reusable.

## Planned minimal hardening

Explicit direct/exact-trusted-proxy policy with right-to-left trusted-hop parsing;
bounded process-local budgets for HTTP and internal provider work; startup policy
for origins, proxy, single-owner and disabled production providers/test flags;
minimal durable mutation audits plus bounded sanitized read/rejection diagnostics;
API cache/frame/MIME headers and a compatible candidate-page frame policy;
separate bounded liveness/DB/runtime/provider/release readiness; coordinated HTTP/
runtime/provider drain with a finite deadline and safe failure status. Preserve
all interview engine behavior and all existing regression assertions.

The two release blockers remain OPEN: pgvector/full-chain validation and live
voice worker plus isolated real-engine/trusted candidate transport. Local model
assets alone do not resolve either blocker. Single-process ownership/rate limits,
CPU non-preemption, abandoned physical calls and actual live transport limitations
must remain explicit in the final evidence.
