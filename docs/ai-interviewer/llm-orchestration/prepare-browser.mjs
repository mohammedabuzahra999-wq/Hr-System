import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './manifest.mjs'
const source=readFileSync(resolve(root,'services/hr-api/scripts/checkAiInterviewBrowser.mjs'),'utf8'),split=source.indexOf("  await check('Mock interruption is processed by the authoritative backend'")
assert(split>0)
let prefix="process.env.LLM_BROWSER_TESTS='true'\n"+source.slice(0,split),suffix=source.slice(source.indexOf('} catch(error) {',split))
prefix=prefix.replace('  async screenshot(name, keepScroll = false) {','  async screenshot(name, keepScroll = false) { return; // No credential-bearing screenshot retained.\n')
suffix=suffix.replace('realMicrophone:false,realAiCalls:0','realMicrophone:false,syntheticLlm:true,realAiCalls:0').replace('Phase ${phase4?4:3} browser checks passed','LLM orchestration browser checks passed')
writeFileSync(resolve(root,'services/hr-api/scripts/checkLlmOrchestrationBrowser.mjs'),prefix+"  await (await import('./checkLlmOrchestrationBrowserCases.mjs')).runModelBrowserCases({candidate,hr,interviewId,ready,check,control})\n"+suffix)
