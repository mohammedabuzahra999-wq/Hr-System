import { readFileSync,writeFileSync } from 'node:fs'
import { root } from './manifest.mjs'
import { resolve } from 'node:path'
const old=resolve(root,'docs/ai-interviewer/candidate-audio-transport'),here=new URL('.',import.meta.url)
// One-time scaffold, retained as execution history. Final helpers are versioned
// artifacts; do not overwrite reviewed helpers during reproduction/finalization.
if(readFileSync(new URL('state.mjs',here),'utf8').includes('rootHistory'))throw Error('Scaffold already finalized; use run.mjs/evidence.mjs/verify.mjs')
let state=readFileSync(resolve(old,'state.mjs'),'utf8')
state=state.replace("export const acceptedSource = '9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627'","export const acceptedSource = 'fe642f19f4d68434c7add34f5628639d337e3fd145b69eab764dfee8a69e7c17'")
const purposes={
 'packages/contracts/src/aiInterviewPlayback.ts':'Strict public playback scope/action/result and canonical WAV validation.',
 'packages/contracts/src/index.ts':'Export playback contracts.',
 'services/hr-api/src/aiInterviewer/playbackContracts.ts':'Server-only generation/lease/status metadata schema.',
 'services/hr-api/src/aiInterviewer/playbackTransport.ts':'Registered TTS orchestration, bounded WAV cache, admission, timeout, STOP and shutdown.',
 'services/hr-api/src/aiInterviewer/playbackTransport.check.ts':'30 synthetic PostgreSQL/HTTP/security/provenance/configuration/clock checks.',
 'services/hr-api/src/aiInterviewer/service.ts':'Durable reservation/lease/STOP/completion transactions using existing receipts and events.',
 'services/hr-api/src/aiInterviewer/routes.ts':'Authenticated Origin-protected rate-limited playback endpoints; private binary audio.',
 'services/hr-api/src/aiInterviewer/ui.fixture.ts':'Opt-in test-only synthetic TTS scenarios and sanitized IPC counts.',
 'services/hr-api/src/env.ts':'Default-off TTS delivery flag with required server TTS configuration.',
 'services/hr-api/src/index.ts':'Register/close transport using existing server speech registry.',
 'services/hr-api/package.json':'Three new verification commands; no dependency change.',
 'services/hr-api/scripts/checkTtsPlaybackBrowser.mjs':'Derived unchanged HR/candidate setup plus native HTMLAudio cases.',
 'services/hr-api/scripts/checkTtsPlaybackBrowserCases.mjs':'Synthetic TTS/native playback/STOP/refresh/disconnect/privacy assertions.',
 'services/hr-api/scripts/checkTtsPlaybackUi.mjs':'19 recovery/autoplay/timeout/cancellation/stale-result browser-controller checks.',
 'apps/hr-web/src/features/aiInterviewer/playback.ts':'Explicit native playback controller, timed leases, epochs and recovery.',
 'apps/hr-web/src/features/aiInterviewer/PlaybackPanel.tsx':'Accessible READY/PLAYING/STOPPED/COMPLETED/ERROR controls and messages.',
 'apps/hr-web/src/features/aiInterviewer/client.ts':'Bounded private WAV and strict playback JSON clients.',
 'apps/hr-web/src/features/aiInterviewer/session.ts':'Own authenticated playback controller and safe expiry.',
 'apps/hr-web/src/features/aiInterviewer/useInterviewSession.ts':'Release playback on lifecycle cleanup.',
 'apps/hr-web/src/pages/AiInterviewPage.tsx':'Mount opt-in panel; disable mock autoplay only for TTS-enabled rooms.',
}
state=state.replace(/export const expectedChanges = \{[\s\S]*?\n\}/,'export const expectedChanges = '+JSON.stringify(purposes,null,2))
state=state.replace("'runs/final-verified-20261105/source-final.json', acceptedSource],","'runs/final-verified-20261105/source-final.json', '9d6f69cf6583ccdbc5caa6555199a0e2bd09502d38d948d7f39b85ecab743627'],\n  ['candidate-audio-transport','877d54b54fc970bedc05a76b0712c13f3b5ecfa7fb18b96f1e83a95522f70efd','runs/final-20261105/source-final.json',acceptedSource],")
state=state.replace("'docs/ai-interviewer/stt-tts-provider-layer/runs/final-verified-20261105/source-final.json'","'docs/ai-interviewer/candidate-audio-transport/runs/final-20261105/source-final.json'")
state=state.replace('diff.created.length===10','diff.created.length===9').replace("const expectedCounts={","const expectedCounts={'tts-ui':19,'tts-transport':30,'tts-browser':28,").replace('inventory.length===39','inventory.length===42')
state=state.replace("['audio-browser','browser3'","['tts-browser','audio-browser','browser3'")
state=state.replace("transport=get('audio-transport-matrix.json')","transport=get('tts-transport-matrix.json')").replace("transport.checks===37","transport.checks===30").replace('secrets.checkedFiles>=146','secrets.checkedFiles>=148').replaceAll('candidateaudio-temp','ttsplayback-temp')
state=state.replace("scope:'Authenticated candidate microphone/WAV uplink to registered STT, synthetic verification, local single-process'","scope:'Registered TTS authenticated downlink/native playback/STOP, synthetic verification, local single-process'")
writeFileSync(new URL('state.mjs',here),state)
let verify=readFileSync(resolve(old,'verify.mjs'),'utf8').replace("r.id==='audio-ui'","r.id==='tts-ui'").replace("r.id==='audio-browser'","r.id==='tts-browser'")
writeFileSync(new URL('verify.mjs',here),verify)
let cleanup=readFileSync(resolve(old,'cleanup.mjs'),'utf8').replaceAll('candidate-audio-transport','tts-playback').replaceAll('candidateaudio-temp','ttsplayback-temp').replaceAll('ai_interview_candidateaudio_','ai_interview_ttsplayback_').replaceAll('ai_interview_audio_','ai_interview_tts_')
writeFileSync(new URL('cleanup.mjs',here),cleanup)
writeFileSync(new URL('prepare-diagnostics.mjs',here),readFileSync(resolve(old,'prepare-diagnostics.mjs'),'utf8'))
