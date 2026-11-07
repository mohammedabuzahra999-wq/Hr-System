import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './manifest.mjs'
const source=readFileSync(resolve(root,'services/hr-api/scripts/checkAiInterviewBrowser.mjs'),'utf8'),split=source.indexOf("  await check('Interview starts with AI_SPEAKING and the current question'")
assert(split>0)
let prefix="process.env.TTS_PLAYBACK_BROWSER_TESTS='true'\n"+source.slice(0,split),suffix=source.slice(source.indexOf('} catch(error) {',split))
prefix=prefix.replace('globalThis.__microphoneCalls=0;',`globalThis.__ttsRequests=[];const originalTtsFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(...args)=>{const response=await originalTtsFetch(...args);if(String(args[0]).includes('/playback/')){let value;try{value=await response.clone().json()}catch{};__ttsRequests.push({path:String(args[0]).split('?')[0],status:response.status,error:value?.error,outcome:value?.status})}return response};
      globalThis.__ttsPlays=0;globalThis.__ttsPauses=0;globalThis.__blockTtsPlay=false;
      const nativePlay=HTMLMediaElement.prototype.play,nativePause=HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.play=function(){__ttsPlays++;if(__blockTtsPlay)return Promise.reject(new DOMException('Synthetic autoplay denial','NotAllowedError'));return nativePlay.call(this)};
      HTMLMediaElement.prototype.pause=function(){__ttsPauses++;return nativePause.call(this)};
      globalThis.__microphoneCalls=0;`)
prefix=prefix.replace('    this.paths.push(url.pathname)',`    this.paths.push(url.pathname)
    if(request.method==='POST'&&url.pathname.endsWith('/playback/pulse')&&this.breakPulse){this.breakPulse=false;return this.send('Fetch.failRequest',{requestId,errorReason:'ConnectionClosed'})}`)
prefix=prefix.replace('  async screenshot(name, keepScroll = false) {','  async screenshot(name, keepScroll = false) { return; // Dedicated suite retains no screenshots.\n')
suffix=suffix.replace('realMicrophone:false,realAiCalls:0','realMicrophone:false,nativeHtmlAudio:true,syntheticTts:true,realAiCalls:0').replace('Phase ${phase4?4:3} browser checks passed','TTS playback browser checks passed')
writeFileSync(resolve(root,'services/hr-api/scripts/checkTtsPlaybackBrowser.mjs'),prefix+"  await (await import('./checkTtsPlaybackBrowserCases.mjs')).runTtsPlaybackCases({candidate,hr,browser,interviewId,ready,check,control})\n"+suffix)
