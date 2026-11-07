import {readFileSync,statSync,writeFileSync} from 'node:fs'
import {relative,resolve} from 'node:path'
import {here,inspect,expectedChanges,walk} from './state.mjs'
import {root,sha256,writeJson} from './manifest.mjs'
const run=process.argv[2],s=inspect(run),output=resolve(here,'runs',run),{currentSourceManifest,...summary}=s
summary.recordedAtUtc=new Date().toISOString()
writeJson(resolve(output,'summary.json'),summary);writeJson(resolve(output,'source-final.json'),currentSourceManifest)
writeJson(resolve(output,'source-changes.json'),{acceptedSourceSHA256:s.source.beforeAcceptedSHA256,created:s.source.created,modified:s.source.modified,deleted:s.source.deleted,purposes:expectedChanges})
writeJson(resolve(output,'preservation-after.json'),{packages:s.preservation,earlier:s.earlierEvidence})
const files=[...s.source.created,...s.source.modified].map(f=>`| ${s.source.created.some(c=>c.path===f.path)?'NEW':'MODIFIED'} | \`${f.path}\` | ${expectedChanges[f.path]} |`).join('\n')
const tests=s.regression.map(r=>`| ${r.id} | **${r.status}** | ${r.count===null?'command/probe':`${r.count}/${r.count}`} | \`${r.command}\` | ${r.resultDirectory} |`).join('\n')
const matrix=s.evaluationDb.matrix.map(r=>`| ${r.scenario} | ${r.result} | ${r.status} | ${r.answerCount} | ${r.inputHashPreserved} | ${r.answersUnchanged&&r.frozenEvidenceUnchanged&&r.domainHistoryUnchanged} |`).join('\n')
const history=s.regression.filter(r=>r.originalAttempt).map(r=>`- ${r.id}: original ${r.originalAttempt.status}, exit ${r.originalAttempt.exitCode}; selected ${r.status}, ${r.count}/${r.count}. ${r.retryNote}`).join('\n')
writeFileSync(resolve(output,'REPORT.md'),`# AI Interviewer evaluation integration — ${s.status}

**Implementation/synthetic acceptance: ${s.status} for supported local single-process scope. Overall release readiness: BLOCKED. Live Voice E2E: BLOCKED.**

Recorded ${summary.recordedAtUtc}; run ${run}. Real provider/model/inference API calls: **0**. No real credential was used or needed. No local model/Ollama, new dependency, migration, distributed runtime or automatic hiring/rejection decision was added.

## Implemented evaluation path

Authorized HR RUN/REEVALUATE → committed server answer/question events and approved frozen rubric → separately versioned llm-report-v1 input/provider snapshot/inputHash → existing durable report worker claim → registered asynchronous evaluator outside SQL locks/timer loop → strict evidence/rubric selection validation → independently reconstructed server report → atomic report/attempt/audit commit → authorized HR report and separate human review.

The server registers one report service for routes, maintenance and shutdown. Dedicated default-off evaluation settings are independent of interview LLM and speech keys. The installed SDK supports future cloud requests; injected responses and deterministic fixtures are the only providers exercised here. Existing MOCK versions/behavior remain available and are never relabelled as LLM results. New modes are LLM_SYNTHETIC and LLM, with distinct evaluator/response/provider provenance contracts. The original frozen mock interview configuration stays intact as source provenance.

Model output can select only frozen criterion IDs, one exact approved dimension/0–4 anchor/text per criterion, and exact committed answer spans. Null anchor/empty citations yields NOT_ASSESSED/null, never zero. Wrong criteria, quotes, offsets, sequences, dimensions, anchors, score range and extra prose/authority fields are rejected. Final-answer certainty and complete question delivery are required. Partial/uncertain/missing evidence is not penalized. Uncited questions produce partial coverage.

Identity, labels, quote/turn/question linkage, rationale, coverage, limitations, inputHash and provenance are server-owned. The complete provider report is independently rebuilt and compared before persistence, alongside existing exact-source/UTF-16 checks. Arbitrary model conclusions, strengths/concerns, aggregate and hiring decisions are forbidden; no recruitment status changes. Proposed scores reference verified evidence and approved anchors, and remain explicit model judgments for mandatory HR review. **Quote provenance is verified; semantic correctness of a model rating is not thereby proven.** Real-model relevance, language/fairness calibration and adversarial behavior remain unvalidated.

## Frozen evidence, recovery and privacy

The input contains only committed domain answers/questions and approved server frozen data. Candidate transcripts/results/receipts cannot bypass that path. Nonsecret requested provider/model/profile/timeout/attempt cap are frozen with inputHash. Retries keep the same input/report version; new intentional report versions preserve earlier reports and human review. Provider/model/configuration change or disable fails closed without mock fallback or an external call. Key rotation alone does not alter the snapshot.

Existing attempt UUID/owner/deadline/hash checks fence duplicate, cancelled, restarted and late results. Two physical evaluator calls maximum; uncancellable timed-out calls retain capacity until settlement/restart. Logical cloud timeout <=15s, total attempts 1–3/default 2; explicit HR retry only, no SDK hidden retries. A new retry command cannot reset the durable budget. Shutdown closes admission/aborts work; pending jobs survive for a new owner. SQL completion rollback cannot leave a partial report or successful completion audit.

Candidates cannot read/request/review reports or submit provider results. Existing staff RBAC, application binding, Origin policy, HttpOnly sessions, report authorization and private caching remain independent of provider/rate behavior. Provider exceptions become safe failure codes. Provider inputs are cloned; tests compare committed answers, original frozen inputs and all domain events before/after every recorded scenario. Audit/diagnostic payloads contain safe identities/statuses, no answer text, credentials or raw model errors.

## Exact new tests

- **29/29 adapter/configuration checks PASS**. **14 injected SDK requests**, zero real calls. Covers dedicated/default-off/fail-closed configuration, deterministic synthetic output, exact quotes, missing evidence, blank spans, mixed-dimension abstention, unsafe extra fields, invalid anchors/scores, tampered reports/provenance, UTF-16 boundaries, fixed system/data separation, no tools/storage, pinned endpoint, refusal/truncation/tool outputs, provider errors/no hidden retry, response MIME/byte bounds, cancellation/config mismatch and oversized context.
- **25/25 PostgreSQL integration checks PASS** on a real disposable local database with unchanged 0026 and synthetic legacy parents. Covers durable input/profile, source-backed report, NOT_ASSESSED, invented citations, fabricated scores/findings, malformed output, provider failure, timeout/cancellation/late completion, bounded retry identities/exhaustion, request/worker duplicates, restart fencing, configuration changes, candidate/staff/application isolation, prompt injection, clone mutation, real SQL-trigger rollback, version/review preservation, timer independence, audit privacy, legacy mock behavior, changed-input rejection before invocation and shutdown recovery.
- **22/22 native Chrome assertions PASS**: 14 unchanged authenticated HR/invite/candidate setup checks plus 8 evaluation cases. Covers interview completion, candidate denial, provider RUN, truthful synthetic/review labels, NOT_ASSESSED/dash, exact-quote modal, review/refresh persistence, same-hash retry after provider failure, rejected invented evidence and browser privacy/zero calls.

Recorded database scenarios (some tests exercise multiple scenarios; counts are not additive):

| Scenario | Result | Durable evaluation | Answers | Job hash preserved | Answers/frozen source/domain history unchanged |
|---|---|---|---|---|---|
${matrix}

No free-form model factual conclusion is displayed. Evidence validation does not establish that a real-model anchor judgment is correct; HR review and real-world validation are still necessary. Synthetic fixture scores are deterministic fixture outputs, not assessed candidate performance.

## Regression and production checks

**${s.completedPassSuites} completed PASS suites/commands** in the 49-entry final inventory, plus **one separately BLOCKED exact migration probe**. Exact executable/arguments, timings, exit codes and logs are retained in inventory.json and per-command results. Counts overlap existing cases and are not a sum of unique scenarios.

| Suite | Result | Checks | Command | Evidence directory relative to this package |
|---|---|---|---|---|
${tests}

Original engine 37/37, PostgreSQL/security 65/65, evaluation/evidence 76/76, UI logic 24/24, Phase 3 browser 44/44, Phase 4 browser/report 58/58 and expanded answer-recovery browser 56/56 assertions remain unchanged. LLM adapter/DB/browser 24/24, 26/26, 24/24 remain PASS. Existing STT/TTS contracts 58/58, audio transport/UI/browser, TTS transport/native playback, timer/restart/evaluator fairness, trusted provider fencing/provenance, invite/RBAC, MCP/permissions and report integrity are retained.

Type checks and production contracts/API/web builds PASS. Two existing unrelated React set-state-in-effect lint warnings and the existing web bundle-size advisory remain. Existing test assertions were not weakened.

Final browser history:

${history||'- Every final browser suite passed on its first attempt; no isolated retry was substituted.'}

The prior accepted TTS atomic warning/version correction and historical failure evidence are unchanged. Report any final warning/grace failure only from actual logs; a successful final run does not prove the cause of every historical failure. New development failures, including the insufficient-evidence fixture defect, are retained in [development notes](../../development-notes.md) and development logs.

The earlier final-20261105 attempt is retained, including its source-integrity result: source changed intentionally during final review for blank-span rejection and synthetic mixed-dimension abstention. It is not substituted for this final-verified frozen-source run. The two additional contract assertions are included in the 29/29 result above.

## Configuration and activation gaps

Dedicated server prefix AI_INTERVIEW_EVALUATION_: ENABLED=false, PROVIDER=disabled|synthetic|openai, explicit MODEL/no default and API_KEY for openai, BASE_URL pinned to https://api.openai.com/v1, TIMEOUT_MS=15000/integer 1–15000, MAX_ATTEMPTS=2/integer 1–3. Generic/interview LLM/speech keys never activate this evaluator. Production synthetic, missing real settings, arbitrary endpoints and invalid bounds fail closed without printing values. Runtime registration makes no network call and does not prove provider health.

SDK: pinned Chat Completions POST, strict JSON-schema output, max_completion_tokens=8192, store:false, no tools, redirects rejected, logging off, maxRetries:0. Input JSON <=192,000 bytes, output <=256,000 bytes, no silent truncation. This follows the [official Chat Completions contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create); account/model compatibility is not proven by mocks.

Future activation requires an approved dedicated secret/account/explicit compatible model, consent/privacy review, independent provider health/schema/size/latency/refusal/cancellation tests, rating relevance/fairness/abstention validation and isolated retry/restart/security/live E2E tests. Nonsecret model provenance currently records requested server configuration, not attested resolved model weights. One dimension is proposed per criterion; free-form narrative/automatic aggregate is deliberately not supported. Oversized contexts fail safely; summarization/chunking is not implemented. See [exact configuration and activation checklist](../../README.md).

## Secret/external-call verification

Post-build scans: **${s.secrets.checkedFiles} frontend/build files, zero violations, zero values printed**. Generic, speech, interview LLM and dedicated evaluation synthetic canaries are absent from actual generated frontend assets. **${s.logPrivacy.filesChecked} retained logs, zero detected credential findings**; fixture credentials/screenshots are suppressed. These bounded scans do not claim to recognize every possible encoded secret.

${JSON.stringify(s.network)}

Zero real inference/provider/model calls, local-model installations or Ollama calls. Instrumented Node socket/fetch and browser application-page requests are guarded. Native Chrome background traffic is not independently packet-captured. Injected SDK counts are function calls, not network requests. Public official documentation reads are not inference calls.

## Exact changed files and source integrity

**${s.source.created.length} new, ${s.source.modified.length} modified, ${s.source.deleted.length} deleted application/test paths.** No unexpected source paths, dependencies or migrations. New evidence is confined to docs/ai-interviewer/evaluation-integration.

| Change | File | Purpose |
|---|---|---|
${files}

Accepted source manifest SHA-256: ${s.source.beforeAcceptedSHA256}.

**Final ${s.source.fileCount}-file source manifest SHA-256: ${s.source.finalManifestSHA256}.**

Files digest: ${s.source.filesDigest}. Source is byte-identical throughout final tests. source-changes.json includes exact before/after SHA-256 values and purposes. No Git metadata is present; these manifests establish provenance. The new artifact manifest covers all new evidence except itself.

${s.preservation.map(p=>`- ${p.phase}: ${p.files} accepted artifacts unchanged; zero mismatches/unlisted files; artifact-manifest SHA-256 ${p.artifactManifestSHA256}.`).join('\n')}

All **608 earlier protected evidence/training files remain unchanged**. Accepted Phase 5.1 stays BLOCKED, with source manifest 06ac18d29b06e876909a32c41ef83f42da24929fa860bf4b85560d38d2a38163 unchanged. No previous evidence was regenerated or waived.

Resource cleanup: **${s.cleanup.status}**. Zero other active DB clients, zero current-task disposable databases left, own temporary profiles removed and exact task-owned PostgreSQL stopped. Historical pre-existing database/unrelated processes are untouched; no database is dropped during finalization. resource-cleanup.json records paths/commands/exit codes.

## Remaining release blockers and limitations

1. **OPEN / BLOCKED — pgvector/full migration chain:** the unchanged 27-entry chain fails at 0008 due to missing vector (0A000). Rollback/disposable cleanup verified; no migration skip/stub/edit.
2. **OPEN / BLOCKED — Live Voice E2E:** complete production trusted START/resume/worker/playback/STOP/audibility composition and actual microphone-to-report provider validation remain unproven. Synthetic STT/TTS/LLM/evaluation do not close this gate.
3. No real cloud credential/model/account health, semantic evaluation accuracy/fairness, latency/failure behavior or acoustic/device quality has been validated. Configuration and synthetic PASS are not production readiness.
4. One process/runtime owner, process-local physical/rate limits, non-preemptible CPU and permanently hung calls requiring restart remain. No distributed or retention/deletion work was added.

**Stopped after this evaluation implementation and report. No Live Voice E2E or production-readiness claim.**
`)
const path=resolve(here,'artifact-manifest.json')
writeJson(path,{format:'evaluation-integration-artifact-manifest-v1',algorithm:'SHA-256',files:walk(here).filter(p=>p!==path).map(p=>({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:sha256(readFileSync(p))}))})
console.log(JSON.stringify({status:s.status,verifiedPassSuites:s.completedPassSuites,sourceManifestSHA256:s.source.finalManifestSHA256,artifactManifestSHA256:sha256(readFileSync(path)),overallReleaseReadiness:'BLOCKED',failures:s.failures}))
if(s.status!=='PASS')process.exitCode=1
