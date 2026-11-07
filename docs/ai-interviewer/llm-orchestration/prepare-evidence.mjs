import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './manifest.mjs'
const old=resolve(root,'docs/ai-interviewer/tts-playback'),here=new URL('.',import.meta.url)
let state=readFileSync(resolve(old,'state.mjs'),'utf8')
const purposes={
 'packages/contracts/src/aiInterviewLlm.ts':'Strict question-text proposal and allowed decision contracts.',
 'packages/contracts/src/aiInterview.ts':'Engine-only draft-text revision command/event, excluded from candidate authority.',
 'packages/contracts/src/index.ts':'Export pure model contracts.',
 'services/hr-api/src/aiInterviewer/llmConfiguration.ts':'Default-off, dedicated server configuration and immutable nonsecret provider profile.',
 'services/hr-api/src/aiInterviewer/llmContracts.ts':'Bounded provider context, durable job schema and quarantined text validation.',
 'services/hr-api/src/aiInterviewer/llmProviders.ts':'Deterministic synthetic adapter and pinned OpenAI structured SDK adapter with safe errors and no tools.',
 'services/hr-api/src/aiInterviewer/llmRuntime.ts':'One server-owned provider registration without I/O.',
 'services/hr-api/src/aiInterviewer/llmOrchestrator.ts':'Independent bounded asynchronous discovery, retries, cancellation, admission and late-result fences.',
 'services/hr-api/src/aiInterviewer/llmProviders.check.ts':'24 injected SDK/configuration/size/schema/prompt-boundary checks.',
 'services/hr-api/src/aiInterviewer/llmOrchestration.check.ts':'26 real PostgreSQL/HTTP/engine/approval/recovery/security/timer checks.',
 'services/hr-api/src/aiInterviewer/service.ts':'Existing SQL receipts/events for durable mode and attempts, HR approval, exact policy validation and atomic decision commit.',
 'services/hr-api/src/aiInterviewer/engine.ts':'Only CREATED question text can change; order/criteria/IDs/timing/caps remain engine-owned.',
 'services/hr-api/src/aiInterviewer/runtime.ts':'Model-enabled processing leaves the timer loop; legacy mock processing remains intact.',
 'services/hr-api/src/aiInterviewer/routes.ts':'Authorized generation/review/control APIs and minimal candidate status.',
 'services/hr-api/src/aiInterviewer/ui.fixture.ts':'Explicit test-only synthetic model scenarios and counts.',
 'services/hr-api/src/env.ts':'Validate dedicated LLM configuration without values printed.',
 'services/hr-api/src/index.ts':'Register and start/drain independent model dispatcher.',
 'services/hr-api/package.json':'Three new verification commands, no dependency change.',
 'services/hr-api/scripts/checkLlmOrchestrationBrowser.mjs':'Derived unchanged authenticated setup plus synthetic LLM browser acceptance.',
 'services/hr-api/scripts/checkLlmOrchestrationBrowserCases.mjs':'24 total setup/model/answer/recovery/pause/RBAC browser assertions.',
 'apps/hr-web/src/features/aiInterviewer/client.ts':'Minimal candidate orchestration status client, no model config or credentials.',
 'apps/hr-web/src/features/aiInterviewer/session.ts':'Model status/retry/recovery cache while authoritative answers stay committed.',
 'apps/hr-web/src/features/aiInterviewer/MockControls.tsx':'Disable direct mock PROCESS only for model-enabled rooms.',
 'apps/hr-web/src/pages/AiInterviewPage.tsx':'Truthful committed-answer/model-processing/recovery messages.',
}
state=state.replace("export const acceptedSource = 'fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17'","export const acceptedSource = '55f7d754e37e38b185095b6b5410c0d59bf82fc576567cb3c48203aabfeacf14'")
state=state.replace(/export const expectedChanges = \{[\s\S]*?\n\}/,'export const expectedChanges = '+JSON.stringify(purposes,null,2))
state=state.replace("'runs/final-20261105/source-final.json',acceptedSource],","'runs/final-20261105/source-final.json','fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17'],\n  ['tts-playback','97399ec51de20db6c74374a9da6678dfeff94a76e96ea348bbaa172133b32a95','runs/final-verified-20261105/source-final.json',acceptedSource],")
state=state.replace("'docs/ai-interviewer/candidate-audio-transport/runs/final-20261105/source-final.json'","'docs/ai-interviewer/tts-playback/runs/final-verified-20261105/source-final.json'")
state=state.replace('diff.created.length===9','diff.created.length===10').replace('diff.modified.length===12','diff.modified.length===14').replace('inventory.length===43','inventory.length===46')
state=state.replace('const expectedCounts={',"const expectedCounts={'llm-contract':24,'llm-db':26,'llm-browser':24,").replace("['tts-browser','audio-browser'","['llm-browser','tts-browser','audio-browser'")
const start=state.indexOf("  const historicalSource="),end=state.indexOf('  const networkRows=',start)
if(start<0||end<0)throw Error('Prior verifier layout changed')
state=state.slice(0,start)+state.slice(end)
state=state.replace('rootHistory,','').replaceAll('ttsplayback-temp','llmorchestration-temp')
state=state.replace("  const transport=get('tts-transport-matrix.json')", "  const llmDb=get('llm-db-matrix.json'),llmContract=get('llm-contract-matrix.json');require(llmDb.status==='PASS'&&llmDb.checks===26&&llmDb.externalAttempts===0&&llmContract.status==='PASS'&&llmContract.checks===24&&llmContract.syntheticSdkRequests===14&&llmContract.realProviderCalls===0&&llmContract.externalAttempts===0,'LLM_NEW_VERIFICATION')\n  const transport=get('tts-transport-matrix.json')")
state=state.replace('secrets.dedicatedSpeechCanaryDetected&&oldScan','secrets.dedicatedSpeechCanaryDetected&&secrets.dedicatedLlmCanaryDetected&&oldScan')
state=state.replace('speech-layer-synthetic-bundle-canary-not-a-key/.test(text)','speech-layer-synthetic-bundle-canary-not-a-key|interview-llm-synthetic-bundle-canary-not-a-key/.test(text)')
state=state.replace("scope:'Registered TTS authenticated downlink/native playback/STOP, synthetic verification, local single-process'","scope:'Asynchronous interview LLM proposals/approved decisions; synthetic verification; supported local single-process'")
state=state.replace('transport,closing,contract,synthetic,','llmDb,llmContract,transport,closing,contract,synthetic,')
writeFileSync(new URL('state.mjs',here),state)
let verify=readFileSync(resolve(old,'verify.mjs'),'utf8')
verify=verify.replace('newTransportChecks:state.transport.checks','llmDatabaseChecks:state.llmDb.checks,llmContractChecks:state.llmContract.checks,newModelBrowserChecks:state.regression.find(r=>r.id===\'llm-browser\').count,existingTtsTransportChecks:state.transport.checks').replace('newUiChecks:', 'existingPlaybackUiChecks:').replace('newNativeBrowserChecks:','existingNativePlaybackChecks:')
writeFileSync(new URL('verify.mjs',here),verify)
