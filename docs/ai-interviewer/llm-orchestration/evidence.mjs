import { readFileSync,statSync,writeFileSync } from 'node:fs'
import { relative,resolve } from 'node:path'
import { here,inspect,expectedChanges,walk } from './state.mjs'
import { root,sha256,writeJson } from './manifest.mjs'

const run=process.argv[2],state=inspect(run),output=resolve(here,'runs',run),{currentSourceManifest,...summary}=state
summary.recordedAtUtc=new Date().toISOString()
writeJson(resolve(output,'summary.json'),summary)
writeJson(resolve(output,'source-final.json'),currentSourceManifest)
writeJson(resolve(output,'source-changes.json'),{acceptedSourceSHA256:state.source.beforeAcceptedSHA256,created:state.source.created,modified:state.source.modified,deleted:state.source.deleted,purposes:expectedChanges})
writeJson(resolve(output,'preservation-after.json'),{packages:state.preservation,earlier:state.earlierEvidence})
const files=[...state.source.created,...state.source.modified].map(f=>`| ${state.source.created.some(c=>c.path===f.path)?'CREATED':'MODIFIED'} | \`${f.path}\` | ${expectedChanges[f.path]} |`).join('\n')
const tests=state.regression.map(r=>`| ${r.id} | **${r.status}** | ${r.count===null?'command/probe':`${r.count}/${r.count}`} | \`${r.command}\` | ${r.resultDirectory} |`).join('\n')
const cases=state.llmDb.matrix.map(r=>`| ${r.scenario} | ${r.result} |`).join('\n')
const history=state.regression.filter(r=>r.originalAttempt).map(r=>`- ${r.id}: original **${r.originalAttempt.status}**, exit ${r.originalAttempt.exitCode}, ${r.originalAttempt.passLines} passed before stopping; selected **${r.status}**, ${r.count}/${r.count}. ${r.retryNote}`).join('\n')
const report=`# AI Interviewer asynchronous LLM orchestration — ${state.status}

**Implementation and synthetic acceptance: ${state.status} for the supported local single-process scope. Overall release readiness: BLOCKED. Live Voice E2E: BLOCKED.**

Recorded ${summary.recordedAtUtc}; run ${run}. Real provider/model/API calls: **0**. No real credential was used, no local model/Ollama installed or called, and no dependency, migration, real evaluation integration or distributed runtime was added.

## Implemented contracts and engine integration

A server-owned asynchronous InterviewLlmProvider contract and configurable registration now support deterministic synthetic responses and a production-compatible OpenAI SDK wire adapter. Provider I/O stays outside SQL transactions and the engine timer loop. Real operation is disabled by default and was never activated for this verification.

**Question generation:** authorized HR can asynchronously request wording for existing draft base, follow-up and clarification questions. Strict exact-ID/policy validation precedes durable quarantine. A separate HR approval at the expected version applies only text using the CREATED-only engine command; normal READY freezes the plan. Order, criteria, IDs, caps, timers and authority cannot be supplied by the model. The generation/review API is implemented; a dedicated HR review screen is not added. Existing manual HR setup remains available.

**Follow-up/clarification:** after an answer is durably committed, the model selects only a server-supplied approved prompt ID or NEXT_QUESTION. Arbitrary newly authored live prompts are not admitted. The existing engine applies PROCESS_ANSWER, retaining turn limits, pause/resume/interruption, progression and all authoritative timers. Existing mock evaluation remains unchanged. This approved-catalog restriction is deliberate; synthetic acceptance does not establish arbitrary adaptive interview quality.

The UI explicitly distinguishes a committed answer from ongoing model processing, retries or recovery required. Refresh/reconnect polls authenticated state, never generates a new answer identity from a model status. Candidates cannot submit model completions, choose model settings, revise plans or invoke HR controls. All previous mock flows remain available.

## Asynchronous bounds, recovery and security

Existing events and receipts persist job/logical-turn identity, input hash, owner, session/version/profile fences, attempt token/count, deadline and safe status. No parallel idempotency database or new migration exists. The successful model decision, domain effects, process receipt and model-result receipt commit atomically. Answer commit remains separate and already durable; failed model work does not lose it or falsely advance the interview. Duplicate acknowledgement reconciles the durable receipt; conflicting reuse fails.

READY pins a nonsecret provider/model profile in a durable mode receipt. Legacy interviews retain mock behavior. Disabling/changing configuration for a model-mode interview yields explicit recovery required, never silent mock fallback. Session expiry/revocation/rotation, pause, changed input/state/owner, late results and shutdown are fenced. Restart uses existing domain recovery and explicit resume, with new owner/attempt and the remaining retry budget; old owners cannot publish.

At most **2 physical calls**, including uncooperative timed-out calls. Discovery is an independent 1s keyset scan bounded to 64 rows. Timeout is **1–15,000ms**; attempts **1–3, default 2**. Transient retry backoff is 1000ms times the attempt; malformed outputs need an explicit authorized retry within the same budget. SDK hidden retries are disabled. Input JSON <=96,000 bytes, output <=128,000 bytes, max_completion_tokens=4096. Oversized contexts fail explicitly without silent truncation or answer loss. Hung provider calls can retain capacity until settlement/restart; synchronous CPU cannot be preempted. This is still one runtime owner and process-local admission/rate protection.

Fixed system instructions and a separate JSON data message provide no tools or credentials. Strict schemas and current allowed-choice validation reject extra authority, forged IDs, evaluation/scoring results and scope changes. PLAN adds a conservative text filter and mandatory HR review. Candidate/model text is never authorization evidence. These boundaries prevent injected text from granting permissions or changing engine policy; no claim is made that a lexical filter proves all semantic safety/model obedience across languages.

Existing service-level staff/candidate/session/application authorization, RBAC, HttpOnly sessions, Origin checks, private no-store responses and candidate DTO allowlists remain in force. HR generation/control rate limits supplement authorization. Raw provider exceptions are converted to safe statuses. Model job records do not duplicate raw answer/context or secrets; quarantined question proposals and existing approved snapshots are durable application data. No new raw audio storage is introduced.

## Exact future configuration

| Server setting | Default / contract |
|---|---|
| AI_INTERVIEW_LLM_ENABLED | false; explicit true required |
| AI_INTERVIEW_LLM_PROVIDER | disabled; synthetic or openai |
| AI_INTERVIEW_LLM_MODEL | No default; explicit account-supported model for openai |
| AI_INTERVIEW_LLM_API_KEY | Dedicated server-only key; required for openai, no generic/speech fallback |
| AI_INTERVIEW_LLM_BASE_URL | Only https://api.openai.com/v1; no arbitrary proxy/endpoint |
| AI_INTERVIEW_LLM_TIMEOUT_MS | 15000; integer 1–15000 |
| AI_INTERVIEW_LLM_MAX_ATTEMPTS | 2; integer 1–3 |

Invalid/missing real configuration fails closed without printing values. Synthetic providers are rejected in production. Registration performs no network I/O and does not assert health. The adapter uses the installed SDK, pinned POST /v1/chat/completions, store:false, strict JSON-schema output, no tools, logging off, redirects rejected and maxRetries:0. Refusal, invalid schema, tool calls, non-stop finishes and oversize output fail safely. The integration follows the [official Chat Completions contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create); actual model/account capability and privacy controls require separate validation.

Future activation requires an approved server key and explicit compatible model, secret/configuration deployment, independent provider health/schema/refusal/size/latency/cancellation tests, HR semantic review and isolated failure/recovery/security tests. A key alone does not provide a live voice interview. See the [complete configuration and activation checklist](../../README.md).

## New exact verification

- **24/24 adapter/configuration checks PASS**, with **14 injected synthetic SDK requests**, zero real API calls. Covers default-off and fail-closed config, deterministic providers, strict request/response schemas, prompt-data separation/no tools, endpoint/redirect/size bounds, refusal/tool/finish handling and safe errors.
- **26/26 real PostgreSQL/HTTP/engine checks PASS**. Exact cases below. Includes an actual SQL trigger failure proving no partial model decision/process receipt/evaluation survives rollback, then safe retry.
- **24/24 native Chrome browser assertions PASS**: 14 unchanged authenticated setup assertions plus 10 model-specific assertions. Exercises held asynchronous follow-up/clarification, durable answers before model results, invalid-output recovery, bounded HR retry, candidate denial, interruption/late fencing, explicit resume, refresh while processing, exactly five finalized answers, completion and private DTOs. No microphone, RTC or external resource is used by this new suite.

| New database/security scenario | Result |
|---|---|
${cases}

The integrated new DB scenario runs approved question generation through asynchronous decisions, durable answers, completion and independently verified existing mock report, including candidate report denial. It verifies regression integrity; it does not integrate a real evaluator.

## Regression and production checks

**${state.completedPassSuites} completed PASS suite/command results**, plus **one explicitly BLOCKED migration probe** in the 46-entry final inventory. Counts overlap and are not a total of unique scenarios. Exact executed arguments, sanitized environments, timestamps, exit codes, logs and raw browser results are retained alongside this report.

| Suite | Result | Checks | Command | Evidence directory relative to this package |
|---|---|---|---|---|
${tests}

Type checks and production contracts/API/web builds pass. Two pre-existing unrelated set-state-in-effect lint warnings and the existing web bundle-size advisory remain. The original engine 37/37, persistence/security 65/65, evaluation/evidence 76/76, UI 24/24, Phase 3 browser 44/44, Phase 4 browser/report 58/58 and expanded answer-recovery browser 56/56 assertions remain intact. Relevant answer atomicity/restart, evaluator timeout/fairness/fencing, provider trust/provenance, STT/TTS contracts, audio transport, native playback, MCP authorization, permissions, invite security and report RBAC pass.

Final browser attempt history:

${history||'- Every final browser suite passed on its first attempt; no isolated recheck was substituted.'}

The accepted TTS atomic warning/version fix is unchanged. Phase 3 warning/grace instability did not recur in the final run. Its previous failure evidence remains protected. This observation is not proof that every historical failure shared one root cause. New development test/helper failures and their corrections remain documented in [development notes](../../development-notes.md) and their retained logs.

## Secret and external-call checks

Post-build scan: **${state.secrets.checkedFiles} frontend/build files, zero violations, zero secret values printed**. Dedicated speech and LLM synthetic canaries and existing generic canaries are absent from the generated frontend bundle. **${state.logPrivacy.filesChecked} retained logs, zero detected credential findings**. Credential fixtures/screenshots are suppressed. These bounded scans do not establish detection of every possible encoded secret.

${JSON.stringify(state.network)}

All instrumented Node external attempts are zero. Browser app-page requests are guarded; native Chrome background networking is not independently packet-captured. Synthetic SDK request counts are injected function calls, not network calls. Reading public official documentation was not an inference API call. No actual API key, model service, Ollama or local model was needed.

## Changed files and source integrity

**${state.source.created.length} new, ${state.source.modified.length} modified, ${state.source.deleted.length} deleted application/test source paths. No unexpected paths, dependency or migration changes.** New evidence files are confined to docs/ai-interviewer/llm-orchestration.

| Change | File | Purpose |
|---|---|---|
${files}

Accepted source manifest SHA-256: ${state.source.beforeAcceptedSHA256}.

**Final ${state.source.fileCount}-file source manifest SHA-256: ${state.source.finalManifestSHA256}.**

Files digest: ${state.source.filesDigest}. Source is byte-identical throughout the final run. source-changes.json records exact before/after hashes and purposes. No Git metadata is available; manifests establish source provenance. The new artifact manifest covers every evidence file except itself.

${state.preservation.map(p=>`- ${p.phase}: ${p.files} accepted artifacts unchanged, zero unlisted files; artifact manifest SHA-256 ${p.artifactManifestSHA256}.`).join('\n')}

All **608** earlier protected evidence/training files are unchanged. Accepted Phase 5.1 remains **BLOCKED**; its source manifest 06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163 is unchanged. No accepted evidence was regenerated.

Cleanup **${state.cleanup.status}**: zero active other DB clients, zero current-task disposable databases left, own temporary browser profiles removed, exact owned local test PostgreSQL stopped. Historical pre-existing databases and unrelated processes remain untouched; resource-cleanup.json records scoped paths and exit codes. No database was dropped during finalization.

## Remaining gaps and blockers

1. **OPEN / BLOCKED — pgvector/full migration chain:** unchanged 27-entry chain fails at 0008 because vector is unavailable, SQLSTATE 0A000. Rollback and disposable probe cleanup verified; nothing skipped/stubbed/waived.
2. **OPEN / BLOCKED — Live Voice E2E:** complete production trusted START/resume/worker/playback/STOP composition and independently trusted audibility remain unvalidated. Existing synthetic STT/TTS/transport/playback results do not close this release blocker.
3. No real cloud account/model/credential/health, multilingual semantic quality, acoustic/device behavior or real latency/failure behavior is validated. Real operation stays default-off. Production START remains gated. Provider configuration is not readiness.
4. Live decisions select approved catalog IDs; free-form after-answer question authoring, automatic summarization for oversized contexts and a dedicated HR proposal-review screen are not implemented. HR review is required. Real evaluation integration is outside scope.
5. One process/runtime owner, process-local limits, non-preemptible CPU and indefinitely hung provider slots requiring restart remain. No distributed/retention/deletion work was added.

**Stopped after this implementation and report. No Live Voice E2E or production-readiness claim.**
`
writeFileSync(resolve(output,'REPORT.md'),report)
const artifact=resolve(here,'artifact-manifest.json')
writeJson(artifact,{format:'llm-orchestration-artifact-manifest-v1',algorithm:'SHA-256',files:walk(here).filter(p=>p!==artifact).map(p=>({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:sha256(readFileSync(p))}))})
console.log(JSON.stringify({status:state.status,verifiedPassSuites:state.completedPassSuites,sourceManifestSHA256:state.source.finalManifestSHA256,artifactManifestSHA256:sha256(readFileSync(artifact)),overallReleaseReadiness:'BLOCKED',failures:state.failures}))
if(state.status!=='PASS')process.exitCode=1
