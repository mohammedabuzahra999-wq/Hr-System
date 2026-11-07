// Baseline-only preload. No production module or existing test is edited.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), tls = require('node:tls')
const { syncBuiltinESMExports } = require('node:module')
const cp = require('node:child_process')
const originalWrite = fs.writeFileSync, originalMkdir = fs.mkdirSync
const root = path.resolve(__dirname, '../../..')
const output = process.env.TTS_PLAYBACK_OUTPUT
if (!output || !path.resolve(output).startsWith(path.join(__dirname, 'runs') + path.sep)) throw Error('Baseline output must be under its isolated runs directory')
const counts = { socketConnectionsAllowed: 0, fetchCallsAllowed: 0, blockedExternalAttempts: 0, suppressedFixtureWrites: 0, suppressedScreenshots: 0 }
const ports = new Set((process.env.TTS_PLAYBACK_PORTS || '').split(',').filter(Boolean).map(Number))
const loopback = host => ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).toLowerCase())
function deny() { counts.blockedExternalAttempts++; throw Error('TTS_PLAYBACK_NETWORK_DENIED') }
function socketAllowed(args) {
  const a = Array.isArray(args[0]) ? args[0] : args
  const o = a[0]
  // Node/esbuild may use local named-pipe IPC. Never allow an arbitrary path/host.
  if (typeof o === 'string' && /^\\\\[.?]\\pipe\\/.test(o)) return true
  if (o && typeof o === 'object' && o.path && /^\\\\[.?]\\pipe\\/.test(o.path)) return true
  const host = o && typeof o === 'object' ? (o.host || 'localhost') : (typeof a[1] === 'string' ? a[1] : 'localhost')
  const port = o && typeof o === 'object' ? o.port : o
  return loopback(host) && ports.has(Number(port))
}
const socketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) { if (!socketAllowed(args)) return deny(); counts.socketConnectionsAllowed++; return Reflect.apply(socketConnect, this, args) }
const tlsConnect = tls.connect
tls.connect = function (...args) { if (!socketAllowed(args)) return deny(); return Reflect.apply(tlsConnect, this, args) }
const realFetch = globalThis.fetch
globalThis.fetch = function (input, ...args) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!loopback(url.hostname) || !ports.has(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) return deny()
  counts.fetchCallsAllowed++; return realFetch(input, ...args)
}
const roots = ['ai-interviewer-phase3', 'ai-interviewer-phase4'].map(p => path.join(root, '.local-dev', p))
function redirect(file) {
  if (typeof file !== 'string') return file
  const abs = path.resolve(file)
  for (const old of roots) if (abs === old || abs.startsWith(old + path.sep)) return path.join(output, 'browser', process.env.TTS_PLAYBACK_SUITE, path.basename(old), path.relative(old, abs))
  return file
}
fs.mkdirSync = function (file, ...args) { return originalMkdir(redirect(file), ...args) }
fs.writeFileSync = function (file, data, ...args) {
  const next = redirect(file)
  if (next !== file && path.basename(next) === 'fixture.json') { counts.suppressedFixtureWrites++; return }
  // Screenshots are not needed for baseline assertions and can expose temporary credentials on failure.
  if (next !== file && path.extname(next) === '.png') { counts.suppressedScreenshots++; return }
  if (next !== file && path.basename(next) === 'browser-results.json') {
    const report = JSON.parse(data); report.screenshots = []; report.screenshotPolicy = 'Not persisted: baseline contains no credential-bearing images'
    data = JSON.stringify(report, null, 2) + '\n'
  }
  return originalWrite(next, data, ...args)
}
const spawn = cp.spawn
cp.spawn = function (command, args, options) {
  if (/chrome(?:\.exe)?$/i.test(command)) args = args.map(arg => arg.startsWith('--user-data-dir=')
    ? '--user-data-dir=' + path.join(process.env.TTS_PLAYBACK_TEMP, 'chrome-' + process.pid) : arg)
    .concat('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1')
  return spawn(command, args, options)
}
syncBuiltinESMExports()
// Observe the ORIGINAL Phase 3 entry without changing any assertion or wait.
// Retain only safe metadata, never postData/raw response bodies or credentials.
if(['browser3','browser4','answer-browser','tts-browser'].includes(process.env.TTS_PLAYBACK_SUITE) && /check(?:AiInterview(?:Answer|Report)?|TtsPlayback)Browser\.mjs$/.test(process.argv[1]||'') && globalThis.WebSocket){
  const Native=globalThis.WebSocket,rows=[],requests=new Map(),pending=new Map();let serial=2000000
  globalThis.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{
    try{const value=JSON.parse(String(event.data)),p=value.params,key=p?.requestId?`${value.sessionId}:${p.requestId}`:null
      if(value.method==='Network.requestWillBeSent'&&p.request.url.includes('/api/')){const u=new URL(p.request.url);let b;try{b=JSON.parse(p.request.postData||'{}')}catch{};const r={at:Date.now(),method:p.request.method,path:u.pathname,command:b?.command?.type,expectedVersion:b?.expectedVersion};requests.set(key,r);if(rows.length<4000)rows.push(r)}
      if(value.method==='Network.responseReceived'&&requests.has(key))requests.get(key).httpStatus=p.response.status
      if(value.method==='Network.loadingFinished'&&requests.has(key)){const id=serial++;pending.set(id,requests.get(key));Native.prototype.send.call(this,JSON.stringify({id,sessionId:value.sessionId,method:'Network.getResponseBody',params:{requestId:p.requestId}}))}
      if(pending.has(value.id)){const r=pending.get(value.id);pending.delete(value.id);let b;try{b=JSON.parse(value.result.body)}catch{return};const s=b.state||b;r.error=b.error;r.version=s.version;r.speaking=s.speaking;r.phase=s.phase;if(Array.isArray(b.events))r.eventTypes=b.events.map(e=>e.type)}
    }catch{}
  })}}
  process.on('exit',()=>originalWrite(path.join(output,`${process.env.TTS_PLAYBACK_SUITE}-cdp-metadata.json`),JSON.stringify({originalAssertionsUnchanged:true,observationMayAffectTiming:true,trace:rows},null,2)+'\n'))
}
process.on('exit', () => {
  originalMkdir(path.join(output, 'network'), { recursive: true })
  originalWrite(path.join(output, 'network', `${process.env.TTS_PLAYBACK_SUITE}-${process.pid}.json`), JSON.stringify({ suite: process.env.TTS_PLAYBACK_SUITE, ...counts }, null, 2) + '\n')
})
