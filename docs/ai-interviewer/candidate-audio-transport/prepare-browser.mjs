import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './manifest.mjs'

// Reuse the unmodified baseline's local Chrome harness/setup, then run dedicated audio cases.
const source = readFileSync(resolve(root, 'services/hr-api/scripts/checkAiInterviewBrowser.mjs'), 'utf8')
const split = source.indexOf("  await check('Mock interruption is processed by the authoritative backend'")
assert(split > 0)
let prefix = source.slice(0, split), suffix = source.slice(source.indexOf('} catch(error) {', split))
prefix = "process.env.CANDIDATE_AUDIO_BROWSER_TESTS = 'true'\n" + prefix
const old = "Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{__microphoneCalls++;throw Error('Microphone forbidden')},enumerateDevices:async()=>[]}});"
assert(prefix.includes(old))
prefix = prefix.replace(old, `const nativeGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);globalThis.__audioDenied=false;globalThis.__audioTracks=[];
      navigator.mediaDevices.getUserMedia=async(...args)=>{__microphoneCalls++;if(__audioDenied)throw new DOMException('Synthetic denial','NotAllowedError');const stream=await nativeGetUserMedia(...args);__audioTracks.push(...stream.getTracks());return stream};
      const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).includes('/audio/upload')&&globalThis.__dropAudioResponse){globalThis.__dropAudioResponse=false;throw new TypeError('Synthetic response loss after commit')}return response};`)
prefix = prefix.replace("'--disable-background-networking','--disable-component-update'", "'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-background-networking','--disable-component-update'")
prefix = prefix.replace('    this.paths.push(url.pathname)', `    this.paths.push(url.pathname)
    if(request.method==='POST'&&url.pathname.endsWith('/audio/upload')&&this.breakAudioRequest){this.breakAudioRequest=false;return this.send('Fetch.failRequest',{requestId,errorReason:'ConnectionClosed'})}`)
prefix = prefix.replace("  async screenshot(name, keepScroll = false) {", "  async screenshot(name, keepScroll = false) { return; // No credential/audio-bearing screenshot is captured in this dedicated suite.\n")
suffix = suffix.replace('realMicrophone:false,realAiCalls:0', 'realMicrophone:false,nativeMediaRecorder:true,syntheticMicrophone:true,realAiCalls:0').replace('Phase ${phase4?4:3} browser checks passed', 'candidate audio browser checks passed')
const cases = "  await (await import('./checkCandidateAudioBrowserCases.mjs')).runCandidateAudioBrowserCases({candidate,hr,interviewId,ready,check,control})\n"
writeFileSync(resolve(root, 'services/hr-api/scripts/checkCandidateAudioBrowser.mjs'), prefix + cases + suffix)
