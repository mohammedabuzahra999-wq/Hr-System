process.env.CANDIDATE_AUDIO_BROWSER_TESTS = 'true'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const viteBin = resolve(dirname(createRequire(resolve(root, 'apps/hr-web/package.json')).resolve('vite/package.json')), 'bin/vite.js')
const phase4 = process.env.PHASE4_REPORT_TESTS === 'true'
const evidenceName = phase4 ? 'ai-interviewer-phase4' : 'ai-interviewer-phase3'
const evidence = resolve(root, `.local-dev/${evidenceName}`)
mkdirSync(resolve(evidence, 'screenshots'), { recursive: true })
const localDatabase = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!localDatabase || !['localhost','127.0.0.1','[::1]'].includes(new URL(localDatabase).hostname)) throw Error('A local AI_INTERVIEW_TEST_DATABASE_URL is required')
const children = [], replies = new Map(), checks = [], shots = []
let fixture, ready, browser, hr, candidate, preview, productionCandidate, failure
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function child(args, cwd, env = {}) {
  const processChild = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe','pipe','pipe'], windowsHide: true })
  children.push(processChild)
  return processChild
}
async function until(test, timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await test()) return; await delay(70) }
  throw Error('Timed out waiting for browser state')
}
async function check(name, test) {
  try { await test(); checks.push({ name, result: 'PASS' }); console.log(`PASS ${String(checks.length).padStart(2,'0')} ${name}`) }
  catch (error) { checks.push({ name, result: 'FAIL' }); throw Error(`${name}: ${error.message}`) }
}
function control(op, values = {}) {
  const id = `control-${Date.now()}-${Math.random()}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { replies.delete(id); reject(Error('Fixture control timeout')) }, 12000)
    replies.set(id, value => { clearTimeout(timer); resolve(value) })
    fixture.stdin.write(`${JSON.stringify({ id, op, ...values })}\n`)
  })
}
class Cdp {
  sequence = 0; pending = new Map(); listeners = new Set()
  constructor(socket) {
    this.socket = socket
    socket.onmessage = message => {
      const value = JSON.parse(message.data)
      if (value.id) {
        const handler = this.pending.get(value.id); if (!handler) return
        this.pending.delete(value.id); clearTimeout(handler.timer)
        if (value.error) handler.reject(Error(`CDP ${handler.method} failed`)); else handler.resolve(value.result)
      } else for (const listener of this.listeners) listener(value)
    }
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`CDP ${method} timeout`)) }, 15000)
      this.pending.set(id, { resolve, reject, timer, method }); this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }
  async page() {
    const { browserContextId } = await this.send('Target.createBrowserContext')
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new Page(this, sessionId)
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable')
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
    this.listeners.add(value => {
      if (value.sessionId !== sessionId) return
      if (value.method === 'Page.javascriptDialogOpening') void page.send('Page.handleJavaScriptDialog', { accept: true })
      if (value.method === 'Fetch.requestPaused') void page.intercept(value.params)
      if (value.method === 'Network.responseReceived') {
        const url = new URL(value.params.response.url)
        if (url.protocol.startsWith('http') && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) page.externalCompleted++
      }
    })
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      globalThis.__microphoneCalls=0; globalThis.__rtcCalls=0; globalThis.__storageWrites=[];
      const nativeGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);globalThis.__audioDenied=false;globalThis.__audioTracks=[];
      navigator.mediaDevices.getUserMedia=async(...args)=>{__microphoneCalls++;if(__audioDenied)throw new DOMException('Synthetic denial','NotAllowedError');const stream=await nativeGetUserMedia(...args);__audioTracks.push(...stream.getTracks());return stream};
      const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).includes('/audio/upload')&&globalThis.__dropAudioResponse){globalThis.__dropAudioResponse=false;throw new TypeError('Synthetic response loss after commit')}return response};
      globalThis.RTCPeerConnection=function(){__rtcCalls++;throw Error('WebRTC forbidden')};
      const originalSet=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){__storageWrites.push({k,v});return originalSet.call(this,k,v)};
      sessionStorage.setItem('hr-app:lang','en');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>{globalThis.__copiedInvitation=v}}});
    ` })
    return page
  }
}
class Page {
  paths = []; externalBlocked = 0; externalCompleted = 0; commands = []; tamperNext = false
  constructor(cdp, sessionId) { this.cdp = cdp; this.sessionId = sessionId }
  send(method, params) { return this.cdp.send(method, params, this.sessionId) }
  async intercept({ requestId, request }) {
    const url = new URL(request.url)
    if (url.protocol.startsWith('http') && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) { this.externalBlocked++; return this.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }) }
    this.paths.push(url.pathname)
    if(request.method==='POST'&&url.pathname.endsWith('/audio/upload')&&this.breakAudioRequest){this.breakAudioRequest=false;return this.send('Fetch.failRequest',{requestId,errorReason:'ConnectionClosed'})}
    if (request.method === 'POST' && url.pathname.endsWith('/commands')) {
      const body = JSON.parse(request.postData ?? '{}')
      this.commands.push({ type: body.command?.type, commandId: body.command?.commandId })
      if (this.tamperNext) {
        this.tamperNext = false; body.expectedVersion = Math.max(0, body.expectedVersion - 1)
        return this.send('Fetch.continueRequest', { requestId, postData: Buffer.from(JSON.stringify(body)).toString('base64') })
      }
    }
    return this.send('Fetch.continueRequest', { requestId })
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw Error('Browser expression failed')
    return result.result.value
  }
  async goto(url) { await this.send('Page.navigate', { url }); await until(() => this.evaluate('document.readyState === "complete"').catch(() => false)) }
  async wait(expression, timeout) { await until(() => this.evaluate(`Boolean(${expression})`).catch(() => false), timeout) }
  async click(selector) {
    await this.wait(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`)
    const rect = await this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e||e.disabled)return null;e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`)
    if (!rect?.w || !rect?.h) throw Error(`Button is unavailable: ${selector}`)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  }
  async button(text) {
    await this.wait(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`)
    const id = await this.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return null;e.setAttribute('data-cdp-button','target');return true})()`)
    if (!id) throw Error(`Button not found: ${text}`)
    await this.click('[data-cdp-button="target"]'); await this.evaluate(`document.querySelector('[data-cdp-button="target"]')?.removeAttribute('data-cdp-button')`)
  }
  async fill(selector, value) {
    await this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('field');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)
  }
  async api(path, body) {
    return this.evaluate(`fetch(${JSON.stringify(path)},{credentials:'include',cache:'no-store',${body === undefined ? '' : `method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify(body))},`}}).then(async r=>({status:r.status,body:await r.json().catch(()=>null)}))`)
  }
  async state() { return (await this.api('/api/ai-interview/state')).body }
  async screenshot(name, keepScroll = false) { return; // No credential/audio-bearing screenshot is captured in this dedicated suite.

    if (!keepScroll) await this.evaluate('window.scrollTo(0,0)')
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const path = resolve(evidence, `screenshots/${name}.png`); writeFileSync(path, Buffer.from(data,'base64')); shots.push(`.local-dev/${evidenceName}/screenshots/${name}.png`)
  }
  async tools() { await this.evaluate(`(()=>{const d=document.querySelector('[data-testid="mock-controls"] details');if(d)d.open=true})()`) }
  async delivery() {
    await this.wait(`document.querySelector('[data-testid="mock-controls"]')`)
    await this.tools(); await this.button('Advance playback')
    await this.tools(); await this.button('Advance playback')
    await this.wait(`document.querySelector('[data-testid="interview-status"]')?.dataset.phase==='LISTENING'`)
  }
  async answer(text) {
    await this.wait(`!document.querySelector('[data-testid="mock-answer"]')?.disabled`)
    await this.fill('[data-testid="mock-answer"]', text)
    await this.click('[data-testid="submit-answer"]')
  }
}
async function login(page, email) {
  await page.goto('http://localhost:5179/login')
  await page.wait(`document.querySelector('input[type="email"]')`)
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', ready.password)
  await page.click('button[type="submit"]')
  await page.wait(`!['/login','/'].includes(location.pathname)`)
}
try {
  let buffer = ''
  fixture = child(['--conditions=development','--import','tsx','src/aiInterviewer/ui.fixture.ts'], resolve(root,'services/hr-api'), { AI_INTERVIEW_TEST_DATABASE_URL: localDatabase })
  createInterface({ input: fixture.stdout }).on('line', line => {
    if (line.startsWith('PHASE3_READY ')) ready = JSON.parse(line.slice(13))
    if (line.startsWith('PHASE3_REPLY ')) { const response = JSON.parse(line.slice(13)); replies.get(response.id)?.(response); replies.delete(response.id) }
  })
  fixture.stderr.on('data', data => { buffer = (buffer + data).slice(-5000) })
  await until(() => !!ready || fixture.exitCode !== null, 30000)
  if (!ready) throw Error(`Fixture did not start: ${buffer.slice(-1000)}`)
  await until(async () => fixture.exitCode === null && (await fetch('http://127.0.0.1:8793/health').catch(() => null))?.ok, 5000)
  console.log('Browser setup: local fixture ready')
  child([viteBin,'--host','localhost','--port','5179','--strictPort'], resolve(root,'apps/hr-web'), { VITE_API_TARGET:'http://127.0.0.1:8793', VITE_AI_INTERVIEW_DEV_MOCK:'true' })
  await until(async () => (await fetch('http://localhost:5179').catch(() => null))?.ok, 30000)
  console.log('Browser setup: development frontend ready')
  preview = child([viteBin,'preview','--host','localhost','--port','5180','--strictPort'], resolve(root,'apps/hr-web'), { VITE_API_TARGET:'http://127.0.0.1:8793', VITE_AI_INTERVIEW_DEV_MOCK:'true' })
  await until(async () => (await fetch('http://localhost:5180').catch(() => null))?.ok, 15000)
  console.log('Browser setup: production preview ready')
  const chromePath = process.env.PHASE3_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const chrome = spawn(chromePath, ['--headless=new','--remote-debugging-port=9333',`--user-data-dir=${resolve(evidence,`chrome-${Date.now()}`)}`,
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check',
    '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=Translate,MediaRouter','--no-proxy-server','about:blank'], { windowsHide:true, stdio:'ignore' })
  children.push(chrome)
  let metadata
  await until(async () => { metadata = await fetch('http://localhost:9333/json/version').then(r=>r.json()).catch(()=>null); return !!metadata?.webSocketDebuggerUrl }, 15000)
  console.log('Browser setup: isolated Chrome ready')
  const socket = new WebSocket(metadata.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  browser = new Cdp(socket)
  hr = await browser.page()
  await check('HR login and recruitment AI controls use the existing employee workflow', async () => {
    await login(hr, ready.hrEmail); await hr.goto('http://localhost:5179/hr/recruitment')
    await hr.wait(`document.querySelector('[data-testid="manage-ai-interview"]')`)
    await hr.click('[data-testid="manage-ai-interview"]'); await hr.wait(`document.querySelector('[data-testid="interview-plan-form"]')`)
  })
  await check('HR configures explicit plan/timers and adds a third question', async () => {
    await hr.fill('[aria-label="answerTimeLimitSec 1"]',120)
    await hr.button('Add question'); await hr.fill('[aria-label="Question prompt 3"]','Explain a production trade-off.')
    if (phase4) await hr.fill('[aria-label="Requirement 3"]',await hr.evaluate(`document.querySelector('[aria-label="Requirement 3"]').options[0].value`))
    await hr.fill('[aria-label="answerTimeLimitSec 3"]',120)
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="plan-language"]').value`),'mixed')
    await hr.screenshot('hr-plan')
  })
  let interviewId
  await check('Create goes through the real Phase 2 transaction', async () => {
    await hr.click('[data-testid="create-ai-interview"]'); await hr.wait(`document.querySelector('[data-testid="freeze-interview"]')`)
    const response = await hr.api(`/api/recruitment/applications/${ready.applicationId}/ai-interviews`)
    assert.equal(response.status,200); interviewId=response.body.interviews[0].interviewId
    assert.equal(response.body.interviews[0].status,'CREATED')
  })
  await check('HR freezes READY and operational UI displays no token hash', async () => {
    await hr.click('[data-testid="freeze-interview"]'); await hr.wait(`document.querySelector('[data-testid="hr-interview-status"]')?.dataset.status==='READY'`)
    assert.equal(await hr.evaluate(`document.body.innerText.includes('inviteTokenHash')`),false)
  })
  async function invite() {
    await hr.click('[data-testid="generate-invitation"]'); await hr.wait(`document.querySelector('[data-testid="copy-invitation"]')`)
    await hr.click('[data-testid="copy-invitation"]')
    const link=await hr.evaluate('globalThis.__copiedInvitation'); await hr.evaluate('delete globalThis.__copiedInvitation')
    assert.equal(new URL(link).pathname,'/interview/join'); return link
  }
  let revokedLink
  await check('Invitation is copied once and cleared from the HR panel', async()=>{
    revokedLink=await invite(); assert.equal(await hr.evaluate(`!!document.querySelector('[data-testid="copy-invitation"]')`),false)
  })
  await check('Revocation is visible and the revoked browser invitation fails safely', async()=>{
    await hr.button('Revoke invitation'); await hr.wait(`document.querySelector('[data-testid="hr-ai-panel"]').innerText.includes('Revoked')`)
    const p=await browser.page();await p.goto(revokedLink);await p.wait(`document.querySelector('[role="alert"]')`)
    await p.screenshot('revoked-invitation')
    const message = await p.evaluate('document.body.innerText')
    assert(message.includes('invalid, expired or revoked'), message.slice(0,700));assert.equal(await p.evaluate('location.search'),'')
  })
  await check('Invalid invitation shows a safe standalone error',async()=>{
    const p=await browser.page();await p.goto(`http://localhost:5179/interview/join?token=${'x'.repeat(43)}`);await p.wait(`document.querySelector('[role="alert"]')`)
    assert.equal(await p.evaluate('location.search'),'');assert.equal(await p.evaluate(`!!document.querySelector('a[href="/hr/recruitment"]')`),false)
  })
  await check('Expired invitation is rejected in the browser',async()=>{
    const link=await invite();await control('advance',{ms:86400001});const p=await browser.page();await p.goto(link);await p.wait(`document.querySelector('[role="alert"]')`);assert.equal(await p.evaluate('location.search'),'')
  })
  let mainLink
  await check('Valid candidate exchange removes token from URL and browser storage',async()=>{
    mainLink=await invite();candidate=await browser.page();await candidate.goto(mainLink);await candidate.wait(`document.querySelector('[data-testid="accept-consent"]')`)
    const token=new URL(mainLink).searchParams.get('token')
    assert.equal(await candidate.evaluate('location.pathname'),'/interview/session');assert.equal(await candidate.evaluate('location.search'),'')
    assert.equal(await candidate.evaluate(`JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),globalThis.__storageWrites]).includes(${JSON.stringify(token)})`),false)
    assert.equal(candidate.paths.some(path=>path.startsWith('/api/auth')||path.startsWith('/api/stream')||path.startsWith('/api/copilot')),false)
    await candidate.screenshot('candidate-consent')
  })
  await check('Backend refuses start before persisted consent',async()=>{
    const s=await candidate.state();const r=await candidate.api('/api/ai-interview/commands',{interviewId:s.interviewId,expectedVersion:s.version,command:{type:'START_INTERVIEW',commandId:crypto.randomUUID()}})
    assert.equal(r.status,409);assert.equal(r.body.error,'interviewConsentRequired')
  })
  await check('Consent persists across a browser refresh',async()=>{
    await candidate.click('[data-testid="accept-consent"]');await candidate.wait(`document.querySelector('[data-testid="confirm-language"]')`)
    await candidate.send('Page.reload');await candidate.wait(`document.querySelector('[data-testid="confirm-language"]')`)
    assert.equal((await candidate.state()).consent.accepted,true);assert.equal(await candidate.evaluate(`!!document.querySelector('[data-testid="accept-consent"]')`),false)
  })
  await check('Arabic RTL, English LTR and Mixed confirmation remain independent',async()=>{
    await candidate.click('[aria-label="Switch to Arabic"]');await candidate.wait(`document.documentElement.dir==='rtl'`);await candidate.screenshot('candidate-arabic')
    await candidate.click('[aria-label="Switch to English"]');await candidate.wait(`document.documentElement.dir==='ltr'`)
    assert.equal((await candidate.state()).language,'mixed')
  })
  await check('Mock readiness requests no real microphone',async()=>{
    await candidate.click('[data-testid="confirm-language"]');await candidate.wait(`document.querySelector('[data-testid="check-readiness"]')`)
    await candidate.click('[data-testid="check-readiness"]');await candidate.screenshot('candidate-readiness');assert.equal(await candidate.evaluate('__microphoneCalls'),0)
  })
  await check('Interview starts with AI_SPEAKING and the current question',async()=>{
    await candidate.click('[data-testid="start-interview"]');await candidate.wait(`document.querySelector('[data-testid="current-question"]')?.textContent.includes('experience with RAG') && document.querySelector('[data-testid="interview-status"]')?.dataset.phase==='AI_SPEAKING'`,25000)
    await candidate.screenshot('room-speaking')
  })
  await (await import('./checkCandidateAudioBrowserCases.mjs')).runCandidateAudioBrowserCases({candidate,hr,interviewId,ready,check,control})
} catch(error) {
  failure=error;console.error('BROWSER CHECK FAILED:',error.message)
  if(candidate)await candidate.screenshot('failure').catch(()=>{})
  if(hr){await hr.screenshot('failure-hr').catch(()=>{});console.error('Browser HR diagnostic:',await hr.evaluate(`({path:location.pathname,text:document.body.innerText.slice(0,400)})`).catch(()=>null))}
}
finally {
  if (failure && !checks.some(c => c.result === 'FAIL')) checks.push({ name: 'Browser fixture setup', result: 'FAIL' })
  const report={status:failure?'FAIL':'PASS',passed:checks.filter(c=>c.result==='PASS').length,failed:checks.filter(c=>c.result==='FAIL').length,checks,screenshots:shots,
    candidateExternalRequestsCompleted:candidate?.externalCompleted??null,candidateExternalRequestsBlocked:candidate?.externalBlocked??null,
    hrThirdPartyFontsBlocked:hr?.externalBlocked??null,applicationWebSocketServerAdded:false,realMicrophone:false,nativeMediaRecorder:true,syntheticMicrophone:true,realAiCalls:0}
  writeFileSync(resolve(evidence,'browser-results.json'),JSON.stringify(report,null,2))
  if(browser){await browser.send('Browser.close').catch(()=>{});browser.socket.close()}
  if(fixture?.exitCode===null){await control('stop').catch(()=>{});await delay(300)}
  for(const processChild of children.reverse())if(processChild.exitCode===null)processChild.kill()
  console.log(`\n${report.passed}/${checks.length} candidate audio browser checks passed; evidence=.local-dev/${evidenceName}/browser-results.json`)
}
if(failure)process.exitCode=1
